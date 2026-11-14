import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import prisma from '../db'
import { requireAuth } from '../middleware/require-auth'
import { AppError } from '../errors/app-error'
import { MatchingService } from '../services/matching'
import { terminateChatSession } from '../realtime/socket'
import { reportRateLimiter } from '../utils/rate-limiter'

const router = Router()

const createReportSchema = z.object({
  sessionId: z.string().min(1).optional(),
  reason: z.enum([
    'HARASSMENT',
    'SEXUAL_CONTENT',
    'HATE_SPEECH',
    'SPAM_OR_BOT',
    'IMPERSONATION',
    'THREATS_OR_SELF_HARM',
    'OTHER',
  ]),
  details: z.string().max(1000).optional(),
})

/**
 * POST /api/reports
 * Files a moderation report against the current chat partner.
 * The reported user is derived strictly on the server from the active chat session.
 */
router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reporterId = req.user!.id

      // 1. Rate limiting (max 5 reports per 5 minutes per user)
      const rateLimit = reportRateLimiter.consume(reporterId, 5, 5 * 60 * 1000)
      if (!rateLimit.allowed) {
        throw new AppError(
          429,
          'RATE_LIMITED',
          `Too many reports submitted. Please wait ${rateLimit.retryAfterSeconds} seconds.`
        )
      }

      // 2. Input validation
      const parseResult = createReportSchema.safeParse(req.body)
      if (!parseResult.success) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Invalid report parameters.',
          { issues: parseResult.error.format() }
        )
      }

      const { sessionId, reason, details } = parseResult.data

      // 3. Resolve active chat session and partner user ID
      let chatSessionId: string | null = null
      let reportedId: string | null = null
      let isMemoryActive = false

      if (sessionId) {
        const memMatch = MatchingService.getActiveMatch(sessionId)
        if (memMatch && (memMatch.userA.userId === reporterId || memMatch.userB.userId === reporterId)) {
          chatSessionId = memMatch.sessionId
          reportedId = memMatch.userA.userId === reporterId ? memMatch.userB.userId : memMatch.userA.userId
          isMemoryActive = true
        } else {
          // Check DB record for recent session
          const dbSession = await prisma.chatSession.findUnique({
            where: { id: sessionId },
          })
          if (
            dbSession &&
            (dbSession.userAId === reporterId || dbSession.userBId === reporterId)
          ) {
            chatSessionId = dbSession.id
            reportedId =
              dbSession.userAId === reporterId
                ? dbSession.userBId
                : dbSession.userAId
          }
        }
      } else {
        // Look up user's active session in memory
        const memMatch = MatchingService.getActiveMatchForUser(reporterId)
        if (memMatch) {
          chatSessionId = memMatch.sessionId
          reportedId = memMatch.userA.userId === reporterId ? memMatch.userB.userId : memMatch.userA.userId
          isMemoryActive = true
        }
      }

      if (!chatSessionId || !reportedId) {
        throw new AppError(
          400,
          'NOT_IN_SESSION',
          'Cannot submit a report without an active or recent chat session.'
        )
      }

      // 4. Check for duplicate report on the same session
      const existing = await prisma.report.findFirst({
        where: {
          reporterId,
          chatSessionId,
        },
      })
      if (existing) {
        throw new AppError(
          409,
          'CONFLICT',
          'You have already reported this chat session.'
        )
      }

      // 5. Persist report in PostgreSQL
      const report = await prisma.report.create({
        data: {
          reporterId,
          reportedId,
          chatSessionId,
          reason,
          details: details?.trim() || null,
          status: 'OPEN',
        },
      })

      // 6. Terminate the active chat session immediately
      if (isMemoryActive && chatSessionId) {
        await terminateChatSession(chatSessionId, reporterId, 'MODERATION')
      }

      res.status(201).json({
        ok: true,
        reportId: report.id,
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router

