/**
 * Login.tsx – KothaKoi UIU Student Login Screen
 * Visual UI login screen exclusively for United International University (UIU) students.
 */
import { useState, FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { apiClient, ApiClientError } from '../api/client'
import { useAuth } from '../context'
import type { AuthUser } from '../types/auth'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { loginUser } = useAuth()

  const [identifier, setIdentifier] = useState(() => {
    const state = location.state as { email?: string } | null
    return state?.email || ''
  })
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [infoNotice, setInfoNotice] = useState('')

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault()
    if (isLoggingIn) return
    setErrorMessage('')
    setInfoNotice('')

    const cleanIdentifier = identifier.trim()
    if (!cleanIdentifier) {
      setErrorMessage('Please enter your UIU Student ID or institutional email.')
      return
    }

    if (!password) {
      setErrorMessage('Please enter your password.')
      return
    }

    setIsLoggingIn(true)
    try {
      const res = await apiClient.post<{ ok: boolean; user: AuthUser }>(
        '/auth/login',
        {
          identifier: cleanIdentifier,
          password,
        }
      )

      if (res && res.user) {
        loginUser(res.user)
        const from = (location.state as { from?: { pathname?: string } })?.from
          ?.pathname
        if (from) {
          navigate(from, { replace: true })
        } else if (res.user.hasProfile) {
          navigate('/chat', { replace: true })
        } else {
          navigate('/choose-nickname', { replace: true })
        }
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage(
          'Failed to sign in. Please check your credentials and network.'
        )
      }
    } finally {
      setIsLoggingIn(false)
    }
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

          {/* Badge: UIU only */}
          <div className="hidden sm:flex items-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
              <span className="font-label-sm text-xs text-on-surface font-bold tracking-wide">
                🎓 UIU Students Only • 100% Anonymous
              </span>
            </div>
          </div>

          {/* Quick Nav */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="font-label-md text-xs sm:text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Home
            </Link>
            <Link
              to="/register"
              className="px-3 py-1 bg-secondary-container text-on-surface font-label-sm text-xs font-bold rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Login Content ──────────────────────────────────── */}
      <main className="flex-1 flex flex-col justify-center items-center w-full px-4 py-8 relative">
        {/* Ambient background decoration */}
        <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-72 h-72 rounded-full bg-primary-container/15 blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-md mx-auto">
          {/* Card Frame */}
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-6 sm:p-8">
            {/* Top Mascot Mini Badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#FFF5E6] rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] p-1.5 flex items-center justify-center shrink-0">
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
                <div>
                  <h1 className="font-headline-md text-xl sm:text-2xl font-bold text-on-surface">
                    Student Login
                  </h1>
                  <p className="font-label-sm text-xs text-on-surface-variant">
                    Enter your UIU credentials
                  </p>
                </div>
              </div>
              <span className="font-label-sm text-[11px] px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed-variant border border-on-surface font-bold">
                UIU Pass
              </span>
            </div>

            {/* Prominent UIU-Only Notice */}
            <div className="mb-4 p-2.5 bg-primary-fixed/40 rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px] shrink-0">
                school
              </span>
              <p className="font-label-sm text-xs text-on-surface font-bold leading-tight">
                Exclusively for United International University (UIU) students
              </p>
            </div>

            {/* Error Message banner */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-4 p-2.5 bg-error-container text-on-error-container rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] font-label-sm text-xs font-bold flex items-start gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">
                  error
                </span>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Info Notice banner */}
            {infoNotice && (
              <div
                role="status"
                className="mb-4 p-3 bg-[#FFF5E6] text-on-surface rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] font-label-sm text-xs space-y-1"
              >
                <div className="font-bold flex items-center gap-1.5 text-primary">
                  <span className="material-symbols-outlined text-[16px]">
                    info
                  </span>
                  <span>UI Demonstration Notice</span>
                </div>
                <p className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed">
                  {infoNotice}
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* UIU Student ID or Institutional Email */}
              <div>
                <label
                  htmlFor="identifier"
                  className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface mb-1"
                >
                  UIU Student ID or Institutional Email
                </label>
                <div className="relative">
                  <input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value)
                      if (errorMessage) setErrorMessage('')
                      if (infoNotice) setInfoNotice('')
                    }}
                    placeholder="e.g. 011231000 or student@bscse.uiu.ac.bd"
                    className="w-full px-3 py-2.5 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                  />
                  <span className="absolute right-3 top-3 material-symbols-outlined text-outline text-[18px] pointer-events-none">
                    badge
                  </span>
                </div>
                <p className="mt-1 font-label-sm text-[10px] text-on-surface-variant">
                  Enter your UIU Student ID (e.g.{' '}
                  <span className="font-bold">011231000</span>) or email ending
                  with <span className="font-bold">uiu.ac.bd</span>
                </p>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="password"
                    className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface"
                  >
                    Password
                  </label>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (errorMessage) setErrorMessage('')
                      if (infoNotice) setInfoNotice('')
                    }}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2.5 pr-11 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                  />
                  <button
                    type="button"
                    id="toggle-password-visibility"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-2.5 p-1 text-on-surface-variant hover:text-on-surface focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* LOG IN Button */}
              <button
                id="login-btn"
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 bg-primary-container text-on-surface font-headline-md text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] hover:bg-[#ff8638] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>{isLoggingIn ? 'LOGGING IN...' : 'LOG IN'}</span>
                <span className="material-symbols-outlined text-[18px]">
                  login
                </span>
              </button>

              {/* Immediately below LOG IN: Two clearly clickable buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  id="forgot-password-btn"
                  onClick={() => setShowForgotModal(true)}
                  className="w-full py-2.5 px-3 bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-xs font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:translate-x-0.5 hover:translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    lock_reset
                  </span>
                  <span>Forgot Password?</span>
                </button>
                <Link
                  to="/register"
                  id="create-account-btn"
                  className="w-full py-2.5 px-3 bg-secondary-container hover:bg-[#ffe087] text-on-surface font-label-sm text-xs font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:translate-x-0.5 hover:translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-1.5 text-center"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    person_add
                  </span>
                  <span>Create Account</span>
                </Link>
              </div>
            </form>

            {/* Additional info footer in card */}
            <div className="mt-5 text-center">
              <p className="font-body-sm text-xs text-on-surface-variant">
                Don't have an account yet?{' '}
                <Link
                  to="/register"
                  className="font-bold text-primary hover:text-primary-container underline decoration-2 underline-offset-2"
                >
                  Create UIU Student Account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ── Forgot Password Modal ──────────────────────────────── */}
      {showForgotModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-surface-container-lowest max-w-sm w-full rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-6 relative">
            {/* Close Button (X) */}
            <button
              type="button"
              id="close-forgot-modal"
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-on-surface hover:text-error transition-colors p-1"
              aria-label="Close modal"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-secondary-container border-2 border-on-surface flex items-center justify-center shadow-[2px_2px_0px_#1c1b1b] shrink-0">
                <span className="material-symbols-outlined text-[22px] text-on-surface">
                  lock_reset
                </span>
              </div>
              <div>
                <h3
                  id="forgot-modal-title"
                  className="font-headline-md text-base sm:text-lg font-bold text-on-surface"
                >
                  Password Recovery
                </h3>
                <p className="font-label-sm text-[11px] text-on-surface-variant">
                  UIU Student Authentication
                </p>
              </div>
            </div>

            {/* Modal Content */}
            <div className="space-y-4">
              <div className="p-3.5 bg-[#FFF5E6] rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-2 text-xs">
                <p className="font-bold flex items-center gap-1.5 text-primary">
                  <span className="material-symbols-outlined text-[18px]">
                    info
                  </span>
                  Backend Feature Pending
                </p>
                <p className="font-body-sm text-xs leading-relaxed text-on-surface">
                  Password recovery is not yet available. The password authentication backend still needs implementation before automated resets can be dispatched.
                </p>
                <p className="font-body-sm text-[11px] text-on-surface-variant">
                  No reset email has been sent. If you need a new UIU account or verification, please visit the registration page.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  id="modal-dismiss-btn"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full py-2.5 bg-primary-container text-on-surface font-headline-md text-xs font-bold uppercase rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                >
                  Understood
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(false)
                    navigate('/register')
                  }}
                  className="w-full py-2 bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-xs font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] transition-all text-center"
                >
                  Go to Registration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-3">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs gap-2">
          <p className="font-label-sm text-on-surface">
            KothaKoi (কথা কই) • Exclusively for United International University
          </p>
          <div className="flex items-center gap-3 font-label-sm text-on-surface-variant">
            <span>🔒 Confidential Auth</span>
            <span>•</span>
            <span>UIU Student Access</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
