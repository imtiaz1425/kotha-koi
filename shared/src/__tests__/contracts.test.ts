import { describe, it, expect } from 'vitest'
import {
  ERROR_CODES,
  apiErrorSchema,
  requestEmailCodeSchema,
  verifyEmailCodeSchema,
} from '../index'

describe('shared contracts: errors', () => {
  it('contains all required standard error codes', () => {
    expect(ERROR_CODES).toContain('VALIDATION_FAILED')
    expect(ERROR_CODES).toContain('EMAIL_DOMAIN_NOT_ALLOWED')
    expect(ERROR_CODES).toContain('INVALID_CODE')
    expect(ERROR_CODES).toContain('RATE_LIMITED')
    expect(ERROR_CODES).toContain('UNAUTHENTICATED')
    expect(ERROR_CODES).toContain('FORBIDDEN')
    expect(ERROR_CODES).toContain('ACCOUNT_UNAVAILABLE')
    expect(ERROR_CODES).toContain('NOT_FOUND')
    expect(ERROR_CODES).toContain('ALREADY_BUSY')
    expect(ERROR_CODES).toContain('NOT_IN_SESSION')
    expect(ERROR_CODES).toContain('SESSION_EXPIRED')
    expect(ERROR_CODES).toContain('CONFLICT')
    expect(ERROR_CODES).toContain('INTERNAL')
  })

  it('validates a conformant API error payload', () => {
    const valid = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid email address provided',
        details: { field: 'email' },
      },
    }
    const result = apiErrorSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('rejects an invalid error code', () => {
    const invalid = {
      error: {
        code: 'UNKNOWN_CODE_XYZ',
        message: 'Something went wrong',
      },
    }
    const result = apiErrorSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

describe('shared contracts: auth schemas', () => {
  it('validates and normalizes requestEmailCode payload', () => {
    const parsed = requestEmailCodeSchema.parse({
      email: '  Student@UIU.AC.BD  ',
      acceptTerms: true,
    })
    expect(parsed.email).toBe('student@uiu.ac.bd')
    expect(parsed.acceptTerms).toBe(true)
  })

  it('rejects malformed email in requestEmailCode payload', () => {
    const result = requestEmailCodeSchema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('validates verifyEmailCode payload with exact 6 digits', () => {
    const parsed = verifyEmailCodeSchema.parse({
      email: 'STUDENT@BSCSE.UIU.AC.BD',
      code: '123456',
    })
    expect(parsed.email).toBe('student@bscse.uiu.ac.bd')
    expect(parsed.code).toBe('123456')
  })

  it('rejects verifyEmailCode with non-digit or wrong length code', () => {
    expect(
      verifyEmailCodeSchema.safeParse({
        email: 'test@uiu.ac.bd',
        code: '12345',
      }).success
    ).toBe(false)

    expect(
      verifyEmailCodeSchema.safeParse({
        email: 'test@uiu.ac.bd',
        code: '12345a',
      }).success
    ).toBe(false)
  })
})
