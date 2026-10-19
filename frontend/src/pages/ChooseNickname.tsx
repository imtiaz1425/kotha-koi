/**
 * ChooseNickname.tsx – KothaKoi Anonymous Nickname Selection Screen
 * Shown after successful login, before entering the chat room.
 * Allows generating or shuffling temporary aliases while strictly
 * preserving real-name privacy.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface NicknameOption {
  name: string
  emoji: string
  tagline: string
  bg: string
}

const NICKNAMES: NicknameOption[] = [
  { name: 'Midnight Mango', emoji: '🥭', tagline: 'Debugging until 3 AM with mango juice', bg: '#ffe087' },
  { name: 'Pixel Panda', emoji: '🐼', tagline: 'Retro vibes & chilling between lectures', bg: '#e2e2e2' },
  { name: 'Cha-er Cup', emoji: '☕', tagline: 'Surviving on UIU tong cha and slides', bg: '#ffb68e' },
  { name: 'Library Ghost', emoji: '👻', tagline: 'Quietly studying in the 4th floor corner', bg: '#dcd9d9' },
  { name: 'Madani Rider', emoji: '🛵', tagline: 'Cruising through 100 feet road in style', bg: '#fecf26' },
  { name: 'Finals Survivor', emoji: '📚', tagline: 'One night before the exam, everything is possible', bg: '#ffdad6' },
  { name: 'Tong Master', emoji: '🫖', tagline: 'Always found outside UIU gate with hot tea', bg: '#ffb68e' },
  { name: 'Cramming Ninja', emoji: '🥷', tagline: 'Skimming 40 slides 10 minutes before quiz', bg: '#e5e2e1' },
  { name: 'Campus Cat', emoji: '🐱', tagline: 'Nap lover lounging near the UIU cafeteria', bg: '#ffe087' },
  { name: 'Zero Bug', emoji: '🐛', tagline: 'Hoping the CSE compiler shows no errors today', bg: '#c6c6c7' },
]

export default function ChooseNickname() {
  const navigate = useNavigate()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [customName, setCustomName] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [isShuffling, setIsShuffling] = useState(false)

  const activeOption = NICKNAMES[selectedIndex]
  const activeNickname = isCustom ? customName.trim() || 'Anonymous UIUian' : activeOption.name
  const activeEmoji = isCustom ? '🎭' : activeOption.emoji

  function handleShuffle() {
    setIsCustom(false)
    setIsShuffling(true)
    setTimeout(() => {
      setSelectedIndex(prev => (prev + 1) % NICKNAMES.length)
      setIsShuffling(false)
    }, 150)
  }

  function handleSelectPreset(index: number) {
    setIsCustom(false)
    setSelectedIndex(index)
  }

  function handleStartAdda() {
    // Navigate into the live chat room
    navigate('/chat')
  }

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between overflow-x-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#FFF5E6] border-b-2 border-on-surface shadow-[0_2px_0px_#1c1b1b] shrink-0">
        <div className="h-14 sm:h-16 max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1 select-none">
            <span className="font-headline-md text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              KothaKoi
            </span>
            <span className="font-headline-md text-xl sm:text-2xl font-bold text-primary">.</span>
            <span className="hidden sm:inline-block font-label-sm text-[11px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container border border-on-surface ml-1">
              কথা কই
            </span>
          </Link>

          {/* User Flow Badge */}
          <div className="hidden md:flex items-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]">
              <span className="font-label-sm text-xs text-on-surface-variant">Step 2 of 2:</span>
              <span className="font-label-sm text-xs text-on-surface font-bold tracking-wide">
                Pick Your Temporary Adda Alias 🎭
              </span>
            </div>
          </div>

          {/* Quick Profile Nav */}
          <div className="flex items-center gap-3">
            <Link
              to="/profile"
              className="flex items-center gap-1.5 font-label-sm text-xs font-bold text-on-surface hover:text-primary transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-secondary-container border border-on-surface flex items-center justify-center text-[11px]">
                TA
              </div>
              <span className="hidden sm:inline">My Profile</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col justify-center items-center w-full px-4 py-8 relative">
        {/* Ambient background decoration */}
        <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-72 h-72 rounded-full bg-primary-container/15 blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-lg mx-auto">
          {/* Card Frame */}
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-6 sm:p-8">
            
            {/* Header info */}
            <div className="text-center mb-5">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-container text-on-surface border border-on-surface font-label-sm text-[11px] font-bold mb-2 shadow-[1px_1px_0px_#1c1b1b]">
                <span>Prototype Mode: Demo Student (Tanvir Ahmed • 2310125)</span>
                <span className="material-symbols-outlined text-[13px] text-emerald-800">verified</span>
              </div>
              <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface">
                Choose Chat Nickname
              </h1>
              <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-1">
                Select or shuffle a temporary persona before entering the adda room.
              </p>
            </div>

            {/* Privacy Shield Notice */}
            <div className="mb-5 p-3 bg-[#FFF5E6] rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary-container text-on-surface border border-on-surface flex items-center justify-center shrink-0 mt-0.5 shadow-[1px_1px_0px_#1c1b1b]">
                <span className="material-symbols-outlined text-[16px]">visibility_off</span>
              </div>
              <p className="font-body-sm text-xs text-on-surface leading-snug">
                <strong className="text-primary font-bold">Real identity never shown:</strong> Your real name (<em>Tanvir Ahmed</em>), Student ID (<em>2310125</em>), and email are kept private. UIU peers in the chat will ONLY see your temporary nickname below.
              </p>
            </div>

            {/* Active Nickname Showcase Box */}
            <div
              className={`p-5 rounded-2xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] transition-all duration-150 mb-5 text-center ${
                isShuffling ? 'scale-95 opacity-80' : 'scale-100 opacity-100'
              }`}
              style={{ backgroundColor: isCustom ? '#FFF5E6' : activeOption.bg }}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-surface-container-lowest border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex items-center justify-center text-3xl sm:text-4xl mb-3">
                {activeEmoji}
              </div>

              <span className="font-label-sm text-[10px] uppercase font-bold tracking-wider text-on-surface/70 block mb-0.5">
                Your Adda Alias for Today
              </span>

              <h2 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
                {activeNickname}
              </h2>

              <p className="font-body-sm text-xs text-on-surface-variant italic mt-1 max-w-xs mx-auto">
                "{isCustom ? 'Custom student alias' : activeOption.tagline}"
              </p>
            </div>

            {/* Shuffle Button & Custom Input */}
            <div className="space-y-4 mb-6">
              <div className="flex gap-2">
                <button
                  id="btn-shuffle-nickname"
                  type="button"
                  onClick={handleShuffle}
                  className="flex-1 py-2.5 px-4 bg-secondary-container hover:bg-[#ffe087] text-on-surface font-headline-md text-xs sm:text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-2"
                >
                  <span className="text-base">🎲</span>
                  <span>Shuffle Nickname</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCustom(!isCustom)}
                  className={`px-3 py-2.5 rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] font-label-sm text-xs font-bold transition-all ${
                    isCustom ? 'bg-primary-container text-on-surface' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                  }`}
                  title="Type your own custom nickname"
                >
                  <span className="material-symbols-outlined text-[18px] block">edit</span>
                </button>
              </div>

              {/* Custom Input Drawer */}
              {isCustom && (
                <div className="p-3 bg-surface rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-1.5 animate-in fade-in duration-150">
                  <label htmlFor="customInput" className="font-label-sm text-xs font-bold text-on-surface block">
                    Type a Custom Anonymous Nickname:
                  </label>
                  <input
                    id="customInput"
                    type="text"
                    maxLength={24}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Madani Chai Lover"
                    className="w-full px-3 py-1.5 bg-surface-container-lowest font-body-md text-xs text-on-surface rounded-lg border-2 border-on-surface focus:outline-none"
                  />
                  <span className="font-label-sm text-[10px] text-outline block">
                    Tip: Keep it friendly and anonymous!
                  </span>
                </div>
              )}

              {/* Quick Preset Chips */}
              <div>
                <span className="font-label-sm text-[11px] font-bold text-on-surface-variant block mb-1.5">
                  Popular UIU Nicknames:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {NICKNAMES.slice(0, 6).map((item, idx) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => handleSelectPreset(idx)}
                      className={`px-2 py-1 rounded-lg border border-on-surface font-label-sm text-[11px] flex items-center gap-1 transition-all ${
                        !isCustom && selectedIndex === idx
                          ? 'bg-primary-container text-on-surface font-bold shadow-[2px_2px_0px_#1c1b1b]'
                          : 'bg-surface-container hover:bg-secondary-container/50 text-on-surface'
                      }`}
                    >
                      <span>{item.emoji}</span>
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Start Adda CTA Button ────────────────────────────── */}
            <button
              id="start-adda-btn"
              type="button"
              onClick={handleStartAdda}
              className="w-full py-3.5 bg-primary-container text-on-surface font-headline-md text-base sm:text-lg font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] hover:bg-[#ff8638] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex items-center justify-center gap-2"
            >
              <span className="text-xl">☕</span>
              <span>Start Adda as {activeNickname}</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>

            {/* Secondary Link to Profile */}
            <div className="mt-4 pt-3 border-t border-on-surface/20 flex items-center justify-between text-xs">
              <Link
                to="/profile"
                className="font-label-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">settings</span>
                <span>Account Settings</span>
              </Link>
              <Link
                to="/login"
                className="font-label-sm text-on-surface-variant hover:text-error transition-colors"
              >
                Switch Student Account
              </Link>
            </div>

          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-3">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs gap-2">
          <p className="font-label-sm text-on-surface">
            KothaKoi (কথা কই) • Ephemeral UIU Video &amp; Text Adda
          </p>
          <div className="flex items-center gap-3 font-label-sm text-on-surface-variant">
            <span>🎭 100% Anonymous Persona</span>
            <span>•</span>
            <span>Madani Avenue Vibes</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
