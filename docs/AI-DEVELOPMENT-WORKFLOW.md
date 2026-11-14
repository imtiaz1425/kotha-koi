# KothaKoi — AI-Assisted System Engineering Case Study

> **Portfolio Case Study**  
> **Author & Project Architect:** Imthiyaz Ahmed ([@imtiaz1425](https://github.com/imtiaz1425))  
> **Tooling:** Antigravity (Google DeepMind Agentic AI), TypeScript, React, Node.js, Express, Socket.IO, WebRTC, Prisma, PostgreSQL  
> **Scope:** Architecture, Product Management, Prompt Engineering, Code Review, Debugging & Quality Assurance

---

## Executive Summary

KothaKoi (*"কথাকই"*) was conceived and engineered using an **AI-assisted software development methodology**. Rather than manually typing every boilerplate file or utility function, I served as the **lead architect, product manager, and verification engineer**—directing Google DeepMind's Antigravity agentic workflows to systematically implement, test, and document a real-time web application.

This case study documents the end-to-end engineering lifecycle: from initial product requirement documents (PRD) and technical specifications (TRD), to phased agent orchestration, human-in-the-loop debugging, visual testing, and pre-commit security auditing.

```
+-----------------------------------------------------------------------------------+
|                        THE HUMAN-AI ENGINEERING CYCLE                             |
|                                                                                   |
|   1. REQUIREMENTS          2. ORCHESTRATION         3. REVIEW & AUDIT             |
|   - PRD / TRD / Schema     - Phased Prompting       - Line-by-Line Code Review    |
|   - Contract Boundaries    - Subagent Delegation    - Catching Regressions        |
|   - Design Tokens          - File Editing Tools     - Security Sanity Checks      |
|             |                       |                         |                   |
|             v                       v                         v                   |
|   +-------------------+   +--------------------+   +-----------------------+      |
|   | Human Architect   |-->| Antigravity AI     |-->| Real-World Validation |      |
|   | (Strategy & Rules)|   | (Code Synthesis)   |   | (Vitest + Hardware)   |      |
|   +-------------------+   +--------------------+   +-----------------------+      |
|                                                               |                   |
|   4. GIT PRESERVATION <---------------------------------------+                   |
|   - Clean Milestone Checkpoints                                                   |
|   - Automated Test Gates                                                          |
+-----------------------------------------------------------------------------------+
```

---

## 1. Project Inception & Problem Statement

### The Spark
University students frequently experience social isolation across academic batches and departments. While open chat applications (e.g. Omegle) exist, they are unmoderated and infested with spam. Conversely, traditional campus social groups (Facebook groups, WhatsApp) expose personal contact numbers and social media profiles, creating social anxiety and preventing casual, spontaneous peer conversations.

### The Objective
Create an anonymous, low-friction random matchmaking application restricted to a university email format, featuring:
- **Instant Random Matching:** Anonymous 1-on-1 text chat and WebRTC audio/video.
- **Identity Separation:** Real names and student emails remain strictly private on the backend; only customizable or randomized nicknames are shared with peers.
- **Defensive Safety:** Server-resolved partner reporting, mutual blocking, and admin moderation.

---

## 2. Requirements Engineering & Pre-Coding Planning

Before generating a single line of application code, I authored a comprehensive set of foundational specifications located in the [`Files/`](../Files/) directory:

1. **Product Requirements Document ([`PRD.md`](../Files/PRD.md)):** Defined user personas, core user stories, edge cases (disconnections, timeouts), and safety constraints.
2. **Technical Requirements Document ([`TRD.md`](../Files/TRD.md)):** Specified system non-functional requirements (sub-200ms text latency, P2P video bitrate, HttpOnly session security).
3. **Application Flowchart ([`APP-FLOW.md`](../Files/APP-FLOW.md)):** Detailed the state machines for matchmaking, active calls, skips, and teardown.
4. **Backend Schema ([`BACKEND-SCHEMA.md`](../Files/BACKEND-SCHEMA.md)):** Outlined the PostgreSQL relational schema and Prisma entity models (`User`, `UserPassword`, `Session`, `VerificationCode`, `BlockedUser`, `Report`, `ModerationLog`).
5. **UI/UX Design Specification ([`UI-UX-SPECIFICATION.md`](../Files/UI-UX-SPECIFICATION.md)):** Established the Neo-Brutalist aesthetic—high-contrast borders (`#1c1b1b`), offset box shadows (`4px 4px 0px`), warm parchment backgrounds (`#FFF5E6`), and punchy accent colors.
6. **Requirements Traceability Matrix ([`REQUIREMENTS-TRACEABILITY.md`](../Files/REQUIREMENTS-TRACEABILITY.md)):** Linked every functional requirement to its corresponding test file and API route.

---

## 3. Technology Stack Selection

I deliberately chose a technology stack that maximized type safety, real-time performance, and developer velocity:

- **TypeScript Across All Layers:** Shared interfaces between backend and frontend via a local `@kothakoi/shared` package.
- **React 18 + Vite 5:** Fast development server with modular component architecture and predictable state management.
- **Tailwind CSS:** Custom configuration reflecting the Neo-Brutalist design tokens without heavy third-party UI dependencies.
- **Node.js & Express:** Lightweight, mature HTTP foundation with middleware chains for authentication, rate-limiting, and error handling.
- **Socket.IO 4.8:** Robust WebSocket transport with automatic fallback to HTTP long-polling, room-based multiplexing, and disconnect detection.
- **WebRTC & Metered TURN:** Standard `RTCPeerConnection` for direct media streams, paired with dynamic short-lived TURN credentials from Metered.ca for NAT traversal.
- **PostgreSQL & Prisma 5:** ACID-compliant relational data store with automated migration tracking and type-safe query generation.
- **Native Node.js `scrypt`:** Secure cryptographic password hashing with 16-byte random salts and timing-safe equality comparison.

---

## 4. Phased Development Breakdown

I structured the implementation into distinct milestone phases to prevent scope creep and maintain testability:

```
+-------------------------------------------------------------------------------+
| PHASE 1: Project Skeleton & Authentication Infrastructure                      |
| Email normalization, domain allowlist, HMAC-SHA256 OTP, scrypt password auth. |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
| PHASE 2: Real-Time Matchmaking & Ephemeral Chat                               |
| In-memory FIFO queue, single-session preemption, Socket.IO text messaging.    |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
| PHASE 3: WebRTC Video/Audio & TURN NAT Traversal                              |
| RTCPeerConnection transceivers, ICE candidate signaling, Metered TURN relay.  |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
| PHASE 4: Safety, Moderation & Privacy Guardrails                              |
| Mutual blocking, partner reporting with chat snippets, RBAC admin dashboard.  |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
| PHASE 5: Lifecycle Polish & Automated Retention                               |
| Self-serve account deletion, retention cleanup scripts, responsive UI polish. |
+-------------------------------------------------------------------------------+
```

---

## 5. Directing Antigravity: The Prompt Engineering Strategy

To achieve high code quality from AI models, vague prompts like *"build me a chat app"* fail. I used structured prompt briefs that enforced strict operational constraints:

1. **Context Anchoring:** Explicitly naming the existing files, interfaces, and database models to reuse.
2. **Deterministic Inputs/Outputs:** Defining exact API request/response schemas and HTTP error codes.
3. **Negative Constraints:** Strictly forbidding:
   - Modifying unrelated code.
   - Leaking credentials or editing `.env` files.
   - Rewriting working business logic without explicit instruction.
   - Inventing unverified library dependencies.
4. **Mandatory Verification Gates:** Requiring unit tests to be written and executed alongside every new route or feature.

---

## 6. Human-in-the-Loop: Review, Debugging & Critical Corrections

AI models frequently make subtle architectural errors or take path-of-least-resistance shortcuts. My most critical contribution was **code review, identifying architectural regressions, and commanding course corrections**.

### Critical Intervention 1: Enforcing Real Name Immutability
- **The AI's Flaw:** During profile screen generation, the AI made the user's "Real Name" field editable via an inline form input.
- **My Catch:** Allowing users to alter their real name after registration undermined the safety model (users could impersonate others or cycle identities).
- **The Correction:** I directed the AI to make Real Name strictly immutable. In `backend/src/routes/profile.ts`, any request containing `name` or `realName` is rejected with `400 VALIDATION_FAILED`. On the frontend (`ProfileDropdown.tsx`), the field was converted into a read-only, disabled display.

### Critical Intervention 2: Reverting Unwanted Modal Redesign
- **The AI's Flaw:** In an attempt to improve the profile screen, the AI replaced the compact top-right dropdown with a massive, centered modal overlay that blurred and obstructed the entire video chat screen.
- **My Catch:** The full-screen overlay broke the chat flow and made it impossible to monitor the video call while checking profile details.
- **The Correction:** I provided visual screenshot feedback, rejected the modal, and commanded the AI to restore the exact original right-anchored dropdown layout (`w-56 sm:w-60`).

### Critical Intervention 3: Admin Provisioning Without Passwords
- **The AI's Flaw:** The initial `promote-admin.ts` script updated an existing user's role to `ADMIN` but failed to handle password creation, preventing the admin from logging in via `/admin/login`.
- **My Catch:** I discovered that the script left the `UserPassword` relation untouched.
- **The Correction:** I instructed the AI to implement interactive, hidden terminal password input with confirmation, hash the input using `scrypt`, and store it in `UserPassword` without ever printing plaintext credentials to stdout.

### Critical Intervention 4: Resolving Metered TURN Credentials Bug
- **The AI's Flaw:** In testing cross-network video calls between Wi-Fi and mobile 4G/5G, audio/video failed to connect.
- **My Catch:** I inspected the backend diagnostic output and discovered that the environment variable `METERED_API_KEY` had been populated with an entire URL instead of the bare 36-character API token.
- **The Correction:** I audited `turn.service.ts`, sanitized the environment configuration, reloaded the service, and verified all 5 ICE server entries (STUN, TURN UDP, TURN TCP, TURNS TLS) through authenticated testing.

### Critical Intervention 5: Auditing Misleading Claims
- **The AI's Flaw:** The AI generated a README claiming *"Official UIU Student Authentication"*, *"Institutional verification"*, and *"Argon2 / scrypt hashing"*.
- **My Catch:** The project is an independent student portfolio project, not an official university service. Furthermore, the code uses only `scrypt`, not `argon2`.
- **The Correction:** I ordered a complete honesty audit, stripping all institutional claims and reframing the project accurately for my portfolio.

---

## 7. Visual Interface & Screenshot Evidence

The application was interactively tested in live browser sessions. Below is the screenshot evidence from the active development environment:

### 1. Landing Page & Public Face
The entry point features the high-contrast Neo-Brutalist visual language, real-time online counter (`Online: 1`), registration rules, and quick-action navigation.

![KothaKoi Landing Page](../SS-UI/Screenshot%202026-11-14%20213626.png)
*Figure 1: KothaKoi Landing Page featuring live online student counter, Neo-Brutalist typography, and primary CTA.*

---

### 2. Live Matchmaking & WebRTC Video Interface
Demonstrates the active queue state (`"Searching for a UIU Peer..."`), local video viewport with the anonymous chat persona (`You (Library Ghost)`), floating draggable chat window (`UIU Live Chat`), and bottom call controls.

![KothaKoi Active Matchmaking & Chat](../SS-UI/Screenshot%202026-11-14%20213635.png)
*Figure 2: Real-time dual-pane video calling interface with active matchmaking search, floating draggable chat overlay, and media controls.*

---

### 3. Admin Moderation & Safety Center
The moderation queue allows administrators to filter incoming student safety reports across categories (`ALL`, `OPEN`, `REVIEWING`, `ACTIONED`, `DISMISSED`) with associated chat context evidence.

![KothaKoi Admin Reports View](../SS-UI/Screenshot%202026-11-14%20213456.png)
*Figure 3: Role-based Admin Moderation Dashboard displaying the report review queue and status filters.*

---

### 4. Admin Real-Time Metrics Overview
The administrative overview tab monitors core application health metrics in real time: Total Users (31), Active Sessions (2), Online Sockets (1), Pending Reports (0), and Banned Users (9).

![KothaKoi Admin Overview Metrics](../SS-UI/Screenshot%202026-11-14%20213654.png)
*Figure 4: Admin Overview displaying live aggregate metrics, active sessions, and moderation telemetry.*

---

## 8. Verification & Testing Strategy

To maintain high software reliability, I implemented a dual-track testing strategy:

### Automated Test Suites
- **Backend Tests (206 Tests):** Unit, integration, security, and race-condition tests executed via Vitest. Covers OTP expiry, session cookies, rate-limiting, double-join queue race conditions, WebRTC signaling relays, and admin RBAC guards.
- **Frontend Tests (79 Tests):** Component rendering, route guards, identity separation, floating chat window mechanics, and WebRTC receive-only fallbacks executed via Vitest and React Testing Library.

### Manual Hardware & Network Testing
- **Cross-Network WebRTC Verification:** Tested video/audio streaming between a desktop PC on residential Wi-Fi and an iPhone on a cellular 4G mobile network (Carrier-Grade NAT) via Cloudflare Tunnels and Metered TURN relays.
- **Permission Edge Cases:** Verified that denied camera/mic permissions gracefully fall back to receive-only mode rather than crashing the application.
- **Disconnection Handling:** Tested browser refresh, tab closing, and the 10-second reconnection grace period.

---

## 9. Git Milestone Preservation

Development progress was committed in distinct, logical milestones to preserve clean Git history:

- `6c1e129`: Initial project checkpoint, folder structure, and basic layout.
- `3c925b5`: Core authentication, OTP service, session cookies, and database models.
- `4150584`: Real-time text chat, matchmaking queue, floating window, and identity separation.
- `9be5e13`: WebRTC video calling, Metered TURN integration, and network recovery.
- `2d23675`: Reporting, blocking, admin dashboard, account deletion, and retention cleanup.
- `f925b1b`: Complete documentation accuracy audit and portfolio honesty rewrite.

---

## 10. Lessons Learned in AI-Assisted Engineering

1. **AI is an Engine; You Are the Driver:** AI excels at boilerplate generation, schema transformations, and test writing. However, it lacks holistic system judgment. Without clear architectural direction, AI will introduce subtle bugs, break UI consistency, or invent false requirements.
2. **Specifications are Mandatory:** The quality of AI output is directly proportional to the rigor of your upfront specifications. Writing `PRD.md` and `TRD.md` first saved dozens of hours of refactoring.
3. **Automated Tests are Your Safety Net:** When asking AI to refactor or add features, a comprehensive test suite (285 total tests in KothaKoi) is the only way to instantly catch regressions.
4. **Honesty Over Hype:** AI-generated documentation tends to exaggerate capabilities. Rigorous human review is required to ensure portfolio presentations remain completely truthful and technically precise.

