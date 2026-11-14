import crypto from 'node:crypto'
import prisma from '../db'

export type MatchState = 'IDLE' | 'QUEUED' | 'PROPOSED' | 'IN_CHAT'

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
  autoAccept?: boolean
}

export interface ActiveMatchParticipant {
  userId: string
  socketId: string
  profile: {
    nickname: string
    avatarPreset: string
  }
}

export interface MatchProposalParticipant {
  userId: string
  socketId: string
  profile: {
    nickname: string
    avatarPreset: string
  }
  autoAccept?: boolean
}

export interface MatchProposal {
  proposalId: string
  userA: MatchProposalParticipant
  userB: MatchProposalParticipant
  mode: 'text'
  createdAt: number
  expiresAt: number
  acceptedUserIds: Set<string>
  timer?: NodeJS.Timeout
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
  proposed?: boolean
  proposal?: MatchProposal
}

export interface JoinQueueErrorResult {
  ok: false
  error: {
    code:
      | 'ALREADY_BUSY'
      | 'INVALID_MODE'
      | 'VALIDATION_FAILED'
      | 'COOLDOWN_ACTIVE'
    message: string
    remainingSeconds?: number
  }
}

export type JoinQueueResult = JoinQueueSuccessResult | JoinQueueErrorResult

export class MatchingService {
  private static queue: QueueEntry[] = []
  private static userStates = new Map<string, MatchState>()
  private static activeMatches = new Map<string, ActiveMatch>() // sessionId -> ActiveMatch
  private static userActiveSessions = new Map<string, string>() // userId -> sessionId
  private static cooldownMap = new Map<string, number>() // "userA:userB" -> expiry timestamp
  private static proposedMatches = new Map<string, MatchProposal>() // proposalId -> MatchProposal
  private static userProposals = new Map<string, string>() // userId -> proposalId
  private static disconnectCooldowns = new Map<string, number>() // userId -> expiry timestamp
  private static sessionCooldownApplied = new Set<string>() // "userId:sessionId" -> boolean
  private static disconnectCooldownDurationMs = 10000
  private static inFlightJoins = new Set<string>() // userId -> in-flight joinQueue lock

  static setDisconnectCooldownDurationMs(ms: number): void {
    this.disconnectCooldownDurationMs = ms
  }

  static getDisconnectCooldownDurationMs(): number {
    return this.disconnectCooldownDurationMs
  }

  /**
   * Returns current match state for user (IDLE, QUEUED, PROPOSED, IN_CHAT)
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
   * Deterministically returns WebRTC role ('offerer' for userA, 'answerer' for userB)
   */
  static getParticipantRtcRole(
    sessionId: string,
    userId: string
  ): 'offerer' | 'answerer' | null {
    const match = this.activeMatches.get(sessionId)
    if (!match) return null
    if (match.userA.userId === userId) return 'offerer'
    if (match.userB.userId === userId) return 'answerer'
    return null
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
   * Applies 10-second disconnect cooldown for a user.
   * Prevents duplicate applications for the same chat session.
   */
  static applyDisconnectCooldown(
    userId: string,
    sessionId?: string,
    durationMs?: number
  ): void {
    const duration = durationMs ?? this.disconnectCooldownDurationMs
    if (duration <= 0) return
    if (sessionId) {
      const key = `${userId}:${sessionId}`
      if (this.sessionCooldownApplied.has(key)) {
        return
      }
      this.sessionCooldownApplied.add(key)
    }
    const expiresAt = Date.now() + duration
    this.disconnectCooldowns.set(userId, expiresAt)
  }

  /**
   * Clears disconnect cooldown for a specific user.
   */
  static clearUserDisconnectCooldown(userId: string): void {
    this.disconnectCooldowns.delete(userId)
  }

  /**
   * Returns remaining disconnect cooldown in seconds, or 0 if inactive.
   */
  static getDisconnectCooldownRemaining(userId: string): number {
    const expiresAt = this.disconnectCooldowns.get(userId)
    if (!expiresAt) return 0
    const diff = expiresAt - Date.now()
    if (diff <= 0) {
      this.disconnectCooldowns.delete(userId)
      return 0
    }
    return Math.ceil(diff / 1000)
  }

  /**
   * Returns a match proposal by ID.
   */
  static getProposal(proposalId: string): MatchProposal | undefined {
    return this.proposedMatches.get(proposalId)
  }

  /**
   * Returns a match proposal for a given user.
   */
  static getProposalForUser(userId: string): MatchProposal | undefined {
    const proposalId = this.userProposals.get(userId)
    if (!proposalId) return undefined
    return this.proposedMatches.get(proposalId)
  }

  /**
   * Records user acceptance for a match proposal.
   * If both participants have accepted, creates the active chat session in DB and transitions both to IN_CHAT.
   * Stale proposals or attempts to accept while already in an active chat are strictly rejected.
   */
  static async acceptProposal(
    proposalId: string,
    userId: string
  ): Promise<{
    bothAccepted: boolean
    proposal?: MatchProposal
    match?: ActiveMatch
  }> {
    const proposal = this.proposedMatches.get(proposalId)
    if (!proposal) return { bothAccepted: false }
    if (proposal.userA.userId !== userId && proposal.userB.userId !== userId) {
      return { bothAccepted: false }
    }

    // Stale proposal protection: Neither user can accept if either is already in an active session
    if (
      this.userActiveSessions.has(proposal.userA.userId) ||
      this.userActiveSessions.has(proposal.userB.userId) ||
      this.getUserState(proposal.userA.userId) === 'IN_CHAT' ||
      this.getUserState(proposal.userB.userId) === 'IN_CHAT'
    ) {
      this.cancelProposal(proposalId, 'expired')
      return { bothAccepted: false }
    }

    proposal.acceptedUserIds.add(userId)

    const bothAccepted =
      proposal.acceptedUserIds.has(proposal.userA.userId) &&
      proposal.acceptedUserIds.has(proposal.userB.userId)

    if (bothAccepted) {
      if (proposal.timer) clearTimeout(proposal.timer)
      this.proposedMatches.delete(proposalId)
      this.userProposals.delete(proposal.userA.userId)
      this.userProposals.delete(proposal.userB.userId)

      // Guard: Ensure neither participant entered another active session in the interim
      if (
        this.userActiveSessions.has(proposal.userA.userId) ||
        this.userActiveSessions.has(proposal.userB.userId)
      ) {
        return { bothAccepted: false }
      }

      // Transition both to IN_CHAT state
      this.userStates.set(proposal.userA.userId, 'IN_CHAT')
      this.userStates.set(proposal.userB.userId, 'IN_CHAT')

      // Persist chat session to PostgreSQL
      const chatSession = await prisma.chatSession.create({
        data: {
          mode: 'TEXT',
          userAId: proposal.userA.userId,
          userBId: proposal.userB.userId,
          startedAt: new Date(),
        },
      })

      const match: ActiveMatch = {
        sessionId: chatSession.id,
        mode: 'text',
        userA: {
          userId: proposal.userA.userId,
          socketId: proposal.userA.socketId,
          profile: proposal.userA.profile,
        },
        userB: {
          userId: proposal.userB.userId,
          socketId: proposal.userB.socketId,
          profile: proposal.userB.profile,
        },
        startedAt: chatSession.startedAt,
      }

      this.activeMatches.set(chatSession.id, match)
      this.userActiveSessions.set(proposal.userA.userId, chatSession.id)
      this.userActiveSessions.set(proposal.userB.userId, chatSession.id)

      return { bothAccepted: true, proposal, match }
    }

    return { bothAccepted: false, proposal }
  }

  /**
   * Cancels a pending match proposal (declined, expired, or disconnected)
   * and safely returns eligible participants to the matching queue.
   * Participants already in an active chat session are never re-queued.
   */
  static cancelProposal(
    proposalId: string,
    reason: 'declined' | 'expired' | 'disconnected',
    declinedByUserId?: string
  ): MatchProposal | undefined {
    const proposal = this.proposedMatches.get(proposalId)
    if (!proposal) return undefined

    if (proposal.timer) clearTimeout(proposal.timer)
    this.proposedMatches.delete(proposalId)
    this.userProposals.delete(proposal.userA.userId)
    this.userProposals.delete(proposal.userB.userId)

    // Add 15s cooldown between this specific pair to avoid immediate rematch
    this.addCooldown(proposal.userA.userId, proposal.userB.userId, 15000)

    // Re-queue participants safely
    const handleRequeue = (participant: MatchProposalParticipant) => {
      // Guard: Never re-queue a participant who has an active session or is IN_CHAT
      if (
        this.userActiveSessions.has(participant.userId) ||
        this.getUserState(participant.userId) === 'IN_CHAT'
      ) {
        return
      }

      if (reason === 'disconnected' && participant.userId === declinedByUserId) {
        this.userStates.set(participant.userId, 'IDLE')
        return
      }
      this.userStates.set(participant.userId, 'QUEUED')
      if (!this.queue.some((e) => e.userId === participant.userId)) {
        this.queue.push({
          userId: participant.userId,
          socketId: participant.socketId,
          mode: 'text',
          joinedAt: new Date(),
          profile: participant.profile,
          blockedUserIds: new Set<string>(),
          autoAccept: participant.autoAccept,
        })
      }
    }

    handleRequeue(proposal.userA)
    handleRequeue(proposal.userB)

    return proposal
  }

  /**
   * Attempts to add an authenticated user to the matchmaking queue and pair them
   * with the oldest eligible FIFO candidate.
   *
   * Enforces:
   * - In-flight lock preventing concurrent join requests for the same user
   * - 10-second disconnect cooldown check (COOLDOWN_ACTIVE)
   * - No duplicate queue entries (ALREADY_BUSY)
   * - No joining while in an active match or proposal (ALREADY_BUSY)
   * - Self-matching prevention
   * - Bidirectional block exclusions via database records
   * - Cooldown exclusion for recent partners
   * - Atomic FIFO candidate pruning and reservation
   * - Creation of match proposal for user confirmation
   */
  static async joinQueue(params: {
    userId: string
    socketId: string
    mode?: string
    profile?: {
      nickname?: string
      avatarPreset?: string
    }
    autoAccept?: boolean
    confirmMatch?: boolean
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

    // Guard: Prevent concurrent joinQueue executions for the same user
    if (this.inFlightJoins.has(params.userId)) {
      return {
        ok: false,
        error: {
          code: 'ALREADY_BUSY',
          message: 'Matchmaking request already in progress.',
        },
      }
    }
    this.inFlightJoins.add(params.userId)

    try {
      // 0. Disconnect cooldown check
      const cooldownRemaining = this.getDisconnectCooldownRemaining(params.userId)
      if (cooldownRemaining > 0) {
        return {
          ok: false,
          error: {
            code: 'COOLDOWN_ACTIVE',
            message: `Please wait ${cooldownRemaining}s before finding a new match.`,
            remainingSeconds: cooldownRemaining,
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
                : currentState === 'PROPOSED'
                  ? 'You have a pending match confirmation.'
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

      // Safety guard: verify user does not have a pending proposal
      if (this.userProposals.has(params.userId)) {
        return {
          ok: false,
          error: {
            code: 'ALREADY_BUSY',
            message: 'You have a pending match confirmation.',
          },
        }
      }

      // Load blocked user IDs from database
      const blockedUserIds = await this.loadBlockedUserIds(params.userId)

      // Post-DB query re-validation: verify state did not change during async query
      if (this.getUserState(params.userId) !== 'IDLE') {
        return {
          ok: false,
          error: {
            code: 'ALREADY_BUSY',
            message: 'User state changed while processing queue request.',
          },
        }
      }
      if (this.userActiveSessions.has(params.userId)) {
        return {
          ok: false,
          error: {
            code: 'ALREADY_BUSY',
            message: 'You are currently in an active chat session.',
          },
        }
      }
      if (this.userProposals.has(params.userId)) {
        return {
          ok: false,
          error: {
            code: 'ALREADY_BUSY',
            message: 'You have a pending match confirmation.',
          },
        }
      }
      if (this.queue.some((e) => e.userId === params.userId)) {
        return {
          ok: false,
          error: {
            code: 'ALREADY_BUSY',
            message: 'You are already waiting in the matching queue.',
          },
        }
      }

      const confirmMatch = Boolean(params.confirmMatch)
      const autoAccept =
        params.autoAccept !== undefined ? Boolean(params.autoAccept) : !confirmMatch

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
        autoAccept,
      }

      // Atomic synchronous candidate selection from FIFO queue with stale entry pruning
      let matchCandidateIndex = -1
      for (let i = 0; i < this.queue.length; ) {
        const candidate = this.queue[i]

        // Prune stale queue entries (e.g. candidate already in chat, proposal, or not queued)
        if (
          this.getUserState(candidate.userId) !== 'QUEUED' ||
          this.userActiveSessions.has(candidate.userId) ||
          this.userProposals.has(candidate.userId)
        ) {
          this.queue.splice(i, 1)
          continue
        }

        // Self-matching prevention
        if (candidate.userId === newEntry.userId) {
          i++
          continue
        }

        // Bidirectional block check
        if (
          newEntry.blockedUserIds.has(candidate.userId) ||
          candidate.blockedUserIds.has(newEntry.userId)
        ) {
          i++
          continue
        }

        // Recent-decline cooldown check
        if (this.isInCooldown(newEntry.userId, candidate.userId)) {
          i++
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

      // Case 2: Eligible partner found -> Create proposal
      const [candidate] = this.queue.splice(matchCandidateIndex, 1)

      const proposalId = crypto.randomUUID()
      const proposal: MatchProposal = {
        proposalId,
        userA: {
          userId: candidate.userId,
          socketId: candidate.socketId,
          profile: candidate.profile,
          autoAccept: Boolean(candidate.autoAccept),
        },
        userB: {
          userId: newEntry.userId,
          socketId: newEntry.socketId,
          profile: newEntry.profile,
          autoAccept: Boolean(newEntry.autoAccept),
        },
        mode: 'text',
        createdAt: Date.now(),
        expiresAt: Date.now() + 15000,
        acceptedUserIds: new Set<string>(),
      }

      if (candidate.autoAccept) {
        proposal.acceptedUserIds.add(candidate.userId)
      }
      if (newEntry.autoAccept) {
        proposal.acceptedUserIds.add(newEntry.userId)
      }

      // If both auto-accepted (e.g. legacy tests)
      if (
        proposal.acceptedUserIds.has(candidate.userId) &&
        proposal.acceptedUserIds.has(newEntry.userId)
      ) {
        this.userStates.set(candidate.userId, 'IN_CHAT')
        this.userStates.set(newEntry.userId, 'IN_CHAT')

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

      // Otherwise, transition both to PROPOSED state atomically
      this.userStates.set(candidate.userId, 'PROPOSED')
      this.userStates.set(newEntry.userId, 'PROPOSED')
      this.proposedMatches.set(proposalId, proposal)
      this.userProposals.set(candidate.userId, proposalId)
      this.userProposals.set(newEntry.userId, proposalId)

      return {
        ok: true,
        matched: false,
        proposed: true,
        proposal,
      }
    } finally {
      this.inFlightJoins.delete(params.userId)
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

    // If user was in PROPOSED state, cancel proposal
    const proposalId = this.userProposals.get(userId)
    if (proposalId) {
      this.cancelProposal(proposalId, 'declined', userId)
      removed = true
    }

    if (
      this.userStates.get(userId) === 'QUEUED' ||
      this.userStates.get(userId) === 'PROPOSED'
    ) {
      this.userStates.set(userId, 'IDLE')
    }

    return removed
  }

  /**
   * Handles user socket disconnection. Removes user from queue if waiting.
   */
  static handleDisconnect(userId: string, _socketId: string): void {
    if (
      this.userStates.get(userId) === 'QUEUED' ||
      this.userStates.get(userId) === 'PROPOSED'
    ) {
      this.leaveQueue(userId)
    }
  }

  /**
   * Cleanly terminates an active match and returns participants to IDLE state.
   * Applies 10-second disconnect cooldown for both participants.
   */
  static async endMatch(
    sessionId: string,
    reason: 'SKIP' | 'END' | 'DISCONNECT_TIMEOUT' | 'MODERATION' | 'SERVER_RESTART' = 'END',
    endedByUserId?: string
  ): Promise<ActiveMatch | undefined> {
    const match = this.activeMatches.get(sessionId)
    if (!match) return undefined

    this.activeMatches.delete(sessionId)
    this.userActiveSessions.delete(match.userA.userId)
    this.userActiveSessions.delete(match.userB.userId)

    this.userStates.set(match.userA.userId, 'IDLE')
    this.userStates.set(match.userB.userId, 'IDLE')

    // Apply disconnect cooldown (deduplicated by sessionId)
    // If reason is SKIP or MODERATION, the initiator gets no cooldown while partner gets cooldown
    // If reason is END or DISCONNECT_TIMEOUT, both participants get cooldown
    if ((reason === 'SKIP' || reason === 'MODERATION') && endedByUserId) {
      const partnerUserId =
        match.userA.userId === endedByUserId
          ? match.userB.userId
          : match.userA.userId
      this.applyDisconnectCooldown(
        partnerUserId,
        sessionId,
        this.disconnectCooldownDurationMs
      )
    } else {
      this.applyDisconnectCooldown(
        match.userA.userId,
        sessionId,
        this.disconnectCooldownDurationMs
      )
      this.applyDisconnectCooldown(
        match.userB.userId,
        sessionId,
        this.disconnectCooldownDurationMs
      )
    }

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
    for (const proposal of this.proposedMatches.values()) {
      if (proposal.timer) clearTimeout(proposal.timer)
    }
    this.queue = []
    this.userStates.clear()
    this.activeMatches.clear()
    this.userActiveSessions.clear()
    this.cooldownMap.clear()
    this.proposedMatches.clear()
    this.userProposals.clear()
    this.disconnectCooldowns.clear()
    this.sessionCooldownApplied.clear()
    this.inFlightJoins.clear()
  }
}
