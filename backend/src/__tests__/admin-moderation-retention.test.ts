import request from 'supertest'
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from 'vitest'
import app from '../app'
import prisma from '../db'
import { SessionService, SESSION_COOKIE_NAME } from '../services/session'
import { hashPassword } from '../utils/password'
import { RetentionService } from '../services/retention.service'

describe('Admin Authentication, Moderation, Account Deletion & Data Retention Tests', () => {
  const testUserEmails: string[] = []

  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    if (testUserEmails.length > 0) {
      await prisma.moderationAction.deleteMany({
        where: {
          OR: [
            { admin: { email: { in: testUserEmails } } },
            { targetUser: { email: { in: testUserEmails } } },
          ],
        },
      })
      await prisma.report.deleteMany({
        where: {
          OR: [
            { reporter: { email: { in: testUserEmails } } },
            { reported: { email: { in: testUserEmails } } },
          ],
        },
      })
      await prisma.session.deleteMany({
        where: { user: { email: { in: testUserEmails } } },
      })
      await prisma.userPassword.deleteMany({
        where: { user: { email: { in: testUserEmails } } },
      })
      await prisma.profile.deleteMany({
        where: { user: { email: { in: testUserEmails } } },
      })
      await prisma.user.deleteMany({
        where: { email: { in: testUserEmails } },
      })
    }
    await prisma.$disconnect()
  })

  async function createTestUser(role: 'STUDENT' | 'ADMIN', prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@bscse.uiu.ac.bd`
    testUserEmails.push(email)

    const user = await prisma.user.create({
      data: {
        email,
        status: 'ACTIVE',
        role,
        emailVerifiedAt: new Date(),
        passwordAuth: {
          create: {
            passwordHash: hashPassword('AdminPass123!'),
          },
        },
        profile: {
          create: {
            currentNickname: `Nick_${Math.floor(Math.random() * 10000)}`,
            avatarPreset: 'mango',
          },
        },
      },
    })

    const { rawToken } = await SessionService.createSession(user.id)
    return { user, rawToken }
  }

  describe('Admin Authentication & RBAC', () => {
    it('allows ADMIN users to log in via /api/auth/admin-login', async () => {
      const admin = await createTestUser('ADMIN', 'admin-login-test')

      const res = await request(app)
        .post('/api/auth/admin-login')
        .send({
          identifier: admin.user.email,
          password: 'AdminPass123!',
        })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.user.role).toBe('admin')
    })

    it('rejects STUDENT accounts from /api/auth/admin-login with 403 FORBIDDEN', async () => {
      const student = await createTestUser('STUDENT', 'student-admin-attempt')

      const res = await request(app)
        .post('/api/auth/admin-login')
        .send({
          identifier: student.user.email,
          password: 'AdminPass123!',
        })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('guards /api/admin/* endpoints with requireAdmin middleware', async () => {
      const student = await createTestUser('STUDENT', 'student-guarded')

      const res = await request(app)
        .get('/api/admin/overview')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${student.rawToken}`)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('allows authenticated admins to view the admin overview metrics', async () => {
      const admin = await createTestUser('ADMIN', 'admin-overview')

      const res = await request(app)
        .get('/api/admin/overview')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${admin.rawToken}`)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.stats).toBeDefined()
      expect(res.body.stats.totalUsers).toBeGreaterThan(0)
    })
  })

  describe('Moderation Actions (Warn, Suspend, Ban, Unban)', () => {
    it('executes BAN action on target user and revokes their sessions', async () => {
      const admin = await createTestUser('ADMIN', 'admin-mod-ban')
      const target = await createTestUser('STUDENT', 'target-to-ban')

      const res = await request(app)
        .post(`/api/admin/users/${target.user.id}/moderate`)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${admin.rawToken}`)
        .send({
          action: 'BAN',
          reason: 'Severe terms violation',
        })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)

      // Verify user status in DB
      const updatedTarget = await prisma.user.findUnique({
        where: { id: target.user.id },
      })
      expect(updatedTarget!.status).toBe('BANNED')

      // Verify active session was revoked
      const activeSessions = await prisma.session.findMany({
        where: { userId: target.user.id },
      })
      expect(activeSessions.length).toBe(0)
    })

    it('executes SUSPEND action with duration and expiration timestamp', async () => {
      const admin = await createTestUser('ADMIN', 'admin-mod-suspend')
      const target = await createTestUser('STUDENT', 'target-to-suspend')

      const res = await request(app)
        .post(`/api/admin/users/${target.user.id}/moderate`)
        .set('Cookie', `${SESSION_COOKIE_NAME}=${admin.rawToken}`)
        .send({
          action: 'SUSPEND',
          reason: 'Spamming in video sessions',
          durationHours: 48,
        })

      expect(res.status).toBe(200)
      const updatedTarget = await prisma.user.findUnique({
        where: { id: target.user.id },
      })
      expect(updatedTarget!.status).toBe('SUSPENDED')
      expect(updatedTarget!.suspendedUntil).toBeDefined()
    })
  })

  describe('Account Deletion & Privacy (Phase 5)', () => {
    it('requires explicit confirmation to delete account', async () => {
      const user = await createTestUser('STUDENT', 'user-to-del-unconfirmed')

      const res = await request(app)
        .delete('/api/profile')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${user.rawToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_FAILED')
    })

    it('deletes profile, sessions, credentials, and anonymizes account record', async () => {
      const user = await createTestUser('STUDENT', 'user-to-del')

      const res = await request(app)
        .delete('/api/profile')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${user.rawToken}`)
        .send({ confirmation: 'DELETE' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)

      // Verify profile is deleted
      const profile = await prisma.profile.findUnique({
        where: { userId: user.user.id },
      })
      expect(profile).toBeNull()

      // Verify credentials deleted
      const creds = await prisma.userPassword.findUnique({
        where: { userId: user.user.id },
      })
      expect(creds).toBeNull()

      // Verify sessions purged
      const sessions = await prisma.session.findMany({
        where: { userId: user.user.id },
      })
      expect(sessions.length).toBe(0)

      // Verify user record is anonymized
      const anonymizedUser = await prisma.user.findUnique({
        where: { id: user.user.id },
      })
      expect(anonymizedUser).toBeDefined()
      expect(anonymizedUser!.email).toContain('deleted_')
      expect(anonymizedUser!.name).toBeNull()
    })
  })

  describe('Data Retention Service (Phase 8)', () => {
    it('executes safe retention cleanup without deleting active data', async () => {
      // Create an expired login code
      await prisma.loginCode.create({
        data: {
          email: 'expired-code-test@bscse.uiu.ac.bd',
          codeHash: 'hash-xyz',
          expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
        },
      })

      // Run dry-run first
      const dryResult = await RetentionService.executeCleanup({ dryRun: true })
      expect(dryResult.dryRun).toBe(true)
      expect(dryResult.expiredLoginCodesCount).toBeGreaterThanOrEqual(1)

      // Run live cleanup
      const liveResult = await RetentionService.executeCleanup({ dryRun: false })
      expect(liveResult.dryRun).toBe(false)
      expect(liveResult.expiredLoginCodesCount).toBeGreaterThanOrEqual(1)

      // Verify expired code is gone
      const remainingCodes = await prisma.loginCode.findMany({
        where: { email: 'expired-code-test@bscse.uiu.ac.bd' },
      })
      expect(remainingCodes.length).toBe(0)
    })
  })
})
