import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getIceServers,
  clearIceServersCache,
  FALLBACK_ICE_SERVERS,
  DEFAULT_RTC_CONFIG,
} from '../api/iceServers'
import { apiClient } from '../api/client'

describe('Frontend WebRTC ICE Servers Retrieval & Fallback', () => {
  const mockBackendIceServers: RTCIceServer[] = [
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:443',
        'turn:global.relay.metered.ca:443?transport=tcp',
        'turns:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'temp-metered-user-xyz',
      credential: 'temp-metered-credential-secret',
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    clearIceServersCache()
  })

  it('1. Successfully retrieves ICE servers from backend with session cookie', async () => {
    const getSpy = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ iceServers: mockBackendIceServers })

    const servers = await getIceServers()

    expect(getSpy).toHaveBeenCalledWith('/webrtc/ice-servers')
    expect(servers).toEqual(mockBackendIceServers)
    expect(servers).toHaveLength(2)

    // Verify all transport protocols are preserved intact
    const turnEntry = servers[1]
    expect(turnEntry.urls).toContain(
      'turns:global.relay.metered.ca:443?transport=tcp'
    )
    expect(turnEntry.urls).toContain(
      'turn:global.relay.metered.ca:443?transport=tcp'
    )
  })

  it('2. Caches valid ICE servers in memory and avoids redundant HTTP requests', async () => {
    const getSpy = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ iceServers: mockBackendIceServers })

    const call1 = await getIceServers()
    const call2 = await getIceServers()
    const call3 = await getIceServers()

    expect(call1).toEqual(mockBackendIceServers)
    expect(call2).toEqual(mockBackendIceServers)
    expect(call3).toEqual(mockBackendIceServers)
    // Only one HTTP request made because subsequent calls are served from cache
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('3. Deduplicates concurrent in-flight requests', async () => {
    let resolvePromise: (val: any) => void
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })

    const getSpy = vi
      .spyOn(apiClient, 'get')
      .mockReturnValue(pendingPromise as any)

    const request1 = getIceServers()
    const request2 = getIceServers()

    resolvePromise!({ iceServers: mockBackendIceServers })

    const [res1, res2] = await Promise.all([request1, request2])

    expect(res1).toEqual(mockBackendIceServers)
    expect(res2).toEqual(mockBackendIceServers)
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('4. Falls back safely to Google STUN if backend endpoint fails with error', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(apiClient, 'get').mockRejectedValue(
      new Error('500 Internal Server Error')
    )

    const servers = await getIceServers()

    expect(servers).toEqual(FALLBACK_ICE_SERVERS)
    expect(consoleWarnSpy).toHaveBeenCalled()
    expect(servers[0].urls).toBe('stun:stun.l.google.com:19302')
  })

  it('5. Falls back safely to Google STUN if backend returns empty iceServers array', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(apiClient, 'get').mockResolvedValue({ iceServers: [] })

    const servers = await getIceServers()

    expect(servers).toEqual(FALLBACK_ICE_SERVERS)
    expect(consoleWarnSpy).toHaveBeenCalled()
  })

  it('6. clearIceServersCache forces a fresh backend request on next call', async () => {
    const getSpy = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ iceServers: mockBackendIceServers })

    await getIceServers()
    expect(getSpy).toHaveBeenCalledTimes(1)

    clearIceServersCache()

    await getIceServers()
    expect(getSpy).toHaveBeenCalledTimes(2)
  })

  it('7. DEFAULT_RTC_CONFIG contains candidatePoolSize and fallback STUN servers', () => {
    expect(DEFAULT_RTC_CONFIG.iceServers).toEqual(FALLBACK_ICE_SERVERS)
    expect(DEFAULT_RTC_CONFIG.iceCandidatePoolSize).toBe(2)
  })
})

