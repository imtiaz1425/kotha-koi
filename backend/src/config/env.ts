import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z
    .string()
    .default('5000')
    .refine(
      (val) => {
        const parsed = Number(val)
        return !isNaN(parsed) && parsed > 0 && parsed <= 65535
      },
      { message: 'PORT must be a valid port number between 1 and 65535' }
    )
    .transform((val) => Number(val)),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  SESSION_SECRET: z
    .string({
      required_error: 'SESSION_SECRET is required. Set it in your .env file.',
    })
    .min(16, 'SESSION_SECRET must be at least 16 characters long'),
  DATABASE_URL: z
    .string({
      required_error: 'DATABASE_URL is required. Set it in your .env file.',
    })
    .min(1, 'DATABASE_URL cannot be empty'),
  ALLOWED_EMAIL_DOMAINS: z.string().default('uiu.ac.bd,bscse.uiu.ac.bd'),
  OTP_HMAC_SECRET: z
    .string()
    .min(16, 'OTP_HMAC_SECRET must be at least 16 characters long')
    .optional(),
  TRUST_PROXY: z
    .string()
    .optional()
    .default('false')
    .transform((val, ctx) => {
      try {
        return parseTrustProxy(val)
      } catch (err: unknown) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: (err as Error).message,
        })
        return z.NEVER
      }
    }),
  METERED_APP_NAME: z.string().min(1).optional(),
  METERED_API_KEY: z.string().min(1).optional(),
})

/**
 * Safely parse TRUST_PROXY environment configuration.
 * Supported values:
 * - "false" / "0" -> false (default, direct connection)
 * - "true" -> true
 * - positive integer string "1", "2" -> numeric hop count (1..100)
 * - "loopback", "linklocal", "uniquelocal" -> trusted subnet keyword
 * - Valid IPv4/IPv6 address or CIDR string (e.g. "127.0.0.1", "10.0.0.0/8")
 *
 * Rejects arbitrary non-empty strings, negative numbers, or invalid formats.
 */
export function parseTrustProxy(val?: string): boolean | number | string {
  if (val === undefined || val === '') {
    return false
  }

  const trimmed = val.trim()
  const lower = trimmed.toLowerCase()

  if (lower === 'false' || lower === '0') {
    return false
  }
  if (lower === 'true') {
    return true
  }

  // Positive integer hop count (1..100)
  if (/^\d+$/.test(trimmed)) {
    const hops = parseInt(trimmed, 10)
    if (hops > 0 && hops <= 100) {
      return hops
    }
    throw new Error(
      'TRUST_PROXY hop count must be a positive integer between 1 and 100'
    )
  }

  // Standard keywords
  const keywords = ['loopback', 'linklocal', 'uniquelocal']
  if (keywords.includes(lower)) {
    return lower
  }

  // IPv4, IPv6, or CIDR (single or comma-separated)
  const segments = trimmed.split(',').map((s) => s.trim())
  const ipv4CidrRegex = /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$/
  const ipv6CidrRegex =
    /^([0-9a-fA-F:]+)(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?$/

  const allValid =
    segments.length > 0 &&
    segments.every((seg) => {
      const sLower = seg.toLowerCase()
      return (
        keywords.includes(sLower) ||
        ipv4CidrRegex.test(seg) ||
        ipv6CidrRegex.test(seg)
      )
    })

  if (allValid) {
    return trimmed
  }

  throw new Error(
    `Invalid TRUST_PROXY value '${val}'. Supported values: 'false', 'true', integer hop count (1..100), 'loopback', or valid IP/CIDR.`
  )
}

export type Env = z.infer<typeof envSchema>

export interface EnvValidationResult {
  success: boolean
  data?: Env
  errors?: string[]
}

export function validateEnv(
  rawEnv: Record<string, string | undefined> = process.env
): EnvValidationResult {
  const result = envSchema.safeParse(rawEnv)
  if (result.success) {
    return { success: true, data: result.data }
  }

  const errors = result.error.errors.map((err) => {
    const field = err.path.join('.') || 'configuration'
    return `${field}: ${err.message}`
  })

  return { success: false, errors }
}

export function loadEnv(
  rawEnv: Record<string, string | undefined> = process.env
): Env {
  // In test environment, if SESSION_SECRET or DATABASE_URL are not provided, provide safe test defaults
  const input = { ...rawEnv }
  if (input.NODE_ENV === 'test') {
    if (!input.SESSION_SECRET) {
      input.SESSION_SECRET = 'test-session-secret-min-16-chars'
    }
    if (!input.DATABASE_URL) {
      input.DATABASE_URL =
        'postgresql://kothakoi:kothakoi_dev_password@localhost:5432/kothakoi_test'
    }
  }

  const validation = validateEnv(input)
  if (!validation.success || !validation.data) {
    const errorList = validation.errors?.map((msg) => `  - ${msg}`).join('\n')
    const message = [
      '❌ [config/env] Invalid or missing environment configuration:',
      errorList,
      'Please check your .env file or refer to .env.example.',
    ].join('\n')

    throw new Error(message)
  }

  return validation.data
}

export const env = loadEnv()
