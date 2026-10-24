/**
 * Chat.tsx – KothaKoi OmeTV-style Chat Room
 * Compact video-first adda experience exclusively for UIU students.
 * Prominent dual video stage with compact chat panel directly underneath.
 */
import { useState, useRef, useEffect, FormEvent } from 'react'
import { Link } from 'react-router-dom'

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
    sender: 'stranger',
    name: 'Cha-er Cup ☕',
    time: '10:42 PM',
    text: 'Ki obostha! Finals season or chill season at UIU?',
  },
  {
    id: 2,
    sender: 'user',
    name: 'You (Midnight Mango)',
    time: '10:42 PM',
    text: 'Finals approaching fast 😭 Debugging code and needed a tea break haha.',
  },
  {
    id: 3,
    sender: 'stranger',
    name: 'Cha-er Cup ☕',
    time: '10:43 PM',
    text: 'Haha same here! CSE or BBA? No names needed!',
  },
  {
    id: 4,
    sender: 'user',
    name: 'You (Midnight Mango)',
    time: '10:43 PM',
    text: 'CSE 3rd year 💻 you?',
  },
  {
    id: 5,
    sender: 'stranger',
    name: 'Cha-er Cup ☕',
    time: '10:44 PM',
    text: 'EEE! Surviving on cha and slides tonight ☕',
  },
]

const MOCK_REPLIES = [
  'Haha exactly, code compiles = instant dopamine hit 😂',
  'Need a cup of tong cha to survive tonight ☕',
  'Are you a day scholar or living near Madani Avenue?',
  'Algorithm finals are ruthless this trimester!',
  'Shob sesh! Will cram everything right before the exam haha.',
  'Good vibes! Nice meeting a fellow UIUian here.',
]

const QUICK_EMOJIS = ['☕', '😭', '🔥']

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Chat() {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  // Floating chat overlay state (hidden by default)
  const [isChatOpen, setIsChatOpen] = useState(false)

  // Media mock controls state
  const [isMuted, setIsMuted] = useState(false)
  const [isCamOff, setIsCamOff] = useState(false)
  const [isMirrored, setIsMirrored] = useState(false)

  const chatStreamRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const replyIndexRef = useRef(0)
  const nextIdRef = useRef(10)

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    if (chatStreamRef.current) {
      chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping, isChatOpen])

  // Keyboard shortcuts: ESC (Next), M (Mute), V (Camera), C (Toggle Chat)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return

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
  }, [isMuted, isCamOff])

  // Close report menu on outside click
  useEffect(() => {
    const close = () => setReportOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function toggleMic() {
    setIsMuted((prev) => !prev)
  }

  function toggleCam() {
    setIsCamOff((prev) => !prev)
  }

  function toggleChat() {
    setIsChatOpen((prev) => {
      const next = !prev
      if (next) {
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      return next
    })
  }

  function handleSend(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return

    const userMsg: ChatMessage = {
      id: nextIdRef.current++,
      sender: 'user',
      name: 'You (Midnight Mango)',
      time: nowTime(),
      text,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    // Simulate stranger typing + response
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      const reply = MOCK_REPLIES[replyIndexRef.current % MOCK_REPLIES.length]
      replyIndexRef.current++
      const strangerMsg: ChatMessage = {
        id: nextIdRef.current++,
        sender: 'stranger',
        name: 'Cha-er Cup ☕',
        time: nowTime(),
        text: reply,
      }
      setMessages((prev) => [...prev, strangerMsg])
    }, 1200)
  }

  function handleQuickEmoji(emoji: string) {
    setInput((prev) => prev + emoji + ' ')
    inputRef.current?.focus()
  }

  function handleNext() {
    const notice: ChatMessage = {
      id: nextIdRef.current++,
      sender: 'notice',
      name: '',
      time: '',
      text: 'Connecting to a new UIU peer...',
    }
    setMessages((prev) => [...prev, notice])
    setTimeout(() => {
      window.location.reload()
    }, 600)
  }

  function handleEnd() {
    if (window.confirm('Disconnect and leave this adda?')) {
      window.location.href = '/'
    }
  }

  function handleReport(reason: string) {
    alert(`Report recorded: "${reason}". Review initiated for this peer.`)
    setReportOpen(false)
    handleNext()
  }

  function handleBlock() {
    if (window.confirm('Block this peer? You will not be matched again.')) {
      setReportOpen(false)
      handleNext()
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

          {/* Centre UIU-Only Badge */}
          <div className="hidden md:flex items-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
              <span className="font-label-sm text-xs text-on-surface font-bold tracking-wide">
                🎓 UIU Students Only • 100% Anonymous
              </span>
            </div>
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
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center border border-on-surface shadow-[1px_1px_0px_#1c1b1b] shrink-0">
              <span className="material-symbols-outlined text-on-primary text-[16px]">
                person
              </span>
            </div>
          </div>
        </div>
      </header>

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

              {/* Stranger Visual Representation */}
              <div className="relative z-10 flex flex-col items-center gap-2">
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
                      <rect fill="#1c1b1b" height="4" width="3" x="20" y="24" />
                      <rect fill="#1c1b1b" height="4" width="3" x="35" y="24" />
                      <rect fill="#F47721" height="2" width="3" x="18" y="29" />
                      <rect fill="#F47721" height="2" width="3" x="37" y="29" />
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
                    Speaking...
                  </span>
                </div>
              </div>
            </div>

            {/* Stranger Top Overlay */}
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 z-30">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-container-lowest/95 backdrop-blur-sm border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse border border-on-surface" />
                <span className="font-headline-md text-xs sm:text-sm font-bold text-on-surface">
                  Cha-er Cup ☕
                </span>
                <span className="hidden sm:inline font-label-sm text-[10px] px-1 rounded bg-secondary-container/80 border border-on-surface/40 text-on-surface">
                  UIU Student
                </span>
              </div>
              <span className="font-label-sm text-[10px] text-surface-bright bg-on-surface/80 px-1.5 py-0.5 rounded border border-surface-variant/20">
                #UIU-4892
              </span>
            </div>

            {/* Stranger Bottom-Left Tag */}
            <div className="absolute bottom-2 left-2 z-30 pointer-events-none">
              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-surface-container-lowest/90 backdrop-blur-sm border border-on-surface rounded shadow-[1px_1px_0px_#1c1b1b]">
                <span className="material-symbols-outlined text-[12px] text-emerald-600">
                  wifi
                </span>
                <span className="font-label-sm text-[10px] text-on-surface font-semibold">
                  24ms • UIU P2P
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
            <div className="absolute inset-0 bg-[#2b2b30] flex items-center justify-center">
              <img
                className={`w-full h-full object-cover transition-transform ${isMirrored ? '-scale-x-100' : ''}`}
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAL__CXl0m59Y9dcmXOcUvmzHsbsNdHlIEEBdXukXTPXh79IiL1dwH6FaPJrxtVrc3jrDcwt3uIJ98Gy_VuF6c3rm7eFCQ2NV7_oUHj4Sd49_9gYAOJKACsE3aUjmcYp1z1TmjcQVN4mnAb8i9wjOAdhOwHqS7mZArRpgksXcxqbjyimu1xih6SUqWtojashsLFGdnFS2WjBUI-t7eSSgRoQRbdERDlAGV-gOEWmIsAHwyuLIevUogX"
                alt="Self video preview"
              />
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
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 z-30">
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-container-lowest/95 backdrop-blur-sm border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b]">
                <span className="font-headline-md text-xs sm:text-sm font-bold text-on-surface">
                  You (Midnight Mango)
                </span>
                <span className="hidden sm:inline font-label-sm text-[10px] px-1 rounded bg-secondary-container/80 border border-on-surface/40 text-on-surface">
                  You
                </span>
              </div>
              <button
                id="btn-pip-flip"
                title="Flip mirror"
                onClick={() => setIsMirrored((prev) => !prev)}
                className="p-1 rounded bg-surface-container-lowest/90 text-on-surface hover:bg-surface-container-lowest transition-colors border border-on-surface/50 shadow-[1px_1px_0px_#1c1b1b]"
              >
                <span className="material-symbols-outlined text-[13px] block">
                  flip_camera_ios
                </span>
              </button>
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
                className={`p-1 rounded-full ${isCamOff ? 'bg-error' : 'bg-emerald-500'} text-on-primary border border-on-surface flex items-center justify-center shadow-[1px_1px_0px_#1c1b1b]`}
                title={isCamOff ? 'Camera Off' : 'Camera Live'}
              >
                <span className="material-symbols-outlined text-[12px] block">
                  {isCamOff ? 'videocam_off' : 'videocam'}
                </span>
              </span>
            </div>
          </div>

          {/* ── Compact Floating Chat Overlay (Toggled via Chat button) ─────── */}
          {isChatOpen && (
            <div
              id="chatOverlay"
              className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 z-40 w-72 sm:w-80 md:w-84 max-w-[calc(100%-1rem)] h-56 sm:h-64 md:h-72 flex flex-col bg-[#FFF5E6]/95 backdrop-blur-md border-2 border-on-surface rounded-xl shadow-[4px_4px_0px_#1c1b1b] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Overlay Header */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#FFF5E6] border-b-2 border-on-surface shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse border border-on-surface" />
                  <span className="font-headline-md text-xs font-bold text-on-surface tracking-tight">
                    UIU Live Chat
                  </span>
                  <span className="font-label-sm text-[10px] px-1 rounded bg-secondary-container border border-on-surface/40 text-on-surface font-semibold">
                    Anonymous
                  </span>
                </div>
                <button
                  id="btnCloseChat"
                  type="button"
                  title="Close chat"
                  onClick={() => setIsChatOpen(false)}
                  className="w-5 h-5 rounded flex items-center justify-center text-on-surface hover:bg-error-container hover:text-error transition-colors border border-transparent hover:border-on-surface"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    close
                  </span>
                </button>
              </div>

              {/* Mini Chat Stream */}
              <div
                ref={chatStreamRef}
                id="chatStream"
                className="flex-1 min-h-0 overflow-y-auto px-2.5 py-1.5 space-y-1.5 bg-surface-container-lowest/80 scroll-smooth text-xs"
              >
                {/* System Mini Welcome */}
                <div className="flex justify-center my-0.5">
                  <span className="font-label-sm text-[10px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-on-surface/30">
                    ✨ Connected with UIU peer. Say salam!
                  </span>
                </div>

                {/* Messages */}
                {messages.map((msg) => {
                  if (msg.sender === 'notice') {
                    return (
                      <div key={msg.id} className="flex justify-center my-0.5">
                        <span className="font-label-sm text-[10px] text-primary font-bold bg-surface-container-high px-2 py-0.5 rounded border border-on-surface shadow-[1px_1px_0px_#1c1b1b]">
                          {msg.text}
                        </span>
                      </div>
                    )
                  }

                  if (msg.sender === 'stranger') {
                    return (
                      <div
                        key={msg.id}
                        className="flex flex-col items-start max-w-[85%]"
                      >
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="font-label-sm text-[10px] font-bold text-primary">
                            {msg.name}
                          </span>
                          <span className="font-label-sm text-[9px] text-outline">
                            {msg.time}
                          </span>
                        </div>
                        <div className="bg-surface-container-lowest text-on-surface border border-on-surface px-2.5 py-1 rounded-lg shadow-[1px_1px_0px_#1c1b1b] text-xs leading-snug">
                          {msg.text}
                        </div>
                      </div>
                    )
                  }

                  // User Message
                  return (
                    <div
                      key={msg.id}
                      className="flex flex-col items-end self-end max-w-[85%] ml-auto"
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="font-label-sm text-[9px] text-outline">
                          {msg.time}
                        </span>
                        <span className="font-label-sm text-[10px] font-bold text-on-secondary-container">
                          {msg.name}
                        </span>
                      </div>
                      <div className="bg-secondary-container text-on-secondary-container border border-on-surface px-2.5 py-1 rounded-lg shadow-[1px_1px_0px_#1c1b1b] text-xs font-medium leading-snug">
                        {msg.text}
                      </div>
                    </div>
                  )
                })}

                {/* Typing Indicator */}
                <div
                  id="typingIndicator"
                  className={`flex items-center gap-1.5 pt-0.5 ${isTyping ? '' : 'hidden'}`}
                >
                  <span className="font-label-sm text-[10px] font-bold text-primary">
                    Cha-er Cup
                  </span>
                  <span className="font-body-sm text-[10px] text-on-surface-variant italic">
                    typing
                  </span>
                  <div className="flex items-center gap-0.5 ml-0.5 bg-surface-container px-1.5 py-0.5 rounded-full border border-on-surface/20">
                    <span className="w-1 h-1 rounded-full bg-primary animate-bounce" />
                    <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>

              {/* Compact Input Dock */}
              <form
                id="chatForm"
                onSubmit={handleSend}
                className="flex items-center gap-1.5 p-1.5 bg-[#FFF5E6] border-t-2 border-on-surface shrink-0"
              >
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    id="messageInput"
                    type="text"
                    autoComplete="off"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type message & press Enter..."
                    className="w-full px-2.5 py-1 bg-surface text-on-surface font-body-sm text-xs rounded-lg border border-on-surface shadow-[1px_1px_0px_#1c1b1b] focus:border-primary-container focus:outline-none transition-all placeholder:text-outline/70"
                  />
                </div>

                {/* Quick Emojis */}
                <div className="hidden sm:flex items-center gap-1">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      data-text={emoji}
                      onClick={() => handleQuickEmoji(emoji)}
                      className="quick-reaction px-1.5 py-0.5 bg-surface-container hover:bg-secondary-container border border-on-surface rounded text-xs shadow-[1px_1px_0px_#1c1b1b] active:translate-y-[1px]"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Send Button */}
                <button
                  id="sendBtn"
                  type="submit"
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-primary-container text-on-primary-container font-label-sm text-xs uppercase font-bold rounded-lg border border-on-surface shadow-[1px_1px_0px_#1c1b1b] hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all shrink-0"
                >
                  <span>Send</span>
                  <span className="material-symbols-outlined text-[13px]">
                    send
                  </span>
                </button>
              </form>
            </div>
          )}
        </section>

        {/* ── Compact Bottom Controls Bar Directly Below Video ─────────────── */}
        <section className="w-full bg-surface-container-lowest p-1.5 sm:p-2 rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex items-center justify-between gap-2 shrink-0 h-13 sm:h-14">
          {/* Media & Chat Toggles */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              id="btn-toggle-mic"
              onClick={toggleMic}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-surface-container border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] flex items-center gap-1.5 font-label-sm text-xs sm:text-sm text-on-surface hover:bg-secondary-container active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
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
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-surface-container border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] flex items-center gap-1.5 font-label-sm text-xs sm:text-sm text-on-surface hover:bg-secondary-container active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
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
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] flex items-center gap-1.5 font-label-sm text-xs sm:text-sm ${
                isChatOpen
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-surface-container text-on-surface'
              } hover:bg-secondary-container active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all`}
              title={isChatOpen ? 'Close Chat (C)' : 'Open Chat (C)'}
            >
              <span className="material-symbols-outlined text-[16px]">
                chat
              </span>
              <span className="hidden sm:inline font-bold">Chat</span>
            </button>
          </div>

          {/* Centre: Next / Skip Partner */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              id="nextBtn"
              onClick={handleNext}
              className="px-4 sm:px-6 py-1.5 rounded-lg bg-primary-container text-on-primary-container border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] font-headline-md text-sm font-bold uppercase tracking-wider flex items-center gap-2 hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              <span>Next</span>
              <span className="px-1.5 py-0.2 bg-[#FFF5E6] text-on-surface rounded border border-on-surface text-[10px] font-label-sm font-bold shadow-[1px_1px_0px_#1c1b1b] hidden sm:inline-block">
                ESC
              </span>
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
                onClick={() => handleReport('Inappropriate Talk')}
                className="w-full text-left px-3 py-1.5 font-label-sm text-xs text-on-surface hover:bg-surface-container flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px] text-error">
                  flag
                </span>
                Inappropriate Talk
              </button>
              <button
                type="button"
                onClick={() => handleReport('Inappropriate Video')}
                className="w-full text-left px-3 py-1.5 font-label-sm text-xs text-on-surface hover:bg-surface-container flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px] text-error">
                  videocam_off
                </span>
                Inappropriate Video
              </button>
              <button
                type="button"
                onClick={handleBlock}
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
    </div>
  )
}
