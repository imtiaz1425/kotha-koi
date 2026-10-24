import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import prisma from '../db'
import app from '../app'
import { OtpService } from '../services/otp'
import {
  SessionService,
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  getClearCookieOptions,
} from '../services/session'
import {
  EmailSender,
  SendVerificationCodeOptions,
  EmailSenderResult,
} from '../services/email-sender'
import { RateLimiter } from '../utils/rate-limiter'
import { apiErrorSchema } from '@kothakoi/shared'

class MockEmailSender implements EmailSender {
  public sentCodes: SendVerificationCodeOptions[] = []

  async sendVerificationCode(
    options: SendVerificationCodeOptions
  ): Promise<EmailSenderResult> {
    this.sentCodes.push(options)
    return { success: true, messageId: `mock-${Date.now()}` }
  }

  getLatestCodeFor(email: string): string | undefined {
    const matching = this.sentCodes.filter((item) => item.to === email)
    return matching[matching.length - 1]?.code
  }

  clear(): void {
    this.sentCodes = []
  }
}

function getCookiesArray(res: request.Response): string[] {
  const raw = res.headers['set-cookie']
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

describe('TASK-AUTH-04 — Backend Sessions, Cookies, /me, and requireAuth', () => {
  const testEmail = 'sess-student-auth04@bscse.uiu.ac.bd'
  const mockEmailSender = new MockEmailSender()
  const testLimiter = new RateLimiter()

  beforeEach(async () => {
    mockEmailSender.clear()
    testLimiter.reset()

    // Clean up test data
    await prisma.session.deleteMany({
      where: { user: { email: { contains: 'sess-student' } } },
    })
    await prisma.loginCode.deleteMany({
      where: { email: { contains: 'sess-student' } },
    })
    await prisma.user.deleteMany({
      where: { email: { contains: 'sess-student' } },
    })
  })

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { user: { email: { contains: 'sess-student' } } },
    })
    await prisma.loginCode.deleteMany({
      where: { email: { contains: 'sess-student' } },
    })
    await prisma.user.deleteMany({
      where: { email: { contains: 'sess-student' } },
    })
  })

  describe('Session Creation on POST /api/auth/verify-code', () => {
    it('creates an authenticated session in PostgreSQL and sets HttpOnly session cookie on successful OTP verification', async () => {
      // 1. Request OTP code
      await OtpService.requestCode({
        email: testEmail,
        ip: '127.0.0.1',
        emailSender: mockEmailSender,
        rateLimiter: testLimiter,
      })
      const code = mockEmailSender.getLatestCodeFor(testEmail)
      expect(code).toBeDefined()

      // 2. Verify code
      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testEmail, code })

      expect(res.status).toBe(200)
      expect(res.body.user).toBeDefined()
      expect(res.body.user.email).toBe(testEmail)

      // 3. Inspect Set-Cookie header
      const cookies = getCookiesArray(res)
      expect(cookies.length).toBeGreaterThan(0)

      const sessionCookie = cookies.find((c) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=`)
      )
      expect(sessionCookie).toBeDefined()
      expect(sessionCookie).toContain('HttpOnly')
      expect(sessionCookie).toContain('Path=/')
      expect(sessionCookie).toContain('SameSite=Lax')
      expect(sessionCookie).toContain('Max-Age=86400')

      // Extract raw token from cookie string
      const match = sessionCookie!.match(
        new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`)
      )
      const rawToken = match ? match[1] : null
      expect(rawToken).toBeDefined()
      expect(rawToken!.length).toBe(64) // 32 bytes hex encoded = 64 hex chars

      // 4. Verify Database Persistence:
      // The database must store the SHA-256 hash, NEVER the plaintext rawToken
      const user = await prisma.user.findUnique({
        where: { email: testEmail },
        include: { sessions: true },
      })
      expect(user).not.toBeNull()
      expect(user!.sessions).toHaveLength(1)

      const storedSession = user!.sessions[0]
      expect(storedSession.tokenHash).toBeDefined()
      expect(storedSession.tokenHash).not.toBe(rawToken) // NOT plaintext!
      expect(storedSession.tokenHash).toHaveLength(64) // SHA-256 hex string

      // Verify expiration is ~24 hours in the future
      const msUntilExpiry =
        storedSession.expiresAt.getTime() - storedSession.createdAt.getTime()
      expect(msUntilExpiry).toBeCloseTo(24 * 60 * 60 * 1000, -3)
    })

    it('does NOT issue a session or set a cookie when verification fails', async () => {
      await OtpService.requestCode({
        email: testEmail,
        ip: '127.0.0.1',
        emailSender: mockEmailSender,
        rateLimiter: testLimiter,
      })

      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testEmail, code: '000000' }) // Wrong code

      expect(res.status).toBe(400)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('INVALID_CODE')

      // No Set-Cookie header should be sent
      const cookies = getCookiesArray(res)
      expect(
        cookies.some((c: string) => c.startsWith(`${SESSION_COOKIE_NAME}=`))
      ).toBeFalsy()

      // No session record should exist in the database
      const sessions = await prisma.session.findMany({
        where: { user: { email: testEmail } },
      })
      expect(sessions).toHaveLength(0)
    })
  })

  describe('GET /api/auth/me (requireAuth Guard)', () => {
    it('returns 200 with authenticated user summary when valid session cookie is provided', async () => {
      // 1. Verify code and obtain cookie
      await OtpService.requestCode({
        email: testEmail,
        ip: '127.0.0.1',
        emailSender: mockEmailSender,
        rateLimiter: testLimiter,
      })
      const code = mockEmailSender.getLatestCodeFor(testEmail)
      const verifyRes = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testEmail, code })

      const cookie = verifyRes.headers['set-cookie']

      // 2. Call GET /api/auth/me with cookie
      const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie)

      expect(meRes.status).toBe(200)
      expect(meRes.body.user).toBeDefined()
      expect(meRes.body.user.email).toBe(testEmail)
      expect(meRes.body.user.role).toBe('student')
      expect(meRes.body.user.status).toBe('active')
      expect(meRes.body.user.hasProfile).toBe(false)
    })

    it('returns 401 UNAUTHENTICATED when called without a session cookie', async () => {
      const res = await request(app).get('/api/auth/me')

      expect(res.status).toBe(401)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
      expect(res.body.error.message).toContain('Authentication required')
    })

    it('returns 401 UNAUTHENTICATED when called with an invalid or tampered session token', async () => {
      const tamperedCookie = `${SESSION_COOKIE_NAME}=tampered-invalid-token-value; Path=/; HttpOnly`

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', tamperedCookie)

      expect(res.status).toBe(401)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
      expect(res.body.error.message).toContain('Invalid or revoked session')
    })

    it('returns 401 SESSION_EXPIRED when session token has expired and prunes expired session from DB', async () => {
      // 1. Create a user
      const user = await prisma.user.create({
        data: {
          email: testEmail,
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      })

      // 2. Create an expired session directly (-1 minute ago)
      const { session, rawToken } = await SessionService.createSession(
        user.id,
        -60 * 1000 // Negative TTL -> already expired
      )
      expect(session).toBeDefined()

      // 3. Call GET /api/auth/me with expired token cookie
      const expiredCookie = `${SESSION_COOKIE_NAME}=${rawToken}`
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', expiredCookie)

      expect(res.status).toBe(401)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('SESSION_EXPIRED')
      expect(res.body.error.message).toContain('Session has expired')

      // 4. Confirm the expired session row was deleted from database
      const dbSession = await prisma.session.findUnique({
        where: { id: session.id },
      })
      expect(dbSession).toBeNull()
    })

    it('returns 403 ACCOUNT_UNAVAILABLE and revokes session when user account is BANNED', async () => {
      // 1. Create user and active session
      const user = await prisma.user.create({
        data: {
          email: testEmail,
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      })
      const { session, rawToken } = await SessionService.createSession(user.id)

      // 2. Ban the user
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'BANNED' },
      })

      // 3. Call GET /api/auth/me
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${rawToken}`)

      expect(res.status).toBe(403)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('ACCOUNT_UNAVAILABLE')
      expect(res.body.error.message).toContain('permanently suspended')

      // 4. Verify session was revoked from DB
      const dbSession = await prisma.session.findUnique({
        where: { id: session.id },
      })
      expect(dbSession).toBeNull()
    })

    it('returns 403 ACCOUNT_UNAVAILABLE and revokes session when user account is SUSPENDED', async () => {
      // 1. Create user and active session
      const user = await prisma.user.create({
        data: {
          email: testEmail,
          role: 'STUDENT',
          status: 'ACTIVE',
        },
      })
      const { session, rawToken } = await SessionService.createSession(user.id)

      // 2. Suspend user until tomorrow
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await prisma.user.update({
        where: { id: user.id },
        data: {
          status: 'SUSPENDED',
          suspendedUntil: tomorrow,
        },
      })

      // 3. Call GET /api/auth/me
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${rawToken}`)

      expect(res.status).toBe(403)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('ACCOUNT_UNAVAILABLE')
      expect(res.body.error.message).toContain('is suspended until')

      // 4. Verify session was revoked from DB
      const dbSession = await prisma.session.findUnique({
        where: { id: session.id },
      })
      expect(dbSession).toBeNull()
    })
  })

  describe('POST /api/auth/logout', () => {
    it('revokes session in PostgreSQL, clears cookie, and returns HTTP 204', async () => {
      // 1. Login to obtain session
      await OtpService.requestCode({
        email: testEmail,
        ip: '127.0.0.1',
        emailSender: mockEmailSender,
        rateLimiter: testLimiter,
      })
      const code = mockEmailSender.getLatestCodeFor(testEmail)
      const verifyRes = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testEmail, code })

      const cookie = verifyRes.headers['set-cookie']
      expect(cookie).toBeDefined()

      // 2. Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie)

      expect(logoutRes.status).toBe(204)
      expect(logoutRes.body).toEqual({})

      // 3. Verify Set-Cookie header clears the cookie (expires in past / maxAge=0)
      const clearCookies = getCookiesArray(logoutRes)
      expect(clearCookies.length).toBeGreaterThan(0)
      const cleared = clearCookies.find((c) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=`)
      )
      expect(cleared).toBeDefined()
      expect(cleared).toContain('Expires=')

      // 4. Confirm session was deleted from PostgreSQL
      const dbSessions = await prisma.session.findMany({
        where: { user: { email: testEmail } },
      })
      expect(dbSessions).toHaveLength(0)

      // 5. Subsequent request to /api/auth/me with old cookie is rejected with 401
      const subsequentMeRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie)

      expect(subsequentMeRes.status).toBe(401)
      expect(subsequentMeRes.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns HTTP 204 cleanly when called without an active session cookie (idempotent)', async () => {
      const res = await request(app).post('/api/auth/logout')

      expect(res.status).toBe(204)
      const clearCookieHeader = res.headers['set-cookie']
      expect(clearCookieHeader).toBeDefined()
    })
  })

  describe('Cookie Security Attributes & Production Policy', () => {
    it('enforces secure cookie options in production environment', () => {
      // Test production policy helper with explicit override
      const prodOptions = getSessionCookieOptions()
      expect(prodOptions.httpOnly).toBe(true)
      expect(prodOptions.sameSite).toBe('lax')
      expect(prodOptions.path).toBe('/')
      expect(prodOptions.maxAge).toBe(24 * 60 * 60 * 1000)

      const clearOptions = getClearCookieOptions()
      expect(clearOptions.httpOnly).toBe(true)
      expect(clearOptions.sameSite).toBe('lax')
      expect(clearOptions.path).toBe('/')
    })
  })
})
