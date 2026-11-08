import { useState, useRef, useEffect, useCallback } from 'react'
import { getSocket } from '../api/socket'
import type {
  RtcRole,
  RtcOfferPayload,
  RtcAnswerPayload,
  RtcIcePayload,
  MediaStatePayload,
} from '@kothakoi/shared'
import { getIceServers } from '../api/iceServers'

export interface UseWebRTCOptions {
  sessionId: string | null
  rtcRole: RtcRole | null
  enabled?: boolean
}

export interface UseWebRTCResult {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  connectionState: RTCPeerConnectionState
  mediaError: string | null
  localCameraError: string | null
  localVideoRef: React.RefObject<HTMLVideoElement>
  remoteVideoRef: React.RefObject<HTMLVideoElement>
  retryMedia: () => void
  isCamOff: boolean
  isMicMuted: boolean
  remoteMediaState: {
    isCamOff: boolean
    isMicMuted: boolean
  }
  toggleCamera: (forceState?: boolean) => void
  toggleMicrophone: (forceState?: boolean) => void
}

/**
 * useWebRTC — Dedicated React hook managing RTCPeerConnection,
 * continuous local camera preview, receive-only WebRTC fallback when
 * media capture is unavailable, and Socket.IO WebRTC signaling.
 */
export function useWebRTC({
  sessionId,
  rtcRole,
  enabled = true,
}: UseWebRTCOptions): UseWebRTCResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState>('new')
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [localCameraError, setLocalCameraError] = useState<string | null>(null)

  const [isCamOff, setIsCamOff] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [remoteMediaState, setRemoteMediaState] = useState<{
    isCamOff: boolean
    isMicMuted: boolean
  }>({
    isCamOff: false,
    isMicMuted: false,
  })

  const isCamOffRef = useRef(false)
  const isMicMutedRef = useRef(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

  const iceCandidatesQueueRef = useRef<RTCIceCandidateInit[]>([])
  const isRemoteDescriptionSetRef = useRef(false)
  const hasCreatedOfferRef = useRef(false)
  const hasCreatedAnswerRef = useRef(false)

  // Pending offer buffered while PeerConnection is still initializing
  const pendingOfferRef = useRef<RtcOfferPayload | null>(null)
  // Queue for outgoing ICE candidates held until rtc:offer has been emitted
  const pendingOutgoingIceRef = useRef<RTCIceCandidateInit[]>([])

  // Network & ICE recovery tracking
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartCountRef = useRef(0)
  const isRestartingIceRef = useRef(false)

  const currentSessionIdRef = useRef<string | null>(sessionId)
  const activeSessionIdRef = useRef<string | null>(null)

  // Prefetch ICE configuration into memory on hook initialization
  useEffect(() => {
    getIceServers().catch(() => {})
  }, [])

  // Synchronize stream references to video elements
  useEffect(() => {
    if (localVideoRef.current && localVideoRef.current.srcObject !== localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // Immediately request camera and display live preview when Chat opens
  const acquireCamera = useCallback(async () => {
    if (typeof window === 'undefined') return

    // Check mediaDevices availability separately from RTCPeerConnection
    const hasMediaDevices =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')

    if (!hasMediaDevices) {
      const isSecure = typeof window !== 'undefined' && window.isSecureContext
      const isLocalhost =
        typeof window !== 'undefined' &&
        Boolean(
          window.location &&
            (window.location.hostname === 'localhost' ||
              window.location.hostname === '127.0.0.1')
        )

      if (!isSecure && !isLocalhost) {
        setLocalCameraError('Camera unavailable — HTTPS required')
      } else {
        setLocalCameraError('Camera capture not supported in this browser')
      }
      return
    }

    // Check if an active video track already exists and is live
    const existingVideo = localStreamRef.current
      ?.getVideoTracks()
      .find((t) => t.readyState === 'live')
    if (existingVideo) {
      if (
        localVideoRef.current &&
        localVideoRef.current.srcObject !== localStreamRef.current
      ) {
        localVideoRef.current.srcObject = localStreamRef.current
      }
      return
    }

    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false, // User requested: do NOT activate mic while in queue
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      }

      // Preserve camera toggle state
      stream.getVideoTracks().forEach((t) => {
        t.enabled = !isCamOffRef.current
      })

      localStreamRef.current = stream
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      setLocalCameraError(null)
    } catch (err: unknown) {
      let userMsg = 'Camera unavailable'
      if (err instanceof Error) {
        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError'
        ) {
          userMsg =
            'Camera permission denied. Allow camera access in browser settings.'
        } else if (
          err.name === 'NotFoundError' ||
          err.name === 'DevicesNotFoundError'
        ) {
          userMsg = 'No camera found on your device.'
        } else if (
          err.name === 'NotReadableError' ||
          err.name === 'TrackStartError'
        ) {
          userMsg = 'Camera is already in use by another application.'
        }
      }
      setLocalCameraError(userMsg)
    }
  }, [])

  // Auto-acquire camera on mount
  useEffect(() => {
    if (enabled) {
      acquireCamera()
    }
  }, [enabled, acquireCamera])

  // Non-destructive camera toggle: toggles video track .enabled without destroying connection
  const toggleCamera = useCallback((forceState?: boolean) => {
    const nextState = forceState !== undefined ? forceState : !isCamOffRef.current
    isCamOffRef.current = nextState
    setIsCamOff(nextState)

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !nextState
      })
    }

    const currentSession = currentSessionIdRef.current
    if (currentSession) {
      const socket = getSocket()
      socket.emit('media:state', {
        sessionId: currentSession,
        isCamOff: nextState,
        isMicMuted: isMicMutedRef.current,
      })
    }
  }, [])

  // Non-destructive microphone toggle: toggles audio track .enabled independently
  const toggleMicrophone = useCallback((forceState?: boolean) => {
    const nextState = forceState !== undefined ? forceState : !isMicMutedRef.current
    isMicMutedRef.current = nextState
    setIsMicMuted(nextState)

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextState
      })
    }

    const currentSession = currentSessionIdRef.current
    if (currentSession) {
      const socket = getSocket()
      socket.emit('media:state', {
        sessionId: currentSession,
        isCamOff: isCamOffRef.current,
        isMicMuted: nextState,
      })
    }
  }, [])

  // Session cleanup: stops audio tracks and closes peer connection, but KEEPS local camera active
  const cleanupSession = useCallback(() => {
    activeSessionIdRef.current = null

    // 1. Release microphone when exiting a match so mic is NOT active in queue
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks()
      audioTracks.forEach((track) => {
        localStreamRef.current?.removeTrack(track)
        try {
          track.stop()
        } catch {
          // Ignore track stop error
        }
      })
    }

    // 2. Clear remote stream tracks
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // Ignore track stop error
        }
      })
      remoteStreamRef.current = null
    }

    // 3. Close and destroy RTCPeerConnection
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null
        pcRef.current.ontrack = null
        pcRef.current.onconnectionstatechange = null
        pcRef.current.oniceconnectionstatechange = null
        pcRef.current.close()
      } catch {
        // Ignore close error
      }
      pcRef.current = null
    }

    // 4. Detach remote video element only (local preview stays attached!)
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }

    // 5. Reset negotiation guards and candidate buffers
    iceCandidatesQueueRef.current = []
    pendingOfferRef.current = null
    pendingOutgoingIceRef.current = []
    isRemoteDescriptionSetRef.current = false
    hasCreatedOfferRef.current = false
    hasCreatedAnswerRef.current = false

    // 6. Reset ICE recovery state
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    restartCountRef.current = 0
    isRestartingIceRef.current = false

    remoteStreamRef.current = null
    setRemoteStream(null)
    setRemoteMediaState({ isCamOff: false, isMicMuted: false })
    // Reset to 'new' so the UI does not show stale state from a previous session
    setConnectionState('new')
  }, [])

  // Full cleanup: stops all media tracks when unmounting Chat page
  const cleanupAll = useCallback(() => {
    cleanupSession()
    currentSessionIdRef.current = null

    // Stop and release local camera tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // Ignore track stop error
        }
      })
      localStreamRef.current = null
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }

    setLocalStream(null)
  }, [cleanupSession])

  // Acquire media devices and start WebRTC session
  const startSession = useCallback(
    async (
      targetSessionId: string,
      role: RtcRole,
      isCancelled: () => boolean
    ) => {
      // 1. True capability check: verify genuine RTCPeerConnection support
      const PeerConn =
        typeof window !== 'undefined' && window.RTCPeerConnection
          ? window.RTCPeerConnection
          : typeof RTCPeerConnection !== 'undefined'
            ? RTCPeerConnection
            : null

      if (!PeerConn) {
        setMediaError(
          'WebRTC is not supported in this browser environment.'
        )
        setConnectionState('failed')
        return
      }

      setMediaError(null)
      setConnectionState('connecting')

      // ── Phase 1: Register signaling listeners IMMEDIATELY ────────────────
      // We attach socket listeners before any getUserMedia await so that
      // incoming rtc:offer / rtc:ice packets are never lost during async
      // hardware initialization. If the PeerConnection isn't ready yet,
      // we buffer the offer in pendingOfferRef for safe processing later.
      const socket = getSocket()

      const handleRemoteMediaState = (payload: MediaStatePayload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          payload.sessionId !== targetSessionId
        ) {
          return
        }
        setRemoteMediaState((prev) => ({
          isCamOff:
            typeof payload.isCamOff === 'boolean'
              ? payload.isCamOff
              : prev.isCamOff,
          isMicMuted:
            typeof payload.isMicMuted === 'boolean'
              ? payload.isMicMuted
              : prev.isMicMuted,
        }))
      }

      // Forward declaration for processOffer — defined after pc is created
      let processOfferFn: ((payload: RtcOfferPayload) => Promise<void>) | null = null

      const handleRemoteOffer = async (payload: RtcOfferPayload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          payload.sessionId !== targetSessionId
        ) {
          return
        }
        if (isCancelled() || currentSessionIdRef.current !== targetSessionId) return

        if (processOfferFn) {
          // PC is ready — process immediately
          await processOfferFn(payload)
        } else {
          // PC not ready yet — buffer the offer; it will be flushed below
          console.log('[WebRTC] Buffering early offer while PC initializes...')
          pendingOfferRef.current = payload
        }
      }

      const handleRemoteAnswer = async (payload: RtcAnswerPayload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          payload.sessionId !== targetSessionId
        ) {
          return
        }
        if (isCancelled() || currentSessionIdRef.current !== targetSessionId) return
        try {
          if (!pcRef.current) return
          if (pcRef.current.signalingState !== 'have-local-offer') return

          console.log('[WebRTC Diagnostic] Processing remote answer from partner...')
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({
              type: 'answer',
              sdp: payload.sdp,
            })
          )
          isRemoteDescriptionSetRef.current = true

          // Flush queued incoming candidates safely
          const queued = [...iceCandidatesQueueRef.current]
          iceCandidatesQueueRef.current = []
          for (const cand of queued) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(cand))
            } catch {
              // Ignore invalid or stale candidate
            }
          }
        } catch (err) {
          console.warn('[WebRTC Diagnostic] Failed to process answer:', err)
          setMediaError('Failed to process video answer from partner.')
        }
      }

      const handleRemoteIce = async (payload: RtcIcePayload) => {
        if (
          !payload ||
          typeof payload !== 'object' ||
          payload.sessionId !== targetSessionId
        ) {
          return
        }
        if (isCancelled() || currentSessionIdRef.current !== targetSessionId) return
        if (!payload.candidate) return

        if (pcRef.current && isRemoteDescriptionSetRef.current && pcRef.current.remoteDescription) {
          try {
            await pcRef.current.addIceCandidate(
              new RTCIceCandidate(payload.candidate)
            )
          } catch {
            // Ignore candidate error during teardown or state changes
          }
        } else {
          iceCandidatesQueueRef.current.push(payload.candidate)
        }
      }

      socket.on('media:state', handleRemoteMediaState)
      socket.on('rtc:offer', handleRemoteOffer)
      socket.on('rtc:answer', handleRemoteAnswer)
      socket.on('rtc:ice', handleRemoteIce)

      let handleOnline: (() => void) | undefined

      const removeListeners = () => {
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current)
          restartTimerRef.current = null
        }
        if (
          typeof window !== 'undefined' &&
          typeof window.removeEventListener === 'function' &&
          handleOnline
        ) {
          window.removeEventListener('online', handleOnline)
        }
        socket.off('media:state', handleRemoteMediaState)
        socket.off('rtc:offer', handleRemoteOffer)
        socket.off('rtc:answer', handleRemoteAnswer)
        socket.off('rtc:ice', handleRemoteIce)
      }

      // ── Phase 2: Acquire camera if needed (async, but listeners already up) ─
      const hasMediaDevices =
        typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')

      if (
        hasMediaDevices &&
        (!localStreamRef.current || localStreamRef.current.getVideoTracks().length === 0)
      ) {
        await acquireCamera()
      }

      if (isCancelled() || currentSessionIdRef.current !== targetSessionId) {
        removeListeners()
        return
      }

      // ── Phase 3: Request microphone permission at match start ────────────
      const hasAudio = localStreamRef.current
        ?.getAudioTracks()
        .some((t) => t.readyState === 'live')

      if (!hasAudio && hasMediaDevices) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          })

          if (isCancelled() || currentSessionIdRef.current !== targetSessionId) {
            audioStream.getTracks().forEach((track) => track.stop())
            removeListeners()
            return
          }

          const audioTrack = audioStream.getAudioTracks()[0]
          if (audioTrack) {
            audioTrack.enabled = !isMicMutedRef.current
            if (localStreamRef.current) {
              localStreamRef.current.addTrack(audioTrack)
            } else {
              localStreamRef.current = audioStream
              setLocalStream(audioStream)
            }
          }
        } catch (err: unknown) {
          console.warn('[WebRTC Diagnostic] Microphone access unavailable or denied:', err)
        }
      }

      if (isCancelled() || currentSessionIdRef.current !== targetSessionId) {
        removeListeners()
        return
      }

      // ── Phase 4: Retrieve ICE servers and initialize RTCPeerConnection ───
      const iceServers = await getIceServers()

      if (isCancelled() || currentSessionIdRef.current !== targetSessionId) {
        removeListeners()
        return
      }

      const pc = new PeerConn({
        iceServers,
        iceCandidatePoolSize: 2,
      })
      pcRef.current = pc

      console.log(
        `[WebRTC Diagnostic] RTCPeerConnection created for session ${targetSessionId} as ${role}`
      )

      const localTracks = localStreamRef.current ? localStreamRef.current.getTracks() : []
      const hasLiveVideo = localTracks.some(
        (t) => t.kind === 'video' && t.readyState === 'live'
      )
      const hasLiveAudio = localTracks.some(
        (t) => t.kind === 'audio' && t.readyState === 'live'
      )

      // Video track / transceiver setup:
      if (hasLiveVideo) {
        const videoTrack = localStreamRef.current!.getVideoTracks().find((t) => t.readyState === 'live')!
        try {
          pc.addTrack(videoTrack, localStreamRef.current!)
          console.log('[WebRTC Diagnostic] Local video track attached (sendrecv)')
        } catch (err) {
          console.warn('[WebRTC Diagnostic] Error adding video track:', err)
        }
      } else {
        // Explicitly configure receive-only transceiver so SDP contains m=video section
        try {
          pc.addTransceiver('video', { direction: 'recvonly' })
          console.log('[WebRTC Diagnostic] Receive-only video transceiver added')
        } catch (err) {
          console.warn('[WebRTC Diagnostic] Error adding video transceiver:', err)
        }
      }

      // Audio track / transceiver setup:
      if (hasLiveAudio) {
        const audioTrack = localStreamRef.current!.getAudioTracks().find((t) => t.readyState === 'live')!
        try {
          pc.addTrack(audioTrack, localStreamRef.current!)
          console.log('[WebRTC Diagnostic] Local audio track attached (sendrecv)')
        } catch (err) {
          console.warn('[WebRTC Diagnostic] Error adding audio track:', err)
        }
      } else {
        // Explicitly configure receive-only transceiver so SDP contains m=audio section
        try {
          pc.addTransceiver('audio', { direction: 'recvonly' })
          console.log('[WebRTC Diagnostic] Receive-only audio transceiver added')
        } catch (err) {
          console.warn('[WebRTC Diagnostic] Error adding audio transceiver:', err)
        }
      }

      // Handle incoming remote media tracks
      pc.ontrack = (event) => {
        console.log(
          `[WebRTC Diagnostic ontrack] Remote track received: kind=${event.track.kind}, id=${event.track.id}, readyState=${event.track.readyState}`
        )
        if (isCancelled() || currentSessionIdRef.current !== targetSessionId) return
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0]
          setRemoteStream(event.streams[0])
          if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0]
            remoteVideoRef.current.play().catch((playErr) => {
              console.warn('[WebRTC] Remote video autoplay blocked:', playErr)
            })
          }
        } else {
          let stream = remoteStreamRef.current
          if (!stream) {
            stream = new MediaStream()
            remoteStreamRef.current = stream
          }
          if (!stream.getTracks().some((t) => t.id === event.track.id)) {
            stream.addTrack(event.track)
          }
          setRemoteStream(stream)
          if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
            remoteVideoRef.current.srcObject = stream
            remoteVideoRef.current.play().catch((playErr) => {
              console.warn('[WebRTC] Remote video autoplay blocked:', playErr)
            })
          }
        }

        if (event.track.kind === 'video') {
          event.track.onmute = () => {
            console.log('[WebRTC Diagnostic] Remote video track muted')
            setRemoteMediaState((prev) => ({ ...prev, isCamOff: true }))
          }
          event.track.onunmute = () => {
            console.log('[WebRTC Diagnostic] Remote video track unmuted')
            setRemoteMediaState((prev) => ({ ...prev, isCamOff: false }))
          }
        }
      }

      // ── Phase 5: ICE candidate emission — gated until SDP (offer or answer) is sent ──
      // We collect outgoing candidates in pendingOutgoingIceRef while SDP
      // hasn't been emitted yet, to prevent the backend from
      // rejecting them with INVALID_STATE.
      let canSendIce = false

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(
            `[WebRTC Diagnostic ICE] Candidate generated: type=${event.candidate.type}, protocol=${event.candidate.protocol}`
          )
          if (
            !isCancelled() &&
            currentSessionIdRef.current === targetSessionId
          ) {
            if (canSendIce) {
              socket.emit('rtc:ice', {
                sessionId: targetSessionId,
                candidate: event.candidate.toJSON(),
              })
            } else {
              // Hold until offer or answer is on the wire
              pendingOutgoingIceRef.current.push(event.candidate.toJSON())
            }
          }
        } else {
          console.log('[WebRTC Diagnostic ICE] Candidate gathering completed.')
        }
      }

      // ── Network & ICE Recovery ──────────────────────────────────────────
      const attemptIceRestart = async () => {
        if (isCancelled() || currentSessionIdRef.current !== targetSessionId) return
        if (isRestartingIceRef.current) return
        if (restartCountRef.current >= 3) {
          console.warn('[WebRTC] Maximum ICE restart attempts reached (3/3).')
          return
        }
        if (role !== 'offerer') {
          console.log('[WebRTC] Answerer awaiting partner to initiate ICE restart.')
          return
        }
        const currentPc = pcRef.current
        if (!currentPc || currentPc.signalingState !== 'stable') return

        isRestartingIceRef.current = true
        restartCountRef.current += 1
        console.log(
          `[WebRTC] Initiating ICE restart (attempt ${restartCountRef.current}/3)...`
        )

        try {
          if (typeof currentPc.restartIce === 'function') {
            currentPc.restartIce()
          }
          const offer = await currentPc.createOffer({ iceRestart: true })
          await currentPc.setLocalDescription(offer)

          if (isCancelled() || currentSessionIdRef.current !== targetSessionId) return

          console.log('[WebRTC] Emitting ICE restart offer to partner...')
          socket.emit('rtc:offer', {
            sessionId: targetSessionId,
            sdp: offer.sdp || '',
            type: 'offer',
          })
          canSendIce = true
        } catch (err) {
          console.warn('[WebRTC] Failed to create ICE restart offer:', err)
        } finally {
          isRestartingIceRef.current = false
        }
      }

      // Track ICE connection state transitions with debounced recovery
      pc.oniceconnectionstatechange = () => {
        console.log(
          `[WebRTC Diagnostic ICE State] Changed to: ${pc.iceConnectionState}`
        )
        if (
          pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed'
        ) {
          if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current)
            restartTimerRef.current = null
          }
          restartCountRef.current = 0
          setMediaError(null)
        } else if (pc.iceConnectionState === 'disconnected') {
          console.warn(
            '[WebRTC Diagnostic ICE State] ICE disconnected. Scheduling restart if unrecovered...'
          )
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
          restartTimerRef.current = setTimeout(() => {
            if (
              !isCancelled() &&
              pcRef.current &&
              (pcRef.current.iceConnectionState === 'disconnected' ||
                pcRef.current.iceConnectionState === 'failed')
            ) {
              attemptIceRestart()
            }
          }, 2000)
        } else if (pc.iceConnectionState === 'failed') {
          console.warn(
            '[WebRTC Diagnostic ICE State] ICE connection failed. Initiating recovery...'
          )
          if (restartTimerRef.current) {
            clearTimeout(restartTimerRef.current)
            restartTimerRef.current = null
          }
          attemptIceRestart()
        }
      }

      // Handle window online event (e.g. Wi-Fi <-> Mobile Data switch)
      handleOnline = () => {
        console.log('[WebRTC Network] Device online event. Checking connection...')
        if (
          pcRef.current &&
          (pcRef.current.iceConnectionState === 'disconnected' ||
            pcRef.current.iceConnectionState === 'failed')
        ) {
          attemptIceRestart()
        }
      }
      if (
        typeof window !== 'undefined' &&
        typeof window.addEventListener === 'function'
      ) {
        window.addEventListener('online', handleOnline)
      }

      // Track connection state transitions
      pc.onconnectionstatechange = () => {
        console.log(
          `[WebRTC Diagnostic Connection State] Changed to: ${pc.connectionState}, Signaling: ${pc.signalingState}`
        )
        if (isCancelled() || currentSessionIdRef.current !== targetSessionId) return
        setConnectionState(pc.connectionState)
        if (pc.connectionState === 'failed') {
          setMediaError(
            'WebRTC connection failed. Text chat remains fully available.'
          )
        }
      }

      // ── Phase 6: Define processOffer and flush any buffered early offer ───
      // Now that pcRef.current is set and the PC has tracks, wire up the
      // actual offer-processing logic and assign it to processOfferFn so
      // future calls from handleRemoteOffer use it directly.
      processOfferFn = async (payload: RtcOfferPayload) => {
        if (isCancelled() || currentSessionIdRef.current !== targetSessionId) return
        if (!pcRef.current) return
        if (pcRef.current.signalingState !== 'stable') return

        try {
          console.log('[WebRTC Diagnostic] Processing remote offer from partner...')
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({
              type: 'offer',
              sdp: payload.sdp,
            })
          )
          isRemoteDescriptionSetRef.current = true

          // Flush queued incoming candidates safely
          const queued = [...iceCandidatesQueueRef.current]
          iceCandidatesQueueRef.current = []
          for (const cand of queued) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(cand))
            } catch {
              // Ignore invalid or stale candidate
            }
          }

          hasCreatedAnswerRef.current = true
          const answer = await pcRef.current.createAnswer()
          await pcRef.current.setLocalDescription(answer)

          if (isCancelled() || currentSessionIdRef.current !== targetSessionId) return

          console.log('[WebRTC Diagnostic] Sending answer to partner...')
          socket.emit('rtc:answer', {
            sessionId: targetSessionId,
            sdp: answer.sdp || '',
            type: 'answer',
          })

          // Mark answer as emitted, then flush any candidates held on the answerer
          canSendIce = true
          const heldCandidates = [...pendingOutgoingIceRef.current]
          pendingOutgoingIceRef.current = []
          for (const cand of heldCandidates) {
            if (!isCancelled() && currentSessionIdRef.current === targetSessionId) {
              socket.emit('rtc:ice', {
                sessionId: targetSessionId,
                candidate: cand,
              })
            }
          }
        } catch (err) {
          console.warn('[WebRTC Diagnostic] Failed to establish video negotiation:', err)
          setMediaError('Failed to establish video negotiation.')
        }
      }

      // If an offer arrived while we were initializing, process it now
      const bufferedOffer = pendingOfferRef.current
      if (bufferedOffer) {
        pendingOfferRef.current = null
        console.log('[WebRTC] Processing buffered early offer...')
        await processOfferFn(bufferedOffer)
      }

      if (isCancelled() || currentSessionIdRef.current !== targetSessionId) {
        removeListeners()
        return
      }

      // Emit initial media state
      socket.emit('media:state', {
        sessionId: targetSessionId,
        isCamOff: isCamOffRef.current,
        isMicMuted: isMicMutedRef.current,
      })

      // ── Phase 7: Offerer creates offer, then flushes held ICE candidates ─
      if (role === 'offerer') {
        if (!hasCreatedOfferRef.current && pc.signalingState === 'stable') {
          hasCreatedOfferRef.current = true
          try {
            console.log('[WebRTC Diagnostic] Creating local offer as offerer...')
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            if (isCancelled() || currentSessionIdRef.current !== targetSessionId) {
              removeListeners()
              return
            }

            console.log('[WebRTC Diagnostic] Emitting offer to partner...')
            socket.emit('rtc:offer', {
              sessionId: targetSessionId,
              sdp: offer.sdp || '',
              type: 'offer',
            })

            // Mark offer as on the wire, then flush any candidates that
            // gathered during setLocalDescription before the emit
            canSendIce = true
            const heldCandidates = [...pendingOutgoingIceRef.current]
            pendingOutgoingIceRef.current = []
            for (const cand of heldCandidates) {
              if (!isCancelled() && currentSessionIdRef.current === targetSessionId) {
                socket.emit('rtc:ice', {
                  sessionId: targetSessionId,
                  candidate: cand,
                })
              }
            }
          } catch (err) {
            console.warn('[WebRTC Diagnostic] Failed to create video offer:', err)
            setMediaError('Failed to create video offer.')
          }
        }
      }

      return removeListeners
    },
    [acquireCamera]
  )

  // Effect coordinating WebRTC session lifecycle
  useEffect(() => {
    currentSessionIdRef.current = sessionId

    if (!enabled || !sessionId || !rtcRole) {
      if (activeSessionIdRef.current) {
        cleanupSession()
      }
      return
    }

    if (activeSessionIdRef.current === sessionId && pcRef.current) {
      return
    }

    // Clean up any previous session before starting the new one.
    // This ensures pcRef, listener refs, and ICE queues are fully reset
    // before we set activeSessionIdRef to the new ID.
    if (activeSessionIdRef.current && activeSessionIdRef.current !== sessionId) {
      cleanupSession()
    }

    activeSessionIdRef.current = sessionId
    let isCancelled = false
    let removeListeners: (() => void) | undefined

    startSession(sessionId, rtcRole, () => isCancelled).then((cleanupFn) => {
      if (isCancelled) {
        // If this async run was cancelled, immediately remove any listeners
        // it may have registered (since listeners are now registered early)
        if (cleanupFn) cleanupFn()
      } else {
        removeListeners = cleanupFn
      }
    })

    return () => {
      isCancelled = true
      if (removeListeners) removeListeners()
      cleanupSession()
    }
  }, [enabled, sessionId, rtcRole, startSession, cleanupSession])

  // Full cleanup only on unmount (leaving Chat page)
  useEffect(() => {
    return () => {
      cleanupAll()
    }
  }, [cleanupAll])

  const retryMedia = useCallback(() => {
    acquireCamera()
    if (sessionId && rtcRole) {
      cleanupSession()
      currentSessionIdRef.current = sessionId
      activeSessionIdRef.current = sessionId
      let isCancelled = false
      startSession(sessionId, rtcRole, () => isCancelled).then((cleanupFn) => {
        if (isCancelled && cleanupFn) cleanupFn()
      })
    }
  }, [sessionId, rtcRole, acquireCamera, cleanupSession, startSession])

  return {
    localStream,
    remoteStream,
    connectionState,
    mediaError,
    localCameraError,
    localVideoRef,
    remoteVideoRef,
    retryMedia,
    isCamOff,
    isMicMuted,
    remoteMediaState,
    toggleCamera,
    toggleMicrophone,
  }
}
