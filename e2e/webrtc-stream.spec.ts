import { test, expect } from '@playwright/test'
import {
  createTestUserSession,
  connectPair,
  sendMessage,
  expectMessageDelivered,
  cleanupSessions,
  captureFailureArtifacts,
  type TestUserSession,
} from './helpers'

test.describe('WebRTC Video & Calling Real-Time Streams (Phase 2)', () => {
  test('1. Two matched peers establish real local and remote video streams', async ({
    browser,
  }, testInfo) => {
    const sessions: TestUserSession[] = []

    try {
      const userA = await createTestUserSession(browser, 'A')
      sessions.push(userA)
      const userB = await createTestUserSession(browser, 'B')
      sessions.push(userB)

      // Connect User A and User B
      await connectPair(userA, userB)

      // Verify #localVideo element exists and has active media stream on both peers
      for (const session of [userA, userB]) {
        const localVideo = session.page.locator('#localVideo')
        await expect(localVideo).toBeVisible({ timeout: 10000 })

        // Verify local video has a valid stream attached and tracks
        const hasLocalStream = await session.page.evaluate(() => {
          const video = document.getElementById(
            'localVideo'
          ) as HTMLVideoElement | null
          return Boolean(
            video &&
              video.srcObject &&
              (video.srcObject as MediaStream).getTracks().length > 0
          )
        })
        expect(hasLocalStream).toBe(true)
      }

      // Verify #remoteVideo element receives remote stream after WebRTC negotiation
      for (const session of [userA, userB]) {
        const remoteVideo = session.page.locator('#remoteVideo')

        // Wait for remote stream to be attached via peer connection
        await session.page.waitForFunction(
          () => {
            const video = document.getElementById(
              'remoteVideo'
            ) as HTMLVideoElement | null
            return Boolean(
              video &&
                video.srcObject &&
                (video.srcObject as MediaStream).getTracks().length > 0
            )
          },
          null,
          { timeout: 15000 }
        )

        await expect(remoteVideo).toBeVisible()
      }

      // Verify text chat remains fully operational while video is streaming
      const testMsg = `WebRTC stream test message [${Date.now()}]`
      await sendMessage(userA, testMsg)
      await expectMessageDelivered(userB, testMsg)
      await expectMessageDelivered(userA, testMsg)
    } catch (err) {
      await captureFailureArtifacts(testInfo.title, sessions)
      throw err
    } finally {
      await cleanupSessions(sessions)
    }
  })

  test('2. Disconnecting terminates media tracks and cleans up video elements safely', async ({
    browser,
  }, testInfo) => {
    const sessions: TestUserSession[] = []

    try {
      const userC = await createTestUserSession(browser, 'C')
      sessions.push(userC)
      const userD = await createTestUserSession(browser, 'D')
      sessions.push(userD)

      // Connect User C and User D
      await connectPair(userC, userD)

      // Confirm User C has active local stream
      await userC.page.waitForFunction(
        () => {
          const video = document.getElementById(
            'localVideo'
          ) as HTMLVideoElement | null
          return Boolean(video && video.srcObject)
        },
        null,
        { timeout: 10000 }
      )

      // User C ends the adda
      userC.page.once('dialog', (d) => d.accept().catch(() => {}))
      const endBtn = userC.page.locator('#endChatBtn')
      await expect(endBtn).toBeVisible({ timeout: 5000 })
      await endBtn.click()

      // Verify User C local tracks are stopped and video element srcObject is detached
      await userC.page.waitForFunction(
        () => {
          const video = document.getElementById(
            'localVideo'
          ) as HTMLVideoElement | null
          return !video || !video.srcObject
        },
        null,
        { timeout: 5000 }
      )

      const isDetached = await userC.page.evaluate(() => {
        const video = document.getElementById(
          'localVideo'
        ) as HTMLVideoElement | null
        return !video || video.srcObject === null
      })
      expect(isDetached).toBe(true)
    } catch (err) {
      await captureFailureArtifacts(testInfo.title, sessions)
      throw err
    } finally {
      await cleanupSessions(sessions)
    }
  })

  test('3. Camera toggle, microphone mute, and camera switching operate independently with real-time UI synchronization (Phase 3)', async ({
    browser,
  }, testInfo) => {
    const sessions: TestUserSession[] = []

    try {
      const userA = await createTestUserSession(browser, 'A')
      sessions.push(userA)
      const userB = await createTestUserSession(browser, 'B')
      sessions.push(userB)

      // Connect User A and User B
      await connectPair(userA, userB)

      // Wait for both users to obtain local streams
      for (const session of [userA, userB]) {
        await session.page.waitForFunction(() => {
          const video = document.getElementById('localVideo') as HTMLVideoElement | null
          return Boolean(video && video.srcObject && (video.srcObject as MediaStream).getTracks().length > 0)
        }, null, { timeout: 10000 })
      }

      // 1. Test Camera Toggle
      const userACamBtn = userA.page.locator('#btn-toggle-cam')
      await expect(userACamBtn).toBeVisible({ timeout: 5000 })
      await userACamBtn.click()

      // User A video track must be disabled
      const isVideoDisabled = await userA.page.evaluate(() => {
        const video = document.getElementById('localVideo') as HTMLVideoElement | null
        const stream = video?.srcObject as MediaStream | null
        const videoTrack = stream?.getVideoTracks()[0]
        return videoTrack ? videoTrack.enabled === false : false
      })
      expect(isVideoDisabled).toBe(true)

      // User A self camera disabled overlay should be visible
      const selfCamOverlay = userA.page.locator('#self-cam-disabled-overlay')
      await expect(selfCamOverlay).toBeVisible({ timeout: 5000 })

      // User B should receive media:state and display remote-cam-disabled-overlay
      const remoteCamOverlay = userB.page.locator('#remote-cam-disabled-overlay')
      await expect(remoteCamOverlay).toBeVisible({ timeout: 10000 })

      // Turn camera back on
      await userACamBtn.click()
      await expect(selfCamOverlay).toBeHidden({ timeout: 5000 })
      await expect(remoteCamOverlay).toBeHidden({ timeout: 10000 })

      // 2. Test Microphone Toggle
      const userAMicBtn = userA.page.locator('#btn-toggle-mic')
      await expect(userAMicBtn).toBeVisible({ timeout: 5000 })
      await userAMicBtn.click()

      // User A audio track must be disabled
      const isAudioDisabled = await userA.page.evaluate(() => {
        const video = document.getElementById('localVideo') as HTMLVideoElement | null
        const stream = video?.srcObject as MediaStream | null
        const audioTrack = stream?.getAudioTracks()[0]
        return audioTrack ? audioTrack.enabled === false : false
      })
      expect(isAudioDisabled).toBe(true)
      await expect(userAMicBtn).toContainText('Unmute')

      // Turn mic back on
      await userAMicBtn.click()
      await expect(userAMicBtn).toContainText('Mute')

      // 3. Test Camera Switch button exists and is clickable
      const switchCamBtn = userA.page.locator('#btn-switch-cam')
      await expect(switchCamBtn).toBeVisible({ timeout: 5000 })
      await switchCamBtn.click()

      // 4. Verify text messaging remains fully operational
      const phase3Msg = `Phase 3 controls validated [${Date.now()}]`
      await sendMessage(userA, phase3Msg)
      await expectMessageDelivered(userB, phase3Msg)
    } catch (err) {
      await captureFailureArtifacts(testInfo.title, sessions)
      throw err
    } finally {
      await cleanupSessions(sessions)
    }
  })
})
