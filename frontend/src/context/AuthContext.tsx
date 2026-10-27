import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { apiClient, ApiClient, ApiClientError } from '../api/client'
import { AuthUser, AuthStatus, AuthContextValue } from '../types/auth'
import { ErrorCode } from '@kothakoi/shared'
import { AuthContext } from './auth-context'

export interface AuthProviderProps {
  children: React.ReactNode
  client?: ApiClient
}

function useAuthProviderCore(
  client: ApiClient = apiClient,
  onLogoutNavigate?: () => void
): AuthContextValue {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null)
  const isCheckingRef = useRef(false)
  const hasMountedRef = useRef(false)

  const checkAuth = useCallback(async () => {
    if (isCheckingRef.current) return
    isCheckingRef.current = true

    setStatus((prev) =>
      prev === 'authenticated' && user ? 'authenticated' : 'loading'
    )
    setError(null)
    setErrorCode(null)

    try {
      const data = await client.get<{ user: AuthUser }>('/auth/me')
      if (data && data.user) {
        setUser(data.user)
        setStatus('authenticated')
      } else {
        setUser(null)
        setStatus('unauthenticated')
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (
          err.status === 401 ||
          err.code === 'UNAUTHENTICATED' ||
          err.code === 'SESSION_EXPIRED'
        ) {
          setUser(null)
          setStatus('unauthenticated')
          setErrorCode(
            err.code === 'SESSION_EXPIRED'
              ? 'SESSION_EXPIRED'
              : 'UNAUTHENTICATED'
          )
        } else {
          // Network or 5xx server failure: do NOT declare session invalid
          setStatus('error')
          setError(err.message)
          setErrorCode(
            err.code === 'NETWORK_ERROR' || err.code === 'UNKNOWN_ERROR'
              ? null
              : err.code
          )
        }
      } else {
        setStatus('error')
        setError('An unexpected error occurred while verifying authentication.')
      }
    } finally {
      isCheckingRef.current = false
    }
  }, [client, user])

  const loginUser = useCallback((newUser: AuthUser) => {
    setUser(newUser)
    setStatus('authenticated')
    setError(null)
    setErrorCode(null)
  }, [])

  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout')
    } catch (err) {
      // Even if network or server errors occur, local session state is cleared
      console.warn('Server logout request encountered an issue:', err)
    } finally {
      setUser(null)
      setStatus('unauthenticated')
      setError(null)
      setErrorCode(null)
      onLogoutNavigate?.()
    }
  }, [client, onLogoutNavigate])

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      checkAuth()
    }
  }, [checkAuth])

  const isLoading = status === 'loading' || status === 'idle'
  const isAuthenticated = status === 'authenticated' && user !== null

  return {
    user,
    status,
    isLoading,
    isAuthenticated,
    error,
    errorCode,
    checkAuth,
    loginUser,
    logout,
  }
}

function RoutedAuthProvider({
  children,
  client = apiClient,
}: AuthProviderProps) {
  const navigate = useNavigate()
  const handleLogoutNavigate = useCallback(() => {
    navigate('/')
  }, [navigate])

  const value = useAuthProviderCore(client, handleLogoutNavigate)
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function BaseAuthProvider({ children, client = apiClient }: AuthProviderProps) {
  const value = useAuthProviderCore(client)
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider(props: AuthProviderProps) {
  const inRouter = useInRouterContext()
  if (inRouter) {
    return <RoutedAuthProvider {...props} />
  }
  return <BaseAuthProvider {...props} />
}
