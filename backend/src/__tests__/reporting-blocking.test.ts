import http from 'http'
import { AddressInfo } from 'net'
import request from 'supertest'
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest'
import app from '../app'
import prisma from '../db'
import { SessionService, SESSION_COOKIE_NAME } from '../services/session'
import {
  initSocketServer,
  clearActiveSockets,
  TypedServer,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'
import { reportRateLimiter, blockRateLimiter } from '../utils/rate-limiter'

describe('Reporting and Blocking API Integration Tests (Phase 4)', () => {
  let httpServer: http.Server
  let ioServer: TypedServer
  let port: number
  const testUserEmails: string[] = []

  beforeAll(async () => {
    await prisma.$connect()
    httpServer = http.createServer(app)
    ioServer = initSocketServer(httpServer)

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      ioServer.close(() => {
        httpServer.close(() => resolve())
      })
    })

    if (testUserEmails.length > 0) {
      await prisma.report.deleteMany({
        where: {
          reporter: { email: { in: testUserEmails } },
        },
      })
      await prisma.block.deleteMany({
        where: {
          blocker: { email: { in: testUserEmails } },
        },
      })
      await prisma.chatSession.deleteMany({
        where: {
          OR: [
            { userA: { email: { in: testUserEmails } } },
            { userB: { email: { in: testUserEmails } } },
          ],
        },
      })
      await prisma.session.deleteMany({
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

  beforeEach(() => {
    clearActiveSockets()
    MatchingService.clearAll()
    reportRateLimiter.reset()
    blockRateLimiter.reset()
  })

  async function createTestUser(emailPrefix: string) {
    const email = `${emailPrefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@bscse.uiu.ac.bd`
    testUserEmails.push(email)

    const user = await prisma.user.create({
      data: {
        email,
        status: 'ACTIVE',
        role: 'STUDENT',
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            currentNickname: `User_${Math.floor(Math.random() * 10000)}`,
            avatarPreset: 'mango',
          },
        },
      },
      include: { profile: true },
    })

    const { rawToken } = await SessionService.createSession(user.id)
    return { user, rawToken }
  }

  it('rejects unauthenticated requests to report and block', async () => {
    const reportRes = await request(app)
      .post('/api/reports')
      .send({ reason: 'HARASSMENT' })
    expect(reportRes.status).toBe(401)

    const blockRes = await request(app).post('/api/blocks').send({})
    expect(blockRes.status).toBe(401)
  })

  it('rejects reports when user is not in an active or recent chat session', async () => {
    const userA = await createTestUser('reporter-idle')

    const res = await request(app)
      .post('/api/reports')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${userA.rawToken}`)
      .send({ reason: 'HARASSMENT', details: 'No one is here' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('NOT_IN_SESSION')
  })

  it('successfully reports active chat partner and ends the session', async () => {
    const userA = await createTestUser('reporter-active')
    const userB = await createTestUser('reported-active')

    // Create a registered chat session in DB
    const dbSession = await prisma.chatSession.create({
      data: {
        mode: 'TEXT',
        userAId: userA.user.id,
        userBId: userB.user.id,
      },
    })

    // Establish active match in MatchingService
    await MatchingService.joinQueue({
      userId: userA.user.id,
      socketId: 'sock-a',
      mode: 'text',
      profile: { nickname: 'UserA', avatarPreset: 'mango' },
      autoAccept: true,
    })
    const matchRes = await MatchingService.joinQueue({
      userId: userB.user.id,
      socketId: 'sock-b',
      mode: 'text',
      profile: { nickname: 'UserB', avatarPreset: 'grape' },
      autoAccept: true,
    })

    if (!matchRes.ok) throw new Error('Queue failed')
    expect(matchRes.matched).toBe(true)
    const sessionId = matchRes.match!.sessionId

    // UserA files report against UserB
    const reportRes = await request(app)
      .post('/api/reports')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${userA.rawToken}`)
      .send({
        sessionId,
        reason: 'HARASSMENT',
        details: 'Offensive language in chat',
      })

    expect(reportRes.status).toBe(201)
    expect(reportRes.body.ok).toBe(true)
    expect(reportRes.body.reportId).toBeDefined()

    // Verify report stored in PostgreSQL
    const savedReport = await prisma.report.findUnique({
      where: { id: reportRes.body.reportId },
    })
    expect(savedReport).toBeDefined()
    expect(savedReport!.reporterId).toBe(userA.user.id)
    expect(savedReport!.reportedId).toBe(userB.user.id)
    expect(savedReport!.reason).toBe('HARASSMENT')
    expect(savedReport!.details).toBe('Offensive language in chat')

    // Verify active session was terminated
    expect(MatchingService.getActiveMatch(sessionId)).toBeUndefined()
  })

  it('prevents duplicate reports on the same chat session', async () => {
    const userA = await createTestUser('dupe-reporter')
    const userB = await createTestUser('dupe-target')

    const dbSession = await prisma.chatSession.create({
      data: {
        mode: 'TEXT',
        userAId: userA.user.id,
        userBId: userB.user.id,
      },
    })

    // First report
    const res1 = await request(app)
      .post('/api/reports')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${userA.rawToken}`)
      .send({
        sessionId: dbSession.id,
        reason: 'SPAM_OR_BOT',
      })
    expect(res1.status).toBe(201)

    // Second report on same session
    const res2 = await request(app)
      .post('/api/reports')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${userA.rawToken}`)
      .send({
        sessionId: dbSession.id,
        reason: 'SPAM_OR_BOT',
      })
    expect(res2.status).toBe(409)
    expect(res2.body.error.code).toBe('CONFLICT')
  })

  it('successfully blocks active partner and excludes them from future matchmaking', async () => {
    const userA = await createTestUser('blocker')
    const userB = await createTestUser('blocked')

    // Match them
    await MatchingService.joinQueue({
      userId: userA.user.id,
      socketId: 'sock-block-a',
      mode: 'text',
      profile: { nickname: 'Blocker', avatarPreset: 'mango' },
      autoAccept: true,
    })
    const matchRes = await MatchingService.joinQueue({
      userId: userB.user.id,
      socketId: 'sock-block-b',
      mode: 'text',
      profile: { nickname: 'Blocked', avatarPreset: 'grape' },
      autoAccept: true,
    })

    if (!matchRes.ok) throw new Error('Queue failed')
    const sessionId = matchRes.match!.sessionId

    // UserA blocks UserB
    const blockRes = await request(app)
      .post('/api/blocks')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${userA.rawToken}`)
      .send({ sessionId })

    expect(blockRes.status).toBe(200)
    expect(blockRes.body.ok).toBe(true)
    expect(blockRes.body.blockedId).toBe(userB.user.id)

    // Verify stored in DB
    const blockRecord = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: userA.user.id,
          blockedId: userB.user.id,
        },
      },
    })
    expect(blockRecord).toBeDefined()

    // Verify MatchingService exclusion
    const blockedForA = await MatchingService.loadBlockedUserIds(userA.user.id)
    const blockedForB = await MatchingService.loadBlockedUserIds(userB.user.id)
    expect(blockedForA.has(userB.user.id)).toBe(true)
    expect(blockedForB.has(userA.user.id)).toBe(true) // reciprocal exclusion!
  })
})
