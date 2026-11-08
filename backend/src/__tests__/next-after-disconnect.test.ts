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
  MatchProposedPayload,
  MatchFoundPayload,
  ChatEndedPayload,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('Next Button and Matchmaking Re-entry After Disconnect', () => {
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
    MatchingService.setDisconnectCooldownDurationMs(1000) // 1s for fast tests
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
    const uniqueId = `next_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
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

  it('1. Next after disconnect: cleans up previous session and joins queue without cooldown', async () => {
    const userA = await createTestUserWithProfile('Alice')
    const userB = await createTestUserWithProfile('Bob')
    const userC = await createTestUserWithProfile('Charlie')

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)
    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)

    await Promise.all([
      new Promise<void>((res) => clientA.on('connect', res)),
      new Promise<void>((res) => clientB.on('connect', res)),
      new Promise<void>((res) => clientC.on('connect', res)),
    ])

    // Pair A and B
    let propAB = ''
    const propPromiseAB = new Promise<void>((res) => {
      clientA.once('match:proposed', (p: MatchProposedPayload) => {
        propAB = p.proposalId
        res()
      })
    })

    clientA.emit('queue:join', { confirmMatch: true })
    clientB.emit('queue:join', { confirmMatch: true })
    await propPromiseAB

    const matchFoundPromiseA = new Promise<MatchFoundPayload>((res) => {
      clientA.once('match:found', res)
    })
    clientA.emit('match:accept', { proposalId: propAB })
    clientB.emit('match:accept', { proposalId: propAB })
    const matchAB = await matchFoundPromiseA

    // Partner B disconnects
    clientB.disconnect()

    // User A presses Next (chat:skip with confirmMatch: true)
    let endedCooldown = -1
    clientA.once('chat:ended', (payload: ChatEndedPayload) => {
      endedCooldown = payload.cooldownSeconds ?? -1
    })

    const skipAck = await new Promise<{ ok: boolean; proposed?: boolean }>(
      (res) => {
        clientA.emit(
          'chat:skip',
          { sessionId: matchAB.sessionId, confirmMatch: true },
          res
        )
      }
    )

    expect(skipAck.ok).toBe(true)
    // Skipper receives 0 cooldown seconds
    expect(endedCooldown).toBe(0)

    // User C joins matchmaking
    let propAC = ''
    const propPromiseAC = new Promise<void>((res) => {
      clientA.once('match:proposed', (p: MatchProposedPayload) => {
        propAC = p.proposalId
        res()
      })
    })

    clientC.emit('queue:join', { confirmMatch: true })
    await propPromiseAC

    expect(propAC).toBeDefined()
    expect(propAC).not.toBe(propAB)

    // A and C both accept
    const finalMatchPromiseA = new Promise<MatchFoundPayload>((res) => {
      clientA.on('match:found', res)
    })
    const finalMatchPromiseC = new Promise<MatchFoundPayload>((res) => {
      clientC.on('match:found', res)
    })

    clientA.emit('match:accept', { proposalId: propAC })
    clientC.emit('match:accept', { proposalId: propAC })

    const [finalMatchA, finalMatchC] = await Promise.all([
      finalMatchPromiseA,
      finalMatchPromiseC,
    ])

    expect(finalMatchA.sessionId).toBe(finalMatchC.sessionId)
    expect(finalMatchA.partner.nickname).toBe('Charlie')
    expect(finalMatchC.partner.nickname).toBe('Alice')
  })

  it('2. Next during cooldown: rejects queue join and returns COOLDOWN_ACTIVE', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')

    MatchingService.setDisconnectCooldownDurationMs(1000)

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

    // End match with DISCONNECT_TIMEOUT (which enforces cooldown on both participants)
    await MatchingService.endMatch(match.sessionId, 'DISCONNECT_TIMEOUT')

    // Client A immediately tries to join queue (Next during cooldown)
    const ack = await new Promise<QueueAckResponse>((res) => {
      clientA.emit('queue:join', { confirmMatch: true }, res)
    })

    expect(ack.ok).toBe(false)
    expect(ack.error?.code).toBe('COOLDOWN_ACTIVE')
    expect(ack.error?.remainingSeconds).toBeGreaterThan(0)
  })

  it('3. Successful matchmaking after cooldown: cleanly matches when cooldown expires', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const userC = await createTestUserWithProfile('UserC')

    // Set cooldown to 200ms for test
    MatchingService.setDisconnectCooldownDurationMs(200)

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)
    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)

    await Promise.all([
      new Promise<void>((res) => clientA.on('connect', res)),
      new Promise<void>((res) => clientB.on('connect', res)),
      new Promise<void>((res) => clientC.on('connect', res)),
    ])

    // Initial match between A and B
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

    const matchFound = new Promise<MatchFoundPayload>((res) => {
      clientA.on('match:found', res)
    })
    clientA.emit('match:accept', { proposalId: propId })
    clientB.emit('match:accept', { proposalId: propId })
    const match = await matchFound

    // Terminate match with DISCONNECT_TIMEOUT
    await MatchingService.endMatch(match.sessionId, 'DISCONNECT_TIMEOUT')

    // During cooldown, queue:join fails
    const ackDuring = await new Promise<QueueAckResponse>((res) => {
      clientA.emit('queue:join', { confirmMatch: true }, res)
    })
    expect(ackDuring.ok).toBe(false)
    expect(ackDuring.error?.code).toBe('COOLDOWN_ACTIVE')

    // Wait 250ms for cooldown to expire
    await new Promise((res) => setTimeout(res, 250))

    // After cooldown, pressing Next (queue:join) succeeds without returning to landing page
    const ackAfter = await new Promise<QueueAckResponse>((res) => {
      clientA.emit('queue:join', { confirmMatch: true }, res)
    })
    expect(ackAfter.ok).toBe(true)

    // User C joins and matches with User A
    let propAC = ''
    const propPromiseAC = new Promise<void>((res) => {
      clientA.on('match:proposed', (p: MatchProposedPayload) => {
        propAC = p.proposalId
        res()
      })
    })

    clientC.emit('queue:join', { confirmMatch: true })
    await propPromiseAC
    expect(propAC).toBeDefined()

    const newMatchA = new Promise<MatchFoundPayload>((res) => {
      clientA.on('match:found', res)
    })
    clientA.emit('match:accept', { proposalId: propAC })
    clientC.emit('match:accept', { proposalId: propAC })

    const finalMatch = await newMatchA
    expect(finalMatch.partner.nickname).toBe('UserC')
  })

  it('4. Both users disconnect: both can match again independently once cooldown expires', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')

    MatchingService.setDisconnectCooldownDurationMs(150)

    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const clientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)

    await Promise.all([
      new Promise<void>((res) => clientA.on('connect', res)),
      new Promise<void>((res) => clientB.on('connect', res)),
    ])

    // Match A and B
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

    const matchFound = new Promise<MatchFoundPayload>((res) => {
      clientA.on('match:found', res)
    })
    clientA.emit('match:accept', { proposalId: propId })
    clientB.emit('match:accept', { proposalId: propId })
    const match = await matchFound

    // Both disconnect
    clientA.disconnect()
    clientB.disconnect()

    // Session is ended
    await MatchingService.endMatch(match.sessionId, 'DISCONNECT_TIMEOUT')

    // Both reconnect after cooldown
    await new Promise((res) => setTimeout(res, 200))

    const newClientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    const newClientB = createClient(`${SESSION_COOKIE_NAME}=${userB.rawToken}`)

    await Promise.all([
      new Promise<void>((res) => newClientA.on('connect', res)),
      new Promise<void>((res) => newClientB.on('connect', res)),
    ])

    // Both independently call queue:join and can rematch
    let newPropId = ''
    const newPropPromise = new Promise<void>((res) => {
      newClientA.on('match:proposed', (p: MatchProposedPayload) => {
        newPropId = p.proposalId
        res()
      })
    })

    newClientA.emit('queue:join', { confirmMatch: true })
    newClientB.emit('queue:join', { confirmMatch: true })
    await newPropPromise

    expect(newPropId).toBeDefined()
    expect(newPropId).not.toBe(propId)
  })
})
