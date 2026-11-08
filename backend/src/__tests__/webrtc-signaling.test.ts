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
  MatchFoundPayload,
  SessionStatePayload,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'
import {
  RtcOfferPayload,
  RtcAnswerPayload,
  RtcIcePayload,
  RtcSignalingAckResponse,
} from '@kothakoi/shared'

describe('WebRTC Phase 1: Signaling Gateway, Authorization & Role Coordination', () => {
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
    const uniqueId = `rtc_${Date.now()}_${Math.floor(Math.random() * 100000)}`
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

  // Helper to pair two users and establish an active session
  async function pairTwoUsers(
    userA: { rawToken: string; user: { id: string } },
    userB: { rawToken: string; user: { id: string } }
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
      matchA,
      matchB,
    }
  }

  it('1. assigns deterministic roles (offerer to userA, answerer to userB)', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')

    const { sessionId, matchA, matchB } = await pairTwoUsers(userA, userB)

    // Match payload verification
    expect(matchA.rtcRole).toBe('offerer')
    expect(matchB.rtcRole).toBe('answerer')

    // MatchingService helper verification
    expect(MatchingService.getParticipantRtcRole(sessionId, userA.user.id)).toBe('offerer')
    expect(MatchingService.getParticipantRtcRole(sessionId, userB.user.id)).toBe('answerer')
  })

  it('2. successfully relays offer, answer, and ICE candidates between matched peers', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    // 1. User A (offerer) sends rtc:offer
    const offerPromise = new Promise<RtcOfferPayload>((resolve) => {
      clientB.on('rtc:offer', resolve)
    })

    const sampleOfferSdp = 'v=0\r\no=- 100 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
    const offerAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:offer',
        { sessionId, sdp: sampleOfferSdp, type: 'offer' },
        (res: RtcSignalingAckResponse) => resolve(res)
      )
    })

    expect(offerAck.ok).toBe(true)
    const receivedOffer = await offerPromise
    expect(receivedOffer.sessionId).toBe(sessionId)
    expect(receivedOffer.sdp).toBe(sampleOfferSdp)

    // 2. User B (answerer) sends rtc:answer
    const answerPromise = new Promise<RtcAnswerPayload>((resolve) => {
      clientA.on('rtc:answer', resolve)
    })

    const sampleAnswerSdp = 'v=0\r\no=- 200 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
    const answerAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientB.emit(
        'rtc:answer',
        { sessionId, sdp: sampleAnswerSdp, type: 'answer' },
        (res: RtcSignalingAckResponse) => resolve(res)
      )
    })

    expect(answerAck.ok).toBe(true)
    const receivedAnswer = await answerPromise
    expect(receivedAnswer.sessionId).toBe(sessionId)
    expect(receivedAnswer.sdp).toBe(sampleAnswerSdp)

    // 3. User A and User B exchange ICE candidates
    const iceFromAPromise = new Promise<RtcIcePayload>((resolve) => {
      clientB.on('rtc:ice', resolve)
    })
    const iceFromBPromise = new Promise<RtcIcePayload>((resolve) => {
      clientA.on('rtc:ice', resolve)
    })

    const candidateA = {
      candidate: 'candidate:1 1 UDP 2130706431 192.168.1.10 5000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    }
    const candidateB = {
      candidate: 'candidate:2 1 UDP 2130706431 192.168.1.20 5001 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    }

    const iceAckA = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit('rtc:ice', { sessionId, candidate: candidateA }, resolve)
    })
    expect(iceAckA.ok).toBe(true)

    const iceAckB = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientB.emit('rtc:ice', { sessionId, candidate: candidateB }, resolve)
    })
    expect(iceAckB.ok).toBe(true)

    const [receivedIceA, receivedIceB] = await Promise.all([
      iceFromAPromise,
      iceFromBPromise,
    ])
    expect(receivedIceA.candidate.candidate).toBe(candidateA.candidate)
    expect(receivedIceB.candidate.candidate).toBe(candidateB.candidate)
  })

  it('3. rejects unauthorized third-party signaling with FORBIDDEN', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const userC = await createTestUserWithProfile('UserC')

    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)
    await new Promise<void>((resolve) => clientC.on('connect', resolve))

    let eavesdropped = false
    clientA.on('rtc:offer', () => { eavesdropped = true })
    clientB.on('rtc:offer', () => { eavesdropped = true })

    // User C attempts to inject an offer into Session 1
    const ack = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientC.emit(
        'rtc:offer',
        { sessionId, sdp: 'fake-sdp-from-attacker', type: 'offer' },
        (res: RtcSignalingAckResponse) => resolve(res)
      )
    })

    expect(ack.ok).toBe(false)
    expect(ack.error?.code).toBe('FORBIDDEN')

    // Also test rtc:ice from non-participant
    const iceAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientC.emit(
        'rtc:ice',
        {
          sessionId,
          candidate: {
            candidate: 'fake-candidate',
            sdpMid: '0',
            sdpMLineIndex: 0,
          },
        },
        (res: RtcSignalingAckResponse) => resolve(res)
      )
    })
    expect(iceAck.ok).toBe(false)
    expect(iceAck.error?.code).toBe('FORBIDDEN')

    // Verify legitimate participants did not receive unauthorized packets
    await new Promise((r) => setTimeout(r, 50))
    expect(eavesdropped).toBe(false)
  })

  it('4. rejects stale or secondary socket from multi-tab user with FORBIDDEN', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const { sessionId } = await pairTwoUsers(userA, userB)

    // User A opens a second tab with the same cookie
    const tab2 = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => tab2.on('connect', resolve))

    // Tab 2 was not the socket that joined/matched Session 1
    const ack = await new Promise<RtcSignalingAckResponse>((resolve) => {
      tab2.emit(
        'rtc:offer',
        { sessionId, sdp: 'fake-sdp-from-tab2', type: 'offer' },
        (res: RtcSignalingAckResponse) => resolve(res)
      )
    })

    expect(ack.ok).toBe(false)
    expect(ack.error?.code).toBe('FORBIDDEN')
  })

  it('5. rejects non-existent or expired sessions with NOT_IN_SESSION', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    // 1. Non-existent session
    const fakeSessionAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:offer',
        { sessionId: '00000000-0000-0000-0000-000000000000', sdp: 'dummy', type: 'offer' },
        (res: RtcSignalingAckResponse) => resolve(res)
      )
    })
    expect(fakeSessionAck.ok).toBe(false)
    expect(fakeSessionAck.error?.code).toBe('NOT_IN_SESSION')

    // 2. End session via chat:skip
    await new Promise<void>((resolve) => {
      clientA.emit('chat:skip', { sessionId }, () => resolve())
    })

    // Subsequent signaling should be rejected with NOT_IN_SESSION
    const endedAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientB.emit(
        'rtc:offer',
        { sessionId, sdp: 'dummy', type: 'offer' },
        (res: RtcSignalingAckResponse) => resolve(res)
      )
    })
    expect(endedAck.ok).toBe(false)
    expect(endedAck.error?.code).toBe('NOT_IN_SESSION')
  })

  it('6. enforces strict room isolation between concurrent chat pairs', async () => {
    // Pair 1: User A & User B
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const pair1 = await pairTwoUsers(userA, userB)

    // Pair 2: User C & User D
    const userC = await createTestUserWithProfile('UserC')
    const userD = await createTestUserWithProfile('UserD')
    const pair2 = await pairTwoUsers(userC, userD)

    let pair2ReceivedPair1Offer = false
    pair2.clientA.on('rtc:offer', () => { pair2ReceivedPair1Offer = true })
    pair2.clientB.on('rtc:offer', () => { pair2ReceivedPair1Offer = true })

    const pair1OfferPromise = new Promise<RtcOfferPayload>((resolve) => {
      pair1.clientB.on('rtc:offer', resolve)
    })

    // Pair 1 offerer emits offer
    await new Promise<RtcSignalingAckResponse>((resolve) => {
      pair1.clientA.emit(
        'rtc:offer',
        { sessionId: pair1.sessionId, sdp: 'pair1-offer-sdp', type: 'offer' },
        resolve
      )
    })

    const receivedOffer = await pair1OfferPromise
    expect(receivedOffer.sessionId).toBe(pair1.sessionId)
    expect(receivedOffer.sdp).toBe('pair1-offer-sdp')

    await new Promise((r) => setTimeout(r, 50))
    expect(pair2ReceivedPair1Offer).toBe(false)
  })

  it('7. enforces signaling order and negotiation state (rejects premature answers or ICE)', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    // 1. Answerer attempts to send rtc:answer before offer has been made
    const prematureAnswerAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientB.emit(
        'rtc:answer',
        { sessionId, sdp: 'premature-answer-sdp', type: 'answer' },
        resolve
      )
    })
    expect(prematureAnswerAck.ok).toBe(false)
    expect(prematureAnswerAck.error?.code).toBe('INVALID_STATE')

    // 2. Offerer attempts to send rtc:ice before offer has been made
    const prematureIceAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:ice',
        {
          sessionId,
          candidate: { candidate: 'cand', sdpMid: '0', sdpMLineIndex: 0 },
        },
        resolve
      )
    })
    expect(prematureIceAck.ok).toBe(false)
    expect(prematureIceAck.error?.code).toBe('INVALID_STATE')

    // 3. Send legitimate offer -> state becomes HAVE_OFFER
    const offerAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:offer',
        { sessionId, sdp: 'valid-offer-sdp', type: 'offer' },
        resolve
      )
    })
    expect(offerAck.ok).toBe(true)

    // 4. Offerer attempts to send another offer while one is already pending
    const duplicateOfferAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:offer',
        { sessionId, sdp: 'second-offer-sdp', type: 'offer' },
        resolve
      )
    })
    expect(duplicateOfferAck.ok).toBe(false)
    expect(duplicateOfferAck.error?.code).toBe('INVALID_STATE')

    // 5. Answerer sends valid answer -> state becomes STABLE
    const answerAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientB.emit(
        'rtc:answer',
        { sessionId, sdp: 'valid-answer-sdp', type: 'answer' },
        resolve
      )
    })
    expect(answerAck.ok).toBe(true)

    // 6. Answerer tries to answer again when already STABLE
    const secondAnswerAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientB.emit(
        'rtc:answer',
        { sessionId, sdp: 'duplicate-answer-sdp', type: 'answer' },
        resolve
      )
    })
    expect(secondAnswerAck.ok).toBe(false)
    expect(secondAnswerAck.error?.code).toBe('INVALID_STATE')
  })

  it('8. enforces deterministic roles and rejects role mismatch', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    // Answerer (User B) tries to send an offer
    const answererOfferAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientB.emit(
        'rtc:offer',
        { sessionId, sdp: 'offer-from-answerer', type: 'offer' },
        resolve
      )
    })
    expect(answererOfferAck.ok).toBe(false)
    expect(answererOfferAck.error?.code).toBe('ROLE_MISMATCH')

    // Legitimate offer from User A
    await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:offer',
        { sessionId, sdp: 'valid-offer', type: 'offer' },
        resolve
      )
    })

    // Offerer (User A) tries to send an answer
    const offererAnswerAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:answer',
        { sessionId, sdp: 'answer-from-offerer', type: 'answer' },
        resolve
      )
    })
    expect(offererAnswerAck.ok).toBe(false)
    expect(offererAnswerAck.error?.code).toBe('ROLE_MISMATCH')
  })

  it('9. validates payload structure and rejects oversized SDP or ICE payloads', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const { clientA, sessionId } = await pairTwoUsers(userA, userB)

    // Missing SDP
    const missingSdpAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:offer',
        { sessionId, sdp: '' } as unknown as RtcOfferPayload,
        resolve
      )
    })
    expect(missingSdpAck.ok).toBe(false)
    expect(missingSdpAck.error?.code).toBe('VALIDATION_FAILED')

    // Oversized SDP (> 64KB)
    const giantSdp = 'v=0\r\n' + 'a=candidate:'.repeat(6000)
    const giantSdpAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:offer',
        { sessionId, sdp: giantSdp, type: 'offer' },
        resolve
      )
    })
    expect(giantSdpAck.ok).toBe(false)
    expect(giantSdpAck.error?.code).toBe('VALIDATION_FAILED')

    // Giant ICE candidate (> 2KB)
    const giantCandidate = 'c'.repeat(3000)
    const giantIceAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:ice',
        {
          sessionId,
          candidate: {
            candidate: giantCandidate,
            sdpMid: '0',
            sdpMLineIndex: 0,
          },
        },
        resolve
      )
    })
    expect(giantIceAck.ok).toBe(false)
    expect(giantIceAck.error?.code).toBe('VALIDATION_FAILED')
  })

  it('10. restores deterministic rtcRole upon session restoration', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const { clientA, sessionId } = await pairTwoUsers(userA, userB)

    // Simulate page reload / reconnect
    clientA.disconnect()

    const reconnectedClientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => reconnectedClientA.on('connect', resolve))

    const restoredStatePromise = new Promise<SessionStatePayload>((resolve) => {
      reconnectedClientA.on('session:state', (state) => {
        if (state.state === 'IN_CHAT') resolve(state)
      })
    })

    const restoreAck = await new Promise<{ ok: boolean }>((resolve) => {
      reconnectedClientA.emit(
        'session:restore',
        { sessionId },
        (res: { ok: boolean }) => resolve(res)
      )
    })
    expect(restoreAck.ok).toBe(true)

    const restoredState = await restoredStatePromise
    expect(restoredState.session?.sessionId).toBe(sessionId)
    expect(restoredState.session?.rtcRole).toBe('offerer')
  })

  it('11. relays media:state (camera and mic toggles) strictly between matched peers', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const mediaStatePromise = new Promise<{
      sessionId: string
      isCamOff?: boolean
      isMicMuted?: boolean
    }>((resolve) => {
      clientB.on('media:state', (payload) => {
        resolve(payload)
      })
    })

    const ack = await new Promise<{ ok: boolean }>((resolve) => {
      clientA.emit(
        'media:state',
        {
          sessionId,
          isCamOff: true,
          isMicMuted: true,
        },
        resolve
      )
    })

    expect(ack.ok).toBe(true)
    const received = await mediaStatePromise
    expect(received.sessionId).toBe(sessionId)
    expect(received.isCamOff).toBe(true)
    expect(received.isMicMuted).toBe(true)
  })

  it('12. rejects unauthorized third-party media:state with FORBIDDEN', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const userC = await createTestUserWithProfile('UserC')
    const { sessionId } = await pairTwoUsers(userA, userB)

    const clientC = createClient(`${SESSION_COOKIE_NAME}=${userC.rawToken}`)
    await new Promise<void>((resolve) => clientC.on('connect', resolve))

    const ack = await new Promise<{ ok: boolean; error?: { code: string } }>(
      (resolve) => {
        clientC.emit(
          'media:state',
          {
            sessionId,
            isCamOff: true,
            isMicMuted: false,
          },
          resolve
        )
      }
    )

    expect(ack.ok).toBe(false)
    expect(ack.error?.code).toBe('FORBIDDEN')
  })

  it('13. rejects media:state for expired or nonexistent session with NOT_IN_SESSION', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const clientA = createClient(`${SESSION_COOKIE_NAME}=${userA.rawToken}`)
    await new Promise<void>((resolve) => clientA.on('connect', resolve))

    const ack = await new Promise<{ ok: boolean; error?: { code: string } }>(
      (resolve) => {
        clientA.emit(
          'media:state',
          {
            sessionId: 'nonexistent-session-id',
            isCamOff: true,
          },
          resolve
        )
      }
    )

    expect(ack.ok).toBe(false)
    expect(ack.error?.code).toBe('NOT_IN_SESSION')
  })

  it('14. safely buffers early ICE candidates from offerer during IDLE state and flushes on rtc:offer', async () => {
    const userA = await createTestUserWithProfile('UserA')
    const userB = await createTestUserWithProfile('UserB')
    const { clientA, clientB, sessionId } = await pairTwoUsers(userA, userB)

    const receivedIce: RtcIcePayload[] = []
    clientB.on('rtc:ice', (payload) => {
      receivedIce.push(payload)
    })

    // 1. Offerer sends ICE while still in IDLE state (e.g. host candidate gathered on setLocalDescription)
    await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:ice',
        {
          sessionId,
          candidate: { candidate: 'candidate:early-host-1', sdpMid: '0', sdpMLineIndex: 0 },
        },
        resolve
      )
    })

    // Client B should not have received it yet because offer has not been processed
    expect(receivedIce.length).toBe(0)

    // 2. Offerer sends legitimate offer
    const offerAck = await new Promise<RtcSignalingAckResponse>((resolve) => {
      clientA.emit(
        'rtc:offer',
        { sessionId, sdp: 'valid-offer-sdp', type: 'offer' },
        resolve
      )
    })
    expect(offerAck.ok).toBe(true)

    // Wait 20ms for event loop relay
    await new Promise((r) => setTimeout(r, 20))

    // Client B should now have received the flushed early candidate
    expect(receivedIce.length).toBe(1)
    expect(receivedIce[0].candidate.candidate).toBe('candidate:early-host-1')
  })
})
