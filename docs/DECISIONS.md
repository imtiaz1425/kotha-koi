# KothaKoi — Architecture and Product Decisions Log (DECISIONS.md)

**Document Status:** Active Record  
**Last Updated:** 2026-10-22  
**Governing Documents:** [`Files/PRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/PRD.md), [`Files/TRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/TRD.md), [`Files/BACKEND-SCHEMA.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/BACKEND-SCHEMA.md), [`Files/APP-FLOW.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/APP-FLOW.md), [`Files/UI-UX-SPECIFICATION.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/UI-UX-SPECIFICATION.md), [`Files/IMPLEMENTATION-PLAN.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/IMPLEMENTATION-PLAN.md), [`Files/REQUIREMENTS-TRACEABILITY.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/REQUIREMENTS-TRACEABILITY.md).

> **Rule:** Only explicitly approved decisions are recorded as Approved below. All related, dependent, or unlisted decisions remain strictly **Pending / Unapproved**. No decisions are assumed or decided silently.

---

## 1. Approved Decisions (TASK-FND-01 Gate)

### OD-01 — Authentication Model
- **Decision ID:** `OD-01`
- **Title:** Authentication Model
- **Status:** **APPROVED** (Approved by Project Owner on 2026-10-22)
- **Approved Choice:** **Passwordless UIU email OTP (One-Time Password)**.
- **Concise Rationale:**
  - Dramatically reduces the security and operational attack surface for student credentials by eliminating password storage, password hashing algorithms (Argon2/bcrypt), credential stuffing vulnerabilities, password resets, and forgot-password token management.
  - Aligns with the core mission of KothaKoi as an ephemeral, low-friction campus chat where account ownership is tied strictly to active mailbox control at an authorized UIU address.
  - Supported by [`Files/PRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/PRD.md) §5 & §6 (FR-01..04) and [`Files/APP-FLOW.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/APP-FLOW.md) (FLOW-01, FLOW-02).
- **Implementation Implications:**
  - **Database Schema:** The `users` table will **not** contain a `password_hash` column. A dedicated `login_codes` table will store HMAC-SHA256 hashed 6-digit codes with a 10-minute TTL and a 5-attempt lockout per [`Files/BACKEND-SCHEMA.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/BACKEND-SCHEMA.md) §3.3.
  - **Frontend UI:** In `TASK-AUTH-06`, the existing `Login.tsx` and `Register.tsx` pages will be adapted into a clean two-step OTP flow (Enter UIU email $\rightarrow$ Enter 6-digit code). Password inputs, confirm-password inputs, and password reset modals will be removed rather than simulated or implemented.
- **Boundaries & Exclusions:**
  - This approval applies strictly to adopting passwordless email OTP.
  - It does **not** approve the session token mechanism (OD-04 is pending) or the production transactional email delivery provider (OD-14 is pending).

---

### OD-02 — Release Order & MVP Scope
- **Decision ID:** `OD-02`
- **Title:** Release Order & MVP Scope
- **Status:** **APPROVED** (Approved by Project Owner on 2026-10-22)
- **Approved Choice:** **Text-chat MVP first (Release 1); WebRTC video calling is deferred to Release 2**.
- **Concise Rationale:**
  - Video calling presents the highest moderation, legal, privacy, and infrastructure complexity (STUN/TURN bandwidth costs, camera/mic permissions, peer-to-peer IP leakage, uninspectable video abuse).
  - Launching a Text MVP first validates the core value proposition (UIU mailbox verification, matchmaking queue, low-latency ephemeral chat, skip/end flows, abuse reporting/blocking, and moderation admin tools) with low operating overhead and lower abuse risk.
  - Supported by [`Files/PRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/PRD.md) §5 (Release 1 Text MVP vs Release 2 Video) and [`Files/IMPLEMENTATION-PLAN.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/IMPLEMENTATION-PLAN.md) §1.
- **Implementation Implications:**
  - **Phasing:** Phase 4 (Real-time queue) and Phase 5 (Text chat) take immediate priority in the development roadmap; Phase 7 (WebRTC video) and associated tasks (`TASK-VID-01` through `TASK-VID-05`) are deferred to Release 2.
  - **Frontend UI Adaptation:** `Chat.tsx` and `Video.tsx` currently assume video elements. Under Text MVP, `Chat.tsx` will be adapted to function cleanly as a dedicated text chat interface without requiring camera/microphone permissions or rendering dead WebRTC media tiles, while strictly preserving the neo-brutalist aesthetic and layout.
- **Boundaries & Exclusions:**
  - This approval applies solely to prioritizing the Text MVP ahead of Video.
  - It does **not** settle chat screen layout specifics (OD-08 is pending), TURN provider selection (OD-16 is pending), or video IP privacy posture (OD-17 is pending).

---

### OD-03 — Technology Stack & Shared Contracts
- **Decision ID:** `OD-03`
- **Title:** Technology Stack & Shared Contracts Strategy
- **Status:** **APPROVED** (Approved by Project Owner on 2026-10-22)
- **Approved Choice:** **PostgreSQL + Prisma, with shared Zod contracts**.
- **Concise Rationale:**
  - PostgreSQL provides strong relational integrity (foreign keys, cascade deletes, composite primary keys, JSONB for user preferences, timestamp with time zone support) critical for reliable user status, blocks, and reports.
  - Prisma offers a typed, declarative client that enhances developer safety while working with TypeScript in Express.
  - Shared Zod contracts ensure end-to-end type safety between Express API endpoints, Socket.IO event payloads, and React frontend forms, preventing contract drift.
  - Supported by [`Files/BACKEND-SCHEMA.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/BACKEND-SCHEMA.md) §1 and [`Files/TRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/TRD.md) §2.
- **Implementation Implications:**
  - **Database & Scaffolding:** A local Postgres container will be set up via `docker-compose.yml` (`TASK-FND-04`), followed by Prisma schema definition and migrations (`TASK-FND-05`).
  - **Raw SQL Migration Requirement:** Because Prisma cannot express SQL `CHECK` constraints natively (e.g. `blocker_id <> blocked_id`, nickname length), a raw SQL migration will be created alongside the Prisma schema.
- **Boundaries & Exclusions:**
  - This approval establishes PostgreSQL + Prisma as the ORM/DB choice and Zod as the contract validation standard.
  - It **does NOT** authorize restructuring the repository (e.g., converting to npm workspaces vs. TypeScript path aliases vs. mono-repo tooling) or creating shared packages yet. The concrete sharing mechanism will be evaluated and decided under `TASK-FND-03`.

---

### OD-05 — Identity Data Minimisation
- **Decision ID:** `OD-05`
- **Title:** Identity Data Minimisation (`real_name` / `student_id`)
- **Status:** **APPROVED** (Approved by Project Owner on 2026-10-22)
- **Approved Choice:** **Do not store real name or student ID**.
- **Concise Rationale:**
  - Strict data minimisation and privacy principle: KothaKoi is an anonymous campus chat. If real names and student IDs are not stored, they cannot be leaked, subpoenaed, or misused.
  - Eliminates the liability of holding unverified self-declared personal identity claims, as student IDs or real names entered in a web form without registrar SSO integration provide no cryptographic proof.
  - Supported by [`Files/PRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/PRD.md) §8, [`Files/BACKEND-SCHEMA.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/BACKEND-SCHEMA.md) §3.1 (`real_name` and `student_id` omitted), and NFR-05 / NFR-11.
- **Implementation Implications:**
  - **Database Schema:** The `users` table will omit `real_name` and `student_id` columns entirely. Only `id`, `email`, `role`, `status`, `suspended_until`, `email_verified_at`, `terms_accepted_at`, `created_at`, `updated_at`, and `last_login_at` will be stored.
  - **Frontend UI:** The Real Name and Student ID input fields in `Register.tsx` will be removed during `TASK-AUTH-06`, keeping registration focused strictly on email verification and consent.
- **Boundaries & Exclusions:**
  - This approval applies solely to omitting `real_name` and `student_id`.
  - It does **not** settle nickname rules (OD-07 is pending) or account retention/deletion policies (OD-12 is pending).

---

### OD-06 — UIU Email Eligibility
- **Decision ID:** `OD-06`
- **Title:** UIU Email Domain Eligibility & Server-Side Allowlist
- **Status:** **APPROVED** (Approved by Project Owner on 2026-10-22)
- **Approved Choice:** **Enforce a server-side email-domain allowlist configured through environment variable `ALLOWED_EMAIL_DOMAINS`**.
- **Concise Rationale:**
  - Ensures that only users with genuine mailboxes under approved UIU educational domains can receive OTP codes and authenticate, protecting the campus boundary.
  - Enforcing this strictly on the backend prevents bypass of client-side regex validations.
  - Configuring via `ALLOWED_EMAIL_DOMAINS` avoids hardcoded values and allows adding/updating departmental subdomains without code deployments.
  - Implements the strict parser algorithm specified in [`Files/TRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/TRD.md) §4 and FR-01, preventing subdomain spoofing (e.g., rejecting `user@uiu.ac.bd.evil.com` or `user@evil-uiu.ac.bd`).
- **Implementation Implications:**
  - **Backend Parser:** `TASK-AUTH-01` will implement `isAllowedEmail()` enforcing the normalization and domain matching algorithm against `ALLOWED_EMAIL_DOMAINS`.
- **Boundaries & Exclusions:**
  - This approval establishes server-side allowlist enforcement via `ALLOWED_EMAIL_DOMAINS`.
  - It **does NOT** freeze the final list of permitted domains; the exact list of active student mailbox domains (e.g. `uiu.ac.bd`, `bscse.uiu.ac.bd`, `bba.uiu.ac.bd`, etc.) must be verified against actual UIU email conventions before `TASK-AUTH-01` implementation.

---

### OD-09 — Deployment Topology
- **Decision ID:** `OD-09`
- **Title:** Deployment Topology
- **Status:** **APPROVED** (Approved by Project Owner on 2026-10-22)
- **Approved Choice:** **Target a same-origin production deployment**.
- **Concise Rationale:**
  - Serving the compiled frontend and API/WebSocket services under the same origin in production completely eliminates cross-origin resource sharing (CORS) security risks and pre-flight HTTP overhead.
  - Enables the use of first-party, secure, HttpOnly session cookies without requiring complex third-party cookie handling or cross-site cookie policies.
  - Simplifies routing, SSL certificate management, and Socket.IO connection handshakes.
  - Supported by [`Files/TRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/TRD.md) §13 and [`Files/IMPLEMENTATION-PLAN.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/IMPLEMENTATION-PLAN.md) §1.
- **Implementation Implications:**
  - **Backend Service:** In production, Express will serve the static built artifacts from the frontend's `dist/` directory, while API requests route under `/api` and WebSockets route under `/socket.io`. In development, Vite will continue to proxy `/api` and `/socket.io` to the Express server on port 5000.
- **Boundaries & Exclusions:**
  - This approval targets same-origin deployment.
  - It **does NOT** select a cloud hosting provider, VPS, container orchestrator, or budget tier (OD-18 is pending).

---

### OD-04 — Session Mechanism & Cookie Policy
- **Decision ID:** `OD-04`
- **Title:** Session Mechanism & Cookie Policy
- **Status:** **APPROVED** (Approved for TASK-AUTH-04 per TRD §5 Option A & BACKEND-SCHEMA §3.4)
- **Approved Choice:** **Option A — Custom Database-Backed Hashed-Token Sessions (`sessions` table) with HttpOnly SameSite=Lax 24h Cookie (`kothakoi_session`)**.
- **Concise Rationale:**
  - **Security at Rest:** Plaintext session tokens are never stored in the database. A 32-byte CSPRNG token (`crypto.randomBytes(32).toString('hex')`) is generated and delivered via cookie, while only its SHA-256 hash (`token_hash` UNIQUE) is stored in the PostgreSQL `sessions` table. A compromised database backup or SQL read replica cannot be used to forge session tokens.
  - **No Memory Leaks:** Avoids the unreliable default MemoryStore of `express-session` without requiring Redis deployment overhead during the pilot.
  - **Relational Integrity:** Foreign key constraint cascades deletion directly upon user deletion (`sessions.user_id -> users.id CASCADE`).
  - **Immediate Revocation:** Immediate and deterministic session revocation upon logout (`POST /api/auth/logout`) and immediate rejection if an account becomes banned or suspended (`ACCOUNT_UNAVAILABLE`).
  - **Cookie Policy:** `HttpOnly: true`, `SameSite: 'lax'`, `Secure: process.env.NODE_ENV === 'production'`, `Path: '/'`, `Max-Age: 86400000` (24 hours).
  - Aligns with [`Files/TRD.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/TRD.md) §5 (Option A) and [`Files/BACKEND-SCHEMA.md`](file:///d:/Working%20Files/Vibe%20code%20projects/Kotha-Koi/Files/BACKEND-SCHEMA.md) §3.4.
- **Implementation Implications:**
  - `SessionService` handles cryptographic token generation, SHA-256 hashing, lookup, status re-check, and revocation.
  - `requireAuth` middleware verifies `kothakoi_session` cookie against PostgreSQL and attaches authenticated user data.
  - Zero-dependency cookie parser replaces in-memory `express-session` in `backend/src/app.ts`.

---

## 2. Pending and Unapproved Decisions

All decisions listed below remain **Pending User Review and Approval**. No implementation work dependent on these decisions may begin until explicitly approved.

| Decision ID | Title | Topic / Context | Dependent Tasks |
|---|---|---|---|
| **OD-07** | Nickname Model | Server-side nickname rules (length 2–20 chars vs UI 24 chars, Bengali/Unicode support, reserved words/impersonation filters) | `TASK-PROF-01`, `TASK-PROF-02` |
| **OD-08** | Chat Layout & Interaction | Adapting video-oriented `Chat.tsx` layout for Text MVP mode | `TASK-CHAT-03`, `TASK-SAFE-03` |
| **OD-10** | Profile Stats & Notifications | Removing fabricated stats from UI vs implementing real metrics; notification settings | `TASK-PROF-03` |
| **OD-11** | Moderation Policy | Repeat-report threshold, ban/suspend lifecycles, admin action reasons, unblock policy | `TASK-SAFE-01`..`05` |
| **OD-12** | Data Retention & Deletion | Pruning schedule for expired codes, session tokens, ended chat metadata, and report evidence | `TASK-FND-05`, `TASK-HARD-01`/`02` |
| **OD-13** | Matching Queue Policy | Pairing algorithm, recent-partner cooldown window, empty queue / "nobody online" UX | `TASK-RT-03` |
| **OD-14** | Email Provider | Development console logging vs production transactional email provider (Resend, SendGrid, etc.) | `TASK-AUTH-07` |
| **OD-15** | UIU Permission & Legal | Institutional affiliation disclaimers, Terms of Service, Privacy Policy disclosures | `TASK-UX-01` |
| **OD-16** | TURN Server Strategy | Managed TURN service (e.g., Metered/Twilio) vs self-hosted `coturn` on a VPS (Release 2) | `TASK-VID-04` |
| **OD-17** | Video Privacy Posture | WebRTC peer IP exposure mitigation (P2P vs relay-only) (Release 2) | `TASK-VID-05` |
| **OD-18** | Production Hosting & Cost | Cloud infrastructure provider, container runtime, and operational budget boundaries | `TASK-HARD-07` |
| **OD-19** | Shared Layout Extraction | Component extraction for common Neo-Brutalist headers/footers without redesigning | `TASK-UX-02` |
