import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express, { Request, Response } from 'express'
import { apiErrorSchema } from '@kothakoi/shared'
import app from '../app'
import { AppError } from '../errors/app-error'
import { errorHandler, notFoundHandler } from '../middleware/error-handler'
import { createRequestLogger, sanitizePath } from '../middleware/request-logger'

describe('TASK-FND-06 — Backend Skeleton Hardening', () => {
  describe('GET /api/health (Preserved Endpoint)', () => {
    it('returns HTTP 200 with { status: "ok" }', async () => {
      const res = await request(app).get('/api/health')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: 'ok' })
    })
  })

  describe('Helmet Security Headers', () => {
    it('sets standard defensive HTTP security headers', async () => {
      const res = await request(app).get('/api/health')

      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
      expect(res.headers['x-dns-prefetch-control']).toBe('off')
      expect(res.headers['x-download-options']).toBe('noopen')
      expect(res.headers['x-permitted-cross-domain-policies']).toBe('none')
      expect(res.headers['referrer-policy']).toBe('no-referrer')
    })
  })

  describe('Standard 404 Handler for Unknown Routes', () => {
    it('returns 404 formatted per apiErrorSchema with code NOT_FOUND', async () => {
      const res = await request(app).get('/api/unmapped-route')

      expect(res.status).toBe(404)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(res.body.error.message).toContain(
        'Route GET /api/unmapped-route not found'
      )
    })
  })

  describe('JSON Body Limit & Malformed Payload Handling', () => {
    it('rejects oversized JSON payloads (> 16 KB) with HTTP 413 in standard error envelope', async () => {
      // 17 KB payload (exceeds 16 KB limit)
      const largePayload = { data: 'x'.repeat(17 * 1024) }

      const res = await request(app)
        .post('/api/health') // any endpoint
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(largePayload))

      expect(res.status).toBe(413)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('VALIDATION_FAILED')
      expect(res.body.error.message).toContain('exceeds size limit of 16 KB')
    })

    it('rejects malformed JSON with HTTP 400 in standard error envelope', async () => {
      const res = await request(app)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send('{ invalid: "json", not_quoted: }')

      expect(res.status).toBe(400)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('VALIDATION_FAILED')
      expect(res.body.error.message).toContain('Malformed JSON payload')
    })
  })

  describe('Centralized Error Handling & Secrecy', () => {
    it('handles AppError with custom status code and structured details', async () => {
      const testApp = express()
      testApp.use(express.json())
      testApp.get('/api/test-app-error', () => {
        throw new AppError(400, 'VALIDATION_FAILED', 'Nickname is required', {
          field: 'currentNickname',
        })
      })
      testApp.use(notFoundHandler)
      testApp.use(errorHandler)

      const res = await request(testApp).get('/api/test-app-error')
      expect(res.status).toBe(400)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('VALIDATION_FAILED')
      expect(res.body.error.message).toBe('Nickname is required')
      expect(res.body.error.details).toEqual({ field: 'currentNickname' })
    })

    it('masks unexpected 500 errors and never exposes stack traces or internal secrets', async () => {
      const testApp = express()
      testApp.use(express.json())
      testApp.get('/api/test-server-crash', () => {
        const sensitiveDbError = new Error(
          'FATAL: password authentication failed for user "kothakoi" at /var/postgres/db.ts:42\nstack trace...'
        )
        throw sensitiveDbError
      })
      testApp.use(notFoundHandler)
      testApp.use(errorHandler)

      const res = await request(testApp).get('/api/test-server-crash')
      expect(res.status).toBe(500)
      const parseResult = apiErrorSchema.safeParse(res.body)
      expect(parseResult.success).toBe(true)
      expect(res.body.error.code).toBe('INTERNAL')
      expect(res.body.error.message).toBe('Internal server error')

      // Ensure no stack traces or sensitive strings leaked
      const bodyString = JSON.stringify(res.body)
      expect(bodyString).not.toContain('password')
      expect(bodyString).not.toContain('FATAL')
      expect(bodyString).not.toContain('stack')
      expect(bodyString).not.toContain('kothakoi')
      expect(bodyString).not.toContain('.ts')
    })
  })

  describe('Privacy & Request Log Redaction', () => {
    it('sanitizePath removes query strings, parameters, and credentials from URLs', () => {
      expect(
        sanitizePath(
          '/api/auth/request-code?email=test%40uiu.ac.bd&otp=123456',
          '/api/auth/request-code'
        )
      ).toBe('/api/auth/request-code')
      expect(
        sanitizePath('/api/chat?token=secret-token-12345', '/api/chat')
      ).toBe('/api/chat')
      expect(sanitizePath('/api/health', '/api/health')).toBe('/api/health')
    })

    it('proves sensitive values never appear in request logs', async () => {
      const loggedMessages: string[] = []
      const customOutput = {
        write: (msg: string) => {
          loggedMessages.push(msg)
        },
      }

      const testApp = express()
      testApp.use(createRequestLogger(customOutput))
      testApp.use(express.json())
      testApp.post('/api/test-redaction', (req: Request, res: Response) => {
        res.status(200).json({ ok: true })
      })

      const sensitiveEmail = 'student.confidential@bscse.uiu.ac.bd'
      const sensitivePassword = 'superSecretPassword123!'
      const sensitiveOtp = '987654'
      const sensitiveToken = 'session-token-random-value-xyz'
      const sensitiveChatText =
        'This is a private chat message that must never be logged.'

      await request(testApp)
        .post(
          '/api/test-redaction?email=' +
            encodeURIComponent(sensitiveEmail) +
            '&otp=' +
            sensitiveOtp
        )
        .set('Authorization', 'Bearer ' + sensitiveToken)
        .set('Cookie', 'kothakoi_session=' + sensitiveToken)
        .send({
          email: sensitiveEmail,
          password: sensitivePassword,
          otp: sensitiveOtp,
          token: sensitiveToken,
          message: sensitiveChatText,
        })

      expect(loggedMessages.length).toBeGreaterThan(0)
      const combinedLogs = loggedMessages.join('\n')

      // Ensure safe metadata IS logged
      expect(combinedLogs).toContain('"method":"POST"')
      expect(combinedLogs).toContain('"path":"/api/test-redaction"')
      expect(combinedLogs).toContain('"status":200')
      expect(combinedLogs).toContain('"durationMs"')

      // Ensure sensitive values are NEVER logged
      expect(combinedLogs).not.toContain(sensitiveEmail)
      expect(combinedLogs).not.toContain(sensitivePassword)
      expect(combinedLogs).not.toContain(sensitiveOtp)
      expect(combinedLogs).not.toContain(sensitiveToken)
      expect(combinedLogs).not.toContain(sensitiveChatText)
    })
  })
})
