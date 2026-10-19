import session from 'express-session'

// SESSION_SECRET must be set in .env – never hardcode this value.
const secret = process.env.SESSION_SECRET
if (!secret) {
  throw new Error(
    'Missing SESSION_SECRET environment variable. Set it in your .env file.',
  )
}

export const sessionMiddleware = session({
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,                                          // not accessible via JS
    secure: process.env.NODE_ENV === 'production',           // HTTPS only in prod
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  },
})
