import { describe, it, expect, vi } from 'vitest'
import {
  ConsoleEmailSender,
  getEmailSender,
  type ConsoleLogger,
} from '../services/email-sender'

describe('TASK-AUTH-02 — EmailSender Interface and ConsoleEmailSender', () => {
  const createMockLogger = (): ConsoleLogger & {
    logs: string[]
    warns: string[]
    errors: string[]
  } => {
    const logs: string[] = []
    const warns: string[] = []
    const errors: string[] = []
    return {
      logs,
      warns,
      errors,
      log: vi.fn((msg: string) => logs.push(msg)),
      warn: vi.fn((msg: string) => warns.push(msg)),
      error: vi.fn((msg: string) => errors.push(msg)),
    }
  }

  describe('Development and Test Behavior', () => {
    it('logs the OTP code and recipient in development mode', async () => {
      const logger = createMockLogger()
      const sender = new ConsoleEmailSender(logger, 'development')

      const result = await sender.sendVerificationCode({
        to: 'student@bscse.uiu.ac.bd',
        code: '123456',
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toContain('console-')
      expect(logger.logs.length).toBe(1)
      expect(logger.logs[0]).toContain('student@bscse.uiu.ac.bd')
      expect(logger.logs[0]).toContain('123456')
      expect(logger.logs[0]).toContain('valid for 10 min')
    })

    it('formats custom expiry duration when provided', async () => {
      const logger = createMockLogger()
      const sender = new ConsoleEmailSender(logger, 'development')

      await sender.sendVerificationCode({
        to: 'student@bscse.uiu.ac.bd',
        code: '654321',
        expiresInMinutes: 5,
      })

      expect(logger.logs[0]).toContain('valid for 5 min')
    })

    it('rejects missing recipient email or missing code', async () => {
      const logger = createMockLogger()
      const sender = new ConsoleEmailSender(logger, 'development')

      await expect(
        sender.sendVerificationCode({
          to: '',
          code: '123456',
        })
      ).rejects.toThrowError(
        /Email recipient and verification code are required/
      )

      await expect(
        sender.sendVerificationCode({
          to: 'student@uiu.ac.bd',
          code: '',
        })
      ).rejects.toThrowError(
        /Email recipient and verification code are required/
      )
    })
  })

  describe('Production Environment Safety Guard', () => {
    it('refuses to send and never logs plaintext OTP in production mode', async () => {
      const logger = createMockLogger()
      const sender = new ConsoleEmailSender(logger, 'production')
      const sensitiveOtp = '987654'

      await expect(
        sender.sendVerificationCode({
          to: 'student@bscse.uiu.ac.bd',
          code: sensitiveOtp,
        })
      ).rejects.toThrowError(
        /Production email provider is not configured. ConsoleEmailSender cannot be used in production./
      )

      // Ensure the plaintext OTP is never logged in any logger channel
      const allLoggedText = [
        ...logger.logs,
        ...logger.warns,
        ...logger.errors,
      ].join(' ')

      expect(allLoggedText).not.toContain(sensitiveOtp)
      expect(logger.errors.length).toBe(1)
      expect(logger.errors[0]).toContain('OD-14 pending')
    })
  })

  describe('getEmailSender() Factory', () => {
    it('returns an instance implementing EmailSender', () => {
      const sender = getEmailSender()
      expect(sender).toBeDefined()
      expect(typeof sender.sendVerificationCode).toBe('function')
    })
  })
})
