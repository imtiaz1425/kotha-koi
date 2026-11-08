import { z } from 'zod'
import { env } from '../config/env'
import { AppError } from '../errors/app-error'

export interface RTCIceServerConfig {
  urls: string | string[]
  username?: string
  credential?: string
  credentialType?: string
}

export interface IceServerProvider {
  getIceServers(): Promise<RTCIceServerConfig[]>
}

export interface MeteredTurnProviderOptions {
  appName?: string
  apiKey?: string
  fetchTimeoutMs?: number
  cacheTtlMs?: number
  fetchFn?: typeof fetch
}

const rtcIceServerSchema = z
  .object({
    urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    username: z.string().optional(),
    credential: z.string().optional(),
    password: z.string().optional(),
    credentialType: z.string().optional(),
  })
  .transform((item) => ({
    urls: item.urls,
    ...(item.username ? { username: item.username } : {}),
    ...(item.credential || item.password
      ? { credential: item.credential || item.password }
      : {}),
    ...(item.credentialType ? { credentialType: item.credentialType } : {}),
  }))

const meteredResponseSchema = z.array(rtcIceServerSchema).min(1)

export class MeteredTurnProvider implements IceServerProvider {
  private readonly appName?: string
  private readonly apiKey?: string
  private readonly fetchTimeoutMs: number
  private readonly cacheTtlMs: number
  private readonly fetchFn: typeof fetch

  private cachedConfig: {
    servers: RTCIceServerConfig[]
    expiresAt: number
  } | null = null

  private inFlightRequest: Promise<RTCIceServerConfig[]> | null = null

  constructor(options: MeteredTurnProviderOptions = {}) {
    this.appName = options.appName ?? env.METERED_APP_NAME
    this.apiKey = options.apiKey ?? env.METERED_API_KEY
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? 5000
    this.cacheTtlMs = options.cacheTtlMs ?? 10 * 60 * 1000 // 10 minutes safe default
    this.fetchFn = options.fetchFn ?? globalThis.fetch
  }

  /**
   * Clears the in-memory cache and in-flight request. Useful for testing and manual cache reset.
   */
  clearCache(): void {
    this.cachedConfig = null
    this.inFlightRequest = null
  }

  /**
   * Retrieves ICE servers from cache or fetches them securely from Metered.
   */
  async getIceServers(): Promise<RTCIceServerConfig[]> {
    // 1. Check valid cached credentials
    if (this.cachedConfig && Date.now() < this.cachedConfig.expiresAt) {
      return this.cachedConfig.servers
    }

    // 2. Deduplicate concurrent requests (thundering herd protection)
    if (this.inFlightRequest) {
      return this.inFlightRequest
    }

    this.inFlightRequest = this.fetchFromProvider()
      .then((servers) => {
        this.cachedConfig = {
          servers,
          expiresAt: Date.now() + this.cacheTtlMs,
        }
        return servers
      })
      .finally(() => {
        this.inFlightRequest = null
      })

    return this.inFlightRequest
  }

  private async fetchFromProvider(): Promise<RTCIceServerConfig[]> {
    if (!this.appName || !this.apiKey) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(
          '[MeteredTurnProvider] METERED_APP_NAME or METERED_API_KEY is not configured.'
        )
      }
      throw new AppError(
        500,
        'INTERNAL',
        'WebRTC TURN service is not properly configured.'
      )
    }

    const endpointUrl = `https://${encodeURIComponent(this.appName)}.metered.live/api/v1/turn/credentials`
    const url = new URL(endpointUrl)
    url.searchParams.set('apiKey', this.apiKey)

    let response: Response
    try {
      response = await this.fetchFn(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.fetchTimeoutMs),
      })
    } catch (err: unknown) {
      const isTimeout =
        (err as { name?: string })?.name === 'TimeoutError' ||
        (err as { name?: string })?.name === 'AbortError'

      if (process.env.NODE_ENV !== 'test') {
        console.error(
          `[MeteredTurnProvider] Provider network error: ${isTimeout ? 'Request timed out' : 'Connection failed'}`
        )
      }

      throw new AppError(
        isTimeout ? 504 : 502,
        'INTERNAL',
        isTimeout
          ? 'ICE server provider request timed out.'
          : 'Failed to communicate with ICE server provider.'
      )
    }

    if (!response.ok) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(
          `[MeteredTurnProvider] Provider responded with HTTP status ${response.status}`
        )
      }
      throw new AppError(
        502,
        'INTERNAL',
        'Failed to retrieve ICE server configuration from provider.'
      )
    }

    let rawJson: unknown
    try {
      rawJson = await response.json()
    } catch {
      throw new AppError(
        502,
        'INTERNAL',
        'Invalid JSON received from ICE server provider.'
      )
    }

    const validation = meteredResponseSchema.safeParse(rawJson)
    if (!validation.success) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(
          '[MeteredTurnProvider] Provider response failed schema validation.'
        )
      }
      throw new AppError(
        502,
        'INTERNAL',
        'Provider returned invalid ICE server configuration.'
      )
    }

    // Verify at least one valid stun/turn/turns protocol url is present
    const servers = validation.data
    const hasValidProtocol = servers.some((srv) => {
      const urls = Array.isArray(srv.urls) ? srv.urls : [srv.urls]
      return urls.some(
        (u) =>
          u.startsWith('stun:') ||
          u.startsWith('turn:') ||
          u.startsWith('turns:')
      )
    })

    if (!hasValidProtocol) {
      throw new AppError(
        502,
        'INTERNAL',
        'Provider returned no usable STUN/TURN server URLs.'
      )
    }

    return servers
  }
}

/**
 * Provider-independent TURN service wrapper.
 * Can be swapped with another provider (e.g., Cloudflare Calls) without altering routes or controllers.
 */
export class TurnService {
  private provider: IceServerProvider

  constructor(provider?: IceServerProvider) {
    this.provider = provider ?? new MeteredTurnProvider()
  }

  setProvider(provider: IceServerProvider): void {
    this.provider = provider
  }

  getProvider(): IceServerProvider {
    return this.provider
  }

  async getIceServers(): Promise<RTCIceServerConfig[]> {
    return this.provider.getIceServers()
  }
}

export const turnService = new TurnService()

