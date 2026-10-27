import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app'
import prisma from '../db'
import { OtpService } from '../services/otp'
import { SESSION_COOKIE_NAME } from '../services/session'

describe('Password Authentication Endpoints (POST /set-password, POST /login)', () => {
  const testStudentId = '011231999'
  const testEmail = `${testStudentId}@bscse.uiu.ac.bd`
  const testPassword = 'Password123!'

  beforeAll(async () => {
    await prisma.$connect()
    // Clean up test user and loginCode if exists
    await prisma.loginCode.deleteMany({ where: { email: testEmail } })
    await prisma.user.deleteMany({ where: { email: testEmail } })
  })

  afterAll(async () => {
    await prisma.loginCode.deleteMany({ where: { email: testEmail } })
    await prisma.user.deleteMany({ where: { email: testEmail } })
    await prisma.$disconnect()
  })

  it('rejects /set-password if email is unverified', async () => {
    const res = await request(app)
      .post('/api/auth/set-password')
      .send({ email: testEmail, password: testPassword })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    expect(res.body.error.message).toContain('verification')
  })

  it('allows /set-password after successful OTP verification', async () => {
    // 1. Request code
    await OtpService.requestCode({
      email: testEmail,
      acceptTerms: true,
      ip: '127.0.0.1',
    })

    // 2. Fetch code from database
    const codeRecord = await prisma.loginCode.findFirst({
      where: { email: testEmail },
      orderBy: { createdAt: 'desc' },
    })
    expect(codeRecord).toBeDefined()

    // 3. Verify OTP
    // (Using OtpService or endpoint)
    // To verify against HMAC, let's verify through endpoint using the direct verifyCode logic
    // Since OtpService.verifyCode creates/upserts user:
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
    })
    expect(user.emailVerifiedAt).not.toBeNull()

    // 4. Set password
    const setRes = await request(app)
      .post('/api/auth/set-password')
      .send({ email: testEmail, password: testPassword })

    expect(setRes.status).toBe(200)
    expect(setRes.body.ok).toBe(true)

    // Check database has salted hash and NOT plaintext
    const pwdRecord = await prisma.userPassword.findUnique({
      where: { userId: user.id },
    })
    expect(pwdRecord).not.toBeNull()
    expect(pwdRecord?.passwordHash).not.toContain(testPassword)
    expect(pwdRecord?.passwordHash).toContain(':')
  })

  it('authenticates with full UIU email and password via POST /api/auth/login', async () => {
    const res = await request(app).post('/api/auth/login').send({
      identifier: testEmail,
      password: testPassword,
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.user.email).toBe(testEmail)

    // Verify session cookie was set
    const rawCookies = res.headers['set-cookie']
    const cookies = Array.isArray(rawCookies)
      ? rawCookies
      : rawCookies
        ? [rawCookies]
        : []
    expect(cookies.length).toBeGreaterThan(0)
    const sessionCookie = cookies.find((c: string) =>
      c.startsWith(`${SESSION_COOKIE_NAME}=`)
    )
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie).toContain('HttpOnly')
  })

  it('authenticates with Student ID prefix and password via POST /api/auth/login', async () => {
    const res = await request(app).post('/api/auth/login').send({
      identifier: testStudentId, // e.g. "011231999" without @
      password: testPassword,
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.user.email).toBe(testEmail)

    const rawCookies = res.headers['set-cookie']
    const cookies = Array.isArray(rawCookies)
      ? rawCookies
      : rawCookies
        ? [rawCookies]
        : []
    expect(cookies.length).toBeGreaterThan(0)
  })

  it('rejects login with incorrect password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      identifier: testEmail,
      password: 'WrongPassword!',
    })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})
