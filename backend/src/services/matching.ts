import prisma from '../db'

export type MatchState = 'IDLE' | 'QUEUED' | 'IN_CHAT'

export interface QueueEntry {
  userId: string
  socketId: string
  mode: 'text'
  joinedAt: Date
  profile: {
    nickname: string
    avatarPreset: string
  }
  blockedUserIds: Set<string>
}

export interface ActiveMatchParticipant {
  userId: string
  socketId: string
  profile: {
    nickname: string
    avatarPreset: string
  }
}

export interface ActiveMatch {
  sessionId: string
  mode: 'text'
  userA: ActiveMatchParticipant
  userB: ActiveMatchParticipant
  startedAt: Date
}

export interface JoinQueueSuccessResult {
  ok: true
  matched: boolean
  match?: ActiveMatch
}

export interface JoinQueueErrorResult {
  ok: false
  error: {
    code: 'ALREADY_BUSY' | 'INVALID_MODE' | 'VALIDATION_FAILED'
    message: string
  }
}

export type JoinQueueResult = JoinQueueSuccessResult | JoinQueueErrorResult

export class MatchingService {
  private static queue: QueueEntry[] = []
  private static userStates = new Map<string, MatchState>()
  private static activeMatches = new Map<string, ActiveMatch>() // sessionId -> ActiveMatch
  private static userActiveSessions = new Map<string, string>() // userId -> sessionId
  private static cooldownMap = new Map<string, number>() // "userA:userB" -> expiry timestamp

  /**
   * Returns current match state for user (IDLE, QUEUED, IN_CHAT)
   */
  static getUserState(userId: string): MatchState {
    return this.userStates.get(userId) || 'IDLE'
  }

  /**
   * Returns active match record for user if currently in IN_CHAT state
   */
  static getActiveMatchForUser(userId: string): ActiveMatch | undefined {
    const sessionId = this.userActiveSessions.get(userId)
    if (!sessionId) return undefined
    return this.activeMatches.get(sessionId)
  }

  /**
   * Returns active match record by sessionId
   */
  static getActiveMatch(sessionId: string): ActiveMatch | undefined {
    return this.activeMatches.get(sessionId)
  }

  /**
   * Checks whether a user is an active participant in the session
   */
  static isParticipant(sessionId: string, userId: string): boolean {
    const match = this.activeMatches.get(sessionId)
    if (!match) return false
    return match.userA.userId === userId || match.userB.userId === userId
  }

  /**
   * Returns the partner participant for a given user in an active match
   */
  static getPartner(
    sessionId: string,
    userId: string
  ): ActiveMatchParticipant | undefined {
    const match = this.activeMatches.get(sessionId)
    if (!match) return undefined
    if (match.userA.userId === userId) return match.userB
    if (match.userB.userId === userId) return match.userA
    return undefined
  }

  /**
   * Returns total users currently waiting in queue
   */
  static getQueueLength(): number {
    return this.queue.length
  }

  /**
   * Updates the socket ID for an active participant in a match upon reconnect.
   */
  static updateParticipantSocket(
    sessionId: string,
    userId: string,
    newSocketId: string
  ): boolean {
    const match = this.activeMatches.get(sessionId)
    if (!match) return false
    if (match.userA.userId === userId) {
      match.userA.socketId = newSocketId
      return true
    }
    if (match.userB.userId === userId) {
      match.userB.socketId = newSocketId
      return true
    }
    return false
  }

  /**
   * Updates the socket ID for a user waiting in the queue upon reconnect.
   */
  static updateQueueSocket(userId: string, newSocketId: string): boolean {
    const entry = this.queue.find((e) => e.userId === userId)
    if (entry) {
      entry.socketId = newSocketId
      return true
    }
    return false
  }

  /**
   * Checks if a user is currently waiting in the queue.
   */
  static isUserQueued(userId: string): boolean {
    return this.queue.some((e) => e.userId === userId)
  }

  /**
   * Returns the queue entry for a given user.
   */
  static getQueueEntry(userId: string): QueueEntry | undefined {
    return this.queue.find((e) => e.userId === userId)
  }

  /**
   * Loads all blocked user IDs for a given user from PostgreSQL (bidirectional).
   * Finds users that this user blocked, and users who have blocked this user.
   */
  static async loadBlockedUserIds(userId: string): Promise<Set<string>> {
    const blocks = await prisma.block.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    })

    const blockedSet = new Set<string>()
    for (const b of blocks) {
      if (b.blockerId === userId) {
        blockedSet.add(b.blockedId)
      }
      if (b.blockedId === userId) {
        blockedSet.add(b.blockerId)
      }
    }
    return blockedSet
  }

  /**
   * Generates a canonical sorted key for the pair cooldown map.
   */
  private static getCooldownKey(userA: string, userB: string): string {
    return [userA, userB].sort().join(':')
  }

  /**
   * Adds a pair of users to the recent-partner cooldown map (default 10 minutes).
   */
  static addCooldown(
    userA: string,
    userB: string,
    durationMs: number = 10 * 60 * 1000
  ): void {
    const key = this.getCooldownKey(userA, userB)
    this.cooldownMap.set(key, Date.now() + durationMs)
  }

  /**
   * Checks if two users are within the active cooldown period.
   */
  static isInCooldown(userA: string, userB: string): boolean {
    const key = this.getCooldownKey(userA, userB)
    const expiresAt = this.cooldownMap.get(key)
    if (!expiresAt) return false
    if (Date.now() >= expiresAt) {
      this.cooldownMap.delete(key)
      return false
    }
    return true
  }

  /**
   * Attempts to add an authenticated user to the matchmaking queue and pair them
   * with the oldest eligible FIFO candidate.
   *
   * Enforces:
   * - No duplicate queue entries (ALREADY_BUSY)
   * - No joining while in an active match (ALREADY_BUSY)
   * - Self-matching prevention
   * - Bidirectional block exclusions via database records
   * - Cooldown exclusion for recent partners
   * - Atomic FIFO queue transition
   * - Persistence of ChatSession in PostgreSQL
   */
  static async joinQueue(params: {
    userId: string
    socketId: string
    mode?: string
    profile?: {
      nickname?: string
      avatarPreset?: string
    }
  }): Promise<JoinQueueResult> {
    const mode = params.mode || 'text'
    if (mode !== 'text') {
      return {
        ok: false,
        error: {
          code: 'INVALID_MODE',
          message: 'Only text mode is supported in Release 1.',
        },
      }
    }

    const currentState = this.getUserState(params.userId)

    if (currentState !== 'IDLE') {
      return {
        ok: false,
        error: {
          code: 'ALREADY_BUSY',
          message:
            currentState === 'QUEUED'
              ? 'You are already waiting in the matching queue.'
              : 'You are currently in an active chat session.',
        },
      }
    }

    // Safety guard: verify user is not already queued
    if (this.queue.some((e) => e.userId === params.userId)) {
      return {
        ok: false,
        error: {
          code: 'ALREADY_BUSY',
          message: 'You are already waiting in the matching queue.',
        },
      }
    }

    // Safety guard: verify user does not have an active session
    if (this.userActiveSessions.has(params.userId)) {
      return {
        ok: false,
        error: {
          code: 'ALREADY_BUSY',
          message: 'You are currently in an active chat session.',
        },
      }
    }

    // Load blocked user IDs from database
    const blockedUserIds = await this.loadBlockedUserIds(params.userId)

    const newEntry: QueueEntry = {
      userId: params.userId,
      socketId: params.socketId,
      mode: 'text',
      joinedAt: new Date(),
      profile: {
        nickname: params.profile?.nickname?.trim() || 'UIU Student',
        avatarPreset: params.profile?.avatarPreset || 'mango',
      },
      blockedUserIds,
    }

    // Atomic synchronous candidate selection from FIFO queue
    let matchCandidateIndex = -1
    for (let i = 0; i < this.queue.length; i++) {
      const candidate = this.queue[i]

      // Self-matching prevention
      if (candidate.userId === newEntry.userId) {
        continue
      }

      // Bidirectional block check
      if (
        newEntry.blockedUserIds.has(candidate.userId) ||
        candidate.blockedUserIds.has(newEntry.userId)
      ) {
        continue
      }

      matchCandidateIndex = i
      break
    }

    // Case 1: No eligible partner found -> Append to FIFO queue
    if (matchCandidateIndex === -1) {
      this.queue.push(newEntry)
      this.userStates.set(params.userId, 'QUEUED')
      return { ok: true, matched: false }
    }

    // Case 2: Eligible partner found -> Atomically remove candidate and pair
    const [candidate] = this.queue.splice(matchCandidateIndex, 1)

    // Transition both to IN_CHAT state
    this.userStates.set(candidate.userId, 'IN_CHAT')
    this.userStates.set(newEntry.userId, 'IN_CHAT')

    // Persist chat session to PostgreSQL
    const chatSession = await prisma.chatSession.create({
      data: {
        mode: 'TEXT',
        userAId: candidate.userId,
        userBId: newEntry.userId,
        startedAt: new Date(),
      },
    })

    const match: ActiveMatch = {
      sessionId: chatSession.id,
      mode: 'text',
      userA: {
        userId: candidate.userId,
        socketId: candidate.socketId,
        profile: candidate.profile,
      },
      userB: {
        userId: newEntry.userId,
        socketId: newEntry.socketId,
        profile: newEntry.profile,
      },
      startedAt: chatSession.startedAt,
    }

    this.activeMatches.set(chatSession.id, match)
    this.userActiveSessions.set(candidate.userId, chatSession.id)
    this.userActiveSessions.set(newEntry.userId, chatSession.id)

    return {
      ok: true,
      matched: true,
      match,
    }
  }

  /**
   * Removes a user from the waiting queue and returns them to IDLE state.
   */
  static leaveQueue(userId: string): boolean {
    const index = this.queue.findIndex((e) => e.userId === userId)
    let removed = false

    if (index !== -1) {
      this.queue.splice(index, 1)
      removed = true
    }

    if (this.userStates.get(userId) === 'QUEUED') {
      this.userStates.set(userId, 'IDLE')
    }

    return removed
  }

  /**
   * Handles user socket disconnection. Removes user from queue if waiting.
   */
  static handleDisconnect(userId: string, _socketId: string): void {
    if (this.userStates.get(userId) === 'QUEUED') {
      this.leaveQueue(userId)
    }
  }

  /**
   * Cleanly terminates an active match and returns participants to IDLE state.
   */
  static async endMatch(
    sessionId: string,
    reason: 'SKIP' | 'END' | 'DISCONNECT_TIMEOUT' = 'END',
    endedByUserId?: string
  ): Promise<ActiveMatch | undefined> {
    const match = this.activeMatches.get(sessionId)
    if (!match) return undefined

    this.activeMatches.delete(sessionId)
    this.userActiveSessions.delete(match.userA.userId)
    this.userActiveSessions.delete(match.userB.userId)

    this.userStates.set(match.userA.userId, 'IDLE')
    this.userStates.set(match.userB.userId, 'IDLE')

    await prisma.chatSession
      .update({
        where: { id: sessionId },
        data: {
          endedAt: new Date(),
          endedReason: reason,
          endedByUserId: endedByUserId || null,
        },
      })
      .catch(() => {})

    return match
  }

  /**
   * Clears all in-memory queue state and cooldowns. Used for test isolation.
   */
  static clearAll(): void {
    this.queue = []
    this.userStates.clear()
    this.activeMatches.clear()
    this.userActiveSessions.clear()
    this.cooldownMap.clear()
  }
}
