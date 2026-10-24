import React from 'react'
import { Navigate, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from '../context'

export interface ProtectedRouteProps {
  children?: React.ReactNode
  redirectTo?: string
}

export function ProtectedRoute({
  children,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div
        data-testid="auth-loading"
        className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 font-body-md"
      >
        <div className="bg-surface-container-lowest border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] rounded-2xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 mx-auto bg-primary-container rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] flex items-center justify-center animate-pulse">
            <span className="text-xl">🎓</span>
          </div>
          <div className="space-y-1">
            <h2 className="font-headline-md text-base sm:text-lg font-bold text-on-surface">
              Checking Authorization
            </h2>
            <p className="font-label-sm text-xs text-on-surface-variant">
              Verifying UIU student session...
            </p>
          </div>
          <div className="w-full bg-surface-container rounded-full h-2 border border-on-surface overflow-hidden">
            <div className="bg-primary h-full w-2/3 animate-[pulse_1s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />
  }

  return children ? <>{children}</> : <Outlet />
}
