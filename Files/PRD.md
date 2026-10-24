# KothaKoi (কথা কই) — Product Requirements Document (PRD)

| | |
|---|---|
| **Status** | **Draft v0.1. Proposals only. Nothing here is an approved decision.** |
| **Audit date** | 22 Oct 2026 |
| **Sources audited** | `CLAUDE-PROJECT-CLARIFICATION-PROMPT.md`, `kothaKoiPlan.md` / `UIUChat-Plan.md`, and the repo files supplied in this session (all frontend pages, configs, `backend/src`, manifests, lockfiles, `.env.example`, `.gitignore`) |
| **Not inspected** | GitHub repo directly (no connector available), git history, repo root listing, any root `package.json`, `.github/`, `docs/`, `frontend/public/`, `backend/.env` (deliberately never read). No build/test/browser run. |
| **Companion docs** | APP-FLOW · UI-UX-SPECIFICATION · BACKEND-SCHEMA · IMPLEMENTATION-PLAN · TRD · REQUIREMENTS-TRACEABILITY · OPEN-DECISIONS |

**Evidence tags used in every document:** **[V]** verified by reading source · **[P]** proposed (not approved) · **[A]** assumption or unknown · **[D OD-xx]** needs your approval, see OPEN-DECISIONS.

---

## 1. Product overview and mission

KothaKoi is a playful, anonymous, student-only chat web app for **United International University (UIU), Dhaka**. A student proves control of a UIU mailbox, picks a temporary nickname, and is randomly paired with another student for a 1-on-1 conversation. Real identity data is used only for safety and is never shown to chat partners. The visual identity is a retro neo-brutalist "tea-stall adda" theme (orange / cream / yellow, pixel tea-cup mascot, Bengali branding) **[V]**.

**Mission:** low-stakes, campus-flavoured conversation between UIU students, without social-media baggage and without harassment.

**What "verified" means (important honesty point):** a UIU-domain OTP proves *the person can read mail at a UIU address*. It does **not** prove current enrolment (alumni, staff and shared or transferred mailboxes remain possible). Product copy and the Terms must say "UIU email verified", not "verified student" **[V in plan §1; NFR-12]**.

## 2. Target audience and personas **[A: not validated with real users]**

| Persona | Description | Needs |
|---|---|---|
| P1 Day-scholar commuter | Spends gaps between classes on campus or in transit | Quick, skippable chat; mobile-first |
| P2 Quiet student | Wants low-pressure conversation | Anonymity, easy Next/End, easy block |
| P3 Finals crammer | Wants a tea-break adda during exam season | Fast matching, campus-flavoured tone |
| P4 Moderator/admin | A small team (likely the project owner) **[A]** | Fast report triage, ban/unban, evidence |

## 3. Value proposition

Anonymity without a profile footprint, restricted to one campus community, with campus context (Madani Avenue, tong cha, finals) and real report/block controls. Differentiator versus open random-chat sites: the other person is a UIU email holder, and abuse has consequences (bans by account).

## 4. Current state snapshot **[V]**

| Area | Reality |
|---|---|
| Student-facing UI | 7 routed screens (Home, Login, Register, ChooseNickname, Chat, Video, Profile), all mock/simulated; 2 legacy unrouted pages (Landing, ChatPlaceholder) |
| Admin UI | None |
| Backend | `GET /api/health` only; unused `express-session` config |
| Database / sockets / email / WebRTC | None |
| Route protection | None; all routes public; no 404 route |
| CI / lint / tests | No scripts for lint or test in either `package.json` |

Details: UI-UX-SPECIFICATION §3–4 and TRD §14.

## 5. Scope **[P, pending OD-01, OD-02]**

### Release 1 — Text MVP
UIU email OTP verification and session · nickname selection · 1-on-1 **text** matchmaking queue · skip / next / end · partner-left handling · report and block · rate limiting · minimal admin moderation (queue, evidence, dismiss/warn/suspend/ban/unban) · Terms / Privacy / Guidelines / Safety content · retention job · HTTPS deployment.

### Release 2 — Video
WebRTC 1-on-1 video, media controls, permission handling, STUN/TURN.

### Release 3 — Polish
Richer admin dashboard, monitoring, interest-based matching, semester re-verification, PWA polish, Redis scaling.

### Explicitly excluded (all releases unless re-approved)
Permanent chat history · image/file uploads · group rooms · public profiles · followers/friends · social links · AI moderation · push notifications.

> **UI/scope tension [V]:** the existing `Chat.tsx` and `Video.tsx` are *video-first*; neither has a text-only mode. A text-first MVP means adapting them (not redesigning). See UI-UX-SPECIFICATION §4 and **OD-02 / OD-08**.

## 6. Functional requirements

Release: R1 = Text MVP, R2 = Video. "Current" describes verified state.

| ID | Requirement | Acceptance criteria | Rel | Current **[V]** |
|---|---|---|---|---|
| FR-01 | UIU-domain eligibility enforced server-side | After trim+lowercase, host equals an allowed domain or ends with `.`+allowed domain, else `EMAIL_DOMAIN_NOT_ALLOWED`. Rejects `a@uiu.ac.bd.evil.com`, `a@evil-uiu.ac.bd`, `a@uiu.ac.bd.`, `a@b@uiu.ac.bd`. Domain list from config, not hard-coded | R1 | Client-only regex (Login/Register); no server check |
| FR-02 | Request email OTP | Valid address gets a 6-digit code valid 10 min; older codes invalidated; response identical for new/existing/banned accounts; per-email and per-IP limits return 429 | R1 | "Send Code" simulated; no email/OTP backend |
| FR-03 | Verify OTP → account and session | Correct, unexpired, unused code is consumed once → user created if new → session cookie set. 6th wrong attempt locks the code. Expired/reused → generic `INVALID_CODE` | R1 | Mock verify; "Auto-fill" fakes it; Register submit never checks `isEmailVerified` |
| FR-04 | Session lifecycle | HttpOnly cookie; `GET /api/auth/me` returns 401 without a valid session; logout revokes server-side; expiry honoured | R1 | `express-session` configured, unused |
| FR-05 | Route protection | Unauthenticated visit to `/chat`, `/video`, `/profile`, `/choose-nickname`, `/admin` → `/login`; user without profile → `/choose-nickname`; non-admin on `/admin` → forbidden page; sockets reject unauthenticated | R1 | All routes public |
| FR-06 | Account status enforcement | Suspended/banned users cannot obtain or keep a session or socket; user sees an "account unavailable" screen (with expiry for suspension) | R1 | None |
| FR-07 | Nickname selection, persisted | Nickname length and character rules enforced server-side [P: 2–20 chars; UI input currently `maxLength=24`]; impersonation words (admin, moderator…) denied; shown to partner; survives reload | R1 | UI-only; nickname not passed to `/chat`; `Chat.tsx` hard-codes "Midnight Mango" |
| FR-08 | Profile and preferences | Profile shows private email, verification state, nickname; preference toggles persist and are applied; no fabricated statistics | R1 | `Profile.tsx` renders demo data and fake stats |
| FR-09 | Account deletion | User can delete account after confirmation; sessions/profile/blocks cascade; report evidence per OD-12 | R1 [D OD-12] | None |
| FR-10 | Join/leave text queue | `queue:join` IDLE→QUEUED; leave/disconnect removes; double join → `ALREADY_BUSY`; UI shows waiting state with cancel | R1 | None; "Next" = `window.location.reload()` |
| FR-11 | Atomic pairing with exclusions | Two eligible waiting users are paired exactly once; never self, never blocked (either direction), never within cooldown [D OD-13]; 100 simultaneous joins yield no user in two pairs; partner payload contains only nickname/avatar | R1 | None |
| FR-12 | Text delivery | 1–1000 Unicode code points, trimmed; delivered once, in order, only to partner; sender ack with server id/time; duplicate `clientMsgId` ignored; rendered as plain text | R1 | Local React state with canned replies |
| FR-13 | Typing indicator | Partner sees typing within ~1 s; auto-clears after ~3 s | R1 | Simulated in `Chat.tsx` |
| FR-14 | Skip / End / Next | Skip: partner told `partner_skipped`, skipper re-queued; End: both IDLE; no messages accepted after end | R1 | UI buttons exist; reload only |
| FR-15 | Disconnect grace | Partner drop → "reconnecting" state; not back in 15 s → `partner_disconnected`; refresh within grace resumes room | R1 | None |
| FR-16 | Connection status | Visible banner for connecting / reconnecting / offline; send disabled while offline | R1 | None |
| FR-17 | Report partner | Reported user derived server-side from `sessionId`; reason from fixed list + optional ≤500-char details; evidence snapshot (≤20 msgs) attached; duplicate (reporter, session) de-duplicated; allowed during chat and for a short window after [D OD-11] | R1 | `alert()` only; reason lists differ between `Chat.tsx` and `Video.tsx` |
| FR-18 | Block partner | Block via `sessionId`; pair never rematched, either direction, effective immediately; unblock policy [D OD-11] | R1 | `window.confirm()` in `Chat.tsx`; none in `Video.tsx` |
| FR-19 | Rate limiting / flood control | OTP, queue, message, report limits (values in TRD §9); exceeded → HTTP 429 or socket `RATE_LIMITED` in standard error format; keyed by user and IP | R1 | None |
| FR-20 | Repeat-report flag | User reported by ≥ N distinct reporters is flagged in admin queue [P: N=3, no auto-ban] [D OD-11] | R1 (optional) | None |
| FR-21 | Admin report queue | Reports by status, newest first, with evidence, nicknames, reported user's prior report/action counts | R1 | None |
| FR-22 | Moderation actions | Dismiss / warn / suspend (expiry) / ban / unban, each with required reason, each logged in `moderation_actions` | R1 | None |
| FR-23 | Ban effective live | Ban/suspend deletes sessions and disconnects sockets within ~5 s; partner informed | R1 | None |
| FR-24 | Media permission pre-check | Camera/mic requested before joining video queue; named errors with retry | R2 | None |
| FR-25 | WebRTC call | SDP/ICE relayed only between the two participants; remote stream renders; tracks stopped on end | R2 | `Video.tsx` visual mock only |
| FR-26 | Media controls | Mute/camera toggles control real tracks; defaults from preferences | R2 | State-only toggles |
| FR-27 | TURN and failure handling | Short-lived ICE credentials from server; Connecting/Reconnecting/Failed states; one ICE restart | R2 | None |
| FR-28 | Safety and legal content | Terms, Privacy, Community Guidelines, Safety tips reachable from footers and the registration consent; text matches real data practice | R1 | Footer/nav links are dead anchors (`#safety`, `#how-it-works`, …) |
| FR-29 | Retention job | Daily job deletes expired codes/sessions, old chat metadata, resolved evidence per OD-12 | R1 | None |
| FR-30 | Error / empty / 404 states | Unknown route → 404; error boundary; empty-queue message; API errors surfaced consistently | R1 | No catch-all route |

## 7. Non-functional requirements **[P targets]**

| ID | Category | Target | Verified by |
|---|---|---|---|
| NFR-01 | Pairing latency | Pairing p95 < 2 s from join when a candidate exists | LOAD-01, UT-MATCH |
| NFR-02 | Message relay | Server-side relay p95 < 100 ms at 200 concurrent sockets | LOAD-01 |
| NFR-03 | Session security | HttpOnly; `Secure` in prod; SameSite per OD-04; 256-bit random token stored hashed; server-side revocation | IT-SESS, SEC-REVIEW |
| NFR-04 | OTP security | 6 digits via CSPRNG; HMAC at rest; TTL 10 min; ≤5 attempts; resend cooldown 60 s; per-email 5/h; per-IP 20/h | UT-OTP, IT-AUTH-REQ |
| NFR-05 | Privacy isolation | No email, user ID, session ID or real name in any payload to another user, any log line, or the client bundle | UT-PRIVACY |
| NFR-06 | Input safety | All REST/socket input validated (zod); text rendered as text; CSP that accounts for Google Fonts hosts | IT-CHAT, SEC-REVIEW |
| NFR-07 | Availability | Single instance; documented restart behaviour (rooms are lost, clients get a clean ended state); health endpoint | SMOKE-DEPLOY |
| NFR-08 | Accessibility | WCAG 2.1 AA target for core flows | A11Y-AUDIT |
| NFR-09 | Responsive | 360–480 px portrait, 768 px tablet, ≥1024 px desktop | MAN-RESP |
| NFR-10 | Logging | Structured logs with internal IDs only; never email, message text or tokens | UT-PRIVACY |
| NFR-11 | Data minimisation | Only data in BACKEND-SCHEMA is stored; no message history | IT-RETENTION |
| NFR-12 | Truthful UI claims | No claim (E2E, P2P, "100% anonymous", latency, "verified student") that the system does not literally deliver | MAN-COPY |
| NFR-13 | Engineering hygiene | CI (lint, typecheck, test, build) green before merge | CI-GREEN |
| NFR-14 | Unicode / Bengali | Nicknames and messages accept Bengali and emoji; lengths counted by code points. Loaded fonts (Inter, Space Grotesk, Space Mono) likely lack Bengali glyphs, so system fallback applies **[A]** | IT-CHAT |

## 8. Privacy and safety architecture

| Data class | Examples | Who can see it | Stored? |
|---|---|---|---|
| **Private account data** | Normalised UIU email; (conditional) real name / student ID [D OD-05]; session token hash | Server; admins only when handling a report (disclose in Privacy Policy) | Yes (Postgres) |
| **Partner-visible identity** | Nickname, avatar preset | The current chat partner | Nickname in profile; shown only during a pairing |
| **Ephemeral chat data** | Queue entries, room state, message buffer (last ~20), typing state | Participants (messages); server memory only | **No**, except a report evidence snapshot |
| **Moderation data** | Reports, evidence, actions | Admins | Yes, with retention [D OD-12] |
| **Never stored** | Passwords (if OD-01 = OTP-only), plaintext OTPs/tokens, message history, media streams | n/a | No |

Principles: the server derives identity from the session cookie, never from client payloads. The reported user is derived from the chat session, never from the client. Partners receive only nickname and avatar. The frontend is untrusted and every rule is enforced on the server.

## 9. Abuse prevention and moderation

- **Report intake:** fixed reason list plus optional details; evidence snapshot copied from the in-memory room buffer (nicknames, timestamps and text, no user IDs).
- **Block:** prevents rematching in both directions immediately.
- **Flagging:** repeat-reports threshold surfaces a user in the admin queue [P, OD-11].
- **Admin actions:** dismiss · warn · suspend (with expiry) · ban · unban, each audited.
- **Open:** appeals process, escalation of threats/self-harm (UIU contact), SLA for review, unblock policy **[D OD-11, OD-15]**.
- **Video** is the highest-abuse feature and cannot be inspected server-side. It ships only after text moderation works **[P per plan §2]**.

## 10. Risks and limitations

| Risk | Note |
|---|---|
| Eligibility ≠ enrolment | See §1. Disclose in Terms. |
| **Cold start / liquidity** | A single-campus random matcher will often have an empty queue. Needs an "nobody online right now" state and possibly scheduled pilot windows **[A; D OD-13]** |
| Anonymity is bounded | Admins see email on reports; WebRTC peers can learn each other's IP unless relay-only; screenshots can't be prevented **[D OD-17]** |
| Legal/institutional | Uses the UIU name and student identity; permission and data-protection requirements need checking **[D OD-15]**; not legal advice |
| Existing UI overclaims | See UI-UX-SPECIFICATION §8 (copy audit) |

## 11. Unresolved product decisions

Full detail in OPEN-DECISIONS. Product-owner approvals needed before implementation: **OD-01** auth model · **OD-02** text-first vs video-first · **OD-05** real-name/student-ID collection · **OD-06** eligibility boundary · **OD-07** nickname model · **OD-08** chat layout and interaction · **OD-10** profile stats/notifications · **OD-11** moderation policy · **OD-13** matching policy · **OD-15** UIU permission and legal docs.
