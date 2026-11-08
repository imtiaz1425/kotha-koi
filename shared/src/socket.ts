import { z } from 'zod'

export type RtcRole = 'offerer' | 'answerer'

export const rtcRoleSchema = z.enum(['offerer', 'answerer'])

export type RtcNegotiationState = 'IDLE' | 'HAVE_OFFER' | 'STABLE'

export const rtcNegotiationStateSchema = z.enum(['IDLE', 'HAVE_OFFER', 'STABLE'])

// Payload for rtc:offer
export const rtcOfferPayloadSchema = z.object({
  sessionId: z.string().min(1).max(128),
  sdp: z.string().min(1).max(65536),
  type: z.literal('offer').optional(),
})

export type RtcOfferPayload = z.infer<typeof rtcOfferPayloadSchema>

// Payload for rtc:answer
export const rtcAnswerPayloadSchema = z.object({
  sessionId: z.string().min(1).max(128),
  sdp: z.string().min(1).max(65536),
  type: z.literal('answer').optional(),
})

export type RtcAnswerPayload = z.infer<typeof rtcAnswerPayloadSchema>

// Payload for rtc:ice
export const rtcIceCandidateInitSchema = z.object({
  candidate: z.string().min(1).max(2048),
  sdpMid: z.string().max(256).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(65535).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
})

export type RtcIceCandidateInit = z.infer<typeof rtcIceCandidateInitSchema>

export const rtcIcePayloadSchema = z.object({
  sessionId: z.string().min(1).max(128),
  candidate: rtcIceCandidateInitSchema,
})

export type RtcIcePayload = z.infer<typeof rtcIcePayloadSchema>

export interface RtcSignalingAckResponse {
  ok: boolean
  error?: {
    code: string
    message: string
  }
}

// Payload for media:state
export const mediaStatePayloadSchema = z.object({
  sessionId: z.string().min(1).max(128),
  isCamOff: z.boolean().optional(),
  isMicMuted: z.boolean().optional(),
})

export type MediaStatePayload = z.infer<typeof mediaStatePayloadSchema>

export interface MediaStateAckResponse {
  ok: boolean
  error?: {
    code: string
    message: string
  }
}

