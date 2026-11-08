import { apiClient } from './client'

export const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: FALLBACK_ICE_SERVERS,
  iceCandidatePoolSize: 2,
}

let cachedIceServers: RTCIceServer[] | null = null
let cacheExpiresAt = 0
let inFlightFetch: Promise<RTCIceServer[]> | null = null

// 10-minute in-memory cache to absorb repeated Next button clicks
const CACHE_TTL_MS = 10 * 60 * 1000

/**
 * Clears the in-memory ICE servers cache. Used for unit testing and manual reset.
 */
export function clearIceServersCache(): void {
  cachedIceServers = null
  cacheExpiresAt = 0
  inFlightFetch = null
}

/**
 * Retrieves ICE server configuration from the backend API (/api/webrtc/ice-servers).
 * Transmits session cookie automatically via apiClient.
 * If the backend endpoint fails or is unauthenticated, safely falls back to Google STUN.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now()
  if (cachedIceServers && now < cacheExpiresAt) {
    return cachedIceServers
  }

  if (inFlightFetch) {
    return inFlightFetch
  }

  inFlightFetch = (async () => {
    try {
      const response = await apiClient.get<{ iceServers: RTCIceServer[] }>(
        '/webrtc/ice-servers'
      )

      if (
        response &&
        Array.isArray(response.iceServers) &&
        response.iceServers.length > 0
      ) {
        cachedIceServers = response.iceServers
        cacheExpiresAt = Date.now() + CACHE_TTL_MS
        return response.iceServers
      }

      console.warn(
        '[WebRTC] Backend returned empty ICE servers, falling back to Google STUN.'
      )
      return FALLBACK_ICE_SERVERS
    } catch (err) {
      console.warn(
        '[WebRTC] Failed to retrieve TURN configuration from backend, falling back to Google STUN:',
        err
      )
      return FALLBACK_ICE_SERVERS
    } finally {
      inFlightFetch = null
    }
  })()

  return inFlightFetch
}

