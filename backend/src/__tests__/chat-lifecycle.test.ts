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
  ChatLifecycleAckResponse,
  ChatEndedPayload,
  SessionStatePayload,
  MatchFoundPayload,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('TASK-RT-04: Chat Session Lifecycle (Next, End, Partner-Left & State Isolation)', () => {
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
    setDisconnectGracePeriodMs(100)
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
    const uniqueId = `life_${Date.now()}_${Math.floor(Math.random() * 100000)}`
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

  it('chat:skip — safely ends match, notifies partner (partner_skipped), and re-queues initiator', async () => {
    const userA = await createTestUserWithProfile('Alice')
    const userB = await createTestUserWithProfile('Bob')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const partnerEndedPromise = new Promise<ChatEndedPayload>((resolve) => {
      clientB.on('chat:ended', (payload) => resolve(payload))
    })
    const partnerStatePromise = new Promise<SessionStatePayload>((resolve) => {
      clientB.on('session:state', (payload) => resolve(payload))
    })
    const initiatorEndedPromise = new Promise<ChatEndedPayload>((resolve) => {
      clientA.on('chat:ended', (payload) => resolve(payload))
    })
    const initiatorQueuedPromise = new Promise<SessionStatePayload>(
      (resolve) => {
        clientA.on('session:state', (payload) => resolve(payload))
      }
    )

    // User A skips
    const ack = await new Promise<ChatLifecycleAckResponse>((resolve) => {
      clientA.emit(
        'chat:skip',
        { sessionId },
        (res: ChatLifecycleAckResponse) => resolve(res)
      )
    })

    expect(ack.ok).toBe(true)

    // Partner receives partner_skipped and IDLE state
    const partnerEnded = await partnerEndedPromise
    expect(partnerEnded.sessionId).toBe(sessionId)
    expect(partnerEnded.reason).toBe('partner_skipped')

    const partnerState = await partnerStatePromise
    expect(partnerState.state).toBe('IDLE')

    // Initiator receives you_ended and is re-queued (QUEUED)
    const initiatorEnded = await initiatorEndedPromise
    expect(initiatorEnded.sessionId).toBe(sessionId)
    expect(initiatorEnded.reason).toBe('you_ended')

    const initiatorState = await initiatorQueuedPromise
    expect(initiatorState.state).toBe('QUEUED')

    // Verify session in database is updated
    const sessionInDb = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    })
    expect(sessionInDb?.endedReason).toBe('SKIP')
    expect(sessionInDb?.endedByUserId).toBe(userA.user.id)
    expect(sessionInDb?.endedAt).not.toBeNull()
  })

  it('chat:skip — immediately pairs initiator with next waiting queue candidate', async () => {
    const userA = await createTestUserWithProfile('Skipper')
    const userB = await createTestUserWithProfile('Partner')
    const userC = await createTestUserWithProfile('WaitingPeer')

    const { clientA, sessionId } = await pairTwoUsers(userA, userB)

    // User C is waiting in queue
    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)
    await new Promise<void>((resolve) => clientC.on('connect', resolve))
    await new Promise<{ ok: boolean }>((resolve) => {
      clientC.emit('queue:join', { mode: 'text' }, (ack: QueueAckResponse) =>
        resolve(ack)
      )
    })

    const newMatchPromiseA = new Promise<MatchFoundPayload>((resolve) => {
      clientA.on('match:found', (payload) => resolve(payload))
    })
    const newMatchPromiseC = new Promise<MatchFoundPayload>((resolve) => {
      clientC.on('match:found', (payload) => resolve(payload))
    })

    // User A skips session with B
    const ack = await new Promise<ChatLifecycleAckResponse>((resolve) => {
      clientA.emit(
        'chat:skip',
        { sessionId },
        (res: ChatLifecycleAckResponse) => resolve(res)
      )
    })
    expect(ack.ok).toBe(true)

    // User A and User C are paired immediately!
    const [matchA, matchC] = await Promise.all([
      newMatchPromiseA,
      newMatchPromiseC,
    ])
    expect(matchA.sessionId).toBe(matchC.sessionId)
    expect(matchA.sessionId).not.toBe(sessionId)
    expect(matchA.partner.nickname).toBe('WaitingPeer')
    expect(matchC.partner.nickname).toBe('Skipper')
  })

  it('chat:end — cleanly terminates match without automatically rejoining queue', async () => {
    const userA = await createTestUserWithProfile('EnderA')
    const userB = await createTestUserWithProfile('EnderB')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const partnerEndedPromise = new Promise<ChatEndedPayload>((resolve) => {
      clientB.on('chat:ended', (payload) => resolve(payload))
    })
    const partnerStatePromise = new Promise<SessionStatePayload>((resolve) => {
      clientB.on('session:state', (payload) => resolve(payload))
    })
    const initiatorEndedPromise = new Promise<ChatEndedPayload>((resolve) => {
      clientA.on('chat:ended', (payload) => resolve(payload))
    })
    const initiatorStatePromise = new Promise<SessionStatePayload>(
      (resolve) => {
        clientA.on('session:state', (payload) => resolve(payload))
      }
    )

    // User A ends chat
    const ack = await new Promise<ChatLifecycleAckResponse>((resolve) => {
      clientA.emit('chat:end', { sessionId }, (res: ChatLifecycleAckResponse) =>
        resolve(res)
      )
    })

    expect(ack.ok).toBe(true)

    // Partner receives partner_left and IDLE state
    const partnerEnded = await partnerEndedPromise
    expect(partnerEnded.sessionId).toBe(sessionId)
    expect(partnerEnded.reason).toBe('partner_left')
    expect((await partnerStatePromise).state).toBe('IDLE')

    // Initiator receives you_ended and IDLE state (NOT re-queued)
    const initiatorEnded = await initiatorEndedPromise
    expect(initiatorEnded.sessionId).toBe(sessionId)
    expect(initiatorEnded.reason).toBe('you_ended')
    expect((await initiatorStatePromise).state).toBe('IDLE')

    // Check queue is empty and both users are IDLE
    expect(MatchingService.getQueueLength()).toBe(0)
    expect(MatchingService.getUserState(userA.user.id)).toBe('IDLE')
    expect(MatchingService.getUserState(userB.user.id)).toBe('IDLE')

    // Check database
    const sessionInDb = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    })
    expect(sessionInDb?.endedReason).toBe('END')
    expect(sessionInDb?.endedByUserId).toBe(userA.user.id)
  })

  it('handles partner disconnect — notifies remaining partner (partner_disconnected) and resets to IDLE', async () => {
    const userA = await createTestUserWithProfile('DisconnectA')
    const userB = await createTestUserWithProfile('RemainingB')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const partnerEndedPromise = new Promise<ChatEndedPayload>((resolve) => {
      clientB.on('chat:ended', (payload) => resolve(payload))
    })
    const partnerStatePromise = new Promise<SessionStatePayload>((resolve) => {
      clientB.on('session:state', (payload) => resolve(payload))
    })

    // User A disconnects abruptly
    clientA.disconnect()

    const partnerEnded = await partnerEndedPromise
    expect(partnerEnded.sessionId).toBe(sessionId)
    expect(partnerEnded.reason).toBe('partner_disconnected')
    expect((await partnerStatePromise).state).toBe('IDLE')

    expect(MatchingService.getUserState(userB.user.id)).toBe('IDLE')

    // Remaining user can now find another peer
    const waitingPromise = new Promise<void>((resolve) => {
      clientB.on('queue:waiting', () => resolve())
    })
    const joinAck = await new Promise<QueueAckResponse>((resolve) => {
      clientB.emit('queue:join', { mode: 'text' }, (res: QueueAckResponse) =>
        resolve(res)
      )
    })
    expect(joinAck.ok).toBe(true)
    await waitingPromise
    expect(MatchingService.getUserState(userB.user.id)).toBe('QUEUED')

    // Database record
    const sessionInDb = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    })
    expect(sessionInDb?.endedReason).toBe('DISCONNECT_TIMEOUT')
  })

  it('prevents duplicate end/skip requests from corrupting queue or session state', async () => {
    const userA = await createTestUserWithProfile('MultiA')
    const userB = await createTestUserWithProfile('MultiB')

    const { clientA, sessionId } = await pairTwoUsers(userA, userB)

    // User A fires two chat:skip calls concurrently with the same sessionId
    const [ack1, ack2] = await Promise.all([
      new Promise<ChatLifecycleAckResponse>((resolve) => {
        clientA.emit(
          'chat:skip',
          { sessionId },
          (res: ChatLifecycleAckResponse) => resolve(res)
        )
      }),
      new Promise<ChatLifecycleAckResponse>((resolve) => {
        clientA.emit(
          'chat:skip',
          { sessionId },
          (res: ChatLifecycleAckResponse) => resolve(res)
        )
      }),
    ])

    // Exactly one call must succeed, the other must safely fail without corrupting state
    const successes = [ack1, ack2].filter((a) => a.ok)
    const failures = [ack1, ack2].filter((a) => !a.ok)

    expect(successes.length).toBe(1)
    expect(failures.length).toBe(1)
    expect(failures[0].error?.code).toBe('NOT_IN_SESSION')

    // User A must be queued exactly once, NOT duplicated
    expect(MatchingService.getQueueLength()).toBe(1)
    expect(MatchingService.getUserState(userA.user.id)).toBe('QUEUED')
  })

  it('rejects chat:skip and chat:end from non-member (FORBIDDEN)', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const userC = await createTestUserWithProfile('NonMember')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)
    await new Promise<void>((resolve) => clientC.on('connect', resolve))

    let aEnded = false
    let bEnded = false
    clientA.on('chat:ended', () => {
      aEnded = true
    })
    clientB.on('chat:ended', () => {
      bEnded = true
    })

    // Non-member attempts chat:skip
    const skipAck = await new Promise<ChatLifecycleAckResponse>((resolve) => {
      clientC.emit(
        'chat:skip',
        { sessionId },
        (res: ChatLifecycleAckResponse) => resolve(res)
      )
    })
    expect(skipAck.ok).toBe(false)
    expect(skipAck.error?.code).toBe('FORBIDDEN')

    // Non-member attempts chat:end
    const endAck = await new Promise<ChatLifecycleAckResponse>((resolve) => {
      clientC.emit('chat:end', { sessionId }, (res: ChatLifecycleAckResponse) =>
        resolve(res)
      )
    })
    expect(endAck.ok).toBe(false)
    expect(endAck.error?.code).toBe('FORBIDDEN')

    await new Promise((r) => setTimeout(r, 100))
    expect(aEnded).toBe(false)
    expect(bEnded).toBe(false)
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getUserState(userB.user.id)).toBe('IN_CHAT')
  })

  it('rejects invalid or missing sessionId (VALIDATION_FAILED)', async () => {
    const userA = await createTestUserWithProfile('ValidA')
    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA.on('connect', resolve))

    const ackEmpty = await new Promise<ChatLifecycleAckResponse>((resolve) => {
      clientA.emit(
        'chat:skip',
        { sessionId: '' },
        (res: ChatLifecycleAckResponse) => resolve(res)
      )
    })
    expect(ackEmpty.ok).toBe(false)
    expect(ackEmpty.error?.code).toBe('VALIDATION_FAILED')

    const ackWhitespace = await new Promise<ChatLifecycleAckResponse>(
      (resolve) => {
        clientA.emit(
          'chat:end',
          { sessionId: '   ' },
          (res: ChatLifecycleAckResponse) => resolve(res)
        )
      }
    )
    expect(ackWhitespace.ok).toBe(false)
    expect(ackWhitespace.error?.code).toBe('VALIDATION_FAILED')
  })

  it('allows repeat matches so skipped partners can rematch when available', async () => {
    const userA = await createTestUserWithProfile('RematchA')
    const userB = await createTestUserWithProfile('RematchB')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const rematchPromiseA = new Promise<MatchFoundPayload>((resolve) => {
      clientA.on('match:found', (payload) => resolve(payload))
    })
    const rematchPromiseB = new Promise<MatchFoundPayload>((resolve) => {
      clientB.on('match:found', (payload) => resolve(payload))
    })

    // User A skips
    await new Promise<ChatLifecycleAckResponse>((resolve) => {
      clientA.emit(
        'chat:skip',
        { sessionId },
        (res: ChatLifecycleAckResponse) => resolve(res)
      )
    })

    // User A is now waiting in queue. User B now also joins queue.
    const userBJoinedAck = await new Promise<QueueAckResponse>((resolve) => {
      clientB.emit('queue:join', { mode: 'text' }, (res: QueueAckResponse) =>
        resolve(res)
      )
    })
    expect(userBJoinedAck.ok).toBe(true)

    // Repeat match: User A and User B rematch successfully without cooldown blocking
    const [matchA, matchB] = await Promise.all([
      rematchPromiseA,
      rematchPromiseB,
    ])
    expect(matchA.sessionId).toBe(matchB.sessionId)
    expect(matchA.sessionId).not.toBe(sessionId)
    expect(matchA.partner.nickname).toBe('RematchB')
    expect(matchB.partner.nickname).toBe('RematchA')

    expect(MatchingService.getQueueLength()).toBe(0)
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getUserState(userB.user.id)).toBe('IN_CHAT')
  })
})
