/**
 * Video.tsx – KothaKoi Video Chat Interface
 * Recreated faithfully from the Google Stitch export.
 * Includes interactive P2P video stage mock, PiP camera view,
 * media toggles (mic/cam), live side chat, and safety reporting modal.
 */
import { useState, useRef, useEffect, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { OnlineBadge } from '../components/OnlineBadge'

// ── Types ────────────────────────────────────────────────────────────────────

interface VideoChatMessage {
  id: number
  sender: 'partner' | 'user' | 'notice'
  name: string
  time: string
  text: string
}

// ── Initial Mock Messages ────────────────────────────────────────────────────

const INITIAL_MESSAGES: VideoChatMessage[] = [
  {
    id: 1,
    sender: 'partner',
    name: 'Pixel Panda',
    time: '14:02',
    text: 'Can you hear me? Mic seems fine on my end!',
  },
  {
    id: 2,
    sender: 'user',
    name: 'You',
    time: '14:02',
    text: 'Loud and clear! Which department are you from? ☕',
  },
  {
    id: 3,
    sender: 'partner',
    name: 'Pixel Panda',
    time: '14:03',
    text: 'CSE 3rd year. Pulling an all-nighter for algorithm finals tomorrow haha 😅',
  },
]

const MOCK_PARTNER_REPLIES = [
  'Haha nice! We should totally do a study sprint together.',
  'Wait let me grab another cup of cha ☕',
  'Which campus are you at? DU or BUET?',
  'Yeah the algorithms exam is brutal, dynamic programming is killing me 😂',
  'Good vibes, nice meeting you here!',
]

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Video() {
  // Media controls state
  const [isMuted, setIsMuted] = useState(false)
  const [isCamOff, setIsCamOff] = useState(false)
  const [isAudioFxOn, setIsAudioFxOn] = useState(true)
  const [isMirrored, setIsMirrored] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Chat state
  const [messages, setMessages] = useState<VideoChatMessage[]>(INITIAL_MESSAGES)
  const [chatInput, setChatInput] = useState('')
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [reportReason, setReportReason] = useState('nudity')

  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const videoBoxRef = useRef<HTMLDivElement>(null)
  const nextIdRef = useRef(10)
  const replyIdxRef = useRef(0)

  // Auto-scroll chat stream
  const scrollToBottom = () => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Keyboard shortcuts: ESC (next), M (mute), V (cam)
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (document.activeElement === chatInputRef.current) return

      if (e.key === 'Escape') {
        e.preventDefault()
        handleNextMatch()
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        toggleMic()
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault()
        toggleCam()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMuted, isCamOff])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function toggleMic() {
    setIsMuted((prev) => !prev)
  }

  function toggleCam() {
    setIsCamOff((prev) => !prev)
  }

  function toggleFullscreen() {
    if (!videoBoxRef.current) return
    if (!document.fullscreenElement) {
      videoBoxRef.current.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }

  function handleNextMatch() {
    const notice: VideoChatMessage = {
      id: nextIdRef.current++,
      sender: 'notice',
      name: '',
      time: '',
      text: 'Connecting to a new campus peer...',
    }
    setMessages((prev) => [...prev, notice])
    setTimeout(() => {
      window.location.reload()
    }, 800)
  }

  function handleEndCall() {
    if (window.confirm('Disconnect and leave video call?')) {
      window.location.href = '/'
    }
  }

  function handleChatSubmit(e: FormEvent) {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text) return

    const userMsg: VideoChatMessage = {
      id: nextIdRef.current++,
      sender: 'user',
      name: 'You',
      time: nowTime(),
      text,
    }
    setMessages((prev) => [...prev, userMsg])
    setChatInput('')

    // Simulate partner response
    setTimeout(() => {
      const reply =
        MOCK_PARTNER_REPLIES[replyIdxRef.current % MOCK_PARTNER_REPLIES.length]
      replyIdxRef.current++
      const partnerMsg: VideoChatMessage = {
        id: nextIdRef.current++,
        sender: 'partner',
        name: 'Pixel Panda',
        time: nowTime(),
        text: reply,
      }
      setMessages((prev) => [...prev, partnerMsg])
    }, 1200)
  }

  function handleSubmitReport() {
    setReportModalOpen(false)
    alert(`Report submitted for reason: "${reportReason}". Review initiated.`)
    handleNextMatch()
  }

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#FFF5E6] border-b-2 border-on-surface shadow-[0_2px_0px_#1c1b1b]">
        <div className="h-16 max-w-7xl mx-auto px-margin lg:px-margin-desktop flex items-center justify-between gap-gutter">
          <div className="flex items-center gap-space-sm">
            <Link
              to="/"
              className="flex items-center gap-space-xs select-none"
              data-path="chat-lobby"
            >
              <span className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface">
                KothaKoi
              </span>
              <span className="font-headline-md text-headline-md font-bold text-primary">
                .
              </span>
              <span className="hidden sm:inline-block font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-secondary-container text-on-secondary-container border border-on-surface ml-1">
                কথা কই
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <OnlineBadge />
            <div className="hidden md:inline-flex items-center gap-space-xs px-space-sm py-1 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
              <span className="font-label-sm text-label-sm text-on-surface font-bold tracking-wide">
                🎓 Verified Campus Network • Anonymous
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-md">
            <nav
              className="flex items-center gap-space-md lg:gap-gutter-desktop"
              data-active-classes="text-primary-container font-bold underline decoration-2 underline-offset-4"
            >
              <a
                className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
                data-path="how-it-works"
                href="/#how-it-works"
              >
                How it works
              </a>
              <a
                className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors hidden sm:inline-block"
                data-path="campus-guidelines"
                href="/#guidelines"
              >
                Campus Guidelines
              </a>
              <a
                className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
                data-path="login"
                href="/login"
              >
                Login
              </a>
            </nav>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center border border-on-surface shadow-[1px_1px_0px_#1c1b1b] shrink-0">
              <span className="material-symbols-outlined text-on-primary text-[18px]">
                person
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Workspace ─────────────────────────────────────────────────── */}
      <main className="w-full pt-16 bg-surface min-h-[calc(100vh-80px)] flex-1 flex flex-col">
        <div className="flex flex-col w-full flex-1">
          <div className="w-full max-w-7xl mx-auto px-margin lg:px-margin-desktop py-space-sm pb-space-lg flex flex-col gap-space-sm flex-1">
            {/* ── Top Utility Bar: Matching Context & Verified Campus ─────── */}
            <div className="flex items-center justify-between gap-space-sm bg-surface-container px-space-md py-space-xs rounded-xl shadow-[3px_3px_0px_#1c1b1b] border-2 border-on-surface">
              <div className="flex items-center gap-space-sm flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-space-xs py-0.5 bg-secondary-container text-on-secondary-container font-label-sm text-label-sm rounded border border-on-surface">
                  <span className="material-symbols-outlined text-[14px]">
                    local_cafe
                  </span>
                  Adda Mode: Chai &amp; Code
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm">
                  <span className="w-2 h-2 rounded-full bg-primary-container" />
                  Matching: CS / Engg Campuses (DU, BUET, BRACU, NSU)
                </span>
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface px-space-xs py-0.5 bg-surface-container-lowest rounded border border-on-surface">
                  ROOM #DH-8841
                </span>
                <button
                  id="toggle-audio-fx"
                  title="Toggle audio SFX"
                  onClick={() => setIsAudioFxOn((prev) => !prev)}
                  className="p-1 rounded hover:bg-surface-variant text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isAudioFxOn ? 'volume_up' : 'volume_off'}
                  </span>
                </button>
              </div>
            </div>

            {/* ── Main Workspace: Video Matrix (Left 65%) + Side Chat (Right 35%) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md w-full items-start">
              {/* ── Video Frame Section (Col 8) ────────────────────────────── */}
              <div className="lg:col-span-8 flex flex-col gap-space-sm">
                {/* Video Canvas Box (with PiP Self View) */}
                <div
                  ref={videoBoxRef}
                  className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-[#1a1b1e] rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] overflow-hidden flex items-center justify-center select-none group"
                >
                  {/* Retro Corner Framing Accents */}
                  <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-primary-container z-20 pointer-events-none" />
                  <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-primary-container z-20 pointer-events-none" />
                  <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-primary-container z-20 pointer-events-none" />
                  <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-primary-container z-20 pointer-events-none" />

                  {/* Video Layer / Simulated Live Feed */}
                  <div className="absolute inset-0 bg-gradient-to-b from-[#222327] to-[#121316] flex flex-col items-center justify-center p-space-md overflow-hidden">
                    {/* Retro Scanline / Grid Background Pattern */}
                    <svg
                      className="absolute inset-0 w-full h-full opacity-10 pointer-events-none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <defs>
                        <pattern
                          height="24"
                          id="videoGrid"
                          patternUnits="userSpaceOnUse"
                          width="24"
                        >
                          <path
                            d="M 24 0 L 0 0 0 24"
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="0.5"
                          />
                        </pattern>
                      </defs>
                      <rect fill="url(#videoGrid)" height="100%" width="100%" />
                    </svg>

                    {/* Remote Partner Visual Representation */}
                    <div className="relative z-10 flex flex-col items-center gap-space-sm">
                      <div className="relative">
                        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-surface-container border-2 border-on-surface shadow-[4px_4px_0px_#f47721] flex items-center justify-center overflow-hidden">
                          <img
                            className="w-full h-full object-cover"
                            data-alt="A charming neo-brutalist pixel art avatar of a friendly panda wearing headphones and sipping hot milk tea from a clay cup, bold ink contours, warm lighting with orange accents on dark slate background"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCFpNseIceiHJsmdIPxhusppoTyK-GeeWyuRWELV4q-Gs7vckm7oAIiRn-vtL94fVvaXtiJ4MxA9w5pqcMdsqXnQ45d6ghajzv87ULeF3cjsR2xNRQfL7_98bauaAdc_GswVFTRzcLdE3ReufT1fOqNv8Bs8GxKH-WMOtyxGXpDxzGYhVdE5simV_b-KoYO4bovra8NfGhlChvBorjZ8ZEA5FXcGQX1YTTbFi9pBqsItGp_Bd1m8Kkv"
                            alt="Pixel Panda avatar"
                          />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-secondary-container border border-on-surface flex items-center justify-center text-[15px] shadow-[1px_1px_0px_#1c1b1b]">
                          🐼
                        </div>
                      </div>

                      {/* Subtle Audio Waveform Indicator */}
                      <div className="flex items-center gap-1 h-5 px-space-xs py-1 bg-on-surface/80 rounded-full border border-surface-variant/30">
                        <span className="w-1 h-2 bg-primary-container rounded-full animate-pulse" />
                        <span className="w-1 h-4 bg-primary-container rounded-full animate-bounce" />
                        <span className="w-1 h-3 bg-secondary-container rounded-full animate-pulse" />
                        <span className="w-1 h-5 bg-primary-container rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1 h-2 bg-primary-container rounded-full animate-pulse" />
                        <span className="font-label-sm text-label-sm text-surface-bright ml-1">
                          Speaking...
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Video Top Overlay Header: Partner Info & Status */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-space-xs z-30 pointer-events-auto">
                    <div className="flex items-center gap-2 px-space-sm py-1 bg-surface-container-lowest/95 backdrop-blur-sm border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b]">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse border border-on-surface" />
                      <span className="font-headline-md text-[14px] leading-tight font-bold text-on-surface">
                        Pixel Panda 🐼
                      </span>
                      <span className="hidden sm:inline-block font-label-sm text-label-sm px-1.5 py-0.2 bg-surface-variant rounded border border-on-surface/40 text-on-surface-variant">
                        Verified Student
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="px-space-xs py-1 bg-on-surface/90 text-surface-bright font-label-sm text-label-sm rounded border border-surface-variant/20 flex items-center gap-1">
                        <span className="material-symbols-outlined text-primary-container text-[14px]">
                          lock
                        </span>
                        P2P
                      </div>
                      <button
                        id="btn-fullscreen"
                        title="Toggle Fullscreen"
                        onClick={toggleFullscreen}
                        className="p-1.5 bg-surface-container-lowest border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b] hover:bg-surface-variant text-on-surface transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                      >
                        <span className="material-symbols-outlined text-[16px] block">
                          {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Video Bottom-Left Overlay: Latency & Encryption Status */}
                  <div className="absolute bottom-3 left-3 z-30 pointer-events-none">
                    <div className="inline-flex items-center gap-2 px-space-xs py-0.5 bg-surface-container-lowest/90 backdrop-blur-sm border border-on-surface rounded shadow-[1px_1px_0px_#1c1b1b]">
                      <span className="material-symbols-outlined text-[13px] text-emerald-600">
                        wifi
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface font-semibold tracking-tight">
                        32ms • WebRTC Peer
                      </span>
                    </div>
                  </div>

                  {/* Picture-in-Picture: Self Preview (Bottom-Right) */}
                  <div
                    id="self-preview-box"
                    className="absolute bottom-3 right-3 z-30 w-32 sm:w-44 aspect-[4/3] bg-surface-container-lowest rounded-lg border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] overflow-hidden flex flex-col justify-between group/pip transition-transform hover:scale-[1.02]"
                  >
                    {/* Camera image simulated */}
                    <div className="absolute inset-0 bg-[#2b2b30] flex items-center justify-center">
                      <img
                        className={`w-full h-full object-cover transition-transform ${isMirrored ? '-scale-x-100' : ''}`}
                        data-alt="A stylized self video camera preview of a smiling young university student wearing glasses and warm yellow hoodie, holding a warm beverage, clean bedroom study desk background with posters, soft golden hour indoor light"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAL__CXl0m59Y9dcmXOcUvmzHsbsNdHlIEEBdXukXTPXh79IiL1dwH6FaPJrxtVrc3jrDcwt3uIJ98Gy_VuF6c3rm7eFCQ2NV7_oUHj4Sd49_9gYAOJKACsE3aUjmcYp1z1TmjcQVN4mnAb8i9wjOAdhOwHqS7mZArRpgksXcxqbjyimu1xih6SUqWtojashsLFGdnFS2WjBUI-t7eSSgRoQRbdERDlAGV-gOEWmIsAHwyuLIevUogX"
                        alt="Self preview"
                      />
                      <div
                        id="self-cam-disabled-overlay"
                        className={`absolute inset-0 bg-[#232326] ${isCamOff ? 'flex' : 'hidden'} flex-col items-center justify-center text-on-primary`}
                      >
                        <span className="material-symbols-outlined text-[24px]">
                          videocam_off
                        </span>
                        <span className="font-label-sm text-label-sm mt-1">
                          Camera Off
                        </span>
                      </div>
                    </div>

                    {/* Header label overlay inside PiP */}
                    <div className="relative z-10 flex items-center justify-between p-1 bg-gradient-to-b from-on-surface/80 to-transparent">
                      <span className="font-label-sm text-label-sm font-bold text-surface-bright drop-shadow-sm truncate">
                        You (Toast Wizard 🧙)
                      </span>
                      <button
                        id="btn-pip-flip"
                        title="Flip camera mirror"
                        onClick={() => setIsMirrored((prev) => !prev)}
                        className="p-0.5 rounded bg-surface-container-lowest/80 text-on-surface hover:bg-surface-container-lowest transition-colors border border-on-surface/50"
                      >
                        <span className="material-symbols-outlined text-[12px] block">
                          flip_camera_ios
                        </span>
                      </button>
                    </div>

                    {/* Footer indicator in PiP */}
                    <div className="relative z-10 p-1 flex justify-end">
                      <span
                        id="self-mic-badge"
                        className={`p-0.5 rounded-full ${isMuted ? 'bg-error' : 'bg-emerald-500'} text-on-primary border border-on-surface flex items-center justify-center`}
                      >
                        <span className="material-symbols-outlined text-[10px] block">
                          {isMuted ? 'mic_off' : 'mic'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Video Control Bar: Chunky Neo-Brutalist Keypads */}
                <div className="w-full bg-surface-container-low p-space-sm sm:p-space-md rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] flex flex-wrap items-center justify-between gap-space-sm">
                  {/* Left: Media Toggles (Mic & Cam) */}
                  <div className="flex items-center gap-space-xs">
                    <button
                      id="btn-toggle-mic"
                      onClick={toggleMic}
                      className="px-space-sm py-2 rounded-lg bg-surface-container-lowest border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex items-center gap-2 font-label-md text-label-md text-on-surface hover:bg-surface-variant active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#1c1b1b] transition-all"
                    >
                      <span
                        id="mic-icon"
                        className={`material-symbols-outlined text-[18px] ${isMuted ? 'text-error' : 'text-on-surface'}`}
                      >
                        {isMuted ? 'mic_off' : 'mic'}
                      </span>
                      <span id="mic-label" className="hidden sm:inline">
                        {isMuted ? 'Unmute' : 'Mute'}
                      </span>
                    </button>

                    <button
                      id="btn-toggle-cam"
                      onClick={toggleCam}
                      className="px-space-sm py-2 rounded-lg bg-surface-container-lowest border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex items-center gap-2 font-label-md text-label-md text-on-surface hover:bg-surface-variant active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#1c1b1b] transition-all"
                    >
                      <span
                        id="cam-icon"
                        className={`material-symbols-outlined text-[18px] ${isCamOff ? 'text-error' : 'text-on-surface'}`}
                      >
                        {isCamOff ? 'videocam_off' : 'videocam'}
                      </span>
                      <span id="cam-label" className="hidden sm:inline">
                        {isCamOff ? 'Cam On' : 'Camera'}
                      </span>
                    </button>
                  </div>

                  {/* Center: High-Impact Skip / Next Partner Button */}
                  <div className="flex items-center gap-space-xs sm:gap-space-sm order-last sm:order-none w-full sm:w-auto justify-center">
                    <button
                      id="btn-next-match"
                      onClick={handleNextMatch}
                      className="flex-1 sm:flex-initial px-space-md sm:px-space-lg py-2.5 rounded-lg bg-primary-container text-on-primary-container border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] font-label-lg text-label-lg font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0px_#1c1b1b] transition-all"
                    >
                      <span>Next Match</span>
                      <span className="px-1.5 py-0.5 bg-surface-container-lowest text-on-surface rounded border border-on-surface text-[10px] font-label-sm font-bold shadow-[1px_1px_0px_#1c1b1b]">
                        ESC
                      </span>
                    </button>

                    <button
                      id="btn-end-call"
                      title="Disconnect & Exit"
                      onClick={handleEndCall}
                      className="px-space-sm py-2.5 rounded-lg bg-surface-container-lowest text-error border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] font-label-md text-label-md font-bold flex items-center gap-1.5 hover:bg-error-container active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#1c1b1b] transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        call_end
                      </span>
                      <span className="hidden md:inline">End</span>
                    </button>
                  </div>

                  {/* Right: Safety / Report Button */}
                  <div className="flex items-center">
                    <button
                      id="btn-report-partner"
                      onClick={() => setReportModalOpen(true)}
                      className="px-space-sm py-2 rounded-lg bg-surface-container-lowest border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] text-on-surface-variant hover:text-error hover:bg-error-container/40 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#1c1b1b] font-label-md text-label-md font-bold flex items-center gap-1.5 transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px] text-error">
                        flag
                      </span>
                      <span className="text-xs">Report</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Live Minimal Side Chat Drawer (Col 4) ──────────────────── */}
              <div className="lg:col-span-4 flex flex-col h-full">
                <div className="bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] flex flex-col h-[520px] lg:h-[590px]">
                  {/* Side Chat Header */}
                  <div className="p-space-sm border-b-2 border-on-surface bg-surface-container flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">
                        chat_bubble
                      </span>
                      <h2 className="font-headline-md text-[16px] leading-tight font-bold text-on-surface">
                        Live Chat
                      </h2>
                    </div>
                    <span className="font-label-sm text-label-sm px-2 py-0.5 bg-surface-container-lowest rounded border border-on-surface text-on-surface-variant">
                      End-to-End
                    </span>
                  </div>

                  {/* Message History Stream */}
                  <div
                    ref={chatMessagesRef}
                    id="chat-messages"
                    className="flex-1 p-space-sm overflow-y-auto space-y-space-sm bg-[#faf7f4]"
                  >
                    {/* Connection System Notice */}
                    <div className="flex justify-center my-1">
                      <div className="px-space-sm py-1 bg-[#ebe3d5] border border-on-surface rounded font-label-sm text-label-sm text-on-surface text-center shadow-[1px_1px_0px_#1c1b1b]">
                        ✨ Connected with{' '}
                        <span className="font-bold text-primary">
                          Pixel Panda 🐼
                        </span>
                        . Say Salam!
                      </div>
                    </div>

                    {/* Messages Loop */}
                    {messages.map((msg) => {
                      if (msg.sender === 'notice') {
                        return (
                          <div
                            key={msg.id}
                            className="flex justify-center my-2"
                          >
                            <div className="px-space-sm py-1 bg-surface-container border border-on-surface rounded font-label-sm text-label-sm text-primary font-bold shadow-[1px_1px_0px_#1c1b1b]">
                              {msg.text}
                            </div>
                          </div>
                        )
                      }

                      if (msg.sender === 'partner') {
                        return (
                          <div
                            key={msg.id}
                            className="flex flex-col items-start gap-1 max-w-[85%]"
                          >
                            <div className="flex items-center gap-1">
                              <span className="font-label-sm text-label-sm font-bold text-primary-container">
                                {msg.name}
                              </span>
                              <span className="font-label-sm text-[10px] text-tertiary">
                                {msg.time}
                              </span>
                            </div>
                            <div className="p-space-sm bg-surface-container-lowest text-on-surface rounded-lg border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] font-body-sm text-body-sm">
                              {msg.text}
                            </div>
                          </div>
                        )
                      }

                      // User message
                      return (
                        <div
                          key={msg.id}
                          className="flex flex-col items-end gap-1 ml-auto max-w-[85%]"
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-label-sm text-[10px] text-tertiary">
                              {msg.time}
                            </span>
                            <span className="font-label-sm text-label-sm font-bold text-on-surface">
                              {msg.name}
                            </span>
                          </div>
                          <div className="p-space-sm bg-secondary-container text-on-secondary-container rounded-lg border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] font-body-sm text-body-sm font-medium">
                            {msg.text}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Chat Input Bar */}
                  <div className="p-space-sm border-t-2 border-on-surface bg-surface-container-low">
                    <form
                      id="chat-form"
                      onSubmit={handleChatSubmit}
                      className="flex items-center gap-2"
                    >
                      <div className="relative flex-1">
                        <input
                          ref={chatInputRef}
                          id="chat-input"
                          type="text"
                          autoComplete="off"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Type a message & press Enter..."
                          className="w-full px-space-sm py-2 bg-surface-container-lowest border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b] font-body-sm text-body-sm text-on-surface placeholder:text-tertiary placeholder:font-label-sm focus:outline-none focus:border-primary-container transition-colors"
                        />
                      </div>
                      <button
                        type="submit"
                        title="Send message"
                        className="px-space-sm py-2 bg-primary-container text-on-primary-container border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b] hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center shrink-0"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          send
                        </span>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Safety & Shortcuts Banner ───────────────────────────────── */}
            <div className="mt-space-xs flex flex-wrap items-center justify-between gap-space-sm px-space-md py-space-xs bg-surface-container-high rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary">
                  security
                </span>
                <span className="font-label-sm text-label-sm text-on-surface">
                  <strong>Adda Safety Guarantee:</strong> No video recordings
                  are stored. Be kind, follow community etiquette, and tap Next
                  or Report if anyone violates guidelines.
                </span>
              </div>
              <div className="hidden md:flex items-center gap-space-sm font-label-sm text-label-sm text-on-surface-variant">
                <span>
                  <kbd className="px-1 py-0.5 bg-surface-container-lowest rounded border border-on-surface font-bold text-on-surface shadow-[1px_1px_0px_#1c1b1b]">
                    ESC
                  </kbd>{' '}
                  Skip Partner
                </span>
                <span>
                  <kbd className="px-1 py-0.5 bg-surface-container-lowest rounded border border-on-surface font-bold text-on-surface shadow-[1px_1px_0px_#1c1b1b]">
                    M
                  </kbd>{' '}
                  Mute
                </span>
                <span>
                  <kbd className="px-1 py-0.5 bg-surface-container-lowest rounded border border-on-surface font-bold text-on-surface shadow-[1px_1px_0px_#1c1b1b]">
                    V
                  </kbd>{' '}
                  Camera
                </span>
              </div>
            </div>

            {/* ── Interactive Report Modal ────────────────────────────────── */}
            <div
              id="report-modal"
              className={`fixed inset-0 z-50 bg-on-surface/50 backdrop-blur-xs ${reportModalOpen ? 'flex' : 'hidden'} items-center justify-center p-space-md`}
            >
              <div className="w-full max-w-md bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[6px_6px_0px_#1c1b1b] p-space-md flex flex-col gap-space-sm animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b-2 border-on-surface pb-space-xs">
                  <div className="flex items-center gap-1.5 text-error">
                    <span className="material-symbols-outlined text-[22px]">
                      warning
                    </span>
                    <h3 className="font-headline-md text-[18px] font-bold text-on-surface">
                      Report &amp; Disconnect
                    </h3>
                  </div>
                  <button
                    id="close-modal-btn"
                    onClick={() => setReportModalOpen(false)}
                    className="p-1 rounded hover:bg-surface-variant text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      close
                    </span>
                  </button>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Help maintain a friendly campus adda. Immediate action is
                  taken against harassment or inappropriate video.
                </p>
                <div className="flex flex-col gap-1.5 font-label-sm text-label-sm text-on-surface">
                  <label className="flex items-center gap-2 p-2 rounded border border-on-surface hover:bg-surface-container cursor-pointer">
                    <input
                      type="radio"
                      name="report_reason"
                      value="nudity"
                      checked={reportReason === 'nudity'}
                      onChange={() => setReportReason('nudity')}
                      className="accent-primary-container"
                    />
                    Inappropriate video content / nudity
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded border border-on-surface hover:bg-surface-container cursor-pointer">
                    <input
                      type="radio"
                      name="report_reason"
                      value="harassment"
                      checked={reportReason === 'harassment'}
                      onChange={() => setReportReason('harassment')}
                      className="accent-primary-container"
                    />
                    Verbal abuse or hate speech
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded border border-on-surface hover:bg-surface-container cursor-pointer">
                    <input
                      type="radio"
                      name="report_reason"
                      value="spam"
                      checked={reportReason === 'spam'}
                      onChange={() => setReportReason('spam')}
                      className="accent-primary-container"
                    />
                    Spam, promotional bot, or impersonation
                  </label>
                </div>
                <div className="flex items-center justify-end gap-space-xs pt-space-xs">
                  <button
                    id="cancel-report-btn"
                    onClick={() => setReportModalOpen(false)}
                    className="px-space-sm py-1.5 rounded-lg border border-on-surface font-label-sm text-label-sm text-on-surface hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    id="submit-report-btn"
                    onClick={handleSubmitReport}
                    className="px-space-md py-1.5 rounded-lg bg-error text-on-error border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] font-label-md text-label-md font-bold active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                  >
                    Report &amp; Next Partner
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b]">
        <div className="max-w-7xl mx-auto px-margin lg:px-margin-desktop py-space-lg flex flex-col md:flex-row items-center justify-between gap-space-md text-center md:text-left">
          <div className="flex flex-col gap-space-xs">
            <p className="font-label-md text-label-md text-on-surface font-bold">
              KothaKoi (কথা কই) • Built for student addas &amp; friendly chats
            </p>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              Zero profile footprints. Ephemeral p2p connections across
              campuses.
            </p>
          </div>
          <div className="flex items-center gap-space-md lg:gap-gutter-desktop flex-wrap justify-center">
            <a
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors underline decoration-1 underline-offset-2"
              data-path="safety"
              href="#safety"
            >
              Safety
            </a>
            <a
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors underline decoration-1 underline-offset-2"
              data-path="community-standards"
              href="#community-standards"
            >
              Community Standards
            </a>
            <a
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-error transition-colors underline decoration-1 underline-offset-2"
              data-path="report"
              href="#report"
            >
              Report
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
