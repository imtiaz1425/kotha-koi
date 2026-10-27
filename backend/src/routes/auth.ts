import { Router, Request, Response, NextFunction } from 'express'
import {
  requestEmailCodeSchema,
  verifyEmailCodeSchema,
  setPasswordSchema,
  passwordLoginSchema,
  changePasswordSchema,
} from '@kothakoi/shared'
import prisma from '../db'
import { AppError } from '../errors/app-error'
import { OtpService } from '../services/otp'
import {
  SessionService,
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  getClearCookieOptions,
} from '../services/session'
import { requireAuth } from '../middleware/require-auth'
import { normalizeEmail } from '../utils/email'
import { hashPassword, verifyPassword } from '../utils/password'

const router = Router()

/**
 * POST /api/auth/request-code
 * Initiates email verification by generating and sending a 6-digit OTP code.
 */
router.post(
  '/request-code',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = requestEmailCodeSchema.parse(req.body)
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1'

      const result = await OtpService.requestCode({
        email: input.email,
        acceptTerms: input.acceptTerms,
        ip,
      })

      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/auth/verify-code
 * Verifies submitted 6-digit OTP code, upserts user account,
 * creates an authenticated session in PostgreSQL, sets the HttpOnly session cookie,
 * and returns user summary.
 */
router.post(
  '/verify-code',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = verifyEmailCodeSchema.parse(req.body)
      const ip = req.ip || req.socket.remoteAddress || '127.0.0.1'

      const result = await OtpService.verifyCode({
        email: input.email,
        code: input.code,
        ip,
      })

      // TASK-AUTH-04: Issue session and set HttpOnly session cookie
      const { rawToken } = await SessionService.createSession(result.user.id)
      res.cookie(SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions())

      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/auth/set-password
 * Securely hashes and persists password for an email-verified student account.
 */
router.post(
  '/set-password',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = setPasswordSchema.parse(req.body)
      const normalizedEmail = normalizeEmail(input.email)

      if (!normalizedEmail) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Invalid email address.')
      }

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })

      if (!user || !user.emailVerifiedAt) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Please complete UIU email verification before setting a password.'
        )
      }

      if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
        throw new AppError(
          403,
          'ACCOUNT_UNAVAILABLE',
          'This account is unavailable.'
        )
      }

      const passwordHash = hashPassword(input.password)

      await prisma.userPassword.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          passwordHash,
        },
        update: {
          passwordHash,
        },
      })

      // Update private profile name if provided during registration
      if (input.name) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name: input.name },
        })
      }

      // Clear any session cookie so user logs in afresh on Login screen
      const rawToken = req.cookies?.[SESSION_COOKIE_NAME]
      if (rawToken) {
        await SessionService.revokeSession(rawToken)
      }
      res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions())

      res.status(200).json({
        ok: true,
        message: 'Account password saved successfully.',
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/auth/change-password
 * Allows an authenticated student to update their password.
 */
router.post(
  '/change-password',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = changePasswordSchema.parse(req.body)
      const userId = req.user!.id

      const userPassword = await prisma.userPassword.findUnique({
        where: { userId },
      })

      if (!userPassword) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Account password is not configured.'
        )
      }

      const isValid = verifyPassword(
        input.currentPassword,
        userPassword.passwordHash
      )

      if (!isValid) {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Current password is incorrect.'
        )
      }

      const passwordHash = hashPassword(input.newPassword)
      await prisma.userPassword.update({
        where: { userId },
        data: { passwordHash },
      })

      res.status(200).json({
        ok: true,
        message: 'Password updated successfully.',
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/auth/login
 * Authenticates user with UIU institutional email or student ID and password.
 */
router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = passwordLoginSchema.parse(req.body)
      const cleanIdentifier = input.identifier.trim().toLowerCase()

      const user = cleanIdentifier.includes('@')
        ? await prisma.user.findUnique({
            where: { email: normalizeEmail(cleanIdentifier) || '' },
            include: { profile: true, passwordAuth: true },
          })
        : await prisma.user.findFirst({
            where: { email: { startsWith: `${cleanIdentifier}@` } },
            include: { profile: true, passwordAuth: true },
          })

      if (!user || !user.passwordAuth) {
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Invalid UIU email, student ID, or password.'
        )
      }

      const isValidPassword = verifyPassword(
        input.password,
        user.passwordAuth.passwordHash
      )

      if (!isValidPassword) {
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Invalid UIU email, student ID, or password.'
        )
      }

      const now = new Date()

      if (user.status === 'BANNED') {
        throw new AppError(
          403,
          'ACCOUNT_UNAVAILABLE',
          'This account has been permanently suspended.'
        )
      }

      if (user.status === 'SUSPENDED') {
        if (
          user.suspendedUntil &&
          user.suspendedUntil.getTime() > now.getTime()
        ) {
          throw new AppError(
            403,
            'ACCOUNT_UNAVAILABLE',
            `This account is suspended until ${user.suspendedUntil.toISOString()}.`
          )
        }
      }

      // Update lastLoginAt
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      })

      // Create session and set HttpOnly session cookie
      const { rawToken } = await SessionService.createSession(user.id)
      res.cookie(SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions())

      res.status(200).json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || null,
          role: user.role.toLowerCase(),
          status: user.status.toLowerCase(),
          hasProfile: Boolean(user.profile),
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * POST /api/auth/logout
 * Revokes active session from database, clears session cookie, and returns HTTP 204.
 */
router.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawToken = req.cookies?.[SESSION_COOKIE_NAME]
      if (rawToken) {
        await SessionService.revokeSession(rawToken)
      }

      res.set(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      )
      res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions())
      res.status(204).send()
    } catch (err) {
      next(err)
    }
  }
)

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile and account status.
 * Requires a valid, unexpired session cookie.
 */
router.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!

      res.set(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      )
      res.set('Pragma', 'no-cache')
      res.set('Expires', '0')

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name || null,
          role: user.role.toLowerCase(),
          status: user.status.toLowerCase(),
          hasProfile: Boolean(user.profile),
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
