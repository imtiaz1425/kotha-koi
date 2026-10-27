import { Router, Request, Response, NextFunction } from 'express'
import prisma from '../db'
import { requireAuth } from '../middleware/require-auth'
import { AppError } from '../errors/app-error'

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
        name: user?.name || '',
        nickname: user?.profile?.currentNickname || '',
        avatarPreset: user?.profile?.avatarPreset || 'mango',
        preferences: user?.profile?.preferences || {},
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

      // 1. Update private account name on User model if provided
      if (name !== undefined) {
        if (typeof name !== 'string') {
          throw new AppError(
            400,
            'VALIDATION_FAILED',
            'Name must be a valid text string.',
            { field: 'name' }
          )
        }
        const trimmedName = name.trim()
        if (
          trimmedName &&
          (trimmedName.length < 2 || trimmedName.length > 60)
        ) {
          throw new AppError(
            400,
            'VALIDATION_FAILED',
            'Name must be between 2 and 60 characters.',
            { field: 'name' }
          )
        }
        await prisma.user.update({
          where: { id: userId },
          data: { name: trimmedName || null },
        })
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
        name: updatedUser?.name || '',
        nickname: updatedUser?.profile?.currentNickname || '',
        avatarPreset: updatedUser?.profile?.avatarPreset || 'mango',
        preferences: updatedUser?.profile?.preferences || {},
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
