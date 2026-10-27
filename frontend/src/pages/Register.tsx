/**
 * Register.tsx – KothaKoi UIU Student Registration Screen
 * Verified student account creation exclusively for United International University (UIU) students.
 */
import { useState, useEffect, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient, ApiClientError } from '../api/client'
import { OnlineBadge } from '../components/OnlineBadge'
import type { AuthUser } from '../types/auth'

export default function Register() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [successNotice, setSuccessNotice] = useState('')

  // Cooldown countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  function validateEmailInput(val: string): {
    valid: boolean
    message?: string
  } {
    const trimmed = val.trim().toLowerCase()
    if (!trimmed) {
      return { valid: false, message: 'Please enter your UIU student email.' }
    }
    if (!trimmed.includes('@')) {
      return {
        valid: false,
        message:
          'Please enter a complete UIU email address (e.g. 2310125@bscse.uiu.ac.bd).',
      }
    }
    const uiuEmailRegex = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9-]+\.)*uiu\.ac\.bd$/i
    if (!uiuEmailRegex.test(trimmed)) {
      return {
        valid: false,
        message:
          'Exclusively for United International University (UIU) students. Email domain must end with uiu.ac.bd (e.g., 2310125@bscse.uiu.ac.bd). Other domains are not accepted.',
      }
    }
    return { valid: true }
  }

  async function handleSendCode() {
    setErrorMessage('')
    setSuccessNotice('')
    setPasswordError('')

    if (!termsAccepted) {
      setErrorMessage(
        'Please accept the UIU Student Code of Conduct and Privacy Terms to continue.'
      )
      return
    }

    const check = validateEmailInput(email)
    if (!check.valid) {
      setErrorMessage(check.message || 'Please enter a valid UIU email.')
      return
    }

    setIsRequesting(true)
    try {
      const res = await apiClient.post<{ ok: boolean; message?: string }>(
        '/auth/request-code',
        {
          email: email.trim().toLowerCase(),
          acceptTerms: true,
        }
      )
      if (res.ok) {
        setOtpSent(true)
        setCountdown(60)
        setSuccessNotice(
          'Verification code sent! Please check your UIU student email inbox (or backend server logs in development).'
        )
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage(
          'Unable to send verification code. Please check your network connection and try again.'
        )
      }
    } finally {
      setIsRequesting(false)
    }
  }

  async function handleVerifyCode(e?: FormEvent) {
    if (e) e.preventDefault()
    if (isVerifying) return
    setErrorMessage('')
    setSuccessNotice('')
    setPasswordError('')

    if (!termsAccepted) {
      setErrorMessage(
        'Please accept the UIU Student Code of Conduct and Privacy Terms to continue.'
      )
      return
    }

    const cleanOtp = otpCode.trim()
    if (!/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage('Verification code must be exactly 6 digits.')
      return
    }

    setIsVerifying(true)
    try {
      const res = await apiClient.post<{ ok: boolean; user: AuthUser }>(
        '/auth/verify-code',
        {
          email: email.trim().toLowerCase(),
          code: cleanOtp,
        }
      )

      if (res && res.user) {
        setIsEmailVerified(true)
        setSuccessNotice(
          'UIU email verified successfully! Please create your account password below.'
        )
      } else {
        setErrorMessage(
          'Verification failed. Please check your verification code and try again.'
        )
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage(
          'Failed to verify code. Please check your network and try again.'
        )
      }
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleSaveAccount(e: FormEvent) {
    e.preventDefault()
    if (isSaving) return
    setErrorMessage('')
    setPasswordError('')

    const cleanPassword = password.trim()
    if (!cleanPassword || cleanPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match. Please verify.')
      return
    }

    setIsSaving(true)
    try {
      const res = await apiClient.post<{ ok: boolean; message: string }>(
        '/auth/set-password',
        {
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || undefined,
        }
      )

      if (res.ok) {
        // Clear any active session from verify-code to ensure fresh login
        try {
          await apiClient.post('/auth/logout')
        } catch {
          // ignore
        }
        navigate('/login', {
          state: { email: email.trim().toLowerCase() },
          replace: true,
        })
      } else {
        setErrorMessage('Failed to save account password. Please try again.')
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage(
          'Unable to save account. Please check your connection and try again.'
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault()
    if (isRequesting || isVerifying || isSaving) return

    if (!otpSent) {
      handleSendCode()
    } else if (!isEmailVerified) {
      handleVerifyCode(e)
    } else {
      handleSaveAccount(e)
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

          {/* Badge & Online Counter */}
          <div className="flex items-center gap-2">
            <OnlineBadge />
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]">
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
                  <span
                    className="text-2xl"
                    role="img"
                    aria-label="student cap"
                  >
                    🎓
                  </span>
                </div>
                <div>
                  <h1 className="font-headline-md text-xl sm:text-2xl font-bold text-on-surface">
                    UIU Registration
                  </h1>
                  <p className="font-label-sm text-xs text-on-surface-variant">
                    Verified student account creation
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
                <span className="material-symbols-outlined text-[18px]">
                  verified_user
                </span>
                <span>100% Anonymous by Design</span>
              </div>
              <p className="font-body-sm text-xs text-on-surface leading-snug">
                Your email is used solely to verify UIU student status via OTP.
                We <strong>never</strong> collect or store your real name or
                student roster.
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

            {/* Success Feedback banner */}
            {successNotice && (
              <div
                role="status"
                className="mb-4 p-2.5 bg-emerald-100 text-emerald-800 rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] font-label-sm text-xs font-bold flex items-start gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">
                  check_circle
                </span>
                <span>{successNotice}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* UIU Email */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="regEmail"
                    className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface"
                  >
                    UIU Institutional Email
                  </label>
                  {otpSent && !isEmailVerified && (
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false)
                        setOtpCode('')
                        setErrorMessage('')
                        setSuccessNotice('')
                        setPasswordError('')
                      }}
                      className="font-label-sm text-[11px] text-primary hover:underline font-bold"
                    >
                      Change email
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="regEmail"
                      type="email"
                      required
                      value={email}
                      disabled={otpSent || isRequesting || isEmailVerified}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (errorMessage) setErrorMessage('')
                      }}
                      placeholder="e.g. 2310125@bscse.uiu.ac.bd"
                      className="w-full px-3 py-2 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all disabled:opacity-75 disabled:bg-surface-container"
                    />
                    <span className="absolute right-3 top-2.5 material-symbols-outlined text-outline text-[18px] pointer-events-none">
                      school
                    </span>
                  </div>
                  {/* Send / Resend Code Button */}
                  <button
                    type="button"
                    id="send-code-btn"
                    disabled={
                      isRequesting ||
                      (otpSent && countdown > 0) ||
                      isEmailVerified
                    }
                    onClick={handleSendCode}
                    className="px-3 py-2 bg-secondary-container hover:bg-[#ffe087] disabled:opacity-60 disabled:hover:bg-secondary-container text-on-surface font-label-sm text-xs font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all shrink-0"
                  >
                    {isRequesting
                      ? 'Sending...'
                      : isEmailVerified
                        ? 'Email Verified'
                        : otpSent
                          ? countdown > 0
                            ? `Resend in ${countdown}s`
                            : 'Resend Code'
                          : 'Send Code'}
                  </button>
                </div>
                <p className="mt-1 font-label-sm text-[10px] text-on-surface-variant">
                  Must end with uiu.ac.bd (e.g.{' '}
                  <span className="font-bold">2310125@bscse.uiu.ac.bd</span>)
                </p>
              </div>

              {/* 6-Digit Verification Code Section (Visible once code requested) */}
              {otpSent && (
                <div className="p-3 bg-surface-container rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="otpCode"
                      className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface"
                    >
                      6-Digit Verification Code
                    </label>
                    <span className="font-label-sm text-[10px] px-1.5 py-0.2 bg-surface-container-high rounded border border-on-surface/40 text-on-surface-variant font-bold">
                      {isEmailVerified ? 'Verified ✓' : '10 Min TTL'}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="otpCode"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus={!isEmailVerified}
                      disabled={isEmailVerified}
                      required
                      value={otpCode}
                      onChange={(e) => {
                        const val = e.target.value
                          .replace(/\D/g, '')
                          .slice(0, 6)
                        setOtpCode(val)
                        if (errorMessage) setErrorMessage('')
                      }}
                      placeholder="123456"
                      className="w-full px-3 py-2 bg-surface-container-lowest text-on-surface font-mono text-center text-lg tracking-[0.3em] font-bold rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all disabled:opacity-75"
                    />
                  </div>
                  <p className="font-body-sm text-[11px] text-on-surface-variant">
                    {isEmailVerified
                      ? 'Email verification confirmed with backend.'
                      : 'Check your UIU student webmail for the verification code. In local dev, check backend console logs.'}
                  </p>
                </div>
              )}

              {/* ── Success Indicator Directly Below OTP Verification Section ── */}
              {isEmailVerified && (
                <div
                  id="email-verified-indicator"
                  className="p-3 bg-emerald-50 rounded-xl border-2 border-emerald-600 shadow-[2px_2px_0px_#1c1b1b] flex items-center gap-3 animate-in fade-in duration-200"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-100 border-2 border-emerald-700 flex items-center justify-center shrink-0 text-emerald-700">
                    <span className="material-symbols-outlined text-[24px]">
                      check_circle
                    </span>
                  </div>
                  <div>
                    <h3 className="font-headline-md text-sm font-bold text-emerald-900 tracking-tight uppercase">
                      UIU STUDENT VERIFIED
                    </h3>
                    <p className="font-body-sm text-xs text-emerald-800">
                      Your UIU email has been successfully verified.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Password Fields (Revealed directly below success indicator) ── */}
              {isEmailVerified && (
                <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                  {/* Private Profile Name */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="regName"
                        className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface"
                      >
                        Private Profile Name (Account Owner)
                      </label>
                      <span className="font-label-sm text-[10px] text-primary font-bold">
                        🔒 Confidential
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        id="regName"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Tanvir Ahmed (Visible only to you)"
                        maxLength={60}
                        className="w-full px-3 py-2 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                      />
                      <span className="absolute right-3 top-2.5 material-symbols-outlined text-outline text-[18px] pointer-events-none">
                        badge
                      </span>
                    </div>
                    <p className="mt-1 font-body-sm text-[11px] text-on-surface-variant">
                      Private account name. Displayed only to you on your
                      profile. <strong>Never</strong> shared with chat partners
                      or used as a chat identity.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Create Password */}
                    <div>
                      <label
                        htmlFor="regPassword"
                        className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface mb-1"
                      >
                        Create Password
                      </label>
                      <div className="relative">
                        <input
                          id="regPassword"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value)
                            if (passwordError) setPasswordError('')
                            if (errorMessage) setErrorMessage('')
                          }}
                          placeholder="Min. 8 characters"
                          className="w-full px-3 py-2 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                        />
                      </div>
                    </div>

                    {/* Confirm Password */}
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
                            if (passwordError) setPasswordError('')
                            if (errorMessage) setErrorMessage('')
                          }}
                          placeholder="Repeat password"
                          className="w-full px-3 py-2 bg-surface text-on-surface font-body-md text-sm rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] focus:bg-white focus:outline-none focus:border-primary-container transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Show/Hide Toggle & Match Indicator */}
                  <div className="flex items-center justify-between text-xs font-label-sm pt-0.5">
                    <button
                      type="button"
                      id="toggle-password-visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-on-surface-variant hover:text-on-surface flex items-center gap-1 font-bold"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                      <span>
                        {showPassword ? 'Hide passwords' : 'Show passwords'}
                      </span>
                    </button>
                    {password && confirmPassword && (
                      <span
                        className={`font-bold ${
                          password === confirmPassword
                            ? 'text-emerald-700'
                            : 'text-error'
                        }`}
                      >
                        {password === confirmPassword
                          ? 'Passwords match ✓'
                          : 'Passwords do not match ✗'}
                      </span>
                    )}
                  </div>

                  {/* Inline Password Error */}
                  {passwordError && (
                    <div
                      role="alert"
                      className="p-2 bg-error-container text-on-error-container rounded-lg border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] font-label-sm text-xs font-bold flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        error
                      </span>
                      <span>{passwordError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Privacy/Terms Consent */}
              <div className="p-3 bg-[#FFF5E6] rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b]">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    id="termsConsent"
                    type="checkbox"
                    required
                    checked={termsAccepted}
                    disabled={isEmailVerified}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked)
                      if (errorMessage) setErrorMessage('')
                    }}
                    className="w-4 h-4 mt-0.5 rounded border-2 border-on-surface text-primary-container focus:ring-0 cursor-pointer"
                  />
                  <span className="font-body-sm text-xs text-on-surface leading-tight">
                    I agree to the{' '}
                    <span className="font-bold">
                      UIU Student Code of Conduct
                    </span>{' '}
                    and KothaKoi Privacy Terms. I understand harassment or
                    misconduct results in an immediate ban.
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              {isEmailVerified ? (
                /* SAVE & CREATE ACCOUNT Button */
                <button
                  id="save-account-btn"
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-3 bg-primary-container text-on-surface font-headline-md text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] hover:bg-[#ff8638] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <span>
                    {isSaving ? 'SAVING ACCOUNT...' : 'SAVE & CREATE ACCOUNT'}
                  </span>
                  <span className="material-symbols-outlined text-[18px]">
                    how_to_reg
                  </span>
                </button>
              ) : (
                /* Initial OTP Verification Button */
                <button
                  id="register-btn"
                  type="submit"
                  disabled={isRequesting || isVerifying}
                  className="w-full py-3 bg-primary-container text-on-surface font-headline-md text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] hover:bg-[#ff8638] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <span>
                    {isRequesting
                      ? 'Sending Code...'
                      : isVerifying
                        ? 'Verifying Code...'
                        : otpSent
                          ? 'Verify Email Code'
                          : 'Send Verification Code'}
                  </span>
                  <span className="material-symbols-outlined text-[18px]">
                    {otpSent ? 'verified' : 'send'}
                  </span>
                </button>
              )}
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
            KothaKoi (কথা কই) • Exclusively for United International University
            students
          </p>
          <div className="flex items-center gap-3 font-label-sm text-on-surface-variant">
            <span>🛡️ Zero Harassment Policy</span>
            <span>•</span>
            <span>UIU Student Registration</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
