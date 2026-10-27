# KothaKoi — Proposed Shared Contracts Specification (CONTRACTS.md)

**Document Status:** Working Proposal  
**Last Updated:** 2026-10-22  
**Governing Documents:** [`Files/TRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/TRD.md), [`Files/BACKEND-SCHEMA.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/BACKEND-SCHEMA.md), [`Files/APP-FLOW.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/APP-FLOW.md), [`Files/PRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/PRD.md), [`Files/IMPLEMENTATION-PLAN.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/IMPLEMENTATION-PLAN.md), [`docs/DECISIONS.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/docs/DECISIONS.md).

> **Important Rule on Status:** Individual sections below are explicitly marked **[Approved]** or **[Proposed]**. Only architectural directions formally recorded in [`docs/DECISIONS.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/docs/DECISIONS.md) are Approved. Technical details, payload structures, event names, and schema properties remain Proposed until implemented and verified against active code.

---

## 1. Standard API Error Format

### 1.1 Specification **[Proposed — per TRD §3 and kothaKoiPlan §4.3]**
All state-changing and resource-fetching REST endpoints under `/api` return a uniform JSON error payload when a request fails (HTTP status codes 400, 401, 403, 404, 409, 429, 500):

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable, user-safe description of the error",
    "details": {}
  }
}
```

### 1.2 Field Definitions **[Proposed]**
- `error.code` (`string`, required): Machine-readable uppercase snake-case string identifier matching the standard error code catalog.
- `error.message` (`string`, required): Human-readable message suitable for display in UI toasts, banners, or form feedback. It must never reveal system internals, stack traces, or confidential data (NFR-05).
- `error.details` (`object`, optional): Structured validation or context metadata. Used primarily for validation failures (e.g., mapping field names to specific validation messages) or rate-limit retry timing. Unknown or sensitive fields are strictly excluded.

### 1.3 Standard Error Code Catalog **[Proposed — per TRD §3]**

| Error Code | HTTP Status | Context / Trigger Condition |
|---|---|---|
| `VALIDATION_FAILED` | `400 Bad Request` | Request body or query parameters failed Zod schema validation. `details` contains field-level issues. |
| `EMAIL_DOMAIN_NOT_ALLOWED` | `400 Bad Request` | Email address submitted to `/api/auth/request-code` failed UIU domain allowlist checks (FR-01, OD-06). |
| `INVALID_CODE` | `400 Bad Request` | 6-digit OTP code is invalid, expired (>10 min), consumed, or locked (>5 failed attempts) (FR-03). |
| `UNAUTHENTICATED` | `401 Unauthorized` | Request to a protected route lacks a valid session cookie or session has expired (FR-04, FR-05). |
| `SESSION_EXPIRED` | `401 Unauthorized` | Session token exists in cookie but has passed its expiration time in database/store. |
| `FORBIDDEN` | `403 Forbidden` | Authenticated user lacks permission (e.g. non-admin accessing `/api/admin/*`, or socket event for non-participant). |
| `ACCOUNT_UNAVAILABLE` | `403 Forbidden` | User account has been suspended or permanently banned by an administrator (FR-06, FR-23). |
| `NOT_FOUND` | `404 Not Found` | Requested resource (e.g., report by ID, admin view) does not exist. |
| `ALREADY_BUSY` | `409 Conflict` | User attempted to join the queue while already queued or inside an active chat room (FR-10). |
| `CONFLICT` | `409 Conflict` | Duplicate submission conflict (e.g., duplicate report for the same session by the same reporter). |
| `NOT_IN_SESSION` | `404 / 403` | User attempted an in-chat action (`chat:message`, `chat:skip`, report) without being an active participant. |
| `RATE_LIMITED` | `429 Too Many Requests` | Request rate limit exceeded for IP, email, or user bucket (FR-19, TRD §9). `details` may include retry cooldown. |
| `INTERNAL` | `500 Internal Error` | Unexpected server error. The message is generic; internal error details are logged server-side only. |

---

## 2. Session Cookie Specification

### 2.1 Approved Boundaries **[Approved — per OD-09, NFR-03]**
- **Deployment Topology:** Target is a single-origin production deployment where Express serves the frontend static build (OD-09).
- **Security Posture:** Cookie must be `HttpOnly` (inaccessible to JavaScript, defending against token theft via XSS) and `Secure` in production (transmitted only over HTTPS) per NFR-03.
- **Path Scope:** `Path=/` (accessible across all API endpoints and WebSocket handshakes).
- **Trust Proxy:** `trust proxy` must be configured in Express so `Secure` cookies and client IP addresses function correctly behind reverse proxies (TRD §5).

### 2.2 Proposed Properties and Unresolved Decisions **[Proposed / Pending OD-04]**

| Cookie Property | Proposed Value | Decision Status | Notes / Rationale |
|---|---|---|---|
| **Cookie Name** | `kothakoi_session` (Option A) *or* `connect.sid` (Option B) | **Pending OD-04** | Option A uses custom session store; Option B uses `express-session` default name (currently in repo). |
| **HttpOnly** | `true` | **Approved (NFR-03)** | Hard security requirement. |
| **Secure** | `process.env.NODE_ENV === 'production'` | **Approved (NFR-03)** | Required for production HTTPS. |
| **SameSite** | `Lax` (Plan proposal) *or* `Strict` (Existing repo code) | **Pending OD-04** | In same-origin deployment, `Lax` allows safe top-level links; `Strict` provides maximal CSRF defense. |
| **Max-Age / Expiry**| `86400000` (24 hours) | **Pending OD-04, OD-12** | Existing `backend/src/config/session.ts` specifies 24 hours. Sliding renewal vs fixed expiration is unresolved. |
| **Token Format** | 32-byte CSPRNG hex string, stored as SHA-256 hash | **Pending OD-04** | Required if Option A (custom token table `sessions`) is approved. |

---

## 3. Realtime Socket Event Contracts (Socket.IO Gateway)

### 3.1 Gateway Overview & Handshake **[Proposed — per TRD §7 and kothaKoiPlan §4.4]**
- **Mount Point:** Attached to the existing Express HTTP server on `/socket.io`.
- **Handshake Authentication:** The Socket.IO connection handshake reads the session cookie. The server validates the session and resolves `socket.data.userId` internally.
- **Strict Privacy Rule:** Clients never transmit `userId`, email, or database IDs. Sockets without a valid session or associated with banned/suspended accounts are rejected during handshake (`ACCOUNT_UNAVAILABLE` or `UNAUTHENTICATED`).
- **Connection Policy:** One active socket per user for matchmaking. A new connection replaces an existing one or disconnects older sessions [pending final concurrency rule].
- **Scope Phasing:** Per **OD-02 (Approved)**, all WebRTC video signaling events (`rtc:*`) are **deferred to Release 2**. Only Text MVP events are active in Release 1.

### 3.2 Client-to-Server (C $\rightarrow$ S) Events

| Event Name | Proposed Payload Shape | Validation & Behavior | Status |
|---|---|---|---|
| `queue:join` | `{ mode?: 'text', nickname?: string, avatarPreset?: string }` | `mode` must be `'text'` for Release 1. Optional `nickname` (2–20 chars) and `avatarPreset` specify temporary chat identity for the session. User must be in `IDLE` state; returns `ALREADY_BUSY` if already queued/matched. Server responds via acknowledgement callback: `{ ok: true }` or socket `error`. | **Proposed** (Phasing aligned with OD-02) |
| `queue:leave` | `{}` | Removes user from the waiting queue and resets state to `IDLE`. Acknowledges with `{ ok: true }`. | **Proposed** |
| `chat:message` | `{ sessionId: string, clientMsgId: string, text: string }` | `sessionId`: UUID string of active room.<br>`clientMsgId`: client-generated UUID for optimistic UI/deduplication.<br>`text`: 1–1000 Unicode code points (trimmed).<br>Server verifies caller is a participant, relays to partner, and acknowledges sender with `{ ok: true, messageId: string, at: string }`. | **Proposed** |
| `chat:typing` | `{ sessionId: string, isTyping: boolean }` | Rate-limited to max 1 event per second. Relays typing status to the partner. | **Proposed** |
| `chat:skip` | `{ sessionId: string }` | Requests immediate partner skip. Initiator is re-queued into matchmaking; partner receives `chat:ended` (`reason: 'partner_skipped'`). Repeat matches are permitted; explicit blocks and active matches are preserved. | **Proposed** |
| `chat:end` | `{ sessionId: string }` | Terminates chat room cleanly. Both users return to `IDLE` state. Partner receives `chat:ended` (`reason: 'partner_left'`). | **Proposed** |
| `rtc:offer` | `{ sessionId: string, sdp: string }` | **Deferred to Release 2.** WebRTC SDP offer. | **Deferred (OD-02)** |
| `rtc:answer` | `{ sessionId: string, sdp: string }` | **Deferred to Release 2.** WebRTC SDP answer. | **Deferred (OD-02)** |
| `rtc:ice` | `{ sessionId: string, candidate: object }` | **Deferred to Release 2.** WebRTC ICE candidate. | **Deferred (OD-02)** |

### 3.3 Server-to-Client (S $\rightarrow$ C) Events

| Event Name | Proposed Payload Shape | Trigger & Context | Status |
|---|---|---|---|
| `session:state` | `{ state: 'IDLE' \| 'QUEUED' \| 'IN_CHAT', session?: { sessionId: string, mode: 'text', partner: { nickname: string, avatarPreset?: string }, self?: { nickname: string, avatarPreset?: string } }, recent?: string[] }` | Sent immediately upon socket connection or reconnection. Informs client of restored state and active room details, including local temporary chat identity. | **Proposed** |
| `queue:waiting` | `{}` | Emitted when user is successfully placed in the FIFO matchmaking queue. UI shows waiting spinner/counter. | **Proposed** |
| `match:found` | `{ sessionId: string, mode: 'text', partner: { nickname: string, avatarPreset?: string }, self?: { nickname: string, avatarPreset?: string } }` | Emitted simultaneously to both paired users upon atomic pairing. Includes temporary chat identities. **Strict Privacy:** Contains no private Profile Name, emails, user IDs, or student IDs (NFR-05, OD-05). | **Proposed** |
| `chat:message` | `{ sessionId: string, messageId: string, text: string, at: string }` | Relayed in-order to the partner. `at` is an ISO-8601 server timestamp. Rendered as plain text to prevent XSS. | **Proposed** |
| `chat:typing` | `{ sessionId: string, isTyping: boolean }` | Relayed to partner to display the real-time typing indicator. Auto-cleared after 3 seconds. | **Proposed** |
| `chat:partner_status` | `{ sessionId: string, status: 'reconnecting' \| 'back' }` | Emitted when partner socket disconnects unexpectedly. Initiates 15-second grace period banner in UI (FR-15). | **Proposed** |
| `chat:ended` | `{ sessionId: string, reason: 'partner_skipped' \| 'partner_left' \| 'partner_disconnected' \| 'you_ended' \| 'moderation' }` | Room terminated. Notifies user of termination reason and unlocks "Find Next" navigation. | **Proposed** |
| `online:count` | `{ count: number }` | Emitted globally upon socket connection, disconnection, or state transition to broadcast the total count of authenticated users with active socket connections. Strictly deduplicated per user and contains no user PII (NFR-05). | **Proposed** |
| `error` | `{ code: string, message: string }` | Emitted on socket-level errors (e.g. `RATE_LIMITED`, `FORBIDDEN`, `ALREADY_BUSY`, `VALIDATION_FAILED`). | **Proposed** |

---

## 4. REST Endpoint Contracts Summary **[Proposed — per TRD §6]**

| Method & Route | Request Body / Query | Success Response (HTTP 200/204) | Potential Errors | Governing Requirement |
|---|---|---|---|---|
| `GET /api/health` | None | `{ "status": "ok" }` | None | Existing implementation |
| `GET /api/stats/online` | None | `{ "ok": true, "count": number }` | None | Returns total count of active authenticated socket connections. |
| `POST /api/auth/request-code` | `{ "email": string, "acceptTerms"?: boolean }` | `{ "ok": true }` (uniform response) | 400 (`EMAIL_DOMAIN_NOT_ALLOWED`, `VALIDATION_FAILED`), 429 (`RATE_LIMITED`) | FR-01, FR-02, OD-01, OD-06 |
| `POST /api/auth/verify-code` | `{ "email": string, "code": string }` | `{ "user": { "id": string, "role": "student" \| "admin", "hasProfile": boolean, "name"?: string } }` + `Set-Cookie` | 400 (`INVALID_CODE`), 403 (`ACCOUNT_UNAVAILABLE`), 429 (`RATE_LIMITED`) | FR-03, FR-06, OD-01 |
| `POST /api/auth/set-password` | `{ "email": string, "password": string, "name"?: string }` | `{ "ok": true }` | 400 (`VALIDATION_FAILED`) | Password setup with private Profile Name |
| `POST /api/auth/change-password` | `{ "currentPassword": string, "newPassword": string }` | `{ "ok": true }` | 400 (`VALIDATION_FAILED`, `INVALID_CREDENTIALS`), 401 (`UNAUTHENTICATED`) | Authenticated password change |
| `POST /api/auth/logout` | None | `204 No Content` + clear cookie | 401 (`UNAUTHENTICATED`) | FR-04 |
| `GET /api/auth/me` | None (reads cookie) | `{ "id": string, "email": string, "role": string, "status": string, "hasProfile": boolean, "name"?: string }` | 401 (`UNAUTHENTICATED`), 403 (`ACCOUNT_UNAVAILABLE`) | FR-04, FR-05 |
| `GET /api/profile` | None (reads cookie) | `{ "ok": true, "profile": { "name": string, "nickname": string, "avatarPreset": string, "preferences": object } }` | 401 (`UNAUTHENTICATED`) | FR-07, FR-08 |
| `PUT /api/profile` | `{ "name"?: string, "nickname"?: string, "avatarPreset"?: string, "preferences"?: object }` | `{ "ok": true, "name": string, "nickname": string, "avatarPreset": string, "preferences": object }` | 400 (`VALIDATION_FAILED`), 401 (`UNAUTHENTICATED`) | FR-07, FR-08, OD-07 |
| `DELETE /api/account` | None (reads cookie) | `204 No Content` | 401 (`UNAUTHENTICATED`) | FR-09, OD-12 |
| `POST /api/blocks` | `{ "sessionId": string }` | `204 No Content` | 401, 403 (`NOT_IN_SESSION`) | FR-18, OD-11 |
| `POST /api/reports` | `{ "sessionId": string, "reason": string, "details"?: string }` | `{ "reportId": string }` | 400, 401, 403 (`NOT_IN_SESSION`), 409 (`CONFLICT`), 429 | FR-17, OD-11 |
| `GET /api/admin/reports` | Query: `status`, `cursor` | `{ "reports": array, "nextCursor": string }` | 401, 403 (`FORBIDDEN`) | FR-21 |
| `GET /api/admin/reports/:id` | None | `{ "report": object, "evidence": object, "history": object }` | 401, 403, 404 (`NOT_FOUND`) | FR-21 |
| `POST /api/admin/reports/:id/action` | `{ "action": string, "reason": string, "expiresAt"?: string }` | `{ "ok": true }` | 400, 401, 403, 409 | FR-22 |

---

## 5. Contract Status and Decision Mapping

| Contract Area | Specification Status | Governing Decision / Source |
|---|---|---|
| Standard REST Error Envelope | **Proposed** | TRD §3, kothaKoiPlan §4.3 |
| Error Code Enum Values | **Proposed** | TRD §3 |
| Cookie HttpOnly & Secure Attributes | **Approved** | NFR-03, `docs/DECISIONS.md` |
| Same-Origin Target for Cookie Delivery | **Approved** | OD-09, `docs/DECISIONS.md` |
| Session Token Architecture & Cookie Name | **Proposed (Pending OD-04)** | TRD §5, BACKEND-SCHEMA §3.4 |
| Session Cookie SameSite Policy (`Lax` vs `Strict`)| **Proposed (Pending OD-04)** | TRD §5 |
| Socket Transport & Handshake Auth Policy | **Proposed** | TRD §7, kothaKoiPlan §4.4 |
| Socket C $\rightarrow$ S and S $\rightarrow$ C Event Names | **Proposed** | TRD §7, kothaKoiPlan §4.3 |
| Socket Payload Data Minimisation (No PII) | **Approved** | OD-05, NFR-05, `docs/DECISIONS.md` |
| Deferral of `rtc:*` Socket Events to Release 2 | **Approved** | OD-02, `docs/DECISIONS.md` |

---

## 6. Unresolved Questions & Decision References

1. **OD-04 — Session Mechanism & Cookie Spec:**
   - Whether to use custom DB-backed hashed tokens in `sessions` table (`kothakoi_session`) or `express-session` with a Postgres store (`connect.sid`).
   - Final choice between `SameSite: 'Lax'` and `SameSite: 'Strict'`.
   - Resolution of sliding session lifetime vs fixed 24-hour expiration.
2. **OD-06 — Allowed Email Domains Whitelist:**
   - Active subdomains beyond `uiu.ac.bd` (e.g. `bscse.uiu.ac.bd`, `bba.uiu.ac.bd`) need verification before finalizing `ALLOWED_EMAIL_DOMAINS` parsing.
3. **OD-07 — Nickname & Profile Validation Constraints:**
   - Maximum character length boundary (UI currently allows 24 chars; specification proposes 20; database check enforces 2-20 chars).
   - Character whitelist for Bengali script and emoji code points.
   - Exact structure and naming for avatar presets (`avatarPreset` vs `avatar_preset`).
4. **OD-08 — Chat UI Integration:**
   - Layout adaptation for `Chat.tsx` in Text MVP mode (how camera preview placeholders are cleanly hidden without breaking the neo-brutalist styling).
5. **OD-11 — Report Reasons & Moderation Policy:**
   - Reconciliation of differing report reasons between `Chat.tsx` and `Video.tsx` into a single canonical enum.
   - Allowed time window for submitting a report after a chat session ends.
6. **OD-12 — Retention Job & Pruning Cycles:**
   - Pruning duration for completed chat session metadata and resolved abuse report evidence snapshots.
7. **OD-13 — Matching Queue Tuning:**
   - Repeat matches: Product requirements explicitly permit repeat matches so users may rematch with previous partners if available in the queue. Recent-partner cooldown has been removed while preserving explicit block exclusions, active session protections, and self-matching prevention.
   - Empty queue timeout or "nobody online" UX state trigger threshold.
