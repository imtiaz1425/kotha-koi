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
  QueueAckResponse,
  ChatMessageAckResponse,
  ChatMessageServerPayload,
  ChatTypingPayload,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('TASK-RT-03: Real-Time Text Messaging Between Matched Users', () => {
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
    const uniqueId = `chat_${Date.now()}_${Math.floor(Math.random() * 100000)}`
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

  // Helper to establish a matched session between two users
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

  it('delivers messages from User A to User B and provides acknowledgment with messageId and timestamp', async () => {
    const userA = await createTestUserWithProfile('Alice')
    const userB = await createTestUserWithProfile('Bob')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const messagePromise = new Promise<ChatMessageServerPayload>((resolve) => {
      clientB.on('chat:message', (payload) => resolve(payload))
    })

    const clientMsgId = `cmsg_${Date.now()}`
    const textToSend = 'Hello Bob, nice to meet you on KothaKoi!'

    const ack = await new Promise<ChatMessageAckResponse>((resolve) => {
      clientA.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId,
          text: textToSend,
        },
        (response: ChatMessageAckResponse) => resolve(response)
      )
    })

    expect(ack.ok).toBe(true)
    expect(typeof ack.messageId).toBe('string')
    expect(typeof ack.at).toBe('string')

    const received = await messagePromise
    expect(received.sessionId).toBe(sessionId)
    expect(received.messageId).toBe(ack.messageId)
    expect(received.text).toBe(textToSend)
    expect(received.at).toBe(ack.at)
  })

  it('delivers messages from User B to User A (bidirectional messaging)', async () => {
    const userA = await createTestUserWithProfile('Rahim')
    const userB = await createTestUserWithProfile('Karim')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const messagePromise = new Promise<ChatMessageServerPayload>((resolve) => {
      clientA.on('chat:message', (payload) => resolve(payload))
    })

    const textToSend = 'Hey Rahim! Doing assignments right now.'
    const ack = await new Promise<ChatMessageAckResponse>((resolve) => {
      clientB.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: `cmsg_${Date.now()}`,
          text: textToSend,
        },
        (response: ChatMessageAckResponse) => resolve(response)
      )
    })

    expect(ack.ok).toBe(true)
    const received = await messagePromise
    expect(received.sessionId).toBe(sessionId)
    expect(received.text).toBe(textToSend)
    expect(received.messageId).toBe(ack.messageId)
  })

  it('rejects message if sender is not a member of the active session (FORBIDDEN)', async () => {
    const userA = await createTestUserWithProfile('Tanvir')
    const userB = await createTestUserWithProfile('Sabbir')
    const userC = await createTestUserWithProfile('Imposter')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    // User C connects but is not in session
    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)
    await new Promise<void>((resolve) => clientC.on('connect', resolve))

    let clientAReceived = false
    let clientBReceived = false
    clientA.on('chat:message', () => {
      clientAReceived = true
    })
    clientB.on('chat:message', () => {
      clientBReceived = true
    })

    const ack = await new Promise<ChatMessageAckResponse>((resolve) => {
      clientC.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: `cmsg_${Date.now()}`,
          text: 'I am not supposed to be here!',
        },
        (response: ChatMessageAckResponse) => resolve(response)
      )
    })

    expect(ack.ok).toBe(false)
    expect(ack.error?.code).toBe('FORBIDDEN')
    expect(ack.error?.message).toContain('not a participant')

    // Wait briefly to confirm neither A nor B received anything
    await new Promise((r) => setTimeout(r, 100))
    expect(clientAReceived).toBe(false)
    expect(clientBReceived).toBe(false)
  })

  it('rejects message if chat session does not exist (NOT_IN_SESSION)', async () => {
    const userA = await createTestUserWithProfile('Nafis')
    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA.on('connect', resolve))

    const ack = await new Promise<ChatMessageAckResponse>((resolve) => {
      clientA.emit(
        'chat:message',
        {
          sessionId: 'non-existent-session-id',
          clientMsgId: `cmsg_${Date.now()}`,
          text: 'Hello into the void',
        },
        (response: ChatMessageAckResponse) => resolve(response)
      )
    })

    expect(ack.ok).toBe(false)
    expect(ack.error?.code).toBe('NOT_IN_SESSION')
  })

  it('rejects invalid or empty messages (empty string, whitespace only, missing fields, length > 1000)', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    let clientBReceived = false
    clientB.on('chat:message', () => {
      clientBReceived = true
    })

    // 1. Empty string
    const ackEmpty = await new Promise<ChatMessageAckResponse>((resolve) => {
      clientA.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: 'msg1',
          text: '',
        },
        (response: ChatMessageAckResponse) => resolve(response)
      )
    })
    expect(ackEmpty.ok).toBe(false)
    expect(ackEmpty.error?.code).toBe('VALIDATION_FAILED')

    // 2. Whitespace only
    const ackWhitespace = await new Promise<ChatMessageAckResponse>(
      (resolve) => {
        clientA.emit(
          'chat:message',
          {
            sessionId,
            clientMsgId: 'msg2',
            text: '     \n  \t  ',
          },
          (response: ChatMessageAckResponse) => resolve(response)
        )
      }
    )
    expect(ackWhitespace.ok).toBe(false)
    expect(ackWhitespace.error?.code).toBe('VALIDATION_FAILED')

    // 3. Exceeds 1000 characters
    const longText = 'x'.repeat(1001)
    const ackLong = await new Promise<ChatMessageAckResponse>((resolve) => {
      clientA.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: 'msg3',
          text: longText,
        },
        (response: ChatMessageAckResponse) => resolve(response)
      )
    })
    expect(ackLong.ok).toBe(false)
    expect(ackLong.error?.code).toBe('VALIDATION_FAILED')

    // 4. Missing clientMsgId
    const ackNoClientMsgId = await new Promise<ChatMessageAckResponse>(
      (resolve) => {
        clientA.emit(
          'chat:message',
          {
            sessionId,
            clientMsgId: '',
            text: 'Valid text',
          },
          (response: ChatMessageAckResponse) => resolve(response)
        )
      }
    )
    expect(ackNoClientMsgId.ok).toBe(false)
    expect(ackNoClientMsgId.error?.code).toBe('VALIDATION_FAILED')

    // 5. Missing sessionId
    const ackNoSessionId = await new Promise<ChatMessageAckResponse>(
      (resolve) => {
        clientA.emit(
          'chat:message',
          {
            sessionId: '',
            clientMsgId: 'msg5',
            text: 'Valid text',
          },
          (response: ChatMessageAckResponse) => resolve(response)
        )
      }
    )
    expect(ackNoSessionId.ok).toBe(false)
    expect(ackNoSessionId.error?.code).toBe('VALIDATION_FAILED')

    // Ensure partner received nothing
    await new Promise((r) => setTimeout(r, 100))
    expect(clientBReceived).toBe(false)
  })

  it('handles typing indicators between matched peers with 1s throttling and ignores non-members', async () => {
    const userA = await createTestUserWithProfile('TypingA')
    const userB = await createTestUserWithProfile('TypingB')
    const userC = await createTestUserWithProfile('TypingC')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)
    await new Promise<void>((resolve) => clientC.on('connect', resolve))

    const typingEventsB: ChatTypingPayload[] = []
    clientB.on('chat:typing', (payload) => {
      typingEventsB.push(payload)
    })

    // 1. User A emits isTyping: true -> B receives it
    clientA.emit('chat:typing', { sessionId, isTyping: true })
    await new Promise((r) => setTimeout(r, 100))
    expect(typingEventsB.length).toBe(1)
    expect(typingEventsB[0]).toEqual({ sessionId, isTyping: true })

    // 2. User A immediately emits isTyping: false within 1000ms -> throttled
    clientA.emit('chat:typing', { sessionId, isTyping: false })
    await new Promise((r) => setTimeout(r, 100))
    expect(typingEventsB.length).toBe(1) // Still 1

    // 3. User C (non-member) emits typing indicator -> ignored
    clientC.emit('chat:typing', { sessionId, isTyping: true })
    await new Promise((r) => setTimeout(r, 100))
    expect(typingEventsB.length).toBe(1) // Still 1

    // 4. Wait for throttle window (1000ms) to elapse
    await new Promise((r) => setTimeout(r, 1050))

    // 5. User A emits isTyping: false -> B receives it
    clientA.emit('chat:typing', { sessionId, isTyping: false })
    await new Promise((r) => setTimeout(r, 100))
    expect(typingEventsB.length).toBe(2)
    expect(typingEventsB[1]).toEqual({ sessionId, isTyping: false })
  })

  it('prevents messages from leaking to other active sessions', async () => {
    // Pair 1: User 1 and User 2
    const user1 = await createTestUserWithProfile('Session1_User1')
    const user2 = await createTestUserWithProfile('Session1_User2')
    const pair1 = await pairTwoUsers(user1, user2)

    // Pair 2: User 3 and User 4
    const user3 = await createTestUserWithProfile('Session2_User3')
    const user4 = await createTestUserWithProfile('Session2_User4')
    const pair2 = await pairTwoUsers(user3, user4)

    expect(pair1.sessionId).not.toBe(pair2.sessionId)

    const receivedByPair1: ChatMessageServerPayload[] = []
    const receivedByPair2: ChatMessageServerPayload[] = []

    pair1.clientB.on('chat:message', (payload) => receivedByPair1.push(payload))
    pair2.clientB.on('chat:message', (payload) => receivedByPair2.push(payload))

    // User 1 sends message in Session 1
    const ack1 = await new Promise<ChatMessageAckResponse>((resolve) => {
      pair1.clientA.emit(
        'chat:message',
        {
          sessionId: pair1.sessionId,
          clientMsgId: 'p1_msg',
          text: 'Secret message in session 1',
        },
        (res: ChatMessageAckResponse) => resolve(res)
      )
    })
    expect(ack1.ok).toBe(true)

    // User 3 sends message in Session 2
    const ack2 = await new Promise<ChatMessageAckResponse>((resolve) => {
      pair2.clientA.emit(
        'chat:message',
        {
          sessionId: pair2.sessionId,
          clientMsgId: 'p2_msg',
          text: 'Secret message in session 2',
        },
        (res: ChatMessageAckResponse) => resolve(res)
      )
    })
    expect(ack2.ok).toBe(true)

    await new Promise((r) => setTimeout(r, 150))

    // Verify Pair 1 only got message 1
    expect(receivedByPair1.length).toBe(1)
    expect(receivedByPair1[0].text).toBe('Secret message in session 1')
    expect(receivedByPair1[0].sessionId).toBe(pair1.sessionId)

    // Verify Pair 2 only got message 2
    expect(receivedByPair2.length).toBe(1)
    expect(receivedByPair2[0].text).toBe('Secret message in session 2')
    expect(receivedByPair2[0].sessionId).toBe(pair2.sessionId)
  })

  it('keeps messages strictly ephemeral without persisting message content to the database', async () => {
    const userA = await createTestUserWithProfile('EphemeralA')
    const userB = await createTestUserWithProfile('EphemeralB')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const receivedPromise = new Promise<void>((resolve) => {
      clientB.on('chat:message', () => resolve())
    })

    const ack = await new Promise<ChatMessageAckResponse>((resolve) => {
      clientA.emit(
        'chat:message',
        {
          sessionId,
          clientMsgId: 'eph_msg_1',
          text: 'This message must never be stored in PostgreSQL!',
        },
        (res: ChatMessageAckResponse) => resolve(res)
      )
    })
    expect(ack.ok).toBe(true)
    await receivedPromise

    // Verify that the ChatSession record only contains session metadata, no message history
    const sessionInDb = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    })

    expect(sessionInDb).toBeDefined()
    expect(sessionInDb?.mode).toBe('TEXT')
    // ChatSession model schema has no message relations or fields
    expect(sessionInDb).not.toHaveProperty('messages')
    expect(sessionInDb).not.toHaveProperty('text')
  })
})
