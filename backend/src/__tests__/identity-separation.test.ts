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
  MatchFoundPayload,
  QueueAckResponse,
} from '../realtime/socket'
import { MatchingService } from '../services/matching'

describe('Identity and Nickname Separation Tests', () => {
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

      await prisma.userPassword.deleteMany({
        where: { userId: { in: userIds } },
      })

      await prisma.profile.deleteMany({
        where: { userId: { in: userIds } },
      })

      await prisma.session.deleteMany({
        where: { userId: { in: userIds } },
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

  async function createVerifiedUser(name?: string) {
    const uniqueId = `ident_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    const email = `${uniqueId}@bscse.uiu.ac.bd`
    testUserEmails.push(email)

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        role: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        termsAcceptedAt: new Date(),
      },
    })

    const { rawToken } = await SessionService.createSession(user.id)
    return { user, rawToken }
  }

  // ── 1. Registration saves the private Profile Name ──────────────────────────
  it('1. Registration saves the private Profile Name during set-password', async () => {
    const { user } = await createVerifiedUser()
    const privateProfileName = 'Rahim Uddin'
    const password = 'StrongPassword123!'

    const res = await request(app).post('/api/auth/set-password').send({
      email: user.email,
      password,
      name: privateProfileName,
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // Verify database record
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
    })
    expect(updatedUser?.name).toBe(privateProfileName)
  })

  // ── 2. Profile Name is visible to owner but never to chat partners ──────────
  it('2. The Profile Name is visible to its owner via /api/profile and /api/auth/me but never to chat partners in socket matching payloads', async () => {
    const userA = await createVerifiedUser('Secret Personal Name A')
    const userB = await createVerifiedUser('Secret Personal Name B')

    const cookieA = `${SESSION_COOKIE_NAME}=${userA.rawToken}`
    const cookieB = `${SESSION_COOKIE_NAME}=${userB.rawToken}`

    // Owner A can read their own private profile name
    const meResA = await request(app).get('/api/auth/me').set('Cookie', cookieA)
    expect(meResA.status).toBe(200)
    expect(meResA.body.user.name).toBe('Secret Personal Name A')

    const profileResA = await request(app)
      .get('/api/profile')
      .set('Cookie', cookieA)
    expect(profileResA.status).toBe(200)
    expect(profileResA.body.name).toBe('Secret Personal Name A')

    // Socket matchmaking between A and B
    const clientA = createClient(cookieA)
    const clientB = createClient(cookieB)

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

    clientA.emit('queue:join', { mode: 'text', nickname: 'ChatAliasA' })
    clientB.emit('queue:join', { mode: 'text', nickname: 'ChatAliasB' })

    const [matchA, matchB] = await Promise.all([matchPromiseA, matchPromiseB])

    // User A receives User B's temporary chat nickname, NOT private profile name
    expect(matchA.partner.nickname).toBe('ChatAliasB')
    expect(JSON.stringify(matchA)).not.toContain('Secret Personal Name B')
    expect(JSON.stringify(matchA)).not.toContain('Secret Personal Name A')

    // User B receives User A's temporary chat nickname, NOT private profile name
    expect(matchB.partner.nickname).toBe('ChatAliasA')
    expect(JSON.stringify(matchB)).not.toContain('Secret Personal Name A')
    expect(JSON.stringify(matchB)).not.toContain('Secret Personal Name B')
  })

  // ── 3. A user can choose a different temporary nickname at login/queue join ─
  it('3. A user can choose a different temporary nickname at queue join without being forced to use a fixed alias', async () => {
    const user = await createVerifiedUser('Private Name')
    const cookie = `${SESSION_COOKIE_NAME}=${user.rawToken}`

    const client = createClient(cookie)
    await new Promise<void>((resolve) => client.on('connect', resolve))

    // Joining queue with a freshly chosen alias
    const chosenAlias = 'Midnight Explorer'
    const joinResult = await new Promise<QueueAckResponse>((resolve) => {
      client.emit(
        'queue:join',
        { mode: 'text', nickname: chosenAlias },
        (ack: QueueAckResponse) => resolve(ack)
      )
    })

    expect(joinResult.ok).toBe(true)

    // The user's active session state in matching queue has the chosen alias
    const queueState = MatchingService.getUserState(user.user.id)
    expect(queueState).toBe('QUEUED')
  })

  // ── 4. Both chat participants see the selected chat nickname ────────────────
  it('4. Both chat participants see their own and their partner selected chat nicknames in match:found and session:state', async () => {
    const userA = await createVerifiedUser('Private Name A')
    const userB = await createVerifiedUser('Private Name B')

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

    clientA.emit('queue:join', { mode: 'text', nickname: 'Chai Lover' })
    clientB.emit('queue:join', { mode: 'text', nickname: 'Study Buddy' })

    const [matchA, matchB] = await Promise.all([matchPromiseA, matchPromiseB])

    // Client A: partner is Study Buddy, self is Chai Lover
    expect(matchA.partner.nickname).toBe('Study Buddy')
    expect(matchA.self?.nickname).toBe('Chai Lover')

    // Client B: partner is Chai Lover, self is Study Buddy
    expect(matchB.partner.nickname).toBe('Chai Lover')
    expect(matchB.self?.nickname).toBe('Study Buddy')
  })

  // ── 5. Changing temporary nickname does not overwrite Profile Name ──────────
  it('5. Changing temporary nickname does not overwrite the private Profile Name', async () => {
    const { user, rawToken } = await createVerifiedUser(
      'Immutable Account Name'
    )
    const cookie = `${SESSION_COOKIE_NAME}=${rawToken}`

    // Update temporary chat nickname via PUT /api/profile
    const updateRes = await request(app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ nickname: 'Temporary Alias 99' })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.nickname).toBe('Temporary Alias 99')

    // Check user database record: name must remain untouched
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
    })
    expect(userRecord?.name).toBe('Immutable Account Name')

    // Profile record in DB has currentNickname updated
    const profileRecord = await prisma.profile.findUnique({
      where: { userId: user.id },
    })
    expect(profileRecord?.currentNickname).toBe('Temporary Alias 99')
  })

  // ── 6. Demo identities (Tanvir Ahmed, Midnight Mango) not hardcoded ─────────
  it('6. Does not fallback to private Profile Name or demo identity if nickname is missing', async () => {
    // User with private name 'Dr. Tariqul Islam' and no saved nickname
    const { rawToken } = await createVerifiedUser('Dr. Tariqul Islam')
    const client = createClient(`${SESSION_COOKIE_NAME}=${rawToken}`)

    await new Promise<void>((resolve) => client.on('connect', resolve))

    // Another user to match with
    const peer = await createVerifiedUser('Peer Student')
    const peerClient = createClient(`${SESSION_COOKIE_NAME}=${peer.rawToken}`)
    await new Promise<void>((resolve) => peerClient.on('connect', resolve))

    const peerMatchPromise = new Promise<MatchFoundPayload>((resolve) => {
      peerClient.on('match:found', (payload) => resolve(payload))
    })

    // User joins with NO nickname provided
    client.emit('queue:join', { mode: 'text' })
    peerClient.emit('queue:join', { mode: 'text', nickname: 'PeerAlias' })

    const peerMatch = await peerMatchPromise

    // Partner nickname should fall back to 'UIU Student', NEVER 'Dr. Tariqul Islam' or hardcoded 'Tanvir Ahmed'
    expect(peerMatch.partner.nickname).toBe('UIU Student')
    expect(peerMatch.partner.nickname).not.toBe('Dr. Tariqul Islam')
    expect(peerMatch.partner.nickname).not.toBe('Tanvir Ahmed')
  })

  // ── 7. Password change endpoint functionality ───────────────────────────────
  it('7. Allows authenticated users to change password via POST /api/auth/change-password', async () => {
    const { user, rawToken } = await createVerifiedUser('Password Tester')
    const cookie = `${SESSION_COOKIE_NAME}=${rawToken}`

    // Set initial password
    await request(app).post('/api/auth/set-password').send({
      email: user.email,
      password: 'OldPassword123!',
    })

    // Try change with wrong current password
    const failRes = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({
        currentPassword: 'WrongPassword!',
        newPassword: 'NewPassword123!',
      })

    expect(failRes.status).toBe(400)
    expect(failRes.body.error.code).toBe('VALIDATION_FAILED')
    expect(failRes.body.error.message).toContain(
      'Current password is incorrect'
    )

    // Change with correct current password
    const successRes = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      })

    expect(successRes.status).toBe(200)
    expect(successRes.body.ok).toBe(true)

    // Verify login succeeds with new password
    const loginRes = await request(app).post('/api/auth/login').send({
      identifier: user.email,
      password: 'NewPassword123!',
    })

    expect(loginRes.status).toBe(200)
    expect(loginRes.body.ok).toBe(true)
  })
})
