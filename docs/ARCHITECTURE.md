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

## 3. Security, Privacy & System Boundaries

> [!NOTE]
> **Independent Project Disclaimer:** KothaKoi is an independent student portfolio project. It is not affiliated with, authorized by, or endorsed by United International University.

1. **Application-Level Domain Rule:**
   Registration requests validate that the submitted email string matches configured allowed domains (`ALLOWED_EMAIL_DOMAINS`, e.g. `uiu.ac.bd,bscse.uiu.ac.bd`). This is an application-level rule, not institutional single sign-on (SSO).
2. **Password & OTP Cryptography:**
   - Account passwords are encrypted using Node.js native `crypto.scryptSync` with a unique 16-byte random salt and verified with `crypto.timingSafeEqual`.
   - 6-digit numeric login codes are hashed using HMAC-SHA256 before storage in PostgreSQL with a 10-minute time-to-live (TTL).
3. **Identity Separation:**
   - Real Name (immutable after registration) and registered email are stored in the database but are never broadcasted in Socket.IO matching payloads or chat events.
   - Only the user's chosen or generated `nickname` is transmitted to the chat partner.
4. **Transport & Data Boundaries:**
   - Socket.IO text messages are routed ephemerally in server memory; there is no persistent chat log table.
   - Safety reports capture a brief 10-message snippet from active memory to allow administrative review.
   - Direct WebRTC media streams are encrypted using standard SRTP, but direct peer connections expose peer IP addresses to each other. Relayed sessions route through Metered TURN servers.
5. **Role-Based Access Control (RBAC):**
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

