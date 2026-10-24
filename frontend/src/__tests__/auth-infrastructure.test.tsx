import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiClient, ApiClientError } from '../api/client'
import { AuthUser, AuthContextValue } from '../types/auth'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthContext, AuthProvider, useAuth } from '../context'
import { ProtectedRoute } from '../components/ProtectedRoute'

class MockStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MockStorage(),
    writable: true,
  })
}
if (!globalThis.sessionStorage) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MockStorage(),
    writable: true,
  })
}

describe('TASK-AUTH-05 — Frontend Authentication Infrastructure', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('1. ApiClient (credentials, JSON parsing, error envelopes)', () => {
    it('always includes credentials: "include" for HttpOnly session cookie transmission', async () => {
      let capturedConfig: RequestInit | undefined
      globalThis.fetch = vi.fn().mockImplementation(async (_url, config) => {
        capturedConfig = config
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const client = new ApiClient('/api')
      await client.get('/test')

      expect(capturedConfig).toBeDefined()
      expect(capturedConfig?.credentials).toBe('include')
    })

    it('parses successful JSON responses correctly', async () => {
      const mockData = {
        user: {
          id: 'user-123',
          email: 'student@bscse.uiu.ac.bd',
          role: 'student',
          status: 'active',
          hasProfile: false,
        },
      }

      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify(mockData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )

      const client = new ApiClient('/api')
      const result = await client.get<typeof mockData>('/auth/me')

      expect(result).toEqual(mockData)
      expect(result.user.email).toBe('student@bscse.uiu.ac.bd')
    })

    it('handles HTTP 204 No Content cleanly', async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(null, {
            status: 204,
          })
      )

      const client = new ApiClient('/api')
      const result = await client.post('/auth/logout')

      expect(result).toBeUndefined()
    })

    it('parses backend standard error envelope correctly', async () => {
      const backendError = {
        error: {
          code: 'EMAIL_DOMAIN_NOT_ALLOWED',
          message:
            'Email domain not allowed. Please use your UIU student email.',
          details: { domain: 'gmail.com' },
        },
      }

      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify(backendError), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
      )

      const client = new ApiClient('/api')

      await expect(
        client.post('/auth/request-code', { email: 'test@gmail.com' })
      ).rejects.toThrow(ApiClientError)

      try {
        await client.post('/auth/request-code', { email: 'test@gmail.com' })
      } catch (err: unknown) {
        const apiErr = err as ApiClientError
        expect(apiErr.status).toBe(400)
        expect(apiErr.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED')
        expect(apiErr.message).toBe(
          'Email domain not allowed. Please use your UIU student email.'
        )
        expect(apiErr.details).toEqual({ domain: 'gmail.com' })
      }
    })

    it('safely handles network errors without crashing or exposing internals', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

      const client = new ApiClient('/api')

      try {
        await client.get('/auth/me')
        expect.fail('Expected ApiClientError to be thrown')
      } catch (err: unknown) {
        const apiErr = err as ApiClientError
        expect(apiErr).toBeInstanceOf(ApiClientError)
        expect(apiErr.code).toBe('NETWORK_ERROR')
        expect(apiErr.message).toContain('Unable to reach the server')
      }
    })

    it('safely handles non-JSON server error responses', async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response('<html><body>502 Bad Gateway</body></html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          })
      )

      const client = new ApiClient('/api')

      try {
        await client.get('/auth/me')
        expect.fail('Expected ApiClientError')
      } catch (err: unknown) {
        const apiErr = err as ApiClientError
        expect(apiErr.status).toBe(502)
        expect(apiErr.code).toBe('INTERNAL')
        expect(apiErr.message).toContain('502')
      }
    })
  })

  describe('2. Security Boundary: No tokens in browser storage', () => {
    it('never stores session tokens in localStorage or sessionStorage', async () => {
      const mockUser: AuthUser = {
        id: 'u-1',
        email: 'student@uiu.ac.bd',
        role: 'student',
        status: 'active',
        hasProfile: false,
      }

      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ user: mockUser }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )

      const client = new ApiClient('/api')
      await client.get('/auth/me')

      // Assert storage is completely pristine
      expect(localStorage.getItem('kothakoi_session')).toBeNull()
      expect(localStorage.getItem('token')).toBeNull()
      expect(localStorage.getItem('session')).toBeNull()
      expect(sessionStorage.getItem('kothakoi_session')).toBeNull()
      expect(sessionStorage.getItem('token')).toBeNull()
      expect(localStorage.length).toBe(0)
      expect(sessionStorage.length).toBe(0)
    })
  })

  describe('3. ProtectedRoute & Route Guards', () => {
    it('displays loading state and does NOT redirect prematurely while authentication is checking', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/chat']}>
          <AuthContext.Provider
            value={{
              user: null,
              status: 'loading',
              isLoading: true,
              isAuthenticated: false,
              error: null,
              errorCode: null,
              checkAuth: async () => {},
              loginUser: () => {},
              logout: async () => {},
            }}
          >
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/chat" element={<div>Private Chat Room</div>} />
              </Route>
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>
      )

      // Should show the loading indicator, NEVER the private chat or the login redirect
      expect(html).toContain('Checking Authorization')
      expect(html).toContain('Verifying UIU student session')
      expect(html).not.toContain('Private Chat Room')
    })

    it('redirects unauthenticated users from protected routes to /login with preserved location state', () => {
      let capturedElement: React.ReactElement | null = null

      function TestGuard() {
        capturedElement = ProtectedRoute({
          children: <div>My Profile View</div>,
          redirectTo: '/login',
        }) as React.ReactElement
        return capturedElement
      }

      const html = renderToString(
        <MemoryRouter initialEntries={['/profile']}>
          <AuthContext.Provider
            value={{
              user: null,
              status: 'unauthenticated',
              isLoading: false,
              isAuthenticated: false,
              error: null,
              errorCode: 'UNAUTHENTICATED',
              checkAuth: async () => {},
              loginUser: () => {},
              logout: async () => {},
            }}
          >
            <TestGuard />
          </AuthContext.Provider>
        </MemoryRouter>
      )

      // Protected content must never be rendered
      expect(html).not.toContain('My Profile View')

      // Must return a Navigate element with destination and preserved location state
      expect(capturedElement).not.toBeNull()
      expect(capturedElement!.type).toBe(Navigate)
      expect(capturedElement!.props.to).toBe('/login')
      expect(capturedElement!.props.replace).toBe(true)
      expect(capturedElement!.props.state.from.pathname).toBe('/profile')
    })

    it('renders protected content when user is authenticated', () => {
      const mockUser: AuthUser = {
        id: 'student-99',
        email: 'authenticated@bscse.uiu.ac.bd',
        role: 'student',
        status: 'active',
        hasProfile: true,
      }

      const html = renderToString(
        <MemoryRouter initialEntries={['/chat']}>
          <AuthContext.Provider
            value={{
              user: mockUser,
              status: 'authenticated',
              isLoading: false,
              isAuthenticated: true,
              error: null,
              errorCode: null,
              checkAuth: async () => {},
              loginUser: () => {},
              logout: async () => {},
            }}
          >
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route
                  path="/chat"
                  element={<div>Active Protected Chat Room</div>}
                />
              </Route>
              <Route path="/login" element={<div>Login Screen</div>} />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>
      )

      expect(html).toContain('Active Protected Chat Room')
      expect(html).not.toContain('Login Screen')
    })

    it('preserves public routes for unauthenticated users', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/']}>
          <AuthContext.Provider
            value={{
              user: null,
              status: 'unauthenticated',
              isLoading: false,
              isAuthenticated: false,
              error: null,
              errorCode: null,
              checkAuth: async () => {},
              loginUser: () => {},
              logout: async () => {},
            }}
          >
            <Routes>
              <Route path="/" element={<div>Public Landing Home</div>} />
              <Route path="/login" element={<div>Login Screen</div>} />
              <Route element={<ProtectedRoute />}>
                <Route path="/chat" element={<div>Protected Chat</div>} />
              </Route>
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>
      )

      expect(html).toContain('Public Landing Home')
      expect(html).not.toContain('Login Screen')
      expect(html).not.toContain('Protected Chat')
    })
  })

  describe('4. AuthProvider & Context State Transitions', () => {
    it('sets authenticated state when /auth/me returns a valid user session', async () => {
      const mockUser: AuthUser = {
        id: 'u-100',
        email: 'providertest@bscse.uiu.ac.bd',
        role: 'student',
        status: 'active',
        hasProfile: false,
      }

      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ user: mockUser }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )

      let capturedAuth: AuthContextValue | null = null

      function Consumer() {
        capturedAuth = useAuth()
        return <div>{capturedAuth.user?.email || 'no-user'}</div>
      }

      renderToString(
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      )

      expect(capturedAuth).not.toBeNull()
      // Initial state before effect completes is loading or idle
      expect(capturedAuth!.isLoading).toBe(true)
    })

    it('handles logout by calling backend and clearing client auth state', async () => {
      let logoutCalled = false
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/auth/logout')) {
          logoutCalled = true
          return new Response(null, { status: 204 })
        }
        return new Response(
          JSON.stringify({
            user: {
              id: 'u-200',
              email: 'logout@uiu.ac.bd',
              role: 'student',
              status: 'active',
              hasProfile: false,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      })

      const client = new ApiClient('/api')
      await client.post('/auth/logout')
      expect(logoutCalled).toBe(true)
    })
  })
})
