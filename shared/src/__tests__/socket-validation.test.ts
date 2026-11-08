import { describe, it, expect } from 'vitest'
import {
  rtcRoleSchema,
  rtcNegotiationStateSchema,
  rtcOfferPayloadSchema,
  rtcAnswerPayloadSchema,
  rtcIcePayloadSchema,
  mediaStatePayloadSchema,
} from '../index'

describe('shared contracts: socket signaling schemas', () => {
  describe('rtcRoleSchema', () => {
    it('accepts valid roles', () => {
      expect(rtcRoleSchema.parse('offerer')).toBe('offerer')
      expect(rtcRoleSchema.parse('answerer')).toBe('answerer')
    })

    it('rejects invalid roles', () => {
      expect(() => rtcRoleSchema.parse('invalid')).toThrow()
      expect(() => rtcRoleSchema.parse('')).toThrow()
    })
  })

  describe('rtcNegotiationStateSchema', () => {
    it('accepts valid negotiation states', () => {
      expect(rtcNegotiationStateSchema.parse('IDLE')).toBe('IDLE')
      expect(rtcNegotiationStateSchema.parse('HAVE_OFFER')).toBe('HAVE_OFFER')
      expect(rtcNegotiationStateSchema.parse('STABLE')).toBe('STABLE')
    })
  })

  describe('rtcOfferPayloadSchema', () => {
    it('validates a conformant offer payload', () => {
      const valid = {
        sessionId: 'session-123',
        sdp: 'v=0\r\no=- 42 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
        type: 'offer' as const,
      }
      const result = rtcOfferPayloadSchema.safeParse(valid)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.sessionId).toBe('session-123')
        expect(result.data.type).toBe('offer')
      }
    })

    it('rejects empty or oversized SDP', () => {
      expect(
        rtcOfferPayloadSchema.safeParse({ sessionId: 'session-1', sdp: '' }).success
      ).toBe(false)

      const giantSdp = 'x'.repeat(70000)
      expect(
        rtcOfferPayloadSchema.safeParse({ sessionId: 'session-1', sdp: giantSdp }).success
      ).toBe(false)
    })

    it('rejects missing or empty sessionId', () => {
      expect(
        rtcOfferPayloadSchema.safeParse({ sessionId: '', sdp: 'valid-sdp' }).success
      ).toBe(false)
    })
  })

  describe('rtcAnswerPayloadSchema', () => {
    it('validates a conformant answer payload', () => {
      const valid = {
        sessionId: 'session-456',
        sdp: 'v=0\r\no=- 43 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
        type: 'answer' as const,
      }
      const result = rtcAnswerPayloadSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('rejects empty or oversized SDP', () => {
      expect(
        rtcAnswerPayloadSchema.safeParse({ sessionId: 'session-1', sdp: '' }).success
      ).toBe(false)

      const giantSdp = 'x'.repeat(70000)
      expect(
        rtcAnswerPayloadSchema.safeParse({ sessionId: 'session-1', sdp: giantSdp }).success
      ).toBe(false)
    })
  })

  describe('rtcIcePayloadSchema', () => {
    it('validates a conformant ICE payload', () => {
      const valid = {
        sessionId: 'session-789',
        candidate: {
          candidate: 'candidate:842163049 1 udp 1677729535 192.168.1.2 54321 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
          usernameFragment: 'ufrag1',
        },
      }
      const result = rtcIcePayloadSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('validates an ICE candidate with nullable sdpMid and sdpMLineIndex', () => {
      const valid = {
        sessionId: 'session-789',
        candidate: {
          candidate: 'candidate:842163049 1 udp 1677729535 192.168.1.2 54321 typ host',
          sdpMid: null,
          sdpMLineIndex: null,
        },
      }
      const result = rtcIcePayloadSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('rejects empty candidate or oversized strings', () => {
      expect(
        rtcIcePayloadSchema.safeParse({
          sessionId: 'session-789',
          candidate: {
            candidate: '',
          },
        }).success
      ).toBe(false)

      expect(
        rtcIcePayloadSchema.safeParse({
          sessionId: 'session-789',
          candidate: {
            candidate: 'c'.repeat(3000),
          },
        }).success
      ).toBe(false)
    })
  })

  describe('mediaStatePayloadSchema', () => {
    it('validates a valid media:state payload', () => {
      const valid = {
        sessionId: 'session-media-1',
        isCamOff: true,
        isMicMuted: false,
      }
      const result = mediaStatePayloadSchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('allows partial states (cam only or mic only)', () => {
      expect(mediaStatePayloadSchema.safeParse({ sessionId: 'session-1', isCamOff: true }).success).toBe(true)
      expect(mediaStatePayloadSchema.safeParse({ sessionId: 'session-1', isMicMuted: true }).success).toBe(true)
      expect(mediaStatePayloadSchema.safeParse({ sessionId: 'session-1' }).success).toBe(true)
    })

    it('rejects missing or empty sessionId', () => {
      expect(mediaStatePayloadSchema.safeParse({ isCamOff: true }).success).toBe(false)
      expect(mediaStatePayloadSchema.safeParse({ sessionId: '', isCamOff: true }).success).toBe(false)
    })
  })
})
