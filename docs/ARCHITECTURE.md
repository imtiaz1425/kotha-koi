# KothaKoi — System Architecture Specification

## 1. System Overview

KothaKoi is structured as a decoupled, multi-tier real-time web application optimized for university student matchmaking.

```
+-------------------------------------------------------------+
|                     Client Tier (Browser)                   |
|  - React 18 SPA (Vite)                                      |
|  - AuthContext & OnlineContext                              |
|  - useWebRTC hook (PeerConnection, MediaStreams, DataChan)  |
|  - Socket.IO client (Signaling, Chat, Queue events)         |
+------------------------------+------------------------------+
                               |
            HTTP/REST          |         WebSocket
          (withCookies)        |       (Socket.IO)
                               v
+-------------------------------------------------------------+
|                    Application Tier (Node.js)               |
|  - Express REST API                                         |
|    * /api/auth (OTP, set-password, login, me, logout)       |
|    * /api/profile (confidential Real Name vs Nickname)      |
|    * /api/webrtc/ice-servers (dynamic Metered TURN cache)   |
|    * /api/reports & /api/blocks                             |
|    * /api/admin/* (RBAC-protected moderation & metrics)     |
|  - Socket.IO Gateway                                        |
|    * MatchingEngine (FIFO queue, mutual block filtering)    |
|    * Room lifecycle (join, proposal, match, leave, next)    |
|    * WebRTC Signaling relay (offer, answer, ice-candidate)  |
|  - MeteredTurnProvider (10-min cache, deduplication)        |
|  - DataRetentionService (periodic purge of expired data)    |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                      Data Tier (PostgreSQL)                 |
|  - User & UserPassword                                      |
|  - Session (HttpOnly cookie persistence)                    |
|  - VerificationCode (Hashed OTPs)                           |
|  - BlockedUser (Mutual bidirectional exclusion)             |
|  - Report & ModerationLog                                   |
|  - Access through Prisma ORM 5.x                            |
+-------------------------------------------------------------+
```

---

## 2. Real-Time Signaling & WebRTC Lifecycle

The WebRTC session initialization strictly follows the sequence below:

```
User A (Initiator)           Signaling Server (Socket.IO)           User B (Receiver)
     |                                    |                                    |
     |--------- queue:join -------------->|                                    |
     |                                    |<--------- queue:join --------------|
     |                                    |                                    |
     |                              [Match Engine]                             |
     |                           (Pairs User A & B)                            |
     |                                    |                                    |
     |<-------- match:found --------------+------------ match:found ---------->|
     |        (partnerNickname)           |           (partnerNickname)        |
     |                                    |                                    |
     |--- fetch GET /ice-servers -------->|                                    |
     |                                    |--- fetch GET /ice-servers -------->|
     |<-- returns TURN/STUN creds --------|                                    |
     |                                    |<-- returns TURN/STUN creds --------|
     |                                    |                                    |
     |--- webrtc:offer (SDP) ------------>|                                    |
     |                                    |--- webrtc:offer (SDP) ------------>|
     |                                    |                                    |
     |                                    |<-- webrtc:answer (SDP) ------------|
     |<-- webrtc:answer (SDP) ------------|                                    |
     |                                    |                                    |
     |<== ICE candidate exchange (trickle ICE via webrtc:ice-candidate) ======>|
     |                                    |                                    |
     |================ Peer-to-Peer Media Flow Established ===================|
     |            (Direct STUN P2P or Metered TURN Relay)                      |
```

### 2.1 Role Determination
- When a match is formed, the match generator assigns deterministic initiator/receiver roles:
  - The first user paired by the matching queue becomes the **offerer** (`initiator: true`).
  - The second user becomes the **answerer** (`initiator: false`).
- The offerer captures media tracks (if available) and emits `webrtc:offer`.
- The answerer sets the remote description, attaches local tracks, and emits `webrtc:answer`.

### 2.2 Transceiver Architecture & Receive-Only Fallback
To prevent WebRTC connection failures on mobile devices without camera permissions or in HTTP test environments:
- `useWebRTC.ts` initializes receive-only transceivers (`direction: 'recvonly'`) if local camera/mic tracks are not immediately obtainable.
- When user permissions are granted, transceivers transition to `'sendrecv'`.

---

## 3. Security & Identity Boundary

1. **Email Domain Enclosure:**
   Only verified `@*.uiu.ac.bd` domain emails can request verification codes.
2. **Double-Hashed Passwords:**
   Passwords are never stored in plaintext. Hashing is performed using `scrypt` with random cryptographic salts.
3. **Identity Privacy:**
   - Real Names collected at registration are immutable and visible only to the account owner via `/api/profile` and `/api/auth/me`.
   - Socket matchmaking payloads only ever carry the chosen or generated `nickname`.
   - Partner user IDs are obscured on the client side; reports and blocks use session tokens or server-resolved partner references.
4. **Role-Based Access Control (RBAC):**
   `/api/admin/*` routes enforce `requireAdmin` middleware, which verifies `user.role === 'ADMIN'`.

---

## 4. Database Schema Relationships

- **User:** Primary identity record storing `email`, `name`, `status`, `role`.
- **UserPassword:** One-to-one credential record with salt and hash.
- **Session:** Tracks active web sessions with expiration and last activity timestamps.
- **VerificationCode:** Transient hashed OTPs with attempt counter and expiration.
- **BlockedUser:** Stores `blockerId` and `blockedId` with a composite unique constraint.
- **Report:** Stores `reporterId`, `reportedId`, `category`, `reason`, `status`, and `chatSnippet`.
- **ModerationLog:** Immutable audit record of admin moderation actions (`WARN`, `SUSPEND`, `BAN`, `UNBAN`).
