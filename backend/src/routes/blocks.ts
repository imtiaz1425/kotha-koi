import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import prisma from '../db'
import { requireAuth } from '../middleware/require-auth'
import { AppError } from '../errors/app-error'
import { MatchingService } from '../services/matching'
import { terminateChatSession } from '../realtime/socket'
import { blockRateLimiter } from '../utils/rate-limiter'

const router = Router()

const blockSchema = z.object({
  sessionId: z.string().min(1).optional(),
})

/**
 * POST /api/blocks
 * Blocks the current or recent chat partner.
 * The blocked user ID is resolved strictly on the server from the session context.
 */
router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const blockerId = req.user!.id

      // 1. Rate limiting (max 10 blocks per minute)
      const rateLimit = blockRateLimiter.consume(blockerId, 10, 60 * 1000)
      if (!rateLimit.allowed) {
        throw new AppError(
          429,
          'RATE_LIMITED',
          `Too many block requests. Please wait ${rateLimit.retryAfterSeconds} seconds.`
        )
      }

      // 2. Input validation
      const parseResult = blockSchema.safeParse(req.body)
      if (!parseResult.success) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Invalid block parameters.',
          { issues: parseResult.error.format() }
        )
      }

      const { sessionId } = parseResult.data

      // 3. Resolve active chat session and partner user ID
      let chatSessionId: string | null = null
      let targetUserId: string | null = null
      let isMemoryActive = false

      if (sessionId) {
        const memMatch = MatchingService.getActiveMatch(sessionId)
        if (memMatch && (memMatch.userA.userId === blockerId || memMatch.userB.userId === blockerId)) {
          chatSessionId = memMatch.sessionId
          targetUserId = memMatch.userA.userId === blockerId ? memMatch.userB.userId : memMatch.userA.userId
          isMemoryActive = true
        } else {
          // Check DB record for recent session
          const dbSession = await prisma.chatSession.findUnique({
            where: { id: sessionId },
          })
          if (
            dbSession &&
            (dbSession.userAId === blockerId || dbSession.userBId === blockerId)
          ) {
            chatSessionId = dbSession.id
            targetUserId =
              dbSession.userAId === blockerId
                ? dbSession.userBId
                : dbSession.userAId
          }
        }
      } else {
        // Look up active match in memory
        const memMatch = MatchingService.getActiveMatchForUser(blockerId)
        if (memMatch) {
          chatSessionId = memMatch.sessionId
          targetUserId = memMatch.userA.userId === blockerId ? memMatch.userB.userId : memMatch.userA.userId
          isMemoryActive = true
        }
      }

      if (!targetUserId) {
        throw new AppError(
          400,
          'NOT_IN_SESSION',
          'Cannot block without an active or recent chat session partner.'
        )
      }

      if (targetUserId === blockerId) {
        throw new AppError(400, 'VALIDATION_FAILED', 'You cannot block yourself.')
      }

      // 4. Persist block record in PostgreSQL (idempotent upsert)
      await prisma.block.upsert({
        where: {
          blockerId_blockedId: {
            blockerId,
            blockedId: targetUserId,
          },
        },
        update: {},
        create: {
          blockerId,
          blockedId: targetUserId,
        },
      })

      // 5. Terminate the active chat session immediately
      if (isMemoryActive && chatSessionId) {
        await terminateChatSession(chatSessionId, blockerId, 'END')
      }

      res.status(200).json({
        ok: true,
        blockedId: targetUserId,
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router

