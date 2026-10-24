import { z } from 'zod'

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'EMAIL_DOMAIN_NOT_ALLOWED',
  'INVALID_CODE',
  'RATE_LIMITED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'ACCOUNT_UNAVAILABLE',
  'NOT_FOUND',
  'ALREADY_BUSY',
  'NOT_IN_SESSION',
  'SESSION_EXPIRED',
  'CONFLICT',
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string().min(1),
    details: z.record(z.unknown()).optional(),
  }),
})

export type ApiErrorPayload = z.infer<typeof apiErrorSchema>
