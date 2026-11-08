import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Chat from '../pages/Chat'
import { useWebRTC } from '../hooks/useWebRTC'

describe('WebRTC Video & Calling Architecture Tests (Phase 2 & Phase 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('1. Chat page renders both localVideo and remoteVideo elements with proper attributes', () => {
    const html = renderToString(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )

    // Verify remote video element exists with autoPlay and playsInline
    expect(html).toContain('id="remoteVideo"')
    expect(html).toContain('autoplay=""')
    expect(html).toContain('playsinline=""')

    // Verify local video element exists with muted, autoPlay and playsInline
    expect(html).toContain('id="localVideo"')
    expect(html).toContain('muted=""')

    // Verify local video placeholder exists for initial camera loading
    expect(html).toContain('id="localVideoPlaceholder"')
    expect(html).toContain('Starting camera...')
  })

  it('2. Local and remote video tiles are both horizontally mirrored using CSS -scale-x-100', () => {
    const html = renderToString(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )

    // Local video should have muted attribute
    expect(html).toContain('muted=""')

    // Local video is horizontally mirrored with CSS -scale-x-100
    expect(html).toMatch(/id="localVideo"[^>]*-(?:scale-x-100)/)

    // Remote video is also horizontally mirrored with CSS -scale-x-100
    expect(html).toMatch(/id="remoteVideo"[^>]*-(?:scale-x-100)/)
  })

  it('3. Stranger presentation maintains live P2P status indicator', () => {
    const html = renderToString(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )

    expect(html).toContain('wifi')
    expect(html).toContain('Connecting to Queue')
  })

  it('4. Minimal camera and microphone controls remain intact without obsolete flip/switch controls', () => {
    const html = renderToString(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )

    // Preserved essential controls
    expect(html).toContain('id="btn-toggle-cam"')
    expect(html).toContain('id="btn-toggle-mic"')

    // Obsolete flip/switch controls removed
    expect(html).not.toContain('id="btn-pip-flip"')
    expect(html).not.toContain('id="btn-switch-cam"')
    expect(html).not.toContain('id="btn-switch-camera"')
  })

  it('5. Self video renders dedicated mic and cam status badges', () => {
    const html = renderToString(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )

    expect(html).toContain('id="self-mic-badge"')
    expect(html).toContain('id="self-cam-badge"')
  })

  it('6. Camera and Microphone controls operate independently on MediaStreamTracks', async () => {
    const mockVideoTrack = {
      kind: 'video',
      enabled: true,
      stop: vi.fn(),
    }
    const mockAudioTrack = {
      kind: 'audio',
      enabled: true,
      stop: vi.fn(),
    }

    const mockStream = {
      getTracks: () => [mockVideoTrack, mockAudioTrack],
      getVideoTracks: () => [mockVideoTrack],
      getAudioTracks: () => [mockAudioTrack],
    }

    const mockSender = {
      track: mockVideoTrack,
      replaceTrack: vi.fn().mockResolvedValue(undefined),
    }

    const mockPeerConnection = {
      addTrack: vi.fn(),
      addTransceiver: vi.fn(),
      getSenders: () => [mockSender],
      createOffer: vi.fn().mockResolvedValue({ sdp: 'mock-sdp', type: 'offer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      signalingState: 'stable',
    }

    const origWindow = globalThis.window
    const origMediaDevices = globalThis.navigator?.mediaDevices
    const origRTCPeerConnection = (globalThis as any).RTCPeerConnection

    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = globalThis
    }
    const win9 = (globalThis as any).window
    win9.location = { hostname: '10.15.30.169', protocol: 'http:' }
    win9.isSecureContext = false
    win9.RTCPeerConnection = vi.fn().mockImplementation(() => mockPeerConnection)
    ;(globalThis as any).RTCPeerConnection = win9.RTCPeerConnection

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    })

    try {
      let hookResult: any = null
      function TestComponent() {
        hookResult = useWebRTC({
          sessionId: 'test-session-123',
          rtcRole: 'offerer',
          enabled: true,
        })
        return null
      }

      renderToString(<TestComponent />)

      expect(hookResult).not.toBeNull()

      // Explicitly trigger session initialization in SSR test environment
      hookResult.retryMedia()
      await new Promise((r) => setTimeout(r, 20))

      // Initially both enabled
      expect(mockVideoTrack.enabled).toBe(true)
      expect(mockAudioTrack.enabled).toBe(true)

      // 1. Toggle camera off
      hookResult.toggleCamera(true)
      expect(mockVideoTrack.enabled).toBe(false)
      // Verify audio track was not affected!
      expect(mockAudioTrack.enabled).toBe(true)

      // 2. Toggle microphone off
      hookResult.toggleMicrophone(true)
      expect(mockAudioTrack.enabled).toBe(false)
      // Video track remains off
      expect(mockVideoTrack.enabled).toBe(false)

      // 3. Unmute camera independently
      hookResult.toggleCamera(false)
      expect(mockVideoTrack.enabled).toBe(true)
      // Audio track remains muted
      expect(mockAudioTrack.enabled).toBe(false)

      // PeerConnection must NOT have been closed!
      expect(mockPeerConnection.close).not.toHaveBeenCalled()
    } finally {
      if (origWindow === undefined) {
        delete (globalThis as any).window
      } else {
        globalThis.window = origWindow
      }
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: origMediaDevices,
        configurable: true,
        writable: true,
      })
      ;(globalThis as any).RTCPeerConnection = origRTCPeerConnection
    }
  })

  it('7. Always initializes front-facing camera with facingMode user and does not expose switchCamera', async () => {
    const origVideoTrack = {
      kind: 'video',
      enabled: true,
      stop: vi.fn(),
    }
    const mockAudioTrack = {
      kind: 'audio',
      enabled: true,
      stop: vi.fn(),
    }

    const mockLocalStream = {
      getTracks: () => [origVideoTrack, mockAudioTrack],
      getVideoTracks: () => [origVideoTrack],
      getAudioTracks: () => [mockAudioTrack],
      removeTrack: vi.fn(),
      addTrack: vi.fn(),
    }

    const mockSender = {
      track: origVideoTrack,
      replaceTrack: vi.fn().mockResolvedValue(undefined),
    }

    const mockPeerConnection = {
      addTrack: vi.fn(),
      addTransceiver: vi.fn(),
      getSenders: () => [mockSender],
      createOffer: vi.fn().mockResolvedValue({ sdp: 'mock-sdp', type: 'offer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      signalingState: 'stable',
    }

    const origWindow = globalThis.window
    const origMediaDevices = globalThis.navigator?.mediaDevices
    const origRTCPeerConnection = (globalThis as any).RTCPeerConnection

    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = globalThis
    }
    const win9 = (globalThis as any).window
    win9.location = { hostname: '10.15.30.169', protocol: 'http:' }
    win9.isSecureContext = false
    win9.RTCPeerConnection = vi.fn().mockImplementation(() => mockPeerConnection)
    ;(globalThis as any).RTCPeerConnection = win9.RTCPeerConnection

    const getUserMediaMock = vi.fn().mockResolvedValue(mockLocalStream)

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: getUserMediaMock,
      },
      configurable: true,
      writable: true,
    })

    try {
      let hookResult: any = null
      function TestComponent() {
        hookResult = useWebRTC({
          sessionId: 'test-session-456',
          rtcRole: 'offerer',
          enabled: true,
        })
        return null
      }

      renderToString(<TestComponent />)
      expect(hookResult).not.toBeNull()

      hookResult.retryMedia()
      await new Promise((r) => setTimeout(r, 20))

      // Always initializes front camera with facingMode: 'user'
      expect(getUserMediaMock).toHaveBeenCalledWith({
        video: { facingMode: 'user' },
        audio: false,
      })

      // switchCamera and facingMode are completely removed
      expect(hookResult.switchCamera).toBeUndefined()
      expect(hookResult.facingMode).toBeUndefined()
    } finally {
      if (origWindow === undefined) {
        delete (globalThis as any).window
      } else {
        globalThis.window = origWindow
      }
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: origMediaDevices,
        configurable: true,
        writable: true,
      })
      ;(globalThis as any).RTCPeerConnection = origRTCPeerConnection
    }
  })

  it('8. Handles permission denial gracefully without throwing unhandled exceptions', async () => {
    const origWindow = globalThis.window
    const origMediaDevices = globalThis.navigator?.mediaDevices
    const origRTCPeerConnection = (globalThis as any).RTCPeerConnection

    const deniedError = new Error('Permission denied')
    deniedError.name = 'NotAllowedError'

    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = globalThis
    }
    (globalThis as any).window.RTCPeerConnection = vi.fn().mockImplementation(() => ({
      addTrack: vi.fn(),
      addTransceiver: vi.fn(),
      getSenders: () => [],
      close: vi.fn(),
    }))
    ;(globalThis as any).RTCPeerConnection = (globalThis as any).window.RTCPeerConnection

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(deniedError),
      },
      configurable: true,
      writable: true,
    })

    try {
      let hookResult: any = null
      function TestComponent() {
        hookResult = useWebRTC({
          sessionId: 'test-session-denied',
          rtcRole: 'offerer',
          enabled: true,
        })
        return null
      }

      renderToString(<TestComponent />)
      expect(hookResult).not.toBeNull()

      // retryMedia handles rejection safely without throwing unhandled promise rejection
      await expect(
        Promise.resolve().then(() => hookResult!.retryMedia())
      ).resolves.not.toThrow()
    } finally {
      if (origWindow === undefined) {
        delete (globalThis as any).window
      } else {
        globalThis.window = origWindow
      }
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: origMediaDevices,
        configurable: true,
        writable: true,
      })
      ;(globalThis as any).RTCPeerConnection = origRTCPeerConnection
    }
  })

  it('9. Supports Receive-Only WebRTC when local camera capture is unavailable (e.g. HTTP on mobile)', async () => {
    const origWindow = globalThis.window
    const origMediaDevices = globalThis.navigator?.mediaDevices
    const origRTCPeerConnection = (globalThis as any).RTCPeerConnection

    const mockAddTransceiver = vi.fn()
    const mockPeerConnection = {
      addTrack: vi.fn(),
      addTransceiver: mockAddTransceiver,
      getSenders: () => [],
      createOffer: vi.fn().mockResolvedValue({ sdp: 'mock-sdp-recvonly', type: 'offer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      signalingState: 'stable',
    }

    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = globalThis
    }
    const win9 = (globalThis as any).window
    win9.location = { hostname: '10.15.30.169', protocol: 'http:' }
    win9.isSecureContext = false
    win9.RTCPeerConnection = vi.fn().mockImplementation(() => mockPeerConnection)
    ;(globalThis as any).RTCPeerConnection = win9.RTCPeerConnection

    // Simulate mobile browser over HTTP (navigator.mediaDevices.getUserMedia is undefined)
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    try {
      let hookResult: any = null
      function TestComponent() {
        hookResult = useWebRTC({
          sessionId: 'session-iphone-recvonly',
          rtcRole: 'offerer',
          enabled: true,
        })
        return null
      }

      renderToString(<TestComponent />)
      expect(hookResult).not.toBeNull()

      // Trigger session start
      hookResult.retryMedia()
      await new Promise((r) => setTimeout(r, 20))

      // Crucial: WebRTC is NOT aborted! Peer connection was created!
      expect(mockAddTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' })
      expect(mockAddTransceiver).toHaveBeenCalledWith('audio', { direction: 'recvonly' })
      expect(hookResult.mediaError).toBeNull()
    } finally {
      if (origWindow === undefined) {
        delete (globalThis as any).window
      } else {
        globalThis.window = origWindow
      }
      Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: origMediaDevices,
        configurable: true,
        writable: true,
      })
      ;(globalThis as any).RTCPeerConnection = origRTCPeerConnection
    }
  })
})
