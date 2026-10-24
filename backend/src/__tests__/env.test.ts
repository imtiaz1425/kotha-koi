import { describe, it, expect } from 'vitest'
import { validateEnv, loadEnv } from '../config/env'

describe('backend environment validation (env.ts)', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '5000',
    CLIENT_ORIGIN: 'http://localhost:3000',
    SESSION_SECRET: 'a-valid-session-secret-with-plenty-of-characters',
    DATABASE_URL: 'postgresql://kothakoi:pass@localhost:5432/kothakoi',
    ALLOWED_EMAIL_DOMAINS: 'uiu.ac.bd,bscse.uiu.ac.bd',
  }

  it('validates a complete, valid environment configuration', () => {
    const result = validateEnv(validEnv)
    expect(result.success).toBe(true)
    expect(result.data?.PORT).toBe(5000)
    expect(result.data?.NODE_ENV).toBe('development')
    expect(result.data?.CLIENT_ORIGIN).toBe('http://localhost:3000')
    expect(result.data?.DATABASE_URL).toBe(
      'postgresql://kothakoi:pass@localhost:5432/kothakoi'
    )
  })

  it('fails validation when SESSION_SECRET is missing', () => {
    const { SESSION_SECRET: _, ...missingSecret } = validEnv
    const result = validateEnv(missingSecret)
    expect(result.success).toBe(false)
    expect(
      result.errors?.some((e) => e.includes('SESSION_SECRET is required'))
    ).toBe(true)
  })

  it('fails validation when SESSION_SECRET is too short', () => {
    const result = validateEnv({
      ...validEnv,
      SESSION_SECRET: 'short',
    })
    expect(result.success).toBe(false)
    expect(
      result.errors?.some((e) =>
        e.includes('SESSION_SECRET must be at least 16 characters')
      )
    ).toBe(true)
  })

  it('fails validation when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _, ...missingDb } = validEnv
    const result = validateEnv(missingDb)
    expect(result.success).toBe(false)
    expect(
      result.errors?.some((e) => e.includes('DATABASE_URL is required'))
    ).toBe(true)
  })

  it('fails validation when PORT is invalid', () => {
    const result = validateEnv({
      ...validEnv,
      PORT: 'invalid_port',
    })
    expect(result.success).toBe(false)
    expect(result.errors?.some((e) => e.includes('PORT'))).toBe(true)
  })

  it('loadEnv throws a fail-fast Error on missing required variables', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
      })
    ).toThrowError(/Invalid or missing environment configuration/)
  })

  it('error messages do not leak secret values', () => {
    const secretValue = 'super_confidential_secret_value_12345'
    try {
      loadEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: secretValue,
        // DATABASE_URL is deliberately missing
      })
    } catch (err: unknown) {
      const errorMsg = (err as Error).message
      expect(errorMsg).not.toContain(secretValue)
      expect(errorMsg).toContain('DATABASE_URL is required')
    }
  })

  describe('TRUST_PROXY parsing and validation', () => {
    it('defaults to boolean false when unset', () => {
      const result = validateEnv(validEnv)
      expect(result.success).toBe(true)
      expect(result.data?.TRUST_PROXY).toBe(false)
    })

    it('parses valid supported values', () => {
      expect(
        validateEnv({ ...validEnv, TRUST_PROXY: 'false' }).data?.TRUST_PROXY
      ).toBe(false)
      expect(
        validateEnv({ ...validEnv, TRUST_PROXY: 'true' }).data?.TRUST_PROXY
      ).toBe(true)
      expect(
        validateEnv({ ...validEnv, TRUST_PROXY: '1' }).data?.TRUST_PROXY
      ).toBe(1)
      expect(
        validateEnv({ ...validEnv, TRUST_PROXY: '2' }).data?.TRUST_PROXY
      ).toBe(2)
      expect(
        validateEnv({ ...validEnv, TRUST_PROXY: 'loopback' }).data?.TRUST_PROXY
      ).toBe('loopback')
      expect(
        validateEnv({ ...validEnv, TRUST_PROXY: '10.0.0.0/8' }).data
          ?.TRUST_PROXY
      ).toBe('10.0.0.0/8')
    })

    it('rejects arbitrary, non-supported strings and does not assume true', () => {
      const invalidValues = [
        'yes',
        'arbitrary',
        'hops',
        '-1',
        '01000',
        'trueish',
      ]
      for (const val of invalidValues) {
        const result = validateEnv({ ...validEnv, TRUST_PROXY: val })
        expect(result.success).toBe(false)
        expect(result.errors?.some((e) => e.includes('TRUST_PROXY'))).toBe(true)
      }
    })
  })
})
