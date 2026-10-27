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
  setDisconnectGracePeriodMs,
  TypedServer,
  QueueAckResponse,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('TASK-RT-02: Backend Random Text-Chat Matching Queue', () => {
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
      const users = await prisma.user.findMany({
        where: { email: { in: testUserEmails } },
        select: { id: true },
      })
      const userIds = users.map((u) => u.id)

      await prisma.block.deleteMany({
        where: {
          OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }],
        },
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
    setDisconnectGracePeriodMs(20)
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

  async function createTestUserWithProfile(
    nickname: string,
    avatarPreset: string = 'mango'
  ) {
    const uniqueId = `match_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    const email = `${uniqueId}@bscse.uiu.ac.bd`
    testUserEmails.push(email)

    const user = await prisma.user.create({
      data: {
        email,
        role: 'STUDENT',
        status: 'ACTIVE',
        profile: {
          create: {
            currentNickname: nickname,
            avatarPreset,
          },
        },
      },
      include: { profile: true },
    })

    const { rawToken } = await SessionService.createSession(user.id)
    return { user, rawToken }
  }

  it('safely pairs two distinct authenticated users via FIFO and emits match:found & session:state', async () => {
    const user1 = await createTestUserWithProfile('Alice', 'tea_cup')
    const user2 = await createTestUserWithProfile('Bob', 'mango')

    const client1 = createClient(`${SESSION_COOKIE_NAME}=${user1.rawToken}`)
    const client2 = createClient(`${SESSION_COOKIE_NAME}=${user2.rawToken}`)

    await Promise.all([
      new Promise<void>((resolve) => client1.on('connect', resolve)),
      new Promise<void>((resolve) => client2.on('connect', resolve)),
    ])

    // Client 1 joins queue first
    const client1WaitingPromise = new Promise<void>((resolve) => {
      client1.on('queue:waiting', () => resolve())
    })
    const client1StateQueuedPromise = new Promise<string>((resolve) => {
      client1.on('session:state', (payload) => {
        if (payload.state === 'QUEUED') resolve(payload.state)
      })
    })

    const joinAck1 = await new Promise<{ ok: boolean }>((resolve) => {
      client1.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    expect(joinAck1.ok).toBe(true)
    await client1WaitingPromise
    expect(await client1StateQueuedPromise).toBe('QUEUED')
    expect(MatchingService.getQueueLength()).toBe(1)

    // Setup listeners for match:found and session:state on both clients
    const client1MatchPromise = new Promise<{
      sessionId: string
      mode: string
      partner: { nickname: string; avatarPreset?: string }
    }>((resolve) => {
      client1.on('match:found', (payload) => resolve(payload))
    })
    const client1InChatStatePromise = new Promise<{
      state: string
      session?: unknown
    }>((resolve) => {
      client1.on('session:state', (payload) => {
        if (payload.state === 'IN_CHAT') resolve(payload)
      })
    })

    const client2MatchPromise = new Promise<{
      sessionId: string
      mode: string
      partner: { nickname: string; avatarPreset?: string }
    }>((resolve) => {
      client2.on('match:found', (payload) => resolve(payload))
    })
    const client2InChatStatePromise = new Promise<{
      state: string
      session?: unknown
    }>((resolve) => {
      client2.on('session:state', (payload) => {
        if (payload.state === 'IN_CHAT') resolve(payload)
      })
    })

    // Client 2 joins queue
    const joinAck2 = await new Promise<{ ok: boolean }>((resolve) => {
      client2.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })
    expect(joinAck2.ok).toBe(true)

    // Both clients receive match:found simultaneously
    const [match1, match2] = await Promise.all([
      client1MatchPromise,
      client2MatchPromise,
    ])

    expect(match1.sessionId).toBeDefined()
    expect(match1.sessionId).toBe(match2.sessionId)
    expect(match1.mode).toBe('text')
    expect(match2.mode).toBe('text')

    // Partner profiles are swapped and contain zero PII (no user IDs or emails)
    expect(match1.partner.nickname).toBe('Bob')
    expect(match1.partner.avatarPreset).toBe('mango')
    expect(match2.partner.nickname).toBe('Alice')
    expect(match2.partner.avatarPreset).toBe('tea_cup')

    // Both receive session:state (IN_CHAT)
    const [state1, state2] = await Promise.all([
      client1InChatStatePromise,
      client2InChatStatePromise,
    ])
    expect(state1.state).toBe('IN_CHAT')
    expect(state2.state).toBe('IN_CHAT')

    // Verify database chat_sessions record
    const dbSession = await prisma.chatSession.findUnique({
      where: { id: match1.sessionId },
    })
    expect(dbSession).toBeDefined()
    expect(dbSession?.mode).toBe('TEXT')
    expect([user1.user.id, user2.user.id]).toContain(dbSession?.userAId)
    expect([user1.user.id, user2.user.id]).toContain(dbSession?.userBId)

    // Queue is now empty
    expect(MatchingService.getQueueLength()).toBe(0)
  })

  it('allows cancellation of waiting state via queue:leave and resets to IDLE', async () => {
    const user = await createTestUserWithProfile('Charlie')
    const client = createClient(`${SESSION_COOKIE_NAME}=${user.rawToken}`)

    await new Promise<void>((resolve) => client.on('connect', resolve))

    await new Promise<{ ok: boolean }>((resolve) => {
      client.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })
    expect(MatchingService.getQueueLength()).toBe(1)
    expect(MatchingService.getUserState(user.user.id)).toBe('QUEUED')

    const stateIdlePromise = new Promise<string>((resolve) => {
      client.on('session:state', (payload) => {
        if (payload.state === 'IDLE') resolve(payload.state)
      })
    })

    const leaveAck = await new Promise<{ ok: boolean }>((resolve) => {
      client.emit('queue:leave', {}, (ack: QueueAckResponse) => resolve(ack))
    })

    expect(leaveAck.ok).toBe(true)
    expect(await stateIdlePromise).toBe('IDLE')
    expect(MatchingService.getQueueLength()).toBe(0)
    expect(MatchingService.getUserState(user.user.id)).toBe('IDLE')

    // When another user joins, Charlie is not in queue so no pairing occurs
    const userOther = await createTestUserWithProfile('Dave')
    const clientOther = createClient(
      `${SESSION_COOKIE_NAME}=${userOther.rawToken}`
    )
    await new Promise<void>((resolve) => clientOther.on('connect', resolve))

    await new Promise<{ ok: boolean }>((resolve) => {
      clientOther.emit(
        'queue:join',
        { mode: 'text' },
        (ack: QueueAckResponse) => resolve(ack)
      )
    })

    expect(MatchingService.getQueueLength()).toBe(1)
    expect(MatchingService.getUserState(userOther.user.id)).toBe('QUEUED')
    expect(MatchingService.getUserState(user.user.id)).toBe('IDLE')
  })

  it('prevents duplicate queue entries for the same user (ALREADY_BUSY)', async () => {
    const user = await createTestUserWithProfile('Eve')
    const client = createClient(`${SESSION_COOKIE_NAME}=${user.rawToken}`)

    await new Promise<void>((resolve) => client.on('connect', resolve))

    const joinAck1 = await new Promise<{ ok: boolean }>((resolve) => {
      client.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })
    expect(joinAck1.ok).toBe(true)
    expect(MatchingService.getQueueLength()).toBe(1)

    // Second join attempt while already in queue
    const errorEventPromise = new Promise<{ code: string; message: string }>(
      (resolve) => {
        client.on('error', (err) => resolve(err))
      }
    )

    const joinAck2 = await new Promise<{
      ok: boolean
      error?: { code: string; message: string }
    }>((resolve) => {
      client.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    expect(joinAck2.ok).toBe(false)
    expect(joinAck2.error?.code).toBe('ALREADY_BUSY')

    const errorEvent = await errorEventPromise
    expect(errorEvent.code).toBe('ALREADY_BUSY')

    // Queue length remains 1 (no duplicate entry)
    expect(MatchingService.getQueueLength()).toBe(1)
  })

  it('prevents a user in an active chat session from re-joining queue', async () => {
    const user1 = await createTestUserWithProfile('Frank')
    const user2 = await createTestUserWithProfile('Grace')

    const client1 = createClient(`${SESSION_COOKIE_NAME}=${user1.rawToken}`)
    const client2 = createClient(`${SESSION_COOKIE_NAME}=${user2.rawToken}`)

    await Promise.all([
      new Promise<void>((resolve) => client1.on('connect', resolve)),
      new Promise<void>((resolve) => client2.on('connect', resolve)),
    ])

    // Pair user1 and user2
    const pairedPromise = new Promise<void>((resolve) => {
      client1.on('match:found', () => resolve())
    })

    client1.emit('queue:join', { mode: 'text' })
    client2.emit('queue:join', { mode: 'text' })

    await pairedPromise
    expect(MatchingService.getUserState(user1.user.id)).toBe('IN_CHAT')

    // User1 attempts to queue again while still in chat
    const duplicateJoinAck = await new Promise<{
      ok: boolean
      error?: { code: string; message: string }
    }>((resolve) => {
      client1.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    expect(duplicateJoinAck.ok).toBe(false)
    expect(duplicateJoinAck.error?.code).toBe('ALREADY_BUSY')
    expect(MatchingService.getQueueLength()).toBe(0)
  })

  it('prevents self-matching if candidate has same user ID', async () => {
    const user = await createTestUserWithProfile('SoloUser')

    // Simulate entry in queue
    const res1 = await MatchingService.joinQueue({
      userId: user.user.id,
      socketId: 'sock_1',
      mode: 'text',
      profile: { nickname: 'SoloUser', avatarPreset: 'mango' },
    })
    expect(res1.ok).toBe(true)
    if (res1.ok) {
      expect(res1.matched).toBe(false)
    }

    // Attempt to join again directly via service with same userId
    const res2 = await MatchingService.joinQueue({
      userId: user.user.id,
      socketId: 'sock_2',
      mode: 'text',
      profile: { nickname: 'SoloUser', avatarPreset: 'mango' },
    })

    expect(res2.ok).toBe(false)
    if (!res2.ok) {
      expect(res2.error.code).toBe('ALREADY_BUSY')
    }
    expect(MatchingService.getQueueLength()).toBe(1)
  })

  it('excludes users blocked in either direction from being paired', async () => {
    const userA = await createTestUserWithProfile('User_A')
    const userB = await createTestUserWithProfile('User_B')
    const userC = await createTestUserWithProfile('User_C')
    const userD = await createTestUserWithProfile('User_D')

    // Case 1: User A has blocked User B in PostgreSQL
    await prisma.block.create({
      data: {
        blockerId: userA.user.id,
        blockedId: userB.user.id,
      },
    })

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)

    await Promise.all([
      new Promise<void>((resolve) => clientA.on('connect', resolve)),
      new Promise<void>((resolve) => clientB.on('connect', resolve)),
    ])

    // User A joins
    await new Promise<{ ok: boolean }>((resolve) => {
      clientA.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })
    expect(MatchingService.getQueueLength()).toBe(1)

    // User B joins -> MUST NOT match with User A
    let userAMatchedWithB = false
    clientA.on('match:found', (payload) => {
      if (payload.partner.nickname === 'User_B') {
        userAMatchedWithB = true
      }
    })

    await new Promise<{ ok: boolean }>((resolve) => {
      clientB.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    // Both remain in queue because they are blocked!
    expect(userAMatchedWithB).toBe(false)
    expect(MatchingService.getQueueLength()).toBe(2)
    expect(MatchingService.getUserState(userA.user.id)).toBe('QUEUED')
    expect(MatchingService.getUserState(userB.user.id)).toBe('QUEUED')

    // Now User C (unblocked) joins -> User C should match with User A (FIFO first in queue)
    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)
    await new Promise<void>((resolve) => clientC.on('connect', resolve))

    const clientAMatchPromise = new Promise<{ partner: { nickname: string } }>(
      (resolve) => {
        clientA.on('match:found', (payload) => resolve(payload))
      }
    )
    const clientCMatchPromise = new Promise<{ partner: { nickname: string } }>(
      (resolve) => {
        clientC.on('match:found', (payload) => resolve(payload))
      }
    )

    await new Promise<{ ok: boolean }>((resolve) => {
      clientC.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    const [matchA, matchC] = await Promise.all([
      clientAMatchPromise,
      clientCMatchPromise,
    ])
    expect(matchA.partner.nickname).toBe('User_C')
    expect(matchC.partner.nickname).toBe('User_A')

    // User B is still in queue waiting!
    expect(MatchingService.getQueueLength()).toBe(1)
    expect(MatchingService.getUserState(userB.user.id)).toBe('QUEUED')

    // User D (unblocked) joins -> User D pairs with User B
    const clientD = createClient(`${SESSION_COOKIE_NAME}=${userD.rawToken}`)
    await new Promise<void>((resolve) => clientD.on('connect', resolve))

    const clientBMatchPromise = new Promise<{ partner: { nickname: string } }>(
      (resolve) => {
        clientB.on('match:found', (payload) => resolve(payload))
      }
    )
    const clientDMatchPromise = new Promise<{ partner: { nickname: string } }>(
      (resolve) => {
        clientD.on('match:found', (payload) => resolve(payload))
      }
    )

    await new Promise<{ ok: boolean }>((resolve) => {
      clientD.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    const [matchB, matchD] = await Promise.all([
      clientBMatchPromise,
      clientDMatchPromise,
    ])
    expect(matchB.partner.nickname).toBe('User_D')
    expect(matchD.partner.nickname).toBe('User_B')

    // Queue is now empty
    expect(MatchingService.getQueueLength()).toBe(0)
  })

  it('removes user from queue on socket disconnect', async () => {
    const user = await createTestUserWithProfile('DisconnectUser')
    const client = createClient(`${SESSION_COOKIE_NAME}=${user.rawToken}`)

    await new Promise<void>((resolve) => client.on('connect', resolve))

    await new Promise<{ ok: boolean }>((resolve) => {
      client.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })
    expect(MatchingService.getQueueLength()).toBe(1)
    expect(MatchingService.getUserState(user.user.id)).toBe('QUEUED')

    // Disconnect socket
    client.disconnect()

    // Allow disconnect event loop to process
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(MatchingService.getQueueLength()).toBe(0)
    expect(MatchingService.getUserState(user.user.id)).toBe('IDLE')
  })
})
