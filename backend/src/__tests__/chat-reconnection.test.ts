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
  ChatPartnerStatusPayload,
  ChatEndedPayload,
  SessionStatePayload,
  ChatMessageServerPayload,
  ChatMessageAckResponse,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('TASK-CHAT-03: Reliable Socket Reconnection & Grace Period Recovery', () => {
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
    MatchingService.clearAll()
    setDisconnectGracePeriodMs(15000)
  })

  afterEach(() => {
    for (const client of openClients) {
      if (client.connected) {
        client.disconnect()
      }
    }
    openClients.length = 0
    clearActiveSockets()
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
    const uniqueId = `recon_${Date.now()}_${Math.floor(Math.random() * 100000)}`
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

  async function pairTwoUsers(
    userA: { rawToken: string },
    userB: { rawToken: string }
  ) {
    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)

    await Promise.all([
      new Promise<void>((resolve) => clientA.on('connect', resolve)),
      new Promise<void>((resolve) => clientB.on('connect', resolve)),
    ])

    const matchPromiseA = new Promise<{ sessionId: string }>((resolve) => {
      clientA.on('match:found', (payload) => resolve(payload))
    })
    const matchPromiseB = new Promise<{ sessionId: string }>((resolve) => {
      clientB.on('match:found', (payload) => resolve(payload))
    })

    await new Promise<{ ok: boolean }>((resolve) => {
      clientA.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })
    await new Promise<{ ok: boolean }>((resolve) => {
      clientB.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    const [matchA, matchB] = await Promise.all([matchPromiseA, matchPromiseB])
    expect(matchA.sessionId).toBe(matchB.sessionId)

    return {
      clientA,
      clientB,
      sessionId: matchA.sessionId,
    }
  }

  it('active chat recovery: user reconnects in time, partner is notified, and messages resume', async () => {
    // Set 2000ms grace period for test
    setDisconnectGracePeriodMs(2000)

    const userA = await createTestUserWithProfile('Alice')
    const userB = await createTestUserWithProfile('Bob')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const partnerReconnectingPromise = new Promise<ChatPartnerStatusPayload>(
      (resolve) => {
        clientB.on('chat:partner_status', (payload) => {
          if (payload.status === 'reconnecting') resolve(payload)
        })
      }
    )

    // 1. User A disconnects unexpectedly
    clientA.disconnect()

    // 2. User B receives 'reconnecting' status
    const reconnectingPayload = await partnerReconnectingPromise
    expect(reconnectingPayload.sessionId).toBe(sessionId)
    expect(reconnectingPayload.status).toBe('reconnecting')

    // 3. User B sets up listener for 'back' status
    const partnerBackPromise = new Promise<ChatPartnerStatusPayload>(
      (resolve) => {
        clientB.on('chat:partner_status', (payload) => {
          if (payload.status === 'back') resolve(payload)
        })
      }
    )

    // 4. User A reconnects with new socket within grace period
    const clientA2 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const restoredStatePromise = new Promise<SessionStatePayload>((resolve) => {
      clientA2.on('session:state', (payload) => {
        if (payload.state === 'IN_CHAT') resolve(payload)
      })
    })

    const [restoredState, backPayload] = await Promise.all([
      restoredStatePromise,
      partnerBackPromise,
    ])

    expect(restoredState.state).toBe('IN_CHAT')
    expect(restoredState.session?.sessionId).toBe(sessionId)
    expect(backPayload.status).toBe('back')

    // 5. Test message delivery in both directions on reconnected socket
    const messagePromiseA = new Promise<ChatMessageServerPayload>((resolve) => {
      clientA2.on('chat:message', (payload) => resolve(payload))
    })

    const ackB = await new Promise<ChatMessageAckResponse>((resolve) => {
      clientB.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: 'msg_from_b',
          text: 'Welcome back Alice!',
        },
        (res: ChatMessageAckResponse) => resolve(res)
      )
    })
    expect(ackB.ok).toBe(true)

    const receivedByA = await messagePromiseA
    expect(receivedByA.text).toBe('Welcome back Alice!')

    // User A sends message from reconnected socket
    const messagePromiseB = new Promise<ChatMessageServerPayload>((resolve) => {
      clientB.on('chat:message', (payload) => resolve(payload))
    })

    const ackA = await new Promise<ChatMessageAckResponse>((resolve) => {
      clientA2.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: 'msg_from_a',
          text: 'Glad to be back Bob!',
        },
        (res: ChatMessageAckResponse) => resolve(res)
      )
    })
    expect(ackA.ok).toBe(true)

    const receivedByB = await messagePromiseB
    expect(receivedByB.text).toBe('Glad to be back Bob!')
  })

  it('grace-period expiry: ends match with DISCONNECT_TIMEOUT and notifies partner', async () => {
    // Set 150ms grace period for fast deterministic testing
    setDisconnectGracePeriodMs(150)

    const userA = await createTestUserWithProfile('TimeoutA')
    const userB = await createTestUserWithProfile('WaitingB')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const partnerEndedPromise = new Promise<ChatEndedPayload>((resolve) => {
      clientB.on('chat:ended', (payload) => resolve(payload))
    })
    const partnerStatePromise = new Promise<SessionStatePayload>((resolve) => {
      clientB.on('session:state', (payload) => {
        if (payload.state === 'IDLE') resolve(payload)
      })
    })

    // User A disconnects
    clientA.disconnect()

    // Wait for grace period to expire
    const partnerEnded = await partnerEndedPromise
    expect(partnerEnded.sessionId).toBe(sessionId)
    expect(partnerEnded.reason).toBe('partner_disconnected')

    const partnerState = await partnerStatePromise
    expect(partnerState.state).toBe('IDLE')

    // Verify PostgreSQL has DISCONNECT_TIMEOUT
    const sessionInDb = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    })
    expect(sessionInDb?.endedReason).toBe('DISCONNECT_TIMEOUT')
  })

  it('stale session synchronization: reconnecting after session ended restores IDLE cleanly', async () => {
    setDisconnectGracePeriodMs(150)

    const userA = await createTestUserWithProfile('StaleA')
    const userB = await createTestUserWithProfile('StaleB')

    const { clientA, sessionId } = await pairTwoUsers(userA, userB)

    // User A disconnects
    clientA.disconnect()

    // Wait for grace period to expire so session ends
    await new Promise((r) => setTimeout(r, 250))

    expect(MatchingService.getActiveMatch(sessionId)).toBeUndefined()
    expect(MatchingService.getUserState(userA.user.id)).toBe('IDLE')

    // Now User A reconnects with new socket
    const clientA2 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const statePromise = new Promise<SessionStatePayload>((resolve) => {
      clientA2.on('session:state', (payload) => resolve(payload))
    })

    const state = await statePromise
    expect(state.state).toBe('IDLE')
    expect(state.session).toBeUndefined()
  })

  it('queue recovery: preserves FIFO position during grace period and updates socket ID on reconnect', async () => {
    setDisconnectGracePeriodMs(2000)

    const userA = await createTestUserWithProfile('QueueA')
    const userB = await createTestUserWithProfile('QueueB')
    const userC = await createTestUserWithProfile('QueueC')

    // Prevent User A and User B from pairing via block exclusion
    await prisma.block.create({
      data: {
        blockerId: userA.user.id,
        blockedId: userB.user.id,
      },
    })

    // User A connects and joins queue
    const clientA1 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA1.on('connect', resolve))
    await new Promise<{ ok: boolean }>((resolve) => {
      clientA1.emit('queue:join', { mode: 'text' }, (res: QueueAckResponse) =>
        resolve(res)
      )
    })
    expect(MatchingService.getQueueLength()).toBe(1)

    // User A disconnects temporarily
    clientA1.disconnect()

    // FIFO check: User B joins while User A is disconnected
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)
    await new Promise<void>((resolve) => clientB.on('connect', resolve))
    await new Promise<{ ok: boolean }>((resolve) => {
      clientB.emit('queue:join', { mode: 'text' }, (res: QueueAckResponse) =>
        resolve(res)
      )
    })

    // Queue has 2 entries: User A first, User B second
    expect(MatchingService.getQueueLength()).toBe(2)
    expect(MatchingService.getQueueEntry(userA.user.id)).toBeDefined()

    // User A reconnects with clientA2 within grace period
    const clientA2 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const queuedStatePromise = new Promise<SessionStatePayload>((resolve) => {
      clientA2.on('session:state', (payload) => {
        if (payload.state === 'QUEUED') resolve(payload)
      })
    })

    await queuedStatePromise

    // Queue length must still be 2 (NO DUPLICATION)
    expect(MatchingService.getQueueLength()).toBe(2)
    const entryA = MatchingService.getQueueEntry(userA.user.id)
    expect(entryA?.socketId).toBe(clientA2.id)

    // When User C joins, User A (at head of FIFO queue) is paired with User C!
    const matchPromiseA = new Promise<{ sessionId: string }>((resolve) => {
      clientA2.on('match:found', (payload) => resolve(payload))
    })
    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)
    await new Promise<void>((resolve) => clientC.on('connect', resolve))
    await new Promise<{ ok: boolean }>((resolve) => {
      clientC.emit('queue:join', { mode: 'text' }, (res: QueueAckResponse) =>
        resolve(res)
      )
    })

    const matchA = await matchPromiseA
    expect(matchA.sessionId).toBeDefined()
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
  })

  it('queue grace-period expiry: evicts user from queue if grace period expires', async () => {
    setDisconnectGracePeriodMs(150)

    const userA = await createTestUserWithProfile('EvictA')
    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA.on('connect', resolve))
    await new Promise<{ ok: boolean }>((resolve) => {
      clientA.emit('queue:join', { mode: 'text' }, (res: QueueAckResponse) =>
        resolve(res)
      )
    })

    expect(MatchingService.getQueueLength()).toBe(1)

    // User A disconnects
    clientA.disconnect()

    // Wait for queue grace period to expire
    await new Promise((r) => setTimeout(r, 250))

    expect(MatchingService.getQueueLength()).toBe(0)
    expect(MatchingService.getUserState(userA.user.id)).toBe('IDLE')
  })

  it('duplicate queue prevention: reconnecting updates queue socket ID and prevents duplicate entries', async () => {
    const userA = await createTestUserWithProfile('IdempotentA')
    const clientA1 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA1.on('connect', resolve))
    await new Promise<{ ok: boolean }>((resolve) => {
      clientA1.emit('queue:join', { mode: 'text' }, (res: QueueAckResponse) =>
        resolve(res)
      )
    })
    expect(MatchingService.getQueueLength()).toBe(1)
    expect(MatchingService.getQueueEntry(userA.user.id)?.socketId).toBe(
      clientA1.id
    )

    // User A1 disconnects abruptly
    clientA1.disconnect()

    // Reconnecting client connects with the same user session
    const clientA2 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const statePromise = new Promise<SessionStatePayload>((resolve) => {
      clientA2.on('session:state', (payload) => resolve(payload))
    })
    await new Promise<void>((resolve) => clientA2.on('connect', resolve))

    // Reconnection automatically synchronizes QUEUED state and updates socket ID in queue
    const restoredState = await statePromise
    expect(restoredState.state).toBe('QUEUED')
    expect(MatchingService.getQueueLength()).toBe(1)
    expect(MatchingService.getQueueEntry(userA.user.id)?.socketId).toBe(
      clientA2.id
    )

    // If client attempts a redundant queue:join, it is rejected with ALREADY_BUSY rather than duplicating
    const joinAck2 = await new Promise<QueueAckResponse>((resolve) => {
      clientA2.emit('queue:join', { mode: 'text' }, (res: QueueAckResponse) =>
        resolve(res)
      )
    })

    expect(joinAck2.ok).toBe(false)
    expect(joinAck2.error?.code).toBe('ALREADY_BUSY')
    expect(MatchingService.getQueueLength()).toBe(1)
  })

  it('superseded socket disconnect: disconnect of replaced socket does not alter active session or start timers', async () => {
    setDisconnectGracePeriodMs(500)

    const userA = await createTestUserWithProfile('SuperA')
    const userB = await createTestUserWithProfile('SuperB')

    const { clientB, sessionId } = await pairTwoUsers(userA, userB)

    let partnerReconnectingEmitted = false
    clientB.on('chat:partner_status', (payload: ChatPartnerStatusPayload) => {
      if (payload.status === 'reconnecting') {
        partnerReconnectingEmitted = true
      }
    })

    // User A connects a new socket (supersedes clientA)
    const clientA2 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA2.on('connect', resolve))

    // Wait briefly for clientA's disconnect to process
    await new Promise((r) => setTimeout(r, 100))

    // The superseded disconnect must NOT trigger a partner 'reconnecting' status
    expect(partnerReconnectingEmitted).toBe(false)

    // The active match must remain IN_CHAT
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getActiveMatch(sessionId)).toBeDefined()
  })
})
