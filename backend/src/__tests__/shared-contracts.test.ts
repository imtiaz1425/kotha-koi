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

describe('backend integration with @kothakoi/shared', () => {
  it('recognizes standard error codes in backend', () => {
    expect(ERROR_CODES).toContain('VALIDATION_FAILED')
    expect(ERROR_CODES).toContain('EMAIL_DOMAIN_NOT_ALLOWED')
  })

  it('imports and uses requestEmailCodeSchema in backend context', () => {
    const input: RequestEmailCodeInput = {
      email: '2310125@bscse.uiu.ac.bd',
      acceptTerms: true,
    }

    const parsed = requestEmailCodeSchema.parse(input)
    expect(parsed.email).toBe('2310125@bscse.uiu.ac.bd')
  })

  it('generates a typed ApiErrorPayload using standard error codes', () => {
    const code: ErrorCode = 'EMAIL_DOMAIN_NOT_ALLOWED'
    const errorResponse: ApiErrorPayload = {
      error: {
        code,
        message: 'Only official UIU email addresses are permitted',
      },
    }

    const validation = apiErrorSchema.safeParse(errorResponse)
    expect(validation.success).toBe(true)
  })

  it('validates 6-digit verification code schema', () => {
    expect(
      verifyEmailCodeSchema.safeParse({
        email: 'student@uiu.ac.bd',
        code: '987654',
      }).success
    ).toBe(true)
  })
})
