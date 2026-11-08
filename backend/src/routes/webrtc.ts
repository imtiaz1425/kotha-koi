import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/require-auth'
import { turnService } from '../services/turn.service'
import { iceServersRateLimiter } from '../utils/rate-limiter'
import { AppError } from '../errors/app-error'

const router = Router()

/**
 * GET /api/webrtc/ice-servers
 * Protected by requireAuth and rate limiting.
 * Returns only the ICE server configuration needed by RTCPeerConnection.
 * Never leaks the provider API key or internal secrets.
 */
router.get(
  '/ice-servers',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id
      const rateLimitKey = `ice-servers:user:${userId}`

      // Allow up to 30 requests per minute per authenticated user
      const limitResult = iceServersRateLimiter.consume(
        rateLimitKey,
        30,
        60 * 1000
      )

      if (!limitResult.allowed) {
        throw new AppError(
          429,
          'RATE_LIMITED',
          'Too many ICE server requests. Please try again shortly.',
          { retryAfterSeconds: limitResult.retryAfterSeconds }
        )
      }

      const iceServers = await turnService.getIceServers()

      res.status(200).json({
        iceServers,
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router

