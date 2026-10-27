import crypto from 'crypto'
import http from 'http'
import { Server, Socket } from 'socket.io'
import { Session, User, Profile } from '@prisma/client'
import { env } from '../config/env'
import { parseCookieHeader } from '../middleware/cookie-parser'
import { SessionService, SESSION_COOKIE_NAME } from '../services/session'
import { AppError } from '../errors/app-error'

import { MatchingService, ActiveMatch } from '../services/matching'
import prisma from '../db'

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
  }
}

export interface MatchFoundPayload {
  sessionId: string
  mode: 'text'
  partner: PartnerInfo
  self?: PartnerInfo
}

export interface QueueAckResponse {
  ok: boolean
  error?: {
    code: string
    message: string
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
}

export interface ChatPartnerStatusPayload {
  sessionId: string
  status: 'reconnecting' | 'back'
}

export interface ChatSkipClientPayload {
  sessionId: string
}

export interface ChatEndClientPayload {
  sessionId: string
}

export interface ChatLifecycleAckResponse {
  ok: boolean
  error?: {
    code: string
    message: string
  }
}

export interface ServerToClientEvents {
  'session:state': (payload: SessionStatePayload) => void
  'queue:waiting': () => void
  'match:found': (payload: MatchFoundPayload) => void
  'chat:message': (payload: ChatMessageServerPayload) => void
  'chat:typing': (payload: ChatTypingPayload) => void
  'chat:partner_status': (payload: ChatPartnerStatusPayload) => void
  'chat:ended': (payload: ChatEndedPayload) => void
  'online:count': (payload: { count: number }) => void
  error: (payload: { code: string; message: string }) => void
}

export interface ClientToServerEvents {
  'queue:join': (
    payload?: { mode?: string; nickname?: string; avatarPreset?: string },
    ack?: (response: QueueAckResponse) => void
  ) => void
  'queue:leave': (
    payload?: Record<string, unknown>,
    ack?: (response: QueueAckResponse) => void
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

// Active sockets map: userId -> socketId (for newest-socket-wins policy)
const activeUserSockets = new Map<string, string>()
const lastTypingTimes = new Map<string, number>()

// Reconnection grace timers
const chatDisconnectTimers = new Map<string, NodeJS.Timeout>()
const queueDisconnectTimers = new Map<string, NodeJS.Timeout>()

let disconnectGracePeriodMs = 15000 // 15 seconds default

export function setDisconnectGracePeriodMs(ms: number): void {
  disconnectGracePeriodMs = ms
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
  return activeUserSockets.size
}

export function broadcastOnlineCount(io: TypedServer): void {
  io.emit('online:count', { count: activeUserSockets.size })
}

export function notifyMatchFound(io: TypedServer, match: ActiveMatch): void {
  const socketA = io.sockets.sockets.get(match.userA.socketId)
  const socketB = io.sockets.sockets.get(match.userB.socketId)

  if (socketA) {
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
      },
    })
  }

  if (socketB) {
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
      },
    })
  }
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

    // Newest-socket-wins concurrency policy (OD-14 / TASK-RT-01)
    const existingSocketId = activeUserSockets.get(userId)
    activeUserSockets.set(userId, socket.id)

    // Broadcast real-time online count to all connected clients
    broadcastOnlineCount(io)

    if (existingSocketId && existingSocketId !== socket.id) {
      const prevSocket = io.sockets.sockets.get(existingSocketId)
      if (prevSocket) {
        prevSocket.emit('error', {
          code: 'SESSION_REPLACED',
          message: 'A new session was started in another tab or window.',
        })
        prevSocket.disconnect(true)
      }
    }

    // Reconnection & session synchronization
    const currentState = MatchingService.getUserState(userId)
    if (currentState === 'IN_CHAT') {
      const activeMatch = MatchingService.getActiveMatchForUser(userId)
      if (activeMatch) {
        // Cancel pending disconnect timer for this session
        const pendingTimer = chatDisconnectTimers.get(activeMatch.sessionId)
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          chatDisconnectTimers.delete(activeMatch.sessionId)
        }

        // Update participant socket ID to current active socket
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
          },
        })

        // Notify partner that user has reconnected and is back
        const partnerParticipant = MatchingService.getPartner(
          activeMatch.sessionId,
          userId
        )
        if (partnerParticipant) {
          const partnerSocket = io.sockets.sockets.get(
            partnerParticipant.socketId
          )
          if (partnerSocket) {
            partnerSocket.emit('chat:partner_status', {
              sessionId: activeMatch.sessionId,
              status: 'back',
            })
          }
        }
      } else {
        socket.emit('session:state', { state: 'IDLE' })
      }
    } else if (currentState === 'QUEUED') {
      // Cancel pending queue disconnect timer
      const pendingQueueTimer = queueDisconnectTimers.get(userId)
      if (pendingQueueTimer) {
        clearTimeout(pendingQueueTimer)
        queueDisconnectTimers.delete(userId)
      }

      // Update queue entry with new socket ID
      MatchingService.updateQueueSocket(userId, socket.id)

      socket.emit('session:state', { state: 'QUEUED' })
      socket.emit('queue:waiting')
    } else {
      socket.emit('session:state', { state: 'IDLE' })
    }

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
        })

        if (!result.ok) {
          if (typeof ack === 'function') {
            ack({ ok: false, error: result.error })
          }
          socket.emit('error', result.error)
          return
        }

        if (typeof ack === 'function') {
          ack({ ok: true })
        }

        if (result.matched && result.match) {
          notifyMatchFound(io, result.match)
        } else {
          // User placed in waiting queue
          socket.emit('queue:waiting')
          socket.emit('session:state', { state: 'QUEUED' })
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

        const partnerSocket = io.sockets.sockets.get(partner.socketId)
        if (partnerSocket) {
          partnerSocket.emit('chat:message', {
            sessionId,
            messageId,
            text: trimmedText,
            at,
          })
        }

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

        if (!MatchingService.isParticipant(sessionId, userId)) {
          return
        }

        // Throttle to 1 event per second per user
        const now = Date.now()
        const lastTime = lastTypingTimes.get(userId) || 0
        if (now - lastTime < 1000) {
          return
        }
        lastTypingTimes.set(userId, now)

        const partner = MatchingService.getPartner(sessionId, userId)
        if (partner) {
          const partnerSocket = io.sockets.sockets.get(partner.socketId)
          partnerSocket?.emit('chat:typing', {
            sessionId,
            isTyping: Boolean(isTyping),
          })
        }
      } catch {
        // Silently ignore typing error
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
          const partnerSocket = io.sockets.sockets.get(partner.socketId)
          if (partnerSocket) {
            partnerSocket.emit('chat:ended', {
              sessionId,
              reason: 'partner_skipped',
            })
            partnerSocket.emit('session:state', {
              state: 'IDLE',
            })
          }
        }

        // Notify initiator that previous session ended
        socket.emit('chat:ended', {
          sessionId,
          reason: 'you_ended',
        })

        // Re-queue initiator immediately into matchmaking
        const joinResult = await MatchingService.joinQueue({
          userId,
          socketId: socket.id,
          mode: 'text',
          profile: {
            nickname:
              socket.data.user.profile?.currentNickname || 'UIU Student',
            avatarPreset: socket.data.user.profile?.avatarPreset || 'mango',
          },
        })

        if (joinResult.ok) {
          if (joinResult.matched && joinResult.match) {
            notifyMatchFound(io, joinResult.match)
          } else {
            socket.emit('queue:waiting')
            socket.emit('session:state', { state: 'QUEUED' })
          }
        }

        if (typeof ack === 'function') {
          ack({ ok: true })
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
          const partnerSocket = io.sockets.sockets.get(partner.socketId)
          if (partnerSocket) {
            partnerSocket.emit('chat:ended', {
              sessionId,
              reason: 'partner_left',
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
      // 1. Superseded socket check: if this socket is NOT the current active socket for the user,
      // it was already replaced by a newer connection. Do NOT start timers or alter active state!
      if (activeUserSockets.get(userId) !== socket.id) {
        return
      }

      // Remove from active user sockets map
      activeUserSockets.delete(userId)

      // Broadcast updated online count to remaining clients
      broadcastOnlineCount(io)

      // 2. Active match disconnect: start 15s grace timer and notify partner
      const activeMatch = MatchingService.getActiveMatchForUser(userId)
      if (activeMatch) {
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
          const partnerSocket = io.sockets.sockets.get(partner.socketId)
          if (partnerSocket) {
            partnerSocket.emit('chat:partner_status', {
              sessionId: activeMatch.sessionId,
              status: 'reconnecting',
            })
          }
        }

        // Start grace timer
        const timer = setTimeout(async () => {
          chatDisconnectTimers.delete(activeMatch.sessionId)

          // Grace period expired without reconnect!
          const endedMatch = await MatchingService.endMatch(
            activeMatch.sessionId,
            'DISCONNECT_TIMEOUT',
            userId
          )

          if (endedMatch && partner) {
            const partnerSocket = io.sockets.sockets.get(partner.socketId)
            if (partnerSocket) {
              partnerSocket.emit('chat:ended', {
                sessionId: activeMatch.sessionId,
                reason: 'partner_disconnected',
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

      // 3. Queue disconnect: start grace timer before removing from queue to preserve FIFO position
      if (MatchingService.getUserState(userId) === 'QUEUED') {
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
    })
  })

  ioInstance = io
  return io
}

export function getSocketServer(): TypedServer | null {
  return ioInstance
}

export function getActiveSocketIdForUser(userId: string): string | undefined {
  return activeUserSockets.get(userId)
}

export function clearActiveSockets(): void {
  activeUserSockets.clear()
  lastTypingTimes.clear()
  clearDisconnectTimers()
  disconnectGracePeriodMs = 15000
}
