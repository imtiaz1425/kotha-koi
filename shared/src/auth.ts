import { z } from 'zod'

export const requestEmailCodeSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  acceptTerms: z.boolean().optional(),
})

export type RequestEmailCodeInput = z.infer<typeof requestEmailCodeSchema>

export const verifyEmailCodeSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  code: z
    .string()
    .trim()
    .length(6, 'Verification code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Verification code must contain digits only'),
})

export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>

export const setPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
})

export type SetPasswordInput = z.infer<typeof setPasswordSchema>

export const passwordLoginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Please enter your UIU Student ID or institutional email'),
  password: z.string().min(1, 'Please enter your password'),
})

export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>
