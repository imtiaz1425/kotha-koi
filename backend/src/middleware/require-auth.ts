import { Request, Response, NextFunction } from 'express'
import { AppError } from '../errors/app-error'
import { SessionService, SESSION_COOKIE_NAME } from '../services/session'

/**
 * Middleware that guards protected routes by requiring a valid session cookie.
 * Validates token hash in PostgreSQL, ensures session has not expired,
 * re-checks user status (BANNED/SUSPENDED), and attaches req.user and req.sessionRecord.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME]
    if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
      throw new AppError(
        401,
        'UNAUTHENTICATED',
        'Authentication required. Please log in.'
      )
    }

    const { session } = await SessionService.validateSession(rawToken)

    req.user = session.user
    req.sessionRecord = session

    next()
  } catch (err) {
    next(err)
  }
}
