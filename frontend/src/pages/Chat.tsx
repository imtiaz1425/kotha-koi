/**
 * Chat.tsx – KothaKoi OmeTV-style Chat Room
 * Compact video-first adda experience exclusively for UIU students.
 * Prominent dual video stage with compact chat panel directly underneath.
 */
import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { apiClient } from '../api/client'
import { getSocket } from '../api/socket'
import { OnlineBadge } from '../components/OnlineBadge'
import { FloatingChatWindow } from '../components/FloatingChatWindow'
import { ReportModal } from '../components/ReportModal'
import { BlockModal } from '../components/BlockModal'
import { ProfileDropdown } from '../components/ProfileDropdown'
import { useWebRTC } from '../hooks/useWebRTC'
import type { RtcRole } from '@kothakoi/shared'

// ── Types ────────────────────────────────────────────────────────────────────

type Sender = 'stranger' | 'user' | 'notice'

interface ChatMessage {
  id: number
  sender: Sender
  name: string
  time: string
  text: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 1,
    sender: 'notice',
    name: 'KothaKoi',
    time: '',
    text: 'Connecting to UIU adda... Stay anonymous and follow community guidelines ☕',
  },
]

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Web Audio Chimes ─────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  if (!AudioContextClass) return null
  try {
    if (!audioCtx) {
      audioCtx = new AudioContextClass()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    return audioCtx
  } catch {
    return null
  }
}

/**
 * Short, distinct ascending chime when a 1-to-1 chat connection is established.
 * Two harmonious sine tones: C5 (523.25 Hz) then G5 (783.99 Hz).
 */
function playConnectedSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, now)
    osc.frequency.setValueAtTime(783.99, now + 0.09)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain.gain.setValueAtTime(0.15, now + 0.09)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.32)
  } catch {
    // Silently ignore in environments without audio support
  }
}

/**
 * Short, distinct descending cue when the chat partner unexpectedly disconnects.
 * Two sine tones: A4 (440 Hz) down to E4 (329.63 Hz).
 */
function playDisconnectedSound(): void {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.setValueAtTime(329.63, now + 0.11)

    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02)
    gain.gain.setValueAtTime(0.12, now + 0.11)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.35)
  } catch {
    // Silently ignore in environments without audio support
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Chat() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialNickname =
    (location.state as { nickname?: string } | null)?.nickname || ''
  const [userNickname, setUserNickname] = useState<string>(initialNickname)
  const userNicknameRef = useRef<string>(initialNickname)

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [isSubmittingBlock, setIsSubmittingBlock] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [rtcRole, setRtcRole] = useState<RtcRole | null>(null)

  // Real-Time WebRTC Calling Hook
  const {
    localStream,
    remoteStream,
    connectionState: rtcConnectionState,
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
  } = useWebRTC({
    sessionId,
    rtcRole,
    enabled: true,
  })

  const [partnerName, setPartnerName] = useState<string>('')
  const [isSearching, setIsSearching] = useState<boolean>(true)
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'reconnecting' | 'failed'
  >('connected')
  const [partnerStatus, setPartnerStatus] = useState<
    'connected' | 'reconnecting'
  >('connected')

  // Match confirmation proposal state
  interface MatchProposalState {
    proposalId: string
    partner: {
      nickname: string
      avatarPreset?: string
    }
    expiresInSeconds: number
  }

  const [matchProposal, setMatchProposal] = useState<MatchProposalState | null>(null)
  const [hasAcceptedProposal, setHasAcceptedProposal] = useState(false)
  const [proposalTimeLeft, setProposalTimeLeft] = useState(15)

  // 10-second disconnect cooldown state
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0)
  const lastNextClickRef = useRef<number>(0)
  const autoNextOnCooldownRef = useRef<boolean>(false)
  const handleNextRef = useRef<() => void>(() => {})

  const sessionIdRef = useRef<string | null>(null)
  const partnerNameRef = useRef<string>('')

  // Proposal timer countdown (15s to 0s)
  useEffect(() => {
    if (!matchProposal) return
    const interval = setInterval(() => {
      setProposalTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [matchProposal])

  // Disconnect cooldown countdown (10s to 0s)
  useEffect(() => {
    if (cooldownRemaining <= 0) {
      if (autoNextOnCooldownRef.current) {
        autoNextOnCooldownRef.current = false
        handleNextRef.current()
      }
      return
    }
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownRemaining])

  // Audio notification tracking to prevent duplicate sounds
  const connectedSoundSessionIdRef = useRef<string | null>(null)
  const disconnectedSoundSessionIdRef = useRef<string | null>(null)

  // Floating chat window state (open by default per requirements)
  const [isChatOpen, setIsChatOpen] = useState(true)
  const isChatOpenRef = useRef(true)

  // Keep refs synchronized with state outside render phase
  useEffect(() => {
    userNicknameRef.current = userNickname
  }, [userNickname])

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    partnerNameRef.current = partnerName
  }, [partnerName])

  useEffect(() => {
    isChatOpenRef.current = isChatOpen
  }, [isChatOpen])

  // Fetch nickname if not passed via route state
  useEffect(() => {
    if (!userNickname) {
      apiClient
        .get<{ ok: boolean; nickname?: string; profile?: { nickname?: string } }>('/profile')
        .then((res) => {
          const fetchedNickname = res?.nickname || res?.profile?.nickname
          if (fetchedNickname) {
            setUserNickname(fetchedNickname)
            userNicknameRef.current = fetchedNickname
          }
        })
        .catch(() => {})
    }
  }, [userNickname])

  // Unread messages counter while chat window is minimized/hidden
  const [unreadCount, setUnreadCount] = useState(0)

  // Media controls state derived from useWebRTC
  const isMuted = isMicMuted

  const chatStreamRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextIdRef = useRef(10)

  // Helper to append system notice without redundant consecutive duplicates for the same state transition
  const appendNotice = useCallback((text: string) => {
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1]
      if (lastMsg && lastMsg.sender === 'notice') {
        if (lastMsg.text === text) {
          return prev
        }
        // Consolidate intermediate queue state notices (e.g. "Looking..." -> "Waiting in queue...")
        const isQueueNotice = (t: string) =>
          t.includes('Looking for a UIU peer') ||
          t.includes('Skipping to next peer') ||
          t.includes('Waiting in queue')
        if (isQueueNotice(lastMsg.text) && isQueueNotice(text)) {
          return [
            ...prev.slice(0, -1),
            {
              id: lastMsg.id,
              sender: 'notice',
              name: '',
              time: nowTime(),
              text,
            },
          ]
        }
      }
      return [
        ...prev,
        {
          id: nextIdRef.current++,
          sender: 'notice',
          name: '',
          time: nowTime(),
          text,
        },
      ]
    })
  }, [])

  const appendNoticeRef = useRef(appendNotice)
  useEffect(() => {
    appendNoticeRef.current = appendNotice
  }, [appendNotice])

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    if (chatStreamRef.current) {
      chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping, isChatOpen])

  // Socket.IO event listeners for real-time matchmaking and messaging
  useEffect(() => {
    const socket = getSocket()
    if (!socket.connected) {
      socket.connect()
    }

    socket.emit('queue:join', {
      mode: 'text',
      nickname: userNicknameRef.current || undefined,
      confirmMatch: true,
    })

    interface SessionStatePayload {
      state: string
      session?: {
        sessionId: string
        rtcRole?: RtcRole
        partner?: {
          nickname: string
          avatarPreset?: string
          major?: string
        }
        self?: {
          nickname: string
          avatarPreset?: string
        }
      }
    }

    interface MatchFoundPayload {
      sessionId: string
      mode: string
      rtcRole?: RtcRole
      matchedAt?: string
      partner?: {
        nickname: string
        avatarPreset?: string
        major?: string
        department?: string
        isVerified?: boolean
      }
      self?: {
        nickname: string
        avatarPreset?: string
      }
    }

    const handleSessionState = (payload: SessionStatePayload) => {
      setConnectionStatus('connected')
      if (payload.state === 'IN_CHAT' && payload.session) {
        setSessionId(payload.session.sessionId)
        sessionIdRef.current = payload.session.sessionId
        setRtcRole(payload.session.rtcRole || null)
        setIsSearching(false)
        setPartnerStatus('connected')
        setMatchProposal(null)
        setHasAcceptedProposal(false)
        const resolvedName =
          payload.session.partner?.nickname?.trim() || 'UIU Student'
        setPartnerName(resolvedName)
        if (payload.session.self?.nickname) {
          setUserNickname(payload.session.self.nickname)
        }
      } else if (payload.state === 'QUEUED') {
        // Guard: Ignore stale QUEUED event if we are already in an active chat
        if (sessionIdRef.current) {
          return
        }
        setSessionId(null)
        sessionIdRef.current = null
        setRtcRole(null)
        setIsSearching(true)
        setPartnerName('')
        setPartnerStatus('connected')
      } else if (payload.state === 'IDLE') {
        if (sessionIdRef.current) {
          // Stale session detected! The match ended while we were disconnected.
          appendNoticeRef.current(
            'Your previous chat session ended while you were disconnected.'
          )
        }
        setSessionId(null)
        sessionIdRef.current = null
        setRtcRole(null)
        setIsSearching(false)
        setPartnerName('')
        setPartnerStatus('connected')
      }
    }

    const handleWaiting = () => {
      // Guard: Ignore stale waiting event if we are already in an active chat
      if (sessionIdRef.current) {
        return
      }
      setIsSearching(true)
      setPartnerName('')
      appendNoticeRef.current('Waiting in queue for an available UIU peer...')
    }

    const handleMatchProposed = (payload: {
      proposalId: string
      partner: {
        nickname: string
        avatarPreset?: string
      }
      expiresInSeconds: number
    }) => {
      // Guard: Never show match proposal if we are already in an active chat
      if (sessionIdRef.current) {
        return
      }
      autoNextOnCooldownRef.current = false
      setMatchProposal(payload)
      setHasAcceptedProposal(false)
      setProposalTimeLeft(payload.expiresInSeconds || 15)
      setIsSearching(false)
      appendNoticeRef.current(
        `Found peer ${payload.partner?.nickname || 'UIU Student'}! Please accept or decline.`
      )
    }

    const handleMatchCancelled = (payload: {
      proposalId: string
      reason: string
    }) => {
      setMatchProposal(null)
      setHasAcceptedProposal(false)
      if (payload.reason === 'declined') {
        appendNoticeRef.current(
          'Match was declined. Searching for another UIU peer...'
        )
      } else if (payload.reason === 'expired') {
        appendNoticeRef.current(
          'Match proposal expired. Searching for another UIU peer...'
        )
      } else {
        appendNoticeRef.current(
          'Match cancelled. Searching for another UIU peer...'
        )
      }
      setIsSearching(true)
    }

    const handleMatchFound = (payload: MatchFoundPayload) => {
      autoNextOnCooldownRef.current = false
      setMatchProposal(null)
      setHasAcceptedProposal(false)
      setSessionId(payload.sessionId)
      sessionIdRef.current = payload.sessionId
      setRtcRole(payload.rtcRole || null)
      setIsSearching(false)
      const resolvedName = payload.partner?.nickname?.trim() || 'UIU Student'
      setPartnerName(resolvedName)
      if (payload.self?.nickname) {
        setUserNickname(payload.self.nickname)
      }
      appendNoticeRef.current(`Connected to ${resolvedName}! Say salam ☕`)

      // Play connected chime when a 1-to-1 match is established (deduplicated per session)
      if (connectedSoundSessionIdRef.current !== payload.sessionId) {
        connectedSoundSessionIdRef.current = payload.sessionId
        playConnectedSound()
      }
    }

    interface ChatEndedPayload {
      sessionId: string
      reason:
        | 'partner_skipped'
        | 'partner_left'
        | 'partner_disconnected'
        | 'you_ended'
        | 'moderation'
      cooldownSeconds?: number
    }

    const handleChatEnded = (payload: ChatEndedPayload) => {
      // Ignore chat:ended events from old/unrelated sessions
      if (sessionIdRef.current && payload.sessionId !== sessionIdRef.current) {
        return
      }

      setSessionId(null)
      sessionIdRef.current = null
      setRtcRole(null)
      setIsTyping(false)
      if (payload.reason !== 'you_ended') {
        setIsSearching(false)
      }
      setPartnerName('')
      setPartnerStatus('connected')
      setMatchProposal(null)
      setHasAcceptedProposal(false)

      const cd =
        payload.cooldownSeconds ??
        (payload.reason === 'partner_disconnected' ? 10 : 0)
      if (cd > 0) {
        setCooldownRemaining(cd)
      }

      let noticeText = 'This adda has ended.'
      if (payload.reason === 'partner_skipped') {
        noticeText = 'Your partner skipped. Click Next to find a new UIU peer.'
      } else if (payload.reason === 'partner_left') {
        noticeText =
          'Your partner left the adda. Click Next to find a new UIU peer.'
      } else if (payload.reason === 'partner_disconnected') {
        noticeText =
          'Your partner disconnected. Click Next to find a new UIU peer.'
        // Play disconnect sound if not already triggered during reconnecting state
        if (disconnectedSoundSessionIdRef.current !== payload.sessionId) {
          disconnectedSoundSessionIdRef.current = payload.sessionId
          playDisconnectedSound()
        }
      } else if (payload.reason === 'you_ended') {
        noticeText = 'You ended the adda.'
      }

      appendNoticeRef.current(noticeText)
    }

    const handleError = (payload: {
      code: string
      message: string
      remainingSeconds?: number
    }) => {
      if (payload.code === 'COOLDOWN_ACTIVE') {
        const remaining = payload.remainingSeconds || 10
        setCooldownRemaining(remaining)
        setIsSearching(false)
        appendNoticeRef.current(
          payload.message ||
            `Please wait ${remaining}s before finding a new match.`
        )
      } else if (payload.code === 'ALREADY_BUSY') {
        if (payload.message?.includes('already waiting')) {
          setIsSearching(true)
        } else {
          setIsSearching(false)
        }
      } else {
        setIsSearching(false)
      }
    }

    interface ChatPartnerStatusPayload {
      sessionId: string
      status: 'reconnecting' | 'back'
    }

    const handlePartnerStatus = (payload: ChatPartnerStatusPayload) => {
      // Ignore status updates from old or unrelated sessions
      if (!sessionIdRef.current || payload.sessionId !== sessionIdRef.current) {
        return
      }

      if (payload.status === 'reconnecting') {
        setPartnerStatus('reconnecting')
        appendNoticeRef.current(
          'Partner disconnected unexpectedly. Waiting up to 15s for reconnection...'
        )
        // Play disconnect sound when partner drops unexpectedly (deduplicated per session)
        if (disconnectedSoundSessionIdRef.current !== payload.sessionId) {
          disconnectedSoundSessionIdRef.current = payload.sessionId
          playDisconnectedSound()
        }
      } else if (payload.status === 'back') {
        setPartnerStatus('connected')
        appendNoticeRef.current(
          'Partner reconnected! You can continue chatting.'
        )
      }
    }

    const handleIncomingMessage = (payload: {
      sessionId: string
      messageId: string
      text: string
      at: string
    }) => {
      // Strict session validation: Only accept messages matching current active session
      if (!sessionIdRef.current || payload.sessionId !== sessionIdRef.current) {
        return
      }

      setIsTyping(false)
      const time = payload.at
        ? new Date(payload.at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        : nowTime()

      setMessages((prev) => [
        ...prev,
        {
          id: nextIdRef.current++,
          sender: 'stranger',
          name: partnerNameRef.current,
          time,
          text: payload.text,
        },
      ])

      // If chat is currently minimized/hidden, increment unread counter
      if (!isChatOpenRef.current) {
        setUnreadCount((prev) => prev + 1)
      }
    }

    let typingTimer: ReturnType<typeof setTimeout> | undefined = undefined
    const handlePartnerTyping = (payload: {
      sessionId: string
      isTyping: boolean
    }) => {
      // Only process typing events for current active session
      if (!sessionIdRef.current || payload.sessionId !== sessionIdRef.current) {
        return
      }

      setIsTyping(Boolean(payload.isTyping))
      if (payload.isTyping) {
        if (typingTimer) {
          clearTimeout(typingTimer)
        }
        typingTimer = setTimeout(() => setIsTyping(false), 3000)
      }
    }

    const handleConnect = () => {
      setConnectionStatus('connected')
    }

    const handleDisconnect = (reason: string) => {
      if (reason !== 'io client disconnect') {
        setConnectionStatus('reconnecting')
      }
    }

    const handleConnectError = () => {
      setConnectionStatus('failed')
    }

    const handleReconnectAttempt = () => {
      setConnectionStatus('reconnecting')
    }

    const handleReconnect = () => {
      setConnectionStatus('connected')
      appendNoticeRef.current('Reconnected to server!')
      if (sessionIdRef.current) {
        socket.emit('session:restore', { sessionId: sessionIdRef.current })
      }
    }

    const handleReconnectFailed = () => {
      setConnectionStatus('failed')
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.io.on('reconnect_attempt', handleReconnectAttempt)
    socket.io.on('reconnect', handleReconnect)
    socket.io.on('reconnect_failed', handleReconnectFailed)

    socket.on('session:state', handleSessionState)
    socket.on('queue:waiting', handleWaiting)
    socket.on('match:proposed', handleMatchProposed)
    socket.on('match:cancelled', handleMatchCancelled)
    socket.on('match:found', handleMatchFound)
    socket.on('chat:message', handleIncomingMessage)
    socket.on('chat:typing', handlePartnerTyping)
    socket.on('chat:partner_status', handlePartnerStatus)
    socket.on('chat:ended', handleChatEnded)
    socket.on('error', handleError)

    return () => {
      if (typingTimer) {
        clearTimeout(typingTimer)
      }
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.io.off('reconnect_attempt', handleReconnectAttempt)
      socket.io.off('reconnect', handleReconnect)
      socket.io.off('reconnect_failed', handleReconnectFailed)

      socket.off('session:state', handleSessionState)
      socket.off('queue:waiting', handleWaiting)
      socket.off('match:proposed', handleMatchProposed)
      socket.off('match:cancelled', handleMatchCancelled)
      socket.off('match:found', handleMatchFound)
      socket.off('chat:message', handleIncomingMessage)
      socket.off('chat:typing', handlePartnerTyping)
      socket.off('chat:partner_status', handlePartnerStatus)
      socket.off('chat:ended', handleChatEnded)
      socket.off('error', handleError)
    }
  }, [])

  // Close report menu on outside click
  useEffect(() => {
    const close = () => setReportOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAcceptMatch = useCallback(() => {
    if (!matchProposal || hasAcceptedProposal) return
    setHasAcceptedProposal(true)
    const socket = getSocket()
    socket.emit('match:accept', { proposalId: matchProposal.proposalId })
  }, [matchProposal, hasAcceptedProposal])

  const handleDeclineMatch = useCallback(() => {
    if (!matchProposal) return
    const pid = matchProposal.proposalId
    setMatchProposal(null)
    setHasAcceptedProposal(false)
    const socket = getSocket()
    socket.emit('match:decline', { proposalId: pid })
    appendNotice('You declined the match. Returning to queue...')
    setIsSearching(true)
  }, [matchProposal, appendNotice])

  const toggleMic = useCallback(() => {
    toggleMicrophone()
  }, [toggleMicrophone])

  const toggleCam = useCallback(() => {
    toggleCamera()
  }, [toggleCamera])

  const handleOpenChat = useCallback(() => {
    setIsChatOpen(true)
    setUnreadCount(0)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleCloseChat = useCallback(() => {
    setIsChatOpen(false)
  }, [])

  const handleMinimizeChat = useCallback(() => {
    setIsChatOpen(false)
  }, [])

  const toggleChat = useCallback(() => {
    setIsChatOpen((prev) => {
      if (prev) {
        return false
      }
      setUnreadCount(0)
      setTimeout(() => inputRef.current?.focus(), 50)
      return true
    })
  }, [])

  const handleNext = useCallback(() => {
    const now = Date.now()
    if (now - lastNextClickRef.current < 500) {
      return
    }
    lastNextClickRef.current = now

    if (cooldownRemaining > 0) {
      autoNextOnCooldownRef.current = true
      appendNotice(
        `Please wait ${cooldownRemaining}s before finding a new match.`
      )
      return
    }

    autoNextOnCooldownRef.current = false

    const socket = getSocket()
    if (!socket.connected) {
      socket.connect()
    }

    const currentSession = sessionIdRef.current

    setIsSearching(true)
    setPartnerName('')
    setMatchProposal(null)
    setHasAcceptedProposal(false)

    // Clean up previous chat session immediately to prevent stale session ID
    // from blocking incoming proposals or receiving old session events
    setSessionId(null)
    sessionIdRef.current = null
    setRtcRole(null)
    setPartnerStatus('connected')

    if (currentSession) {
      appendNotice('Skipping to next peer...')
      socket.emit(
        'chat:skip',
        { sessionId: currentSession, confirmMatch: true },
        (ack: { ok: boolean }) => {
          if (!ack?.ok) {
            socket.emit('queue:join', {
              mode: 'text',
              nickname: userNicknameRef.current || undefined,
              confirmMatch: true,
            })
          }
        }
      )
    } else {
      appendNotice('Looking for a UIU peer...')
      socket.emit('queue:join', {
        mode: 'text',
        nickname: userNicknameRef.current || undefined,
        confirmMatch: true,
      })
    }
  }, [appendNotice, cooldownRemaining])

  useEffect(() => {
    handleNextRef.current = handleNext
  }, [handleNext])

  // Keyboard shortcuts: ESC (Next), M (Mute), V (Camera), C (Toggle Chat)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const activeEl = document.activeElement
      const isEditable =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      if (isEditable) return

      if (e.key === 'Escape') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        toggleMic()
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault()
        toggleCam()
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        toggleChat()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleNext, toggleCam, toggleChat, toggleMic])

  function handleInputChange(val: string) {
    setInput(val)
    const currentSession = sessionIdRef.current
    if (currentSession) {
      const socket = getSocket()
      socket.emit('chat:typing', {
        sessionId: currentSession,
        isTyping: val.trim().length > 0,
      })
    }
  }

  function handleSend(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return

    const displayName = userNickname ? `You (${userNickname})` : 'You'
    const userMsg: ChatMessage = {
      id: nextIdRef.current++,
      sender: 'user',
      name: displayName,
      time: nowTime(),
      text,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    // Real Socket.IO message transmission
    const currentSession = sessionIdRef.current
    if (currentSession) {
      const socket = getSocket()
      socket.emit('chat:typing', {
        sessionId: currentSession,
        isTyping: false,
      })
      socket.emit(
        'chat:message',
        {
          sessionId: currentSession,
          clientMsgId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          text,
        },
        (ack: { ok: boolean; error?: { message?: string } }) => {
          if (!ack?.ok) {
            setMessages((prev) => [
              ...prev,
              {
                id: nextIdRef.current++,
                sender: 'notice',
                name: '',
                time: nowTime(),
                text: `Message delivery error: ${ack?.error?.message || 'Failed to send'}`,
              },
            ])
          }
        }
      )
    }
  }

  function handleQuickEmoji(emoji: string) {
    setInput((prev) => prev + emoji + ' ')
    inputRef.current?.focus()
  }

  function handleEnd() {
    if (window.confirm('Disconnect and leave this adda?')) {
      autoNextOnCooldownRef.current = false
      const socket = getSocket()
      const currentSession = sessionIdRef.current
      if (currentSession) {
        socket.emit('chat:end', { sessionId: currentSession })
      } else {
        socket.emit('queue:leave')
      }
      setSessionId(null)
      sessionIdRef.current = null
      setRtcRole(null)
      navigate('/')
    }
  }

  async function handleReportSubmit(reason: string, details?: string) {
    try {
      setIsSubmittingReport(true)
      setReportError(null)
      await apiClient.post('/reports', {
        sessionId: sessionIdRef.current || sessionId || undefined,
        reason,
        details,
      })
      setReportModalOpen(false)
      setReportOpen(false)
      handleNext()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit report.'
      setReportError(msg)
    } finally {
      setIsSubmittingReport(false)
    }
  }

  async function handleBlockConfirm() {
    try {
      setIsSubmittingBlock(true)
      setBlockError(null)
      await apiClient.post('/blocks', {
        sessionId: sessionIdRef.current || sessionId || undefined,
      })
      setBlockModalOpen(false)
      setReportOpen(false)
      handleNext()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to block student.'
      setBlockError(msg)
    } finally {
      setIsSubmittingBlock(false)
    }
  }

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased h-screen max-h-screen flex flex-col justify-between overflow-hidden select-none">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#FFF5E6] border-b-2 border-on-surface shadow-[0_2px_0px_#1c1b1b] shrink-0">
        <div className="h-12 sm:h-13 max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="flex items-center gap-1 select-none"
              data-path="chat-lobby"
            >
              <span className="font-headline-md text-lg sm:text-xl font-bold tracking-tight text-on-surface">
                KothaKoi
              </span>
              <span className="font-headline-md text-lg sm:text-xl font-bold text-primary">
                .
              </span>
              <span className="hidden sm:inline-block font-label-sm text-[11px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container border border-on-surface ml-1">
                কথা কই
              </span>
            </Link>
          </div>

          {/* Centre Connection State Badge & Online Counter */}
          <div className="flex items-center gap-2">
            <OnlineBadge />
            {sessionId ? (
              <div
                id="connectedBadge"
                className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse border border-on-surface" />
                <span className="font-label-sm text-xs text-on-surface font-bold tracking-wide">
                  🟢 Connected:{' '}
                  <span className="text-primary">
                    {partnerName || 'UIU Student'}
                  </span>
                </span>
              </div>
            ) : isSearching ? (
              <div
                id="searchingBadge"
                className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-secondary-container border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b] animate-pulse"
              >
                <span className="material-symbols-outlined text-[14px] animate-spin">
                  progress_activity
                </span>
                <span className="font-label-sm text-xs text-on-surface font-bold tracking-wide">
                  🔍 Searching for UIU peer...
                </span>
              </div>
            ) : (
              <div
                id="endedBadge"
                className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-surface-container-high border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]"
              >
                <span className="w-2 h-2 rounded-full bg-error" />
                <span className="font-label-sm text-xs text-on-surface font-bold tracking-wide">
                  Adda Ended • Click Next
                </span>
              </div>
            )}
          </div>

          {/* Header Action & Profile */}
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-2 text-xs font-label-sm">
              <Link
                to="/"
                className="px-2 py-1 text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Home
              </Link>
            </nav>
            <ProfileDropdown
              buttonId="chat-profile-btn"
              buttonClassName="w-7 h-7 rounded-full bg-primary flex items-center justify-center border border-on-surface shadow-[1px_1px_0px_#1c1b1b] shrink-0 hover:translate-x-0.5 hover:translate-y-0.5 transition-all cursor-pointer"
              onNicknameUpdated={(newNick) => {
                setUserNickname(newNick)
                userNicknameRef.current = newNick
              }}
            />
          </div>
        </div>
      </header>

      {/* ── Status Banners for Connection & Partner ─────────────────────── */}
      {(mediaError || (sessionId && rtcConnectionState === 'failed')) && (
        <div
          id="mediaErrorBanner"
          className="bg-[#FFEAA7] border-b-2 border-on-surface px-4 py-1.5 text-center font-bold text-xs flex items-center justify-center gap-2 text-on-surface shrink-0"
        >
          <span className="material-symbols-outlined text-[16px] text-primary">
            info
          </span>
          <span>{mediaError || 'WebRTC media failed. Text chat still works.'}</span>
          <button
            type="button"
            onClick={retryMedia}
            className="ml-2 px-2 py-0.5 bg-primary text-on-primary rounded text-[10px] uppercase font-bold hover:bg-[#ff8638] border border-on-surface"
          >
            Retry
          </button>
        </div>
      )}

      {connectionStatus === 'reconnecting' && (
        <div
          id="connectionBanner"
          className="bg-[#FFEAA7] border-b-2 border-on-surface px-4 py-1.5 text-center font-bold text-xs flex items-center justify-center gap-2 text-on-surface animate-pulse shrink-0"
        >
          <span className="material-symbols-outlined text-[16px] animate-spin">
            sync
          </span>
          <span>Connection lost. Reconnecting to KothaKoi...</span>
        </div>
      )}

      {connectionStatus === 'failed' && (
        <div
          id="connectionBanner"
          className="bg-[#FF7675] border-b-2 border-on-surface px-4 py-1.5 text-center font-bold text-xs flex items-center justify-center gap-2 text-white shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">
            cloud_off
          </span>
          <span>
            Reconnection failed. Please check your internet connection or
            refresh.
          </span>
        </div>
      )}

      {partnerStatus === 'reconnecting' && connectionStatus === 'connected' && (
        <div
          id="partnerStatusBanner"
          className="bg-[#FD79A8] border-b-2 border-on-surface px-4 py-1.5 text-center font-bold text-xs flex items-center justify-center gap-2 text-on-surface shrink-0"
        >
          <span className="material-symbols-outlined text-[16px] animate-pulse">
            timer
          </span>
          <span>
            Partner disconnected unexpectedly. Waiting up to 15s for
            reconnection...
          </span>
        </div>
      )}

      {/* ── Main OmeTV-Style Room Container ───────────────────────────────── */}
      <main className="w-full max-w-7xl mx-auto p-2 sm:p-3 flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
        {/* ── Top Area: Two Large Video Panels Side by Side ────────────────── */}
        <section className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-2 relative">
          {/* ── Frame 1: Stranger Video (Left) ────────────────────────────── */}
          <div className="relative w-full h-full min-h-0 bg-[#1a1b1e] rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] overflow-hidden flex items-center justify-center group">
            {/* Retro Corner Accents */}
            <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-primary-container z-20 pointer-events-none" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-primary-container z-20 pointer-events-none" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-primary-container z-20 pointer-events-none" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-primary-container z-20 pointer-events-none" />

            {/* Video Canvas Layer */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#222327] to-[#121316] flex flex-col items-center justify-center p-2 overflow-hidden">
              {/* Scanline Grid Watermark */}
              <svg
                className="absolute inset-0 w-full h-full opacity-10 pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern
                    height="20"
                    id="chatVideoGrid"
                    patternUnits="userSpaceOnUse"
                    width="20"
                  >
                    <path
                      d="M 20 0 L 0 0 0 20"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect fill="url(#chatVideoGrid)" height="100%" width="100%" />
              </svg>

              {/* Remote Video Stream Element */}
              <video
                ref={remoteVideoRef}
                id="remoteVideo"
                autoPlay
                playsInline
                className={`absolute inset-0 w-full h-full object-cover z-10 -scale-x-100 ${sessionId && remoteStream ? 'block' : 'hidden'}`}
              />

              {/* Remote Camera Disabled Overlay */}
              {sessionId && remoteMediaState.isCamOff && (
                <div
                  id="remote-cam-disabled-overlay"
                  className="absolute inset-0 bg-[#1c1b1f] flex flex-col items-center justify-center text-on-primary z-20 animate-in fade-in duration-150"
                >
                  <div className="w-16 h-16 rounded-2xl bg-surface-container border-2 border-on-surface shadow-[3px_3px_0px_#f47721] flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-3xl text-error">
                      videocam_off
                    </span>
                  </div>
                  <p className="font-label-sm text-sm font-bold text-on-surface">
                    {partnerName || 'UIU Student'}&apos;s camera is off
                  </p>
                  <p className="font-body-sm text-xs text-on-surface-variant/80 mt-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Audio is still active
                  </p>
                </div>
              )}

              {/* Stranger Visual Presentation based on Live Connection Phase */}
              {sessionId ? (
                !remoteStream && (
                  <div
                    id="remoteVideoConnecting"
                    className="relative z-10 flex flex-col items-center gap-2"
                  >
                    <div className="relative">
                      {/* Mascot Avatar */}
                      <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl bg-surface-container-lowest border-2 border-on-surface shadow-[3px_3px_0px_#f47721] p-2 flex items-center justify-center">
                        <svg
                          className="w-full h-full text-on-surface"
                          fill="none"
                          viewBox="0 0 64 64"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M22 10V6H24V10H22ZM28 8V4H30V8H28ZM36 10V6H38V10H36Z"
                            fill="#F47721"
                          />
                          <rect
                            fill="#FFE087"
                            height="26"
                            rx="2"
                            stroke="#1c1b1b"
                            strokeWidth="2"
                            width="30"
                            x="14"
                            y="16"
                          />
                          <path
                            d="M14 26H44M14 34H44"
                            stroke="#9C4500"
                            strokeDasharray="2 3"
                            strokeLinecap="round"
                            strokeWidth="2"
                          />
                          <path
                            d="M44 20H49C51.2 20 53 21.8 53 24V28C53 30.2 51.2 32 49 32H44"
                            stroke="#1c1b1b"
                            strokeWidth="2"
                          />
                          <rect
                            fill="#1c1b1b"
                            height="4"
                            width="3"
                            x="20"
                            y="24"
                          />
                          <rect
                            fill="#1c1b1b"
                            height="4"
                            width="3"
                            x="35"
                            y="24"
                          />
                          <rect
                            fill="#F47721"
                            height="2"
                            width="3"
                            x="18"
                            y="29"
                          />
                          <rect
                            fill="#F47721"
                            height="2"
                            width="3"
                            x="37"
                            y="29"
                          />
                          <path
                            d="M26 31C26 32.5 27.5 34 29 34C30.5 34 32 32.5 32 31"
                            stroke="#1c1b1b"
                            strokeWidth="2"
                          />
                          <rect
                            fill="#FFFFFF"
                            height="4"
                            rx="1"
                            stroke="#1c1b1b"
                            strokeWidth="2"
                            width="38"
                            x="10"
                            y="44"
                          />
                        </svg>
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-secondary-container border border-on-surface flex items-center justify-center text-[13px] shadow-[1px_1px_0px_#1c1b1b]">
                        ☕
                      </div>
                    </div>

                    {/* Audio Waveform Indicator */}
                    <div className="flex items-center gap-1 h-4 px-2 py-0.5 bg-on-surface/85 rounded-full border border-surface-variant/30">
                      <span className="w-1 h-2 bg-primary-container rounded-full animate-pulse" />
                      <span className="w-1 h-3.5 bg-primary-container rounded-full animate-bounce" />
                      <span className="w-1 h-2.5 bg-secondary-container rounded-full animate-pulse" />
                      <span className="w-1 h-4 bg-primary-container rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="font-label-sm text-[10px] text-surface-bright ml-1">
                        {partnerStatus === 'reconnecting'
                          ? 'Reconnecting...'
                          : 'Connecting video...'}
                      </span>
                    </div>
                  </div>
                )
              ) : matchProposal ? (
                <div
                  id="matchConfirmationModal"
                  className="relative z-20 flex flex-col items-center gap-3 p-5 text-center max-w-sm bg-[#FFF5E6] border-2 border-on-surface rounded-2xl shadow-[4px_4px_0px_#1c1b1b] animate-in fade-in zoom-in-95 duration-200"
                >
                  <div className="flex items-center justify-between w-full pb-2 border-b-2 border-on-surface/20">
                    <span className="font-headline-md text-xs font-bold uppercase tracking-wider text-primary">
                      Match Found!
                    </span>
                    <span
                      id="matchProposalTimer"
                      className="px-2 py-0.5 bg-error-container text-on-error-container border border-on-surface rounded-full text-[11px] font-bold shadow-[1px_1px_0px_#1c1b1b]"
                    >
                      ⏱ {proposalTimeLeft}s
                    </span>
                  </div>

                  <div className="relative">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-surface-container-lowest border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex items-center justify-center text-4xl">
                      {matchProposal.partner.avatarPreset === 'cat'
                        ? '🐱'
                        : matchProposal.partner.avatarPreset === 'coffee'
                          ? '☕'
                          : matchProposal.partner.avatarPreset === 'tea_cup'
                            ? '🍵'
                            : '🥭'}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border border-on-surface flex items-center justify-center text-white text-xs shadow-[1px_1px_0px_#1c1b1b]">
                      ✓
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3
                      id="matchPartnerNickname"
                      className="font-headline-md text-base sm:text-lg font-bold text-on-surface tracking-tight"
                    >
                      {matchProposal.partner.nickname || 'UIU Student'}
                    </h3>
                    <p className="font-body-sm text-[11px] text-on-surface-variant leading-snug">
                      Verified UIU Student • Ready to connect
                    </p>
                  </div>

                  {hasAcceptedProposal ? (
                    <div className="w-full py-2 px-3 bg-secondary-container/90 border-2 border-on-surface rounded-xl flex items-center justify-center gap-2 shadow-[2px_2px_0px_#1c1b1b]">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                      <span className="font-label-sm text-xs font-bold text-on-surface">
                        Accepted! Waiting for partner...
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full pt-1">
                      <button
                        id="acceptMatchBtn"
                        type="button"
                        onClick={handleAcceptMatch}
                        className="flex-1 py-2 px-3 bg-[#4ade80] hover:bg-[#22c55e] text-on-surface font-headline-md text-xs font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          check
                        </span>
                        <span>Accept</span>
                      </button>
                      <button
                        id="declineMatchBtn"
                        type="button"
                        onClick={handleDeclineMatch}
                        className="flex-1 py-2 px-3 bg-surface-container hover:bg-error-container text-on-surface hover:text-error font-headline-md text-xs font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          close
                        </span>
                        <span>Decline</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : isSearching ? (
                <div
                  id="searchingStateView"
                  className="relative z-10 flex flex-col items-center gap-3 p-4 text-center max-w-xs"
                >
                  <div className="relative flex items-center justify-center">
                    <span className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary-container/20 animate-ping" />
                    <span className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-primary-container/40 animate-pulse" />
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-surface-container-lowest border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] flex items-center justify-center text-3xl z-10">
                      🔍
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-headline-md text-sm sm:text-base font-bold text-surface-bright tracking-tight">
                      Searching for a UIU Peer...
                    </h3>
                    <p className="font-body-sm text-[11px] text-surface-variant leading-snug">
                      Waiting in queue. You will be connected to another
                      verified student automatically.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-secondary-container/90 border border-on-surface rounded-lg text-[11px] font-bold text-on-surface shadow-[1px_1px_0px_#1c1b1b]">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span>Matchmaking Active</span>
                  </div>
                </div>
              ) : (
                <div
                  id="endedStateView"
                  className="relative z-10 flex flex-col items-center gap-3 p-4 text-center max-w-xs"
                >
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-surface-container-lowest border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] flex items-center justify-center text-3xl">
                    ☕
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-headline-md text-sm sm:text-base font-bold text-surface-bright tracking-tight">
                      This Adda Has Ended
                    </h3>
                    <p className="font-body-sm text-[11px] text-surface-variant leading-snug">
                      Ready to talk to someone else? Click Find Next below.
                    </p>
                  </div>
                  <button
                    id="btn-find-next-panel"
                    type="button"
                    onClick={handleNext}
                    disabled={cooldownRemaining > 0}
                    className={`px-3.5 py-1.5 font-headline-md text-xs font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface transition-all flex items-center gap-1.5 ${
                      cooldownRemaining > 0
                        ? 'bg-surface-variant/40 text-on-surface/50 border-on-surface/40 cursor-not-allowed shadow-none'
                        : 'bg-primary-container hover:bg-[#ff8638] text-on-surface shadow-[2px_2px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5'
                    }`}
                  >
                    <span>
                      {cooldownRemaining > 0
                        ? `Find Next (${cooldownRemaining}s)`
                        : 'Find Next Student'}
                    </span>
                    <span className="material-symbols-outlined text-[15px]">
                      arrow_forward
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Stranger Top Overlay */}
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 z-30">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-container-lowest/95 backdrop-blur-sm border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b]">
                <span
                  className={`w-2 h-2 rounded-full ${
                    sessionId
                      ? partnerStatus === 'reconnecting'
                        ? 'bg-error animate-ping'
                        : 'bg-emerald-500 animate-pulse'
                      : isSearching
                        ? 'bg-primary-container animate-ping'
                        : 'bg-error'
                  } border border-on-surface`}
                />
                <span className="font-headline-md text-xs sm:text-sm font-bold text-on-surface">
                  {sessionId
                    ? partnerName || 'UIU Student'
                    : isSearching
                      ? 'Searching...'
                      : 'Adda Ended'}
                </span>
                <span className="hidden sm:inline font-label-sm text-[10px] px-1 rounded bg-secondary-container/80 border border-on-surface/40 text-on-surface">
                  {sessionId
                    ? 'UIU Student'
                    : isSearching
                      ? 'Queue'
                      : 'Offline'}
                </span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5">
                {sessionId && (
                  <>
                    <span
                      id="remote-mic-badge"
                      className={`p-1 rounded-full ${
                        remoteMediaState.isMicMuted ? 'bg-error' : 'bg-emerald-500'
                      } text-on-primary border border-on-surface flex items-center justify-center shadow-[1px_1px_0px_#1c1b1b]`}
                      title={remoteMediaState.isMicMuted ? 'Partner Muted' : 'Partner Mic Live'}
                    >
                      <span className="material-symbols-outlined text-[10px] block">
                        {remoteMediaState.isMicMuted ? 'mic_off' : 'mic'}
                      </span>
                    </span>
                    <span
                      id="remote-cam-badge"
                      className={`p-1 rounded-full ${
                        remoteMediaState.isCamOff ? 'bg-error' : 'bg-emerald-500'
                      } text-on-primary border border-on-surface flex items-center justify-center shadow-[1px_1px_0px_#1c1b1b]`}
                      title={remoteMediaState.isCamOff ? 'Partner Camera Off' : 'Partner Camera Live'}
                    >
                      <span className="material-symbols-outlined text-[10px] block">
                        {remoteMediaState.isCamOff ? 'videocam_off' : 'videocam'}
                      </span>
                    </span>
                  </>
                )}
                <span className="font-label-sm text-[10px] text-surface-bright bg-on-surface/80 px-1.5 py-0.5 rounded border border-surface-variant/20">
                  {sessionId
                    ? partnerStatus === 'reconnecting'
                      ? 'Reconnecting (15s)'
                      : 'Chat Connected'
                    : isSearching
                      ? 'In Queue'
                      : 'Ended'}
                </span>
              </div>
            </div>

            {/* Stranger Bottom-Left Tag */}
            <div className="absolute bottom-2 left-2 z-30 pointer-events-none">
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-surface-container-lowest/90 backdrop-blur-sm border border-on-surface rounded shadow-[1px_1px_0px_#1c1b1b]">
                <span className={`material-symbols-outlined text-[12px] ${
                  sessionId && rtcConnectionState === 'connected'
                    ? 'text-emerald-600'
                    : sessionId && (rtcConnectionState === 'connecting' || rtcConnectionState === 'new')
                      ? 'text-yellow-500'
                      : sessionId && rtcConnectionState === 'failed'
                        ? 'text-error'
                        : 'text-on-surface-variant'
                }`}>
                  wifi
                </span>
                <span className="font-label-sm text-[10px] text-on-surface font-semibold">
                  {sessionId
                    ? partnerStatus === 'reconnecting'
                      ? 'Reconnecting...'
                      : rtcConnectionState === 'connected'
                        ? 'Media Live • P2P'
                        : rtcConnectionState === 'connecting'
                          ? 'Connecting Media...'
                          : rtcConnectionState === 'new'
                            ? 'Waiting for Media...'
                            : rtcConnectionState === 'failed'
                              ? 'Media Failed – Chat Only'
                              : rtcConnectionState === 'closed' || rtcConnectionState === 'disconnected'
                                ? 'Media Closed'
                                : 'Waiting for Media...'
                    : isSearching
                      ? 'Connecting to Queue'
                      : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Frame 2: Self Video (Right) ───────────────────────────────── */}
          <div className="relative w-full h-full min-h-0 bg-[#222327] rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] overflow-hidden flex items-center justify-center group">
            {/* Retro Corner Accents */}
            <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-primary-container z-20 pointer-events-none" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-primary-container z-20 pointer-events-none" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-primary-container z-20 pointer-events-none" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-primary-container z-20 pointer-events-none" />

            {/* Camera View Layer */}
            <div className="absolute inset-0 bg-[#2b2b30] flex items-center justify-center overflow-hidden">
              <video
                ref={localVideoRef}
                id="localVideo"
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover -scale-x-100 ${localStream ? 'block' : 'hidden'}`}
              />
              {!localStream && (
                <div
                  id="localVideoPlaceholder"
                  className="flex flex-col items-center justify-center text-on-surface-variant p-4 text-center z-10"
                >
                  <span className="material-symbols-outlined text-4xl mb-2 text-surface-tint">
                    videocam
                  </span>
                  <p className="font-label-sm text-xs font-bold text-on-surface">
                    {localCameraError ? 'Camera Unavailable' : 'Starting camera...'}
                  </p>
                  <p className="font-body-sm text-[11px] text-on-surface-variant/70 mt-0.5">
                    {localCameraError
                      ? localCameraError
                      : 'Allow browser camera access'}
                  </p>
                </div>
              )}
              {/* Camera Disabled Overlay */}
              <div
                id="self-cam-disabled-overlay"
                className={`absolute inset-0 bg-[#232326] ${isCamOff ? 'flex' : 'hidden'} flex-col items-center justify-center text-on-primary`}
              >
                <span className="material-symbols-outlined text-[28px]">
                  videocam_off
                </span>
                <span className="font-label-sm text-label-sm mt-1">
                  Camera Off
                </span>
              </div>
            </div>

            {/* Self Top Overlay */}
            <div className="absolute top-2 left-2 z-30 flex items-center">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-container-lowest/95 backdrop-blur-sm border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b]">
                <span className="font-headline-md text-xs sm:text-sm font-bold text-on-surface">
                  {userNickname ? `You (${userNickname})` : 'You'}
                </span>
                <span className="hidden sm:inline font-label-sm text-[10px] px-1 rounded bg-secondary-container/80 border border-on-surface/40 text-on-surface">
                  You
                </span>
              </div>
            </div>

            {/* Self Bottom Status Indicators */}
            <div className="absolute bottom-2 right-2 z-30 flex items-center gap-1">
              <span
                id="self-mic-badge"
                className={`p-1 rounded-full ${isMuted ? 'bg-error' : 'bg-emerald-500'} text-on-primary border border-on-surface flex items-center justify-center shadow-[1px_1px_0px_#1c1b1b]`}
                title={isMuted ? 'Microphone Muted' : 'Microphone Live'}
              >
                <span className="material-symbols-outlined text-[12px] block">
                  {isMuted ? 'mic_off' : 'mic'}
                </span>
              </span>
              <span
                id="self-cam-badge"
                className={`p-1 rounded-full ${isCamOff ? 'bg-error' : 'bg-emerald-500'} text-on-primary border border-on-surface flex items-center justify-center shadow-[1px_1px_0px_#1c1b1b]`}
                title={isCamOff ? 'Camera Off' : 'Camera Live'}
              >
                <span className="material-symbols-outlined text-[12px] block">
                  {isCamOff ? 'videocam_off' : 'videocam'}
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* ── Compact Bottom Controls Bar Directly Below Video ─────────────── */}
        <section className="w-full bg-surface-container-lowest p-1.5 sm:p-2 rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex items-center justify-between gap-2 shrink-0 h-13 sm:h-14">
          {/* Media & Chat Toggles */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              id="btn-toggle-mic"
              onClick={toggleMic}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg border-2 flex items-center gap-1.5 font-label-sm text-xs sm:text-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${
                isMuted
                  ? 'bg-error/20 text-error border-error shadow-[2px_2px_0px_#b3261e]'
                  : 'bg-surface-container hover:bg-secondary-container text-on-surface border-on-surface shadow-[2px_2px_0px_#1c1b1b]'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[16px] ${isMuted ? 'text-error' : 'text-on-surface'}`}
              >
                {isMuted ? 'mic_off' : 'mic'}
              </span>
              <span className="hidden sm:inline font-bold">
                {isMuted ? 'Unmute' : 'Mute'}
              </span>
            </button>

            <button
              id="btn-toggle-cam"
              onClick={toggleCam}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg border-2 flex items-center gap-1.5 font-label-sm text-xs sm:text-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${
                isCamOff
                  ? 'bg-error/20 text-error border-error shadow-[2px_2px_0px_#b3261e]'
                  : 'bg-surface-container hover:bg-secondary-container text-on-surface border-on-surface shadow-[2px_2px_0px_#1c1b1b]'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[16px] ${isCamOff ? 'text-error' : 'text-on-surface'}`}
              >
                {isCamOff ? 'videocam_off' : 'videocam'}
              </span>
              <span className="hidden sm:inline font-bold">
                {isCamOff ? 'Cam On' : 'Camera'}
              </span>
            </button>

            <button
              id="btn-toggle-chat"
              onClick={toggleChat}
              className={`relative px-2.5 sm:px-3 py-1.5 rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] flex items-center gap-1.5 font-label-sm text-xs sm:text-sm ${
                isChatOpen
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-surface-container text-on-surface'
              } hover:bg-secondary-container active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all`}
              title={isChatOpen ? 'Minimize Chat (C)' : 'Open Chat (C)'}
            >
              <span className="material-symbols-outlined text-[16px]">
                chat
              </span>
              <span className="hidden sm:inline font-bold">Chat</span>
              {unreadCount > 0 && !isChatOpen && (
                <span
                  id="btnChatUnreadDot"
                  className="w-2.5 h-2.5 rounded-full bg-error border border-on-surface animate-pulse"
                />
              )}
            </button>
          </div>

          {/* Centre: Next / Skip Partner */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              id="nextBtn"
              onClick={handleNext}
              disabled={cooldownRemaining > 0}
              className={`px-4 sm:px-6 py-1.5 rounded-lg border-2 border-on-surface font-headline-md text-sm font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${
                cooldownRemaining > 0
                  ? 'bg-surface-variant/40 text-on-surface/50 border-on-surface/40 cursor-not-allowed shadow-none'
                  : 'bg-primary-container text-on-primary-container hover:bg-[#ff8638] shadow-[3px_3px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
              }`}
            >
              <span>
                {cooldownRemaining > 0 ? `Next (${cooldownRemaining}s)` : 'Next'}
              </span>
              {cooldownRemaining === 0 && (
                <span className="px-1.5 py-0.2 bg-[#FFF5E6] text-on-surface rounded border border-on-surface text-[10px] font-label-sm font-bold shadow-[1px_1px_0px_#1c1b1b] hidden sm:inline-block">
                  ESC
                </span>
              )}
            </button>

            <button
              id="endChatBtn"
              onClick={handleEnd}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-surface-container-lowest text-error border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] font-label-sm text-xs sm:text-sm font-bold flex items-center gap-1 hover:bg-error-container active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              title="Disconnect"
            >
              <span className="material-symbols-outlined text-[16px]">
                call_end
              </span>
              <span className="hidden sm:inline">End</span>
            </button>
          </div>

          {/* Right: Report Button with Dropdown */}
          <div className="relative">
            <button
              id="reportDropdownBtn"
              aria-label="Report or Block"
              onClick={(e) => {
                e.stopPropagation()
                setReportOpen((prev) => !prev)
              }}
              className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-surface-container border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] text-on-surface-variant hover:text-error hover:bg-error-container/40 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-label-sm text-xs sm:text-sm font-bold flex items-center gap-1 transition-all"
            >
              <span className="material-symbols-outlined text-[16px] text-error">
                flag
              </span>
              <span className="hidden sm:inline">Report</span>
            </button>

            {/* Report Menu */}
            <div
              id="reportMenu"
              className={`${reportOpen ? '' : 'hidden'} absolute right-0 bottom-full mb-2 w-48 bg-surface-container-lowest border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] rounded-lg py-1 z-50`}
            >
              <button
                type="button"
                onClick={() => {
                  setReportOpen(false)
                  setReportModalOpen(true)
                }}
                className="w-full text-left px-3 py-1.5 font-label-sm text-xs text-on-surface hover:bg-surface-container flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px] text-error">
                  flag
                </span>
                Report Partner
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportOpen(false)
                  setBlockModalOpen(true)
                }}
                className="w-full text-left px-3 py-1.5 font-label-sm text-xs text-on-surface hover:bg-surface-container flex items-center gap-2 border-t border-on-surface/20"
              >
                <span className="material-symbols-outlined text-[16px]">
                  person_off
                </span>
                Block Student
              </button>
            </div>
          </div>
        </section>

        {/* ── Sub-Footer Info Strip ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-1 text-on-surface-variant font-label-sm text-[9px] sm:text-[10px] shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span>
              <kbd className="px-1 py-0.2 bg-surface-container border border-on-surface rounded font-mono font-bold text-on-surface">
                ESC
              </kbd>{' '}
              Next
            </span>
            <span>•</span>
            <span>
              <kbd className="px-1 py-0.2 bg-surface-container border border-on-surface rounded font-mono font-bold text-on-surface">
                M
              </kbd>{' '}
              Mute
            </span>
            <span>•</span>
            <span>
              <kbd className="px-1 py-0.2 bg-surface-container border border-on-surface rounded font-mono font-bold text-on-surface">
                V
              </kbd>{' '}
              Cam
            </span>
            <span>•</span>
            <span>
              <kbd className="px-1 py-0.2 bg-surface-container border border-on-surface rounded font-mono font-bold text-on-surface">
                C
              </kbd>{' '}
              Chat
            </span>
          </div>
          <div className="flex items-center gap-1 text-outline">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            <span>Exclusively for UIU Students • 100% Ephemeral</span>
          </div>
        </div>
      </main>

      {/* ── Floating Draggable & Resizable Chat Window ──────────────────────── */}
      <FloatingChatWindow
        isOpen={isChatOpen}
        onClose={handleCloseChat}
        onMinimize={handleMinimizeChat}
        messages={messages}
        input={input}
        onInputChange={handleInputChange}
        onSend={handleSend}
        isTyping={isTyping}
        partnerName={partnerName}
        sessionId={sessionId}
        partnerStatus={partnerStatus}
        onQuickEmoji={handleQuickEmoji}
        chatStreamRef={chatStreamRef}
        inputRef={inputRef}
      />

      {/* ── Floating Chat Launcher Widget (when minimized/hidden) ───────────── */}
      {!isChatOpen && (
        <div className="fixed bottom-16 right-4 sm:bottom-20 sm:right-6 z-40 animate-in fade-in zoom-in-95 duration-200">
          <button
            id="btnOpenFloatingChat"
            type="button"
            onClick={handleOpenChat}
            className="relative px-4 py-2.5 bg-primary-container hover:bg-[#ff8638] text-on-surface font-headline-md text-xs sm:text-sm font-bold uppercase tracking-wider rounded-full border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
            aria-label={`Open Chat${unreadCount > 0 ? `, ${unreadCount} unread messages` : ''}`}
          >
            <span className="material-symbols-outlined text-[18px]">chat</span>
            <span>{partnerName ? `Chat • ${partnerName}` : 'Adda Chat'}</span>
            {sessionId && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse border border-on-surface" />
            )}
            {unreadCount > 0 && (
              <span
                id="unreadCountBadge"
                className="px-2 py-0.5 bg-error text-white font-mono text-[11px] font-bold rounded-full border border-on-surface shadow-[1px_1px_0px_#1c1b1b] animate-bounce"
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Modals: Report and Block ────────────────────────────────────────── */}
      <ReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false)
          setReportError(null)
        }}
        onSubmit={handleReportSubmit}
        isSubmitting={isSubmittingReport}
        error={reportError}
      />

      <BlockModal
        isOpen={blockModalOpen}
        onClose={() => {
          setBlockModalOpen(false)
          setBlockError(null)
        }}
        onConfirm={handleBlockConfirm}
        isSubmitting={isSubmittingBlock}
        error={blockError}
      />
    </div>
  )
}
