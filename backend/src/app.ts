import 'dotenv/config'
import { sessionMiddleware } from './config/session'
import healthRouter from './routes/health'
import cors from 'cors'
import express from 'express'

const app = express()

// ---------- Middleware ----------
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
    credentials: true, // required for session cookies
  }),
)

app.use(express.json())
app.use(sessionMiddleware)

// ---------- Routes ----------
app.use('/api', healthRouter)

export default app
