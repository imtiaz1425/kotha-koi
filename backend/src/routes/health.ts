import { Router, Request, Response } from 'express'

const router = Router()

/**
 * GET /api/health
 * Simple liveness check – returns 200 with status ok.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

export default router
