import { Browser, BrowserContext, Page, expect } from '@playwright/test'
import { DUMMY_USERS } from './setup-test-users'
import fs from 'node:fs'
import path from 'node:path'

export interface TestUserSession {
  key: 'A' | 'B' | 'C' | 'D'
  context: BrowserContext
  page: Page
  consoleErrors: string[]
  userDef: (typeof DUMMY_USERS)[keyof typeof DUMMY_USERS]
}

export async function createTestUserSession(
  browser: Browser,
  userKey: 'A' | 'B' | 'C' | 'D'
): Promise<TestUserSession> {
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
  })
  const page = await context.newPage()

  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[Console Error - User ${userKey}] ${msg.text()}`)
    }
  })
  page.on('pageerror', (err) => {
    consoleErrors.push(`[Page Error - User ${userKey}] ${err.message}`)
  })

  const userDef = DUMMY_USERS[userKey]

  // Login via UI
  await page.goto('/login')
  await expect(page.locator('#identifier')).toBeVisible({ timeout: 10000 })
  await page.locator('#identifier').fill(userDef.email)
  await page.locator('#password').fill(userDef.password)
  await page.locator('#login-btn').click()

  // Wait for redirect to /chat
  await page.waitForURL('**/chat', { timeout: 10000 })
  await expect(page).toHaveURL(/.*\/chat/)

  return {
    key: userKey,
    context,
    page,
    consoleErrors,
    userDef,
  }
}

/**
 * Waits for match confirmation modal to appear on the page.
 */
export async function waitForMatchProposal(
  session: TestUserSession,
  timeout = 15000
) {
  const modal = session.page.locator('#matchConfirmationModal')
  await expect(modal).toBeVisible({ timeout })
  return modal
}

/**
 * Accepts the pending match proposal on the page.
 */
export async function acceptMatchProposal(
  session: TestUserSession,
  timeout = 10000
) {
  const acceptBtn = session.page.locator('#acceptMatchBtn')
  await expect(acceptBtn).toBeVisible({ timeout })
  await acceptBtn.click()
}

/**
 * Declines the pending match proposal on the page.
 */
export async function declineMatchProposal(
  session: TestUserSession,
  timeout = 10000
) {
  const declineBtn = session.page.locator('#declineMatchBtn')
  await expect(declineBtn).toBeVisible({ timeout })
  await declineBtn.click()
}

/**
 * Ensures a user is actively in queue, settling initial socket state and waiting for cooldown if necessary.
 */
export async function ensureUserInQueue(session: TestUserSession) {
  const page = session.page

  // 1. Wait for initial connection state to settle: searching, proposed match, or ended state
  await expect(
    page.locator('#searchingStateView, #matchConfirmationModal, #endedStateView')
  ).toBeVisible({ timeout: 10000 })

  // 2. If in ended state (cooldown or ended adda), wait for Next button to be enabled and click it
  if (await page.locator('#endedStateView').isVisible()) {
    const nextBtn = page.locator('#btn-find-next-panel, #nextBtn').first()
    await expect(nextBtn).toBeVisible({ timeout: 5000 })
    await expect(nextBtn).toBeEnabled({ timeout: 15000 })
    await nextBtn.click()
  }

  // 3. Confirm the user transitioned to searching state or match proposal
  await expect(
    page.locator('#searchingStateView, #matchConfirmationModal')
  ).toBeVisible({ timeout: 10000 })
}

/**
 * Connects two users by waiting for both to receive a match proposal and accepting it.
 */
export async function connectPair(
  session1: TestUserSession,
  session2: TestUserSession,
  timeout = 30000
) {
  // Ensure both users are actively in the queue
  await Promise.all([
    ensureUserInQueue(session1),
    ensureUserInQueue(session2),
  ])

  // Wait for proposals to appear on both
  await Promise.all([
    waitForMatchProposal(session1, timeout),
    waitForMatchProposal(session2, timeout),
  ])

  // Accept on both
  await Promise.all([
    acceptMatchProposal(session1, timeout),
    acceptMatchProposal(session2, timeout),
  ])

  // Wait for proposal modal to dismiss on both
  await Promise.all([
    expect(session1.page.locator('#matchConfirmationModal')).toBeHidden({
      timeout,
    }),
    expect(session2.page.locator('#matchConfirmationModal')).toBeHidden({
      timeout,
    }),
  ])

  // Ensure message input is ready on both
  await Promise.all([
    expect(session1.page.locator('#messageInput')).toBeVisible({ timeout }),
    expect(session2.page.locator('#messageInput')).toBeVisible({ timeout }),
  ])
}

/**
 * Sends a message from a user.
 */
export async function sendMessage(
  session: TestUserSession,
  text: string,
  timeout = 5000
) {
  const input = session.page.locator('#messageInput')
  await expect(input).toBeVisible({ timeout })
  await input.fill(text)
  await session.page.locator('#sendBtn').click()
}

/**
 * Asserts that a user's chatStream contains the given message text.
 */
export async function expectMessageDelivered(
  session: TestUserSession,
  text: string,
  timeout = 10000
) {
  const chatStream = session.page.locator('#chatStream')
  await expect(chatStream).toContainText(text, { timeout })
}

/**
 * Asserts that a user's chatStream does NOT contain the given message text.
 */
export async function expectNoMessage(
  session: TestUserSession,
  text: string
) {
  const chatStream = session.page.locator('#chatStream')
  await expect(chatStream).not.toContainText(text)
}

/**
 * Helper to capture failure screenshots and dump console errors for a list of sessions.
 */
export async function captureFailureArtifacts(
  testTitle: string,
  sessions: TestUserSession[]
) {
  const outputDir = path.resolve(process.cwd(), 'test-results', 'failures')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const safeTitle = testTitle.replace(/[^a-zA-Z0-9_-]/g, '_')

  for (const s of sessions) {
    try {
      if (!s.page.isClosed()) {
        const screenshotPath = path.join(
          outputDir,
          `${safeTitle}_User_${s.key}_failure.png`
        )
        await s.page.screenshot({ path: screenshotPath, fullPage: true })
        console.log(`[Failure Artifact] Screenshot saved: ${screenshotPath}`)
      }
    } catch (e) {
      // Ignore screenshot errors during teardown
    }

    if (s.consoleErrors.length > 0) {
      const logPath = path.join(
        outputDir,
        `${safeTitle}_User_${s.key}_console_errors.log`
      )
      fs.writeFileSync(logPath, s.consoleErrors.join('\n'), 'utf8')
      console.log(`[Failure Artifact] Console errors saved: ${logPath}`)
    }
  }
}

/**
 * Safely cleans up all active user sessions by ending active chats/queues and closing contexts.
 */
export async function cleanupSessions(sessions: TestUserSession[]) {
  for (const s of sessions) {
    try {
      if (!s.context) continue
      if (!s.page.isClosed()) {
        s.page.once('dialog', (d) => d.accept().catch(() => {}))
        const endBtn = s.page.locator('#endChatBtn')
        if (await endBtn.isVisible().catch(() => false)) {
          await endBtn.click({ timeout: 1000 }).catch(() => {})
        }
      }
      await s.context.close()
    } catch {
      // Ignore close errors
    }
  }
}
