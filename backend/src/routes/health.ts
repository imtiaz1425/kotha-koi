import { Router, Request, Response } from 'express'
import { getOnlineCount } from '../realtime/socket'

const router = Router()

/**
 * GET /api/health
 * Simple liveness check – returns 200 with status ok.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

/**
 * GET /api/stats/online
 * Returns the current count of active authenticated online students.
 */
router.get('/stats/online', (_req: Request, res: Response) => {
  res.json({ ok: true, count: getOnlineCount() })
})

export default router
