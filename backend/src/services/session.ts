import crypto from 'crypto'
import { Session, User, Profile } from '@prisma/client'
import prisma from '../db'
import { AppError } from '../errors/app-error'
import {
  hashSessionToken,
  SESSION_MAX_AGE_MS,
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  getClearCookieOptions,
} from '../config/session'

export {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  getSessionCookieOptions,
  getClearCookieOptions,
}

export type ValidatedSession = Session & {
  user: User & { profile: Profile | null }
}

export class SessionService {
  /**
   * Generates a 32-byte cryptographically secure random token,
   * stores its SHA-256 hash in PostgreSQL, and returns both the session record
   * and the plaintext token to be set in the HttpOnly cookie.
   */
  static async createSession(
    userId: string,
    ttlMs: number = SESSION_MAX_AGE_MS
  ): Promise<{ session: Session; rawToken: string }> {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashSessionToken(rawToken)
    const expiresAt = new Date(Date.now() + ttlMs)

    const session = await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    })

    return { session, rawToken }
  }

  /**
   * Validates a raw session token received from the cookie.
   * Performs SHA-256 hashing, database lookup, expiry check, and
   * re-checks user account status (BANNED/SUSPENDED).
   */
  static async validateSession(
    rawToken: string
  ): Promise<{ session: ValidatedSession }> {
    if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
      throw new AppError(
        401,
        'UNAUTHENTICATED',
        'Authentication required. Please log in.'
      )
    }

    const tokenHash = hashSessionToken(rawToken.trim())

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { profile: true },
        },
      },
    })

    if (!session) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or revoked session.')
    }

    const now = new Date()

    // 1. Check expiration
    if (session.expiresAt.getTime() <= now.getTime()) {
      // Prune expired session asynchronously
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
      throw new AppError(
        401,
        'SESSION_EXPIRED',
        'Session has expired. Please log in again.'
      )
    }

    // 2. Re-check user account status (FR-06, FR-23)
    if (session.user.status === 'BANNED') {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
      throw new AppError(
        403,
        'ACCOUNT_UNAVAILABLE',
        'This account has been permanently suspended.'
      )
    }

    if (session.user.status === 'SUSPENDED') {
      if (
        session.user.suspendedUntil &&
        session.user.suspendedUntil.getTime() > now.getTime()
      ) {
        await prisma.session
          .delete({ where: { id: session.id } })
          .catch(() => {})
        throw new AppError(
          403,
          'ACCOUNT_UNAVAILABLE',
          `This account is suspended until ${session.user.suspendedUntil.toISOString()}.`
        )
      }
    }

    // 3. Update lastSeenAt if > 60s has elapsed since last update
    if (now.getTime() - session.lastSeenAt.getTime() > 60 * 1000) {
      prisma.session
        .update({
          where: { id: session.id },
          data: { lastSeenAt: now },
        })
        .catch(() => {})
    }

    return { session: session as ValidatedSession }
  }

  /**
   * Revokes a session by deleting its record from PostgreSQL based on the SHA-256 token hash.
   */
  static async revokeSession(rawToken: string): Promise<boolean> {
    if (!rawToken || typeof rawToken !== 'string') return false
    const tokenHash = hashSessionToken(rawToken.trim())
    const result = await prisma.session.deleteMany({
      where: { tokenHash },
    })
    return result.count > 0
  }

  /**
   * Revokes all active sessions for a specific user (e.g. on ban or security reset).
   */
  static async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: { userId },
    })
    return result.count
  }
}
