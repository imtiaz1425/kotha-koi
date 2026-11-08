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
  ChatMessageServerPayload,
  ChatMessageAckResponse,
  ChatEndedPayload,
  MatchProposedPayload,
  MatchCancelledPayload,
  MatchFoundPayload,
  SessionStatePayload,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('Multi-Device Chat Isolation, Match Confirmation, and 10-Second Cooldown', () => {
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
    setDisconnectGracePeriodMs(100)
    MatchingService.setDisconnectCooldownDurationMs(10000)
  })

  afterEach(() => {
    for (const client of openClients) {
      if (client.connected) {
        client.disconnect()
      }
    }
    openClients.length = 0
    clearActiveSockets()
    MatchingService.clearAll()
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
    const uniqueId = `multi_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
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
    return { user, rawToken, nickname }
  }

  async function pairTwoUsersDirectly(
    userA: { rawToken: string },
    userB: { rawToken: string }
  ) {
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

    await new Promise<QueueAckResponse>((resolve) => {
      clientA.emit(
        'queue:join',
        { mode: 'text', autoAccept: true },
        (ack: QueueAckResponse) => resolve(ack)
      )
    })
    await new Promise<QueueAckResponse>((resolve) => {
      clientB.emit(
        'queue:join',
        { mode: 'text', autoAccept: true },
        (ack: QueueAckResponse) => resolve(ack)
      )
    })

    const [matchA, matchB] = await Promise.all([matchPromiseA, matchPromiseB])
    expect(matchA.sessionId).toBe(matchB.sessionId)

    return { clientA, clientB, sessionId: matchA.sessionId }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Chat Isolation Tests
  // ───────────────────────────────────────────────────────────────────────────

  it('1. Strict Message Isolation: messages in pair 1 are NEVER delivered to pair 2', async () => {
    const userA = await createTestUserWithProfile('Alice')
    const userB = await createTestUserWithProfile('Bob')
    const userC = await createTestUserWithProfile('Charlie')
    const userD = await createTestUserWithProfile('Dave')

    // Create Pair 1 (Alice & Bob) and Pair 2 (Charlie & Dave) simultaneously
    const pair1 = await pairTwoUsersDirectly(userA, userB)
    const pair2 = await pairTwoUsersDirectly(userC, userD)

    expect(pair1.sessionId).not.toBe(pair2.sessionId)

    // Listeners for Pair 1
    const pair1BobReceivedPromise = new Promise<ChatMessageServerPayload>(
      (resolve) => {
        pair1.clientB.on('chat:message', resolve)
      }
    )

    // Spies for Pair 2 (must NOT receive pair 1 messages)
    let pair2CharlieReceived = false
    let pair2DaveReceived = false
    pair2.clientA.on('chat:message', () => {
      pair2CharlieReceived = true
    })
    pair2.clientB.on('chat:message', () => {
      pair2DaveReceived = true
    })

    // Alice sends message in Session 1
    const ack1 = await new Promise<ChatMessageAckResponse>((resolve) => {
      pair1.clientA.emit(
        'chat:message',
        {
          sessionId: pair1.sessionId,
          clientMsgId: 'msg_1',
          text: 'Private message in Pair 1',
        },
        resolve
      )
    })
    expect(ack1.ok).toBe(true)

    const receivedByBob = await pair1BobReceivedPromise
    expect(receivedByBob.text).toBe('Private message in Pair 1')
    expect(receivedByBob.sessionId).toBe(pair1.sessionId)

    // Allow time for any errant broadcast
    await new Promise((r) => setTimeout(r, 100))
    expect(pair2CharlieReceived).toBe(false)
    expect(pair2DaveReceived).toBe(false)

    // Vice-versa: Charlie sends message in Session 2
    const pair2DaveReceivedPromise = new Promise<ChatMessageServerPayload>(
      (resolve) => {
        pair2.clientB.on('chat:message', resolve)
      }
    )

    let pair1AliceReceived = false
    pair1.clientA.on('chat:message', () => {
      pair1AliceReceived = true
    })

    const ack2 = await new Promise<ChatMessageAckResponse>((resolve) => {
      pair2.clientA.emit(
        'chat:message',
        {
          sessionId: pair2.sessionId,
          clientMsgId: 'msg_2',
          text: 'Private message in Pair 2',
        },
        resolve
      )
    })
    expect(ack2.ok).toBe(true)

    const receivedByDave = await pair2DaveReceivedPromise
    expect(receivedByDave.text).toBe('Private message in Pair 2')
    expect(receivedByDave.sessionId).toBe(pair2.sessionId)

    await new Promise((r) => setTimeout(r, 100))
    expect(pair1AliceReceived).toBe(false)

    // Alice cannot inject message into Session 2 (FORBIDDEN)
    const crossAck = await new Promise<ChatMessageAckResponse>((resolve) => {
      pair1.clientA.emit(
        'chat:message',
        {
          sessionId: pair2.sessionId,
          clientMsgId: 'msg_hack',
          text: 'Attempting to inject into other pair',
        },
        resolve
      )
    })
    expect(crossAck.ok).toBe(false)
    expect(crossAck.error?.code).toBe('FORBIDDEN')
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Multi-Tab / Multi-Device Safety Tests
  // ───────────────────────────────────────────────────────────────────────────

  it('2. Multi-Tab Safety: opening a second tab does not disconnect active chat or hijack session', async () => {
    const userA = await createTestUserWithProfile('MultiTabAlice')
    const userB = await createTestUserWithProfile('BobPeer')

    // Tab 1 pairs with Bob
    const { clientA: tab1Client, clientB: bobClient, sessionId } =
      await pairTwoUsersDirectly(userA, userB)

    let tab1Disconnected = false
    let tab1SessionReplaced = false
    tab1Client.on('disconnect', () => {
      tab1Disconnected = true
    })
    tab1Client.on('error', (err: { code: string }) => {
      if (err.code === 'SESSION_REPLACED') tab1SessionReplaced = true
    })

    // Now User A opens Tab 2 on the same account
    const tab2Client = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const tab2StatePromise = new Promise<SessionStatePayload>((resolve) => {
      tab2Client.on('session:state', resolve)
    })

    await new Promise<void>((resolve) => tab2Client.on('connect', resolve))
    const tab2State = await tab2StatePromise

    // Tab 1 is NOT kicked or replaced
    expect(tab1Client.connected).toBe(true)
    expect(tab1Disconnected).toBe(false)
    expect(tab1SessionReplaced).toBe(false)

    // Tab 2 starts IDLE and does NOT hijack Tab 1's active session
    expect(tab2Client.connected).toBe(true)
    expect(tab2State.state).toBe('IDLE')

    // Tab 2 cannot send messages into Tab 1's session (FORBIDDEN)
    const tab2SendAck = await new Promise<ChatMessageAckResponse>((resolve) => {
      tab2Client.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: 'msg_tab2',
          text: 'Trying to send from tab 2',
        },
        resolve
      )
    })
    expect(tab2SendAck.ok).toBe(false)
    expect(tab2SendAck.error?.code).toBe('FORBIDDEN')

    // Tab 1 can still send messages normally
    const tab1SendAck = await new Promise<ChatMessageAckResponse>((resolve) => {
      tab1Client.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: 'msg_tab1',
          text: 'Hello from Tab 1',
        },
        resolve
      )
    })
    expect(tab1SendAck.ok).toBe(true)

    // Bob's message is delivered to Tab 1, NOT Tab 2
    let tab2ReceivedMsg = false
    tab2Client.on('chat:message', () => {
      tab2ReceivedMsg = true
    })

    const tab1ReceivedPromise = new Promise<ChatMessageServerPayload>(
      (resolve) => {
        tab1Client.on('chat:message', resolve)
      }
    )

    await new Promise<ChatMessageAckResponse>((resolve) => {
      bobClient.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: 'msg_bob',
          text: 'Reply to Tab 1',
        },
        resolve
      )
    })

    const receivedByTab1 = await tab1ReceivedPromise
    expect(receivedByTab1.text).toBe('Reply to Tab 1')

    await new Promise((r) => setTimeout(r, 100))
    expect(tab2ReceivedMsg).toBe(false)

    // Tab 2 cannot double-join queue while User A is in active chat (ALREADY_BUSY)
    const tab2JoinAck = await new Promise<QueueAckResponse>((resolve) => {
      tab2Client.emit('queue:join', { mode: 'text' }, resolve)
    })
    expect(tab2JoinAck.ok).toBe(false)
    expect(tab2JoinAck.error?.code).toBe('ALREADY_BUSY')

    // Tab 2 closes/disconnects -> Tab 1 chat remains active and unaffected
    tab2Client.disconnect()
    await new Promise((r) => setTimeout(r, 100))
    expect(tab1Client.connected).toBe(true)
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Match Confirmation Screen (Accept / Decline / Expiry)
  // ───────────────────────────────────────────────────────────────────────────

  it('3. Match Confirmation Flow: both accept creates chat session', async () => {
    const userA = await createTestUserWithProfile('ConfAlice')
    const userB = await createTestUserWithProfile('ConfBob')

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)

    await Promise.all([
      new Promise<void>((resolve) => clientA.on('connect', resolve)),
      new Promise<void>((resolve) => clientB.on('connect', resolve)),
    ])

    const propPromiseA = new Promise<MatchProposedPayload>((resolve) => {
      clientA.on('match:proposed', resolve)
    })
    const propPromiseB = new Promise<MatchProposedPayload>((resolve) => {
      clientB.on('match:proposed', resolve)
    })

    // Both join queue with confirmation required
    await new Promise<QueueAckResponse>((resolve) => {
      clientA.emit('queue:join', { mode: 'text', confirmMatch: true }, resolve)
    })
    await new Promise<QueueAckResponse>((resolve) => {
      clientB.emit('queue:join', { mode: 'text', confirmMatch: true }, resolve)
    })

    const [propA, propB] = await Promise.all([propPromiseA, propPromiseB])
    expect(propA.proposalId).toBe(propB.proposalId)
    // Proposal reveals only temporary nickname and avatar preset, never private profile data
    expect(propA.partner.nickname).toBe('ConfBob')
    expect(propB.partner.nickname).toBe('ConfAlice')
    expect(propA.expiresInSeconds).toBe(15)

    // Both clients receive PROPOSED state
    expect(MatchingService.getUserState(userA.user.id)).toBe('PROPOSED')
    expect(MatchingService.getUserState(userB.user.id)).toBe('PROPOSED')

    // Listeners for match:found
    const matchFoundA = new Promise<MatchFoundPayload>((resolve) => {
      clientA.on('match:found', resolve)
    })
    const matchFoundB = new Promise<MatchFoundPayload>((resolve) => {
      clientB.on('match:found', resolve)
    })

    // User A accepts first
    const ackA = await new Promise<{ ok: boolean; bothAccepted?: boolean }>(
      (resolve) => {
        clientA.emit('match:accept', { proposalId: propA.proposalId }, resolve)
      }
    )
    expect(ackA.ok).toBe(true)
    expect(ackA.bothAccepted).toBe(false)
    expect(MatchingService.getUserState(userA.user.id)).toBe('PROPOSED')

    // User B accepts
    const ackB = await new Promise<{ ok: boolean; bothAccepted?: boolean }>(
      (resolve) => {
        clientB.emit('match:accept', { proposalId: propB.proposalId }, resolve)
      }
    )
    expect(ackB.ok).toBe(true)
    expect(ackB.bothAccepted).toBe(true)

    // Now both transition to IN_CHAT and receive match:found
    const [finalMatchA, finalMatchB] = await Promise.all([
      matchFoundA,
      matchFoundB,
    ])
    expect(finalMatchA.sessionId).toBe(finalMatchB.sessionId)
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getUserState(userB.user.id)).toBe('IN_CHAT')
  })

  it('4. Match Decline Flow: declining cancels proposal and returns both safely to queue', async () => {
    const userA = await createTestUserWithProfile('DecAlice')
    const userB = await createTestUserWithProfile('DecBob')

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)

    await Promise.all([
      new Promise<void>((resolve) => clientA.on('connect', resolve)),
      new Promise<void>((resolve) => clientB.on('connect', resolve)),
    ])

    const propPromiseA = new Promise<MatchProposedPayload>((resolve) => {
      clientA.on('match:proposed', resolve)
    })

    await new Promise<QueueAckResponse>((resolve) => {
      clientA.emit('queue:join', { mode: 'text', confirmMatch: true }, resolve)
    })
    await new Promise<QueueAckResponse>((resolve) => {
      clientB.emit('queue:join', { mode: 'text', confirmMatch: true }, resolve)
    })

    const propA = await propPromiseA

    const cancelPromiseA = new Promise<MatchCancelledPayload>((resolve) => {
      clientA.on('match:cancelled', resolve)
    })
    const cancelPromiseB = new Promise<MatchCancelledPayload>((resolve) => {
      clientB.on('match:cancelled', resolve)
    })

    // User A declines match
    const declineAck = await new Promise<{ ok: boolean }>((resolve) => {
      clientA.emit('match:decline', { proposalId: propA.proposalId }, resolve)
    })
    expect(declineAck.ok).toBe(true)

    const [cancelledA, cancelledB] = await Promise.all([
      cancelPromiseA,
      cancelPromiseB,
    ])
    expect(cancelledA.reason).toBe('declined')
    expect(cancelledB.reason).toBe('declined')

    // Both users safely returned to queue
    expect(MatchingService.getUserState(userA.user.id)).toBe('QUEUED')
    expect(MatchingService.getUserState(userB.user.id)).toBe('QUEUED')
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 4. 10-Second Disconnect Cooldown Enforcement
  // ───────────────────────────────────────────────────────────────────────────

  it('5. Disconnect Cooldown: prevents re-matching for 10 seconds after chat ends', async () => {
    // Set 10-second cooldown explicitly
    MatchingService.setDisconnectCooldownDurationMs(10000)

    const userA = await createTestUserWithProfile('CoolAlice')
    const userB = await createTestUserWithProfile('CoolBob')

    const { clientA, sessionId } = await pairTwoUsersDirectly(userA, userB)

    const endedPromiseA = new Promise<ChatEndedPayload>((resolve) => {
      clientA.on('chat:ended', resolve)
    })

    // Alice ends the chat
    await new Promise<{ ok: boolean }>((resolve) => {
      clientA.emit('chat:end', { sessionId }, resolve)
    })

    const endedA = await endedPromiseA
    expect(endedA.cooldownSeconds).toBe(10)

    // User A is under 10s cooldown
    expect(MatchingService.getDisconnectCooldownRemaining(userA.user.id)).toBe(
      10
    )

    // Immediate attempt to join queue on same client -> rejected with COOLDOWN_ACTIVE
    const earlyJoinAck = await new Promise<QueueAckResponse>((resolve) => {
      clientA.emit('queue:join', { mode: 'text' }, resolve)
    })
    expect(earlyJoinAck.ok).toBe(false)
    expect(earlyJoinAck.error?.code).toBe('COOLDOWN_ACTIVE')
    expect(earlyJoinAck.error?.remainingSeconds).toBeGreaterThanOrEqual(9)

    // Attempting to bypass via new tab / client -> also rejected with COOLDOWN_ACTIVE
    const newTabClient = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => newTabClient.on('connect', resolve))

    const newTabJoinAck = await new Promise<QueueAckResponse>((resolve) => {
      newTabClient.emit('queue:join', { mode: 'text' }, resolve)
    })
    expect(newTabJoinAck.ok).toBe(false)
    expect(newTabJoinAck.error?.code).toBe('COOLDOWN_ACTIVE')

    // Duplicate disconnect event does NOT extend or reset cooldown
    MatchingService.applyDisconnectCooldown(userA.user.id, sessionId, 10000)
    expect(MatchingService.getDisconnectCooldownRemaining(userA.user.id)).toBe(
      10
    )

    // When cooldown expires (simulated by clearing cooldown for user)
    MatchingService.clearUserDisconnectCooldown(userA.user.id)
    expect(MatchingService.getDisconnectCooldownRemaining(userA.user.id)).toBe(0)

    // Re-joining queue now succeeds
    const allowedJoinAck = await new Promise<QueueAckResponse>((resolve) => {
      clientA.emit('queue:join', { mode: 'text' }, resolve)
    })
    expect(allowedJoinAck.ok).toBe(true)
    expect(MatchingService.getUserState(userA.user.id)).toBe('QUEUED')
  })
})
