# KothaKoi (কথাকই) — Independent Random Chat Web Application

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-blue.svg)](https://www.postgresql.org/)
[![Status](https://img.shields.io/badge/Status-Portfolio%20%2F%20Local%20Dev-orange.svg)](#disclaimer)

> **KothaKoi** (*"কথাকই"* — Bengali for *"Let's talk"*) is an independent, student-built anonymous random chat web application developed as a software engineering and portfolio project. It allows registered participants to pair randomly for real-time text chat and optional peer-to-peer audio/video calling.

---

## Disclaimer

> [!IMPORTANT]
> **Independent Project Notice:**  
> KothaKoi is an independent personal project created solely for software development learning, experimentation, and portfolio demonstration.
> - **No Affiliation:** This project is **NOT** affiliated with, operated by, sponsored by, or endorsed by **United International University (UIU)** or any academic institution.
> - **No Institutional Verification:** Application-level email domain filtering (e.g., requiring an `@*.uiu.ac.bd` domain format) is an internal registration rule to simulate campus-bounded communities; it is **NOT** official university identity verification, institutional Single Sign-On (SSO), or registrar-backed student authentication.
> - **Development & Portfolio Scope:** The application is architected and tested for local development and technical demonstration. It is not currently deployed as an active public service.

---

## Table of Contents

- [1. Project Overview & Motivation](#1-project-overview--motivation)
- [2. Implemented Features & Status](#2-implemented-features--status)
- [3. Technology Stack](#3-technology-stack)
- [4. System Architecture](#4-system-architecture)
- [5. Authentication & Identity Flow](#5-authentication--identity-flow)
- [6. Privacy & Security Model](#6-privacy--security-model)
- [7. Directory Structure](#7-directory-structure)
- [8. Prerequisites](#8-prerequisites)
- [9. Local Setup & Installation (Windows)](#9-local-setup--installation-windows)
- [10. Database Configuration (PostgreSQL & Prisma)](#10-database-configuration-postgresql--prisma)
- [11. Environment Variables](#11-environment-variables)
- [12. Running the Application](#12-running-the-application)
- [13. WebRTC & Metered TURN Configuration](#13-webrtc--metered-turn-configuration)
- [14. Testing Across Networks](#14-testing-across-networks)
- [15. Current Limitations](#15-current-limitations)
- [16. Future Roadmap](#16-future-roadmap)
- [17. Documentation Links](#17-documentation-links)

---

## 1. Project Overview & Motivation

Real-time communication software presents fascinating full-stack engineering challenges: coordinating bidirectional WebSockets, orchestrating WebRTC peer-to-peer media negotiations through symmetric NATs, managing session state without database bottlenecks, and structuring privacy boundaries.

I built KothaKoi to explore and master these technologies hands-on:
1. **Real-Time State Synchronization:** Managing random matchmaking queues, pairing lifecycles, and ephemeral messaging with Socket.IO.
2. **WebRTC Media Streaming:** Implementing peer connection transceivers, ICE candidate exchange, and dynamic TURN relay fallback across heterogeneous network topologies (e.g. mobile 4G/5G vs home Wi-Fi).
3. **Identity Separation Architecture:** Enforcing a strict boundary between confidential registration data (real name and email) and public chat personas (customizable nicknames).
4. **Defensive API Design:** Implementing rate limiting, input sanitization with Zod schemas, role-based access control (RBAC), and automated data retention policies.

---

## 2. Implemented Features & Verification Status

To ensure complete transparency, features are categorized by their real-world verification state rather than assuming automated tests prove full production readiness:

- **Implemented and automated-tested:** Covered by automated unit/integration test suites (Vitest).
- **Implemented and manually-tested:** Interactively verified by the developer in real browsers.
- **Implemented but partially verified:** Implemented and functional with mocks/dev proxies, but dependent on external infrastructure (e.g. cellular carrier NATs or third-party email providers) requiring further real-world verification.
- **Planned / not implemented:** Designed or planned for future iterations.

| Feature Area | Feature | Status | Verification & Technical Details |
|---|---|---|---|
| **Authentication** | Email Domain Check | **Implemented and automated-tested** | Validates ASCII syntax and checks against allowlist (`ALLOWED_EMAIL_DOMAINS`). Verified in `email.test.ts`. |
| | OTP Verification | **Implemented but partially verified** | 6-digit OTP and HMAC-SHA256 generation tested with database. In dev/test, codes log to console via `ConsoleEmailSender`. Live SMTP delivery to inboxes is **not implemented**. |
| | Password Auth & Sessions | **Implemented and automated-tested** | Password derivation using Node.js `crypto.scryptSync` with random 16-byte salt; signed HttpOnly session cookie. Tested in `password-auth.test.ts` & `session.test.ts`. |
| **Profile** | Real Name (Private) | **Implemented and automated-tested** | Captured at registration, immutable once set. Backend `PUT /api/profile` rejects edits with `VALIDATION_FAILED`. Tested in `profile.test.ts`. |
| | Display Name (Public) | **Implemented and manually-tested** | Nickname input and random Shuffle Name (🎲) generator. Verified in browser and component tests. |
| **Matchmaking** | Random FIFO Queue | **Implemented and automated-tested** | In-memory pairing queue in `matching.ts`. Pairs 2 distinct users; single-session per account. Tested in `matching-queue.test.ts`. |
| | Bidirectional Block Check | **Implemented and automated-tested** | Prevents previously blocked user pairs from pairing. Tested in `matching-queue.test.ts` & `reporting-blocking.test.ts`. |
| | Next / Skip Lifecycle | **Implemented and automated-tested** | Dissolves active session and re-queues user. Tested in `chat-lifecycle.test.ts` & `next-after-disconnect.test.ts`. |
| | Online Student Counter | **Implemented and automated-tested** | Broadcasts live connected socket count to clients. Tested in `online-counter.test.ts`. |
| **Chat & Calling** | Real-Time Text Chat | **Implemented and automated-tested** | In-memory Socket.IO event relay (`chat:message`). No permanent chat message table. Tested in `chat-messaging.test.ts`. |
| | WebRTC Audio & Video | **Implemented and manually-tested** | P2P media streaming via `RTCPeerConnection` with local camera/mic controls. Tested across local browser instances. |
| | Receive-Only Fallback | **Implemented and automated-tested** | Transceivers fall back to `recvonly` when local media capture is denied or unavailable. Tested in `webrtc.test.tsx`. |
| | Metered TURN Relay | **Implemented but partially verified** | `GET /api/webrtc/ice-servers` caching and fallback tested with unit tests (`webrtc-ice-servers.test.ts`). Real-world cellular-to-Wi-Fi relay depends on external carrier NAT routing and Metered relay quota. |
| **Moderation & Safety** | User Reporting | **Implemented and automated-tested** | `POST /api/reports` captures violation category, reason, and last 10 messages from server memory as evidence. Tested in `reporting-blocking.test.ts`. |
| | User Blocking | **Implemented and automated-tested** | `POST /api/blocks` records pair in `BlockedUser` table. Tested in `reporting-blocking.test.ts`. |
| | Admin Dashboard | **Implemented and automated-tested** | RBAC-guarded overview metrics and moderation actions (`WARN`, `SUSPEND`, `BAN`, `UNBAN`). Tested in `admin-moderation-retention.test.ts`. |
| | CLI Admin Provisioning | **Implemented and manually-tested** | `promote-admin.ts` CLI script with hidden terminal password input. Tested via manual CLI execution. |
| | Automated Retention Cleanup | **Implemented and automated-tested** | `retention.service.ts` script purges expired codes, dead sessions, and old resolved reports. Tested in `admin-moderation-retention.test.ts`. |
| | Self-Serve Account Deletion | **Implemented and automated-tested** | `DELETE /api/profile` revokes sessions, deletes credentials/profile, and anonymizes user record. Tested in `admin-moderation-retention.test.ts`. |
| **Future Enhancements** | Redis Distributed Queue | **Planned / not implemented** | In-memory queue currently runs on a single Node.js instance. Redis adapter needed for multi-server scaling. |
| | External SMTP Email Provider | **Planned / not implemented** | Integration with Resend/SES required for production email inbox delivery. |
| | Self-Hosted coturn Server | **Planned / not implemented** | Self-hosted Linux TURN relay to replace third-party Metered dependency. |
| | Dedicated Audio-Only Mode | **Planned / not implemented** | Low-bandwidth toggle for poor cellular connections. |

---

## 3. Technology Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite 5
- **Styling:** Tailwind CSS with custom high-contrast Neo-Brutalist design tokens
- **Real-Time Client:** Socket.IO Client 4.8
- **Testing:** Vitest & React Testing Library (79 passing unit & integration tests)

### Backend
- **Runtime:** Node.js 18+ LTS
- **Server:** Express 4 with TypeScript
- **WebSockets:** Socket.IO 4.8
- **Database ORM:** Prisma 5
- **Database Engine:** PostgreSQL 14+
- **Password Hashing:** Node.js native `crypto.scryptSync` (with 16-byte cryptographic salt and timing-safe comparison)
- **Validation:** Zod schemas
- **Testing:** Vitest & Supertest (206 passing unit, integration, and security tests)

### Real-Time Media & Networking
- **Signaling:** Socket.IO room-based offer, answer, and ICE candidate exchange
- **NAT Traversal:** Metered Open Relay REST API integration with fallback to `stun:stun.l.google.com:19302`

---

## 4. System Architecture

```
                          +-----------------------------------+
                          |      Browser / Client (React)     |
                          |  - AuthContext & OnlineContext    |
                          |  - useWebRTC (PeerConnection)     |
                          |  - Socket.IO Real-Time Client     |
                          +-----------------+-----------------+
                                            |
                       +--------------------+--------------------+
                       | HTTP / Cookies                          | WebSockets
                       v                                         v
+-------------------------------------------------------------------------------+
|                       Node.js & Express Application Layer                     |
|                                                                               |
|  REST Routes:                                 Real-Time Socket Gateway:       |
|  - /api/auth (OTP, set-password, login, me)   - In-memory Matching Queue      |
|  - /api/profile (Real Name vs Nickname)       - Room Lifecycle Management     |
|  - /api/webrtc/ice-servers (Metered Cache)    - WebRTC Signaling Relay        |
|  - /api/reports & /api/blocks                 - Ephemeral Chat Message Relay  |
|  - /api/admin/* (RBAC Guard)                                                  |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                         PostgreSQL Data Layer (Prisma)                        |
|  - Users & Scrypt Passwords                   - Reports & Moderation Logs     |
|  - Active Sessions (HttpOnly Cookie)          - Blocked Users Table           |
+-------------------------------------------------------------------------------+
```

---

## 5. Authentication & Identity Flow

### Step 1: Email Domain Rule Check
When a user submits an email to `/api/auth/request-code`, the server:
- Normalizes and validates the email address against strict ASCII syntax.
- Checks whether the domain part matches the configured `ALLOWED_EMAIL_DOMAINS` allowlist (default: `uiu.ac.bd,bscse.uiu.ac.bd`).
- *Note:* This is an internal registration rule to simulate campus grouping, not official university verification.

### Step 2: Verification Code (OTP)
- The server generates a cryptographically random 6-digit numeric OTP and stores an HMAC-SHA256 hash in PostgreSQL with a 10-minute expiration.
- **In Local Development / Testing:** The OTP is printed directly to the backend terminal (`[dev-email] Verification code for student@...: 123456`).
- **Production Status:** External SMTP/SES integration is not yet configured.

### Step 3: Password Creation & Login
- Once the code is verified, the user sets their password.
- Passwords are encrypted using **scrypt** with a random 16-byte salt:
  ```ts
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto.scryptSync(password, salt, 64)
  const storedHash = `${salt}:${derivedKey.toString('hex')}`
  ```
- Subsequent logins use `POST /api/auth/login` (accepting full email or student ID prefix).
- Authentication issues an HttpOnly, signed session cookie (`kothakoi_session`).

---

## 6. Privacy & Security Model

KothaKoi is designed with privacy principles in mind, but it is important to understand what is protected and what the technical boundaries are:

### What Is Protected
- **Real Name & Email Privacy:** Real names and email addresses are stored in the database for account ownership but are **never included** in Socket.IO matching payloads or chat interfaces.
- **Session Security:** Session cookies are `HttpOnly`, `SameSite=Lax` (or `None` with `Secure` in production), signed with `SESSION_SECRET`.
- **Password Protection:** Uses Node.js native `scrypt` hashing with unique cryptographic salts and timing-safe equality comparison (`crypto.timingSafeEqual`).
- **No Persistent Chat Log Table:** Chat messages exchanged in active sessions are not stored in a persistent database table.

### Technical Boundaries & Limitations
- **Not End-to-End Encrypted (E2EE) for Text:** Text messages travel through the backend Socket.IO server in memory. While transport uses TLS/HTTPS in production, the server process routes the message payloads.
- **Report Snippets:** If a user files a safety report, the server captures the last 10 messages from memory and stores them in the `Report` table to allow administrator review.
- **P2P IP Exposure:** In direct peer-to-peer WebRTC connections, peer browsers establish direct socket connections, which inherently exposes each user's public IP address to the other peer (the standard nature of P2P WebRTC). Routing through a TURN relay masks peer IPs behind the relay IP.
- **Third-Party Relay Metadata:** When media is relayed through Metered TURN servers, the media packets are SRTP-encrypted, but the third-party provider processes standard network transport headers.

---

## 7. Directory Structure

```
Kotha-Koi/
├── backend/                  # Express + Socket.IO TypeScript backend
│   ├── prisma/               # Prisma schema, migrations, and seed script
│   │   ├── migrations/       # PostgreSQL migrations
│   │   └── schema.prisma     # Prisma data models
│   ├── src/
│   │   ├── config/           # Environment variables (env.ts) and session config
│   │   ├── middleware/       # requireAuth, requireAdmin, cookie parser, logger
│   │   ├── realtime/         # Socket.IO connection handling & signaling
│   │   ├── routes/           # REST endpoints (/auth, /profile, /reports, /admin, etc.)
│   │   ├── scripts/          # CLI scripts (promote-admin.ts, retention-cleanup.ts)
│   │   ├── services/         # Matching engine, TURN service, session service, retention
│   │   ├── utils/            # scrypt password hashing, email normalization, rate limiting
│   │   └── __tests__/        # Vitest test suite (206 tests)
│   └── .env.example          # Backend environment template
│
├── frontend/                 # React 18 + Vite TypeScript frontend
│   ├── src/
│   │   ├── api/              # API client, Socket manager, ICE server fetcher
│   │   ├── components/       # ProfileDropdown, ReportModal, BlockModal, FloatingChat
│   │   ├── context/          # AuthContext, OnlineContext
│   │   ├── hooks/            # useWebRTC custom hook
│   │   ├── pages/            # Home, Chat, Profile, AdminDashboard, AdminLogin, etc.
│   │   └── __tests__/        # Vitest test suite (79 tests)
│   └── .env.example          # Frontend environment template
│
├── shared/                   # Shared TypeScript contracts and schemas
│   └── src/                  # Error codes, socket event definitions, Zod schemas
│
├── docs/                     # Detailed architectural and operational documentation
│   ├── ARCHITECTURE.md       # Complete system architecture and signaling diagrams
│   ├── DEVELOPMENT.md        # Local workflow, tests, migrations, and scripts
│   ├── DEPLOYMENT.md         # Deployment architecture and TURN cost considerations
│   └── ROADMAP.md            # Realistic future improvements
│
├── docker-compose.yml        # Local PostgreSQL container definition
├── .env.example              # Root environment template
└── README.md                 # This documentation
```

---

## 8. Prerequisites

- **Node.js:** `v18.x` or `v20.x` LTS ([Download Node.js](https://nodejs.org/))
- **npm:** `v9.x` or higher
- **PostgreSQL:** `v14+` running locally or via Docker
- **Operating System:** Windows 10/11, macOS, or Linux

---

## 9. Local Setup & Installation (Windows)

Open **PowerShell** or **Command Prompt**:

```powershell
# 1. Clone the repository
git clone https://github.com/imtiaz1425/kotha-koi.git
cd kotha-koi

# 2. Install root dependencies
npm install

# 3. Build shared contracts package
cd shared
npm install
npm run build
cd ..

# 4. Install backend dependencies
cd backend
npm install
cd ..

# 5. Install frontend dependencies
cd frontend
npm install
cd ..
```

---

## 10. Database Configuration (PostgreSQL & Prisma)

### Option A: Using Docker (Quickest)
```powershell
docker-compose up -d
```
Starts PostgreSQL on port `5432` with user `kothakoi` and password `kothakoi_dev_password`.

### Option B: Using Local PostgreSQL
Ensure PostgreSQL is running on port `5432` and create a database:
```sql
CREATE DATABASE kothakoi;
```

### Apply Migrations & Seed
Inside the `backend/` directory:
```powershell
cd backend
npx prisma migrate dev
npx prisma db seed
cd ..
```

---

## 11. Environment Variables

Create `backend/.env` from the provided example:
```powershell
copy backend\.env.example backend\.env
```

Configure the required variables:
```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:3000
TRUST_PROXY=false

# Secrets (Generate using: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
SESSION_SECRET=a_long_unpredictable_string_min_16_characters
OTP_HMAC_SECRET=another_long_secret_string_min_16_characters

DATABASE_URL=postgresql://kothakoi:kothakoi_dev_password@localhost:5432/kothakoi?schema=public

# Allowed email domain pattern (comma-separated)
ALLOWED_EMAIL_DOMAINS=uiu.ac.bd,bscse.uiu.ac.bd

# WebRTC Metered TURN Configuration (Optional in local dev, needed for cross-network video)
METERED_APP_NAME=your_metered_app_name
METERED_API_KEY=your_metered_api_token
```

---

## 12. Running the Application

### 1. Start the Backend Server
```powershell
cd backend
npm run dev
```
Starts the backend on `http://localhost:5000`. In development, registration verification codes are logged directly to this terminal.

### 2. Start the Frontend Server
In a new terminal:
```powershell
cd frontend
npm run dev
```
Starts the Vite dev server on `http://localhost:3000`. Requests to `/api` and `/socket.io` are automatically proxied to the backend.

### 3. Create an Administrator (Optional)
To access `/admin/dashboard`, promote an account via the CLI script:
```powershell
cd backend
npx ts-node src/scripts/promote-admin.ts your_email@bscse.uiu.ac.bd
```
Follow the interactive prompt to set a secure admin password.

---

## 13. WebRTC & Metered TURN Configuration

### Why TURN is Needed
In WebRTC, direct peer-to-peer media transmission works when both users have direct IP connectivity or Open/Full Cone NAT. When either device is behind a **Symmetric NAT** or **Carrier-Grade NAT (CGNAT)** (standard on 4G/5G mobile connections), direct connection fails.

A **TURN (Traversal Using Relays around NAT)** server relays media packets between the peers.

### Metered Open Relay Integration
KothaKoi integrates with [Metered.ca](https://www.metered.ca/):
1. Sign up for a free Metered account and create an app.
2. In `backend/.env`, set `METERED_APP_NAME` and `METERED_API_KEY`.
3. The backend caches credentials in memory for 10 minutes to minimize external API calls.
4. If Metered is unreachable or unconfigured, the application falls back to Google's public STUN server (`stun:stun.l.google.com:19302`).

> [!NOTE]
> **Bandwidth & Cost Consideration:** Free-tier TURN accounts provide limited monthly relay bandwidth (~50 GB). Running full-scale video streaming for many users requires a paid TURN service subscription or a self-hosted `coturn` server.

---

## 14. Testing Across Networks

To test video/audio chat between distinct devices (e.g. PC on Wi-Fi and smartphone on mobile data):

1. **HTTPS Requirement:** Mobile browsers (iOS Safari, Android Chrome) strictly block camera and microphone access on insecure HTTP origins (except `localhost`).
2. **Expose with a Secure Tunnel:** Expose your local frontend using Cloudflare Tunnel or ngrok:
   ```powershell
   cloudflared tunnel --url http://localhost:3000
   ```
3. **Connect Both Devices:**
   - Open `http://localhost:3000` on your PC.
   - Open the generated `https://...trycloudflare.com` tunnel URL on your smartphone.
4. **Register & Join Queue:** Register two accounts (OTP codes appear in backend terminal logs) and start matchmaking.

---

## 15. Current Limitations

1. **In-Memory Matching Queue:** Matchmaking runs in Node.js process memory (`matching.ts`). Multi-server horizontal scaling would require Redis Pub/Sub.
2. **Development Email Mock:** OTP codes are logged to the console; no external SMTP service is currently integrated.
3. **No End-to-End Encryption for Text:** Text messages are relayed through the server process memory, not encrypted with client-side public keys.
4. **TURN Relay Bandwidth Limits:** Dependent on third-party Metered free-tier quotas for relayed cross-network video sessions.
5. **Single Community Scope:** Email domain filtering defaults strictly to `uiu.ac.bd` and `bscse.uiu.ac.bd`.

---

## 16. Future Roadmap

- [ ] **Redis Matchmaking Engine:** Migrate in-memory FIFO queue to Redis Sorted Sets for distributed multi-instance clustering.
- [ ] **Transactional Email Provider:** Integrate Resend or AWS SES for real email OTP delivery.
- [ ] **Self-Hosted coturn Server:** Set up a dedicated Coturn instance with TLS on Linux to eliminate commercial TURN limits.
- [ ] **Audio-Only Mode:** Explicit toggle for low-bandwidth mobile connections.
- [ ] **Automated Client-Side Moderation:** Text profanity filtering and client-side abuse heuristics.

---

## 17. Documentation Links

- [System Architecture](docs/ARCHITECTURE.md)
- [Development & Testing Guide](docs/DEVELOPMENT.md)
- [Deployment & Operations](docs/DEPLOYMENT.md)
- [Project Roadmap](docs/ROADMAP.md)
- [API & Socket Contracts](docs/CONTRACTS.md)
- [Architecture Decisions Log](docs/DECISIONS.md)

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
