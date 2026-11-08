import { test, expect } from '@playwright/test'
import {
  createTestUserSession,
  connectPair,
  sendMessage,
  expectMessageDelivered,
  expectNoMessage,
  waitForMatchProposal,
  acceptMatchProposal,
  declineMatchProposal,
  ensureUserInQueue,
  cleanupSessions,
  captureFailureArtifacts,
  TestUserSession,
} from './helpers'

test.describe('KothaKoi Automated Dummy User Testing System', () => {
  // Scenario 1
  test('Scenario 1: Two users connect, accept a match, and exchange messages', async ({
    browser,
  }, testInfo) => {
    const sessions: TestUserSession[] = []

    try {
      // 1. Launch independent browser contexts for User A and User B
      const userA = await createTestUserSession(browser, 'A')
      sessions.push(userA)

      const userB = await createTestUserSession(browser, 'B')
      sessions.push(userB)

      // 2. Both receive match proposal and accept
      await connectPair(userA, userB)

      // 3. Exchange messages between A and B
      const msgFromA = `Salam from User A [${Date.now()}]`
      await sendMessage(userA, msgFromA)
      await expectMessageDelivered(userB, msgFromA)
      await expectMessageDelivered(userA, msgFromA)

      const msgFromB = `Walaikum Assalam from User B [${Date.now()}]`
      await sendMessage(userB, msgFromB)
      await expectMessageDelivered(userA, msgFromB)
      await expectMessageDelivered(userB, msgFromB)
    } catch (err) {
      await captureFailureArtifacts(testInfo.title, sessions)
      throw err
    } finally {
      await cleanupSessions(sessions)
    }
  })

  // Scenario 2
  test('Scenario 2: A third user cannot steal an active chat', async ({
    browser,
  }, testInfo) => {
    const sessions: TestUserSession[] = []

    try {
      // 1. User A and User B connect, accept match, and are actively chatting
      const userA = await createTestUserSession(browser, 'A')
      sessions.push(userA)

      const userB = await createTestUserSession(browser, 'B')
      sessions.push(userB)

      await connectPair(userA, userB)

      // 2. User C joins matchmaking
      const userC = await createTestUserSession(browser, 'C')
      sessions.push(userC)

      // User C enters queue searching for an available peer
      await expect(userC.page.locator('#searchingStateView')).toBeVisible({
        timeout: 10000,
      })

      // 3. Verify User C does NOT steal or break A and B's active chat
      await userC.page.waitForTimeout(3000)

      // C must NOT have received a match confirmation modal
      await expect(userC.page.locator('#matchConfirmationModal')).toBeHidden()

      // Neither A nor B must have their chat interrupted or stolen
      await expect(userA.page.locator('#matchConfirmationModal')).toBeHidden()
      await expect(userB.page.locator('#matchConfirmationModal')).toBeHidden()

      // 4. Verify A and B can still send messages normally
      const activeMsg = `Active chat uninterrupted [${Date.now()}]`
      await sendMessage(userA, activeMsg)
      await expectMessageDelivered(userB, activeMsg)

      // User C must NOT receive User A's message
      await expectNoMessage(userC, activeMsg)
    } catch (err) {
      await captureFailureArtifacts(testInfo.title, sessions)
      throw err
    } finally {
      await cleanupSessions(sessions)
    }
  })

  // Scenario 3
  test('Scenario 3: Two separate chat pairs can communicate without receiving each other\'s messages', async ({
    browser,
  }, testInfo) => {
    const sessions: TestUserSession[] = []

    try {
      // 1. Connect Pair 1: User A & User B
      const userA = await createTestUserSession(browser, 'A')
      sessions.push(userA)
      const userB = await createTestUserSession(browser, 'B')
      sessions.push(userB)
      await connectPair(userA, userB)

      // 2. Connect Pair 2: User C & User D
      const userC = await createTestUserSession(browser, 'C')
      sessions.push(userC)
      const userD = await createTestUserSession(browser, 'D')
      sessions.push(userD)
      await connectPair(userC, userD)

      // 3. Pair 1 sends message
      const msgPair1 = `PAIR_1_EXCLUSIVE_MSG_${Date.now()}`
      await sendMessage(userA, msgPair1)
      await expectMessageDelivered(userB, msgPair1)

      // Verify Pair 2 does NOT receive Pair 1's message
      await expectNoMessage(userC, msgPair1)
      await expectNoMessage(userD, msgPair1)

      // 4. Pair 2 sends message
      const msgPair2 = `PAIR_2_EXCLUSIVE_MSG_${Date.now()}`
      await sendMessage(userC, msgPair2)
      await expectMessageDelivered(userD, msgPair2)

      // Verify Pair 1 does NOT receive Pair 2's message
      await expectNoMessage(userA, msgPair2)
      await expectNoMessage(userB, msgPair2)
    } catch (err) {
      await captureFailureArtifacts(testInfo.title, sessions)
      throw err
    } finally {
      await cleanupSessions(sessions)
    }
  })

  // Scenario 4
  test('Scenario 4: Declining a match works correctly', async ({
    browser,
  }, testInfo) => {
    const sessions: TestUserSession[] = []

    try {
      const userA = await createTestUserSession(browser, 'A')
      sessions.push(userA)
      const userB = await createTestUserSession(browser, 'B')
      sessions.push(userB)

      await Promise.all([
        ensureUserInQueue(userA),
        ensureUserInQueue(userB),
      ])

      // Wait for match proposal modal on both users
      await Promise.all([
        waitForMatchProposal(userA),
        waitForMatchProposal(userB),
      ])

      // User A declines the proposal
      await declineMatchProposal(userA)

      // Proposal modal is dismissed on both sides
      await expect(userA.page.locator('#matchConfirmationModal')).toBeHidden({
        timeout: 10000,
      })
      await expect(userB.page.locator('#matchConfirmationModal')).toBeHidden({
        timeout: 10000,
      })

      // Both users return to searching state
      await expect(userA.page.locator('#searchingStateView')).toBeVisible({
        timeout: 10000,
      })
      await expect(userB.page.locator('#searchingStateView')).toBeVisible({
        timeout: 10000,
      })

      // Verify neither user was placed into an active chat with the other
      await expect(userA.page.locator('#chatStream')).not.toContainText(
        'Connected with Dummy B'
      )
      await expect(userB.page.locator('#chatStream')).not.toContainText(
        'Connected with Dummy A'
      )
    } catch (err) {
      await captureFailureArtifacts(testInfo.title, sessions)
      throw err
    } finally {
      await cleanupSessions(sessions)
    }
  })

  // Scenario 5
  test('Scenario 5: Next works after disconnect and respects the 10-second cooldown', async ({
    browser,
  }, testInfo) => {
    const sessions: TestUserSession[] = []

    try {
      // 1. User C and User D connect and start chatting
      const userC = await createTestUserSession(browser, 'C')
      sessions.push(userC)
      const userD = await createTestUserSession(browser, 'D')
      sessions.push(userD)

      await connectPair(userC, userD)

      // 2. User D disconnects by ending the adda
      userD.page.once('dialog', (d) => d.accept().catch(() => {}))
      await userD.page.locator('#endChatBtn').click()

      // Close User D context completely so User D is fully disconnected and does not re-enter queue
      await userD.context.close()

      // 3. User C receives partner left / ended notification with a 10-second cooldown
      const nextBtnPanel = userC.page.locator('#btn-find-next-panel, #nextBtn').first()
      await expect(nextBtnPanel).toBeVisible({ timeout: 10000 })

      // Assert button is disabled while cooldown is active (> 0)
      await expect(nextBtnPanel).toBeDisabled()

      // 4. Wait for the 10-second cooldown to expire and button to become enabled
      await expect(nextBtnPanel).toBeEnabled({ timeout: 15000 })

      // 5. User A enters queue
      const userA = await createTestUserSession(browser, 'A')
      sessions.push(userA)
      await ensureUserInQueue(userA)

      // User C now clicks Next after cooldown expired
      await nextBtnPanel.click()

      // 6. User C and User A receive match proposal and connect
      await Promise.all([
        waitForMatchProposal(userC, 15000),
        waitForMatchProposal(userA, 15000),
      ])

      await Promise.all([
        acceptMatchProposal(userC),
        acceptMatchProposal(userA),
      ])

      // 7. Verify User C and User A can now chat
      const msgAfterCooldown = `Hello User A from User C [${Date.now()}]`
      await sendMessage(userC, msgAfterCooldown)
      await expectMessageDelivered(userA, msgAfterCooldown)
    } catch (err) {
      await captureFailureArtifacts(testInfo.title, sessions)
      throw err
    } finally {
      await cleanupSessions(sessions)
    }
  })

  // Scenario 6
  test('Scenario 6: Refreshing or disconnecting a browser does not corrupt another user\'s chat', async ({
    browser,
  }, testInfo) => {
    const sessions: TestUserSession[] = []

    try {
      // 1. User B and User D connect and start chatting
      const userB = await createTestUserSession(browser, 'B')
      sessions.push(userB)
      const userD = await createTestUserSession(browser, 'D')
      sessions.push(userD)

      await connectPair(userB, userD)

      // 2. User A is waiting in queue independently
      const userA = await createTestUserSession(browser, 'A')
      sessions.push(userA)
      await ensureUserInQueue(userA)

      // User B sends message before reload
      const preMsg = `Message before reload [${Date.now()}]`
      await sendMessage(userB, preMsg)
      await expectMessageDelivered(userD, preMsg)

      // 3. User B refreshes the browser page
      await userB.page.reload()
      await userB.page.waitForURL('**/chat')

      // 4. Assert User D's chat stream is intact and uncorrupted
      await expectMessageDelivered(userD, preMsg)

      // User D is still in chat with User B (partner name does not show User A)
      const strangerOverlay = userD.page.locator('#chatStream')
      await expect(strangerOverlay).not.toContainText('Dummy A')

      // User A is still in queue, not accidentally merged into User D's chat
      await expect(userA.page.locator('#searchingStateView')).toBeVisible()
      await expectNoMessage(userA, preMsg)
    } catch (err) {
      await captureFailureArtifacts(testInfo.title, sessions)
      throw err
    } finally {
      await cleanupSessions(sessions)
    }
  })
})
