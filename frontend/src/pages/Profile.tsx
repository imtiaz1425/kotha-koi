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
  const { user, logout, checkAuth } = useAuth()

  // Profile data from backend
  const [profileData, setProfileData] = useState<ProfileData>({
    name: user?.name || '',
    nickname: '',
    avatarPreset: 'mango',
    preferences: {},
  })

  // Private profile name editing state
  const [privateName, setPrivateName] = useState(user?.name || '')
  const [isEditingName, setIsEditingName] = useState(false)
  const [isSavingName, setIsSavingName] = useState(false)
  const [nameError, setNameError] = useState('')

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
      .get<{ ok: boolean; profile: ProfileData }>('/profile')
      .then((res) => {
        if (res?.profile) {
          setProfileData(res.profile)
          if (res.profile.name) {
            setPrivateName(res.profile.name)
          } else if (user?.name) {
            setPrivateName(user.name)
          }
          if (res.profile.preferences) {
            const prefs = res.profile.preferences
            if (typeof prefs.autoShuffleNickname === 'boolean') {
              setAutoShuffleNickname(prefs.autoShuffleNickname)
            }
            if (typeof prefs.defaultMuted === 'boolean') {
              setDefaultMuted(prefs.defaultMuted)
            }
            if (typeof prefs.defaultCamOff === 'boolean') {
              setDefaultCamOff(prefs.defaultCamOff)
            }
            if (typeof prefs.allowRepeatMatches === 'boolean') {
              setAllowRepeatMatches(prefs.allowRepeatMatches)
            }
          }
        }
      })
      .catch(() => {})
  }, [user?.name])

  async function handleSavePrivateName(e: React.FormEvent) {
    e.preventDefault()
    setNameError('')
    const trimmed = privateName.trim()
    if (!trimmed) {
      setNameError('Private Profile Name cannot be empty.')
      return
    }
    if (trimmed.length > 60) {
      setNameError('Name must be 60 characters or fewer.')
      return
    }

    setIsSavingName(true)
    try {
      const res = await apiClient.put<{ ok: boolean; name: string }>(
        '/profile',
        {
          name: trimmed,
        }
      )
      if (res?.ok) {
        setProfileData((prev) => ({ ...prev, name: res.name || trimmed }))
        setIsEditingName(false)
        await checkAuth()
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setNameError(err.message)
      } else {
        setNameError('Failed to update Profile Name. Please try again.')
      }
    } finally {
      setIsSavingName(false)
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
                {isEditingName ? (
                  <form
                    onSubmit={handleSavePrivateName}
                    className="flex items-center gap-2 mt-1"
                  >
                    <input
                      type="text"
                      value={privateName}
                      onChange={(e) => setPrivateName(e.target.value)}
                      maxLength={60}
                      autoFocus
                      placeholder="Enter private profile name"
                      className="px-2.5 py-1 bg-surface text-on-surface font-headline-md text-lg font-bold rounded-lg border-2 border-on-surface focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isSavingName}
                      className="px-2.5 py-1 bg-primary-container text-xs font-bold rounded-lg border border-on-surface shadow-[1px_1px_0px_#1c1b1b]"
                    >
                      {isSavingName ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingName(false)
                        setPrivateName(profileData.name || user?.name || '')
                        setNameError('')
                      }}
                      className="px-2 py-1 bg-surface-container text-xs font-bold rounded-lg border border-on-surface"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface">
                      {privateName || user?.name || 'UIU Student'}
                    </h1>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(true)}
                      className="p-1 text-on-surface-variant hover:text-primary transition-colors"
                      title="Edit Private Profile Name"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        edit
                      </span>
                    </button>
                  </>
                )}
                <span className="font-label-sm text-[10px] px-2 py-0.5 bg-surface-container border border-on-surface/40 rounded text-on-surface-variant font-bold">
                  🔒 Private Profile Name (Confidential)
                </span>
              </div>

              {nameError && (
                <p className="font-body-sm text-xs text-error mt-1">
                  {nameError}
                </p>
              )}

              <p className="font-label-sm text-xs sm:text-sm text-primary font-bold mt-1">
                Student ID:{' '}
                <span className="font-mono text-on-surface">{studentId}</span> •{' '}
                {departmentName}
              </p>
              <p className="font-body-sm text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-outline">
                  mail
                </span>
                <span className="font-mono">{email}</span>
                <span className="text-[10px] text-emerald-700 font-bold ml-1">
                  (UIU Institutional Webmail)
                </span>
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
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-5 sm:p-7 space-y-3">
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
                The public nickname displayed to chat partners during real-time
                matching. Completely separated from your private Profile Name.
              </p>
            </div>
            <Link
              to="/choose-nickname"
              className="px-3 py-1.5 bg-primary-container text-on-surface font-label-sm text-xs font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-[#ff8638] transition-all text-center shrink-0 flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[15px]">
                edit
              </span>
              <span>Change Chat Nickname</span>
            </Link>
          </div>

          <div className="p-4 rounded-xl bg-surface border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-secondary-container border border-on-surface flex items-center justify-center text-2xl shadow-[1px_1px_0px_#1c1b1b]">
                🎭
              </div>
              <div>
                <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">
                  Active Chat Alias
                </span>
                <span className="font-headline-md text-xl font-bold text-on-surface">
                  {profileData.nickname || 'Anonymous UIUian (Default)'}
                </span>
                <p className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">
                  Visible to peer in active room. Does NOT expose your private
                  name ({privateName || user?.name || 'Account Name'}).
                </p>
              </div>
            </div>
            <span className="font-label-sm text-xs px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-600 font-bold hidden sm:inline-block">
              Peer-Visible Only
            </span>
          </div>
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
      </main>

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
