# KothaKoi (কথা কই) — Architecture, Roadmap & GitHub Workflow

*A beginner-friendly engineering plan for a campus-verified anonymous chat app, built one tested module at a time. Prepared October 18, 2026.*

**How to use this document:** read sections 1–4 once to understand the big picture. After that, work through Section 5 (the roadmap) in strict order. Do not ask an AI agent to build anything until you have finished the module before it.

---

## 1. Executive summary and recommended stack

**What you are building.** KothaKoi (কথা কই) lets a verified UIU email holder be paired anonymously with another student for text or video chat. Compared with a normal web app, three things make it harder:

1. Realtime connections that must stay open (WebSockets).
2. A matching queue where two users can race for the same partner.
3. WebRTC video, which needs signaling plus STUN/TURN to work on real networks.

The plan therefore builds in order of risk: **text chat first, video second.** A working text MVP is already a good university project; video is a bonus layered on top.

### The key decision: ONE backend service, ONE frontend build, ONE database

| Option | Strengths | Weaknesses | Verdict |
|---|---|---|---|
| Next.js full-stack on Vercel | One project, great docs | Serverless functions cannot hold long-lived WebSocket connections, so you would need a second server anyway | Rejected for realtime |
| Next.js + separate Node realtime server | Polished | Two deployables, cross-domain cookie problems, too much for a beginner | Not now |
| **Vite React + Express + Socket.IO + PostgreSQL** | One backend, simple mental model, Express can serve the built frontend so there is no CORS or cross-site cookie trouble | No server-side rendering (irrelevant: the app is login-gated) | **Chosen** |
| Managed realtime (Firebase, Supabase Realtime, Ably, Pusher) | Less server code | Matching logic still needs trusted server code, vendor lock-in, quotas | Later option only |
| Raw `ws` library | Lightweight | You hand-write reconnection, rooms, heartbeats | Socket.IO chosen |

### Recommended stack (final, no further alternatives)

| Layer | Choice | Why | Free in development? | May cost in production? |
|---|---|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS | Huge AI/tutorial support, fast feedback | Yes | Static files are served by your backend, so no separate cost |
| Backend | Node.js + Express + TypeScript, `zod` for input validation | One language everywhere | Yes | Always-on hosting is needed (free tiers often sleep, which breaks live chat) |
| Realtime | Socket.IO (WSS) | Rooms, auto-reconnect, heartbeats built in | Yes | Same host |
| Database | PostgreSQL + Prisma ORM | Relational constraints suit users, blocks and reports; Prisma gives readable schema + migrations | Yes (local Docker/Postgres) | Managed Postgres free tiers have limits or expiry: verify |
| Auth | Passwordless email OTP + server-side session cookie (you write it, about 200 lines, so you understand it) | No passwords to store or leak | Yes | Email-sending quota: verify |
| Email | Dev: print the OTP in the terminal. Prod: a transactional email provider (e.g. Resend or Brevo) | Real inbox delivery | Dev yes | Free quotas change: verify |
| Video | Browser WebRTC (no library) | Built into browsers | Yes | TURN relay bandwidth is the main video cost |
| STUN/TURN | Dev: public STUN. Prod: managed TURN service or self-hosted coturn | Needed for restrictive networks | STUN yes | TURN: verify provider pricing |
| Testing | Vitest (unit/integration), Playwright (end-to-end) | Beginner-friendly | Yes | Free |
| CI | GitHub Actions | Runs lint/tests on every push | Yes for private repos within quota | Verify minutes quota |
| Hosting | One Node host (Render, Railway, Fly.io or a small VPS) + managed Postgres | Fewest moving parts | Dev: no | Verify all prices |

**Migration path if it grows:** (1) move static files to a CDN, (2) add Redis and the Socket.IO Redis adapter so several backend instances share the queue and rooms, (3) move to managed TURN or several TURN servers, (4) add Postgres read replicas or connection pooling.

### Important limitation: email domain ≠ enrolled student

Checking that an address belongs to the UIU domain proves only that **the person controls a mailbox at that domain**. It does **not** prove that they are a currently enrolled student. Realistic gaps:

- Graduated students, staff, faculty, and alumni may keep working addresses.
- Mailboxes can be shared, transferred, or compromised.
- Domain validation done sloppily can be bypassed (see the next point).

| Level | What it proves | Can you do it? |
|---|---|---|
| **Email ownership verification** (OTP/link) | This person can read mail sent to this address | Yes, this is the MVP |
| **Domain restriction** | The mailbox is on a UIU domain | Yes, but implement it correctly |
| **Official student-status verification** | The person is enrolled now | Only with UIU's cooperation (an official roster, SSO, or API). Without that, state honestly that you verify *UIU email ownership*, not enrollment |

Mitigations you *can* do: ban abusive accounts by normalised email, make reports easy, optionally re-verify the email every semester, and put the limitation in your Terms and report.

**Two implementation traps to handle in Module 5:**

1. **Check the real format of UIU student emails before coding.** Many universities issue addresses on subdomains (for example `name@dept.uiu.ac.bd`). A rule that requires the text to end exactly in `@uiu.ac.bd` would reject those students. Look at your own UIU address and ask a few friends or the IT office, then store the allowed domains in a config list (e.g. `ALLOWED_EMAIL_DOMAINS`), not hard-coded.
2. **Parse, do not substring-match.** Split at the last `@`, lowercase, and compare the domain exactly (or check that it ends with `.uiu.ac.bd`). Never use `email.includes('uiu.ac.bd')`, because `x@uiu.ac.bd.evil.com` would pass.

---

## 2. MVP scope versus later features

| Release | Contents | Roadmap modules |
|---|---|---|
| **Release 1: Text MVP** (your first demo) | Landing page, UIU-email OTP registration/login/logout, sessions, nickname + optional interests, dashboard, text chat, matching queue, skip/end/partner-left handling, report + block, rate limiting, minimal admin page (list reports, ban/unban), privacy policy + terms, HTTPS deployment | 0–10, minimal 13, 14–15 |
| **Release 2: Video** | WebRTC video/audio, camera/mic controls, signaling, STUN/TURN | 11–12 |
| **Release 3: Polish** | Richer admin dashboard, monitoring/alerts, interest-based matching, semester re-verification, PWA/mobile polish, Redis scaling | rest of 13, later |

**Deliberately not in the MVP:** chat history, friends lists, image uploads, group rooms, push notifications, AI content moderation, mobile apps. Each adds privacy and safety risk.

**Honest safety note:** video chat with strangers is the highest-abuse feature. Ship text first, learn from real reports, then enable video with moderation already working.

---

## 3. System architecture

```mermaid
flowchart LR
  subgraph Browser[Student's browser]
    UI[React UI]
    RTC[WebRTC engine]
  end
  subgraph Host[Single Node.js service]
    API[Express REST API]
    AUTH[Auth and sessions]
    WS[Socket.IO gateway]
    MQ[Matching queue - memory]
    MOD[Reports and moderation]
  end
  DB[(PostgreSQL)]
  MAIL[Email provider]
  STUN[STUN server]
  TURN[TURN relay]
  PEER[Partner browser]

  UI -->|HTTPS REST| API
  UI <-->|WSS events| WS
  API --> AUTH
  AUTH --> DB
  AUTH --> MAIL
  WS --> MQ
  WS --> MOD
  API --> MOD
  MOD --> DB
  WS -->|offer / answer / ICE relay| UI
  RTC -.->|find public address| STUN
  RTC <-.->|direct audio/video| PEER
  RTC -.->|relay if direct fails| TURN
```

**Reading the diagram:** solid lines go through *your* server; dotted lines are WebRTC traffic. Your server only helps two browsers *introduce* themselves (signaling). Once connected, video flows browser-to-browser, or via TURN if the network blocks that.

### Where each kind of data lives

| Persistent in PostgreSQL | Temporary in server memory | Directly between peers |
|---|---|---|
| Users, profiles, sessions, login codes (hashed) | The matching queue | Audio and video streams |
| Blocks | Which socket belongs to which user | (Text chat goes via your server in this design so you can enforce blocks, rate limits and reports) |
| Chat-session *metadata* (who, when, how it ended) | Active room state and typing indicators | |
| Reports (with a small evidence snapshot) | Last ~20 messages per room, kept only so a report can attach them | |
| Moderation actions | Rate-limit counters | |

**Text messages are not stored in the database.** They pass through the server, live briefly in a per-room memory buffer, and vanish when the room ends, unless a user reports the chat. State this in the Privacy Policy.

### What needs a backend (even if AI builds your frontend)

OTP generation and checking, sending email, sessions, the domain restriction (client-side checks are bypassable), the matching queue, WebSocket authentication, block/report logic, rate limiting, TURN credential issuing, all admin actions, and every secret. **The frontend is untrusted. Every rule must be enforced on the server.**

---

## 4. Database, API and core algorithm overview

### 4.1 Database tables

| Table | Purpose | Important fields |
|---|---|---|
| `users` | One row per verified account | `id` (UUID), `email` (normalised, unique), `role` (`student`/`admin`), `status` (`active`/`suspended`/`banned`), `email_verified_at`, `created_at`, `last_login_at` |
| `profiles` | What a partner may see | `user_id` (PK + FK), `nickname`, `interests` (array, max 5), `updated_at` |
| `login_codes` | OTP verification | `id`, `email`, `code_hash`, `expires_at` (about 10 min), `attempts`, `consumed_at`, `created_at` |
| `sessions` | Logged-in browsers | `id`, `user_id`, `token_hash` (unique), `expires_at`, `last_seen_at`, `created_at` |
| `chat_sessions` | Metadata of each pairing | `id` (UUID), `mode` (`text`/`video`), `user_a_id`, `user_b_id`, `started_at`, `ended_at`, `ended_reason` |
| `blocks` | Who blocked whom | `blocker_id`, `blocked_id`, `created_at`; PK on the pair |
| `reports` | Abuse reports | `id`, `reporter_id`, `reported_id`, `chat_session_id`, `reason`, `details`, `evidence` (JSON snapshot of recent messages), `status` (`open`/`reviewing`/`actioned`/`dismissed`), `created_at`, `resolved_at` |
| `moderation_actions` | Audit trail | `id`, `admin_id`, `target_user_id`, `report_id`, `action` (`warn`/`suspend`/`ban`/`unban`/`dismiss`), `reason`, `expires_at`, `created_at` |

**Not stored:** passwords (there are none), plain OTPs or session tokens (hash them), message history, IP addresses beyond short-lived rate-limit counters, camera/mic data (it never reaches your server).

### 4.2 Relationships, constraints, indexes, migrations

- `profiles.user_id` → `users.id` (one-to-one, cascade delete).
- `sessions.user_id`, `chat_sessions.user_a_id/user_b_id`, `blocks.*`, `reports.*`, `moderation_actions.*` → `users.id`.
- `reports.chat_session_id` → `chat_sessions.id`.
- **Constraints:** `users.email` unique; `blocks` primary key `(blocker_id, blocked_id)` plus a check that they differ; `chat_sessions` check `user_a_id <> user_b_id`; nickname length 2–20, interests ≤ 5 items (also enforced by `zod` in the API).
- **Indexes:** `sessions(token_hash)`, `login_codes(email, created_at)`, `reports(status, created_at)`, `blocks(blocked_id)`, `chat_sessions(started_at)` (for the retention cleanup job).
- **Migrations:** every schema change goes through Prisma Migrate (`prisma migrate dev` locally, `prisma migrate deploy` in production). Commit the generated migration files. **Never edit the database by hand and never edit an already-committed migration.** Seed data (a few fake users and one admin) is for development only.
- **Retention (write this in the Privacy Policy):** delete expired `login_codes`/`sessions` daily; delete `chat_sessions` older than about 30 days unless attached to an open report; delete resolved-report evidence after a fixed period you choose.

### 4.3 REST endpoints and realtime events

All REST responses on failure use one shape: `{ "error": { "code": "STRING_CODE", "message": "human text", "details": {} } }`.

| Endpoint | Purpose | Module |
|---|---|---|
| `GET /api/health` | Server alive check | 1 |
| `POST /api/auth/request-code` | Validate domain, rate-limit, email an OTP | 5 |
| `POST /api/auth/verify-code` | Check OTP, create user if new, set session cookie | 5 |
| `POST /api/auth/logout` | Delete session | 5 |
| `GET /api/auth/me` | Who am I (used by protected routes) | 5 |
| `GET/PUT /api/profile` | Nickname and interests | 6 |
| `POST/DELETE /api/blocks` | Block or unblock a past partner | 10 |
| `POST /api/reports` | Report the current/last partner | 10 |
| `GET /api/ice-servers` | Short-lived STUN/TURN credentials | 12 |
| `GET /api/admin/reports`, `POST /api/admin/reports/:id/action` | Moderation | 13 |

**Socket.IO events** (names are part of your contract; change them only deliberately):

| Direction | Event | Payload |
|---|---|---|
| client → server | `queue:join` | `{ mode: 'text' \| 'video' }` |
| client → server | `queue:leave` | `{}` |
| client → server | `chat:message` | `{ sessionId, clientMsgId, text }` |
| client → server | `chat:skip` / `chat:end` | `{ sessionId }` |
| client → server | `chat:typing` | `{ sessionId, isTyping }` |
| client → server | `rtc:offer` / `rtc:answer` / `rtc:ice` | `{ sessionId, sdp }` or `{ sessionId, candidate }` |
| server → client | `queue:waiting` | `{}` |
| server → client | `match:found` | `{ sessionId, mode, role: 'caller' \| 'callee', partner: { nickname, interests } }` |
| server → client | `chat:message` | `{ sessionId, messageId, text, at }` |
| server → client | `chat:ended` | `{ sessionId, reason: 'partner_skipped' \| 'partner_left' \| 'partner_disconnected' \| 'you_ended' }` |
| server → client | `rtc:offer` / `rtc:answer` / `rtc:ice` | relayed unchanged |
| server → client | `error` | `{ code, message }` |

The `partner` object contains **only** nickname and interests, never email, user ID or session ID of the other user. The `sessionId` is a random UUID, useful only for that pairing.

### 4.4 Authorization: preventing impersonation and unauthorized rooms

1. **Identity comes from the session cookie, never from the client message.** When a socket connects, the server reads the `httpOnly` session cookie, looks up the hashed token in `sessions`, and attaches `socket.data.userId`. If invalid or the user is banned, reject the connection. Clients never send a `userId`.
2. **Rooms are decided only by the server.** On every `chat:*` and `rtc:*` event the server checks that `sessionId` is an active session in memory *and* that `socket.data.userId` is one of its two participants. Otherwise reply `error: FORBIDDEN`.
3. **Relay, don't broadcast.** The server forwards signaling only to the other participant of that session.
4. **Validate every payload** with `zod` (length caps such as 1–1000 characters per message, allowed event shapes).
5. **Render messages as plain text**, never as HTML, to prevent XSS.
6. **One active socket per user** for matching: a second tab either replaces the first or is refused, so one account cannot sit in the queue twice.

### 4.5 Random matching algorithm

Design goals: understandable, fair (first come, first served), safe (no double matches), and no leaking of identity.

**State machine (per user, kept in server memory):**

```mermaid
stateDiagram-v2
  [*] --> IDLE
  IDLE --> QUEUED: queue:join
  QUEUED --> IDLE: queue:leave, disconnect, timeout
  QUEUED --> IN_CHAT: paired by server
  IN_CHAT --> IDLE: end, partner left, disconnect after grace period
  IN_CHAT --> QUEUED: skip (skipper re-queued)
```

**Pseudocode (read this before any code is written):**

```
queues = { text: [], video: [] }          // ordered by join time
state  = Map userId -> IDLE | QUEUED | IN_CHAT
recent = Map userId -> Map partnerId -> expiresAt   // cooldown, e.g. 10 minutes
blockedWith = Map userId -> Set of userIds          // loaded BEFORE joining

function joinQueue(user, mode):
  if state[user] != IDLE: return error ALREADY_BUSY
  state[user] = QUEUED                    // set first, so a double-click cannot join twice
  candidate = first entry in queues[mode] where
        entry.user != user
    and not blockedWith[user].has(entry.user)
    and not blockedWith[entry.user].has(user)
    and not recent[user][entry.user] still valid
  if candidate exists:
    remove candidate from queues[mode]
    state[candidate.user] = IN_CHAT; state[user] = IN_CHAT
    room = newRandomUUID()
    notify both with match:found (nickname + interests only)
    save chat_sessions row asynchronously
  else:
    queues[mode].push(user); notify queue:waiting
```

**Race conditions and atomicity.** Node.js runs your JavaScript on one thread. A function with **no `await` inside** cannot be interrupted, so the block above is effectively atomic on a single server. The rule that keeps it safe: **never put a database call (`await`) between finding a candidate and removing it.** Load the user's block list into memory when the socket connects, and write to the database *after* pairing.

| Situation | Behaviour |
|---|---|
| User closes tab while queued | `disconnect` handler removes them from the queue and sets `IDLE` |
| Partner disconnects mid-chat | Wait a short grace period (about 15 seconds) in case of refresh or flaky mobile data, then send `chat:ended: partner_disconnected` |
| Skip | Room ends; partner gets `partner_skipped` and returns to `IDLE`; skipper is re-queued and the pair is added to the `recent` cooldown so they are not instantly rematched |
| Stale queue entries | Every 30 seconds sweep entries whose socket is gone; optional maximum wait with a friendly message |
| Blocked users | Never paired, in either direction |
| Privacy | Partners only receive nickname and interests. Server-side logs use short internal IDs, never emails |

**Scaling beyond one instance (later, not in MVP):** move the queue to Redis (atomic pop of a candidate with a small Lua script), use the Socket.IO Redis adapter so rooms span servers, and enable sticky sessions. A single instance comfortably serves a university-scale pilot.

### 4.6 Video architecture (WebRTC)

**What WebRTC does:** it sends audio/video directly between two browsers. It does *not* include a way for the browsers to find each other, so your Socket.IO server performs **signaling**.

```mermaid
sequenceDiagram
  participant A as Caller browser
  participant S as Your server
  participant B as Callee browser
  A->>S: queue:join (video)
  B->>S: queue:join (video)
  S-->>A: match:found (role caller)
  S-->>B: match:found (role callee)
  A->>A: getUserMedia, create RTCPeerConnection
  B->>B: getUserMedia, create RTCPeerConnection
  A->>S: rtc:offer (SDP)
  S-->>B: rtc:offer
  B->>S: rtc:answer (SDP)
  S-->>A: rtc:answer
  A->>S: rtc:ice (candidates)
  B->>S: rtc:ice (candidates)
  A-->B: Direct audio and video, or via TURN
```

| Concept | Plain-language meaning |
|---|---|
| **SDP offer/answer** | A text description of what each browser can send/receive (codecs, media). One side offers, the other answers |
| **ICE candidate** | One possible network path (address + port) to reach a browser. Browsers trickle these out and each side tries them |
| **STUN** | A server that tells your browser its public address. Cheap and light, but only *informs*, it does not relay |
| **TURN** | A server that *relays* media when no direct path works. Expensive because all the video passes through it |
| **Signaling** | Your server carrying offers, answers and candidates between exactly the two authorized participants |

**Why signaling alone is not enough:** many users sit behind NATs and firewalls (mobile carrier networks, campus Wi-Fi, strict routers) that block direct peer-to-peer traffic. STUN helps many but not all. Without TURN, those users simply cannot get video. Plan for it from the start.

**Practical rules**

- Ask for camera/mic *before* joining the video queue, so a denial is caught early and nobody is matched with an empty stream.
- Handle errors by name: `NotAllowedError` (permission denied), `NotFoundError` (no device), `NotReadableError` (device busy), `OverconstrainedError` (bad constraints). Show a human message and a retry button for each.
- Buffer ICE candidates that arrive before the remote description is set.
- On `failed` connection state, try one ICE restart, then show a clear failure message.
- On end/skip: `track.stop()` on every local track, `pc.close()`, clear `video.srcObject`, so the camera light turns off.
- `getUserMedia` only works on **HTTPS or localhost**. To test on a phone before deployment, use an HTTPS tunnel or a deployed staging URL.
- Authorization: `rtc:*` events are only relayed to the other participant of an active `sessionId` (Section 4.4).
- Cap video to roughly 640×360 and a modest bitrate to control TURN cost.
- **Cheapest sensible setup:** development with public STUN; test TURN with a free/trial managed TURN account or a local `coturn` container; production with a managed TURN service or `coturn` on a small VPS. TURN cost scales with relayed bandwidth: at 500 kbps each way, one relayed call is about 225 MB per direction per hour, roughly 0.2–0.5 GB per call-hour depending on how the provider counts. **Verify every provider's current pricing and quotas before you commit.**
- TURN credentials must be short-lived and issued by your server (`GET /api/ice-servers`), never hard-coded in the frontend.

---

## 5. Complete numbered development roadmap

**Rules for every module:** work on a branch named `feat/module-N-name`, finish the Definition of Done, then merge to `main`. Do not start module N+1 until module N passes its tests.

**Ordering decisions:** I kept your module order, with three engineering notes. (1) Module 0 creates the repo; Module 2 adds branching and CI, so you are protected before real code exists. (2) Basic rate limiting for OTP is built *inside* Module 5 because email abuse starts on day one; Module 10 generalises it. (3) A minimal admin page ships with Release 1 (a slice of Module 13) so reports have somewhere to go.

**Difficulty and time** are relative for a beginner using AI assistance: ★ easy, ★★ medium, ★★★ hard. Day counts are rough and include testing.

### Module 0: Requirements, scope, architecture, initial repository (★, 0.5–1 day)

- **Goal:** freeze decisions before code.
- **Features:** scope list (Section 2), this plan, a decisions log, a private GitHub repository.
- **Files:** `README.md`, `docs/PLAN.md` (this document's key decisions), `docs/DECISIONS.md`, `.gitignore`, `.env.example` (empty for now).
- **Backend/Frontend/DB/API:** none.
- **Depends on:** nothing.
- **Steps:** (1) look at real UIU email formats and write the allowed-domain list; (2) write a one-page MVP scope; (3) follow Section 7, steps 1–8 to create the private repo `kothakoi`; (4) commit the docs.
- **Test:** reread the scope and confirm every MVP feature maps to a module.
- **Expected result:** private repo on GitHub with README and plan.
- **Common bugs:** committing secrets, scope creep ("just one more feature").
- **Done when:** repo exists, is private, and `main` contains the docs.
- **Commit:** `docs: add project plan and decisions`.

### Module 1: Development environment and scaffolding (★★, 1 day)

- **Goal:** both apps run locally and talk to each other.
- **Features:** Vite React TS client, Express TS server, one health endpoint.
- **Files:** `client/` (Vite scaffold), `server/src/index.ts`, `server/package.json`, `server/tsconfig.json`, root `package.json` with `dev` script.
- **Backend:** `GET /api/health` returns `{ ok: true }`.
- **Frontend:** a page that calls `/api/health` and shows the result; Vite dev proxy forwards `/api` and `/socket.io` (with `ws: true`) to the server, so there is no CORS to debug.
- **DB/Events:** none.
- **Depends on:** 0.
- **Steps:** install Node LTS, Git, an editor, Docker Desktop (for Postgres later); scaffold; add `dev` scripts; run.
- **Test:** `npm run dev`, open `http://localhost:5173`, see "server OK".
- **Common bugs:** port already in use, wrong Node version, CORS errors (use the proxy), TypeScript import path errors.
- **Done when:** one command starts both; the page shows the live health result.
- **Commit:** `chore: scaffold client and server`.

### Module 2: Git/GitHub workflow and initial CI (★, 0.5 day)

- **Goal:** every change is reviewed by automated checks.
- **Features:** ESLint, Prettier, TypeScript check, Vitest placeholder, GitHub Actions, AI instruction file, PR template.
- **Files:** `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `eslint.config.js`, `.prettierrc`, `docs/AI_RULES.md`.
- **Steps:** add lint/typecheck/test/build scripts; CI runs `npm ci` and those scripts on push and pull requests; practise one branch → PR → merge (Section 7).
- **Test:** open a PR with a deliberate lint error and watch CI fail, fix it, watch it pass.
- **Common bugs:** lockfile out of sync, Node version mismatch in CI, CI not triggered because the workflow file is in the wrong folder.
- **Done when:** CI is green on `main`; you have merged at least one PR.
- **Commit:** `ci: add lint, typecheck, test, build workflow`.

### Module 3: UI design system, layout and landing page (★★, 2–3 days)

- **Goal:** a good-looking, responsive shell with reusable parts, using fake data only.
- **Features:** Tailwind theme (colors, fonts, spacing), `Button`, `Input`, `Card`, `Modal`, `Toast`, `Spinner`, header/footer layout, Landing, placeholder Login, Terms, Privacy, 404.
- **Files:** `client/src/components/ui/*`, `client/src/layouts/*`, `client/src/pages/*`, `client/src/router.tsx`.
- **Backend/DB/API:** none.
- **Depends on:** 1, 2.
- **Steps:** design tokens first; build components; compose pages; mobile-first CSS.
- **Test:** browser device mode at 360, 768 and 1280 px; keyboard-tab through every control; run a Lighthouse accessibility check.
- **Common bugs:** Tailwind styles missing (wrong `content` paths), horizontal scroll on phones, `100vh` problems on mobile browsers (use `dvh`).
- **Done when:** landing page looks right at all three sizes and components are reused, not copy-pasted.
- **Commit:** `feat(ui): design system and landing page`.

### Module 4: Database schema, migrations and seed data (★★, 1–2 days)

- **Goal:** the tables from Section 4.1 exist and are enforced by the database.
- **Files:** `docker-compose.yml` (local Postgres), `server/prisma/schema.prisma`, `server/prisma/seed.ts`, `server/src/db.ts`, `.env.example` gains `DATABASE_URL`.
- **Steps:** start Postgres; write the schema; `prisma migrate dev`; write a seed with fake users and one admin; export one shared Prisma client.
- **Test:** open Prisma Studio and inspect rows; write 3 integration tests: duplicate email rejected, self-block rejected, deleting a user cascades to the profile.
- **Common bugs:** Docker not running (connection refused), migration drift (in development only, `prisma migrate reset`), forgetting to commit the migration folder.
- **Done when:** a fresh clone can run `docker compose up`, `prisma migrate dev`, `prisma db seed` and get the same database.
- **Commit:** `feat(db): initial schema and seed`.

### Module 5: Authentication, email restriction, verification, protected routes (★★★, 3–5 days)

- **Goal:** only verified UIU mailbox owners get a session.
- **Backend:** `isAllowedEmail()` (parse, lowercase, exact domain match against `ALLOWED_EMAIL_DOMAINS`); `EmailSender` interface with a console implementation for development and a provider implementation for production; OTP via `crypto.randomInt` (6 digits), stored as an HMAC hash, expiry about 10 minutes, at most 5 attempts, single use; per-email and per-IP rate limits; identical response whether or not the address exists; sessions with a random 32-byte token (store only its hash) in an `httpOnly`, `SameSite=Lax`, `Secure`-in-production cookie; `requireAuth` middleware that also rejects banned users.
- **Frontend:** two-step login (email → code), `AuthProvider` calling `/api/auth/me`, `ProtectedRoute`, logout button.
- **DB:** uses `users`, `login_codes`, `sessions`.
- **Routes:** `POST /api/auth/request-code`, `/verify-code`, `/logout`, `GET /api/auth/me`.
- **Depends on:** 3, 4.
- **Test:** unit tests for tricky addresses (`a@uiu.ac.bd.evil.com`, `A@UIU.AC.BD`, extra spaces, missing `@`); 6th wrong code is locked; expired and reused codes fail; `/api/auth/me` without cookie is 401; logout invalidates the old cookie; cookie flags checked in dev tools.
- **Common bugs:** cookie not stored (missing `credentials`, wrong proxy), `Secure` cookie on plain HTTP, OTP emails landing in spam (needs a verified sending domain with SPF/DKIM in production), timing differences leaking whether an email exists.
- **Done when:** a non-UIU address can never log in, a UIU address can, and every test above passes.
- **Commit:** `feat(auth): email OTP login with sessions`.

### Module 6: Student profile and dashboard (★★, 1–2 days)

- **Goal:** a logged-in student picks a nickname and reaches the dashboard.
- **Backend:** `GET/PUT /api/profile`, `zod` rules (nickname 2–20 characters, up to 5 interests, each short), denylist for impersonating names such as admin or moderator.
- **Frontend:** first-login nickname screen, dashboard with **Text chat** and **Video chat** buttons (video disabled until Module 11), edit profile, logout, short privacy reminder.
- **DB:** `profiles`.
- **Depends on:** 5.
- **Test:** cannot reach the dashboard without a profile; invalid nicknames rejected by the API even if the UI check is bypassed; profile of user A cannot be edited by user B.
- **Common bugs:** redirect loops between login and onboarding, stale auth state after logout.
- **Done when:** the flow login → nickname → dashboard works on phone and desktop.
- **Commit:** `feat(profile): profile API and dashboard`.

### Module 7: Realtime infrastructure and connection management (★★★, 2–3 days)

- **Goal:** authenticated sockets with predictable connect, disconnect and reconnect behaviour.
- **Backend:** Socket.IO on the same HTTP server; auth middleware that reads the session cookie; `socket.data.userId`; one-active-connection policy; presence map; heartbeat.
- **Frontend:** one socket singleton, a `useSocket` hook, a visible connection-status banner.
- **Files:** `shared/events.ts` (typed event names and payloads used by both sides), `server/src/realtime/*`, `client/src/lib/socket.ts`.
- **Events:** a temporary `debug:ping` / `debug:pong`.
- **Depends on:** 5, 6.
- **Test:** two browsers (normal + private window) logged in as different users; unauthenticated and banned sockets are rejected; stop the server and watch the client reconnect.
- **Common bugs:** cookie not sent on the socket (proxy missing `ws: true`), duplicate listeners from React StrictMode (always remove listeners in the effect cleanup), many sockets per tab.
- **Done when:** ping/pong works for two users and reconnect is clean.
- **Commit:** `feat(realtime): authenticated socket layer`.

### Module 8: Random matching queue and race-condition handling (★★★, 3–4 days)

- **Goal:** two available users are paired exactly once.
- **Backend:** a plain `MatchingService` class with no socket code inside (so it is unit-testable) implementing Section 4.5: join, leave, try-match, end, recent-partner cooldown, block check, stale sweep; the socket layer only calls it; a `chat_sessions` row is written after pairing.
- **Frontend:** "Looking for someone…" screen with a cancel button; navigate to the chat screen on `match:found`.
- **Events:** `queue:join`, `queue:leave`, `queue:waiting`, `match:found`.
- **Depends on:** 4, 7.
- **Test:** unit tests: 2 users match; 3 users leave 1 waiting; 100 simulated simultaneous joins produce no user in two pairs; blocked pair never matches; double join rejected; disconnect removes the user. Manual: three browser windows.
- **Common bugs:** an `await` between find and remove; ghost users after a disconnect; both sides believing they are the caller.
- **Done when:** all the tests pass and three windows behave correctly.
- **Commit:** `feat(matching): queue with atomic pairing`.

### Module 9: Text chat, delivery, skip, disconnect and reconnect (★★★, 3 days)

- **Goal:** a reliable two-person text conversation.
- **Backend:** `chat:message` validated with `zod` (trimmed, 1–1000 characters), membership check, per-user message rate limit, server-generated `messageId` and timestamp, acknowledgement back to the sender using `clientMsgId` so retries are not duplicated; a per-room memory buffer of the last ~20 messages (for reports only); `chat:skip` and `chat:end`; the 15-second reconnect grace period; room deleted from memory when it ends.
- **Frontend:** chat screen with message list (plain text, auto-scroll), input, Send, Skip, End; states *sending / sent / failed*; "partner left" banner with a **Find next** button; reconnect banner.
- **DB:** `chat_sessions.ended_at` and `ended_reason` updated on end.
- **Events:** `chat:message`, `chat:typing`, `chat:skip`, `chat:end`, `chat:ended`.
- **Depends on:** 8.
- **Test:** two windows chat both ways; refresh within 15 seconds resumes the room; after 15 seconds the partner is told; a repeated `clientMsgId` is ignored; typing `<script>alert(1)</script>` appears as literal text; a 1001-character message is rejected; a user cannot send into a room they are not in.
- **Common bugs:** duplicate messages (double listeners), messages accepted after the room ended, memory leak (rooms never removed), chat not scrolling.
- **Done when:** text chat works through skip, end, refresh and disconnect with no duplicates.
- **Commit:** `feat(chat): realtime text chat with skip and reconnect`.

### Module 10: Reporting, blocking, rate limiting, basic moderation (★★★, 2–3 days)

- **Goal:** users can protect themselves and you can see abuse.
- **Backend:** `POST /api/reports` where **the reported user is derived on the server from the chat session**, never accepted from the client; the reporter must have been in that session recently; evidence is copied from the room buffer; `POST/DELETE /api/blocks`; blocks update the in-memory block sets of both users immediately; a general rate-limit middleware, queue-join cooldown and message limits; simple flagging of users reported by several different people.
- **Frontend:** Report button + reason modal, Block option, confirmation toast.
- **DB:** `reports`, `blocks`.
- **Depends on:** 4, 5, 9.
- **Test:** cannot report a user you never chatted with; duplicate reports are de-duplicated; a blocked pair never rematches; exceeding limits returns HTTP 429 in the standard error format.
- **Common bugs:** trusting a client-sent user ID, blocks only applied after reconnect, rate limiter keyed by IP only (many students share campus IPs: key by user ID as well).
- **Done when:** report → database row with evidence; block → never matched again.
- **Commit:** `feat(safety): reports, blocks, rate limits`.

### Module 11: WebRTC video chat and signaling (★★★, 4–5 days)

- **Goal:** two matched users see and hear each other (public STUN only).
- **Backend:** relay `rtc:offer`, `rtc:answer`, `rtc:ice` only to the partner in the same active session; size limits on payloads; reuse the Module 8/9 room, skip and end logic.
- **Frontend:** `useWebRTC` hook (create connection, buffer early candidates, handle states), local preview, remote video, mute/camera toggles, permission check before joining the video queue, named error messages, full cleanup on end.
- **Events:** `rtc:*` from Section 4.3.
- **Depends on:** 8, 9.
- **Test:** two browsers on one machine (Chrome + Firefox); deny permission; unplug or cover the camera; skip and confirm the camera light turns off; later test from a phone over HTTPS.
- **Common bugs:** black remote video (missing `autoPlay` and `playsInline`), candidates arriving before the remote description, both sides sending an offer (use the server-assigned `role`), tracks not stopped, camera requested twice under React StrictMode, Safari autoplay rules.
- **Done when:** video connects on the same network, ends cleanly, and failures show readable messages.
- **Commit:** `feat(video): WebRTC signaling and call UI`.

### Module 12: STUN/TURN, connection failures, network testing (★★★, 2–3 days)

- **Goal:** video also works across restrictive networks.
- **Backend:** `GET /api/ice-servers` returns STUN plus TURN with **short-lived credentials** (provider API, or an HMAC username/password for `coturn` shared-secret mode); `TURN_*` values live only in server environment variables.
- **Frontend:** uses the returned servers; shows *Connecting / Reconnecting / Failed*; one ICE restart attempt; a developer-only switch to force relay (`iceTransportPolicy: 'relay'`) to prove that TURN works.
- **Depends on:** 11.
- **Test matrix:** same Wi-Fi; laptop on Wi-Fi ↔ phone on mobile data; a VPN; two different browsers; forced relay mode; TURN credentials expired; TURN unreachable.
- **Common bugs:** TURN secrets in the frontend bundle, expired credentials, blocked UDP ports (offer TURN over TCP/TLS on port 443 where the provider supports it), server clock drift.
- **Done when:** a forced-relay call succeeds and a relay failure produces a clear message, not a frozen screen.
- **Commit:** `feat(video): TURN credentials and failure handling`.

### Module 13: Admin tools, privacy controls, operational monitoring (★★, 3 days; a minimal slice ships with Release 1)

- **Goal:** you can act on reports and see what the system is doing.
- **Backend:** `requireAdmin` middleware; list reports; view evidence; actions *dismiss, warn, suspend (with expiry), ban, unban*, each writing `moderation_actions`; a ban deletes the user's sessions and disconnects their sockets immediately; "delete my account" endpoint; scheduled retention job; structured logs (e.g. `pino`) that never include emails or message text; optional error tracking and an uptime check on `/api/health` (verify free quotas).
- **Frontend:** `/admin` pages (reports table, detail with evidence, action buttons), account-deletion button.
- **Depends on:** 5, 10 (and 12 for connection monitoring).
- **Test:** a non-admin gets 403 from every admin route; a ban takes effect on a live socket; the retention job deletes old rows (run it in dry-run mode first).
- **Common bugs:** admin protected only in the UI, a banned user's open socket survives, personal data in logs.
- **Done when:** one report can travel from submission to a ban without touching the database by hand.
- **Commit:** `feat(admin): moderation tools and retention`.

### Module 14: Integration testing, security review, responsive testing, bug fixing (★★★, 3–5 days)

- **Goal:** prove it works together and fix what breaks.
- **Steps:** run the full matrix in Section 10; write a Playwright end-to-end test using two browser contexts (login → match → chat → skip → report); add `helmet` security headers and a Content-Security-Policy; run `npm audit`; scan the repo history for secrets; run a small load script with 50–200 simulated socket clients; test on real phones; triage bugs as high / medium / low.
- **Depends on:** all earlier modules.
- **Common bugs:** things that only break with 3+ users, mobile keyboard covering the input, flaky end-to-end timing.
- **Done when:** no open high-severity bugs and the matrix is fully ticked.
- **Commit:** `test: e2e suite and security hardening`.

### Module 15: Production deployment, domain/HTTPS, final demonstration (★★★, 2–3 days)

- **Goal:** a public HTTPS URL that works from phones on mobile data.
- **Steps:** create a managed Postgres; create the web service from the GitHub repo; set environment variables in the host dashboard; build command builds client and server; start command runs `prisma migrate deploy` then the server; set `NODE_ENV=production` and trust the host's proxy (so `Secure` cookies and client IPs work); confirm WebSocket support; use the host's automatic HTTPS certificate (add a custom domain if you buy one); configure SPF/DKIM/DMARC for the email-sending domain; set TURN credentials; deploy a **staging** copy first; run the smoke test; keep a rollback note (redeploy the previous release; treat migrations as forward-only and take a database backup before each deploy).
- **Common bugs:** cookie not `Secure` because the proxy is not trusted, Socket.IO silently falling back to slow polling, free hosting sleeping, mixed content.
- **Done when:** two phones on different networks complete login → match → chat → video on the live URL.
- **Commit/tag:** `release: v1.0.0` (a Git tag).

### Module 16: Documentation, screenshots, report and presentation (★★, 2–3 days)

- **Goal:** a finished, explainable project.
- **Deliverables:** see Section 12. Write `README.md` (setup in under 10 steps), `docs/ARCHITECTURE.md` with the diagrams, `docs/API.md`, `docs/TESTING.md` with evidence, `docs/DEMO.md` (script), plus report and slides.
- **Done when:** a friend can clone the repo and run it using only the README.
- **Commit:** `docs: final documentation`.

---

## 6. Module dependency and integration map

| Module | Depends on | Unlocks |
|---|---|---|
| 0 Scope + repo | none | 1 |
| 1 Scaffolding | 0 | 2, 3, 4 |
| 2 Git + CI | 1 | 3, 4 |
| 3 UI + landing | 1, 2 | 5, 6 |
| 4 Database | 1, 2 | 5, 8 |
| 5 Auth | 3, 4 | 6, 7 |
| 6 Profile + dashboard | 5 | 7 |
| 7 Realtime | 5, 6 | 8 |
| 8 Matching | 4, 7 | 9, 11 |
| 9 Text chat | 8 | 10, 11 |
| 10 Report/block/limits | 4, 5, 9 | 13 |
| 11 WebRTC video | 8, 9 | 12 |
| 12 STUN/TURN | 11 | 13, 14 |
| 13 Admin + monitoring | 5, 10 (12) | 14 |
| 14 Integration + security | all above | 15 |
| 15 Deployment | 14 | 16 |
| 16 Documentation | 15 | delivery |

Modules 3 and 4 are independent of each other; do the UI first (it keeps motivation high), then the database. Everything from Module 5 on is strictly sequential.

### Correct integration order

1. **Contract first.** Before writing a module, write its request/response shapes or socket events in `shared/`.
2. **Backend second**, tested without any UI (Vitest, `curl`, or a REST client).
3. **Frontend third**, built against the *real* backend, not mock data. Fake data is allowed only in Module 3.
4. **Connect and smoke-test at the end of every module** with two browsers, then merge.

### Interface contracts to freeze early

| Contract | Where it lives | Frozen at |
|---|---|---|
| Error response format `{ error: { code, message, details } }` and shared error codes | `shared/errors.ts` | Module 1 |
| Database schema | `server/prisma/schema.prisma` | Module 4 |
| Auth/session format: cookie `kothakoi_session`, `httpOnly`, random 32-byte token, server stores only its hash | `docs/CONTRACTS.md` | Module 5 |
| API request/response shapes (`zod` schemas, types inferred from them) | `shared/api.ts` | each module, before coding |
| WebSocket event names and payloads | `shared/events.ts` | Module 7 |
| Matching state machine (`IDLE/QUEUED/IN_CHAT`) | Section 4.5 and `docs/CONTRACTS.md` | Module 8 |
| Chat session identifier: server-generated random UUID, opaque to clients | `docs/CONTRACTS.md` | Module 8 |
| WebRTC signaling messages and caller/callee roles | `shared/events.ts` | Module 11 |

### How to avoid modules that later fail to integrate

- Both sides import the **same** types and `zod` schemas from `shared/`, so a mismatch becomes a compile error instead of a runtime mystery.
- To change a contract, edit `shared/` **first**, then the backend, then the frontend, in one branch.
- Build thin end-to-end slices, not big isolated halves.
- Keep `docs/CONTRACTS.md` up to date; it is also what you paste into AI prompts.
- Nothing merges while CI is red.

---

## 7. GitHub setup tutorial from zero

### The vocabulary, in one table

| Term | What it is |
|---|---|
| **Local project folder** | The `kothakoi` folder on your computer. This is where you edit files |
| **Git** | A program on your computer that records the history of that folder as a series of snapshots |
| **Commit** | One saved snapshot with a message. You can always return to it |
| **Branch** | A parallel line of commits, so you can build a feature without breaking the working `main` |
| **GitHub** | A website that stores a copy of your Git history online (backup, collaboration, CI, issues) |
| **Deployment** | Running the built app on a hosting server. Pushing to GitHub does **not** deploy by itself unless you connect your host to the repo |

Git works fine without GitHub; GitHub is just the online copy. A deployment is a third, separate thing.

### Steps 1–8: create the repository (Module 0)

1. **GitHub account.** Use your existing account or sign up at github.com, then turn on two-factor authentication.
2. **Install Git** from git-scm.com (Windows), `xcode-select --install` or Homebrew (macOS), or `sudo apt install git` (Linux). Check it worked:

```
git --version
```

3. **Tell Git who you are.** In GitHub → Settings → Emails, enable *Keep my email address private* and use the `...@users.noreply.github.com` address shown there, so your UIU email is not baked into commits.

```
git config --global user.name "Your Name"
git config --global user.email "123456+yourusername@users.noreply.github.com"
git config --global init.defaultBranch main
```

4. **Sign in from your computer.** Git for Windows includes a login helper that opens a browser on your first push. Alternatively install the GitHub CLI (`gh`) and run `gh auth login`.
5. **Create the private repository** on github.com: New repository → name `kothakoi` → **Private** → do *not* tick "Add a README" or ".gitignore" (you will create them locally).
6. **Create the local folder and start Git:**

```
mkdir kothakoi
cd kothakoi
git init
```

7. **Create `.gitignore` and `README.md` before the first commit.** A starting `.gitignore`:

```
node_modules/
dist/
build/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
```

Starter `README.md`: project name, one-paragraph description, status ("in development"), tech stack, "how to run locally" (fill in later), and a note that the repo is private.

8. **First commit and push:**

```
git add .                      # stage everything new
git status                     # check: no .env or node_modules listed
git commit -m "chore: initial commit"   # save the snapshot
git branch -M main             # make sure the branch is called main
git remote add origin https://github.com/YOUR-USERNAME/kothakoi.git   # link to GitHub
git push -u origin main        # upload and remember this link
```

### Daily workflow (Module 2 onward)

```
git switch main
git pull                                   # get the latest main
git switch -c feat/module-3-landing        # new branch for this module
# ...work, test...
git add .
git commit -m "feat(ui): landing page"
git push -u origin feat/module-3-landing   # first push of the branch
```

1. On GitHub click **Compare & pull request**. Even alone, read your own diff once.
2. Wait for the CI checks to turn green, then merge (squash and merge keeps history tidy).
3. Clean up locally:

```
git switch main
git pull
git branch -d feat/module-3-landing
```

**Commit message style:** `type(scope): short description` with types `feat`, `fix`, `docs`, `test`, `chore`, `ci`, `refactor`. Commit after each small working step, not only at the end of a module. After finishing a module, tag it so you have a named checkpoint:

```
git tag module-5-done
git push origin module-5-done
```

### Merge conflicts

A conflict means two branches changed the same lines. Solo, keep branches short and they are rare. When one happens:

```
git switch feat/my-branch
git pull origin main        # or: git merge main  -> Git reports CONFLICT in some files
```

Open each listed file. You will see markers like `<<<<<<<`, `=======`, `>>>>>>>`. Keep the version you want, delete the marker lines, then:

```
git add the-file-you-fixed
git commit                   # finishes the merge
```

Run the tests again before pushing.

### Issues, milestones, and automated checks

- **Milestones:** create `Release 1: Text MVP`, `Release 2: Video`, `Release 3: Polish`.
- **Issues:** one issue per module, pasting its *Definition of Done* as a checklist, plus an issue for each bug. Write `Closes #12` in a pull request to close issue 12 on merge.
- **CI:** `.github/workflows/ci.yml` (Module 2). A minimal version:

```
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

(Verify current action versions and the Node LTS version when you create the file.)

### Undoing mistakes safely

| Situation | Command |
|---|---|
| Throw away uncommitted edits to one file | `git restore path/to/file` |
| Undo the last commit but keep the edits (not yet pushed) | `git reset --soft HEAD~1` |
| Undo a commit that is already pushed or merged | `git revert <commit-hash>` (creates a new commit that cancels it; safe) |
| Go back to a known-good checkpoint | `git switch -c fix/rollback module-5-done` |
| See history to find a hash | `git log --oneline` |

**Avoid `git reset --hard` and `git push --force` until you understand them: they can destroy work.** Before every AI task, commit (`git commit -m "checkpoint: before AI task"`), so a bad AI change is one `git restore .` away from being gone.

### Secrets and `.env.example`

- **Real values live in `.env` (ignored by Git). Placeholders live in `.env.example` (committed).** A new machine copies `.env.example` to `.env` and fills it in.
- **Why never commit secrets:** Git history is permanent (deleting the file later does not remove it from old commits), automated bots scan GitHub for keys, private repos can be made public or shared by mistake, and a leaked database URL, email key or TURN secret lets strangers read data, send mail as you, or run up your bills.
- **If you ever commit a secret:** revoke and replace it immediately. Cleaning the history is secondary.
- In production, set values in your host's environment-variable dashboard. In CI, use GitHub *Actions secrets*.
- Generate random secrets with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example `.env.example` (placeholders only):

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://kothakoi:CHANGE_ME@localhost:5432/kothakoi
SESSION_SECRET=generate-a-long-random-value
OTP_HMAC_SECRET=generate-a-long-random-value
ALLOWED_EMAIL_DOMAINS=uiu.ac.bd
EMAIL_PROVIDER=console
EMAIL_API_KEY=
EMAIL_FROM=
TURN_URL=
TURN_SECRET=
```

**Keep the repository private** until you have reviewed it. Do not publish unfinished code; if your university needs to see it, add the examiner as a collaborator instead of making it public.

---

## 8. Project folder structure

### Initial structure (after Modules 0–2; create nothing else yet)

```
kothakoi/
├─ .github/workflows/ci.yml
├─ client/                 Vite + React + TypeScript
│  └─ src/ (main.tsx, App.tsx)
├─ server/
│  └─ src/index.ts
├─ docs/ (PLAN.md, DECISIONS.md, AI_RULES.md)
├─ .env.example
├─ .gitignore
├─ package.json
└─ README.md
```

### Structure by the end of the project

```
kothakoi/
├─ client/src/
│  ├─ components/ui/       reusable Button, Input, Modal (Module 3)
│  ├─ components/chat/     MessageList, MessageInput (Module 9)
│  ├─ components/video/    VideoTile, Controls (Module 11)
│  ├─ features/            auth/, profile/, matching/, chat/, admin/ (hooks + API calls)
│  ├─ layouts/  pages/  lib/ (api.ts, socket.ts)  router.tsx
├─ server/
│  ├─ prisma/              schema.prisma, migrations/, seed.ts (Module 4)
│  └─ src/
│     ├─ index.ts          starts the server
│     ├─ app.ts            Express setup
│     ├─ config/env.ts     validated environment variables
│     ├─ db.ts             shared Prisma client
│     ├─ routes/           thin: validate input, call a service, return result
│     ├─ services/         business logic: auth, matching, reports, moderation
│     ├─ realtime/         Socket.IO setup and event handlers
│     ├─ middleware/       requireAuth, requireAdmin, rateLimit, errorHandler
│     └─ jobs/             retention cleanup (Module 13)
├─ shared/                 events.ts, api.ts, errors.ts (types + zod schemas)
├─ e2e/                    Playwright tests (Module 14)
└─ docs/                   CONTRACTS.md, ARCHITECTURE.md, API.md, TESTING.md, DEMO.md
```

**Organisation rules that keep AI-generated code tidy:**

- **Components** only draw UI. **Features/hooks** hold state and API calls.
- **Routes** are thin; **services** hold business logic and know nothing about Express or sockets, so they are easy to unit-test (the `MatchingService` is the best example).
- **Validation** schemas (`zod`) live in `shared/` and types are *inferred* from them, never written twice.
- **Tests** sit next to the file they test (`matching.service.test.ts`); end-to-end tests live in `e2e/`.
- **Add a folder only when the module that needs it starts.** An empty folder structure created in advance just invites AI agents to fill it with unneeded code.

---

## 9. Google Antigravity efficiency strategy and reusable prompts

**About limits:** AI Ultra gives you generous access, but **not unlimited use**. Actual quotas depend on your current plan rules, the model you pick, and how much code and context each task uses. Check the current limits in your account and in Antigravity's own settings, and treat tokens and time as a budget. The habits below save budget whatever the numbers are.

### The ten habits

1. **Plan before code.** Ask for a plan first and approve it. A rejected plan costs a few lines; a rejected implementation costs a whole generation plus debugging.
2. **Keep a persistent project instruction file.** Antigravity has a way to give workspace-wide instructions (check its current documentation for the exact name and location). Whatever it is called, also keep `docs/AI_RULES.md` in the repo and begin every session with "read `docs/AI_RULES.md`, `docs/CONTRACTS.md` and `docs/HANDOFF.md`". That works in any tool.
3. **Document decisions** in `docs/DECISIONS.md` (one line each: date, decision, reason). Stops the agent from re-debating the stack.
4. **Make the agent inspect before it edits:** "list the files you will read and change, and why."
5. **One small module or slice per task**, ideally touching 3–5 files. Never "build the whole chat feature".
6. **Forbid unnecessary rewrites:** "change only the listed files; do not reformat or rewrite working code."
7. **Reuse:** point to existing components and patterns by path instead of pasting them.
8. **Debug with evidence:** the exact error, the file, what you expected, what happened, what you already tried. Not "it doesn't work".
9. **Review every diff before accepting.** Look for new dependencies, deleted code, hard-coded secrets, client-trusted IDs, and files you did not expect.
10. **Checkpoint with Git before each AI task** (Section 7), and run `npm run lint`, `npm run typecheck`, `npm test` before committing.

Save budget further by starting a **fresh session per module** (with the handoff note) rather than letting one conversation grow forever, referring to files by path instead of pasting them, and using a lighter, faster model for small edits and the strongest one you have for planning and security review (use whatever your plan offers).

### The loop for every module

1. Commit a checkpoint. 2. Run Prompt B, phase 1 (plan only). 3. Approve or correct the plan. 4. Let it implement. 5. Review the diff (Prompt D). 6. Run tests (Prompt G). 7. Manual two-browser test. 8. Commit (Prompt H). 9. Update the handoff note (Prompt I).

### `docs/AI_RULES.md` starter

```
# AI rules for KothaKoi
Stack: client = React + Vite + TypeScript + Tailwind. server = Node + Express + TypeScript + Socket.IO.
Database = PostgreSQL + Prisma. Shared types and zod schemas live in shared/.

1. Read docs/CONTRACTS.md and docs/HANDOFF.md before doing anything.
2. Work only on the current module named in HANDOFF.md. Add no extra features.
3. Inspect existing files first. Reuse existing components, utilities and patterns.
4. Change the fewest files possible. Never rewrite a working file wholesale.
5. Validate all input on the server with zod. Never trust a user ID sent by the client.
6. Never expose a user's email or internal ID to a chat partner.
7. Never log emails or message text. Never commit secrets. Use placeholders in .env.example.
8. Add or update tests for new logic. Run lint, typecheck and tests before saying done.
9. Finish with: files changed, what changed (max 10 lines), how to test it manually.
10. If something is unclear, ask one question instead of guessing.
```

### Reusable prompts

Replace the text in `[brackets]`.

**A. Project setup (Module 1)**

```
Read docs/AI_RULES.md and docs/PLAN.md. Task: Module 1 scaffolding only.
Create a client/ folder (Vite + React + TypeScript + Tailwind) and a server/ folder
(Node + Express + TypeScript) with one endpoint GET /api/health returning { ok: true }.
Configure the Vite dev proxy for /api and /socket.io (ws: true). Add root scripts: dev, lint,
typecheck, test, build. Do not add auth, database or any other feature.
First reply with the list of files you will create and the commands I must run. Wait for my OK.
```

**B. Implement one module (two phases)**

```
Read docs/AI_RULES.md, docs/CONTRACTS.md and docs/HANDOFF.md.
Current task: Module [N] - [NAME]. Scope: [paste the module's Features list only].
PHASE 1 - PLAN ONLY, write no code yet: (1) list existing files you inspected, (2) list files you
will create or change and why, (3) list new dependencies (justify each), (4) list the exact
API routes / socket events / DB changes, (5) list the tests you will write.
Stop and wait for my approval. In PHASE 2, after I approve, implement exactly that plan.
```

**C. Connect frontend and backend**

```
Module [N]. The backend routes/events are done and tested; the contract is in shared/[file].
Wire the frontend to the REAL backend (no mock data). Use the existing api.ts / socket.ts
helpers and the shared types. Handle loading, error (using the standard error format) and
empty states. Change only [list files]. Then give me a manual test script with two browsers.
```

**D. Review generated code**

```
Review the uncommitted diff (git diff). Do not change anything. Report, in order of severity:
bugs, security problems (client-trusted IDs, missing authorization or validation, secrets, XSS),
unrequested changes or deleted code, new dependencies, places that ignore docs/CONTRACTS.md,
and missing tests. For each: file, line, why it matters, smallest fix.
```

**E. Debug a specific error**

```
Problem: [one sentence]. Expected: [..]. Actual: [..].
Exact error / console output: [paste only the relevant lines].
File(s) involved: [paths]. What I already tried: [..].
First explain the most likely cause and how to confirm it (a log or a test) before changing code.
Then propose the smallest fix touching only the files above. Do not rewrite anything else.
```

**F. Security review**

```
Security review of [module / folder]. Do not modify files. Check: authentication on every route
and socket event; authorization (is the user a participant of this session?); input validation
and length limits; XSS (messages must render as plain text); rate limiting; cookie flags;
whether any email, user ID or session token can reach another user, a log line or the frontend
bundle; secrets in code; error messages that leak internals. Output a table:
issue, severity, location, exploit scenario, fix.
```

**G. Write and run tests**

```
For [module / function], write tests with Vitest. Cover: the normal case, invalid input,
unauthorized access, and these edge cases: [list]. Reuse existing test helpers. Run
npm run lint, npm run typecheck and npm test, and show me the output. If a test fails, explain
whether the code or the test is wrong before changing either.
```

**H. Prepare a Git commit**

```
Run git status and git diff --stat. Confirm that no .env, secrets, node_modules or unrelated
files are included. Run lint, typecheck and tests. Then suggest: (1) which files to stage,
(2) one commit message in the form type(scope): description, (3) the exact git commands.
Do not run git push.
```

**I. Summarize project state for the next AI session**

```
Update docs/HANDOFF.md (max 40 lines): current module and status; what is done and tested;
what remains; decisions made this session; known bugs; exact commands to run, test and reset the
database; contracts that changed; the next three tasks. Facts only, no code listings.
```

---

## 10. Testing and security checklist

### The four kinds of tests, in plain language

| Kind | What it means | Example in KothaKoi | Speed / quantity |
|---|---|---|---|
| **Unit test** | Checks one small function alone | `isAllowedEmail('a@uiu.ac.bd.evil.com')` returns false | Very fast, many |
| **Integration test** | Checks several parts together, e.g. an API route plus a real test database | Request a code, verify it, receive a session cookie | Medium |
| **End-to-end (E2E) test** | A robot browser (Playwright) plays the part of two users | Two users log in, match, chat, skip | Slow, few |
| **Manual test** | You, two browsers and a phone | Camera permission, mobile data, how it *feels* | Needed for video and networks |

### Testing matrix

| Area | What to test | Type | Expected result |
|---|---|---|---|
| Invalid email domains | Other domains, `x@uiu.ac.bd.evil.com`, uppercase, spaces, no `@` | Unit + integration | Rejected with the standard error; no email sent |
| Email verification | Right code; wrong code; sixth wrong attempt; expired; reused | Integration | Only the right, fresh, unused code works; lockout after the limit |
| Session expiry | Expired or tampered cookie; logout then reuse the old cookie | Integration + manual | 401 and redirect to login; old token is dead |
| Unauthorized API access | Every route without a cookie; student calling admin routes | Integration | 401 / 403, never data |
| Matching two users | Two users join the same mode | Unit + E2E | Exactly one pair, both notified |
| Many users at once | 100 simulated joins; load script with 50–200 sockets | Unit + script | No user in two pairs; no crash |
| Skip and disconnect | Skip; close tab; kill network; wait past the grace period | E2E + manual | Partner informed once; both return to a valid state |
| Message delivery | Order, acknowledgement, 1001 characters, `<script>` text | Integration + E2E | Delivered once, in order; over-limit rejected; shown as plain text |
| Duplicate events | Same `clientMsgId` twice; double-click Find; double skip | Unit + integration | Ignored or handled once |
| Browser refresh | Refresh while queued, in chat (inside and outside the grace period), mid-login | Manual + E2E | Defined, predictable behaviour; no ghost users |
| Camera/mic denial | Deny; no device; device in use by another app | Manual | Named message and a retry button; no crash |
| WebRTC failure | Forced relay; TURN unreachable; switch Wi-Fi to mobile data mid-call | Manual | Reconnect attempt, then clear failure message |
| Mobile responsiveness | 360 px width, iOS Safari, Android Chrome, on-screen keyboard | Manual | No horizontal scroll; input stays visible |
| Reporting and blocking | Report a non-partner; duplicate report; block then rematch | Integration + E2E | Rejected / de-duplicated / never rematched |
| Deployment configuration | Missing env var; HTTPS redirect; `Secure` cookie; WebSocket upgrade; migrations applied | Smoke test | Server fails fast with a clear message; everything above is true on the live URL |
| Secrets and access control | Search repo and history for keys; confirm `.env` is untracked; inspect the frontend bundle; database not publicly reachable; admin routes locked | Manual + tool scan | Nothing sensitive found |

### Realistic risks and mitigations

No anonymous chat platform is perfectly safe or perfectly anonymous. The goal is to reduce risk and be honest about what remains.

| Risk | Mitigation |
|---|---|
| People who are not current students get in | Exact-domain parsing, ban by normalised email, optional semester re-verification, honest disclosure (Section 1) |
| Email privacy | Never sent to partners; excluded from logs; visible only to admins handling a report (say so in the Privacy Policy) |
| OTP brute force and email bombing | 6-digit code stored as a hash, 10-minute expiry, attempt cap, per-email and per-IP limits |
| Session theft | `httpOnly`, `Secure`, `SameSite` cookie; token stored only as a hash; server-side revocation; ban kills sessions |
| XSS | Render messages and nicknames as text only; never `dangerouslySetInnerHTML`; `helmet` and a Content-Security-Policy |
| CSRF and WebSocket hijacking | `SameSite=Lax`, JSON-only state-changing routes, Origin checks on REST and on the Socket.IO handshake |
| Joining someone else's room | Server-side membership check on every `chat:*` and `rtc:*` event (Section 4.4) |
| Spam and harassment | Message and queue rate limits, reports, blocks, fast bans |
| Explicit or abusive **video** | Peer-to-peer video cannot be inspected by your server. Mitigate with reports, quick bans, clear rules, and by releasing video only after text moderation works. Be honest that it cannot be eliminated |
| **Partner can learn your IP address** | With a direct WebRTC connection, peers can see each other's public IP. Either disclose this clearly or route video through TURN relay-only (higher cost) |
| Screenshots and recording | Impossible to prevent; warn users not to share identifying information |
| Data minimisation and retention | No message history, no passwords, no stored media, scheduled deletion of old sessions, login codes and chat metadata (Section 4.2) |
| Logging | Structured logs with internal IDs only; no emails, no message text, no tokens |
| Secrets and transport | HTTPS only, secrets only in environment variables, secret scan before each release |
| Camera/microphone consent | Explain before the browser prompt, ask only when the user starts video, visible camera-on indicator, one-click stop |

**Documents to write before launch:** a plain-language **Privacy Policy** (what you collect, who can see it, how long you keep it, how to delete the account, the IP and screenshot caveats) and **Terms of Use** (UIU-only, behaviour rules, what happens when you are banned, no guarantee of anonymity or safety). Add an in-app *safety tips* panel. Write a short **moderation procedure**: who reviews reports, how quickly, severity levels, the available actions, how a user appeals, and how threats or self-harm are escalated (agree a contact with the university). Check with UIU whether the project needs formal permission, since it uses the university's name and student identity.

---

## 11. Cost and deployment plan

I am not quoting prices because they change. Use this as a **checklist of what to verify** with each provider before you commit.

| Cost driver | Local development | University demo | Limited pilot | Larger production |
|---|---|---|---|---|
| Backend hosting (always-on Node service with WebSocket support) | Free (your laptop) | Free or lowest tier may work, but check that it does not sleep | Low paid tier, a stable always-on instance | Larger instance(s); Redis and several instances (Section 4.5) |
| Database | Local Docker Postgres, free | Free tier if available; check storage and inactivity rules | Small paid managed plan with backups | Larger plan, connection pooling, replicas |
| Outbound bandwidth | None | Tiny (text only) | Small for text; video itself is peer-to-peer and does not pass through your server | Grows with users and TURN |
| Concurrent users | 2–3 browser tabs | Dozens at most | Hundreds; check memory per idle socket on your plan | Needs load testing and scaling |
| Email OTP volume | Console output, free | Free tier is likely enough: check daily limits and deliverability to UIU addresses | Count: users × logins per month | Paid plan, dedicated sending domain |
| TURN relay traffic | Not needed (or a free trial/local `coturn`) | Free trial/free allowance; demo with two networks | Usually the **largest variable cost**: billed by relayed GB or by VPS egress | Plan, cap and monitor it |
| Monitoring and error tracking | Console logs | Host's built-in logs | Uptime check + error tracker free tier | Paid plans, alerting |
| Domain and HTTPS | `localhost` | Host's free subdomain with HTTPS | Custom domain (annual fee), automatic certificate | Same |
| CI | Free | Free quota | Check private-repo minutes | Check |

**Verify before deployment:** host plan limits (sleep behaviour, RAM, WebSocket support, bandwidth); managed Postgres (storage, pausing or expiry of free databases, connection limits, backups); email provider (daily and monthly limits, domain verification, and whether messages reach UIU mailboxes rather than spam); TURN (price per GB, free allowance, protocols such as TLS on 443, regions); domain registrar fees and renewal; GitHub Actions minutes for private repos; error-tracking quotas. Choose the hosting region **closest to Bangladesh** that your providers offer, since latency affects realtime feel and TURN quality. Also verify whether the hosting and email provider terms allow your use.

To control costs: cap video resolution and bitrate, set a TURN usage alert, cap concurrent video sessions, and make video available only during chosen hours during the pilot if needed.

---

## 12. Final launch checklist and deliverables

### Launch checklist

- ☐ All module Definitions of Done met; CI green on `main`; release tagged.
- ☐ Section 10 matrix completely ticked, with evidence saved.
- ☐ No high-severity bugs open; `npm audit` reviewed.
- ☐ No secrets in the repo or its history; `.env` untracked; frontend bundle checked.
- ☐ Production environment variables set; `NODE_ENV=production`; strong random secrets.
- ☐ HTTPS works, cookies are `Secure`, WebSocket upgrade works, health check passes.
- ☐ Database migrated, backed up, and not publicly reachable.
- ☐ Email sending domain verified (SPF/DKIM/DMARC); OTP reaches a real UIU inbox.
- ☐ TURN credentials issued by the server; a forced-relay call works on the live site.
- ☐ Admin account created; ban flow tested on live data.
- ☐ Privacy Policy, Terms of Use, safety tips and moderation procedure published.
- ☐ Rate limits and logging verified; logs contain no emails or messages.
- ☐ Tested on at least two phones (iOS/Android) over mobile data.
- ☐ Rollback plan and a contact email for reports and takedown requests ready.
- ☐ UIU informed or approved, if required.

### Deliverables

| Deliverable | Where it comes from |
|---|---|
| Working web application | Modules 1–15 |
| GitHub repository (private; invite the examiner) | Section 7 |
| README and setup instructions | Module 16 |
| Architecture diagram | Section 3 (export or screenshot the Mermaid diagram) |
| Database diagram | Generated from `schema.prisma` or drawn from Section 4.1 |
| API documentation | `docs/API.md` from Section 4.3 |
| Testing evidence | CI run screenshots, test output, completed matrix |
| Deployment link | Module 15 |
| Screenshots | Landing, login, dashboard, text chat, video, report, admin |
| Final project report | Intro, requirements, architecture, implementation by module, testing, security and privacy, limitations, future work |
| Presentation outline | Problem → users → architecture → live demo → hardest problems (matching races, WebRTC/TURN) → security and ethics → limitations → future work |
| Demonstration script | Two devices: log in as two students, match, chat, skip, report, show the admin page, then start video; keep a backup screen recording in case the network fails |
| Limitations and future work | Not proof of enrollment; no message history; video moderation is reactive; single instance; later: Redis scaling, interest matching, semester re-verification, richer admin dashboard |

---

## 13. First five actions to take today

1. **Check your UIU email format** (and ask a friend or the IT office whether students use subdomains). Write the allowed domains and a one-page MVP scope.
2. **Create the repository:** follow Section 7, steps 1–8 (GitHub account with 2FA, install Git, private repo `kothakoi`, `.gitignore`, `README.md`, first push). Put this plan's key decisions in `docs/PLAN.md`.
3. **Install the tools:** Node.js LTS, your editor (Antigravity or VS Code), and Docker Desktop. Confirm `node --version`, `git --version` and `docker --version` work.
4. **Create the four AI/handoff files** in `docs/`: `AI_RULES.md` (copy the starter from Section 9), `DECISIONS.md`, `CONTRACTS.md` (just the empty headings from Section 6), and `HANDOFF.md`. Commit them.
5. **Run Prompt A (plan only)** for Module 1, approve the plan, scaffold the project, and get `/api/health` showing on screen. Commit it, then create the three milestones and one GitHub issue per module.

When those five are done, tell me, and we can go module by module, starting with Module 2 and the design of your first CI file. I deliberately have not written any application code here: the plan is the product, and every module above is small enough to build, test and commit on its own.
