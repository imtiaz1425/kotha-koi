import { describe, it, expect } from 'vitest'
import {
  ERROR_CODES,
  apiErrorSchema,
  requestEmailCodeSchema,
  verifyEmailCodeSchema,
  type ErrorCode,
  type ApiErrorPayload,
  type RequestEmailCodeInput,
} from '@kothakoi/shared'

describe('frontend integration with @kothakoi/shared', () => {
  it('validates standard ErrorCode values in frontend', () => {
    expect(ERROR_CODES).toContain('VALIDATION_FAILED')
    expect(ERROR_CODES).toContain('EMAIL_DOMAIN_NOT_ALLOWED')
  })

  it('imports and uses requestEmailCodeSchema in frontend context', () => {
    const input: RequestEmailCodeInput = {
      email: '2310125@bscse.uiu.ac.bd',
      acceptTerms: true,
    }

    const parsed = requestEmailCodeSchema.parse(input)
    expect(parsed.email).toBe('2310125@bscse.uiu.ac.bd')
  })

  it('validates standard ApiErrorPayload responses from server', () => {
    const code: ErrorCode = 'EMAIL_DOMAIN_NOT_ALLOWED'
    const errorPayload: ApiErrorPayload = {
      error: {
        code,
        message: 'Only official UIU email addresses are permitted',
      },
    }

    const validation = apiErrorSchema.safeParse(errorPayload)
    expect(validation.success).toBe(true)
  })

  it('validates 6-digit verification code input format', () => {
    expect(
      verifyEmailCodeSchema.safeParse({
        email: 'student@uiu.ac.bd',
        code: '123456',
      }).success
    ).toBe(true)
  })
})
