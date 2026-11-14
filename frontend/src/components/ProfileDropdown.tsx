/**
 * ProfileDropdown.tsx – Reusable KothaKoi Profile Dropdown & Compact Editor
 * Anchored to the top-right profile button on Landing, Matchmaking, and Active Chat.
 * Preserves the exact original landing-page dropdown design and structure,
 * while allowing "My Profile" to open a compact top-right anchored editor
 * without taking over the screen or blocking video/chat tiles.
 */
import React, { useState, useEffect, useRef, useContext } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, ApiClientError } from '../api/client'
import { AuthContext } from '../context/auth-context'

export interface ProfileDropdownProps {
  buttonId?: string
  buttonClassName?: string
  onNicknameUpdated?: (newNickname: string) => void
  className?: string
}

// Creative campus & developer nicknames (strictly 2–20 characters)
export const SHUFFLE_NICKNAMES = [
  'SleepyDeveloper',
  'ChaiAddict',
  'CtrlAltChill',
  'MidnightCoder',
  'LostInCampus',
  'WiFiWarrior',
  'LazyLegend',
  'DebuggingHuman',
  'CoffeePowered',
  'MadaniRider',
  'PixelPanda',
  'TongMaster',
  'FinalsSurvivor',
  'LibraryGhost',
  'CampusCat',
  'ZeroBug',
  'SyntaxSorcerer',
  'CodeJunkie',
  'BinaryBard',
  'ByteRider',
  'BitFlipper',
  'BugHunter',
  'AlgoMaster',
  'CrammingNinja',
  'TerminalTornado',
  'GitPusher',
  'MidnightMango',
]

interface ProfileData {
  email?: string
  name: string
  nickname: string
  avatarPreset: string
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  buttonId = 'profile-menu-btn',
  buttonClassName,
  onNicknameUpdated,
  className,
}) => {
  const authContext = useContext(AuthContext)
  const user = authContext?.user
  const isAuthenticated = authContext?.isAuthenticated ?? false
  const logout = authContext?.logout || (async () => {})
  const checkAuth = authContext?.checkAuth || (async () => {})

  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'profile'>('menu')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Profile data states
  const [email, setEmail] = useState(user?.email || '')
  const [realName, setRealName] = useState(user?.name || '')
  const [displayName, setDisplayName] = useState('')
  const [displayNameInput, setDisplayNameInput] = useState('')

  // Action states
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isShuffling, setIsShuffling] = useState(false)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setView('menu')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Fetch fresh profile whenever dropdown opens
  useEffect(() => {
    if (!isOpen) return

    apiClient
      .get<{
        ok: boolean
        email?: string
        name?: string
        nickname?: string
        profile?: ProfileData
      }>('/profile')
      .then((res) => {
        const fetchedEmail = res.email || res.profile?.email || user?.email || ''
        const fetchedName = res.name || res.profile?.name || user?.name || ''
        const fetchedNickname = res.nickname || res.profile?.nickname || ''

        setEmail(fetchedEmail)
        setRealName(fetchedName)
        setDisplayName(fetchedNickname)
        setDisplayNameInput(fetchedNickname)
      })
      .catch(() => {
        if (user?.email) setEmail(user.email)
        if (user?.name) {
          setRealName(user.name)
        }
      })
  }, [isOpen, user?.email, user?.name])

  // Handle Shuffle Name
  function handleShuffleNickname() {
    setIsShuffling(true)
    setSaveError('')
    setSaveSuccess('')

    const currentVal = displayNameInput.trim()
    const pool = SHUFFLE_NICKNAMES.filter((n) => n.toLowerCase() !== currentVal.toLowerCase())
    const randomIndex = Math.floor(Math.random() * pool.length)
    const picked = pool[randomIndex] || 'SleepyDeveloper'

    setTimeout(() => {
      setDisplayNameInput(picked)
      setIsShuffling(false)
    }, 120)
  }

  // Handle Save Profile Changes
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    setSaveSuccess('')

    const trimmedNick = displayNameInput.trim()

    if (!trimmedNick) {
      setSaveError('Display name is required.')
      return
    }
    if (trimmedNick.length < 2 || trimmedNick.length > 20) {
      setSaveError('Display name must be between 2 and 20 characters.')
      return
    }
    if (/[<>{}\\]/.test(trimmedNick)) {
      setSaveError('Display name contains invalid characters.')
      return
    }

    setIsSaving(true)
    try {
      const res = await apiClient.put<{ ok: boolean; nickname?: string }>('/profile', {
        nickname: trimmedNick,
      })
      if (res?.ok) {
        const savedNick = res.nickname || trimmedNick
        setDisplayName(savedNick)
        setSaveSuccess('Saved! ✓')
        setTimeout(() => setSaveSuccess(''), 3000)

        // Immediately update parent state without page refresh
        onNicknameUpdated?.(savedNick)
        await checkAuth()
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSaveError(err.message)
      } else {
        setSaveError('Failed to save profile. Please try again.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handleLogout() {
    setIsOpen(false)
    await logout()
    window.location.href = '/'
  }

  const defaultBtnClass =
    'w-8 h-8 rounded-full bg-primary flex items-center justify-center border border-on-surface shadow-[1px_1px_0px_#1c1b1b] shrink-0 hover:translate-x-0.5 hover:translate-y-0.5 transition-all cursor-pointer'

  return (
    <div className={`relative ${className || ''}`} ref={dropdownRef}>
      {/* ── Profile Icon Trigger Button ── */}
      <button
        id={buttonId}
        type="button"
        aria-label="User Profile Menu"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((prev) => !prev)
          if (!isOpen) {
            setView('menu')
            setSaveSuccess('')
            setSaveError('')
          }
        }}
        className={buttonClassName || defaultBtnClass}
        title="Profile & Account Menu"
      >
        <span className="material-symbols-outlined text-on-primary text-[18px]">
          person
        </span>
      </button>

      {/* ── Dropdown / Popover Container (Anchored to top-right button) ── */}
      {isOpen && (
        <>
          {view === 'menu' ? (
            /* ── VIEW 1: Original Landing-Page Dropdown Design ── */
            <div
              id="profile-dropdown-menu"
              className="absolute right-0 top-full mt-2 w-56 sm:w-60 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] py-1.5 z-50 animate-in fade-in duration-100 select-none"
            >
              {/* Account Header Info */}
              <div className="px-3 py-2 border-b border-on-surface/20 bg-[#FFF5E6]/60">
                <span className="font-headline-md text-xs font-bold text-on-surface block">
                  {isAuthenticated ? 'UIU Student Pass' : 'Guest Account'}
                </span>
                <span className="font-label-sm text-[10px] text-on-surface-variant block truncate">
                  {isAuthenticated && user
                    ? user.email
                    : 'Not logged in • UIU Only'}
                </span>
              </div>

              <div className="py-1">
                {isAuthenticated ? (
                  <>
                    {/* My Profile */}
                    <button
                      type="button"
                      onClick={() => setView('profile')}
                      className="w-full px-3 py-2 text-left font-label-sm text-xs text-on-surface hover:bg-[#FFF5E6] flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px] text-primary">
                        account_circle
                      </span>
                      <span className="font-bold">My Profile</span>
                    </button>

                    {/* Account / Verification Status */}
                    <button
                      type="button"
                      onClick={() => setView('profile')}
                      className="w-full px-3 py-2 text-left font-label-sm text-xs text-on-surface hover:bg-[#FFF5E6] flex items-center justify-between gap-2 transition-colors border-t border-on-surface/10 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-emerald-700">
                          verified
                        </span>
                        <span>Account / Status</span>
                      </div>
                      <span className="font-label-sm text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-600 font-bold">
                        {user?.status === 'active'
                          ? 'Verified'
                          : user?.status || 'Active'}
                      </span>
                    </button>

                    {/* Log Out */}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full px-3 py-2 text-left font-label-sm text-xs text-error hover:bg-error-container/40 flex items-center gap-2 transition-colors border-t border-on-surface/10 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        logout
                      </span>
                      <span className="font-bold">Log Out</span>
                    </button>
                  </>
                ) : (
                  <>
                    {/* Log In Link */}
                    <Link
                      to="/login"
                      onClick={() => setIsOpen(false)}
                      className="w-full px-3 py-2 text-left font-label-sm text-xs text-on-surface hover:bg-[#FFF5E6] flex items-center gap-2 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px] text-primary">
                        login
                      </span>
                      <span className="font-bold">
                        Sign In with UIU Email
                      </span>
                    </Link>
                    {/* Register Link */}
                    <Link
                      to="/register"
                      onClick={() => setIsOpen(false)}
                      className="w-full px-3 py-2 text-left font-label-sm text-xs text-on-surface hover:bg-[#FFF5E6] flex items-center gap-2 transition-colors border-t border-on-surface/10"
                    >
                      <span className="material-symbols-outlined text-[16px] text-primary">
                        how_to_reg
                      </span>
                      <span className="font-bold">Create Account</span>
                    </Link>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* ── VIEW 2: Compact Top-Right Profile & Nickname Editor ── */
            <div
              id="profile-editor-popover"
              className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] p-3.5 z-50 animate-in fade-in duration-100 text-on-surface"
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-on-surface/20">
                <button
                  type="button"
                  onClick={() => {
                    setView('menu')
                    setSaveSuccess('')
                    setSaveError('')
                  }}
                  className="flex items-center gap-1 font-label-sm text-xs font-bold text-on-surface hover:text-primary transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    arrow_back
                  </span>
                  <span>Menu</span>
                </button>
                <span className="font-headline-md text-xs font-bold text-on-surface">
                  My Profile
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false)
                    setView('menu')
                  }}
                  className="w-5 h-5 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
                  title="Close"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    close
                  </span>
                </button>
              </div>

              {/* Feedback banners */}
              {saveSuccess && (
                <div className="mb-2 p-1.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-lg border border-emerald-600 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">
                    check_circle
                  </span>
                  <span>{saveSuccess}</span>
                </div>
              )}
              {saveError && (
                <div className="mb-2 p-1.5 bg-error-container text-on-error-container text-[11px] font-bold rounded-lg border border-on-surface">
                  {saveError}
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-2.5">
                {/* 1. Registered Email (Read-Only) */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="font-label-sm text-[11px] font-bold text-on-surface flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-outline">
                        mail
                      </span>
                      Email (Read-Only)
                    </label>
                    <span className="text-[9px] font-bold text-on-surface-variant flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[11px]">
                        lock
                      </span>
                      Confidential
                    </span>
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={email || user?.email || 'UIU Student Email'}
                    aria-label="Registered Email"
                    className="w-full px-2 py-1 bg-surface-container text-on-surface-variant font-mono text-[11px] rounded-lg border border-on-surface/30 cursor-not-allowed select-all"
                  />
                </div>

                {/* 2. Real Name (Read-Only & Confidential) */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="font-label-sm text-[11px] font-bold text-on-surface flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-outline">
                        badge
                      </span>
                      Real Name
                    </label>
                    <span className="text-[9px] font-bold text-on-surface-variant flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[11px]">
                        lock
                      </span>
                      Read-Only
                    </span>
                  </div>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={realName || 'Not Set'}
                    aria-label="Real Name"
                    className="w-full px-2 py-1 bg-surface-container text-on-surface-variant font-headline-md text-xs font-bold rounded-lg border border-on-surface/30 cursor-not-allowed select-all"
                  />
                  <span className="text-[10px] text-on-surface-variant block mt-0.5">
                    Immutable • Never exposed to chat partners.
                  </span>
                </div>

                {/* 3. Display Name (Visible to Chat Partners) */}
                <div className="pt-1.5 border-t border-on-surface/15">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="font-headline-md text-[11px] font-bold text-on-surface flex items-center gap-1">
                      <span>🎭</span>
                      Display Name (Chat Persona)
                    </label>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-600">
                      Peer-Visible
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      maxLength={20}
                      placeholder="e.g. SleepyDeveloper"
                      aria-label="Display Name"
                      className="w-full px-2.5 py-1.5 bg-surface-container-lowest text-on-surface font-headline-md text-xs sm:text-sm font-bold rounded-lg border-2 border-on-surface shadow-[1px_1px_0px_#1c1b1b] focus:outline-none focus:ring-1 focus:ring-primary pr-12"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-on-surface-variant select-none">
                      {displayNameInput.length}/20
                    </span>
                  </div>

                  {displayName && (
                    <span className="text-[10px] text-on-surface-variant block mt-1">
                      Current: <strong className="text-on-surface font-bold">{displayName}</strong>
                    </span>
                  )}

                  <div className="flex items-center justify-between gap-1.5 mt-2">
                    {/* Shuffle Name Button */}
                    <button
                      type="button"
                      onClick={handleShuffleNickname}
                      disabled={isShuffling}
                      className="px-2.5 py-1 bg-secondary-container hover:bg-[#ffe087] text-on-surface font-headline-md text-[11px] font-bold rounded-lg border border-on-surface shadow-[1px_1px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      title="Shuffle a random funny nickname"
                    >
                      <span
                        className={`material-symbols-outlined text-[14px] ${
                          isShuffling ? 'animate-spin' : ''
                        }`}
                      >
                        casino
                      </span>
                      <span>Shuffle Name</span>
                    </button>

                    {/* Save Changes Button */}
                    <button
                      type="submit"
                      disabled={isSaving || !displayNameInput.trim()}
                      className="px-3 py-1 bg-primary-container text-on-surface font-headline-md text-[11px] font-bold uppercase rounded-lg border border-on-surface shadow-[1px_1px_0px_#1c1b1b] hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-60 cursor-pointer"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  )
}
export default ProfileDropdown
