/**
 * Login.tsx – KothaKoi UIU Student Login Screen
 * Prototype UI mockup exclusively for United International University (UIU) students.
 */
import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Login() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [loginFeedback, setLoginFeedback] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  function validateUiuIdentifier(val: string): { valid: boolean; message?: string } {
    const trimmed = val.trim()
    if (!trimmed) {
      return { valid: false, message: 'Please enter your UIU email or Student ID.' }
    }

    // Student ID login: If no '@', check if digits / alphanumeric student ID
    if (!trimmed.includes('@')) {
      const studentIdClean = trimmed.replace(/\s+/g, '')
      if (/^[0-9]{7,10}$/.test(studentIdClean)) {
        return { valid: true }
      }
      return {
        valid: false,
        message: 'Student ID must be 7 to 10 digits (e.g. 2310125) or enter your full UIU email.',
      }
    }

    // Email login: validate that domain belongs to uiu.ac.bd or subdomains like bscse.uiu.ac.bd
    const uiuEmailRegex = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9-]+\.)*uiu\.ac\.bd$/i
    if (!uiuEmailRegex.test(trimmed)) {
      return {
        valid: false,
        message: 'Exclusively for United International University (UIU) students. Email domain must end with uiu.ac.bd (e.g., 2310125@bscse.uiu.ac.bd). Other domains are not accepted.',
      }
    }

    return { valid: true }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMessage('')

    const check = validateUiuIdentifier(identifier)
    if (!check.valid) {
      setErrorMessage(check.message || 'Invalid UIU credentials.')
      return
    }

    if (!password.trim()) {
      setErrorMessage('Please enter your password.')
      return
    }

    // Clearly treat login as a prototype flow without claiming secure authentication
    setLoginFeedback('Prototype login verified for preview! Redirecting to nickname selection...')
    setTimeout(() => {
      navigate('/choose-nickname')
    }, 600)
  }

  function handleForgotSubmit(e: FormEvent) {
    e.preventDefault()
    const check = validateUiuIdentifier(forgotEmail)
    if (!check.valid || !forgotEmail.includes('@')) {
      alert('Please enter a valid UIU institutional email ending with uiu.ac.bd.')
      return
    }
    setForgotSent(true)
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
                    <path d="M22 10V6H24V10H22ZM28 8V4H30V8H28ZM36 10V6H38V10H36Z" fill="#F47721" />
                    <rect fill="#FFE087" height="26" rx="2" stroke="#1c1b1b" strokeWidth="2" width="30" x="14" y="16" />
                    <path d="M14 26H44M14 34H44" stroke="#9C4500" strokeDasharray="2 3" strokeLinecap="round" strokeWidth="2" />
                    <path d="M44 20H49C51.2 20 53 21.8 53 24V28C53 30.2 51.2 32 49 32H44" stroke="#1c1b1b" strokeWidth="2" />
                    <rect fill="#1c1b1b" height="4" width="3" x="20" y="24" />
                    <rect fill="#1c1b1b" height="4" width="3" x="35" y="24" />
                    <rect fill="#F47721" height="2" width="3" x="18" y="29" />
                    <rect fill="#F47721" height="2" width="3" x="37" y="29" />
                    <path d="M26 31C26 32.5 27.5 34 29 34C30.5 34 32 32.5 32 31" stroke="#1c1b1b" strokeWidth="2" />
                    <rect fill="#FFFFFF" height="4" rx="1" stroke="#1c1b1b" strokeWidth="2" width="38" x="10" y="44" />
                  </svg>
                </div>
                <div>
                  <h1 className="font-headline-md text-xl sm:text-2xl font-bold text-on-surface">
                    Student Login
                  </h1>
                  <p className="font-label-sm text-xs text-on-surface-variant">
                    Enter with your UIU account
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

            {/* Prototype Notice */}
            <div className="mb-4 p-2.5 bg-[#FFF5E6] rounded-xl border border-on-surface/70 flex items-start gap-2 text-xs">
              <span className="material-symbols-outlined text-outline text-[16px] shrink-0 mt-0.5">
                info
              </span>
              <p className="font-body-sm text-[11px] text-on-surface leading-tight">
                <span className="font-bold">Prototype UI Flow:</span> Authentication is simulated for preview. Real credentials are not verified against a live production database.
              </p>
            </div>

            {/* Error Message banner */}
            {errorMessage && (
              <div className="mb-4 p-2.5 bg-error-container text-on-error-container rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] font-label-sm text-xs font-bold flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Success Feedback banner */}
            {loginFeedback && (
              <div className="mb-4 p-2.5 bg-emerald-100 text-emerald-800 rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] font-label-sm text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>{loginFeedback}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* UIU Email or Student ID */}
              <div>
                <label
                  htmlFor="identifier"
                  className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface mb-1"
                >
                  UIU Email or Student ID
                </label>
                <div className="relative">
                  <input
                    id="identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value)
                      if (errorMessage) setErrorMessage('')
                    }}
                    placeholder="e.g. 2310125@bscse.uiu.ac.bd or 2310125"
                    className="w-full px-3 py-2 sm:py-2.5 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                  />
                  <span className="absolute right-3 top-2.5 sm:top-3 material-symbols-outlined text-outline text-[18px] pointer-events-none">
                    badge
                  </span>
                </div>
                <p className="mt-1 font-label-sm text-[10px] text-on-surface-variant">
                  Accepts UIU email (e.g. <span className="font-bold">2310125@bscse.uiu.ac.bd</span>) or Student ID prefix (e.g. <span className="font-bold">2310125</span>)
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
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    className="font-label-sm text-xs text-primary hover:text-primary-container font-bold underline decoration-1 underline-offset-2"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (errorMessage) setErrorMessage('')
                    }}
                    placeholder="Enter your password"
                    className="w-full px-3 py-2 sm:py-2.5 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 sm:top-3 text-outline hover:text-on-surface transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-2 border-on-surface text-primary-container focus:ring-0 cursor-pointer"
                  />
                  <span className="font-label-sm text-xs text-on-surface">Remember this device</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                id="login-btn"
                type="submit"
                className="w-full py-3 bg-primary-container text-on-surface font-headline-md text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] hover:bg-[#ff8638] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <span>Login to KothaKoi (Prototype)</span>
                <span className="material-symbols-outlined text-[18px]">login</span>
              </button>
            </form>

            {/* Quick Demo Fill Buttons (for testing) */}
            <div className="mt-4 pt-3 border-t border-on-surface/20 flex flex-wrap items-center justify-between gap-1.5">
              <span className="font-label-sm text-[11px] text-outline">Quick test:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier('2310125@bscse.uiu.ac.bd')
                    setPassword('UIUstudent123!')
                    setErrorMessage('')
                  }}
                  className="font-label-sm text-[10px] px-2 py-0.5 rounded bg-surface-container border border-on-surface shadow-[1px_1px_0px_#1c1b1b] hover:bg-secondary-container transition-all"
                >
                  UIU Email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier('2310125')
                    setPassword('UIUstudent123!')
                    setErrorMessage('')
                  }}
                  className="font-label-sm text-[10px] px-2 py-0.5 rounded bg-surface-container border border-on-surface shadow-[1px_1px_0px_#1c1b1b] hover:bg-secondary-container transition-all"
                >
                  Student ID
                </button>
              </div>
            </div>

            {/* Link to Register */}
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

      {/* ── Forgot Password Modal Mockup ────────────────────────── */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-sm w-full rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-6 relative">
            <button
              onClick={() => {
                setShowForgotModal(false)
                setForgotSent(false)
              }}
              className="absolute top-4 right-4 text-on-surface hover:text-error"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>

            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-secondary-container border border-on-surface flex items-center justify-center shadow-[1px_1px_0px_#1c1b1b]">
                <span className="material-symbols-outlined text-[18px]">lock_reset</span>
              </div>
              <h3 className="font-headline-md text-lg font-bold text-on-surface">
                Password Recovery
              </h3>
            </div>

            {forgotSent ? (
              <div className="space-y-3">
                <div className="p-3 bg-[#FFF5E6] rounded-xl border border-on-surface text-xs text-on-surface space-y-1">
                  <p className="font-bold text-emerald-700 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">mail</span>
                    Reset link simulated!
                  </p>
                  <p>
                    In production, instructions are dispatched to your UIU webmail (<strong>{forgotEmail}</strong>).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(false)
                    setForgotSent(false)
                  }}
                  className="w-full py-2 bg-primary-container text-on-surface font-bold text-xs uppercase rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b]"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <p className="font-body-sm text-xs text-on-surface-variant">
                  Enter your registered UIU email. A password reset link will be sent to your student webmail.
                </p>
                <div>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="2310125@bscse.uiu.ac.bd"
                    className="w-full px-3 py-2 bg-surface text-on-surface font-body-sm text-xs rounded-lg border-2 border-on-surface shadow-[1px_1px_0px_#1c1b1b] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-primary-container text-on-surface font-bold text-xs uppercase rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-[#ff8638]"
                >
                  Send Reset Link (Demo)
                </button>
              </form>
            )}
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
            <span>Prototype User Flow</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
