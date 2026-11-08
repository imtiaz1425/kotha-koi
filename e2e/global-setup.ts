import { ensureDummyUsers } from './setup-test-users'

async function checkService(url: string, serviceName: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    return res.ok || res.status === 200 || res.status === 304 || res.status === 404
  } catch {
    return false
  }
}

async function globalSetup() {
  console.log('\n[Pre-flight] Verifying test environment configuration...')

  const missing: string[] = []

  // 1. Check Backend
  const backendOk = await checkService('http://localhost:5000/api/health', 'Backend')
  if (!backendOk) {
    missing.push(
      'Backend server is not running on http://localhost:5000.\n   Fix: Run `npm run dev:backend` or ensure PORT 5000 is running.'
    )
  }

  // 2. Check Frontend
  const frontendOk = await checkService('http://localhost:3000', 'Frontend')
  if (!frontendOk) {
    missing.push(
      'Frontend dev server is not running on http://localhost:3000.\n   Fix: Run `npm run dev:frontend` or ensure PORT 3000 is running.'
    )
  }

  if (missing.length > 0) {
    const msg = `\n[CONFIGURATION ERROR] Test environment is not properly configured:\n\n${missing.join('\n\n')}\n`
    console.error(msg)
    throw new Error(msg)
  }

  console.log('[Pre-flight] Backend and Frontend servers are reachable.')

  // 3. Ensure database connectivity & dedicated test users
  try {
    await ensureDummyUsers()
    console.log('[Pre-flight] Database connected and dedicated test users (A, B, C, D) verified.\n')
  } catch (err: unknown) {
    const dbErr = `\n[CONFIGURATION ERROR] Database setup failed:\n${(err as Error).message}\n   Fix: Ensure PostgreSQL is running on port 5432 and DATABASE_URL is valid.\n`
    console.error(dbErr)
    throw new Error(dbErr)
  }
}

export default globalSetup
