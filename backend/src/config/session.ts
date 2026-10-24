import crypto from 'crypto'
import { CookieOptions } from 'express'
import { env } from './env'

/**
 * Canonical session cookie name as defined in TRD §5, CONTRACTS.md §2, and BACKEND-SCHEMA.md §3.4.
 */
export const SESSION_COOKIE_NAME = 'kothakoi_session'

/**
 * 24-hour session lifetime (in milliseconds).
 */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Hashes a plaintext session token using SHA-256 before database storage or lookup.
 * Plaintext tokens are NEVER persisted in PostgreSQL.
 */
export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Cookie options for setting authenticated session cookies.
 * Enforces HttpOnly, SameSite=Lax, Path=/, and conditional Secure flag based on NODE_ENV.
 */
export function getSessionCookieOptions(
  overrides?: Partial<CookieOptions>
): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
    ...overrides,
  }
}

/**
 * Cookie options for clearing / revoking session cookies on logout.
 */
export function getClearCookieOptions(
  overrides?: Partial<CookieOptions>
): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...overrides,
  }
}
