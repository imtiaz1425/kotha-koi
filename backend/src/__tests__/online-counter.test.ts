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
  getOnlineCount,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('Global Online-Student Counter', () => {
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

      await prisma.session.deleteMany({
        where: { userId: { in: userIds } },
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
    const uniqueId = `cnt_${Date.now()}_${Math.floor(Math.random() * 100000)}`
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

  it('GET /api/stats/online — returns current active socket count', async () => {
    expect(getOnlineCount()).toBe(0)

    const resBefore = await request(app).get('/api/stats/online')
    expect(resBefore.status).toBe(200)
    expect(resBefore.body.ok).toBe(true)
    expect(resBefore.body.count).toBe(0)

    const user1 = await createTestUser()
    const client1 = createClient(`${SESSION_COOKIE_NAME}=${user1.rawToken}`)
    await new Promise<void>((resolve) => client1.on('connect', resolve))

    expect(getOnlineCount()).toBe(1)
    const resAfter = await request(app).get('/api/stats/online')
    expect(resAfter.status).toBe(200)
    expect(resAfter.body.count).toBe(1)
  })

  it('broadcasts online:count event on connection and disconnection without exposing PII', async () => {
    const userA = await createTestUser()
    const userB = await createTestUser()

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA.on('connect', resolve))

    // Client A receives online:count when User B connects
    const countPromise = new Promise<{ count: number }>((resolve) => {
      clientA.on('online:count', (payload) => {
        // Assert only { count: number } is emitted, no PII
        expect(payload).toHaveProperty('count')
        expect(Object.keys(payload)).toEqual(['count'])
        if (payload.count === 2) {
          resolve(payload)
        }
      })
    })

    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)
    await new Promise<void>((resolve) => clientB.on('connect', resolve))

    const countPayload = await countPromise
    expect(countPayload.count).toBe(2)
    expect(getOnlineCount()).toBe(2)

    // User B disconnects -> Client A receives updated count of 1
    const disconnectCountPromise = new Promise<{ count: number }>((resolve) => {
      clientA.on('online:count', (payload) => {
        if (payload.count === 1) {
          resolve(payload)
        }
      })
    })

    clientB.disconnect()
    const afterDisconnect = await disconnectCountPromise
    expect(afterDisconnect.count).toBe(1)
    expect(getOnlineCount()).toBe(1)
  })

  it('counts each user only once when multiple sockets exist during reconnection', async () => {
    const userA = await createTestUser()

    const clientA1 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA1.on('connect', resolve))
    expect(getOnlineCount()).toBe(1)

    // Reconnecting or opening second tab for same user
    const clientA2 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA2.on('connect', resolve))

    // Active users count must remain 1
    expect(getOnlineCount()).toBe(1)

    // Let superseded socket disconnect process
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(getOnlineCount()).toBe(1)
  })
})
