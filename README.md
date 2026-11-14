# KothaKoi (কথাকই) — United International University Anonymous Student Chat Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-blue.svg)](https://www.postgresql.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/DEVELOPMENT.md)

> **KothaKoi** is a real-time, pseudonymous 1-on-1 text, audio, and video matchmaking application exclusively designed for students of **United International University (UIU)** in Dhaka, Bangladesh.

---

## Table of Contents

- [1. Project Introduction](#1-project-introduction)
- [2. Problem Statement & Objectives](#2-problem-statement--objectives)
- [3. Key Features](#3-key-features)
- [4. Technology Stack](#4-technology-stack)
- [5. System Architecture](#5-system-architecture)
- [6. Directory Structure](#6-directory-structure)
- [7. Prerequisites](#7-prerequisites)
- [8. Windows Installation Guide](#8-windows-installation-guide)
- [9. PostgreSQL & Prisma Database Setup](#9-postgresql--prisma-database-setup)
- [10. Environment Variable Configuration](#10-environment-variable-configuration)
- [11. Running the Backend](#11-running-the-backend)
- [12. Running the Frontend](#12-running-the-frontend)
- [13. Metered TURN Relay Configuration](#13-metered-turn-relay-configuration)
- [14. Testing Across Different Networks](#14-testing-across-different-networks)
- [15. Current Project Limitations](#15-current-project-limitations)
- [16. Future Development Roadmap](#16-future-development-roadmap)
- [17. Documentation Links](#17-documentation-links)

---

## 1. Project Introduction

In modern university campuses, students often find it challenging to connect outside their immediate batches, departments, and project teams. Social barriers, academic anxiety, and privacy concerns frequently inhibit genuine, spontaneous peer conversations.

**KothaKoi** (*"কথাকই"* — Bengali for *"Let's talk"* or *"Where are you talking?"*) creates a safe, university-bounded digital lounge. It verifies that every user is a verified UIU student while granting them complete pseudonymity during peer conversations.

---

## 2. Problem Statement & Objectives

### The Problem
- **Open platforms (Omegle, Chatroulette, etc.)** suffer from rampant harassment, malicious bots, and unverified participants.
- **Campus groups (Facebook groups, WhatsApp)** expose personal phone numbers and social media identities, preventing honest, casual conversations.
- **Cross-departmental isolation:** CSE, BBA, EEE, and other department students rarely interact outside formal student clubs.

### The Objectives
1. **Verified Student Boundary:** Restrict access strictly to holders of official `@*.uiu.ac.bd` email addresses.
2. **True Pseudonymity:** Keep real names and student emails strictly private on the backend. Only customizable or shuffled nicknames are shown to chat partners.
3. **Low-Latency Real-Time Communication:** Instant matching with WebSocket text chat and peer-to-peer WebRTC video/audio streaming.
4. **Robust Moderation & Student Safety:** Built-in reporting, mutual blocking, admin moderation (warn, suspend, ban), and automated data retention policies.

---

## 3. Key Features

- **UIU Student Authentication:**
  - One-time verification via official UIU email (`@uiu.ac.bd`, `@bscse.uiu.ac.bd`, etc.).
  - Password-based persistent login with secure `argon2` / `scrypt` hashing and HttpOnly session cookies.
- **Identity Separation:**
  - Real Name collected during registration is immutable and strictly confidential.
  - Display Name / Nickname is fully customizable or can be randomized with a single click (🎲 Shuffle Name).
  - Chat partners never see each other's email, student ID, or real name.
- **Real-Time Matchmaking:**
  - FIFO random queue with bidirectional exclusion (preventing blocked users from ever pairing).
  - Single-session enforcement (cancels previous matchmaking if user opens another tab).
  - Next / Skip functionality with immediate re-queueing.
  - Active online student counter broadcasted in real time.
- **WebRTC Audio & Video Calling:**
  - Direct P2P video and audio streaming via standard RTCPeerConnection.
  - Server-mediated dynamic TURN relay credential provisioning via Metered Open Relay.
  - Automatic fallback to Google STUN if TURN is unreachable.
  - Receive-only mode fallback when camera capture is unavailable.
- **Safety, Blocking & Reporting:**
  - Partner reporting with categories (`harassment`, `inappropriate_content`, `underage`, `spam`, `other`).
  - Mutual blocking with server-side partner identity resolution.
  - Admin moderation panel to inspect reports, review evidence, and execute warnings, temporary suspensions, or permanent bans.
  - Automated data retention task purging expired verification codes, old sessions, and resolved reports.
- **Design & UI/UX:**
  - High-contrast Neo-Brutalist design language tailored for students.
  - Floating draggable/resizable chat window option during video calls.
  - Fully responsive across desktop, tablet, and mobile displays.

---

## 4. Technology Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Bundler & Dev Server:** Vite 5
- **Styling:** Tailwind CSS with custom Neo-Brutalist design tokens
- **Icons:** Google Material Symbols Outlined
- **Real-Time:** Socket.IO Client 4.8
- **Testing:** Vitest & React Testing Library (79 unit and integration tests)

### Backend
- **Runtime:** Node.js 18+ (LTS recommended)
- **Framework:** Express 4 with TypeScript
- **WebSockets:** Socket.IO 4.8
- **Database ORM:** Prisma 5
- **Database:** PostgreSQL 14+
- **Validation:** Zod schemas
- **Testing:** Vitest & Supertest (206 unit, integration, and security tests)

### Networking & WebRTC
- **Signaling:** Socket.IO room-based offer/answer/candidate exchange
- **STUN/TURN:** Metered Open Relay (`metered.live`) REST API credentials caching with fallback to `stun:stun.l.google.com:19302`

---

## 5. System Architecture

```
                      +-----------------------------+
                      |   UIU Student Browser/Phone |
                      +--------------+--------------+
                                     |
               +---------------------+---------------------+
               | HTTPS / WebSocket                         | WebRTC Media
               v                                           v
+-------------------------------+              +-----------------------+
| Express & Socket.IO Backend   |              | WebRTC Direct P2P     |
| - Authentication & Sessions   |              | (or Metered TURN Relay|
| - FIFO Matchmaking Queue      |              | if symmetric NAT)     |
| - Moderation & Admin Guard    |              +-----------------------+
| - Metered ICE Server Cache    |
+---------------+---------------+
                |
                v
+-------------------------------+
| PostgreSQL Database (Prisma)  |
| - Users & Passwords           |
| - Sessions & BlockedUsers     |
| - Reports & Audit Logs        |
+-------------------------------+
```

For comprehensive details on state machines, signaling sequences, and data models, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 6. Directory Structure

```
Kotha-Koi/
├── backend/                  # Express + Socket.IO TypeScript backend
│   ├── prisma/               # Prisma schema, migrations, seed script
│   │   ├── migrations/       # Database schema migrations
│   │   └── schema.prisma     # Prisma data models
│   ├── src/
│   │   ├── config/           # Environment and session configuration
│   │   ├── middleware/       # requireAuth, requireAdmin, cookie parser, logger
│   │   ├── realtime/         # Socket.IO connection and event handlers
│   │   ├── routes/           # REST endpoints (/auth, /profile, /reports, /admin, etc.)
│   │   ├── scripts/          # CLI maintenance scripts (promote-admin, retention)
│   │   ├── services/         # Business logic (matching, turn, session, retention)
│   │   └── __tests__/        # Backend Vitest test suite (206 tests)
│   └── .env.example          # Backend environment template
│
├── frontend/                 # React 18 + Vite TypeScript frontend
│   ├── src/
│   │   ├── api/              # HTTP client, socket manager, ICE server fetcher
│   │   ├── components/       # ProfileDropdown, ReportModal, BlockModal, FloatingChat
│   │   ├── context/          # AuthContext, OnlineContext
│   │   ├── hooks/            # useWebRTC custom hook
│   │   ├── pages/            # Home, Chat, Profile, AdminDashboard, AdminLogin, etc.
│   │   └── __tests__/        # Frontend Vitest test suite (79 tests)
│   └── .env.example          # Frontend environment template
│
├── shared/                   # Shared TypeScript contracts, enums & schemas
│   └── src/                  # Error codes, socket events, auth schemas
│
├── docs/                     # Detailed project documentation
│   ├── ARCHITECTURE.md       # Full architecture & WebRTC topology
│   ├── DEVELOPMENT.md        # Local development & contributor workflows
│   ├── DEPLOYMENT.md         # Deployment & reverse proxy guidelines
│   └── ROADMAP.md            # Deferred features & future plans
│
├── docker-compose.yml        # Local PostgreSQL container definition
├── .env.example              # Root environment template
└── README.md                 # This file
```

---

## 7. Prerequisites

Before installing, ensure you have the following installed on your machine:
- **Operating System:** Windows 10/11, macOS, or Linux.
- **Node.js:** `v18.x` or `v20.x` LTS ([Download Node.js](https://nodejs.org/)).
- **npm:** `v9.x` or higher (bundled with Node.js).
- **PostgreSQL:** `v14+` running locally or via Docker.
- **Git:** Installed and configured.

---

## 8. Windows Installation Guide

Follow these steps in **PowerShell** or **Command Prompt**:

### Step 1: Clone the Repository
```powershell
git clone https://github.com/imtiaz1425/kotha-koi.git
cd kotha-koi
```

### Step 2: Install Dependencies
Install dependencies for root, backend, frontend, and shared workspaces:
```powershell
# Root dependencies
npm install

# Shared library
cd shared
npm install
npm run build
cd ..

# Backend dependencies
cd backend
npm install
cd ..

# Frontend dependencies
cd frontend
npm install
cd ..
```

---

## 9. PostgreSQL & Prisma Database Setup

### Option A: Using Docker (Recommended for quick setup)
Run the provided PostgreSQL container:
```powershell
docker-compose up -d
```
This starts PostgreSQL on port `5432` with user `kothakoi` and password `kothakoi_dev_password`.

### Option B: Using Local PostgreSQL on Windows
Ensure your PostgreSQL service is running and create a database named `kothakoi`:
```sql
CREATE DATABASE kothakoi;
```

### Run Migrations & Seed
Inside the `backend/` directory:
```powershell
cd backend
npx prisma migrate dev
npx prisma db seed
cd ..
```

---

## 10. Environment Variable Configuration

Create `backend/.env` by copying `backend/.env.example`:
```powershell
copy backend\.env.example backend\.env
```

Edit `backend/.env` and update the required values:

```env
# Server
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:3000
TRUST_PROXY=false

# Secrets (Generate using: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
SESSION_SECRET=a_long_random_unpredictable_secret_min_16_characters
OTP_HMAC_SECRET=another_long_random_secret_min_16_characters

# Database
DATABASE_URL=postgresql://kothakoi:kothakoi_dev_password@localhost:5432/kothakoi?schema=public

# Allowed UIU Domains
ALLOWED_EMAIL_DOMAINS=uiu.ac.bd,bscse.uiu.ac.bd

# WebRTC Metered TURN Configuration
METERED_APP_NAME=your_metered_app_name
METERED_API_KEY=your_metered_api_token
```

> [!IMPORTANT]
> Never commit `backend/.env` or any file containing real credentials to Git. Both `.env` and `.env.local` are explicitly ignored by `.gitignore`.

---

## 11. Running the Backend

Start the backend in development mode (with hot reloading via `tsx` / `nodemon`):
```powershell
cd backend
npm run dev
```
The backend starts on `http://localhost:5000`. You can verify health via:
`http://localhost:5000/api/health`

### Creating an Administrator Account
To access the `/admin/dashboard`, promote an existing UIU email to the admin role:
```powershell
cd backend
npx ts-node src/scripts/promote-admin.ts student@bscse.uiu.ac.bd
```
The script will securely prompt for a password with hidden input and store it in `UserPassword`.

---

## 12. Running the Frontend

Open a new terminal window:
```powershell
cd frontend
npm run dev
```
The frontend dev server launches on `http://localhost:3000`.
Requests to `/api` and `/socket.io` are automatically proxied to `http://localhost:5000`.

Open your browser and navigate to:
**`http://localhost:3000`**

---

## 13. Metered TURN Relay Configuration

WebRTC connections between two users on the same Wi-Fi or with open NAT can connect directly using **STUN**. However, when one user is on mobile cellular data (symmetric CGNAT) and another is on campus or home Wi-Fi, direct connections fail. A **TURN Relay** is essential.

KothaKoi uses **Metered Open Relay** (`metered.ca`):

1. Sign up for a free account at [metered.ca](https://www.metered.ca/).
2. Create an App (e.g., `kothakoi`).
3. Under the **API Keys** section, copy your bare API token (a 36-character UUID string).
4. In `backend/.env`:
   - Set `METERED_APP_NAME` to your app subdomain (e.g. `kothakoi`).
   - Set `METERED_API_KEY` to your bare API token.
5. Restart the backend.
6. The backend exposes `GET /api/webrtc/ice-servers` (rate-limited, authenticated), providing dynamic short-lived TURN UDP, TURN TCP, and TURNS TLS credentials with a 10-minute server-side memory cache.

---

## 14. Testing Across Different Networks

To test video/audio chat between distinct devices (e.g. PC on Wi-Fi and smartphone on 4G/5G):

1. **HTTPS Requirement:** Modern mobile browsers (iOS Safari, Android Chrome) block camera and microphone access on non-secure HTTP origins (except `localhost`).
2. **Use a Secure Tunnel:**
   Run Cloudflare Tunnel (or ngrok) to expose your local frontend:
   ```powershell
   cloudflared tunnel --url http://localhost:3000
   ```
3. **Open on Devices:**
   - **Device A (PC):** Open `http://localhost:3000` or the tunnel HTTPS URL.
   - **Device B (Phone):** Open the tunnel HTTPS URL on mobile data.
4. **Log In:** Log into distinct student accounts on both devices.
5. **Join Queue:** Click **"Start Chat"** on both devices.
6. **Verify:**
   - Both devices will match.
   - Text messages arrive in real-time.
   - Audio/video streams will establish via Metered TURN relay.

---

## 15. Current Project Limitations

1. **Free TURN Relay Bandwidth:** Free-tier TURN accounts provide limited monthly relay bandwidth (~50 GB). Production deployment requires a paid TURN relay budget or self-hosted coturn instance.
2. **In-Memory Matching Queue:** The matchmaking queue currently runs in-memory on a single Node.js instance. Horizontal scaling across multiple backend instances requires Redis adapter integration.
3. **Email Delivery in Development:** In local development, verification OTP codes are logged directly to the backend console (`[dev-email] Verification code for ...: 123456`) rather than sent via SMTP.

---

## 16. Future Development Roadmap

- [ ] **Redis-Backed Distributed Queue:** Migrate FIFO matchmaking state to Redis for multi-instance scaling.
- [ ] **Production Email Gateway:** Integrate Amazon SES or SendGrid for verified student email delivery.
- [ ] **Self-Hosted coturn Server:** Set up dedicated Coturn server instances on cloud infrastructure to eliminate third-party TURN costs.
- [ ] **Audio-Only Mode:** Dedicated toggle for low-bandwidth mobile connections.
- [ ] **Automated AI Content Filtering:** Text chat toxicity screening using client-side or server-side moderation models.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full roadmap.

---

## 17. Documentation Links

- [System Architecture](docs/ARCHITECTURE.md)
- [Developer Workflow & Testing](docs/DEVELOPMENT.md)
- [Deployment Guidelines](docs/DEPLOYMENT.md)
- [Roadmap & Postponed Features](docs/ROADMAP.md)
- [API & Socket Contracts](docs/CONTRACTS.md)
- [Architecture Decisions Log](docs/DECISIONS.md)

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
