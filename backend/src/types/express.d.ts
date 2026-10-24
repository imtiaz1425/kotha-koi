import { User, Profile, Session } from '@prisma/client'

export type AuthenticatedUser = User & { profile?: Profile | null }

declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>
      user?: AuthenticatedUser
      sessionRecord?: Session
    }
  }
}
