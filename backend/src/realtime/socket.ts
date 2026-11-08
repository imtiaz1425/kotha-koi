import crypto from 'crypto'
import http from 'http'
import { Server, Socket } from 'socket.io'
import { Session, User, Profile } from '@prisma/client'
import { env } from '../config/env'
import { parseCookieHeader } from '../middleware/cookie-parser'
import { SessionService, SESSION_COOKIE_NAME } from '../services/session'
import { AppError } from '../errors/app-error'

import { MatchingService, ActiveMatch, MatchProposal } from '../services/matching'
import prisma from '../db'
import {
  type RtcRole,
  type RtcNegotiationState,
  type RtcOfferPayload,
  type RtcAnswerPayload,
  type RtcIcePayload,
  type RtcIceCandidateInit,
  type RtcSignalingAckResponse,
  rtcOfferPayloadSchema,
  rtcAnswerPayloadSchema,
  rtcIcePayloadSchema,
  type MediaStatePayload,
  mediaStatePayloadSchema,
  type MediaStateAckResponse,
} from '@kothakoi/shared'

export interface SocketData {
  userId: string
  user: User & { profile: Profile | null }
  sessionRecord: Session
}

export interface PartnerInfo {
  nickname: string
  avatarPreset?: string
}

export interface SessionStatePayload {
  state: 'IDLE' | 'QUEUED' | 'IN_CHAT'
  session?: {
    sessionId: string
    mode: 'text'
    partner: PartnerInfo
    self?: PartnerInfo
    rtcRole?: RtcRole
  }
}

export interface MatchFoundPayload {
  sessionId: string
  mode: 'text'
  partner: PartnerInfo
  self?: PartnerInfo
  rtcRole?: RtcRole
}

export interface QueueAckResponse {
  ok: boolean
  proposed?: boolean
  error?: {
    code: string
    message: string
    remainingSeconds?: number
  }
}

export interface ChatMessageClientPayload {
  sessionId: string
  clientMsgId: string
  text: string
}

export interface ChatMessageAckResponse {
  ok: boolean
  messageId?: string
  at?: string
  error?: {
    code: string
    message: string
  }
}

export interface ChatMessageServerPayload {
  sessionId: string
  messageId: string
  text: string
  at: string
}

export interface ChatTypingPayload {
  sessionId: string
  isTyping: boolean
}

export interface ChatEndedPayload {
  sessionId: string
  reason:
    | 'partner_skipped'
    | 'partner_left'
    | 'partner_disconnected'
    | 'you_ended'
    | 'moderation'
  cooldownSeconds?: number
}

export interface MatchProposedPayload {
  proposalId: string
  partner: PartnerInfo
  expiresInSeconds: number
}

export interface MatchCancelledPayload {
  proposalId: string
  reason: 'declined' | 'expired' | 'disconnected'
}

export interface ChatPartnerStatusPayload {
  sessionId: string
  status: 'reconnecting' | 'back'
}

export interface ChatSkipClientPayload {
  sessionId: string
  confirmMatch?: boolean
}

export interface ChatEndClientPayload {
  sessionId: string
}

export interface ChatLifecycleAckResponse {
  ok: boolean
  proposed?: boolean
  error?: {
    code: string
    message: string
  }
}

export interface ServerToClientEvents {
  'session:state': (payload: SessionStatePayload) => void
  'queue:waiting': () => void
  'match:proposed': (payload: MatchProposedPayload) => void
  'match:cancelled': (payload: MatchCancelledPayload) => void
  'match:found': (payload: MatchFoundPayload) => void
  'chat:message': (payload: ChatMessageServerPayload) => void
  'chat:typing': (payload: ChatTypingPayload) => void
  'chat:partner_status': (payload: ChatPartnerStatusPayload) => void
  'chat:ended': (payload: ChatEndedPayload) => void
  'online:count': (payload: { count: number }) => void
  'rtc:offer': (payload: RtcOfferPayload) => void
  'rtc:answer': (payload: RtcAnswerPayload) => void
  'rtc:ice': (payload: RtcIcePayload) => void
  'media:state': (payload: MediaStatePayload) => void
  error: (payload: { code: string; message: string; remainingSeconds?: number }) => void
}

export interface ClientToServerEvents {
  'queue:join': (
    payload?: {
      mode?: string
      nickname?: string
      avatarPreset?: string
      autoAccept?: boolean
      confirmMatch?: boolean
    },
    ack?: (response: QueueAckResponse) => void
  ) => void
  'queue:leave': (
    payload?: Record<string, unknown>,
    ack?: (response: QueueAckResponse) => void
  ) => void
  'match:accept': (
    payload: { proposalId: string },
    ack?: (response: {
      ok: boolean
      bothAccepted?: boolean
      error?: { code: string; message: string }
    }) => void
  ) => void
  'match:decline': (
    payload: { proposalId: string },
    ack?: (response: {
      ok: boolean
      error?: { code: string; message: string }
    }) => void
  ) => void
  'session:restore': (
    payload: { sessionId: string },
    ack?: (response: {
      ok: boolean
      error?: { code: string; message: string }
    }) => void
  ) => void
  'chat:message': (
    payload: ChatMessageClientPayload,
    ack?: (response: ChatMessageAckResponse) => void
  ) => void
  'chat:typing': (payload: ChatTypingPayload) => void
  'chat:skip': (
    payload: ChatSkipClientPayload,
    ack?: (response: ChatLifecycleAckResponse) => void
  ) => void
  'chat:end': (
    payload: ChatEndClientPayload,
    ack?: (response: ChatLifecycleAckResponse) => void
  ) => void
  'rtc:offer': (
    payload: RtcOfferPayload,
    ack?: (response: RtcSignalingAckResponse) => void
  ) => void
  'rtc:answer': (
    payload: RtcAnswerPayload,
    ack?: (response: RtcSignalingAckResponse) => void
  ) => void
  'rtc:ice': (
    payload: RtcIcePayload,
    ack?: (response: RtcSignalingAckResponse) => void
  ) => void
  'media:state': (
    payload: MediaStatePayload,
    ack?: (response: MediaStateAckResponse) => void
  ) => void
}

export type InterServerEvents = Record<string, never>

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

// Multi-device active sockets tracking:
// userId -> Set of socketIds
const userSockets = new Map<string, Set<string>>()
// socketId -> userId
const socketToUser = new Map<string, string>()
// socketId -> active sessionId
const socketActiveSessions = new Map<string, string>()
const lastTypingTimes = new Map<string, number>()

// WebRTC negotiation state tracking: sessionId -> RtcNegotiationState
const sessionRtcStates = new Map<string, RtcNegotiationState>()

// Buffer for ICE candidates that arrive from the offerer before rtc:offer
// is processed (while state is still 'IDLE'). They are flushed to the
// answerer's socket room as soon as HAVE_OFFER state is recorded.
const earlyIceCandidateBuffer = new Map<string, RtcIceCandidateInit[]>()

export function getSessionRtcState(
  sessionId: string
): RtcNegotiationState | undefined {
  return sessionRtcStates.get(sessionId)
}

export function clearSessionRtcStates(): void {
  sessionRtcStates.clear()
  earlyIceCandidateBuffer.clear()
  earlyIceCandidateBuffer.clear()
}

// Reconnection grace timers
const chatDisconnectTimers = new Map<string, NodeJS.Timeout>()
const queueDisconnectTimers = new Map<string, NodeJS.Timeout>()

let disconnectGracePeriodMs = 15000 // 15 seconds default

export function setDisconnectGracePeriodMs(ms: number): void {
  disconnectGracePeriodMs = ms
  if (ms < 1000) {
    MatchingService.setDisconnectCooldownDurationMs(0)
  }
}

export function getDisconnectGracePeriodMs(): number {
  return disconnectGracePeriodMs
}

export function clearDisconnectTimers(): void {
  for (const timer of chatDisconnectTimers.values()) {
    clearTimeout(timer)
  }
  chatDisconnectTimers.clear()

  for (const timer of queueDisconnectTimers.values()) {
    clearTimeout(timer)
  }
  queueDisconnectTimers.clear()
}

let ioInstance: TypedServer | null = null

export function getOnlineCount(): number {
  return userSockets.size
}

export function broadcastOnlineCount(io: TypedServer): void {
  io.emit('online:count', { count: userSockets.size })
}

export function notifyMatchFound(io: TypedServer, match: ActiveMatch): void {
  let socketA = io.sockets.sockets.get(match.userA.socketId)
  if (!socketA) {
    const activeSockId = getActiveSocketIdForUser(match.userA.userId)
    if (activeSockId) {
      socketA = io.sockets.sockets.get(activeSockId)
      if (socketA) {
        MatchingService.updateParticipantSocket(match.sessionId, match.userA.userId, socketA.id)
      }
    }
  }

  let socketB = io.sockets.sockets.get(match.userB.socketId)
  if (!socketB) {
    const activeSockId = getActiveSocketIdForUser(match.userB.userId)
    if (activeSockId) {
      socketB = io.sockets.sockets.get(activeSockId)
      if (socketB) {
        MatchingService.updateParticipantSocket(match.sessionId, match.userB.userId, socketB.id)
      }
    }
  }

  sessionRtcStates.set(match.sessionId, 'IDLE')
  earlyIceCandidateBuffer.delete(match.sessionId)

  if (socketA) {
    socketA.join(`chat:${match.sessionId}`)
    socketActiveSessions.set(socketA.id, match.sessionId)
    socketA.emit('match:found', {
      sessionId: match.sessionId,
      mode: 'text',
      partner: {
        nickname: match.userB.profile.nickname,
        avatarPreset: match.userB.profile.avatarPreset,
      },
      self: {
        nickname: match.userA.profile.nickname,
        avatarPreset: match.userA.profile.avatarPreset,
      },
      rtcRole: 'offerer',
    })
    socketA.emit('session:state', {
      state: 'IN_CHAT',
      session: {
        sessionId: match.sessionId,
        mode: 'text',
        partner: {
          nickname: match.userB.profile.nickname,
          avatarPreset: match.userB.profile.avatarPreset,
        },
        self: {
          nickname: match.userA.profile.nickname,
          avatarPreset: match.userA.profile.avatarPreset,
        },
        rtcRole: 'offerer',
      },
    })
  }

  if (socketB) {
    socketB.join(`chat:${match.sessionId}`)
    socketActiveSessions.set(socketB.id, match.sessionId)
    socketB.emit('match:found', {
      sessionId: match.sessionId,
      mode: 'text',
      partner: {
        nickname: match.userA.profile.nickname,
        avatarPreset: match.userA.profile.avatarPreset,
      },
      self: {
        nickname: match.userB.profile.nickname,
        avatarPreset: match.userB.profile.avatarPreset,
      },
      rtcRole: 'answerer',
    })
    socketB.emit('session:state', {
      state: 'IN_CHAT',
      session: {
        sessionId: match.sessionId,
        mode: 'text',
        partner: {
          nickname: match.userA.profile.nickname,
          avatarPreset: match.userA.profile.avatarPreset,
        },
        self: {
          nickname: match.userB.profile.nickname,
          avatarPreset: match.userB.profile.avatarPreset,
        },
        rtcRole: 'answerer',
      },
    })
  }
}

export function notifyProposalCreated(
  io: TypedServer,
  proposal: MatchProposal
): void {
  let socketA = io.sockets.sockets.get(proposal.userA.socketId)
  if (!socketA) {
    const activeSockId = getActiveSocketIdForUser(proposal.userA.userId)
    if (activeSockId) {
      socketA = io.sockets.sockets.get(activeSockId)
      if (socketA) {
        proposal.userA.socketId = socketA.id
      }
    }
  }

  let socketB = io.sockets.sockets.get(proposal.userB.socketId)
  if (!socketB) {
    const activeSockId = getActiveSocketIdForUser(proposal.userB.userId)
    if (activeSockId) {
      socketB = io.sockets.sockets.get(activeSockId)
      if (socketB) {
        proposal.userB.socketId = socketB.id
      }
    }
  }

  if (socketA) {
    socketA.emit('match:proposed', {
      proposalId: proposal.proposalId,
      partner: {
        nickname: proposal.userB.profile.nickname,
        avatarPreset: proposal.userB.profile.avatarPreset,
      },
      expiresInSeconds: 15,
    })
  }

  if (socketB) {
    socketB.emit('match:proposed', {
      proposalId: proposal.proposalId,
      partner: {
        nickname: proposal.userA.profile.nickname,
        avatarPreset: proposal.userA.profile.avatarPreset,
      },
      expiresInSeconds: 15,
    })
  }

  // Server-side 15-second expiry timer
  proposal.timer = setTimeout(() => {
    const cancelled = MatchingService.cancelProposal(
      proposal.proposalId,
      'expired'
    )
    if (cancelled) {
      const sA = io.sockets.sockets.get(cancelled.userA.socketId)
      const sB = io.sockets.sockets.get(cancelled.userB.socketId)
      if (
        sA &&
        MatchingService.getUserState(cancelled.userA.userId) === 'QUEUED'
      ) {
        sA.emit('match:cancelled', {
          proposalId: cancelled.proposalId,
          reason: 'expired',
        })
        sA.emit('session:state', { state: 'QUEUED' })
        sA.emit('queue:waiting')
      }

      if (
        sB &&
        MatchingService.getUserState(cancelled.userB.userId) === 'QUEUED'
      ) {
        sB.emit('match:cancelled', {
          proposalId: cancelled.proposalId,
          reason: 'expired',
        })
        sB.emit('session:state', { state: 'QUEUED' })
        sB.emit('queue:waiting')
      }
    }
  }, 15000)
}

export function initSocketServer(httpServer: http.Server): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    },
    maxHttpBufferSize: 1e6, // 1MB buffer cap
    transports: ['websocket', 'polling'],
  })

  // Handshake authentication middleware
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie
      const cookies = parseCookieHeader(cookieHeader)
      const rawToken = cookies[SESSION_COOKIE_NAME]

      if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Authentication required. Please log in.'
        )
      }

      const { session } = await SessionService.validateSession(rawToken)

      // Attach authenticated user information to socket.data
      socket.data.userId = session.user.id
      socket.data.user = session.user
      socket.data.sessionRecord = session

      next()
    } catch (err: unknown) {
      const appErr =
        err instanceof AppError
          ? err
          : new AppError(
              401,
              'UNAUTHENTICATED',
              err instanceof Error ? err.message : 'Authentication failed.'
            )

      const socketError = new Error(appErr.code) as Error & {
        data?: { code: string; message: string; statusCode: number }
      }
      socketError.data = {
        code: appErr.code,
        message: appErr.message,
        statusCode: appErr.statusCode,
      }

      next(socketError)
    }
  })

  // Connection handler
  io.on('connection', (socket: TypedSocket) => {
    const userId = socket.data.userId

    // Register socket in multi-socket mapping (safely handles multiple tabs/devices)
    let userSocketsSet = userSockets.get(userId)
    if (!userSocketsSet) {
      userSocketsSet = new Set()
      userSockets.set(userId, userSocketsSet)
    }
    userSocketsSet.add(socket.id)
    socketToUser.set(socket.id, userId)

    // Broadcast updated online count
    broadcastOnlineCount(io)

    // Reconnection & session synchronization
    const currentState = MatchingService.getUserState(userId)
    if (currentState === 'IN_CHAT') {
      const activeMatch = MatchingService.getActiveMatchForUser(userId)
      // Only restore automatically if a disconnect timer is currently running for this session
      // (meaning the user's previous active socket dropped and this socket is reconnecting)
      if (activeMatch && chatDisconnectTimers.has(activeMatch.sessionId)) {
        const pendingTimer = chatDisconnectTimers.get(activeMatch.sessionId)
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          chatDisconnectTimers.delete(activeMatch.sessionId)
        }

        socketActiveSessions.set(socket.id, activeMatch.sessionId)
        socket.join(`chat:${activeMatch.sessionId}`)

        MatchingService.updateParticipantSocket(
          activeMatch.sessionId,
          userId,
          socket.id
        )

        const isUserA = activeMatch.userA.userId === userId
        const partner = isUserA
          ? activeMatch.userB.profile
          : activeMatch.userA.profile
        const selfProfile = isUserA
          ? activeMatch.userA.profile
          : activeMatch.userB.profile

        socket.emit('session:state', {
          state: 'IN_CHAT',
          session: {
            sessionId: activeMatch.sessionId,
            mode: 'text',
            partner: {
              nickname: partner.nickname,
              avatarPreset: partner.avatarPreset,
            },
            self: {
              nickname: selfProfile.nickname,
              avatarPreset: selfProfile.avatarPreset,
            },
            rtcRole: isUserA ? 'offerer' : 'answerer',
          },
        })

        socket.to(`chat:${activeMatch.sessionId}`).emit('chat:partner_status', {
          sessionId: activeMatch.sessionId,
          status: 'back',
        })
      } else {
        // Another active device/tab is in chat, or session has ended. Start this socket as IDLE.
        socket.emit('session:state', { state: 'IDLE' })
      }
    } else if (currentState === 'QUEUED') {
      const pendingQueueTimer = queueDisconnectTimers.get(userId)
      if (pendingQueueTimer) {
        clearTimeout(pendingQueueTimer)
        queueDisconnectTimers.delete(userId)
        MatchingService.updateQueueSocket(userId, socket.id)
        socket.emit('session:state', { state: 'QUEUED' })
        socket.emit('queue:waiting')
      } else {
        socket.emit('session:state', { state: 'IDLE' })
      }
    } else {
      socket.emit('session:state', { state: 'IDLE' })
    }

    // ── Session Restoration ──────────────────────────────────────────

    socket.on('session:restore', (payload, ack) => {
      try {
        if (!payload || !payload.sessionId || typeof payload.sessionId !== 'string') {
          const err = { code: 'VALIDATION_FAILED', message: 'sessionId is required.' }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const match = MatchingService.getActiveMatch(payload.sessionId)
        if (!match || !MatchingService.isParticipant(payload.sessionId, userId)) {
          const err = { code: 'NOT_IN_SESSION', message: 'Chat session not found or you are not a participant.' }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('session:state', { state: 'IDLE' })
          return
        }

        const pendingTimer = chatDisconnectTimers.get(match.sessionId)
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          chatDisconnectTimers.delete(match.sessionId)
        }

        socketActiveSessions.set(socket.id, match.sessionId)
        socket.join(`chat:${match.sessionId}`)
        MatchingService.updateParticipantSocket(match.sessionId, userId, socket.id)

        const isUserA = match.userA.userId === userId
        const partner = isUserA ? match.userB.profile : match.userA.profile
        const selfProfile = isUserA ? match.userA.profile : match.userB.profile

        socket.emit('session:state', {
          state: 'IN_CHAT',
          session: {
            sessionId: match.sessionId,
            mode: 'text',
            partner: {
              nickname: partner.nickname,
              avatarPreset: partner.avatarPreset,
            },
            self: {
              nickname: selfProfile.nickname,
              avatarPreset: selfProfile.avatarPreset,
            },
            rtcRole: isUserA ? 'offerer' : 'answerer',
          },
        })

        socket.to(`chat:${match.sessionId}`).emit('chat:partner_status', {
          sessionId: match.sessionId,
          status: 'back',
        })

        if (typeof ack === 'function') ack({ ok: true })
      } catch (err: unknown) {
        const errPayload = {
          code: 'RESTORE_FAILED',
          message: err instanceof Error ? err.message : 'Failed to restore session.',
        }
        if (typeof ack === 'function') ack({ ok: false, error: errPayload })
        socket.emit('error', errPayload)
      }
    })

    // ── Matching Queue Events ──────────────────────────────────────────

    // queue:join
    socket.on('queue:join', async (payload, ack) => {
      try {
        let nickname =
          typeof payload?.nickname === 'string' ? payload.nickname.trim() : ''
        if (nickname.length < 2 || nickname.length > 20) {
          const dbProfile = await prisma.profile.findUnique({
            where: { userId },
          })
          nickname =
            dbProfile?.currentNickname ||
            socket.data.user.profile?.currentNickname ||
            'UIU Student'
        }

        const avatarPreset =
          (typeof payload?.avatarPreset === 'string' &&
            payload.avatarPreset.trim()) ||
          socket.data.user.profile?.avatarPreset ||
          'mango'

        const result = await MatchingService.joinQueue({
          userId,
          socketId: socket.id,
          mode: payload?.mode,
          profile: { nickname, avatarPreset },
          autoAccept: payload?.autoAccept,
          confirmMatch: payload?.confirmMatch,
        })

        if (!result.ok) {
          if (typeof ack === 'function') {
            ack({ ok: false, error: result.error })
          }
          socket.emit('error', result.error)
          return
        }

        if (typeof ack === 'function') {
          ack({ ok: true, proposed: result.proposed })
        }

        if (result.matched && result.match) {
          notifyMatchFound(io, result.match)
        } else if (result.proposed && result.proposal) {
          notifyProposalCreated(io, result.proposal)
        } else {
          // User placed in waiting queue
          if (MatchingService.getUserState(userId) === 'QUEUED') {
            socket.emit('queue:waiting')
            socket.emit('session:state', { state: 'QUEUED' })
          }
        }
      } catch (err: unknown) {
        const errorPayload = {
          code: 'MATCHING_ERROR',
          message:
            err instanceof Error
              ? err.message
              : 'An unexpected matching error occurred.',
        }
        if (typeof ack === 'function') {
          ack({ ok: false, error: errorPayload })
        }
        socket.emit('error', errorPayload)
      }
    })

    // match:accept
    socket.on('match:accept', async (payload, ack) => {
      try {
        if (!payload || !payload.proposalId || typeof payload.proposalId !== 'string') {
          const err = { code: 'VALIDATION_FAILED', message: 'proposalId is required.' }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (MatchingService.getUserState(userId) === 'IN_CHAT') {
          const err = { code: 'ALREADY_IN_CHAT', message: 'You are currently in an active chat session.' }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const proposal = MatchingService.getProposal(payload.proposalId)
        if (!proposal) {
          const err = { code: 'PROPOSAL_NOT_FOUND', message: 'Match proposal has expired or does not exist.' }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const res = await MatchingService.acceptProposal(payload.proposalId, userId)
        if (typeof ack === 'function') {
          ack({ ok: true, bothAccepted: res.bothAccepted })
        }

        if (res.bothAccepted && res.match) {
          notifyMatchFound(io, res.match)
        }
      } catch (err: unknown) {
        const errPayload = {
          code: 'ACCEPT_FAILED',
          message: err instanceof Error ? err.message : 'Failed to accept match proposal.',
        }
        if (typeof ack === 'function') ack({ ok: false, error: errPayload })
        socket.emit('error', errPayload)
      }
    })

    // match:decline
    socket.on('match:decline', (payload, ack) => {
      try {
        if (!payload || !payload.proposalId || typeof payload.proposalId !== 'string') {
          const err = { code: 'VALIDATION_FAILED', message: 'proposalId is required.' }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const cancelled = MatchingService.cancelProposal(
          payload.proposalId,
          'declined',
          userId
        )

        if (typeof ack === 'function') {
          ack({ ok: true })
        }

        if (cancelled) {
          const sA = io.sockets.sockets.get(cancelled.userA.socketId)
          const sB = io.sockets.sockets.get(cancelled.userB.socketId)
          if (sA && MatchingService.getUserState(cancelled.userA.userId) === 'QUEUED') {
            sA.emit('match:cancelled', {
              proposalId: cancelled.proposalId,
              reason: 'declined',
            })
            sA.emit('session:state', { state: 'QUEUED' })
            sA.emit('queue:waiting')
          }

          if (sB && MatchingService.getUserState(cancelled.userB.userId) === 'QUEUED') {
            sB.emit('match:cancelled', {
              proposalId: cancelled.proposalId,
              reason: 'declined',
            })
            sB.emit('session:state', { state: 'QUEUED' })
            sB.emit('queue:waiting')
          }
        }
      } catch (err: unknown) {
        const errPayload = {
          code: 'DECLINE_FAILED',
          message: err instanceof Error ? err.message : 'Failed to decline match proposal.',
        }
        if (typeof ack === 'function') ack({ ok: false, error: errPayload })
        socket.emit('error', errPayload)
      }
    })

    // queue:leave
    socket.on('queue:leave', (_payload, ack) => {
      const pendingQueueTimer = queueDisconnectTimers.get(userId)
      if (pendingQueueTimer) {
        clearTimeout(pendingQueueTimer)
        queueDisconnectTimers.delete(userId)
      }
      MatchingService.leaveQueue(userId)
      socket.emit('session:state', { state: 'IDLE' })
      if (typeof ack === 'function') {
        ack({ ok: true })
      }
    })

    // ── Real-Time Chat Events ──────────────────────────────────────────

    // chat:message
    socket.on('chat:message', (payload, ack) => {
      try {
        if (!payload || typeof payload !== 'object') {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'Invalid message payload.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const { sessionId, clientMsgId, text } = payload

        if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'sessionId is required.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (
          !clientMsgId ||
          typeof clientMsgId !== 'string' ||
          !clientMsgId.trim()
        ) {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'clientMsgId is required.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (typeof text !== 'string') {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'Message text must be a string.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const trimmedText = text.trim()
        if (trimmedText.length === 0 || trimmedText.length > 1000) {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'Message text must be between 1 and 1000 characters.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const match = MatchingService.getActiveMatch(sessionId)
        if (!match) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Active chat session not found or has ended.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (!MatchingService.isParticipant(sessionId, userId)) {
          const err = {
            code: 'FORBIDDEN',
            message: 'You are not a participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // Validate socket active session (prevents other tabs/devices from sending messages into this session)
        if (socketActiveSessions.get(socket.id) !== sessionId) {
          const err = {
            code: 'FORBIDDEN',
            message: 'This socket is not an active participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const partner = MatchingService.getPartner(sessionId, userId)
        if (!partner) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Partner not found in chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const messageId = crypto.randomUUID()
        const at = new Date().toISOString()

        // Strict chat isolation: emit ONLY to the other participant in this specific chat room
        socket.to(`chat:${sessionId}`).emit('chat:message', {
          sessionId,
          messageId,
          text: trimmedText,
          at,
        })

        if (typeof ack === 'function') {
          ack({ ok: true, messageId, at })
        }
      } catch (err: unknown) {
        const errorPayload = {
          code: 'MESSAGE_SEND_FAILED',
          message:
            err instanceof Error ? err.message : 'Failed to send message.',
        }
        if (typeof ack === 'function') {
          ack({ ok: false, error: errorPayload })
        }
        socket.emit('error', errorPayload)
      }
    })

    // chat:typing
    socket.on('chat:typing', (payload) => {
      try {
        if (
          !payload ||
          !payload.sessionId ||
          typeof payload.sessionId !== 'string'
        ) {
          return
        }

        const { sessionId, isTyping } = payload

        if (
          !MatchingService.isParticipant(sessionId, userId) ||
          socketActiveSessions.get(socket.id) !== sessionId
        ) {
          return
        }

        // Throttle to 1 event per second per user
        const now = Date.now()
        const lastTime = lastTypingTimes.get(userId) || 0
        if (now - lastTime < 1000) {
          return
        }
        lastTypingTimes.set(userId, now)

        // Strict chat isolation: emit typing ONLY to the other participant in this room
        socket.to(`chat:${sessionId}`).emit('chat:typing', {
          sessionId,
          isTyping: Boolean(isTyping),
        })
      } catch {
        // Silently ignore typing error
      }
    })

    // ── WebRTC Signaling Events ────────────────────────────────────────

    // rtc:offer
    socket.on('rtc:offer', (payload, ack) => {
      try {
        const parseResult = rtcOfferPayloadSchema.safeParse(payload)
        if (!parseResult.success) {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'Invalid RTC offer payload.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const { sessionId, sdp, type } = parseResult.data

        const match = MatchingService.getActiveMatch(sessionId)
        if (!match) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Active chat session not found or has ended.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (!MatchingService.isParticipant(sessionId, userId)) {
          const err = {
            code: 'FORBIDDEN',
            message: 'You are not a participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (socketActiveSessions.get(socket.id) !== sessionId) {
          const err = {
            code: 'FORBIDDEN',
            message:
              'This socket is not an active participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // Role check: Only the designated offerer can initiate an offer
        const role = MatchingService.getParticipantRtcRole(sessionId, userId)
        if (role !== 'offerer') {
          const err = {
            code: 'ROLE_MISMATCH',
            message: 'Only the offerer can send an offer.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // State check: Cannot send offer if one is already pending
        const currentState = sessionRtcStates.get(sessionId) || 'IDLE'
        if (currentState === 'HAVE_OFFER') {
          const err = {
            code: 'INVALID_STATE',
            message: 'An offer is already pending for this session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        sessionRtcStates.set(sessionId, 'HAVE_OFFER')

        // Relay strictly to the partner in the isolated chat room
        socket.to(`chat:${sessionId}`).emit('rtc:offer', {
          sessionId,
          sdp,
          type: type || 'offer',
        })

        // Flush any early buffered ICE candidates that were collected while state was IDLE
        const bufferedCandidates = earlyIceCandidateBuffer.get(sessionId)
        if (bufferedCandidates && bufferedCandidates.length > 0) {
          earlyIceCandidateBuffer.delete(sessionId)
          for (const cand of bufferedCandidates) {
            socket.to(`chat:${sessionId}`).emit('rtc:ice', {
              sessionId,
              candidate: cand,
            })
          }
        } else {
          earlyIceCandidateBuffer.delete(sessionId)
        }

        if (typeof ack === 'function') {
          ack({ ok: true })
        }
      } catch {
        const errorPayload = {
          code: 'INTERNAL',
          message: 'Failed to process RTC offer.',
        }
        if (typeof ack === 'function') ack({ ok: false, error: errorPayload })
        socket.emit('error', errorPayload)
      }
    })

    // rtc:answer
    socket.on('rtc:answer', (payload, ack) => {
      try {
        const parseResult = rtcAnswerPayloadSchema.safeParse(payload)
        if (!parseResult.success) {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'Invalid RTC answer payload.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const { sessionId, sdp, type } = parseResult.data

        const match = MatchingService.getActiveMatch(sessionId)
        if (!match) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Active chat session not found or has ended.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (!MatchingService.isParticipant(sessionId, userId)) {
          const err = {
            code: 'FORBIDDEN',
            message: 'You are not a participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (socketActiveSessions.get(socket.id) !== sessionId) {
          const err = {
            code: 'FORBIDDEN',
            message:
              'This socket is not an active participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // Role check: Only the designated answerer can send an answer
        const role = MatchingService.getParticipantRtcRole(sessionId, userId)
        if (role !== 'answerer') {
          const err = {
            code: 'ROLE_MISMATCH',
            message: 'Only the answerer can send an answer.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // State check: Must be in HAVE_OFFER state to answer
        const currentState = sessionRtcStates.get(sessionId) || 'IDLE'
        if (currentState !== 'HAVE_OFFER') {
          const err = {
            code: 'INVALID_STATE',
            message:
              currentState === 'IDLE'
                ? 'Cannot answer before an offer has been made.'
                : 'Session is already in stable state.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        sessionRtcStates.set(sessionId, 'STABLE')

        // Relay strictly to the partner in the isolated chat room
        socket.to(`chat:${sessionId}`).emit('rtc:answer', {
          sessionId,
          sdp,
          type: type || 'answer',
        })

        if (typeof ack === 'function') {
          ack({ ok: true })
        }
      } catch {
        const errorPayload = {
          code: 'INTERNAL',
          message: 'Failed to process RTC answer.',
        }
        if (typeof ack === 'function') ack({ ok: false, error: errorPayload })
        socket.emit('error', errorPayload)
      }
    })

    // rtc:ice
    socket.on('rtc:ice', (payload, ack) => {
      try {
        const parseResult = rtcIcePayloadSchema.safeParse(payload)
        if (!parseResult.success) {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'Invalid RTC ICE candidate payload.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const { sessionId, candidate } = parseResult.data

        const match = MatchingService.getActiveMatch(sessionId)
        if (!match) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Active chat session not found or has ended.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (!MatchingService.isParticipant(sessionId, userId)) {
          const err = {
            code: 'FORBIDDEN',
            message: 'You are not a participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (socketActiveSessions.get(socket.id) !== sessionId) {
          const err = {
            code: 'FORBIDDEN',
            message:
              'This socket is not an active participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // Role check: Participant must have an assigned role (not silently allowed)
        const role = MatchingService.getParticipantRtcRole(sessionId, userId)
        if (!role) {
          const err = {
            code: 'ROLE_MISMATCH',
            message: 'User does not have an assigned WebRTC role.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // State check: Negotiation must have begun (state must be HAVE_OFFER or STABLE)
        const currentState = sessionRtcStates.get(sessionId) || 'IDLE'
        if (currentState === 'IDLE') {
          // Offerer may gather host/reflexive candidates immediately upon setLocalDescription,
          // before rtc:offer reaches the backend. Buffer them safely so direct LAN connectivity is preserved.
          if (role === 'offerer') {
            let buffer = earlyIceCandidateBuffer.get(sessionId)
            if (!buffer) {
              buffer = []
              earlyIceCandidateBuffer.set(sessionId, buffer)
            }
            if (buffer.length < 50) {
              buffer.push(candidate)
            }
          }

          const err = {
            code: 'INVALID_STATE',
            message:
              'Cannot exchange ICE candidates before an offer has been made.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // Relay strictly to the partner in the isolated chat room
        socket.to(`chat:${sessionId}`).emit('rtc:ice', {
          sessionId,
          candidate,
        })

        if (typeof ack === 'function') {
          ack({ ok: true })
        }
      } catch {
        const errorPayload = {
          code: 'INTERNAL',
          message: 'Failed to process RTC ICE candidate.',
        }
        if (typeof ack === 'function') ack({ ok: false, error: errorPayload })
        socket.emit('error', errorPayload)
      }
    })

    // media:state
    socket.on('media:state', (payload, ack) => {
      try {
        const parseResult = mediaStatePayloadSchema.safeParse(payload)
        if (!parseResult.success) {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'Invalid media state payload.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const { sessionId, isCamOff, isMicMuted } = parseResult.data

        const match = MatchingService.getActiveMatch(sessionId)
        if (!match) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Active chat session not found or has ended.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (!MatchingService.isParticipant(sessionId, userId)) {
          const err = {
            code: 'FORBIDDEN',
            message: 'You are not a participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (socketActiveSessions.get(socket.id) !== sessionId) {
          const err = {
            code: 'FORBIDDEN',
            message:
              'This socket is not an active participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // Relay strictly to the partner in the isolated chat room
        socket.to(`chat:${sessionId}`).emit('media:state', {
          sessionId,
          isCamOff,
          isMicMuted,
        })

        if (typeof ack === 'function') {
          ack({ ok: true })
        }
      } catch {
        const errorPayload = {
          code: 'INTERNAL',
          message: 'Failed to process media state update.',
        }
        if (typeof ack === 'function') ack({ ok: false, error: errorPayload })
        socket.emit('error', errorPayload)
      }
    })

    // chat:skip
    socket.on('chat:skip', async (payload, ack) => {
      try {
        if (
          !payload ||
          !payload.sessionId ||
          typeof payload.sessionId !== 'string' ||
          !payload.sessionId.trim()
        ) {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'sessionId is required.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const { sessionId } = payload

        const match = MatchingService.getActiveMatch(sessionId)
        if (!match) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Active chat session not found or has ended.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (!MatchingService.isParticipant(sessionId, userId)) {
          const err = {
            code: 'FORBIDDEN',
            message: 'You are not a participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const partner = MatchingService.getPartner(sessionId, userId)
        const pendingTimer = chatDisconnectTimers.get(sessionId)
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          chatDisconnectTimers.delete(sessionId)
        }

        socketActiveSessions.delete(socket.id)
        sessionRtcStates.delete(sessionId)
        earlyIceCandidateBuffer.delete(sessionId)
        socket.leave(`chat:${sessionId}`)

        const endedMatch = await MatchingService.endMatch(
          sessionId,
          'SKIP',
          userId
        )
        if (!endedMatch) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Active chat session not found or has ended.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        // Notify partner that session ended because initiator skipped
        if (partner) {
          let partnerSocket = io.sockets.sockets.get(partner.socketId)
          if (!partnerSocket) {
            const activeSockId = getActiveSocketIdForUser(partner.userId)
            if (activeSockId) partnerSocket = io.sockets.sockets.get(activeSockId)
          }
          if (partnerSocket) {
            socketActiveSessions.delete(partnerSocket.id)
            partnerSocket.leave(`chat:${sessionId}`)
            partnerSocket.emit('chat:ended', {
              sessionId,
              reason: 'partner_skipped',
              cooldownSeconds: 10,
            })
            partnerSocket.emit('session:state', {
              state: 'IDLE',
            })
          }
        }

        // Notify initiator that previous session ended (skipper gets NO cooldown)
        socket.emit('chat:ended', {
          sessionId,
          reason: 'you_ended',
          cooldownSeconds: 0,
        })

        // Re-queue initiator immediately into matchmaking
        const nickname =
          socket.data.user.profile?.currentNickname || 'UIU Student'
        const avatarPreset =
          socket.data.user.profile?.avatarPreset || 'mango'

        const joinResult = await MatchingService.joinQueue({
          userId,
          socketId: socket.id,
          mode: 'text',
          confirmMatch: Boolean(payload?.confirmMatch),
          profile: {
            nickname,
            avatarPreset,
          },
        })

        if (!joinResult.ok) {
          if (typeof ack === 'function') {
            ack({ ok: false, error: joinResult.error })
          }
          socket.emit('error', joinResult.error)
          return
        }

        if (typeof ack === 'function') {
          ack({ ok: true, proposed: joinResult.proposed })
        }

        if (joinResult.matched && joinResult.match) {
          notifyMatchFound(io, joinResult.match)
        } else if (joinResult.proposed && joinResult.proposal) {
          notifyProposalCreated(io, joinResult.proposal)
        } else {
          socket.emit('queue:waiting')
          socket.emit('session:state', { state: 'QUEUED' })
        }
      } catch (err: unknown) {
        const errorPayload = {
          code: 'SKIP_FAILED',
          message:
            err instanceof Error ? err.message : 'Failed to skip chat session.',
        }
        if (typeof ack === 'function') {
          ack({ ok: false, error: errorPayload })
        }
        socket.emit('error', errorPayload)
      }
    })

    // chat:end
    socket.on('chat:end', async (payload, ack) => {
      try {
        if (
          !payload ||
          !payload.sessionId ||
          typeof payload.sessionId !== 'string' ||
          !payload.sessionId.trim()
        ) {
          const err = {
            code: 'VALIDATION_FAILED',
            message: 'sessionId is required.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const { sessionId } = payload

        const match = MatchingService.getActiveMatch(sessionId)
        if (!match) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Active chat session not found or has ended.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (!MatchingService.isParticipant(sessionId, userId)) {
          const err = {
            code: 'FORBIDDEN',
            message: 'You are not a participant in this chat session.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        const partner = MatchingService.getPartner(sessionId, userId)
        const pendingTimer = chatDisconnectTimers.get(sessionId)
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          chatDisconnectTimers.delete(sessionId)
        }

        socketActiveSessions.delete(socket.id)
        sessionRtcStates.delete(sessionId)
        earlyIceCandidateBuffer.delete(sessionId)
        socket.leave(`chat:${sessionId}`)

        const endedMatch = await MatchingService.endMatch(
          sessionId,
          'END',
          userId
        )
        if (!endedMatch) {
          const err = {
            code: 'NOT_IN_SESSION',
            message: 'Active chat session not found or has ended.',
          }
          if (typeof ack === 'function') ack({ ok: false, error: err })
          socket.emit('error', err)
          return
        }

        if (typeof ack === 'function') {
          ack({ ok: true })
        }

        // Notify partner that session ended cleanly
        if (partner) {
          let partnerSocket = io.sockets.sockets.get(partner.socketId)
          if (!partnerSocket) {
            const activeSockId = getActiveSocketIdForUser(partner.userId)
            if (activeSockId) partnerSocket = io.sockets.sockets.get(activeSockId)
          }
          if (partnerSocket) {
            socketActiveSessions.delete(partnerSocket.id)
            partnerSocket.leave(`chat:${sessionId}`)
            partnerSocket.emit('chat:ended', {
              sessionId,
              reason: 'partner_left',
              cooldownSeconds: 10,
            })
            partnerSocket.emit('session:state', {
              state: 'IDLE',
            })
          }
        }

        // Notify initiator that session ended cleanly
        socket.emit('chat:ended', {
          sessionId,
          reason: 'you_ended',
          cooldownSeconds: 10,
        })
        socket.emit('session:state', {
          state: 'IDLE',
        })
      } catch (err: unknown) {
        const errorPayload = {
          code: 'END_FAILED',
          message:
            err instanceof Error ? err.message : 'Failed to end chat session.',
        }
        if (typeof ack === 'function') {
          ack({ ok: false, error: errorPayload })
        }
        socket.emit('error', errorPayload)
      }
    })

    // Clean up on disconnect
    socket.on('disconnect', () => {
      // Remove from userSockets and socketToUser
      const userSocketsSet = userSockets.get(userId)
      if (userSocketsSet) {
        userSocketsSet.delete(socket.id)
        if (userSocketsSet.size === 0) {
          userSockets.delete(userId)
        }
      }
      socketToUser.delete(socket.id)
      const currentActiveSessionId = socketActiveSessions.get(socket.id)
      socketActiveSessions.delete(socket.id)

      // Broadcast updated online count to remaining clients
      broadcastOnlineCount(io)

      // If user was in PROPOSED state on this socket, cancel proposal
      const proposal = MatchingService.getProposalForUser(userId)
      if (
        proposal &&
        (proposal.userA.socketId === socket.id || proposal.userB.socketId === socket.id)
      ) {
        const cancelled = MatchingService.cancelProposal(
          proposal.proposalId,
          'disconnected',
          userId
        )
        if (cancelled) {
          const remainingUserId =
            cancelled.userA.userId === userId
              ? cancelled.userB.userId
              : cancelled.userA.userId
          const remainingSocketId =
            cancelled.userA.userId === userId
              ? cancelled.userB.socketId
              : cancelled.userA.socketId
          const remainingSocket = io.sockets.sockets.get(remainingSocketId)
          remainingSocket?.emit('match:cancelled', {
            proposalId: cancelled.proposalId,
            reason: 'disconnected',
          })
          if (MatchingService.getUserState(remainingUserId) === 'QUEUED') {
            remainingSocket?.emit('session:state', { state: 'QUEUED' })
            remainingSocket?.emit('queue:waiting')
          }
        }
      }

      // Check if this socket was the active participant in an active chat
      if (currentActiveSessionId) {
        const activeMatch = MatchingService.getActiveMatch(currentActiveSessionId)
        if (
          activeMatch &&
          MatchingService.isParticipant(currentActiveSessionId, userId)
        ) {
          // Check if this user still has another active socket in this session (e.g. multi-tab or reconnected socket)
          const remainingUserSockets = userSockets.get(userId)
          let hasOtherActiveSocketForSession = false
          if (remainingUserSockets) {
            for (const sockId of remainingUserSockets) {
              if (socketActiveSessions.get(sockId) === currentActiveSessionId) {
                hasOtherActiveSocketForSession = true
                break
              }
            }
          }
          if (hasOtherActiveSocketForSession) {
            // User is still active in this session on another socket/tab; do not trigger disconnect grace
            return
          }

          const existingTimer = chatDisconnectTimers.get(activeMatch.sessionId)
          if (existingTimer) {
            clearTimeout(existingTimer)
          }

          const partner = MatchingService.getPartner(
            activeMatch.sessionId,
            userId
          )

          // Notify partner that user disconnected and is attempting to reconnect
          if (partner) {
            socket.to(`chat:${activeMatch.sessionId}`).emit('chat:partner_status', {
              sessionId: activeMatch.sessionId,
              status: 'reconnecting',
            })
          }

          // Start grace timer
          const timer = setTimeout(async () => {
            chatDisconnectTimers.delete(activeMatch.sessionId)

            // Grace period expired without reconnect!
            const currentMatch = MatchingService.getActiveMatch(activeMatch.sessionId)
            if (!currentMatch) return

            const endedMatch = await MatchingService.endMatch(
              activeMatch.sessionId,
              'DISCONNECT_TIMEOUT',
              userId
            )
            sessionRtcStates.delete(activeMatch.sessionId)
            earlyIceCandidateBuffer.delete(activeMatch.sessionId)

            if (endedMatch && partner) {
              let partnerSocket = io.sockets.sockets.get(partner.socketId)
              if (!partnerSocket) {
                const activeSockId = getActiveSocketIdForUser(partner.userId)
                if (activeSockId) partnerSocket = io.sockets.sockets.get(activeSockId)
              }
              if (partnerSocket) {
                socketActiveSessions.delete(partnerSocket.id)
                partnerSocket.leave(`chat:${activeMatch.sessionId}`)
                partnerSocket.emit('chat:ended', {
                  sessionId: activeMatch.sessionId,
                  reason: 'partner_disconnected',
                  cooldownSeconds: 10,
                })
                partnerSocket.emit('session:state', {
                  state: 'IDLE',
                })
              }
            }
          }, disconnectGracePeriodMs)

          chatDisconnectTimers.set(activeMatch.sessionId, timer)
          return
        }
      }

      // If queued with this socket
      if (MatchingService.getUserState(userId) === 'QUEUED') {
        const queueEntry = MatchingService.getQueueEntry(userId)
        if (queueEntry && queueEntry.socketId === socket.id) {
          const existingQueueTimer = queueDisconnectTimers.get(userId)
          if (existingQueueTimer) {
            clearTimeout(existingQueueTimer)
          }

          const queueTimer = setTimeout(() => {
            queueDisconnectTimers.delete(userId)
            MatchingService.leaveQueue(userId)
          }, disconnectGracePeriodMs)

          queueDisconnectTimers.set(userId, queueTimer)
        }
      }
    })
  })

  ioInstance = io
  return io
}

export function getSocketServer(): TypedServer | null {
  return ioInstance
}

export function getActiveSocketIdForUser(userId: string): string | undefined {
  const sockets = userSockets.get(userId)
  if (!sockets || sockets.size === 0) return undefined
  return Array.from(sockets)[sockets.size - 1]
}

export function clearActiveSockets(): void {
  userSockets.clear()
  socketToUser.clear()
  socketActiveSessions.clear()
  sessionRtcStates.clear()
  earlyIceCandidateBuffer.clear()
  lastTypingTimes.clear()
  clearDisconnectTimers()
  disconnectGracePeriodMs = 15000
  MatchingService.setDisconnectCooldownDurationMs(10000)
}
