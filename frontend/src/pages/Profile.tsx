/**
 * Profile.tsx – KothaKoi UIU Student Profile Screen
 * Prototype UI mockup displaying private real name, student ID, UIU email,
 * verification status, sample placeholder statistics, and account settings.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context'

export default function Profile() {
  const { logout } = useAuth()

  // Sample Demo Student Profile Data (clearly labeled demo data, not a real person)
  const [realName] = useState('Tanvir Ahmed (Demo Student)')
  const [studentId] = useState('2310125')
  const [email] = useState('2310125@bscse.uiu.ac.bd')
  const [department] = useState('Computer Science & Engineering (B.Sc. CSE)')
  const [verificationStatus] = useState('UIU Student Verified (Prototype Mode)')

  // Account settings toggles (mock)
  const [autoShuffleNickname, setAutoShuffleNickname] = useState(true)
  const [defaultMuted, setDefaultMuted] = useState(false)
  const [defaultCamOff, setDefaultCamOff] = useState(false)
  const [allowRepeatMatches, setAllowRepeatMatches] = useState(false)
  const [emailNotifications, setEmailNotifications] = useState(true)

  // Password change modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [savedSettingsNotice, setSavedSettingsNotice] = useState('')

  function handleSaveSettings() {
    setSavedSettingsNotice('Preferences saved in prototype state! ✓')
    setTimeout(() => setSavedSettingsNotice(''), 3000)
  }

  async function handleLogout() {
    await logout()
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
            <span className="font-headline-md text-xl sm:text-2xl font-bold text-primary">
              .
            </span>
            <span className="hidden sm:inline-block font-label-sm text-[11px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container border border-on-surface ml-1">
              কথা কই
            </span>
          </Link>

          {/* Badge */}
          <div className="hidden sm:flex items-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-label-sm text-xs text-on-surface font-bold tracking-wide">
                🎓 UIU Student Account (Prototype)
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
        {/* Prototype Sample Data Notice */}
        <div className="p-3 bg-[#FFF5E6] rounded-2xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex items-start gap-2.5">
          <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">
            info
          </span>
          <div>
            <span className="font-headline-md text-xs sm:text-sm font-bold text-on-surface block">
              Prototype Demonstration: Sample Student Profile
            </span>
            <p className="font-body-sm text-xs text-on-surface-variant leading-snug">
              All personal details, student ID, and statistics shown below are
              fictional sample data for UI evaluation. No real person's private
              information is collected or displayed.
            </p>
          </div>
        </div>

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
                Strict Real-Name Privacy Active
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Your real name, student ID, and email below are strictly private
                account records and <strong>NEVER</strong> appear in the chat
                UI.
              </p>
            </div>
          </div>
          <Link
            to="/choose-nickname"
            className="px-3.5 py-1.5 bg-secondary-container text-on-surface font-label-sm text-xs font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:translate-x-0.5 hover:translate-y-0.5 active:shadow-none transition-all text-center shrink-0"
          >
            Manage Nickname 🎲
          </Link>
        </div>

        {/* ── Section 1: Private Student ID Card ──────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-5 sm:p-7 relative overflow-hidden">
          {/* Card Stamp */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 select-none pointer-events-none opacity-90">
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border-2 border-emerald-600 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transform rotate-2 inline-block shadow-[1px_1px_0px_#1c1b1b]">
              {verificationStatus}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-5">
            {/* Avatar */}
            <div className="relative">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary-fixed border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex items-center justify-center text-primary text-3xl font-bold">
                TA
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-secondary-container border border-on-surface flex items-center justify-center shadow-[1px_1px_0px_#1c1b1b]">
                <span className="material-symbols-outlined text-[14px]">
                  lock
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface">
                  {realName}
                </h1>
                <span className="font-label-sm text-[10px] px-2 py-0.5 bg-surface-container border border-on-surface/40 rounded text-on-surface-variant font-bold">
                  🔒 Private Real Name
                </span>
              </div>
              <p className="font-label-sm text-xs sm:text-sm text-primary font-bold mt-0.5">
                Student ID:{' '}
                <span className="font-mono text-on-surface">{studentId}</span> •{' '}
                {department}
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
                Verification Status
              </span>
              <span className="font-headline-md text-xs sm:text-sm font-bold text-emerald-700">
                Mock UI Verified ✓
              </span>
            </div>
          </div>
        </div>

        {/* ── Section 2: Identified Placeholder Statistics ────────── */}
        <div className="space-y-3">
          {/* Section Header with Clear Placeholder Disclaimer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              <h2 className="font-headline-md text-lg font-bold text-on-surface">
                Campus Adda Statistics
              </h2>
              <span className="material-symbols-outlined text-primary text-[18px]">
                query_stats
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-[#FFF5E6] border border-on-surface/60 rounded-md font-label-sm text-[11px] text-primary font-bold">
              <span className="material-symbols-outlined text-[14px]">
                info
              </span>
              <span>Sample Demo Data — Real tracking not implemented yet</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Stat 1: Total Chatting Hours */}
            <div className="bg-surface-container-lowest p-4 rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-sm text-xs font-bold text-on-surface-variant">
                  Total Adda Time
                </span>
                <div className="w-7 h-7 rounded-lg bg-primary-fixed border border-on-surface flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[16px]">
                    schedule
                  </span>
                </div>
              </div>
              <div>
                <span className="font-headline-md text-2xl font-bold text-on-surface block">
                  14.5 hrs
                </span>
                <span className="font-label-sm text-[10px] text-outline">
                  Sample demo metric
                </span>
              </div>
            </div>

            {/* Stat 2: Number of People Met */}
            <div className="bg-surface-container-lowest p-4 rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-sm text-xs font-bold text-on-surface-variant">
                  Peers Met
                </span>
                <div className="w-7 h-7 rounded-lg bg-secondary-container border border-on-surface flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface text-[16px]">
                    groups
                  </span>
                </div>
              </div>
              <div>
                <span className="font-headline-md text-2xl font-bold text-on-surface block">
                  42 students
                </span>
                <span className="font-label-sm text-[10px] text-outline">
                  Sample demo metric
                </span>
              </div>
            </div>

            {/* Stat 3: Cha Cups Shared */}
            <div className="bg-surface-container-lowest p-4 rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-sm text-xs font-bold text-on-surface-variant">
                  Tong Cha Score
                </span>
                <div className="w-7 h-7 rounded-lg bg-primary-fixed border border-on-surface flex items-center justify-center">
                  <span className="text-[14px]">☕</span>
                </div>
              </div>
              <div>
                <span className="font-headline-md text-2xl font-bold text-on-surface block">
                  38 cups
                </span>
                <span className="font-label-sm text-[10px] text-outline">
                  Sample demo rating
                </span>
              </div>
            </div>

            {/* Stat 4: Karma & Safety */}
            <div className="bg-surface-container-lowest p-4 rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-sm text-xs font-bold text-on-surface-variant">
                  Account Health
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-100 border border-on-surface flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-700 text-[16px]">
                    verified
                  </span>
                </div>
              </div>
              <div>
                <span className="font-headline-md text-2xl font-bold text-emerald-700 block">
                  100% Good
                </span>
                <span className="font-label-sm text-[10px] text-outline">
                  Zero reports (mock)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 3: Account Settings ─────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-5 sm:p-7 space-y-5">
          <div className="flex items-center justify-between border-b border-on-surface/20 pb-3">
            <div>
              <h2 className="font-headline-md text-lg sm:text-xl font-bold text-on-surface">
                Account &amp; Adda Settings
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Configure your UIU preferences and session defaults
              </p>
            </div>
            {savedSettingsNotice && (
              <span className="font-label-sm text-xs text-emerald-700 font-bold bg-emerald-100 px-2 py-1 rounded border border-emerald-600">
                {savedSettingsNotice}
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
                  Generate a fresh fun persona before each new adda session
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
                  Begin each video session with your webcam disabled until you
                  turn it on
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
                  Keep mic muted when joining to prevent accidental background
                  noise
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
                  Avoid same-day rematches
                </span>
                <span className="font-body-sm text-xs text-on-surface-variant">
                  Prioritize meeting new UIU students rather than someone you
                  met today
                </span>
              </div>
              <input
                type="checkbox"
                checked={allowRepeatMatches}
                onChange={(e) => setAllowRepeatMatches(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-on-surface text-primary-container focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Setting 5 */}
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-surface hover:bg-surface-container-low border border-on-surface/40 transition-colors">
              <div>
                <span className="font-headline-md text-sm font-bold text-on-surface block">
                  Campus Adda Announcements
                </span>
                <span className="font-body-sm text-xs text-on-surface-variant">
                  Receive alerts during UIU finals season community addas
                </span>
              </div>
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-on-surface text-primary-container focus:ring-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-on-surface/20">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-primary-container text-on-surface font-headline-md text-xs sm:text-sm font-bold uppercase rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              >
                Save Preferences
              </button>
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
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

      {/* ── Mock Password Change Dialog ─────────────────────────── */}
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

            <div className="space-y-3">
              <div>
                <label className="block font-label-sm text-xs font-bold text-on-surface mb-1">
                  Current Password
                </label>
                <input
                  type="password"
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
                  placeholder="Enter new password"
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
                  type="button"
                  onClick={() => {
                    alert('Password update simulated for preview!')
                    setShowPasswordModal(false)
                  }}
                  className="px-3 py-1.5 bg-primary-container text-xs font-bold rounded-lg border-2 border-on-surface shadow-[1px_1px_0px_#1c1b1b]"
                >
                  Update
                </button>
              </div>
            </div>
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
            <span>Prototype User Flow</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
