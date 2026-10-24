import crypto from 'node:crypto'
import { env } from '../config/env'
import prisma from '../db'
import { AppError } from '../errors/app-error'
import { isAllowedEmail, normalizeEmail } from '../utils/email'
import { authRateLimiter, RateLimiter } from '../utils/rate-limiter'
import { EmailSender, getEmailSender } from './email-sender'

/**
 * Returns the HMAC secret for hashing 6-digit OTPs.
 * Enforces that OTP_HMAC_SECRET must be set in production mode.
 */
export function getOtpHmacSecret(): string {
  if (env.OTP_HMAC_SECRET) {
    return env.OTP_HMAC_SECRET
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('OTP_HMAC_SECRET must be configured in production')
  }
  return env.SESSION_SECRET || 'dev-otp-hmac-secret-min-16-chars'
}

/**
 * Generates a cryptographically secure 6-digit OTP code using crypto.randomInt.
 * Range: 100000 to 999999 inclusive.
 */
export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString()
}

/**
 * Computes HMAC-SHA256 hash of the 6-digit OTP code.
 * Plaintext OTPs are never stored in the database.
 */
export function hashOtp(code: string, secret?: string): string {
  const hmacSecret = secret || getOtpHmacSecret()
  return crypto.createHmac('sha256', hmacSecret).update(code).digest('hex')
}

/**
 * Timing-safe comparison of submitted OTP code against expected HMAC digest.
 */
export function verifyOtpHash(
  code: string,
  expectedHash: string,
  secret?: string
): boolean {
  try {
    const computedHash = hashOtp(code, secret)
    const computedBuf = Buffer.from(computedHash, 'utf8')
    const expectedBuf = Buffer.from(expectedHash, 'utf8')

    if (computedBuf.length !== expectedBuf.length) {
      return false
    }

    return crypto.timingSafeEqual(computedBuf, expectedBuf)
  } catch {
    return false
  }
}

export interface RequestCodeParams {
  email: string
  acceptTerms?: boolean
  ip: string
  emailSender?: EmailSender
  rateLimiter?: RateLimiter
}

export interface RequestCodeResult {
  ok: boolean
  message: string
}

export interface VerifyCodeParams {
  email: string
  code: string
  ip: string
  rateLimiter?: RateLimiter
}

export interface UserSummary {
  id: string
  email: string
  role: string
  status: string
  hasProfile: boolean
}

export interface VerifyCodeResult {
  user: UserSummary
}

export class OtpService {
  /**
   * Requests a login verification code for an email address.
   * Enforces domain allowlist, rate limits, 60s cooldown, invalidates older codes,
   * stores HMAC hash in login_codes, and sends code via EmailSender.
   */
  static async requestCode(
    params: RequestCodeParams
  ): Promise<RequestCodeResult> {
    const normalizedEmail = normalizeEmail(params.email)
    if (!normalizedEmail) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Invalid email address')
    }

    if (!isAllowedEmail(normalizedEmail)) {
      throw new AppError(
        400,
        'EMAIL_DOMAIN_NOT_ALLOWED',
        'Email domain not allowed. Please use your UIU student email.'
      )
    }

    const limiter = params.rateLimiter || authRateLimiter

    // 1. Check IP rate limit: max 20 requests per hour (TRD §9)
    const ipLimit = limiter.consume(
      `request-code:ip:${params.ip}`,
      20,
      60 * 60 * 1000
    )
    if (!ipLimit.allowed) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Too many code requests from this network. Please try again later.'
      )
    }

    // 2. Check per-email rate limit: max 5 requests per hour (TRD §9)
    const emailLimit = limiter.consume(
      `request-code:email:${normalizedEmail}`,
      5,
      60 * 60 * 1000
    )
    if (!emailLimit.allowed) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Too many code requests for this email address. Please try again later.'
      )
    }

    // 3. Check 60-second resend cooldown per email (TRD §5)
    const latestCode = await prisma.loginCode.findFirst({
      where: { email: normalizedEmail },
      orderBy: { createdAt: 'desc' },
    })

    if (latestCode) {
      const msSinceLastCode = Date.now() - latestCode.createdAt.getTime()
      if (msSinceLastCode < 60 * 1000) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((60 * 1000 - msSinceLastCode) / 1000)
        )
        throw new AppError(
          429,
          'RATE_LIMITED',
          `Please wait ${retryAfterSeconds} seconds before requesting another code.`,
          { retryAfterSeconds }
        )
      }
    }

    // 4. Invalidate any existing active unconsumed codes for this email (TRD §5)
    await prisma.loginCode.updateMany({
      where: {
        email: normalizedEmail,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    })

    // 5. Generate cryptographically secure OTP and HMAC hash (TRD §5)
    const code = generateOtp()
    const codeHash = hashOtp(code)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes TTL

    await prisma.loginCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        expiresAt,
        attempts: 0,
      },
    })

    // 6. Deliver code via EmailSender abstraction (never coupled to provider)
    const sender = params.emailSender || getEmailSender()
    await sender.sendVerificationCode({
      to: normalizedEmail,
      code,
      expiresInMinutes: 10,
    })

    // 7. Generic response (EC-05: uniform response regardless of account state)
    return {
      ok: true,
      message:
        'If your email is eligible, a 6-digit verification code has been sent.',
    }
  }

  /**
   * Verifies a submitted 6-digit OTP code against the latest stored HMAC.
   * Enforces attempt limits, single-use consumption, timing-safe checks,
   * upserts the user, checks account availability, and returns user summary.
   */
  static async verifyCode(params: VerifyCodeParams): Promise<VerifyCodeResult> {
    const normalizedEmail = normalizeEmail(params.email)
    if (!normalizedEmail) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Invalid email address')
    }

    if (!isAllowedEmail(normalizedEmail)) {
      throw new AppError(
        400,
        'EMAIL_DOMAIN_NOT_ALLOWED',
        'Email domain not allowed. Please use your UIU student email.'
      )
    }

    const limiter = params.rateLimiter || authRateLimiter

    // 1. Check IP rate limit for verification: max 30 per hour (TRD §9)
    const ipLimit = limiter.consume(
      `verify-code:ip:${params.ip}`,
      30,
      60 * 60 * 1000
    )
    if (!ipLimit.allowed) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Too many verification attempts from this network. Please try again later.'
      )
    }

    // 2. Fetch latest login code record for this email
    const loginCode = await prisma.loginCode.findFirst({
      where: { email: normalizedEmail },
      orderBy: { createdAt: 'desc' },
    })

    if (!loginCode) {
      throw new AppError(
        400,
        'INVALID_CODE',
        'Invalid or expired verification code.'
      )
    }

    // 3. Check single use (consumed codes cannot be reused)
    if (loginCode.consumedAt !== null) {
      throw new AppError(
        400,
        'INVALID_CODE',
        'This verification code has already been used or invalidated.'
      )
    }

    // 4. Check expiry (10 min TTL)
    if (loginCode.expiresAt.getTime() < Date.now()) {
      throw new AppError(
        400,
        'INVALID_CODE',
        'This verification code has expired. Please request a new code.'
      )
    }

    // 5. Check attempt limits (lock at 5 failed attempts per TRD §5)
    if (loginCode.attempts >= 5) {
      throw new AppError(
        400,
        'INVALID_CODE',
        'Too many failed attempts. This code is locked. Please request a new code.'
      )
    }

    // 6. Timing-safe verification of the OTP HMAC
    const isMatch = verifyOtpHash(params.code, loginCode.codeHash)

    if (!isMatch) {
      const newAttempts = loginCode.attempts + 1
      await prisma.loginCode.update({
        where: { id: loginCode.id },
        data: { attempts: newAttempts },
      })

      if (newAttempts >= 5) {
        throw new AppError(
          400,
          'INVALID_CODE',
          'Too many failed attempts. This code is now locked. Please request a new code.'
        )
      }

      const remaining = 5 - newAttempts
      throw new AppError(
        400,
        'INVALID_CODE',
        `Invalid verification code. ${remaining} attempt(s) remaining.`
      )
    }

    // 7. Success: mark code consumed immediately to prevent reuse
    await prisma.loginCode.update({
      where: { id: loginCode.id },
      data: { consumedAt: new Date() },
    })

    // 8. User upsert & status check (FR-01..03, NFR-04)
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    })

    const now = new Date()

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          role: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: now,
          termsAcceptedAt: now,
          lastLoginAt: now,
        },
        include: { profile: true },
      })
    } else {
      // Check banned or active suspension
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

      // Update email verification timestamp and last login
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          lastLoginAt: now,
        },
        include: { profile: true },
      })
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role.toLowerCase(),
        status: user.status.toLowerCase(),
        hasProfile: Boolean(user.profile),
      },
    }
  }
}
