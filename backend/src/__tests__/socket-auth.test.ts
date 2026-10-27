import http from 'http'
import { AddressInfo } from 'net'
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
import prisma from '../db'
import { SessionService, SESSION_COOKIE_NAME } from '../services/session'
import {
  initSocketServer,
  clearActiveSockets,
  TypedServer,
} from '../realtime/socket'

describe('TASK-RT-01: Socket.IO Server & Session Cookie Authentication', () => {
  let httpServer: http.Server
  let ioServer: TypedServer
  let port: number
  const openClients: ClientSocket[] = []
  const testUserEmails: string[] = []

  beforeAll(async () => {
    await prisma.$connect()
    httpServer = http.createServer()
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
      await prisma.user.deleteMany({
        where: { email: { in: testUserEmails } },
      })
    }

    await prisma.$disconnect()
  })

  beforeEach(() => {
    clearActiveSockets()
  })

  afterEach(() => {
    for (const client of openClients) {
      if (client.connected) {
        client.disconnect()
      }
    }
    openClients.length = 0
  })

  function createClient(cookieStr?: string): ClientSocket {
    const client = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
      extraHeaders: cookieStr ? { cookie: cookieStr } : {},
    })
    openClients.push(client)
    return client
  }

  async function createTestUser(opts?: {
    status?: 'ACTIVE' | 'BANNED' | 'SUSPENDED'
    suspendedUntil?: Date
  }) {
    const uniqueId = `sock_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const email = `${uniqueId}@bscse.uiu.ac.bd`
    testUserEmails.push(email)

    const user = await prisma.user.create({
      data: {
        email,
        role: 'STUDENT',
        status: opts?.status || 'ACTIVE',
        suspendedUntil: opts?.suspendedUntil || null,
        profile: {
          create: {
            currentNickname: `User_${uniqueId.slice(-4)}`,
            avatarPreset: 'preset_1',
          },
        },
      },
      include: { profile: true },
    })

    return user
  }

  it('rejects connection if no session cookie is provided', async () => {
    const client = createClient()

    const err = await new Promise<Error>((resolve) => {
      client.on('connect_error', (error) => {
        resolve(error)
      })
    })

    expect(err).toBeDefined()
    expect(err.message).toBe('UNAUTHENTICATED')
    expect(client.connected).toBe(false)
  })

  it('rejects connection with an invalid or unknown session token', async () => {
    const client = createClient(
      `${SESSION_COOKIE_NAME}=completely_invalid_session_token_12345`
    )

    const err = await new Promise<Error>((resolve) => {
      client.on('connect_error', (error) => {
        resolve(error)
      })
    })

    expect(err).toBeDefined()
    expect(err.message).toBe('UNAUTHENTICATED')
    expect(client.connected).toBe(false)
  })

  it('rejects connection when the session has expired', async () => {
    const user = await createTestUser()
    // Create session that expired 10 minutes ago (-600,000 ms)
    const { rawToken } = await SessionService.createSession(user.id, -600000)

    const client = createClient(`${SESSION_COOKIE_NAME}=${rawToken}`)

    const err = await new Promise<Error>((resolve) => {
      client.on('connect_error', (error) => {
        resolve(error)
      })
    })

    expect(err).toBeDefined()
    expect(err.message).toBe('SESSION_EXPIRED')
    expect(client.connected).toBe(false)
  })

  it('rejects connection when the user account status is BANNED', async () => {
    const user = await createTestUser({ status: 'BANNED' })
    const { rawToken } = await SessionService.createSession(user.id)

    const client = createClient(`${SESSION_COOKIE_NAME}=${rawToken}`)

    const err = await new Promise<Error>((resolve) => {
      client.on('connect_error', (error) => {
        resolve(error)
      })
    })

    expect(err).toBeDefined()
    expect(err.message).toBe('ACCOUNT_UNAVAILABLE')
    expect(client.connected).toBe(false)
  })

  it('rejects connection when the user account status is SUSPENDED', async () => {
    const suspendedUntil = new Date(Date.now() + 60 * 60 * 1000) // 1 hour in future
    const user = await createTestUser({
      status: 'SUSPENDED',
      suspendedUntil,
    })
    const { rawToken } = await SessionService.createSession(user.id)

    const client = createClient(`${SESSION_COOKIE_NAME}=${rawToken}`)

    const err = await new Promise<Error>((resolve) => {
      client.on('connect_error', (error) => {
        resolve(error)
      })
    })

    expect(err).toBeDefined()
    expect(err.message).toBe('ACCOUNT_UNAVAILABLE')
    expect(client.connected).toBe(false)
  })

  it('accepts connection for a valid session, attaches user data, and emits session:state IDLE', async () => {
    const user = await createTestUser()
    const { rawToken } = await SessionService.createSession(user.id)

    const client = createClient(`${SESSION_COOKIE_NAME}=${rawToken}`)

    const sessionState = await new Promise<{ state: string }>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for session:state')),
          5000
        )

        client.on('connect', () => {
          // Connected successfully
        })

        client.on('session:state', (payload) => {
          clearTimeout(timeout)
          resolve(payload)
        })

        client.on('connect_error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
      }
    )

    expect(client.connected).toBe(true)
    expect(sessionState).toEqual({ state: 'IDLE' })
  })

  it('enforces newest-socket-wins: second connection disconnects the first', async () => {
    const user = await createTestUser()
    const { rawToken } = await SessionService.createSession(user.id)

    const client1 = createClient(`${SESSION_COOKIE_NAME}=${rawToken}`)

    await new Promise<void>((resolve, reject) => {
      client1.on('connect', () => resolve())
      client1.on('connect_error', (err) => reject(err))
    })
    expect(client1.connected).toBe(true)

    // Setup listener for client1 being replaced
    const client1ReplacedPromise = new Promise<{
      code: string
      message: string
    }>((resolve) => {
      client1.on('error', (payload: { code: string; message: string }) => {
        resolve(payload)
      })
    })

    // Now connect client2 with the same session
    const client2 = createClient(`${SESSION_COOKIE_NAME}=${rawToken}`)
    await new Promise<void>((resolve, reject) => {
      client2.on('connect', () => resolve())
      client2.on('connect_error', (err) => reject(err))
    })

    expect(client2.connected).toBe(true)

    const replacementError = await client1ReplacedPromise
    expect(replacementError.code).toBe('SESSION_REPLACED')
    expect(client1.connected).toBe(false)
  })
})
