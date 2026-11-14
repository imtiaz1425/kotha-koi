/**
 * Profile.tsx – KothaKoi UIU Student Profile Screen
 * Confidential account dashboard for the authenticated account owner.
 * Displays private Profile Name and actual account information while
 * keeping temporary chat identity clearly distinguished.
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context'
import { apiClient, ApiClientError } from '../api/client'
import { OnlineBadge } from '../components/OnlineBadge'
import { SHUFFLE_NICKNAMES } from '../components/ProfileDropdown'

interface ProfileData {
  name: string
  nickname: string
  avatarPreset: string
  preferences: {
    autoShuffleNickname?: boolean
    defaultCamOff?: boolean
    defaultMuted?: boolean
    allowRepeatMatches?: boolean
    emailNotifications?: boolean
  }
}

export default function Profile() {
  const { user, logout } = useAuth()

  // Private profile name (immutable)
  const [privateName, setPrivateName] = useState(user?.name || '')

  // Display name (chat persona) state
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false)
  const [displayNameSuccess, setDisplayNameSuccess] = useState('')
  const [displayNameError, setDisplayNameError] = useState('')
  const [isShuffling, setIsShuffling] = useState(false)

  // Preference toggles
  const [autoShuffleNickname, setAutoShuffleNickname] = useState(false)
  const [defaultMuted, setDefaultMuted] = useState(false)
  const [defaultCamOff, setDefaultCamOff] = useState(false)
  const [allowRepeatMatches, setAllowRepeatMatches] = useState(true)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [preferencesNotice, setPreferencesNotice] = useState('')
  const [preferencesError, setPreferencesError] = useState('')

  // Password change modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Account deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  // Derived user details
  const email = user?.email || ''
  const studentId = email ? email.split('@')[0] : 'N/A'
  const domainPart = email ? email.split('@')[1] || '' : ''
  const departmentName = domainPart.startsWith('bscse.')
    ? 'Computer Science & Engineering (B.Sc. CSE)'
    : domainPart.startsWith('bba.')
      ? 'School of Business & Economics (BBA)'
      : domainPart.startsWith('bseee.')
        ? 'Electrical & Electronic Engineering (B.Sc. EEE)'
        : 'United International University Student'

  // Fetch real profile from backend
  useEffect(() => {
    apiClient
      .get<{
        ok: boolean
        name?: string
        nickname?: string
        avatarPreset?: string
        preferences?: ProfileData['preferences']
        profile?: ProfileData
      }>('/profile')
      .then((res) => {
        const fetchedName = res.name || res.profile?.name || user?.name || ''
        const fetchedNickname = res.nickname || res.profile?.nickname || ''
        const fetchedPrefs = res.preferences || res.profile?.preferences || {}

        if (fetchedName) {
          setPrivateName(fetchedName)
        }
        if (fetchedNickname) {
          setDisplayNameInput(fetchedNickname)
        }

        if (typeof fetchedPrefs.autoShuffleNickname === 'boolean') {
          setAutoShuffleNickname(fetchedPrefs.autoShuffleNickname)
        }
        if (typeof fetchedPrefs.defaultMuted === 'boolean') {
          setDefaultMuted(fetchedPrefs.defaultMuted)
        }
        if (typeof fetchedPrefs.defaultCamOff === 'boolean') {
          setDefaultCamOff(fetchedPrefs.defaultCamOff)
        }
        if (typeof fetchedPrefs.allowRepeatMatches === 'boolean') {
          setAllowRepeatMatches(fetchedPrefs.allowRepeatMatches)
        }
      })
      .catch(() => {})
  }, [user?.name])

  function handleShuffleNickname() {
    setIsShuffling(true)
    setDisplayNameError('')
    setDisplayNameSuccess('')

    const currentVal = displayNameInput.trim()
    const pool = SHUFFLE_NICKNAMES.filter((n) => n.toLowerCase() !== currentVal.toLowerCase())
    const randomIndex = Math.floor(Math.random() * pool.length)
    const picked = pool[randomIndex] || 'SleepyDeveloper'

    setTimeout(() => {
      setDisplayNameInput(picked)
      setIsShuffling(false)
    }, 150)
  }

  async function handleSaveDisplayName(e: React.FormEvent) {
    e.preventDefault()
    setDisplayNameError('')
    setDisplayNameSuccess('')
    const trimmed = displayNameInput.trim()

    if (!trimmed) {
      setDisplayNameError('Display name is required.')
      return
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      setDisplayNameError('Display name must be between 2 and 20 characters.')
      return
    }
    if (/[<>{}\\]/.test(trimmed)) {
      setDisplayNameError('Display name contains invalid characters.')
      return
    }

    setIsSavingDisplayName(true)
    try {
      const res = await apiClient.put<{ ok: boolean; nickname: string }>('/profile', {
        nickname: trimmed,
      })
      if (res?.ok) {
        setDisplayNameSuccess('Display name saved! Chat partners will now see this name.')
        setTimeout(() => setDisplayNameSuccess(''), 4000)
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDisplayNameError(err.message)
      } else {
        setDisplayNameError('Failed to save display name. Please try again.')
      }
    } finally {
      setIsSavingDisplayName(false)
    }
  }

  async function handleSavePreferences() {
    setIsSavingPreferences(true)
    setPreferencesNotice('')
    setPreferencesError('')
    try {
      await apiClient.put('/profile', {
        preferences: {
          autoShuffleNickname,
          defaultMuted,
          defaultCamOff,
          allowRepeatMatches,
        },
      })
      setPreferencesNotice('Preferences saved successfully! ✓')
      setTimeout(() => setPreferencesNotice(''), 3000)
    } catch (err) {
      if (err instanceof ApiClientError) {
        setPreferencesError(err.message)
      } else {
        setPreferencesError('Failed to save preferences. Please try again.')
      }
    } finally {
      setIsSavingPreferences(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (!currentPassword) {
      setPasswordError('Please enter your current password.')
      return
    }
    if (!newPassword || newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setIsChangingPassword(true)
    try {
      const res = await apiClient.post<{ ok: boolean }>(
        '/auth/change-password',
        {
          currentPassword,
          newPassword,
        }
      )
      if (res?.ok) {
        setPasswordSuccess('Password changed successfully!')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => {
          setShowPasswordModal(false)
          setPasswordSuccess('')
        }, 1500)
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setPasswordError(err.message)
      } else {
        setPasswordError(
          'Failed to change password. Please check your current password.'
        )
      }
    } finally {
      setIsChangingPassword(false)
    }
  }

  async function handleLogout() {
    await logout()
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault()
    setDeleteError('')
    if (deleteConfirmationInput.trim() !== 'DELETE') {
      setDeleteError('Please type DELETE in capital letters to confirm.')
      return
    }

    setIsDeletingAccount(true)
    try {
      await apiClient.delete('/profile', { confirmation: 'DELETE' })
      setShowDeleteModal(false)
      await logout()
      window.location.href = '/'
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setDeleteError(err.message)
      } else {
        setDeleteError('Failed to delete account. Please try again.')
      }
    } finally {
      setIsDeletingAccount(false)
    }
  }

  const userInitials =
    privateName || user?.name
      ? (privateName || user?.name || '').slice(0, 2).toUpperCase()
      : studentId.slice(0, 2).toUpperCase()

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
            <span className="font-headline-md text-xl sm:text-2xl font-bold text-primary">
              .
            </span>
            <span className="hidden sm:inline-block font-label-sm text-[11px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container border border-on-surface ml-1">
              কথা কই
            </span>
          </Link>

          {/* Badge & Online Counter */}
          <div className="flex items-center gap-2">
            <OnlineBadge />
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-label-sm text-xs text-on-surface font-bold tracking-wide">
                🎓 Verified UIU Student Account
              </span>
            </div>
          </div>

          {/* Quick Nav */}
          <div className="flex items-center gap-3">
            <Link
              to="/choose-nickname"
              className="px-3 py-1 bg-primary-container text-on-surface font-label-sm text-xs font-bold rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-[#ff8638] transition-all flex items-center gap-1"
            >
              <span>Start Adda</span>
              <span className="material-symbols-outlined text-[14px]">
                arrow_forward
              </span>
            </Link>
            <button
              onClick={handleLogout}
              className="px-2.5 py-1 bg-surface-container text-error hover:bg-error-container font-label-sm text-xs font-bold rounded-lg border-2 border-on-surface shadow-[1px_1px_0px_#1c1b1b] transition-all flex items-center gap-1"
              title="Log out"
            >
              <span className="material-symbols-outlined text-[14px]">
                logout
              </span>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Profile Content ────────────────────────────────── */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Top Banner: Anonymity Separation Guarantee */}
        <div className="p-3.5 bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary-container border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[22px]">
                security
              </span>
            </div>
            <div>
              <h2 className="font-headline-md text-base sm:text-lg font-bold text-on-surface">
                Strict Privacy Guarantee Active
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Your private Profile Name and account details below are visible{' '}
                <strong>ONLY</strong> to you on this page. They are never sent
                to chat partners or included in Socket.IO matching payloads.
              </p>
            </div>
          </div>
          <Link
            to="/choose-nickname"
            className="px-3.5 py-1.5 bg-secondary-container text-on-surface font-label-sm text-xs font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:translate-x-0.5 hover:translate-y-0.5 active:shadow-none transition-all text-center shrink-0"
          >
            Manage Chat Nickname 🎭
          </Link>
        </div>

        {/* ── Section 1: Private Student Profile Card ─────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-5 sm:p-7 relative overflow-hidden">
          {/* Card Stamp */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 select-none pointer-events-none opacity-90">
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border-2 border-emerald-600 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transform rotate-1 inline-block shadow-[1px_1px_0px_#1c1b1b]">
              UIU Verified Student ✓
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-5">
            {/* Avatar */}
            <div className="relative">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-secondary-container border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex items-center justify-center text-on-surface text-2xl sm:text-3xl font-bold">
                {userInitials}
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary-container border border-on-surface flex items-center justify-center shadow-[1px_1px_0px_#1c1b1b]">
                <span className="material-symbols-outlined text-[14px]">
                  lock
                </span>
              </div>
            </div>

            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface">
                  {privateName || user?.name || 'Not Set'}
                </h1>
                <span className="font-label-sm text-[10px] px-2 py-0.5 bg-surface-container border border-on-surface/40 rounded text-on-surface-variant font-bold">
                  🔒 Private Profile Name (Confidential)
                </span>
              </div>

              <div className="mt-3 p-3 bg-surface rounded-xl border border-on-surface/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-outline">
                    mail
                  </span>
                  <div>
                    <span className="font-label-sm text-[10px] uppercase text-outline block">
                      Registered Email (Institutional Webmail)
                    </span>
                    <span className="font-mono text-xs sm:text-sm font-bold text-on-surface">
                      {email}
                    </span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-on-surface/30 shrink-0">
                  <span className="material-symbols-outlined text-[12px]">lock</span>
                  Read-Only
                </span>
              </div>

              <p className="font-label-sm text-xs sm:text-sm text-primary font-bold mt-2">
                Student ID:{' '}
                <span className="font-mono text-on-surface">{studentId}</span> •{' '}
                {departmentName}
              </p>
            </div>
          </div>

          {/* Institutional metadata grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-on-surface/20">
            <div className="p-2.5 bg-surface-container rounded-xl border border-on-surface/40">
              <span className="font-label-sm text-[10px] uppercase text-outline block">
                Campus Location
              </span>
              <span className="font-headline-md text-xs sm:text-sm font-bold text-on-surface">
                Madani Avenue, Dhaka
              </span>
            </div>
            <div className="p-2.5 bg-surface-container rounded-xl border border-on-surface/40">
              <span className="font-label-sm text-[10px] uppercase text-outline block">
                Student ID Number
              </span>
              <span className="font-headline-md text-xs sm:text-sm font-bold text-on-surface font-mono">
                {studentId}
              </span>
            </div>
            <div className="p-2.5 bg-surface-container rounded-xl border border-on-surface/40">
              <span className="font-label-sm text-[10px] uppercase text-outline block">
                Account Status
              </span>
              <span className="font-headline-md text-xs sm:text-sm font-bold text-emerald-700">
                Active &amp; Verified ✓
              </span>
            </div>
          </div>
        </div>

        {/* ── Section 2: Dedicated Current Chat Nickname Section ──── */}
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-5 sm:p-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-on-surface/20 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-md text-lg sm:text-xl font-bold text-on-surface">
                  Current Chat Nickname (Temporary Persona)
                </h2>
                <span className="material-symbols-outlined text-primary text-[20px]">
                  theater_comedy
                </span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant">
                The public alias displayed to peers during matchmaking and active chat.
                Completely separated from your private Profile Name and registered email.
              </p>
            </div>
            <span className="font-label-sm text-xs px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-600 font-bold self-start sm:self-auto shrink-0">
              Peer-Visible Only
            </span>
          </div>

          {displayNameSuccess && (
            <div className="p-2.5 bg-emerald-100 text-emerald-800 font-label-sm text-xs font-bold rounded-xl border border-emerald-600 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              <span>{displayNameSuccess}</span>
            </div>
          )}

          {displayNameError && (
            <div className="p-2.5 bg-error-container text-on-error-container font-label-sm text-xs font-bold rounded-xl border border-on-surface">
              {displayNameError}
            </div>
          )}

          <form onSubmit={handleSaveDisplayName} className="space-y-4">
            <div className="p-4 rounded-xl bg-surface border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-headline-md text-xs sm:text-sm font-bold text-on-surface flex items-center gap-2">
                  <span className="text-xl">🎭</span>
                  <span>Active Chat Alias</span>
                </label>
                <span className="font-mono text-xs text-on-surface-variant">
                  {displayNameInput.length}/20 chars
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  maxLength={20}
                  placeholder="e.g. SleepyDeveloper"
                  className="w-full px-3.5 py-2.5 bg-surface-container-lowest text-on-surface font-headline-md text-base sm:text-lg font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <p className="font-body-sm text-[11px] text-on-surface-variant">
                Visible to peers in active rooms. Does NOT expose your private
                name ({privateName || user?.name || 'Account Name'}) or your email ({email}).
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={handleShuffleNickname}
                disabled={isShuffling}
                className="px-4 py-2 bg-secondary-container hover:bg-[#ffe087] text-on-surface font-headline-md text-xs sm:text-sm font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
                title="Generate a random playful campus/developer nickname"
              >
                <span className={`material-symbols-outlined text-[18px] ${isShuffling ? 'animate-spin' : ''}`}>
                  casino
                </span>
                <span>Shuffle Name</span>
              </button>

              <div className="flex items-center gap-2">
                <Link
                  to="/choose-nickname"
                  className="px-3 py-2 bg-surface-container text-on-surface font-label-sm text-xs font-bold rounded-xl border border-on-surface hover:bg-surface-container-high transition-colors"
                >
                  Preset Avatars
                </Link>
                <button
                  type="submit"
                  disabled={isSavingDisplayName || !displayNameInput.trim()}
                  className="px-5 py-2 bg-primary-container text-on-surface font-headline-md text-xs sm:text-sm font-bold uppercase rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-60 cursor-pointer"
                >
                  {isSavingDisplayName ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* ── Section 3: Account & Session Preferences ─────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-5 sm:p-7 space-y-5">
          <div className="flex items-center justify-between border-b border-on-surface/20 pb-3">
            <div>
              <h2 className="font-headline-md text-lg sm:text-xl font-bold text-on-surface">
                Account &amp; Adda Settings
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Configure your UIU preferences and session defaults (persisted
                to database)
              </p>
            </div>
            {preferencesNotice && (
              <span className="font-label-sm text-xs text-emerald-700 font-bold bg-emerald-100 px-2 py-1 rounded border border-emerald-600">
                {preferencesNotice}
              </span>
            )}
            {preferencesError && (
              <span className="font-label-sm text-xs text-error font-bold bg-error-container px-2 py-1 rounded border border-on-surface">
                {preferencesError}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {/* Setting 1 */}
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-surface hover:bg-surface-container-low border border-on-surface/40 transition-colors">
              <div>
                <span className="font-headline-md text-sm font-bold text-on-surface block">
                  Auto-shuffle temporary nickname
                </span>
                <span className="font-body-sm text-xs text-on-surface-variant">
                  Prompt to pick a fresh alias before each new adda session
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoShuffleNickname}
                onChange={(e) => setAutoShuffleNickname(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-on-surface text-primary-container focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Setting 2 */}
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-surface hover:bg-surface-container-low border border-on-surface/40 transition-colors">
              <div>
                <span className="font-headline-md text-sm font-bold text-on-surface block">
                  Start with camera off
                </span>
                <span className="font-body-sm text-xs text-on-surface-variant">
                  Begin each adda session with camera preview disabled
                </span>
              </div>
              <input
                type="checkbox"
                checked={defaultCamOff}
                onChange={(e) => setDefaultCamOff(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-on-surface text-primary-container focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Setting 3 */}
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-surface hover:bg-surface-container-low border border-on-surface/40 transition-colors">
              <div>
                <span className="font-headline-md text-sm font-bold text-on-surface block">
                  Start with microphone muted
                </span>
                <span className="font-body-sm text-xs text-on-surface-variant">
                  Keep mic muted when joining to prevent background noise
                </span>
              </div>
              <input
                type="checkbox"
                checked={defaultMuted}
                onChange={(e) => setDefaultMuted(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-on-surface text-primary-container focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Setting 4 */}
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-surface hover:bg-surface-container-low border border-on-surface/40 transition-colors">
              <div>
                <span className="font-headline-md text-sm font-bold text-on-surface block">
                  Allow repeat matches
                </span>
                <span className="font-body-sm text-xs text-on-surface-variant">
                  Allow rematching with students you previously spoke with
                </span>
              </div>
              <input
                type="checkbox"
                checked={allowRepeatMatches}
                onChange={(e) => setAllowRepeatMatches(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-on-surface text-primary-container focus:ring-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-on-surface/20">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSavePreferences}
                disabled={isSavingPreferences}
                className="px-4 py-2 bg-primary-container text-on-surface font-headline-md text-xs sm:text-sm font-bold uppercase rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-60"
              >
                {isSavingPreferences ? 'Saving...' : 'Save Preferences'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasswordError('')
                  setPasswordSuccess('')
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  setShowPasswordModal(true)
                }}
                className="px-3 py-2 bg-surface-container text-on-surface font-label-sm text-xs font-bold rounded-xl border-2 border-on-surface shadow-[1px_1px_0px_#1c1b1b] hover:bg-secondary-container transition-all"
              >
                Change Password
              </button>
            </div>

            <button
              id="logout-btn"
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 bg-surface-container-lowest text-error hover:bg-error-container font-headline-md text-xs sm:text-sm font-bold uppercase rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">
                logout
              </span>
              <span>Log Out</span>
            </button>
          </div>
        </div>

        {/* ── Section 4: Privacy Controls & Danger Zone ────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-error/60 shadow-[5px_5px_0px_#ba1a1a] p-5 sm:p-7 space-y-4">
          <div className="flex items-center gap-2 border-b border-error/20 pb-3">
            <span className="material-symbols-outlined text-error text-[22px]">
              warning
            </span>
            <div>
              <h2 className="font-headline-md text-lg sm:text-xl font-bold text-error">
                Danger Zone &amp; Account Deletion
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Permanent actions affecting your student account and personal data.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-error/5 border border-error/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-headline-md text-sm font-bold text-on-surface">
                Delete KothaKoi Account
              </h3>
              <p className="font-body-sm text-xs text-on-surface-variant max-w-xl">
                Permanently delete your profile, chat nickname, account preferences, and password credentials. Your session will be revoked immediately and data anonymized according to the privacy policy.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteError('')
                setDeleteConfirmationInput('')
                setShowDeleteModal(true)
              }}
              className="px-4 py-2 bg-error text-white font-headline-md text-xs sm:text-sm font-bold uppercase rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-error/90 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all shrink-0 self-start sm:self-auto"
            >
              Delete Account
            </button>
          </div>
        </div>
      </main>

      {/* ── Delete Account Confirmation Modal ────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-6 relative">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="absolute top-4 right-4 text-on-surface hover:text-error"
            >
              <span className="material-symbols-outlined text-[20px]">
                close
              </span>
            </button>

            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-error text-[24px]">
                delete_forever
              </span>
              <h3 className="font-headline-md text-lg font-bold text-error">
                Delete Account Permanently?
              </h3>
            </div>

            <p className="text-xs text-on-surface leading-relaxed mb-3">
              This action is <strong>irreversible</strong>. Your private profile, student ID connection, preferences, and password credentials will be deleted immediately.
            </p>

            <div className="p-3 bg-surface-container rounded-xl border border-on-surface/20 text-[11px] text-on-surface-variant mb-4">
              To confirm, type <span className="font-mono font-bold text-on-surface">DELETE</span> below:
            </div>

            {deleteError && (
              <div className="mb-3 p-2 bg-error-container text-on-error-container font-label-sm text-xs font-bold rounded-lg border border-on-surface">
                {deleteError}
              </div>
            )}

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <input
                type="text"
                required
                value={deleteConfirmationInput}
                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full px-3 py-2 bg-surface text-on-surface font-mono text-sm rounded-lg border-2 border-on-surface focus:outline-none"
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-on-surface/20">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeletingAccount}
                  className="px-3.5 py-1.5 bg-surface-container text-xs font-bold rounded-lg border border-on-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingAccount || deleteConfirmationInput.trim() !== 'DELETE'}
                  className="px-4 py-1.5 bg-error text-white text-xs font-bold rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] disabled:opacity-40"
                >
                  {isDeletingAccount ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Real Password Change Dialog ─────────────────────────── */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-sm w-full rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-6 relative">
            <button
              onClick={() => setShowPasswordModal(false)}
              className="absolute top-4 right-4 text-on-surface hover:text-error"
            >
              <span className="material-symbols-outlined text-[20px]">
                close
              </span>
            </button>

            <h3 className="font-headline-md text-lg font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">
                password
              </span>
              Change Account Password
            </h3>

            {passwordError && (
              <div className="mb-3 p-2 bg-error-container text-on-error-container font-label-sm text-xs font-bold rounded-lg border border-on-surface">
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="mb-3 p-2 bg-emerald-100 text-emerald-800 font-label-sm text-xs font-bold rounded-lg border border-emerald-600">
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block font-label-sm text-xs font-bold text-on-surface mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3 py-1.5 bg-surface text-on-surface font-body-sm text-xs rounded-lg border-2 border-on-surface"
                />
              </div>
              <div>
                <label className="block font-label-sm text-xs font-bold text-on-surface mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full px-3 py-1.5 bg-surface text-on-surface font-body-sm text-xs rounded-lg border-2 border-on-surface"
                />
              </div>
              <div>
                <label className="block font-label-sm text-xs font-bold text-on-surface mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full px-3 py-1.5 bg-surface text-on-surface font-body-sm text-xs rounded-lg border-2 border-on-surface"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-3 py-1.5 bg-surface-container text-xs font-bold rounded-lg border border-on-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="px-3 py-1.5 bg-primary-container text-xs font-bold rounded-lg border-2 border-on-surface shadow-[1px_1px_0px_#1c1b1b] disabled:opacity-60"
                >
                  {isChangingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-3 mt-6">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs gap-2">
          <p className="font-label-sm text-on-surface">
            KothaKoi (কথা কই) • Account settings &amp; private student dashboard
          </p>
          <div className="flex items-center gap-3 font-label-sm text-on-surface-variant">
            <span>🔒 Confidential Profile</span>
            <span>•</span>
            <span>UIU Verified Community</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
