import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import prisma from '../db'
import app from '../app'
import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  OtpService,
} from '../services/otp'
import { RateLimiter } from '../utils/rate-limiter'
import {
  EmailSender,
  SendVerificationCodeOptions,
  EmailSenderResult,
} from '../services/email-sender'
import { apiErrorSchema } from '@kothakoi/shared'

class MockEmailSender implements EmailSender {
  public sentCodes: { to: string; code: string; expiresInMinutes?: number }[] =
    []
  public shouldFail = false

  async sendVerificationCode(
    options: SendVerificationCodeOptions
  ): Promise<EmailSenderResult> {
    if (this.shouldFail) {
      throw new Error('Simulated email sender network failure')
    }
    this.sentCodes.push(options)
    return { success: true, messageId: `mock-${Date.now()}` }
  }

  getLatestCodeFor(email: string): string | undefined {
    const matching = this.sentCodes.filter((s) => s.to === email)
    return matching[matching.length - 1]?.code
  }

  clear(): void {
    this.sentCodes = []
    this.shouldFail = false
  }
}

describe('TASK-AUTH-03 — OTP Service and Endpoints', () => {
  const testStudentEmail = 'otp-test-student@bscse.uiu.ac.bd'
  const testBannedEmail = 'otp-test-banned@bscse.uiu.ac.bd'
  const testSuspendedEmail = 'otp-test-suspended@bscse.uiu.ac.bd'

  const mockEmailSender = new MockEmailSender()
  let isolatedRateLimiter: RateLimiter

  beforeEach(async () => {
    mockEmailSender.clear()
    isolatedRateLimiter = new RateLimiter()

    // Clean up test data in database
    await prisma.loginCode.deleteMany({
      where: {
        email: {
          contains: 'otp-test',
        },
      },
    })
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'otp-test',
        },
      },
    })
  })

  afterAll(async () => {
    await prisma.loginCode.deleteMany({
      where: {
        email: {
          contains: 'otp-test',
        },
      },
    })
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'otp-test',
        },
      },
    })
    await prisma.$disconnect()
  })

  describe('Cryptographic OTP Generation and Hashing', () => {
    it('generates a 6-digit numeric string in range 100000..999999', () => {
      for (let i = 0; i < 20; i++) {
        const code = generateOtp()
        expect(code).toMatch(/^\d{6}$/)
        const num = Number(code)
        expect(num).toBeGreaterThanOrEqual(100000)
        expect(num).toBeLessThan(1000000)
      }
    })

    it('computes HMAC-SHA256 and verifies it in timing-safe manner', () => {
      const code = '123456'
      const hash = hashOtp(code, 'test-hmac-secret-min-16-chars')

      expect(hash).toBeDefined()
      expect(hash).toHaveLength(64) // 32 bytes hex encoded = 64 chars

      expect(verifyOtpHash(code, hash, 'test-hmac-secret-min-16-chars')).toBe(
        true
      )
      expect(
        verifyOtpHash('654321', hash, 'test-hmac-secret-min-16-chars')
      ).toBe(false)
      expect(
        verifyOtpHash(code, 'invalidhash', 'test-hmac-secret-min-16-chars')
      ).toBe(false)
    })
  })

  describe('POST /api/auth/request-code', () => {
    it('rejects malformed email addresses with HTTP 400 VALIDATION_FAILED', async () => {
      const res = await request(app)
        .post('/api/auth/request-code')
        .send({ email: 'not-an-email' })

      expect(res.status).toBe(400)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('VALIDATION_FAILED')
    })

    it('rejects disallowed non-UIU email domains with HTTP 400 EMAIL_DOMAIN_NOT_ALLOWED', async () => {
      const res = await request(app)
        .post('/api/auth/request-code')
        .send({ email: 'intruder@gmail.com' })

      expect(res.status).toBe(400)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED')
      expect(res.body.error.message).toContain('Email domain not allowed')
    })

    it('successfully requests code for valid UIU email and stores hashed OTP', async () => {
      const res = await request(app)
        .post('/api/auth/request-code')
        .send({ email: testStudentEmail, acceptTerms: true })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.message).toContain('verification code has been sent')

      // Ensure response never exposes OTP or secrets
      expect(res.body.code).toBeUndefined()
      expect(res.body.otp).toBeUndefined()

      // Verify record exists in database with hashed verifier
      const loginCode = await prisma.loginCode.findFirst({
        where: { email: testStudentEmail },
        orderBy: { createdAt: 'desc' },
      })

      expect(loginCode).toBeDefined()
      expect(loginCode?.codeHash).toBeDefined()
      expect(loginCode?.codeHash).toHaveLength(64)
      expect(loginCode?.consumedAt).toBeNull()
      expect(loginCode?.attempts).toBe(0)
    })

    it('enforces 60-second cooldown on immediate re-request', async () => {
      // First request
      await request(app)
        .post('/api/auth/request-code')
        .send({ email: testStudentEmail })

      // Second immediate request
      const res = await request(app)
        .post('/api/auth/request-code')
        .send({ email: testStudentEmail })

      expect(res.status).toBe(429)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('RATE_LIMITED')
      expect(res.body.error.message).toContain('Please wait')
      expect(res.body.error.details?.retryAfterSeconds).toBeDefined()
    })

    it('invalidates older active codes when a new request is made after cooldown', async () => {
      // Create an older code row directly in DB with createdAt > 65s ago
      const olderDate = new Date(Date.now() - 70 * 1000)
      const oldCode = await prisma.loginCode.create({
        data: {
          email: testStudentEmail,
          codeHash: hashOtp('111111'),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          createdAt: olderDate,
        },
      })

      // Request a new code
      const res = await request(app)
        .post('/api/auth/request-code')
        .send({ email: testStudentEmail })

      expect(res.status).toBe(200)

      // Verify the older code was marked consumed/invalidated
      const updatedOldCode = await prisma.loginCode.findUnique({
        where: { id: oldCode.id },
      })
      expect(updatedOldCode?.consumedAt).not.toBeNull()
    })

    it('enforces per-email and per-IP rate limits', async () => {
      const email = 'rate-limit-test@bscse.uiu.ac.bd'
      const limiter = new RateLimiter()

      // Exhaust 5 requests (clearing loginCode so 60s cooldown does not mask the 5/h rate limit)
      for (let i = 0; i < 5; i++) {
        await OtpService.requestCode({
          email,
          ip: `192.168.1.${i + 1}`,
          emailSender: mockEmailSender,
          rateLimiter: limiter,
        })
        await prisma.loginCode.deleteMany({ where: { email } })
      }

      // 6th request should fail rate limit
      await expect(
        OtpService.requestCode({
          email,
          ip: '192.168.1.100',
          emailSender: mockEmailSender,
          rateLimiter: limiter,
        })
      ).rejects.toThrowError(/Too many code requests for this email address/)
    })
  })

  describe('POST /api/auth/verify-code', () => {
    it('verifies valid code, upserts user account, and marks code consumed', async () => {
      // 1. Request code using controlled service
      await OtpService.requestCode({
        email: testStudentEmail,
        ip: '127.0.0.1',
        emailSender: mockEmailSender,
        rateLimiter: isolatedRateLimiter,
      })

      const sentCode = mockEmailSender.getLatestCodeFor(testStudentEmail)
      expect(sentCode).toBeDefined()

      // 2. Verify code
      const res = await request(app).post('/api/auth/verify-code').send({
        email: testStudentEmail,
        code: sentCode,
      })

      expect(res.status).toBe(200)
      expect(res.body.user).toBeDefined()
      expect(res.body.user.email).toBe(testStudentEmail)
      expect(res.body.user.role).toBe('student')
      expect(res.body.user.status).toBe('active')
      expect(res.body.user.hasProfile).toBe(false)

      // 3. Confirm code is now marked consumed in database
      const codeRecord = await prisma.loginCode.findFirst({
        where: { email: testStudentEmail },
        orderBy: { createdAt: 'desc' },
      })
      expect(codeRecord?.consumedAt).not.toBeNull()

      // 4. Confirm user exists in database
      const dbUser = await prisma.user.findUnique({
        where: { email: testStudentEmail },
      })
      expect(dbUser).not.toBeNull()
      expect(dbUser?.emailVerifiedAt).not.toBeNull()
    })

    it('rejects code reuse after successful verification', async () => {
      await OtpService.requestCode({
        email: testStudentEmail,
        ip: '127.0.0.1',
        emailSender: mockEmailSender,
        rateLimiter: isolatedRateLimiter,
      })

      const sentCode = mockEmailSender.getLatestCodeFor(testStudentEmail)!

      // First verification succeeds
      await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testStudentEmail, code: sentCode })

      // Second verification attempt with same code must fail
      const res2 = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testStudentEmail, code: sentCode })

      expect(res2.status).toBe(400)
      const parseResult = apiErrorSchema.safeParse(res2.body)
      expect(parseResult.success).toBe(true)
      expect(res2.body.error.code).toBe('INVALID_CODE')
      expect(res2.body.error.message).toContain('already been used')
    })

    it('rejects expired verification codes', async () => {
      // Create code with past expiration
      const expiredDate = new Date(Date.now() - 1000)
      await prisma.loginCode.create({
        data: {
          email: testStudentEmail,
          codeHash: hashOtp('123456'),
          expiresAt: expiredDate,
        },
      })

      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testStudentEmail, code: '123456' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_CODE')
      expect(res.body.error.message).toContain('expired')
    })

    it('increments attempts on wrong code and locks at 5 failed attempts', async () => {
      await OtpService.requestCode({
        email: testStudentEmail,
        ip: '127.0.0.1',
        emailSender: mockEmailSender,
        rateLimiter: isolatedRateLimiter,
      })

      const wrongCode = '000000'

      // First 4 wrong attempts
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post('/api/auth/verify-code')
          .send({ email: testStudentEmail, code: wrongCode })

        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('INVALID_CODE')
        expect(res.body.error.message).toContain(
          `${5 - i} attempt(s) remaining`
        )
      }

      // 5th wrong attempt locks the code
      const res5 = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testStudentEmail, code: wrongCode })

      expect(res5.status).toBe(400)
      expect(res5.body.error.code).toBe('INVALID_CODE')
      expect(res5.body.error.message).toContain('locked')

      // Subsequent attempt even with the correct code is locked
      const correctCode = mockEmailSender.getLatestCodeFor(testStudentEmail)!
      const resLocked = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testStudentEmail, code: correctCode })

      expect(resLocked.status).toBe(400)
      expect(resLocked.body.error.code).toBe('INVALID_CODE')
      expect(resLocked.body.error.message).toContain('locked')
    })

    it('rejects banned user account on verification with 403 ACCOUNT_UNAVAILABLE', async () => {
      // Pre-seed a banned user
      await prisma.user.create({
        data: {
          email: testBannedEmail,
          role: 'STUDENT',
          status: 'BANNED',
        },
      })

      await OtpService.requestCode({
        email: testBannedEmail,
        ip: '127.0.0.1',
        emailSender: mockEmailSender,
        rateLimiter: isolatedRateLimiter,
      })

      const code = mockEmailSender.getLatestCodeFor(testBannedEmail)!

      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testBannedEmail, code })

      expect(res.status).toBe(403)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('ACCOUNT_UNAVAILABLE')
      expect(res.body.error.message).toContain('permanently suspended')
    })

    it('rejects suspended user account on verification with 403 ACCOUNT_UNAVAILABLE', async () => {
      // Pre-seed a suspended user
      const suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await prisma.user.create({
        data: {
          email: testSuspendedEmail,
          role: 'STUDENT',
          status: 'SUSPENDED',
          suspendedUntil,
        },
      })

      await OtpService.requestCode({
        email: testSuspendedEmail,
        ip: '127.0.0.1',
        emailSender: mockEmailSender,
        rateLimiter: isolatedRateLimiter,
      })

      const code = mockEmailSender.getLatestCodeFor(testSuspendedEmail)!

      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testSuspendedEmail, code })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('ACCOUNT_UNAVAILABLE')
      expect(res.body.error.message).toContain('suspended until')
    })
  })
})
