import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import prisma from '../db'
import { requireAuth } from '../middleware/require-auth'
import { requireAdmin } from '../middleware/require-admin'
import { AppError } from '../errors/app-error'
import { SessionService } from '../services/session'
import { MatchingService } from '../services/matching'
import {
  getOnlineCount,
  disconnectUserSockets,
  terminateChatSession,
} from '../realtime/socket'

const router = Router()

// All routes in /api/admin require authentication AND administrator privileges
router.use(requireAuth)
router.use(requireAdmin)

/**
 * GET /api/admin/overview
 * Returns aggregate metrics for the moderation overview panel.
 */
router.get(
  '/overview',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const now = new Date()
      const [
        totalUsers,
        activeSessionsCount,
        pendingReports,
        totalBans,
        totalSuspensions,
        recentActions,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.session.count({ where: { expiresAt: { gt: now } } }),
        prisma.report.count({ where: { status: 'OPEN' } }),
        prisma.user.count({ where: { status: 'BANNED' } }),
        prisma.user.count({ where: { status: 'SUSPENDED' } }),
        prisma.moderationAction.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            admin: { select: { id: true, email: true, name: true } },
            targetUser: { select: { id: true, email: true, name: true } },
          },
        }),
      ])

      const onlineSockets = getOnlineCount()

      res.status(200).json({
        ok: true,
        stats: {
          totalUsers,
          activeSessionsCount,
          onlineSockets,
          pendingReports,
          totalBans,
          totalSuspensions,
        },
        recentActions,
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/admin/reports
 * Lists filed reports with filtering by status and reason.
 */
router.get(
  '/reports',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as string | undefined
      const reason = req.query.reason as string | undefined
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
      const offset = Math.max(Number(req.query.offset) || 0, 0)

      const where: any = {}
      if (status && ['OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED'].includes(status.toUpperCase())) {
        where.status = status.toUpperCase()
      }
      if (reason) {
        where.reason = reason.toUpperCase()
      }

      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
          include: {
            reporter: {
              select: {
                id: true,
                email: true,
                name: true,
                profile: { select: { currentNickname: true, avatarPreset: true } },
              },
            },
            reported: {
              select: {
                id: true,
                email: true,
                name: true,
                status: true,
                profile: { select: { currentNickname: true, avatarPreset: true } },
              },
            },
            chatSession: {
              select: {
                id: true,
                mode: true,
                startedAt: true,
                endedAt: true,
                endedReason: true,
              },
            },
          },
        }),
        prisma.report.count({ where }),
      ])

      res.status(200).json({
        ok: true,
        reports,
        total,
        limit,
        offset,
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/admin/reports/:id
 * Fetches full report details including audit history.
 */
router.get(
  '/reports/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const report = await prisma.report.findUnique({
        where: { id },
        include: {
          reporter: {
            select: {
              id: true,
              email: true,
              name: true,
              profile: true,
            },
          },
          reported: {
            select: {
              id: true,
              email: true,
              name: true,
              status: true,
              suspendedUntil: true,
              profile: true,
            },
          },
          chatSession: true,
          moderationActions: {
            include: {
              admin: { select: { email: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      })

      if (!report) {
        throw new AppError(404, 'NOT_FOUND', 'Report not found.')
      }

      res.status(200).json({ ok: true, report })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * PUT /api/admin/reports/:id
 * Updates report status (e.g. REVIEWING or DISMISSED).
 */
router.put(
  '/reports/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const { status } = req.body || {}

      if (!['OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED'].includes(status)) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Invalid report status.')
      }

      const report = await prisma.report.update({
        where: { id },
        data: {
          status,
          resolvedBy: status === 'ACTIONED' || status === 'DISMISSED' ? req.user!.id : undefined,
          resolvedAt: status === 'ACTIONED' || status === 'DISMISSED' ? new Date() : undefined,
        },
      })

      res.status(200).json({ ok: true, report })
    } catch (err) {
      next(err)
    }
  }
)

const moderateUserSchema = z.object({
  action: z.enum(['WARN', 'SUSPEND', 'BAN', 'UNBAN', 'DISMISS']),
  reason: z.string().min(3).max(1000),
  durationHours: z.number().int().positive().max(8760).optional(),
  reportId: z.string().uuid().optional(),
})

/**
 * POST /api/admin/users/:userId/moderate
 * Executes a moderation action (WARN, SUSPEND, BAN, UNBAN, DISMISS).
 * Revokes sessions and disconnects sockets on BAN and SUSPEND.
 */
router.post(
  '/users/:userId/moderate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params
      const parseResult = moderateUserSchema.safeParse(req.body)
      if (!parseResult.success) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Invalid moderation input.',
          { issues: parseResult.error.format() }
        )
      }

      const { action, reason, durationHours, reportId } = parseResult.data

      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
      })
      if (!targetUser) {
        throw new AppError(404, 'NOT_FOUND', 'Target user not found.')
      }

      const adminId = req.user!.id
      let expiresAt: Date | null = null

      if (action === 'BAN') {
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'BANNED', suspendedUntil: null },
        })

        // Clean up match & queue
        MatchingService.leaveQueue(userId)
        const match = MatchingService.getActiveMatchForUser(userId)
        if (match) {
          await terminateChatSession(match.sessionId, adminId, 'MODERATION')
        }

        // Revoke all sessions and disconnect active sockets immediately
        await SessionService.revokeAllUserSessions(userId)
        disconnectUserSockets(userId, `Account banned by moderator: ${reason}`)
      } else if (action === 'SUSPEND') {
        const hours = durationHours || 24
        expiresAt = new Date(Date.now() + hours * 3600 * 1000)

        await prisma.user.update({
          where: { id: userId },
          data: { status: 'SUSPENDED', suspendedUntil: expiresAt },
        })

        // Clean up match & queue
        MatchingService.leaveQueue(userId)
        const match = MatchingService.getActiveMatchForUser(userId)
        if (match) {
          await terminateChatSession(match.sessionId, adminId, 'MODERATION')
        }

        // Revoke all sessions and disconnect active sockets immediately
        await SessionService.revokeAllUserSessions(userId)
        disconnectUserSockets(
          userId,
          `Account suspended until ${expiresAt.toISOString()}: ${reason}`
        )
      } else if (action === 'UNBAN') {
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'ACTIVE', suspendedUntil: null },
        })
      }

      // Record moderation action in audit log
      const moderationRecord = await prisma.moderationAction.create({
        data: {
          adminId,
          targetUserId: userId,
          reportId: reportId || null,
          action,
          reason,
          expiresAt,
        },
      })

      // If associated with a report, update report status
      if (reportId) {
        await prisma.report
          .update({
            where: { id: reportId },
            data: {
              status: action === 'DISMISS' ? 'DISMISSED' : 'ACTIONED',
              resolvedBy: adminId,
              resolvedAt: new Date(),
            },
          })
          .catch(() => {})
      }

      res.status(200).json({
        ok: true,
        action: moderationRecord,
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/admin/users
 * Lists and searches users for administration.
 */
router.get(
  '/users',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = (req.query.search as string)?.trim()
      const role = req.query.role as string | undefined
      const status = req.query.status as string | undefined
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)
      const offset = Math.max(Number(req.query.offset) || 0, 0)

      const where: any = {}

      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { profile: { currentNickname: { contains: search, mode: 'insensitive' } } },
        ]
      }

      if (role && ['STUDENT', 'ADMIN'].includes(role.toUpperCase())) {
        where.role = role.toUpperCase()
      }

      if (status && ['ACTIVE', 'SUSPENDED', 'BANNED'].includes(status.toUpperCase())) {
        where.status = status.toUpperCase()
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            suspendedUntil: true,
            createdAt: true,
            lastLoginAt: true,
            profile: {
              select: {
                currentNickname: true,
                avatarPreset: true,
              },
            },
            _count: {
              select: {
                reportsReceived: true,
                moderationActionsReceived: true,
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ])

      res.status(200).json({
        ok: true,
        users,
        total,
        limit,
        offset,
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/admin/audit-logs
 * Retrieves moderation actions audit log.
 */
router.get(
  '/audit-logs',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
      const offset = Math.max(Number(req.query.offset) || 0, 0)

      const [actions, total] = await Promise.all([
        prisma.moderationAction.findMany({
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
          include: {
            admin: { select: { id: true, email: true, name: true } },
            targetUser: { select: { id: true, email: true, name: true, status: true } },
            report: { select: { id: true, reason: true } },
          },
        }),
        prisma.moderationAction.count(),
      ])

      res.status(200).json({
        ok: true,
        actions,
        total,
        limit,
        offset,
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router

