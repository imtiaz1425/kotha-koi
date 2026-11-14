import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient, ApiClientError } from '../api/client'
import { useAuth } from '../context'

export default function AdminLogin() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { checkAuth } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const res = await apiClient.post<{ ok: boolean; user: { role: string } }>(
        '/auth/admin-login',
        {
          identifier: identifier.trim(),
          password,
        }
      )

      if (res?.ok && res.user.role === 'admin') {
        await checkAuth()
        navigate('/admin')
      } else {
        setError('Access denied. Administrator privileges required.')
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Authentication failed. Please verify your administrator credentials.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FFF5E6] border-b-2 border-on-surface shadow-[0_2px_0px_#1c1b1b] shrink-0">
        <div className="h-14 sm:h-16 max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1 select-none">
            <span className="font-headline-md text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              KothaKoi
            </span>
            <span className="font-headline-md text-xl sm:text-2xl font-bold text-primary">.</span>
            <span className="font-label-sm text-[11px] px-1.5 py-0.5 rounded bg-surface-container text-error border border-on-surface ml-1 font-bold">
              ADMIN
            </span>
          </Link>
          <Link
            to="/"
            className="px-3 py-1 bg-surface-container text-on-surface font-label-sm text-xs font-bold rounded-lg border border-on-surface hover:bg-secondary-container transition-all"
          >
            ← Public Site
          </Link>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[6px_6px_0px_#1c1b1b] p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-error/10 border-2 border-error text-error mb-2">
              <span className="material-symbols-outlined text-[24px]">shield_person</span>
            </div>
            <h1 className="font-headline-md text-2xl font-bold text-on-surface">
              Moderator Portal
            </h1>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Authorized administrators only. Role verification is strictly enforced on the server.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-error-container text-on-error-container border border-on-surface rounded-xl text-xs font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-error">error</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-label-sm text-xs font-bold text-on-surface mb-1">
                Admin UIU Webmail or ID
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin@bscse.uiu.ac.bd"
                className="w-full px-3 py-2 bg-surface text-on-surface font-body-sm text-sm rounded-xl border-2 border-on-surface focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-label-sm text-xs font-bold text-on-surface mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 bg-surface text-on-surface font-body-sm text-sm rounded-xl border-2 border-on-surface focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-[#1c1b1b] text-white font-headline-md text-xs sm:text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#ff8638] hover:bg-black active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying Credentials...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">lock_open</span>
                  Sign In to Moderation
                </>
              )}
            </button>
          </form>

          <p className="text-[11px] text-center text-on-surface-variant border-t border-on-surface/15 pt-4">
            Student logins without administrative privileges are prohibited from entering this dashboard.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-3 text-center text-xs text-on-surface-variant font-label-sm">
        KothaKoi Moderation System • Restricted Access
      </footer>
    </div>
  )
}

