import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env'
import { cookieParser } from './middleware/cookie-parser'
import { errorHandler, notFoundHandler } from './middleware/error-handler'
import { requestLogger } from './middleware/request-logger'
import healthRouter from './routes/health'
import authRouter from './routes/auth'
import profileRouter from './routes/profile'

const app = express()

// ---------- Trust Proxy Configuration ----------
// Explicitly configured via env.TRUST_PROXY; does not guess production proxy hop count.
app.set('trust proxy', env.TRUST_PROXY)

// ---------- Security & Logging Middleware ----------
app.use(helmet())

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true, // required for session cookies
  })
)

app.use(requestLogger)

// JSON body parser with explicit 16 KB size limit
app.use(express.json({ limit: '16kb' }))
app.use(cookieParser)

// ---------- Routes ----------
app.use('/api', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/profile', profileRouter)

// ---------- 404 & Centralized Error Handling ----------
app.use(notFoundHandler)
app.use(errorHandler)

export default app
