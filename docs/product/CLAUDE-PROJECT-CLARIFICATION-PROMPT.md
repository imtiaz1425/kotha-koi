# KothaKoi (কথা কই) — Project Clarification, Architecture Audit & Documentation Prompt for Claude

> **Usage Instructions:**  
> Copy and paste this prompt directly into Claude when starting your planning session for the KothaKoi project. This prompt establishes the exact workspace reality, strict operating guardrails, and detailed specifications for generating the required product and engineering documentation before code implementation begins.

---

```markdown
# Role & Mission

You are an expert Principal Product Manager and Lead Full-Stack Architect. You are working inside my existing **KothaKoi (কথা কই)** project workspace.

KothaKoi is a playful, anonymous, student-only chatting web application exclusively for verified students of **United International University (UIU)** in Dhaka, Bangladesh. The app combines anonymous text adda and 1-on-1 video communication with campus culture, strict privacy separation (real identity verified for safety but never revealed in chat), retro neo-brutalist aesthetics (tea-stall / tong culture, mascot, orange/cream/yellow palette), and robust reporting/moderation controls.

**Your mission:**  
Clarify the product, audit the existing codebase and architecture plan, resolve technical ambiguities, and produce eight (8) authoritative, cohesive planning documents in `docs/product/`. 

**DO NOT write application feature code, install packages, modify existing UI, or alter Git state in this planning phase. Audit and document first.**

---

## 1. Strict Operating Guardrails & Safety Rules

1. **Audit First, Document Second:** Always verify claims against the actual files in this workspace. Treat code and config as source of truth, not previous chat memories or unverified assumptions.
2. **Zero Code Modification:** Do **not** modify or refactor any existing frontend or backend source files (`frontend/src/*`, `backend/src/*`). Do not add, edit, or delete any application code in this task.
3. **No Package Installations or File Deletions:** Do **not** run `npm install`, add dependencies, or delete files.
4. **Git Safety:** Never run `git reset`, `git checkout .`, `git clean`, rewrite history, or push to remote repositories.
5. **Secret Protection:** **NEVER** open, read, display, or commit `.env` or any file containing private keys, credentials, or secrets. Only consult `.env.example` to understand expected environment variables.
6. **Preserve Existing UI Work:** A substantial amount of custom UI work has already been designed with a specific neo-brutalist theme. **Do NOT propose throwing away or redesigning these screens.** Your job is to audit them, fit them into the functional architecture, identify missing states (loading, errors, disconnects, admin), and specify what needs wiring.
7. **Preserve Reference Plans:** `UIUChat-Plan.md` is an existing 74KB architecture roadmap in the repository root. Do **NOT** delete or overwrite it. Treat it as high-value reference material to cross-examine and formalize.
8. **Distinguish Facts from Recommendations:** Explicitly label what is confirmed in the workspace code vs. what is assumed or recommended. Document unknowns rather than hallucinating requirements.
9. **Architectural Pragmatism:** Avoid unnecessary infrastructure (e.g., microservices, Kafka, Redis clusters for a single-server university pilot) unless strictly required by MVP scale.
10. **Flag Approvals:** Explicitly identify architectural or product decisions that require user approval before implementation.

---

## 2. Workspace File Inventory & What Claude Must Inspect

Before generating any documentation, inspect the following existing files and directories to understand the codebase:

### Root Files
- `UIUChat-Plan.md`: 74KB detailed 15-module engineering roadmap, architectural decisions, and schema proposals prepared in October 2026.
- `.env.example`: Expected environment configuration keys (`SESSION_SECRET`, `PORT`, `NODE_ENV`, `CLIENT_ORIGIN`, `DATABASE_URL`).
- `.gitignore`: Ignored items (`node_modules`, `.env`, `dist`, build logs).

### Frontend Workspace (`frontend/`)
- `frontend/package.json`: React 18.3.1, React Router DOM 6.26.2, Vite 5.4.2, Tailwind CSS 3.4.13, TypeScript 5.5.3. Notice: **No Socket.IO client, no WebRTC wrapper, no Axios**.
- `frontend/vite.config.ts`: Vite config on port 3000 with `/api` proxying to `http://localhost:5000`. Notice: `/socket.io` proxy with `ws: true` is **not yet configured**.
- `frontend/index.html`: Contains Google Fonts (`Inter`, `Space Grotesk`, `Space Mono`) and Google `Material Symbols Outlined`.
- `frontend/tailwind.config.js`: Rich custom neo-brutalist design tokens: primary `#9c4500`, primary-container `#f47721` (warm orange), cream `#FFF5E6`, secondary `#735c00`, yellow accents `#fecf26`, `#ffe087`, dark `#1c1b1b` borders and hard drop shadows (`shadow-[4px_4px_0px_#1c1b1b]`).
- `frontend/src/styles/global.css`: Base Tailwind imports, dark variable tokens, CSS resets.
- `frontend/src/App.tsx`: Unprotected route mapping for `/`, `/chat`, `/video`, `/login`, `/register`, `/profile`, `/choose-nickname`, `/nickname`.
- `frontend/src/pages/Home.tsx` (304 lines): Neo-brutalist landing page, animated tea mascot SVG with Bengali branding (`কথা কই`), UIU-only verification badge, Start Adda CTA, guidelines links, header profile dropdown.
- `frontend/src/pages/Login.tsx` (441 lines): UIU email or 7-10 digit student ID input, password, remember me, forgot password modal mockup, prototype simulation disclaimer, redirect to `/choose-nickname`.
- `frontend/src/pages/Register.tsx` (475 lines): Real name (marked strictly private/verification only), UIU student email input (`@([a-zA-Z0-9-]+\.)*uiu\.ac\.bd`), "Send Code" simulation, mock Email OTP verification box with auto-fill ('749201'), password matching, terms consent checkbox.
- `frontend/src/pages/ChooseNickname.tsx` (279 lines): Post-login alias selection step with 10 campus-themed presets (*Midnight Mango*, *Pixel Panda*, *Cha-er Cup*, *Library Ghost*, *Madani Rider*, etc.), shuffle button, custom alias drawer, real-name privacy callouts, Start Adda button to `/chat`.
- `frontend/src/pages/Chat.tsx` (680 lines): OmeTV-style room with dual video panels, floating chat overlay, initial mock message history between 'Cha-er Cup ☕' and 'Midnight Mango', simulated stranger replies on 1.2s delay from an array, quick emoji shortcuts (`☕`, `😭`, `🔥`), media mock toggles (mic/cam), Next match button (calls `window.location.reload()`), mock report and block confirmation prompts.
- `frontend/src/pages/Video.tsx` (753 lines): Google Stitch mock recreation of 1-on-1 video call, PiP self-view, interactive media controls, mock audio FX toggle, live side chat, report modal with reason selectors.
- `frontend/src/pages/Profile.tsx` (498 lines): Demo student profile (Tanvir Ahmed, 2310125, CSE), verification badge, real-name privacy callouts, mock account preferences toggles (auto shuffle nickname, default muted, default cam off, allow repeat matches), password modal, logout.
- `frontend/src/pages/Landing.tsx` & `Landing.module.css`: Legacy landing component (not currently routed in `App.tsx`).
- `frontend/src/pages/ChatPlaceholder.tsx`: Construction placeholder (not currently routed).

### Backend Workspace (`backend/`)
- `backend/package.json`: Express 4.19.2, express-session 1.18.1, cors 2.8.5, dotenv 16.4.5, TypeScript 5.5.4, nodemon, ts-node. Notice: **No Socket.IO, no Prisma or database drivers (`pg`), no Zod, no Bcrypt/Argon2, no Nodemailer/Resend**.
- `backend/src/server.ts`: Basic HTTP server on port 5000.
- `backend/src/app.ts`: Express application with CORS (`CLIENT_ORIGIN`), express.json(), `sessionMiddleware`, and route `/api` -> `healthRouter`.
- `backend/src/config/session.ts`: Session middleware requiring `SESSION_SECRET` from `.env`, `httpOnly: true`, 24h `maxAge`, secure cookie flag for production.
- `backend/src/routes/health.ts`: Single endpoint `GET /api/health` returning `{ status: 'ok' }`.
- `backend/.env`: **DO NOT INSPECT** (contains actual secrets).

---

## 3. Audited Real Current State & Readiness Assessment

The project currently stands at a very specific inflection point: **the student-facing frontend design is substantially prototyped with high visual polish, but the backend, database, and real-time communication layers are almost entirely unbuilt.**

### Feature Classification Matrix

| Feature | Current Classification | Verified Technical Reality in Codebase |
| :--- | :--- | :--- |
| **Home Page** | **UI Only** | `Home.tsx` is visually complete with neo-brutalist styling, mascot SVG, and navigation links. No dynamic server data or auth state integration. |
| **Login Screen** | **Mocked / Simulated** | `Login.tsx` validates email regex/student ID on client, shows prototype disclaimer, and redirects to `/choose-nickname` after timeout. No HTTP request to backend. |
| **Registration Screen** | **Mocked / Simulated** | `Register.tsx` collects real name and UIU email, includes mock OTP input with auto-fill '749201', and navigates to nickname selection. Completely client-side. |
| **Email OTP Verification** | **Mocked in UI / Not Implemented on Backend** | Frontend has interactive OTP preview UI; Backend has zero email delivery (Resend/Nodemailer), zero OTP generation, and zero hash storage. |
| **Nickname Selection** | **UI Only** | `ChooseNickname.tsx` features 10 UIU presets, shuffle animation, and custom input. Does not persist chosen nickname to backend session or database. |
| **Profile Screen** | **UI Only** | `Profile.tsx` displays mock student data (Tanvir Ahmed, 2310125), verification stamp, and mock preference toggles. No API or database backing. |
| **Chat Interface** | **Mocked / Simulated** | `Chat.tsx` has OmeTV dual-panel video stage, text overlay, canned responses (`MOCK_REPLIES`), mock media toggles. No Socket.IO, no server room. |
| **Video Interface** | **Mocked / Simulated** | `Video.tsx` has full layout, camera PiP, controls, side chat, and report modal mockup. No `RTCPeerConnection`, no `getUserMedia`, no signaling. |
| **Navigation & Route Protection** | **Partially Implemented (Routing only)** | `App.tsx` routes exist, but all routes are completely public. No `ProtectedRoute` component, no auth guards, no token check. |
| **Backend APIs** | **Partially Implemented (Health check only)** | Only `GET /api/health` exists. No auth, profile, matching, report, or TURN credential endpoints. |
| **Auth & Sessions** | **Partially Implemented (Middleware only)** | `session.ts` configures `express-session`, but no auth controllers, login/logout handlers, or user session stores exist. |
| **Database Integration** | **Not Implemented** | No Prisma schema, no migrations, no database client, no Docker compose for Postgres. `DATABASE_URL` is commented in `.env.example`. |
| **Matchmaking Queue** | **Not Implemented** | No in-memory matching service, no queue data structures, no concurrency handling. "Next" button in UI simply reloads the page. |
| **Real-Time Messaging** | **Not Implemented** | Socket.IO is not installed on frontend or backend. Messages are local React state with timeouts. |
| **WebRTC & STUN/TURN** | **Not Implemented** | Zero peer connection code, no ICE candidate exchange, no media stream binding, no TURN provider credentials endpoint. |
| **Reporting & Blocking** | **Mocked in UI / Not Implemented on Backend** | Frontend has report dialogs and browser `confirm()` prompts. No database tables or endpoints to store reports or enforce blocks. |
| **Admin Panel** | **Not Implemented (0%)** | Zero admin screens, zero moderation routes, zero report resolution UI. |

### Completion Estimates Breakdown

- **UI Completion: ~55%**  
  *Basis:* The student-facing views (`Home`, `Login`, `Register`, `ChooseNickname`, `Chat`, `Video`, `Profile`) are built with strong visual identity and neo-brutalist styling. However, admin UI is 0%, error boundary and fallback states are missing, real loading/reconnecting overlays are absent, and empty/unauthorized states need definition.
- **Functional Completion: ~15%**  
  *Basis:* Interactive local UI states (shuffling, validation regex, simulated chat timers, mock OTP auto-fill) work well in isolation, but there is zero end-to-end data flow between frontend and backend.
- **Backend Completion: ~5%**  
  *Basis:* Basic Express server boilerplate, CORS, and an unused session cookie config. Only 1 route (`GET /api/health`). Zero database, zero socket server, zero auth logic.
- **Overall MVP Readiness: ~20%**  
  *Basis:* The visual prototype demonstrates what the user experience should feel like, but the operational core of the application (Postgres DB, Prisma ORM, UIU email OTP verification, Socket.IO queue, text chat room lifecycle, WebRTC signaling, report handling) remains to be implemented.

---

## 4. Required Documentation Deliverables

Claude must generate eight (8) clear, professional, production-grade markdown documents inside the `docs/product/` directory.

### Deliverable 1: `docs/product/PRD.md` (Product Requirements Document)
- **Product Overview & Mission:** Define KothaKoi (কথা কই), campus-exclusive anonymous chatting for UIU students.
- **Target Audience & Personas:** UIU undergraduate and graduate students across departments (CSE, BBA, EEE, etc.), day scholars, campus regulars, introverts seeking low-stakes conversation.
- **Value Proposition:** Anonymity without harassment, campus context (Madani Avenue, tong cha, finals) without profile baggage or social media footprint.
- **MVP Scope vs. Post-MVP Scope:**
  - *In MVP:* UIU email OTP verification, passwordless or password-based session auth, anonymous nickname generation/selection, 1-on-1 text chat matchmaking, skip/next/end flow, report & block mechanisms, minimal admin moderation queue.
  - *Release 2:* 1-on-1 WebRTC video chat with media controls and TURN relay.
  - *Explicitly Excluded:* Permanent chat history, image/file uploads, group rooms, public profiles, follower lists, social media links.
- **Functional Requirements (FR-01 to FR-XX):** Detailed specifications with explicit acceptance criteria.
- **Non-Functional Requirements (NFR-01 to NFR-XX):** Performance (queue pairing latency < 2s, message relay < 100ms), security (httpOnly cookies, OTP rate limits, zero XSS), privacy (real name isolated in DB, never emitted to sockets), availability.
- **Privacy & Safety Architecture:** Strict separation between private verification records (real name, student ID, email) and public ephemeral chat identities (nicknames).
- **Abuse Prevention & Moderation:** Report intake, block lists preventing rematching, auto-suspension thresholds, admin action workflows.
- **Unresolved Product Decisions:** Highlighting questions requiring owner approval.

### Deliverable 2: `docs/product/APP-FLOW.md` (User Journeys & State Machines)
- Complete step-by-step user flows with ASCII/Mermaid sequence and state diagrams:
  1. Registration & UIU Institutional Email OTP Verification Flow.
  2. Login & Session Authentication Flow.
  3. First-Time Onboarding & Nickname Selection Flow.
  4. Matchmaking Queue Lifecycle (Idle → Queuing → Matched → In-Chat → Ending/Skipping).
  5. Text Chat Session Flow (message delivery, typing indicators, peer disconnect grace period).
  6. Video Chat Call Flow (permission requests, signaling, ICE connection, mute/cam toggles, fallback).
  7. End Chat, Skip, and Next Match Transitions.
  8. Reporting and Blocking User Journey (in-chat report trigger → evidence capture → partner disconnect → admin queue).
  9. Profile & Settings Management Flow.
  10. Admin Moderation Workflow (review report evidence snapshot, ban/suspend user, dismiss).
- Edge Cases & Exception Handling: Partner browser tab closed, network glitch during chat, OTP expired, banned user attempting login.

### Deliverable 3: `docs/product/UI-UX-SPECIFICATION.md` (UI Audit & Interface Specification)
- **Design System Audit:** Preserve the existing neo-brutalist / retro-pixel design language:
  - Color Palette: Orange `#F47721`, Cream `#FFF5E6`, Secondary `#735c00`, Yellow `#fecf26`/`#ffe087`, Dark `#1c1b1b` borders.
  - Typography: `Space Grotesk` (headings), `Inter` (body), `Space Mono` (labels/code).
  - Component Tokens: 2px solid dark borders, 4px hard drop shadows (`shadow-[4px_4px_0px_#1c1b1b]`), rounded corners (12px to 16px), pixel-art tea mascot.
- **Screen-by-Screen Audit & Specification:**
  - `Home.tsx`: Audit existing elements, specify dynamic auth status header, guidelines modal/section, responsive behaviors.
  - `Login.tsx`: Audit form inputs, map prototype feedback to real API integration, specify error states.
  - `Register.tsx`: Audit real name privacy callouts, specify real email OTP delivery flow and timer states.
  - `ChooseNickname.tsx`: Audit preset list and shuffle mechanism; define storage contract.
  - `Chat.tsx`: Audit dual-panel OmeTV layout vs. floating chat overlay, specify real Socket.IO message stream, message status (sending/sent/failed), reconnect banners.
  - `Video.tsx`: Audit WebRTC stream containers, media control bar, PiP switching, permission denial prompt.
  - `Profile.tsx`: Audit student ID card and preference toggles; specify backend update contract.
  - `AdminPanel.tsx` (NEW SPECIFICATION): Define layout, report list, evidence viewer, and user action buttons.
- **Responsive Behavior:** Mobile portrait (360px–480px), tablet (768px), and desktop (1024px+).
- **Accessibility & Keyboard Navigation:** Tab order, `Esc` for next match, `M` for mic toggle, `V` for camera toggle, ARIA labels for icon-only buttons.
- **Explicit Instruction:** Do **NOT** propose rebuilding or redesigning existing screens. Specify how to hook up and complete them.

### Deliverable 4: `docs/product/BACKEND-SCHEMA.md` (Database Model & Data Integrity)
- **Technology Evaluation:** Evaluate PostgreSQL + Prisma ORM against requirements (relational integrity for blocks, reports, and sessions; strict constraints; migrations support).
- **Entity Relationship (ER) Diagram:** Mermaid diagram showing entities and foreign keys.
- **Entities & Tables:**
  - `users`: `id` (UUID PK), `email` (unique, normalized), `real_name` (private), `student_id` (optional/indexed), `role` (`student` | `admin`), `status` (`active` | `suspended` | `banned`), `email_verified_at`, timestamps.
  - `profiles`: `user_id` (PK, FK → users.id cascade), `current_nickname`, `avatar_preset`, `preferences` (JSONB for auto-shuffle, media defaults), `updated_at`.
  - `login_codes`: `id` (UUID PK), `email` (indexed), `code_hash`, `expires_at`, `attempts`, `consumed_at`, `created_at`.
  - `sessions`: `id` (UUID PK), `user_id` (FK → users.id cascade), `token_hash` (unique), `expires_at`, `last_seen_at`, `created_at`.
  - `chat_sessions`: `id` (UUID PK), `mode` (`text` | `video`), `user_a_id`, `user_b_id`, `started_at`, `ended_at`, `ended_reason`.
  - `blocks`: `blocker_id` (FK → users.id), `blocked_id` (FK → users.id), `created_at`. Compound PK `(blocker_id, blocked_id)`.
  - `reports`: `id` (UUID PK), `reporter_id` (FK), `reported_id` (FK), `chat_session_id` (FK), `reason`, `details`, `evidence` (JSON snapshot of last ~20 messages), `status` (`open` | `reviewing` | `actioned` | `dismissed`), timestamps.
  - `moderation_actions`: `id` (UUID PK), `admin_id` (FK), `target_user_id` (FK), `report_id` (FK optional), `action` (`warn` | `suspend` | `ban` | `dismiss`), `reason`, `expires_at`, `created_at`.
- **Privacy Boundaries & Ephemeral Data:**
  - Chat text messages are **NEVER** stored permanently in the database. They live in server memory during the chat room session and evaporate upon room destruction unless attached as a report evidence snapshot.
- **Indexes & Unique Constraints:** Specific indexes for queue exclusion checks (`blocks`), session lookup (`sessions(token_hash)`), and report triage (`reports(status, created_at)`).
- **Data Retention & Pruning Strategy:** Daily scheduled job to delete expired login codes, delete expired sessions, and purge closed chat session metadata older than 30 days.

### Deliverable 5: `docs/product/IMPLEMENTATION-PLAN.md` (Phased Engineering Roadmap)
- Phased, dependency-aware task breakdown structured to minimize architectural risk.
- **Phases:**
  - *Phase 1: Foundation, Database & Scaffolding* (Prisma, Postgres container, unified script, shared types).
  - *Phase 2: Authentication, Verification & Route Protection* (UIU domain validator, OTP service, session auth middleware, frontend route guards).
  - *Phase 3: Profile & Nickname Management* (Profile API, persistence of selected aliases).
  - *Phase 4: Real-Time Infrastructure & Matching Queue* (Socket.IO setup, session cookie auth handshake, atomic in-memory queue service).
  - *Phase 5: Real-Time Text Chat & Room Lifecycle* (Room creation, message delivery, typing indicator, skip/end, disconnect grace period).
  - *Phase 6: Safety, Reporting & Blocking* (Block checks in queue, report API with memory snapshot, admin moderation interface).
  - *Phase 7: WebRTC 1-on-1 Video Chat* (Signaling events, STUN/TURN integration, media controls, permission handling).
  - *Phase 8: Hardening, Testing & Deployment* (Rate limiting, Vitest/Playwright tests, production build, Docker).
- **Task Format for Every Task:**
  - Task ID (e.g., `TASK-AUTH-01`)
  - Title & Component (Frontend / Backend / DB)
  - Dependencies (prerequisite tasks)
  - Detailed Scope & Implementation Steps
  - Acceptance Criteria
  - Testing & Verification Plan
- **Recommended First Task:** Clearly define the exact first task to execute and justify why it must come first (e.g., Database container setup and Prisma schema foundation).

### Deliverable 6: `docs/product/TRD.md` (Technical Requirements Document)
- **System Architecture:** Detailed architecture diagram and component interaction model.
- **Stack Decision Confirmation:**
  - Frontend: React + Vite + TypeScript + Tailwind CSS.
  - Backend: Node.js + Express + TypeScript on a single service.
  - Real-time: Socket.IO (integrated into Express HTTP server).
  - Database & ORM: PostgreSQL + Prisma.
  - Video & Audio: WebRTC (native browser API) + Socket.IO signaling + STUN/TURN.
- **API Conventions:** Standardized REST endpoint structure, JSON error responses (`{ error: { code, message, details } }`).
- **Socket.IO Event Specifications:** Formal payload definitions for all client-to-server and server-to-client events.
- **UIU Email Domain Verification Logic:**
  - Allowed domains list: `uiu.ac.bd` and subdomains (e.g. `bscse.uiu.ac.bd`).
  - Strict parsing: lowercase, split on `@`, check host domain strictly against allowed list. Prevent bypasses like `student@uiu.ac.bd.attacker.com`.
- **Random Matchmaking Algorithm & Concurrency Model:**
  - In-memory FIFO queues separated by mode (`text` vs `video`).
  - Strict rule: Synchronous pairing loop without `await` to prevent race conditions and double-matching on Node's single thread.
  - Exclusion checks: blocked users, self-matching, recent-partner cooldown (10 minutes).
- **WebRTC Signaling & STUN/TURN Strategy:**
  - SDP offer/answer relay, ICE candidate exchange.
  - Turn provider strategy (ephemeral credentials issued via `GET /api/ice-servers`).
  - Bandwidth management and resolution caps (e.g., 640x360 @ 30fps).
- **Security & Threat Model:**
  - Rate limiting on OTP requests (per IP and per email).
  - Session security (HttpOnly, SameSite=Lax, Secure in production).
  - Input sanitization (Zod schemas, plain text rendering to prevent XSS).
  - Denial-of-Service mitigations on socket message flooding.
- **Testing Strategy:** Unit testing with Vitest, integration testing for auth and queue, end-to-end testing with Playwright.
- **Deployment & Hosting Blueprint:** Single-container Docker deployment (or PaaS like Render/Railway/VPS) with managed Postgres.

### Deliverable 7: `docs/product/REQUIREMENTS-TRACEABILITY.md` (Traceability Matrix)
A comprehensive traceability matrix table linking every product requirement across the entire lifecycle:
`Requirement ID & Title → User Flow (APP-FLOW) → UI Screen/State → API Endpoint / Socket Event → Database Entity → Implementation Task ID → Verification Test`

### Deliverable 8: `docs/product/OPEN-DECISIONS.md` (Decision Log & Trade-offs)
A structured document logging critical architectural and product decisions that require user approval before implementation, formatted as:
- **Decision Title & Category** (Product / Technical / Safety)
- **Context & Problem Statement**
- **Recommended Default Option**
- **Alternative Options Considered**
- **Pros, Cons, and Cost/Complexity Implications**
- **Impact on Existing Work**
- **Current Status** (Pending User Approval / Approved)

Key decisions to document include:
1. *Authentication Model:* Passwordless Email OTP vs. Permanent Password + Email OTP Verification.
2. *Video Integration Phase:* Whether to launch Text Chat MVP first and defer WebRTC to Release 2.
3. *TURN Server Strategy:* Managed TURN provider (e.g., Metered/Twilio) vs. self-hosted `coturn` on a VPS.
4. *Chat Room Layout:* Standard dual-video OmeTV layout with bottom chat overlay vs. side-by-side vertical split.
5. *Student Eligibility Boundary:* Domain-only validation (`*.uiu.ac.bd`) vs. potential future integration with official UIU rosters.

---

## 5. Required Execution Workflow for Claude

When executing this prompt:
1. **First:** Perform a read-only audit of the existing workspace files (`UIUChat-Plan.md`, `frontend/src/*`, `backend/src/*`, `package.json` files).
2. **Second:** Create the directory `docs/product/` if it does not already exist.
3. **Third:** Generate each of the 8 required documents in sequence:
   - `docs/product/PRD.md`
   - `docs/product/APP-FLOW.md`
   - `docs/product/UI-UX-SPECIFICATION.md`
   - `docs/product/BACKEND-SCHEMA.md`
   - `docs/product/IMPLEMENTATION-PLAN.md`
   - `docs/product/TRD.md`
   - `docs/product/REQUIREMENTS-TRACEABILITY.md`
   - `docs/product/OPEN-DECISIONS.md`
4. **Fourth:** Verify cross-document consistency (e.g., Task IDs in `IMPLEMENTATION-PLAN.md` match those in `REQUIREMENTS-TRACEABILITY.md`, database fields match between `BACKEND-SCHEMA.md` and `TRD.md`).
5. **Fifth:** Provide a concise final report summarizing the findings, decisions needing approval, and next steps for implementation.

Do not write code for application features. Generate the complete planning and documentation suite first.
```
