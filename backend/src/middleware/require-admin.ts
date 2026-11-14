import { Request, Response, NextFunction } from 'express'
import { AppError } from '../errors/app-error'

/**
 * Middleware that guards admin-only routes.
 * Must be used in conjunction with requireAuth so req.user is populated.
 * Strictly verifies role is ADMIN and status is ACTIVE.
 */
export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next(
      new AppError(401, 'UNAUTHENTICATED', 'Authentication required. Please log in.')
    )
  }

  if (req.user.role !== 'ADMIN') {
    return next(
      new AppError(403, 'FORBIDDEN', 'Administrative privileges required.')
    )
  }

  if (req.user.status === 'BANNED' || req.user.status === 'SUSPENDED') {
    return next(
      new AppError(403, 'FORBIDDEN', 'Administrative account is suspended or banned.')
    )
  }

  next()
}

