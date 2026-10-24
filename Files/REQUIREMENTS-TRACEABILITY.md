# KothaKoi — Requirements Traceability Matrix

**Status:** Draft v0.1 — all mappings are **[P]**; they inherit the pending status of the decisions they depend on. Audit date 22 Oct 2026.
Chain: **Requirement → Flow (APP-FLOW) → UI screen/state → API / socket event → DB entity → Task (IMPLEMENTATION-PLAN) → Verification test.**
IDs used here are defined in: PRD (FR/NFR), APP-FLOW (FLOW), UI-UX-SPECIFICATION (screens), TRD §6–7 (API/events), BACKEND-SCHEMA (tables), IMPLEMENTATION-PLAN (TASK), §3 below (tests).

## 1. Functional requirements

| Requirement | Flow | UI screen / state | API / socket | DB entity | Tasks | Tests |
|---|---|---|---|---|---|---|
| **FR-01** UIU-domain eligibility | FLOW-01, 02 | Login/Register email field, domain error banner | `POST /api/auth/request-code` | – (config) | AUTH-01, AUTH-03, AUTH-06 | UT-EMAIL, IT-AUTH-REQ |
| **FR-02** Request email OTP | FLOW-01, 02 | Login step 1 (Register "Send Code"), resend timer, 429 state | `POST /api/auth/request-code` | `login_codes` | AUTH-02, AUTH-03, AUTH-07 | UT-OTP, IT-AUTH-REQ |
| **FR-03** Verify OTP → account and session | FLOW-01, 02 | Login step 2 code entry; invalid/expired/locked states | `POST /api/auth/verify-code` | `users`, `login_codes`, `sessions` | AUTH-03, AUTH-04, AUTH-06 | IT-AUTH-VER |
| **FR-04** Session lifecycle | FLOW-02 | Header avatar menu, Logout | `POST /api/auth/logout`, `GET /api/auth/me` | `sessions` | AUTH-04, AUTH-05 | IT-SESS |
| **FR-05** Route protection | FLOW-02, 03 | `ProtectedRoute`, redirect, 403 page | `GET /api/auth/me`; socket handshake | `sessions` | AUTH-05, PROF-04, RT-01 | E2E-GUARD, IT-SOCK |
| **FR-06** Account status enforcement | FLOW-02, 10 | Account-unavailable screen | `verify-code`, `requireAuth`, handshake | `users.status`, `suspended_until` | AUTH-04, SAFE-05, RT-01 | IT-STATUS, IT-SOCK |
| **FR-07** Nickname selection persisted | FLOW-03 | ChooseNickname (presets, shuffle, custom, errors) | `GET/PUT /api/profile` | `profiles.current_nickname`, `avatar_preset` | PROF-01, PROF-02, PROF-04 | IT-PROF, E2E-GUARD |
| **FR-08** Profile and preferences | FLOW-09 | Profile (ID card, toggles) | `GET/PUT /api/profile` | `profiles.preferences`, `users` | PROF-01, PROF-03 | IT-PROF, MAN-COPY |
| **FR-09** Account deletion | FLOW-09 | Profile danger zone, confirm modal | `DELETE /api/account` | `users` cascade | HARD-02 | IT-DELETE |
| **FR-10** Join/leave text queue | FLOW-04 | Chat waiting state, Cancel, no-one-online | `queue:join/leave/waiting`, `session:state` | in-memory state; `chat_sessions` after pairing | RT-03, RT-04, RT-05 | UT-MATCH, IT-QUEUE |
| **FR-11** Atomic pairing with exclusions | FLOW-04 | Match-found transition | `match:found` | `blocks`, `chat_sessions` | RT-03, RT-04 | UT-MATCH, IT-QUEUE, LOAD-01, UT-PRIVACY |
| **FR-12** Text delivery | FLOW-05 | Chat log, input, message status (sending/sent/failed) | `chat:message` (+ack) | none persisted | CHAT-01, CHAT-02, CHAT-03 | IT-CHAT, E2E-CHAT |
| **FR-13** Typing indicator | FLOW-05 | Typing indicator | `chat:typing` | none | CHAT-02, CHAT-03 | IT-CHAT |
| **FR-14** Skip / End / Next | FLOW-07 | Next, End buttons, Esc handling, themed confirm | `chat:skip`, `chat:end`, `chat:ended` | `chat_sessions.ended_at/ended_reason` | CHAT-02, CHAT-03 | E2E-CHAT |
| **FR-15** Disconnect grace | FLOW-05, 07 | Partner-reconnecting / partner-left banners, Find next | `chat:partner_status`, `chat:ended` | `chat_sessions` | CHAT-01, CHAT-04 | MAN-GRACE, IT-CHAT |
| **FR-16** Connection status | FLOW-05 | Offline/reconnect banner | socket lifecycle, `session:state` | – | RT-01, RT-02, CHAT-04 | MAN-GRACE, E2E-STATES |
| **FR-17** Report partner | FLOW-08 | Report menu/modal (unified reasons, details), toast | `POST /api/reports` | `reports` | SAFE-02, SAFE-03 | IT-REPORT |
| **FR-18** Block partner | FLOW-08 | "Block Student" confirm modal | `POST /api/blocks` | `blocks` | SAFE-01, SAFE-03 | IT-BLOCK |
| **FR-19** Rate limiting | all | "Slow down" notice, 429 states | REST 429; socket `RATE_LIMITED` | – (memory) | AUTH-03, SAFE-04 | IT-RATE |
| **FR-20** Repeat-report flag | FLOW-10 | Admin flag badge | internal; admin list | `reports`, `users` | SAFE-07 | IT-REPORT |
| **FR-21** Admin report queue | FLOW-10 | AdminPanel list and detail | `GET /api/admin/reports`, `/:id` | `reports` | SAFE-05, SAFE-06 | IT-ADMIN, E2E-MOD |
| **FR-22** Moderation actions | FLOW-10 | Action buttons and confirm modal | `POST /api/admin/reports/:id/action`, `/users/:id/action` | `moderation_actions`, `users.status` | SAFE-05, SAFE-06 | IT-ADMIN, E2E-MOD |
| **FR-23** Ban effective live | FLOW-07, 10 | Kicked to unavailable screen | server disconnect; `chat:ended: moderation` | `sessions` | SAFE-05 | IT-ADMIN, E2E-MOD |
| **FR-24** Media permission pre-check | FLOW-06 | Pre-queue permission screen and error states | client only | – | VID-01 | MAN-RTC |
| **FR-25** WebRTC call | FLOW-06 | Video tiles | `rtc:offer/answer/ice` | `chat_sessions.mode=video` | VID-02, VID-03 | MAN-RTC |
| **FR-26** Media controls | FLOW-06 | Mic/cam toggles | client only | `profiles.preferences` (defaults) | VID-03 | MAN-RTC |
| **FR-27** TURN and failure handling | FLOW-06 | Connecting / Reconnecting / Failed | `GET /api/ice-servers` | – | VID-04, VID-05 | MAN-TURN |
| **FR-28** Safety and legal content | FLOW-01, 09 | Terms, Privacy, Guidelines, Safety pages, footer links | static routes | `users.terms_accepted_at` | UX-01 | LEGAL-REVIEW |
| **FR-29** Retention job | – | – | scheduled job | `login_codes`, `sessions`, `chat_sessions`, `reports` | HARD-01 | IT-RETENTION |
| **FR-30** Error / empty / 404 states | all | 404, error boundary, empty queue, offline | – | – | UX-01, RT-02 | E2E-STATES |

## 2. Non-functional requirements

| Requirement | Applies to | Tasks | Tests |
|---|---|---|---|
| **NFR-01** Pairing latency | queue, matching | RT-03, RT-04, HARD-06 | LOAD-01, UT-MATCH |
| **NFR-02** Message relay latency | chat | CHAT-02, HARD-06 | LOAD-01 |
| **NFR-03** Session security | auth, cookies | FND-06, AUTH-04, HARD-04 | IT-SESS, SEC-REVIEW |
| **NFR-04** OTP security | OTP endpoints | AUTH-03 | UT-OTP, IT-AUTH-REQ |
| **NFR-05** Privacy isolation | sockets, logs, bundle | FND-05, PROF-01, RT-04 | UT-PRIVACY |
| **NFR-06** Input safety / XSS | REST, sockets, UI | FND-03, CHAT-02, HARD-04 | IT-CHAT, SEC-REVIEW |
| **NFR-07** Availability and restart behaviour | server | RT-01, HARD-06, HARD-07 | SMOKE-DEPLOY, LOAD-01 |
| **NFR-08** Accessibility | all screens | HARD-05 | A11Y-AUDIT |
| **NFR-09** Responsive | all screens | HARD-05, UX-02 | MAN-RESP |
| **NFR-10** PII-free logging | server logs | FND-06 | UT-PRIVACY |
| **NFR-11** Data minimisation | schema, retention | FND-05, HARD-01 | IT-RETENTION, UT-SCHEMA |
| **NFR-12** Truthful UI claims | copy | PROF-03, UX-01, CHAT-05, VID-05, AUTH-06 | MAN-COPY |
| **NFR-13** Engineering hygiene | repo | FND-02, FND-03 | CI-GREEN |
| **NFR-14** Unicode / Bengali | nicknames, messages | PROF-01, CHAT-02 | IT-CHAT, IT-PROF |

## 3. Test legend

| ID | Type | Covers |
|---|---|---|
| UT-EMAIL | Unit | Email parser vector table (TRD §4) |
| UT-OTP | Unit | OTP generation/hash/expiry/attempts/single use |
| UT-MATCH | Unit | MatchingService: pairing, 100 simultaneous joins, blocks, cooldown, disconnect; RoomService basics |
| UT-PRIVACY | Unit/integration | No email/ID/session ID in socket payloads, logs, client bundle; no real-name column unless approved |
| UT-SCHEMA | Integration (DB) | Duplicate email, self-block, self-chat, cascade, duplicate report, nickname CHECK |
| IT-AUTH-REQ | Integration | request-code validation, uniform responses, rate limits |
| IT-AUTH-VER | Integration | verify-code success/wrong/expired/reused/locked |
| IT-SESS | Integration | Cookie flags, `/me` 401, logout invalidation, security headers |
| IT-STATUS | Integration | Banned/suspended blocked at login, requests and sockets |
| IT-PROF | Integration | Nickname validation, denylist, authorisation, preferences |
| IT-SOCK | Integration | Socket handshake auth, origin check, banned rejection, single-socket policy |
| IT-QUEUE | Integration | queue join/leave/double join, match payload contents |
| IT-CHAT | Integration | Message validation, dedupe, membership, typing, XSS text, Unicode, signaling membership |
| IT-REPORT | Integration | Server-derived reported user, evidence, de-dupe, flag |
| IT-BLOCK | Integration | Block effect on matching, both directions |
| IT-RATE | Integration | 429/`RATE_LIMITED` shape for each limiter |
| IT-ADMIN | Integration | 403 for non-admin, actions, ban kills live socket |
| IT-DELETE | Integration | Account deletion cascade and revocation |
| IT-RETENTION | Integration | Retention rules (dry-run then real) |
| E2E-GUARD | E2E (Playwright) | Redirects, onboarding flow, no redirect loops |
| E2E-CHAT | E2E | Two contexts: match → chat → skip → report/block |
| E2E-MOD | E2E | Report → admin queue → action → effect |
| E2E-STATES | E2E | 404, offline banner, empty queue, error states |
| MAN-GRACE | Manual | Refresh/network drop inside and outside 15 s grace |
| MAN-RTC | Manual | Permissions, devices, two browsers, phone over HTTPS, camera light off |
| MAN-TURN | Manual | Forced relay, UDP blocked, expired/unreachable TURN |
| MAN-RESP | Manual | 360 / 768 / 1280 px, iOS Safari, Android Chrome, keyboard overlap |
| MAN-COPY | Manual | Copy audit (UI spec §8) |
| A11Y-AUDIT | Manual + tool | Focus, labels, dialogs, contrast, keyboard, shortcuts |
| SEC-REVIEW | Review | Routes/events authorisation, CSP, `npm audit`, secret scan |
| LOAD-01 | Script | 50–200 simulated sockets |
| SMOKE-DEPLOY | Smoke | Live-URL checklist (HTTPS, cookies, WebSocket, migrations) |
| CI-GREEN | CI | lint, typecheck, test, build |
| LEGAL-REVIEW | Manual | Terms/Privacy text vs real data practice; UIU permission |

## 4. Reverse index: task → requirements

| Task | Requirements |
|---|---|
| FND-01 | (decision gate; all via OD) |
| FND-02 | NFR-13 |
| FND-03 | NFR-06, NFR-13 |
| FND-04 | (enabler for schema and persistence) |
| FND-05 | NFR-05, NFR-11 |
| FND-06 | NFR-03, NFR-10 |
| AUTH-01 | FR-01 |
| AUTH-02 | FR-02 |
| AUTH-03 | FR-01, FR-02, FR-03, FR-19, NFR-04 |
| AUTH-04 | FR-03, FR-04, FR-06, NFR-03 |
| AUTH-05 | FR-04, FR-05 |
| AUTH-06 | FR-01, FR-02, FR-03, NFR-12 |
| AUTH-07 | FR-02 |
| PROF-01 | FR-07, FR-08, NFR-05, NFR-14 |
| PROF-02 | FR-07 |
| PROF-03 | FR-08, NFR-12 |
| PROF-04 | FR-05, FR-07 |
| UX-01 | FR-28, FR-30, NFR-12 |
| UX-02 | NFR-09 (optional) |
| RT-01 | FR-05, FR-06, FR-16, NFR-07 |
| RT-02 | FR-16, FR-30 |
| RT-03 | FR-10, FR-11, NFR-01 |
| RT-04 | FR-10, FR-11, NFR-01, NFR-05 |
| RT-05 | FR-10 |
| CHAT-01 | FR-12, FR-15 |
| CHAT-02 | FR-12, FR-13, FR-14, NFR-02, NFR-06, NFR-14 |
| CHAT-03 | FR-12, FR-13, FR-14 |
| CHAT-04 | FR-15, FR-16 |
| CHAT-05 | NFR-12 |
| SAFE-01 | FR-18 |
| SAFE-02 | FR-17 |
| SAFE-03 | FR-17, FR-18 |
| SAFE-04 | FR-19 |
| SAFE-05 | FR-06, FR-21, FR-22, FR-23 |
| SAFE-06 | FR-21, FR-22 |
| SAFE-07 | FR-20 |
| VID-01 | FR-24 |
| VID-02 | FR-25 |
| VID-03 | FR-25, FR-26 |
| VID-04 | FR-27 |
| VID-05 | FR-27, NFR-12 |
| HARD-01 | FR-29, NFR-11 |
| HARD-02 | FR-09 |
| HARD-03 | FR-05, FR-12, FR-14, FR-17, FR-18, FR-21..23, FR-30 |
| HARD-04 | NFR-03, NFR-06 |
| HARD-05 | NFR-08, NFR-09 |
| HARD-06 | NFR-01, NFR-02, NFR-07 |
| HARD-07 | NFR-07 |

(Task IDs are written without the `TASK-` prefix in tables for width; e.g. `AUTH-03` = `TASK-AUTH-03`.)

## 5. Decision dependency map

| Decision | Requirements / tasks affected |
|---|---|
| OD-01 Auth model | FR-01..04, FLOW-01/02, AUTH-03..06, PROF-03 (change-password) |
| OD-02 Release order | FR-24..27, VID-*, CHAT-05, RT-05 |
| OD-03 Stack/shared contracts | FND-03..05, all tests |
| OD-04 Session mechanism | FR-04, FR-06, AUTH-04, RT-01 |
| OD-05 Identity data | `users.real_name/student_id`, Register UI, FND-05, NFR-05 |
| OD-06 Eligibility/domains | FR-01, AUTH-01 |
| OD-07 Nickname model | FR-07, PROF-01/02 |
| OD-08 Chat layout and interaction | FR-14, CHAT-03, SAFE-03 |
| OD-09 Deployment topology | TRD §13, FND-06, HARD-07 |
| OD-10 Profile stats / notifications | FR-08, PROF-03 |
| OD-11 Moderation policy | FR-17, FR-18, FR-20..23, SAFE-* |
| OD-12 Retention / deletion | FR-09, FR-29, FND-05, HARD-01/02 |
| OD-13 Matching policy | FR-10, FR-11, RT-03 |
| OD-14 Email provider | FR-02, AUTH-07 |
| OD-15 UIU permission and legal | FR-28, UX-01 |
| OD-16 TURN strategy | FR-27, VID-04 |
| OD-17 Video privacy posture | VID-05 |
| OD-18 Hosting/cost | HARD-07 |
| OD-19 Shared layout extraction | UX-02 |

## 6. Consistency check performed
Every FR-01..FR-30 and NFR-01..NFR-14 appears in §1 or §2 with at least one task and one test. Every task in IMPLEMENTATION-PLAN appears in §4. Every test ID used in IMPLEMENTATION-PLAN is defined in §3. Table/column and endpoint names match BACKEND-SCHEMA and TRD §6–7. Items **not** machine-checked: wording consistency across documents (reviewed by reading only).
