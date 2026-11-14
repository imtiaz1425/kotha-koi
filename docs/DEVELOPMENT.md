# KothaKoi — Developer & Contributor Guide

## 1. Local Development Environment

### 1.1 Prerequisites
- **Node.js:** v18.x or v20.x LTS
- **npm:** v9.x or higher
- **PostgreSQL:** v14+ (Local service or Docker)
- **Windows Terminal / PowerShell / Bash**

---

## 2. Setting Up Workspaces

KothaKoi is structured as a multi-package repository with an Express backend, a Vite React frontend, and a shared TypeScript contracts package.

```powershell
# 1. Install root dependencies
npm install

# 2. Build shared contracts
cd shared
npm install
npm run build
cd ..

# 3. Setup backend
cd backend
npm install
copy .env.example .env
# Edit .env with your PostgreSQL credentials and secrets
npx prisma migrate dev
npx prisma db seed
cd ..

# 4. Setup frontend
cd frontend
npm install
copy .env.example .env
cd ..
```

---

## 3. Running Development Servers

Open two terminal sessions:

### Terminal 1: Backend Server
```powershell
cd backend
npm run dev
```
Runs on `http://localhost:5000` with hot reloading.

### Terminal 2: Frontend Server
```powershell
cd frontend
npm run dev
```
Runs on `http://localhost:3000`. Requests to `/api` and `/socket.io` proxy to port 5000.

---

## 4. Running Tests

### 4.1 Backend Test Suite (Vitest)
```powershell
cd backend
npm test
```
Runs all 206 backend unit, integration, authentication, WebRTC signaling, and rate limiting tests.

To run a specific test file:
```powershell
cd backend
npx vitest run src/__tests__/webrtc-ice-servers.test.ts
```

### 4.2 Frontend Test Suite (Vitest)
```powershell
cd frontend
npm test
```
Runs all 79 frontend unit, integration, component, and hook tests.

---

## 5. Database Management & Migrations

Prisma handles all schema definition and database migrations.

### Creating a New Migration
When modifying `backend/prisma/schema.prisma`:
```powershell
cd backend
npx prisma migrate dev --name describe_your_change
```

### Inspecting Database with Prisma Studio
```powershell
cd backend
npx prisma studio
```
Opens an interactive GUI at `http://localhost:5555` to view and query PostgreSQL tables.

---

## 6. Maintenance Scripts

### Promoting an Admin User
```powershell
cd backend
npx ts-node src/scripts/promote-admin.ts student@bscse.uiu.ac.bd
```
Securely sets the role to `ADMIN` and prompts for password input.

### Running Retention Cleanup
```powershell
cd backend
# Dry-run
npx ts-node src/scripts/retention-cleanup.ts --dry-run

# Execute purge
npx ts-node src/scripts/retention-cleanup.ts
```

---

## 7. Code Quality & Standards

- **TypeScript:** Strict type-checking enabled. Always run `tsc -b` in frontend and backend before committing.
- **Prettier:** Run `npm run format` across workspaces.
- **Git Hygiene:** Never stage `.env`, credentials, or temporary debug logs.

