import { describe, it, expect, beforeEach, vi, afterAll, beforeAll } from 'vitest'
import request from 'supertest'
import app from '../app'
import prisma from '../db'
import {
  MeteredTurnProvider,
  TurnService,
  turnService,
  RTCIceServerConfig,
} from '../services/turn.service'
import { iceServersRateLimiter } from '../utils/rate-limiter'
import { SessionService, SESSION_COOKIE_NAME } from '../services/session'
import { validateEnv } from '../config/env'

describe('WebRTC TURN Service & ICE Servers API', () => {
  const mockValidMeteredResponse = [
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:443',
        'turn:global.relay.metered.ca:443?transport=tcp',
        'turns:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'temp-turn-user-12345',
      credential: 'temp-turn-password-secret',
    },
  ]

  beforeEach(() => {
    iceServersRateLimiter.reset()
  })

  describe('1. Environment Configuration & Sanitization', () => {
    it('validates environment schema with METERED variables present', () => {
      const result = validateEnv({
        NODE_ENV: 'test',
        PORT: '5000',
        SESSION_SECRET: 'min-16-characters-session-secret',
        DATABASE_URL: 'postgresql://localhost:5432/test',
        METERED_APP_NAME: 'kothakoi',
        METERED_API_KEY: 'test-metered-api-key-999',
      })

      expect(result.success).toBe(true)
      expect(result.data?.METERED_APP_NAME).toBe('kothakoi')
      expect(result.data?.METERED_API_KEY).toBe('test-metered-api-key-999')
    })

    it('does not expose secret values in errors or validation logs', () => {
      const sensitiveKey = 'super-secret-metered-key-should-not-leak'
      const provider = new MeteredTurnProvider({
        appName: 'kothakoi',
        apiKey: sensitiveKey,
        fetchFn: vi.fn().mockRejectedValue(new Error('Network down')),
      })

      return expect(provider.getIceServers()).rejects.toSatisfy(
        (err: unknown) => {
          expect((err as Error).message).not.toContain(sensitiveKey)
          return true
        }
      )
    })
  })

  describe('2. MeteredTurnProvider Unit Behavior', () => {
    it('successfully fetches and validates ICE servers from Metered', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockValidMeteredResponse,
      })

      const provider = new MeteredTurnProvider({
        appName: 'kothakoi',
        apiKey: 'test-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      })

      const servers = await provider.getIceServers()
      expect(servers).toHaveLength(2)
      expect(servers[0].urls).toBe('stun:stun.relay.metered.ca:80')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Ensure request called the correct endpoint with apiKey
      const requestedUrl = mockFetch.mock.calls[0][0] as string
      expect(requestedUrl).toContain('https://kothakoi.metered.live/api/v1/turn/credentials')
      expect(requestedUrl).toContain('apiKey=test-key')
    })

    it('caches valid ICE server responses and avoids repeated network calls', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockValidMeteredResponse,
      })

      const provider = new MeteredTurnProvider({
        appName: 'kothakoi',
        apiKey: 'test-key',
        cacheTtlMs: 5000,
        fetchFn: mockFetch as unknown as typeof fetch,
      })

      const call1 = await provider.getIceServers()
      const call2 = await provider.getIceServers()
      const call3 = await provider.getIceServers()

      expect(call1).toEqual(call2)
      expect(call2).toEqual(call3)
      // Only one network request occurred because results were cached
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('deduplicates concurrent in-flight requests (thundering herd protection)', async () => {
      let resolvePromise: (value: unknown) => void
      const deferredFetch = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const provider = new MeteredTurnProvider({
        appName: 'kothakoi',
        apiKey: 'test-key',
        fetchFn: deferredFetch as unknown as typeof fetch,
      })

      const pendingCall1 = provider.getIceServers()
      const pendingCall2 = provider.getIceServers()

      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => mockValidMeteredResponse,
      })

      const [res1, res2] = await Promise.all([pendingCall1, pendingCall2])
      expect(res1).toEqual(res2)
      expect(deferredFetch).toHaveBeenCalledTimes(1)
    })

    it('fails safely when provider responds with HTTP error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const provider = new MeteredTurnProvider({
        appName: 'kothakoi',
        apiKey: 'bad-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      })

      await expect(provider.getIceServers()).rejects.toThrow(
        /Failed to retrieve ICE server configuration from provider/
      )
    })

    it('fails safely when request times out', async () => {
      const timeoutError = new Error('Timeout')
      timeoutError.name = 'TimeoutError'
      const mockFetch = vi.fn().mockRejectedValue(timeoutError)

      const provider = new MeteredTurnProvider({
        appName: 'kothakoi',
        apiKey: 'test-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      })

      await expect(provider.getIceServers()).rejects.toThrow(
        /ICE server provider request timed out/
      )
    })

    it('rejects malformed response payloads that violate ICE server schema', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ invalidField: 12345 }],
      })

      const provider = new MeteredTurnProvider({
        appName: 'kothakoi',
        apiKey: 'test-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      })

      await expect(provider.getIceServers()).rejects.toThrow(
        /Provider returned invalid ICE server configuration/
      )
    })

    it('rejects responses with no valid STUN or TURN protocol URLs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ urls: 'http://not-a-stun-or-turn-url.com' }],
      })

      const provider = new MeteredTurnProvider({
        appName: 'kothakoi',
        apiKey: 'test-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      })

      await expect(provider.getIceServers()).rejects.toThrow(
        /Provider returned no usable STUN\/TURN server URLs/
      )
    })
  })

  describe('3. TurnService Provider Swapping', () => {
    it('allows swapping the underlying ICE server provider transparently', async () => {
      const customProvider = {
        async getIceServers(): Promise<RTCIceServerConfig[]> {
          return [{ urls: 'stun:custom-stun-server.com:3478' }]
        },
      }

      const service = new TurnService(customProvider)
      const servers = await service.getIceServers()

      expect(servers).toEqual([{ urls: 'stun:custom-stun-server.com:3478' }])
    })
  })

  describe('4. GET /api/webrtc/ice-servers Integration & Security', () => {
    let testUserId: string
    let sessionCookie: string

    beforeAll(async () => {
      await prisma.$connect()

      // Create test user and valid session
      const email = `test-webrtc-${Date.now()}@uiu.ac.bd`
      const user = await prisma.user.create({
        data: {
          email,
          status: 'ACTIVE',
        },
      })
      testUserId = user.id

      const { rawToken } = await SessionService.createSession(testUserId)
      sessionCookie = `${SESSION_COOKIE_NAME}=${rawToken}`
    })

    afterAll(async () => {
      await prisma.session.deleteMany({ where: { userId: testUserId } })
      await prisma.user.deleteMany({ where: { id: testUserId } })
      await prisma.$disconnect()
    })

    it('returns 401 UNAUTHENTICATED without session cookie', async () => {
      const res = await request(app).get('/api/webrtc/ice-servers')
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('returns 200 with iceServers for authenticated session', async () => {
      // Mock the provider response on the global turnService
      const mockProvider = {
        getIceServers: vi.fn().mockResolvedValue(mockValidMeteredResponse),
      }
      turnService.setProvider(mockProvider)

      const res = await request(app)
        .get('/api/webrtc/ice-servers')
        .set('Cookie', sessionCookie)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('iceServers')
      expect(Array.isArray(res.body.iceServers)).toBe(true)
      expect(res.body.iceServers).toEqual(mockValidMeteredResponse)

      // Ensure sensitive server credentials or API keys are NEVER returned in response
      expect(res.body).not.toHaveProperty('apiKey')
      expect(res.body).not.toHaveProperty('METERED_API_KEY')
      expect(JSON.stringify(res.body)).not.toContain('apiKey')
    })

    it('enforces rate limiting when requests exceed 30 per minute', async () => {
      const mockProvider = {
        getIceServers: vi.fn().mockResolvedValue(mockValidMeteredResponse),
      }
      turnService.setProvider(mockProvider)

      // Consume 30 requests (the limit)
      for (let i = 0; i < 30; i++) {
        const res = await request(app)
          .get('/api/webrtc/ice-servers')
          .set('Cookie', sessionCookie)
        expect(res.status).toBe(200)
      }

      // 31st request should be rejected with 429 RATE_LIMITED
      const rateLimitedRes = await request(app)
        .get('/api/webrtc/ice-servers')
        .set('Cookie', sessionCookie)

      expect(rateLimitedRes.status).toBe(429)
      expect(rateLimitedRes.body.error.code).toBe('RATE_LIMITED')
      expect(rateLimitedRes.body.error.details).toHaveProperty(
        'retryAfterSeconds'
      )
    })

    it('handles provider internal errors gracefully without revealing secrets', async () => {
      iceServersRateLimiter.reset()

      const failingProvider = {
        getIceServers: vi
          .fn()
          .mockRejectedValue(new Error('Internal upstream connection failure')),
      }
      turnService.setProvider(failingProvider)

      const res = await request(app)
        .get('/api/webrtc/ice-servers')
        .set('Cookie', sessionCookie)

      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL')
      // Ensure error payload does not reveal internal error specifics or sensitive tokens
      expect(res.body.error.message).toBe('Internal server error')
    })
  })
})
