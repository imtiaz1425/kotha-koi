/**
 * Register.tsx – KothaKoi UIU Student Registration Screen
 * Prototype UI mockup exclusively for United International University (UIU) students.
 */
import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Register() {
  const navigate = useNavigate()
  const [realName, setRealName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Email verification UI state (explicit mock UI)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [otpNotice, setOtpNotice] = useState('')

  function validateUiuEmail(val: string): { valid: boolean; message?: string } {
    const trimmed = val.trim()
    if (!trimmed) {
      return { valid: false, message: 'Please enter your UIU student email.' }
    }
    const uiuEmailRegex = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9-]+\.)*uiu\.ac\.bd$/i
    if (!uiuEmailRegex.test(trimmed)) {
      return {
        valid: false,
        message: 'Exclusively for United International University (UIU) students. Email must belong to the uiu.ac.bd domain (e.g., 2310125@bscse.uiu.ac.bd). Other domains are not accepted.',
      }
    }
    return { valid: true }
  }

  function handleSendOtp() {
    setErrorMessage('')
    const check = validateUiuEmail(email)
    if (!check.valid) {
      setErrorMessage(check.message || 'Please enter a valid UIU email.')
      return
    }
    setOtpSent(true)
    setOtpNotice('Simulated OTP generated! (Mock UI: Real email delivery not yet connected)')
  }

  function handleVerifyOtp() {
    if (otpCode.trim().length < 4) {
      setErrorMessage('Please enter the mock OTP code.')
      return
    }
    setIsEmailVerified(true)
    setOtpNotice('Mock OTP Verified (Prototype Mode) ✓')
    setErrorMessage('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMessage('')

    if (!realName.trim()) {
      setErrorMessage('Please enter your real name for student verification.')
      return
    }

    const check = validateUiuEmail(email)
    if (!check.valid) {
      setErrorMessage(check.message || 'Please enter a valid UIU institutional email.')
      return
    }

    if (!password.trim() || password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify.')
      return
    }

    if (!termsAccepted) {
      setErrorMessage('Please accept the UIU Student Code of Conduct and Privacy Terms.')
      return
    }

    // Prototype registration flow: navigate to choose-nickname
    alert('Prototype registration complete! Proceeding to anonymous nickname selection.')
    navigate('/choose-nickname')
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

          {/* Badge */}
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
              to="/login"
              className="font-label-md text-xs sm:text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/"
              className="px-3 py-1 bg-surface-container text-on-surface font-label-sm text-xs font-bold rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-secondary-container transition-all"
            >
              Home
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Registration Content ───────────────────────────── */}
      <main className="flex-1 flex flex-col justify-center items-center w-full px-4 py-8 relative">
        {/* Ambient background decoration */}
        <div className="absolute top-10 right-10 w-72 h-72 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-72 h-72 rounded-full bg-primary-container/15 blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-lg mx-auto">
          {/* Card Frame */}
          <div className="bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[5px_5px_0px_#1c1b1b] p-6 sm:p-8">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-secondary-container rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] p-2 flex items-center justify-center shrink-0">
                  <span className="text-2xl">🎓</span>
                </div>
                <div>
                  <h1 className="font-headline-md text-xl sm:text-2xl font-bold text-on-surface">
                    UIU Registration
                  </h1>
                  <p className="font-label-sm text-xs text-on-surface-variant">
                    Student account creation
                  </p>
                </div>
              </div>
              <span className="font-label-sm text-[10px] px-2 py-0.5 rounded bg-[#FFF5E6] text-primary border border-on-surface font-bold">
                UIU Only
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

            {/* Crucial Anonymity Notice Callout */}
            <div className="mb-4 p-3 bg-[#FFF5E6] rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-1">
              <div className="flex items-center gap-1.5 text-primary font-bold font-label-sm text-xs">
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
                <span>Private Identity Guarantee</span>
              </div>
              <p className="font-body-sm text-xs text-on-surface leading-snug">
                Your <strong className="text-on-surface">Real Name</strong> is collected solely for student verification. In adda chat rooms, peers will <strong>NEVER</strong> see your real name or student ID.
              </p>
            </div>

            {/* Error Message banner */}
            {errorMessage && (
              <div className="mb-4 p-2.5 bg-error-container text-on-error-container rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] font-label-sm text-xs font-bold flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Real Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="realName"
                    className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface"
                  >
                    Real Name
                  </label>
                  <span className="font-label-sm text-[10px] px-1.5 py-0.2 bg-surface-container rounded border border-on-surface/40 text-on-surface-variant font-bold">
                    🔒 Kept Strictly Private
                  </span>
                </div>
                <div className="relative">
                  <input
                    id="realName"
                    type="text"
                    required
                    value={realName}
                    onChange={(e) => {
                      setRealName(e.target.value)
                      if (errorMessage) setErrorMessage('')
                    }}
                    placeholder="e.g. Tanvir Ahmed"
                    className="w-full px-3 py-2 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                  />
                  <span className="absolute right-3 top-2.5 material-symbols-outlined text-outline text-[18px] pointer-events-none">
                    badge
                  </span>
                </div>
                <p className="mt-1 font-label-sm text-[10px] text-on-surface-variant">
                  Private account record. Never displayed to chat peers.
                </p>
              </div>

              {/* UIU Email */}
              <div>
                <label
                  htmlFor="regEmail"
                  className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface mb-1"
                >
                  UIU Institutional Email
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="regEmail"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (errorMessage) setErrorMessage('')
                      }}
                      placeholder="e.g. 2310125@bscse.uiu.ac.bd"
                      className="w-full px-3 py-2 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                    />
                    <span className="absolute right-3 top-2.5 material-symbols-outlined text-outline text-[18px] pointer-events-none">
                      school
                    </span>
                  </div>
                  {/* Send Code Button */}
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="px-3 py-2 bg-secondary-container hover:bg-[#ffe087] text-on-surface font-label-sm text-xs font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all shrink-0"
                  >
                    {otpSent ? 'Resend' : 'Send Code'}
                  </button>
                </div>
                <p className="mt-1 font-label-sm text-[10px] text-on-surface-variant">
                  Must end with uiu.ac.bd (e.g. <span className="font-bold">2310125@bscse.uiu.ac.bd</span>)
                </p>
              </div>

              {/* Email Verification UI Component (Explicitly labeled as Mock UI) */}
              <div className="p-3 bg-surface-container rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-xs font-bold text-on-surface flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-primary">mark_email_read</span>
                    Email OTP Verification (Mock UI)
                  </span>
                  {isEmailVerified ? (
                    <span className="font-label-sm text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-600 font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">check</span>
                      Mock Verified
                    </span>
                  ) : (
                    <span className="font-label-sm text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant border border-on-surface/30">
                      Simulated
                    </span>
                  )}
                </div>

                <div className="p-2 bg-[#FFF5E6] rounded-lg border border-on-surface/40 text-[11px] font-body-sm text-on-surface leading-tight">
                  <span className="font-bold text-primary">⚠️ Mock UI Preview:</span> Real email OTP delivery is simulated until production backend webmail services are deployed.
                </div>

                {otpNotice && (
                  <p className="font-label-sm text-[11px] text-primary font-semibold">
                    {otpNotice}
                  </p>
                )}

                {!isEmailVerified && (
                  <div className="flex items-center gap-2">
                    <input
                      id="otpCode"
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="Mock OTP (e.g. 749201)"
                      className="flex-1 px-3 py-1.5 bg-surface-container-lowest font-mono text-xs tracking-widest text-on-surface rounded-lg border-2 border-on-surface shadow-[1px_1px_0px_#1c1b1b] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      className="px-3 py-1.5 bg-primary-container text-on-surface font-label-sm text-xs font-bold uppercase rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] hover:bg-[#ff8638]"
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpCode('749201')
                        setIsEmailVerified(true)
                        setOtpNotice('Mock OTP verified for preview! ✓')
                        setErrorMessage('')
                      }}
                      className="px-2 py-1.5 bg-[#FFF5E6] text-on-surface font-label-sm text-[10px] font-bold rounded-lg border border-on-surface hover:bg-secondary-container"
                      title="Quick auto-fill for testing"
                    >
                      Auto-fill
                    </button>
                  </div>
                )}
              </div>

              {/* Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="regPassword"
                    className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface mb-1"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="regPassword"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (errorMessage) setErrorMessage('')
                      }}
                      placeholder="Min. 8 characters"
                      className="w-full px-3 py-2 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface mb-1"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        if (errorMessage) setErrorMessage('')
                      }}
                      placeholder="Repeat password"
                      className="w-full px-3 py-2 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Show password toggle */}
              <div className="flex items-center justify-between text-xs font-label-sm">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-on-surface-variant hover:text-on-surface flex items-center gap-1 font-bold"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                  <span>{showPassword ? 'Hide passwords' : 'Show passwords'}</span>
                </button>
                {password && confirmPassword && (
                  <span
                    className={`font-bold ${
                      password === confirmPassword ? 'text-emerald-700' : 'text-error'
                    }`}
                  >
                    {password === confirmPassword ? 'Passwords match ✓' : 'Passwords do not match ✗'}
                  </span>
                )}
              </div>

              {/* Privacy/Terms Consent */}
              <div className="p-3 bg-[#FFF5E6] rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b]">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    id="termsConsent"
                    type="checkbox"
                    required
                    checked={termsAccepted}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked)
                      if (errorMessage) setErrorMessage('')
                    }}
                    className="w-4 h-4 mt-0.5 rounded border-2 border-on-surface text-primary-container focus:ring-0 cursor-pointer"
                  />
                  <span className="font-body-sm text-xs text-on-surface leading-tight">
                    I agree to the <span className="font-bold">UIU Student Code of Conduct</span> and KothaKoi Privacy Terms. I understand harassment or misconduct results in an immediate ban.
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                id="register-btn"
                type="submit"
                className="w-full py-3 bg-primary-container text-on-surface font-headline-md text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] hover:bg-[#ff8638] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <span>Create UIU Student Account (Prototype)</span>
                <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
              </button>
            </form>

            {/* Link to Login */}
            <div className="mt-5 pt-3 border-t border-on-surface/20 text-center">
              <p className="font-body-sm text-xs text-on-surface-variant">
                Already registered with your UIU webmail?{' '}
                <Link
                  to="/login"
                  className="font-bold text-primary hover:text-primary-container underline decoration-2 underline-offset-2"
                >
                  Log In here
                </Link>
              </p>
            </div>

          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-3">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs gap-2">
          <p className="font-label-sm text-on-surface">
            KothaKoi (কথা কই) • Exclusively for United International University students
          </p>
          <div className="flex items-center gap-3 font-label-sm text-on-surface-variant">
            <span>🛡️ Zero Harassment Policy</span>
            <span>•</span>
            <span>Prototype Registration Flow</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
