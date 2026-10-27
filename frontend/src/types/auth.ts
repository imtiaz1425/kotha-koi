import { ErrorCode } from '@kothakoi/shared'

export interface AuthUser {
  id: string
  email: string
  role: 'student' | 'admin' | string
  status: 'active' | 'suspended' | 'banned' | string
  hasProfile: boolean
  name?: string | null
}

export type AuthStatus =
  'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error'

export interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  errorCode: ErrorCode | null
  checkAuth: () => Promise<void>
  loginUser: (user: AuthUser) => void
  logout: () => Promise<void>
}
