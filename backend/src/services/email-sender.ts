import { env } from '../config/env'

export interface SendVerificationCodeOptions {
  to: string
  code: string
  expiresInMinutes?: number
}

export interface EmailSenderResult {
  success: boolean
  messageId?: string
}

/**
 * Interface for email delivery services.
 * Implemented by ConsoleEmailSender in development and real transactional providers
 * (e.g. Resend, SendGrid) once approved under OD-14 for production.
 */
export interface EmailSender {
  sendVerificationCode(
    options: SendVerificationCodeOptions
  ): Promise<EmailSenderResult>
}

export interface ConsoleLogger {
  log(message: string): void
  warn(message: string): void
  error(message: string): void
}

/**
 * Development and test implementation of EmailSender.
 * Logs verification codes to the console in development/test only.
 * Strictly prevents logging plaintext OTPs in production mode.
 */
export class ConsoleEmailSender implements EmailSender {
  private readonly logger: ConsoleLogger
  private readonly environment: string

  constructor(
    logger: ConsoleLogger = console,
    environment: string = env.NODE_ENV
  ) {
    this.logger = logger
    this.environment = environment
  }

  async sendVerificationCode(
    options: SendVerificationCodeOptions
  ): Promise<EmailSenderResult> {
    if (!options.to || !options.code) {
      throw new Error('Email recipient and verification code are required')
    }

    if (this.environment === 'production') {
      // In production mode, ConsoleEmailSender must NEVER print plaintext OTPs.
      // OD-14 is pending approval for selecting the production email provider.
      this.logger.error(
        '[email] Production EmailSender is unconfigured (OD-14 pending). Plaintext OTP will not be logged.'
      )
      throw new Error(
        'Production email provider is not configured. ConsoleEmailSender cannot be used in production.'
      )
    }

    const expiry = options.expiresInMinutes ?? 10
    this.logger.log(
      `[dev-email] Verification code for ${options.to}: ${options.code} (valid for ${expiry} min)`
    )

    return {
      success: true,
      messageId: `console-${Date.now()}`,
    }
  }
}

/**
 * Factory providing the default EmailSender instance.
 * Currently returns ConsoleEmailSender. In TASK-AUTH-07, once OD-14 is approved,
 * this will return the configured production provider.
 */
export function getEmailSender(): EmailSender {
  return new ConsoleEmailSender()
}
