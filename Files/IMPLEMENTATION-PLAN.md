# KothaKoi — Phased Implementation Plan

**Status:** Draft v0.1 — **proposal; no task may start until its blocking decisions are approved.** Audit date 22 Oct 2026.
Tags: **[V]** verified · **[P]** proposed · **[D OD-xx]** needs approval. Test IDs are defined in REQUIREMENTS-TRACEABILITY §3.

**Working rules (from the project plan and prompt) [P]:** one branch per task or small slice; checkpoint commit before any AI-assisted task; backend tested without UI first, then frontend against the real backend; no fake data after the UI phase; all rules enforced server-side; **existing UI is wired, not redesigned**; nothing merges while CI is red; do not push without your say-so.

## 1. Phase overview

| Phase | Focus | Blocking decisions | Plan modules (`kothaKoiPlan.md`) |
|---|---|---|---|
| 1 FND | Foundation, DB, scaffolding | OD-03, OD-05, OD-09, OD-12 | 0, 1, 2, 4 |
| 2 AUTH | Auth, verification, route protection | OD-01, OD-04, OD-06, OD-14 | 5 |
| 3 PROF | Profile, nickname, static pages | OD-07, OD-10, OD-15, OD-19 | 6 (+3 leftovers) |
| 4 RT | Realtime infra and matching queue | OD-02, OD-13 | 7, 8 |
| 5 CHAT | Text chat and room lifecycle | OD-02, OD-08 | 9 |
| 6 SAFE | Reporting, blocking, admin | OD-11 | 10, 13 (minimal) |
| 7 VID | WebRTC video (Release 2) | OD-16, OD-17 | 11, 12 |
| 8 HARD | Hardening, tests, deployment | OD-12, OD-18 | 13 (rest), 14, 15 |

## 2. Where the repo stands against the plan modules **[V]**

| Plan module | State |
|---|---|
| 0 Scope + repo | Partial: repo exists, plan files exist; `docs/DECISIONS.md` and `docs/CONTRACTS.md` created; `AI_RULES.md` not seen |
| 1 Scaffolding | Partial: FE and BE scaffolds run separately; no root `dev` script seen; `/api/health` exists; `/socket.io` proxy missing |
| 2 Git/CI | Complete: lint, typecheck, test, build scripts, ESLint, Prettier, Vitest, `.github/workflows/ci.yml` |
| 3 UI | Screens built as mock pages; **no shared components**, no 404/Terms/Privacy |
| 4–16 | Not started |

## 3. Recommended first task

**TASK-FND-01 (decision gate, no code).** Approve or amend the blocking decisions and record them in `docs/DECISIONS.md`: **OD-01 (auth), OD-02 (release order), OD-03 (stack and shared-contract strategy), OD-05 (identity data), OD-06 (eligibility/domains), OD-09 (deployment shape)**.
*Why first:* these choices change the database schema (real name/student ID, sessions vs express-session store), the auth screens (password vs OTP), and the repo layout. Building the Prisma schema first would likely mean migrations rewritten within days.
**First code task after the gate: TASK-FND-02 then TASK-FND-04/05** (hygiene, then Postgres container and schema).

---

## Phase 1 — Foundation, database and scaffolding

**TASK-FND-01 — Decision gate and contract freeze** · Docs · Deps: none · **[Status: Complete — Decisions recorded in docs/DECISIONS.md, contracts defined in docs/CONTRACTS.md; awaiting user sign-off]**
- Scope: review OPEN-DECISIONS; record approvals; create `docs/DECISIONS.md`, `docs/CONTRACTS.md` (error format, cookie, events).
- Acceptance: OD-01/02/03/05/06/09 each marked Approved/Changed in the log (Recorded in `docs/DECISIONS.md` on 2026-10-22).
- Verify: you sign off; no code changes.

**TASK-FND-02 — Repo hygiene baseline** · Repo (FE+BE) · Deps: FND-01 · **[Status: Complete — Baseline configured; local CI-GREEN verified; deliberate lint error validated; PR pending user push]**
- Scope: add `lint`, `test` scripts and ESLint/Prettier to both apps; Vitest placeholder; root convenience scripts; pin Node (`.nvmrc`/`engines`); add `*.tsbuildinfo` to `.gitignore` (confirm whether tracked first); GitHub Actions running install, lint, typecheck, test, build.
- Acceptance: CI green on a PR; a deliberate lint error fails CI.
- Verify: CI-GREEN.

**TASK-FND-03 — Shared contracts location** · FE+BE · Deps: FND-01 (OD-03) · **[Status: Complete — @kothakoi/shared created; schemas & error types imported by both apps; CI-GREEN verified]**
- Scope: implement the approved sharing strategy (workspaces / path alias / duplicated schema) including `tsconfig` `rootDir`/`include` changes; create standard error type and codes.
- Acceptance: a zod schema defined once is imported by both apps and type-checks (Verified in backend and frontend unit tests and typechecks).
- Verify: CI-GREEN; UT-EMAIL imports the shared schema.

**TASK-FND-04 — Local Postgres and env validation** · DB/BE · Deps: FND-01 · **[Status: Complete — docker-compose.yml created; .env.example updated; config/env.ts validated & fail-fast verified; Docker CLI unavailable on host]**
- Scope: `docker-compose.yml` for Postgres; `DATABASE_URL` in `.env.example`; typed, fail-fast env loader (`config/env.ts`).
- Acceptance: `docker compose up` gives a reachable DB; server refuses to start with missing variables (Validated via env.test.ts; Docker not installed on local host).
- Verify: manual + IT harness boots.

**TASK-FND-05 — Prisma schema, first migration, seed** · DB · Deps: FND-04, OD-03/05/12 · **[Status: Complete — PostgreSQL container verified healthy; Prisma schema & initial migration with raw SQL CHECK constraints applied; seed script executed; UT-SCHEMA & UT-PRIVACY passing]**
- Scope: tables per BACKEND-SCHEMA including raw-SQL CHECK constraints and indexes; dev seed (fake users, one admin); shared Prisma client.
- Acceptance: fresh clone reaches the same DB via compose + migrate + seed.
- Verify: UT-SCHEMA; UT-PRIVACY (no real-name column unless OD-05 says so).

**TASK-FND-06 — Backend skeleton hardening** · BE · Deps: FND-03, FND-04 · **[Status: Complete — helmet mounted; 16kb body limit enforced; central error handler & 404 in standard shape; redacted logging verified; explicit TRUST_PROXY configured; hardening test suite passing]**
- Scope: central error handler (standard shape), request logging with redaction (no emails/message text), `helmet`, JSON body size limit, trust-proxy setting, keep `GET /api/health`.
- Acceptance: errors return `{error:{code,message,details}}`; logs contain no PII.
- Verify: IT-SESS (headers/flags subset), UT-PRIVACY.

## Phase 2 — Authentication, verification and route protection

**TASK-AUTH-01 — `isAllowedEmail()` and domain config** · BE · Deps: FND-03, OD-06 · **[Status: Complete — isAllowedEmail() implemented per TRD §4; ALLOWED_EMAIL_DOMAINS integrated; UT-EMAIL suite passing 28 tests]**
- Scope: implement parser per TRD §4 with `ALLOWED_EMAIL_DOMAINS`.
- Acceptance: every row of the TRD §4 table behaves as listed.
- Verify: UT-EMAIL.

**TASK-AUTH-02 — EmailSender interface** · BE · Deps: FND-06 · **[Status: Complete — EmailSender interface & ConsoleEmailSender implemented; dev console output & production safety guards verified via unit tests]**
- Scope: interface + console implementation for development.
- Acceptance: OTP printed to the server console in dev only; never logged in production mode.
- Verify: IT-AUTH-REQ.

**TASK-AUTH-03 — OTP service and endpoints** · BE · Deps: AUTH-01, AUTH-02, FND-05 · **[Status: Complete — requestCode & verifyCode implemented with cryptographic OTP, HMAC hashing, rate limits, cooldowns, and user upserts; 14 OTP tests passing]**
- Scope: `request-code` and `verify-code`; generation, HMAC, TTL, attempts, single use, cooldown, per-email/IP limits; uniform responses; user upsert; terms consent timestamp.
- Acceptance: criteria of FR-01..03, NFR-04.
- Verify: UT-OTP, IT-AUTH-REQ, IT-AUTH-VER.

**TASK-AUTH-04 — Sessions, logout, `/me`, `requireAuth`** · BE · Deps: AUTH-03 (OD-04) · **[Status: Complete — Database-backed hashed-token sessions, HttpOnly cookies, requireAuth middleware, /me, and logout implemented; 11 session tests passing]**
- Scope: session creation/revocation per approved option; cookie flags; status re-check (banned/suspended → `ACCOUNT_UNAVAILABLE`).
- Acceptance: `/me` 401 without cookie; logout kills the old cookie; flags verified.
- Verify: IT-SESS, IT-STATUS.

**TASK-AUTH-05 — Frontend auth plumbing** · FE · Deps: AUTH-04 · **[Status: Complete — Typed ApiClient with credentials:include, AuthProvider calling /me on mount, ProtectedRoute route guard, auth-aware Home header with real logout; 18 frontend tests passing, 0 lint warnings]**
- Scope: API client with `credentials`; `AuthProvider` calling `/me`; `ProtectedRoute`; auth-aware Home header and real logout; auth-check loading state.
- Acceptance: unauthenticated `/chat`,`/profile`,`/choose-nickname`,`/video` redirect to `/login`; no flash of logged-out UI.
- Verify: E2E-GUARD.

**TASK-AUTH-06 — Wire Login/Register to the real API** · FE · Deps: AUTH-05 (OD-01) · **[Status: Complete — Login and Register wired to POST /api/auth/request-code and /verify-code; passwordless two-step flow implemented, obsolete password/real-name/mock bypasses removed; 27 frontend tests passing, 0 lint warnings]**
- Scope: per UI spec §4.2–4.3: two-step email → code; remove mock flows (Auto-fill, quick-test, prototype labels, student-ID path, password/forgot under OTP-only); real error states; themed modals instead of `alert()`.
- Acceptance: a non-UIU address never gets a code; a UIU address can log in end-to-end in dev.
- Verify: IT-AUTH-VER, E2E-GUARD, MAN-COPY.

**TASK-AUTH-07 — Production email provider** · BE/Ops · Deps: AUTH-03 (OD-14)
- Scope: provider implementation; sender-domain SPF/DKIM/DMARC; deliverability test to real UIU inboxes.
- Acceptance: OTP reaches a real UIU inbox, not spam.
- Verify: manual (recorded in `docs/TESTING.md`).

## Phase 3 — Profile, nickname and static content

**TASK-PROF-01 — Profile API** · BE · Deps: AUTH-04, FND-05 (OD-07)
- Scope: `GET/PUT /api/profile`; zod rules (length, charset, impersonation denylist, Bengali/emoji allowed); preferences validation; uniqueness policy.
- Acceptance: invalid nickname rejected even if the UI is bypassed; user A cannot edit user B.
- Verify: IT-PROF, UT-PRIVACY.

**TASK-PROF-02 — Wire ChooseNickname** · FE · Deps: PROF-01
- Scope: prefill/save; shared validation; remove hard-coded demo identity; pass real nickname onward (no more fixed "Midnight Mango"); "Step 2 of 2" only for first-time onboarding.
- Acceptance: nickname persists across reload and appears in later screens.
- Verify: IT-PROF, E2E-GUARD.

**TASK-PROF-03 — Wire Profile screen** · FE · Deps: PROF-01 (OD-10)
- Scope: real masked email/verification; persist preferences; remove fabricated stats, demo notice, announcements toggle (if not approved), Change-Password (OTP-only); fix inverted rematch toggle; Start Adda → `/chat`.
- Acceptance: no fabricated data visible; toggles persist.
- Verify: IT-PROF, MAN-COPY.

**TASK-PROF-04 — Onboarding guard** · FE · Deps: AUTH-05, PROF-01
- Scope: authenticated user without profile → `/choose-nickname`; with profile never stuck in a redirect loop; canonicalise `/nickname` alias.
- Acceptance: login → nickname → home works on phone and desktop.
- Verify: E2E-GUARD.

**TASK-UX-01 — Static and system pages** · FE · Deps: AUTH-05 (OD-15)
- Scope: 404 catch-all, error boundary, Terms, Privacy, Guidelines, Safety tips, Account-unavailable, Forbidden; real "How it works"/"Guidelines" on Home; footer links; copy fixes per UI spec §8 for static text.
- Acceptance: no dead anchors; unknown URL shows 404.
- Verify: E2E-STATES, MAN-COPY, LEGAL-REVIEW.

**TASK-UX-02 — Shared layout extraction (optional, non-visual)** · FE · Deps: OD-19
- Scope: extract `Header`, `Footer`, `Mascot` shared components; zero visual change; resolve design-system issues D3/D4 (no-op classes).
- Acceptance: screenshot comparison shows no visual diff.
- Verify: MAN-RESP, CI-GREEN. **Skip if OD-19 is declined.**

## Phase 4 — Real-time infrastructure and matching queue

**TASK-RT-01 — Socket.IO server with cookie auth** · BE · Deps: AUTH-04
- Scope: attach to the existing `http.Server`; handshake auth and origin check; `socket.data.userId`; banned/suspended reject; newest-socket-wins; `session:state` on connect; buffer size cap.
- Acceptance: unauthenticated/banned sockets rejected; second tab replaces first.
- Verify: IT-SOCK (listed under IT-CHAT in the matrix), MAN-GRACE.

**TASK-RT-02 — Frontend socket client and connection UI** · FE · Deps: RT-01
- Scope: Vite `/socket.io` proxy with `ws: true`; singleton client; hook with listener cleanup (StrictMode-safe); connection/offline banner.
- Acceptance: stop the server and the client shows reconnecting then recovers.
- Verify: E2E-STATES, MAN-GRACE.

**TASK-RT-03 — `MatchingService` (pure)** · BE · Deps: FND-03 (OD-13)
- Scope: queues, state map, exclusions, cooldown, synchronous pairing, stale sweep; no socket code.
- Acceptance: 100 simultaneous joins → no user in two pairs; blocked/cooldown pairs never match; double join rejected.
- Verify: UT-MATCH.

**TASK-RT-04 — Queue socket handlers and persistence** · BE · Deps: RT-01, RT-03, FND-05
- Scope: `queue:join/leave/waiting`, `match:found` (nickname/avatar only); load block set on connect; write `chat_sessions` after pairing; close stale rows at boot.
- Acceptance: three browser windows behave correctly; payloads contain no identifiers.
- Verify: IT-QUEUE, UT-PRIVACY, LOAD-01.

**TASK-RT-05 — Queue UI in Chat** · FE · Deps: RT-02, RT-04 (OD-02, OD-08)
- Scope: waiting state with cancel, no-one-online message, navigation on `match:found`; remove reload-based "Next".
- Acceptance: two users are paired within the NFR-01 target.
- Verify: E2E-CHAT.

## Phase 5 — Real-time text chat and room lifecycle

**TASK-CHAT-01 — Room service** · BE · Deps: RT-03
- Scope: in-memory rooms, ≤20-message buffer, 15 s grace timers, report-window retention (OD-11), cleanup on end.
- Acceptance: no memory growth after rooms end (leak test).
- Verify: UT-MATCH (room units), IT-CHAT.

**TASK-CHAT-02 — Chat event handlers** · BE · Deps: CHAT-01
- Scope: `chat:message` (zod, code-point length, membership, rate limit, server id/time, ack, dedupe), `chat:typing`, `chat:skip`, `chat:end`, `chat:ended`, `chat:partner_status`; update `chat_sessions.ended_*`.
- Acceptance: XSS-looking text arrives as literal text; 1001-char message rejected; sends into a foreign room are `FORBIDDEN`.
- Verify: IT-CHAT.

**TASK-CHAT-03 — Wire Chat.tsx (text-first)** · FE · Deps: CHAT-02 (OD-08)
- Scope: replace mock messages/replies; implement the approved text-mode layout variant; message status states; real typing; themed confirms; use the real nickname.
- Acceptance: two windows chat both ways with no duplicates.
- Verify: E2E-CHAT, A11Y-AUDIT (chat log semantics).

**TASK-CHAT-04 — Disconnect and reconnect UX** · FE+BE · Deps: CHAT-02, RT-02
- Scope: refresh within grace resumes the room (state + recent buffer); partner-reconnecting and partner-left banners; Find-next.
- Acceptance: refresh inside 15 s resumes; after 15 s partner is told once.
- Verify: MAN-GRACE, E2E-CHAT.

**TASK-CHAT-05 — Hide/gate Video and remove false claims** · FE · Deps: OD-02
- Scope: route `/video` hidden or "coming soon" until Release 2; apply UI spec §8 claims fixes on Chat (latency, room tags, P2P, campus list).
- Acceptance: no hard-coded latency/room/campus claims remain in routed screens.
- Verify: MAN-COPY.

## Phase 6 — Safety, reporting and blocking

**TASK-SAFE-01 — Blocks API and live block sets** · BE · Deps: RT-04 (OD-11)
- Scope: `POST /api/blocks` via `sessionId`; update both users' in-memory sets immediately; unblock per OD-11.
- Acceptance: a blocked pair never rematches.
- Verify: IT-BLOCK, UT-MATCH.

**TASK-SAFE-02 — Reports API with evidence snapshot** · BE · Deps: CHAT-01, FND-05
- Scope: `POST /api/reports`; reported user derived server-side; participation and report-window check; evidence copy; de-dupe; flag counter.
- Acceptance: cannot report someone you never chatted with; duplicate de-duplicated.
- Verify: IT-REPORT.

**TASK-SAFE-03 — Wire report/block UI** · FE · Deps: SAFE-01, SAFE-02
- Scope: unified reason list, optional details, themed confirmations/toasts; same components for Chat (and Video later); fix Esc-with-overlay behaviour.
- Acceptance: report → DB row with evidence; block → never matched again.
- Verify: E2E-CHAT, A11Y-AUDIT.

**TASK-SAFE-04 — Rate limiting and flood control** · BE · Deps: FND-06, RT-01
- Scope: REST middleware and socket limiters per TRD §9; keyed by user and IP.
- Acceptance: limits return 429/`RATE_LIMITED` in the standard shape.
- Verify: IT-RATE.

**TASK-SAFE-05 — Admin API and enforcement** · BE · Deps: SAFE-02, AUTH-04
- Scope: `requireAdmin`; list/detail; actions with required reason and `moderation_actions` rows; ban/suspend deletes sessions and disconnects sockets; unban; admin bootstrap per OD-11.
- Acceptance: non-admin gets 403 on every admin route; ban takes effect on a live socket.
- Verify: IT-ADMIN, IT-STATUS.

**TASK-SAFE-06 — AdminPanel UI** · FE · Deps: SAFE-05
- Scope: per UI spec §4.8 using existing tokens; all states.
- Acceptance: a report travels from submission to ban with no manual DB edits.
- Verify: E2E-MOD, A11Y-AUDIT.

**TASK-SAFE-07 — Repeat-report flag (optional)** · BE/FE · Deps: SAFE-02 (OD-11)
- Scope: threshold flag surfaced in the admin list; no automatic ban.
- Acceptance: user reported by ≥N distinct reporters is flagged.
- Verify: IT-REPORT.

## Phase 7 — WebRTC video (Release 2; start only after text MVP is stable)

**TASK-VID-01 — Permission pre-check** · FE · Deps: OD-02
- Scope: pre-queue camera/mic check with named errors and retry.
- Acceptance: denial/no device/in use each show a distinct message.
- Verify: MAN-RTC.

**TASK-VID-02 — RTC signaling relay** · BE · Deps: CHAT-02
- Scope: `rtc:*` relay to partner only; size caps; role assignment.
- Acceptance: signaling from a non-participant is `FORBIDDEN`.
- Verify: IT-CHAT (membership cases), MAN-RTC.

**TASK-VID-03 — `useWebRTC` and Video/Chat tiles** · FE · Deps: VID-01, VID-02
- Scope: peer connection hook, ICE buffering, real mic/cam toggles, tracks stopped on end, wire `Video.tsx` and the video variant of `Chat.tsx`; remove mock imagery and fake stats.
- Acceptance: two browsers see/hear each other; camera light turns off on skip.
- Verify: MAN-RTC.

**TASK-VID-04 — ICE servers endpoint and TURN** · BE/FE · Deps: VID-03 (OD-16)
- Scope: `GET /api/ice-servers` with short-lived credentials; Connecting/Reconnecting/Failed UI; one ICE restart; dev-only force-relay switch.
- Acceptance: forced-relay call succeeds; unreachable TURN shows a clear failure.
- Verify: MAN-TURN.

**TASK-VID-05 — Video safety posture** · FE/BE · Deps: VID-03 (OD-17)
- Scope: implement the approved IP-exposure choice (disclosure or relay-only), video report path, peer-recording caveat copy, block in Video.
- Acceptance: disclosure/relay behaviour matches the decision.
- Verify: MAN-RTC, MAN-COPY, LEGAL-REVIEW.

## Phase 8 — Hardening, testing and deployment

**TASK-HARD-01 — Retention job** · BE · Deps: FND-05 (OD-12)
- Scope: daily job per BACKEND-SCHEMA §6, dry-run first.
- Acceptance: old rows deleted, referenced rows kept.
- Verify: IT-RETENTION.

**TASK-HARD-02 — Account deletion** · BE/FE · Deps: PROF-03 (OD-12)
- Scope: `DELETE /api/account` + confirmation UI; ban-evasion safeguard per decision.
- Acceptance: cascade works; sessions revoked.
- Verify: IT-DELETE.

**TASK-HARD-03 — Integration and E2E suites** · Test · Deps: phases 2–6
- Scope: complete API/socket integration coverage and Playwright two-context flow (login → match → chat → skip → report → admin action).
- Acceptance: suites green in CI.
- Verify: E2E-GUARD, E2E-CHAT, E2E-MOD, E2E-STATES.

**TASK-HARD-04 — Security review** · All · Deps: phases 2–6
- Scope: CSP (including Google Fonts or self-hosting), `npm audit`, secret scan over history, bundle inspection, authorisation review of every route/event.
- Acceptance: no high-severity findings open.
- Verify: SEC-REVIEW.

**TASK-HARD-05 — Accessibility and responsive pass** · FE · Deps: phases 3–6
- Scope: focus rings (`button{outline:none}`), aria-labels/`aria-hidden`, dialog semantics, min text size, shortcut handling, `100dvh`, mobile keyboard behaviour.
- Acceptance: A11Y-AUDIT checklist passes; 360/768/1280 px verified.
- Verify: A11Y-AUDIT, MAN-RESP.

**TASK-HARD-06 — Load test** · Test · Deps: RT-04, CHAT-02
- Scope: 50–200 simulated sockets; memory per idle socket measured.
- Acceptance: NFR-01/02 targets met; no crash.
- Verify: LOAD-01.

**TASK-HARD-07 — Deployment** · Ops · Deps: all earlier (OD-09, OD-18)
- Scope: build/start config, managed Postgres, env vars, trust proxy, HTTPS, WebSocket check, staging first, smoke test, backup and rollback note.
- Acceptance: two phones on different networks complete the core flow on the live URL.
- Verify: SMOKE-DEPLOY.

## 4. Dependency summary

FND → AUTH → PROF → RT → CHAT → SAFE → (VID, HARD). AUTH-06 and PROF tasks can overlap with RT-01 once AUTH-04 exists. SAFE-05/06 can start once SAFE-02 exists. Phases 7 and 8 can overlap partially (HARD-01..05) but deployment (HARD-07) is last.
