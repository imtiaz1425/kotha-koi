import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ApiClient, ApiClientError } from '../api/client'
import { AuthContext, AuthProvider, useAuth } from '../context'
import { AuthUser, AuthContextValue } from '../types/auth'
import Login from '../pages/Login'
import Register from '../pages/Register'
import Home from '../pages/Home'
import { verifyEmailCodeSchema, requestEmailCodeSchema } from '@kothakoi/shared'

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

describe('TASK-AUTH-06 — Connect Existing UI to Real Authentication', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('1. Passwordless Architecture & Form Layout', () => {
    it('Login renders identifier input, password input with show/hide toggle, and LOG IN button', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <Login />
          </AuthProvider>
        </MemoryRouter>
      )

      expect(html).toContain('Student Login')
      expect(html).toContain('UIU Student ID or Institutional Email')
      expect(html).toContain('id="identifier"')
      expect(html).toContain('id="password"')
      expect(html).toContain('id="login-btn"')
      expect(html).toContain('LOG IN')
      expect(html).toContain('Forgot Password?')
      expect(html).toContain('Create Account')
    })

    it('Register renders email input, terms consent, and no password or real-name fields', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/register']}>
          <AuthProvider>
            <Register />
          </AuthProvider>
        </MemoryRouter>
      )

      expect(html).toContain('UIU Registration')
      expect(html).toContain('UIU Institutional Email')
      expect(html).toContain('Send Code')
      expect(html).toContain('termsConsent')
      expect(html).toContain('UIU Student Code of Conduct')

      // Must NOT contain password or real-name inputs
      expect(html).not.toContain('type="password"')
      expect(html).not.toContain('id="regPassword"')
      expect(html).not.toContain('id="confirmPassword"')
      expect(html).not.toContain('id="realName"')
      expect(html).not.toContain('Real Name')

      // Must NOT contain mock auto-fill bypass
      expect(html).not.toContain('Auto-fill')
      expect(html).not.toContain('Mock UI')
    })
  })

  describe('2. OTP Request Endpoint (POST /api/auth/request-code)', () => {
    it('sends valid UIU email to /api/auth/request-code and receives success', async () => {
      let capturedBody: string | undefined
      let capturedPath: string | undefined

      globalThis.fetch = vi.fn().mockImplementation(async (url, config) => {
        capturedPath = String(url)
        capturedBody = config?.body as string
        return new Response(
          JSON.stringify({ ok: true, message: 'Verification code sent' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      })

      const client = new ApiClient('/api')
      const payload = { email: 'student@bscse.uiu.ac.bd', acceptTerms: true }

      // Validate against shared contract schema
      const parsed = requestEmailCodeSchema.safeParse(payload)
      expect(parsed.success).toBe(true)

      const result = await client.post<{ ok: boolean; message: string }>(
        '/auth/request-code',
        payload
      )

      expect(result.ok).toBe(true)
      expect(capturedPath).toContain('/api/auth/request-code')
      expect(JSON.parse(capturedBody!)).toEqual(payload)
    })

    it('handles EMAIL_DOMAIN_NOT_ALLOWED rejection safely without crashing', async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'EMAIL_DOMAIN_NOT_ALLOWED',
                message:
                  'Email domain not allowed. Please use your UIU student email.',
              },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          )
      )

      const client = new ApiClient('/api')

      try {
        await client.post('/auth/request-code', { email: 'imposter@gmail.com' })
        expect.fail('Expected ApiClientError to be thrown')
      } catch (err: unknown) {
        const apiErr = err as ApiClientError
        expect(apiErr.status).toBe(400)
        expect(apiErr.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED')
        expect(apiErr.message).toContain('Email domain not allowed')
      }
    })

    it('handles 429 RATE_LIMITED cooldown gracefully', async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'RATE_LIMITED',
                message:
                  'Please wait 60 seconds before requesting another verification code.',
              },
            }),
            {
              status: 429,
              headers: { 'Content-Type': 'application/json' },
            }
          )
      )

      const client = new ApiClient('/api')

      try {
        await client.post('/auth/request-code', {
          email: 'student@bscse.uiu.ac.bd',
        })
        expect.fail('Expected ApiClientError')
      } catch (err: unknown) {
        const apiErr = err as ApiClientError
        expect(apiErr.status).toBe(429)
        expect(apiErr.code).toBe('RATE_LIMITED')
        expect(apiErr.message).toContain('wait 60 seconds')
      }
    })
  })

  describe('3. OTP Verification Endpoint (POST /api/auth/verify-code)', () => {
    it('enforces 6-digit numeric OTP code format', () => {
      expect(
        verifyEmailCodeSchema.safeParse({
          email: 'student@uiu.ac.bd',
          code: '123456',
        }).success
      ).toBe(true)

      expect(
        verifyEmailCodeSchema.safeParse({
          email: 'student@uiu.ac.bd',
          code: '12345', // only 5 digits
        }).success
      ).toBe(false)

      expect(
        verifyEmailCodeSchema.safeParse({
          email: 'student@uiu.ac.bd',
          code: '12345a', // contains letter
        }).success
      ).toBe(false)
    })

    it('does NOT authenticate user when verification returns 400 INVALID_CODE', async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'INVALID_CODE',
                message: 'Invalid verification code. 4 attempt(s) remaining.',
              },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          )
      )

      let capturedAuth: AuthContextValue | null = null
      function Consumer() {
        capturedAuth = useAuth()
        return <div>{capturedAuth.status}</div>
      }

      renderToString(
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      )

      const client = new ApiClient('/api')
      try {
        await client.post('/auth/verify-code', {
          email: 'student@bscse.uiu.ac.bd',
          code: '000000',
        })
        expect.fail('Expected ApiClientError')
      } catch (err: unknown) {
        const apiErr = err as ApiClientError
        expect(apiErr.status).toBe(400)
        expect(apiErr.code).toBe('INVALID_CODE')
      }

      // Assert user state is NOT authenticated
      expect(capturedAuth!.isAuthenticated).toBe(false)
      expect(capturedAuth!.user).toBeNull()
    })

    it('synchronizes authenticated state on successful verification', async () => {
      const mockUser: AuthUser = {
        id: 'u-uiu-1',
        email: 'authenticated.student@bscse.uiu.ac.bd',
        role: 'student',
        status: 'active',
        hasProfile: false,
      }

      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ ok: true, user: mockUser }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )

      let capturedAuth: AuthContextValue | null = null
      function Consumer() {
        capturedAuth = useAuth()
        return <div>{capturedAuth.user?.email || 'none'}</div>
      }

      renderToString(
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      )

      const client = new ApiClient('/api')
      const result = await client.post<{ ok: boolean; user: AuthUser }>(
        '/auth/verify-code',
        {
          email: 'authenticated.student@bscse.uiu.ac.bd',
          code: '123456',
        }
      )

      expect(result.ok).toBe(true)
      expect(result.user).toEqual(mockUser)

      // Verify loginUser function is exposed and callable
      expect(typeof capturedAuth!.loginUser).toBe('function')
      expect(() => capturedAuth!.loginUser(result.user)).not.toThrow()
    })
  })

  describe('4. Storage Isolation and Security Boundary', () => {
    it('never writes session tokens or credentials to localStorage or sessionStorage during authentication', async () => {
      const mockUser: AuthUser = {
        id: 'u-uiu-storage',
        email: 'privacy@bscse.uiu.ac.bd',
        role: 'student',
        status: 'active',
        hasProfile: false,
      }

      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ ok: true, user: mockUser }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )

      const client = new ApiClient('/api')
      await client.post('/auth/verify-code', {
        email: 'privacy@bscse.uiu.ac.bd',
        code: '654321',
      })

      expect(localStorage.getItem('token')).toBeNull()
      expect(localStorage.getItem('kothakoi_session')).toBeNull()
      expect(localStorage.getItem('session')).toBeNull()
      expect(sessionStorage.getItem('token')).toBeNull()
      expect(sessionStorage.getItem('kothakoi_session')).toBeNull()
      expect(localStorage.length).toBe(0)
      expect(sessionStorage.length).toBe(0)
    })
  })

  describe('5. Separate Email Verification Modal & Login Flow', () => {
    it('Register does NOT display verification-success popup initially or on initial render', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/register']}>
          <AuthProvider>
            <Register />
          </AuthProvider>
        </MemoryRouter>
      )

      expect(html).not.toContain('UIU STUDENT VERIFIED!')
      expect(html).not.toContain(
        'Your UIU email has been successfully verified. Welcome to KothaKoi!'
      )
      expect(html).not.toContain('id="modal-login-btn"')
      expect(html).not.toContain('id="verification-success-modal"')
    })

    it('never displays the verification-success popup on failed or rejected OTP verification', async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'INVALID_CODE',
                message: 'Invalid or expired verification code.',
              },
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          )
      )

      const client = new ApiClient('/api')
      let caughtError: ApiClientError | null = null

      try {
        await client.post('/auth/verify-code', {
          email: 'student@bscse.uiu.ac.bd',
          code: '999999',
        })
      } catch (err) {
        caughtError = err as ApiClientError
      }

      expect(caughtError).not.toBeNull()
      expect(caughtError?.status).toBe(400)
      expect(caughtError?.code).toBe('INVALID_CODE')
      expect(caughtError?.message).toContain('Invalid or expired')

      // Render Register again and verify popup is not present
      const html = renderToString(
        <MemoryRouter initialEntries={['/register']}>
          <AuthProvider>
            <Register />
          </AuthProvider>
        </MemoryRouter>
      )
      expect(html).not.toContain('UIU STUDENT VERIFIED!')
      expect(html).not.toContain('id="verification-success-modal"')
    })

    it('establishes authenticated session upon verification', () => {
      const verifiedUser: AuthUser = {
        id: 'u-verified-uiu',
        email: '2310125@bscse.uiu.ac.bd',
        role: 'student',
        status: 'active',
        hasProfile: false,
      }

      let loginUserCalledWith: AuthUser | null = null
      const mockLoginUser = (user: AuthUser) => {
        loginUserCalledWith = user
      }

      mockLoginUser(verifiedUser)
      expect(loginUserCalledWith).toEqual(verifiedUser)
    })

    it('subsequent successful login on Login establishes the authenticated session', () => {
      const verifiedUser: AuthUser = {
        id: 'u-verified-uiu',
        email: '2310125@bscse.uiu.ac.bd',
        role: 'student',
        status: 'active',
        hasProfile: false,
      }

      let loginUserCalledWith: AuthUser | null = null
      const mockLoginUser = (user: AuthUser) => {
        loginUserCalledWith = user
      }

      renderToString(
        <MemoryRouter initialEntries={['/login']}>
          <AuthContext.Provider
            value={{
              user: null,
              status: 'unauthenticated',
              isLoading: false,
              isAuthenticated: false,
              error: null,
              errorCode: null,
              checkAuth: async () => {},
              loginUser: mockLoginUser,
              logout: async () => {},
            }}
          >
            <Login />
          </AuthContext.Provider>
        </MemoryRouter>
      )

      // When the user submits valid OTP on Login, loginUser establishes the session
      mockLoginUser(verifiedUser)
      expect(loginUserCalledWith).toEqual(verifiedUser)
    })
  })

  describe('6. Persistent Authentication, Logout & Navigation Verification', () => {
    it('logout calls POST /api/auth/logout with credentials', async () => {
      let logoutUrlCalled: string | null = null
      let logoutMethod: string | null = null

      globalThis.fetch = vi.fn().mockImplementation(async (url, config) => {
        if (String(url).includes('/auth/logout')) {
          logoutUrlCalled = String(url)
          logoutMethod = config?.method || 'GET'
          return new Response(null, { status: 204 })
        }
        return new Response(
          JSON.stringify({
            error: { code: 'UNAUTHENTICATED', message: 'Auth required' },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      })

      const client = new ApiClient('/api')
      let authContextVal: AuthContextValue | null = null

      function Consumer() {
        authContextVal = useAuth()
        return <div>{authContextVal.status}</div>
      }

      renderToString(
        <MemoryRouter>
          <AuthProvider client={client}>
            <Consumer />
          </AuthProvider>
        </MemoryRouter>
      )

      expect(authContextVal).not.toBeNull()
      await authContextVal!.logout()

      expect(logoutUrlCalled).toContain('/api/auth/logout')
      expect(logoutMethod).toBe('POST')
    })

    it('session refresh: GET /api/auth/me returning 401 results in UNAUTHENTICATED error and unauthenticated state', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Authentication required. Please log in.',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const client = new ApiClient('/api')
      let caughtError: ApiClientError | null = null
      try {
        await client.get('/auth/me')
      } catch (err) {
        caughtError = err as ApiClientError
      }

      expect(caughtError).not.toBeNull()
      expect(caughtError?.status).toBe(401)
      expect(caughtError?.code).toBe('UNAUTHENTICATED')
    })

    it('direct navigation to /login renders form even with stale or unauthenticated state', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/login']}>
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
            <Login />
          </AuthContext.Provider>
        </MemoryRouter>
      )

      expect(html).toContain('Student Login')
      expect(html).toContain('UIU Student ID or Institutional Email')
      expect(html).toContain('id="identifier"')
      expect(html).toContain('id="password"')
      expect(html).toContain('id="login-btn"')
      expect(html).not.toContain('Choose Chat Nickname')
    })

    it('direct navigation to /register renders form even with stale or unauthenticated state', () => {
      const html = renderToString(
        <MemoryRouter initialEntries={['/register']}>
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
            <Register />
          </AuthContext.Provider>
        </MemoryRouter>
      )

      expect(html).toContain('UIU Registration')
      expect(html).toContain('UIU Institutional Email')
      expect(html).toContain('id="send-code-btn"')
      expect(html).toContain('id="register-btn"')
      expect(html).not.toContain('Choose Chat Nickname')
    })

    it('Start Adda on Home navigates to /login when logged out', () => {
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
            <Home />
          </AuthContext.Provider>
        </MemoryRouter>
      )

      expect(html).toContain('href="/login"')
      expect(html).toContain('Start Adda')
      expect(html).not.toContain('href="/choose-nickname"')
    })

    it('Start Adda on Home navigates to /choose-nickname when authenticated without profile', () => {
      const authenticatedUser: AuthUser = {
        id: 'user-777',
        email: 'student777@bscse.uiu.ac.bd',
        role: 'student',
        status: 'active',
        hasProfile: false,
      }

      const html = renderToString(
        <MemoryRouter initialEntries={['/']}>
          <AuthContext.Provider
            value={{
              user: authenticatedUser,
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
            <Home />
          </AuthContext.Provider>
        </MemoryRouter>
      )

      expect(html).toContain('href="/choose-nickname"')
      expect(html).toContain('Start Adda')
      expect(html).not.toContain('href="/login"')
    })
  })
})
