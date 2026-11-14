import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../db'
import { requireAuth } from '../middleware/require-auth'
import { AppError } from '../errors/app-error'
import {
  SessionService,
  SESSION_COOKIE_NAME,
  getClearCookieOptions,
} from '../services/session'
import { MatchingService } from '../services/matching'
import { terminateChatSession, disconnectUserSockets } from '../realtime/socket'

const router = Router()

/**
 * GET /api/profile
 * Returns the currently authenticated user's private profile and current nickname.
 * Requires a valid session.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      })

      res.status(200).json({
        ok: true,
        email: user?.email || '',
        name: user?.name || '',
        nickname: user?.profile?.currentNickname || '',
        avatarPreset: user?.profile?.avatarPreset || 'mango',
        preferences: user?.profile?.preferences || {},
        profile: {
          email: user?.email || '',
          name: user?.name || '',
          nickname: user?.profile?.currentNickname || '',
          avatarPreset: user?.profile?.avatarPreset || 'mango',
          preferences: user?.profile?.preferences || {},
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * PUT /api/profile
 * Updates the user's private name, temporary chat nickname, avatar preset, or preferences.
 * Changing the temporary chat nickname does not overwrite the private profile name, and vice versa.
 */
router.put(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id
      const { name, nickname, avatarPreset, preferences } = req.body || {}

      // 1. Real Name is immutable after registration. Reject any attempts to modify it.
      if (req.body?.name !== undefined || req.body?.realName !== undefined) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Real Name is permanent and cannot be modified.',
          { field: 'name' }
        )
      }

      // 2. Update chat nickname, avatar preset, and preferences on Profile model if provided
      const existingProfile = await prisma.profile.findUnique({
        where: { userId },
      })

      if (
        nickname !== undefined ||
        avatarPreset !== undefined ||
        preferences !== undefined ||
        !existingProfile
      ) {
        let safeNickname = existingProfile?.currentNickname || 'UIU Student'
        if (nickname !== undefined) {
          if (typeof nickname !== 'string' || !nickname.trim()) {
            throw new AppError(
              400,
              'VALIDATION_FAILED',
              'Nickname is required.',
              { field: 'nickname' }
            )
          }
          const trimmedNickname = nickname.trim()
          if (trimmedNickname.length < 2 || trimmedNickname.length > 20) {
            throw new AppError(
              400,
              'VALIDATION_FAILED',
              'Nickname must be between 2 and 20 characters.',
              { field: 'nickname' }
            )
          }
          safeNickname = trimmedNickname
        }

        const safeAvatarPreset =
          typeof avatarPreset === 'string' && avatarPreset.trim()
            ? avatarPreset.trim()
            : existingProfile?.avatarPreset || 'mango'

        const safePreferences =
          preferences &&
          typeof preferences === 'object' &&
          !Array.isArray(preferences)
            ? preferences
            : existingProfile?.preferences || {}

        await prisma.profile.upsert({
          where: { userId },
          create: {
            userId,
            currentNickname: safeNickname,
            avatarPreset: safeAvatarPreset,
            preferences: safePreferences,
          },
          update: {
            currentNickname: safeNickname,
            avatarPreset: safeAvatarPreset,
            preferences: safePreferences,
          },
        })
      }

      // Fetch fresh updated user and profile
      const updatedUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      })

      res.status(200).json({
        ok: true,
        email: updatedUser?.email || '',
        name: updatedUser?.name || '',
        nickname: updatedUser?.profile?.currentNickname || '',
        avatarPreset: updatedUser?.profile?.avatarPreset || 'mango',
        preferences: updatedUser?.profile?.preferences || {},
        profile: {
          email: updatedUser?.email || '',
          name: updatedUser?.name || '',
          nickname: updatedUser?.profile?.currentNickname || '',
          avatarPreset: updatedUser?.profile?.avatarPreset || 'mango',
          preferences: updatedUser?.profile?.preferences || {},
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * DELETE /api/profile
 * Self-service account deletion.
 * Cleans up personal profile, credentials, and active sessions.
 * Anonymizes the account record so safety reports and moderation history remain intact without PII.
 */
router.delete(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id
      const { confirmation } = req.body || {}

      if (confirmation !== 'DELETE' && confirmation !== true) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Explicit confirmation is required to delete your account. Provide confirmation: "DELETE".',
          { field: 'confirmation' }
        )
      }

      // 1. Leave any matchmaking queues or ongoing matches
      MatchingService.leaveQueue(userId)
      const activeMatch = MatchingService.getActiveMatchForUser(userId)
      if (activeMatch) {
        await terminateChatSession(activeMatch.sessionId, userId, 'END')
      }

      // 2. Disconnect active sockets
      disconnectUserSockets(userId, 'Account has been deleted.')

      // 3. Revoke all active sessions
      await SessionService.revokeAllUserSessions(userId)

      // 4. Clean up personal data
      await prisma.profile.deleteMany({ where: { userId } })
      await prisma.userPassword.deleteMany({ where: { userId } })
      await prisma.session.deleteMany({ where: { userId } })

      // 5. Anonymize user record to preserve audit & moderation integrity
      const anonymizedEmail = `deleted_${userId.replace(/-/g, '')}@deleted.kothakoi.local`
      await prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          name: null,
          status: 'BANNED',
          termsAcceptedAt: null,
          emailVerifiedAt: null,
          lastLoginAt: null,
        },
      })

      // 6. Clear session cookie
      res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions())

      res.status(200).json({
        ok: true,
        message: 'Account successfully deleted.',
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
