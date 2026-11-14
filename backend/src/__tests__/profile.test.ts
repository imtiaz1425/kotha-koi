import http from 'http'
import { AddressInfo } from 'net'
import request from 'supertest'
import { io as Client, Socket as ClientSocket } from 'socket.io-client'
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
import app from '../app'
import prisma from '../db'
import { SessionService, SESSION_COOKIE_NAME } from '../services/session'
import {
  initSocketServer,
  clearActiveSockets,
  TypedServer,
  MatchFoundPayload,
  QueueAckResponse,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('Profile Management & Nickname Synchronization', () => {
  let httpServer: http.Server
  let ioServer: TypedServer
  let port: number
  const openClients: ClientSocket[] = []
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
    for (const client of openClients) {
      if (client.connected) {
        client.disconnect()
      }
    }

    await new Promise<void>((resolve) => {
      ioServer.close(() => {
        httpServer.close(() => resolve())
      })
    })

    if (testUserEmails.length > 0) {
      const users = await prisma.user.findMany({
        where: { email: { in: testUserEmails } },
        select: { id: true },
      })
      const userIds = users.map((u) => u.id)

      await prisma.profile.deleteMany({
        where: { userId: { in: userIds } },
      })

      await prisma.session.deleteMany({
        where: { userId: { in: userIds } },
      })

      await prisma.chatSession.deleteMany({
        where: {
          OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }],
        },
      })

      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      })
    }

    await prisma.$disconnect()
  })

  beforeEach(() => {
    clearActiveSockets()
    MatchingService.clearAll()
  })

  afterEach(() => {
    for (const client of openClients) {
      if (client.connected) {
        client.disconnect()
      }
    }
    openClients.length = 0
  })

  function createClient(cookieStr: string): ClientSocket {
    const client = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
      extraHeaders: { cookie: cookieStr },
    })
    openClients.push(client)
    return client
  }

  async function createTestUser() {
    const uniqueId = `prof_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    const email = `${uniqueId}@bscse.uiu.ac.bd`
    testUserEmails.push(email)

    const user = await prisma.user.create({
      data: {
        email,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
    })

    const { rawToken } = await SessionService.createSession(user.id)
    return { user, rawToken }
  }

  it('GET /api/profile — returns 401 UNAUTHENTICATED without session cookie', async () => {
    const res = await request(app).get('/api/profile')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('PUT /api/profile — validates nickname length (min 2, max 20)', async () => {
    const { rawToken } = await createTestUser()
    const cookie = `${SESSION_COOKIE_NAME}=${rawToken}`

    // Empty nickname
    const resEmpty = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ nickname: '   ' })
    expect(resEmpty.status).toBe(400)
    expect(resEmpty.body.error.code).toBe('VALIDATION_FAILED')

    // Too short (< 2)
    const resShort = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ nickname: 'A' })
    expect(resShort.status).toBe(400)
    expect(resShort.body.error.code).toBe('VALIDATION_FAILED')

    // Too long (> 20)
    const resLong = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ nickname: 'ThisNicknameIsWayTooLongForKothaKoi' })
    expect(resLong.status).toBe(400)
    expect(resLong.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('PUT /api/profile — rejects attempts to modify realName with HTTP 400 VALIDATION_FAILED', async () => {
    const { rawToken } = await createTestUser()
    const cookie = `${SESSION_COOKIE_NAME}=${rawToken}`

    const resWithName = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ name: 'Hacked Name', nickname: 'CoolGuy' })

    expect(resWithName.status).toBe(400)
    expect(resWithName.body.error.code).toBe('VALIDATION_FAILED')

    const resWithRealName = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ realName: 'Another Name', nickname: 'CoolGuy' })

    expect(resWithRealName.status).toBe(400)
    expect(resWithRealName.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('PUT /api/profile and GET /api/profile — successfully creates and retrieves updated profile', async () => {
    const { rawToken } = await createTestUser()
    const cookie = `${SESSION_COOKIE_NAME}=${rawToken}`

    const putRes = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ nickname: 'Madani Rider', avatarPreset: 'panda' })

    expect(putRes.status).toBe(200)
    expect(putRes.body.ok).toBe(true)
    expect(putRes.body.nickname).toBe('Madani Rider')
    expect(putRes.body.avatarPreset).toBe('panda')

    const getRes = await request(app).get('/api/profile').set('Cookie', cookie)

    expect(getRes.status).toBe(200)
    expect(getRes.body.nickname).toBe('Madani Rider')
    expect(getRes.body.avatarPreset).toBe('panda')
  })

  it('synchronizes updated nickname from DB to matched partner on queue:join', async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()

    // Save profile for User A
    await request(app)
      .put('/api/profile')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${userA.rawToken}`)
      .send({ nickname: 'Pixel Panda', avatarPreset: 'panda' })

    // Save profile for User B
    await request(app)
      .put('/api/profile')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${userB.rawToken}`)
      .send({ nickname: 'Library Ghost', avatarPreset: 'ghost' })

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)

    await Promise.all([
      new Promise<void>((resolve) => clientA.on('connect', resolve)),
      new Promise<void>((resolve) => clientB.on('connect', resolve)),
    ])

    const matchPromiseA = new Promise<MatchFoundPayload>((resolve) => {
      clientA.on('match:found', (payload) => resolve(payload))
    })
    const matchPromiseB = new Promise<MatchFoundPayload>((resolve) => {
      clientB.on('match:found', (payload) => resolve(payload))
    })

    // User A joins queue
    await new Promise<QueueAckResponse>((resolve) => {
      clientA.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    // User B joins queue -> paired
    await new Promise<QueueAckResponse>((resolve) => {
      clientB.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    const [matchA, matchB] = await Promise.all([matchPromiseA, matchPromiseB])

    // User A sees User B's latest saved nickname
    expect(matchA.partner.nickname).toBe('Library Ghost')

    // User B sees User A's latest saved nickname
    expect(matchB.partner.nickname).toBe('Pixel Panda')
  })
})
