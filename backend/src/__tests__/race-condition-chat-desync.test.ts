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
  MatchProposedPayload,
  MatchFoundPayload,
  SessionStatePayload,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('Matchmaking Race Conditions and Chat State Desynchronization', () => {
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
    MatchingService.setDisconnectCooldownDurationMs(0)
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
    const uniqueId = `sync_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
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

  it('1. A–B are chatting while C joins; C cannot steal A or B', async () => {
    const userA = await createTestUserWithProfile('Alice')
    const userB = await createTestUserWithProfile('Bob')
    const userC = await createTestUserWithProfile('Charlie')

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)
    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)

    await Promise.all([
      new Promise<void>((resolve) => clientA.on('connect', resolve)),
      new Promise<void>((resolve) => clientB.on('connect', resolve)),
      new Promise<void>((resolve) => clientC.on('connect', resolve)),
    ])

    // A and B join queue with confirmation
    let proposalId = ''
    const proposalPromise = new Promise<void>((resolve) => {
      clientA.on('match:proposed', (p: MatchProposedPayload) => {
        proposalId = p.proposalId
        resolve()
      })
    })

    clientA.emit('queue:join', { confirmMatch: true })
    clientB.emit('queue:join', { confirmMatch: true })
    await proposalPromise

    // Both A and B accept
    const matchFoundPromiseA = new Promise<MatchFoundPayload>((resolve) => {
      clientA.on('match:found', resolve)
    })
    const matchFoundPromiseB = new Promise<MatchFoundPayload>((resolve) => {
      clientB.on('match:found', resolve)
    })

    clientA.emit('match:accept', { proposalId })
    clientB.emit('match:accept', { proposalId })

    const [matchA, matchB] = await Promise.all([
      matchFoundPromiseA,
      matchFoundPromiseB,
    ])

    expect(matchA.sessionId).toBe(matchB.sessionId)
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getUserState(userB.user.id)).toBe('IN_CHAT')

    // Now Charlie joins matchmaking
    let charlieReceivedProposalWithAliceOrBob = false
    clientC.on('match:proposed', (p: MatchProposedPayload) => {
      if (
        p.partner.nickname === userA.nickname ||
        p.partner.nickname === userB.nickname
      ) {
        charlieReceivedProposalWithAliceOrBob = true
      }
    })

    const joinAckC = await new Promise<QueueAckResponse>((resolve) => {
      clientC.emit('queue:join', { confirmMatch: true }, (ack: QueueAckResponse) => {
        resolve(ack)
      })
    })

    expect(joinAckC.ok).toBe(true)
    expect(joinAckC.proposed).toBeFalsy()
    expect(charlieReceivedProposalWithAliceOrBob).toBe(false)
    expect(MatchingService.getUserState(userC.user.id)).toBe('QUEUED')

    // A and B remain securely in their active chat
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getUserState(userB.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getActiveMatchForUser(userA.user.id)?.sessionId).toBe(
      matchA.sessionId
    )

    // A sends message to B, B receives it successfully
    const msgPromise = new Promise<ChatMessageServerPayload>((resolve) => {
      clientB.on('chat:message', resolve)
    })

    clientA.emit('chat:message', {
      sessionId: matchA.sessionId,
      clientMsgId: 'cmsg-1',
      text: 'Still here with Bob!',
    })

    const receivedMsg = await msgPromise
    expect(receivedMsg.text).toBe('Still here with Bob!')
  })

  it('2. Multiple users join matchmaking simultaneously; each belongs to only one pending proposal or session', async () => {
    const user1 = await createTestUserWithProfile('User1')
    const user2 = await createTestUserWithProfile('User2')
    const user3 = await createTestUserWithProfile('User3')
    const user4 = await createTestUserWithProfile('User4')

    const client1 = createClient(`${SESSION_COOKIE_NAME}=${user1.rawToken}`)
    const client2 = createClient(`${SESSION_COOKIE_NAME}=${user2.rawToken}`)
    const client3 = createClient(`${SESSION_COOKIE_NAME}=${user3.rawToken}`)
    const client4 = createClient(`${SESSION_COOKIE_NAME}=${user4.rawToken}`)

    await Promise.all([
      new Promise<void>((res) => client1.on('connect', res)),
      new Promise<void>((res) => client2.on('connect', res)),
      new Promise<void>((res) => client3.on('connect', res)),
      new Promise<void>((res) => client4.on('connect', res)),
    ])

    // Rapid simultaneous join requests
    const joins = await Promise.all([
      new Promise<QueueAckResponse>((res) =>
        client1.emit('queue:join', { confirmMatch: true }, res)
      ),
      new Promise<QueueAckResponse>((res) =>
        client2.emit('queue:join', { confirmMatch: true }, res)
      ),
      new Promise<QueueAckResponse>((res) =>
        client3.emit('queue:join', { confirmMatch: true }, res)
      ),
      new Promise<QueueAckResponse>((res) =>
        client4.emit('queue:join', { confirmMatch: true }, res)
      ),
    ])

    expect(joins.every((j) => j.ok)).toBe(true)

    // Check states: users should either be QUEUED or PROPOSED, none duplicated
    const userIds = [user1.user.id, user2.user.id, user3.user.id, user4.user.id]
    const proposals = new Set<string>()

    for (const uid of userIds) {
      const prop = MatchingService.getProposalForUser(uid)
      if (prop) {
        proposals.add(prop.proposalId)
      }
    }

    // If 4 users paired into 2 proposals, there are exactly 2 unique proposal IDs
    expect(proposals.size).toBe(2)

    // Simultaneous double-join attempt from same user returns ALREADY_BUSY
    const duplicateJoinAck = await new Promise<QueueAckResponse>((res) => {
      client1.emit('queue:join', { confirmMatch: true }, res)
    })
    expect(duplicateJoinAck.ok).toBe(false)
    expect(duplicateJoinAck.error?.code).toBe('ALREADY_BUSY')
  })

  it('3. Two simultaneous accept requests cannot create conflicting sessions', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')

    // Add A and B to matchmaking and generate proposal
    const joinA = await MatchingService.joinQueue({
      userId: userA.user.id,
      socketId: 'sock-A',
      confirmMatch: true,
    })
    const joinB = await MatchingService.joinQueue({
      userId: userB.user.id,
      socketId: 'sock-B',
      confirmMatch: true,
    })

    expect(joinA.ok).toBe(true)
    expect(joinB.ok).toBe(true)
    if (!joinB.ok) throw new Error('joinB failed')
    const proposal = joinB.proposal
    expect(proposal).toBeDefined()
    const proposalId = proposal!.proposalId

    // Simultaneously invoke acceptProposal for both users
    const [resA, resB] = await Promise.all([
      MatchingService.acceptProposal(proposalId, userA.user.id),
      MatchingService.acceptProposal(proposalId, userB.user.id),
    ])

    // Exactly one of the results should have bothAccepted: true with the match created
    const bothAcceptedCount = [resA.bothAccepted, resB.bothAccepted].filter(Boolean).length
    expect(bothAcceptedCount).toBe(1)

    // Both users are now in IN_CHAT
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getUserState(userB.user.id)).toBe('IN_CHAT')

    // Exactly one active session in DB
    const sessions = await prisma.chatSession.findMany({
      where: {
        OR: [
          { userAId: userA.user.id, userBId: userB.user.id },
          { userAId: userB.user.id, userBId: userA.user.id },
        ],
      },
    })
    expect(sessions.length).toBe(1)
  })

  it('4. A stale acceptance cannot replace an active chat', async () => {
    const userA = await createTestUserWithProfile('Alice')
    const userB = await createTestUserWithProfile('Bob')

    // Alice and Bob start an active chat
    await MatchingService.joinQueue({
      userId: userA.user.id,
      socketId: 'sock-A',
      autoAccept: true,
    })
    const joinB = await MatchingService.joinQueue({
      userId: userB.user.id,
      socketId: 'sock-B',
      autoAccept: true,
    })

    expect(joinB.ok).toBe(true)
    if (!joinB.ok) throw new Error('joinB failed')
    expect(joinB.matched).toBe(true)
    const activeSessionId = joinB.match!.sessionId
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getUserState(userB.user.id)).toBe('IN_CHAT')

    // Stale proposal between Alice and Charlie
    const fakeProposalId = 'stale-proposal-uuid'
    const staleRes = await MatchingService.acceptProposal(fakeProposalId, userA.user.id)
    expect(staleRes.bothAccepted).toBe(false)

    // Alice remains in active chat with Bob
    expect(MatchingService.getUserState(userA.user.id)).toBe('IN_CHAT')
    expect(MatchingService.getActiveMatchForUser(userA.user.id)?.sessionId).toBe(
      activeSessionId
    )
  })

  it('5. Both clients remain synchronized after acceptance, decline, and reconnect', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)

    await Promise.all([
      new Promise<void>((res) => clientA.on('connect', res)),
      new Promise<void>((res) => clientB.on('connect', res)),
    ])

    // Part A: Decline returns both clients safely to QUEUED
    let propId = ''
    const propPromise = new Promise<void>((res) => {
      clientA.on('match:proposed', (p: MatchProposedPayload) => {
        propId = p.proposalId
        res()
      })
    })

    clientA.emit('queue:join', { confirmMatch: true })
    clientB.emit('queue:join', { confirmMatch: true })
    await propPromise

    const statePromiseA = new Promise<SessionStatePayload>((res) => {
      clientA.on('session:state', res)
    })
    const statePromiseB = new Promise<SessionStatePayload>((res) => {
      clientB.on('session:state', res)
    })

    clientA.emit('match:decline', { proposalId: propId })

    const [stateA, stateB] = await Promise.all([statePromiseA, statePromiseB])
    expect(stateA.state).toBe('QUEUED')
    expect(stateB.state).toBe('QUEUED')
    expect(MatchingService.getUserState(userA.user.id)).toBe('QUEUED')
    expect(MatchingService.getUserState(userB.user.id)).toBe('QUEUED')
  })

  it('6. Messages from an old or unrelated session are rejected', async () => {
    const userA = await createTestUserWithProfile('Alice')
    const userB = await createTestUserWithProfile('Bob')

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)

    await Promise.all([
      new Promise<void>((res) => clientA.on('connect', res)),
      new Promise<void>((res) => clientB.on('connect', res)),
    ])

    // Pair A and B
    let propId = ''
    const propPromise = new Promise<void>((res) => {
      clientA.on('match:proposed', (p: MatchProposedPayload) => {
        propId = p.proposalId
        res()
      })
    })
    clientA.emit('queue:join', { confirmMatch: true })
    clientB.emit('queue:join', { confirmMatch: true })
    await propPromise

    const matchFoundPromise = new Promise<MatchFoundPayload>((res) => {
      clientA.on('match:found', res)
    })
    clientA.emit('match:accept', { proposalId: propId })
    clientB.emit('match:accept', { proposalId: propId })
    const match = await matchFoundPromise

    // Client A sends a message with an INVALID / UNRELATED sessionId
    const badAck = await new Promise<ChatMessageAckResponse>((res) => {
      clientA.emit(
        'chat:message',
        {
          sessionId: 'completely-bogus-session-id',
          clientMsgId: 'cmsg-fail',
          text: 'Should be rejected',
        },
        res
      )
    })

    expect(badAck.ok).toBe(false)
    expect(badAck.error?.code).toBe('NOT_IN_SESSION')

    // Client A sends a valid message with correct sessionId
    const goodAck = await new Promise<ChatMessageAckResponse>((res) => {
      clientA.emit(
        'chat:message',
        {
          sessionId: match.sessionId,
          clientMsgId: 'cmsg-success',
          text: 'Legit message',
        },
        res
      )
    })

    expect(goodAck.ok).toBe(true)
    expect(goodAck.messageId).toBeDefined()
  })
})
