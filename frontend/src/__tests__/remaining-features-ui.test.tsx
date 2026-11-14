import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ReportModal } from '../components/ReportModal'
import { BlockModal } from '../components/BlockModal'
import CommunityGuidelines from '../pages/CommunityGuidelines'
import TermsOfService from '../pages/TermsOfService'
import PrivacyPolicy from '../pages/PrivacyPolicy'
import SafetyTips from '../pages/SafetyTips'
import NotFound from '../pages/NotFound'
import AdminLogin from '../pages/AdminLogin'
import Home from '../pages/Home'
import { AuthProvider } from '../context'

describe('Remaining Features UI Integration Tests (Phases 4 - 9)', () => {
  describe('Phase 4: Report and Block Modals', () => {
    it('renders ReportModal with all categories when isOpen is true', () => {
      const html = renderToString(
        <ReportModal
          isOpen={true}
          onClose={() => {}}
          onSubmit={async () => {}}
        />
      )

      expect(html).toContain('Report Chat Partner')
      expect(html).toContain('Harassment or Bullying')
      expect(html).toContain('Nudity or Sexual Content')
      expect(html).toContain('Hate Speech')
      expect(html).toContain('Spam or Bot')
      expect(html).toContain('Underage or Impersonation')
      expect(html).toContain('Submit Report')
    })

    it('returns empty html when ReportModal isOpen is false', () => {
      const html = renderToString(
        <ReportModal
          isOpen={false}
          onClose={() => {}}
          onSubmit={async () => {}}
        />
      )
      expect(html).toBe('')
    })

    it('renders BlockModal warning and confirm button when isOpen is true', () => {
      const html = renderToString(
        <BlockModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={async () => {}}
        />
      )

      expect(html).toContain('Block Student')
      expect(html).toContain('permanently never be matched again')
      expect(html).toContain('Block &amp; Disconnect')
    })

    it('returns empty html when BlockModal isOpen is false', () => {
      const html = renderToString(
        <BlockModal
          isOpen={false}
          onClose={() => {}}
          onConfirm={async () => {}}
        />
      )
      expect(html).toBe('')
    })
  })

  describe('Phase 6: Guidelines, Terms, Privacy, Safety Pages', () => {
    it('renders CommunityGuidelines page with standards and disclaimers', () => {
      const html = renderToString(
        <MemoryRouter>
          <CommunityGuidelines />
        </MemoryRouter>
      )

      expect(html).toContain('KothaKoi Community Guidelines')
      expect(html).toContain('Mutual Campus Respect')
      expect(html).toContain('Unacceptable Behaviors')
      expect(html).toContain('Instant Safety Tools: Next, Block, and Report')
    })

    it('renders TermsOfService page with product draft notice', () => {
      const html = renderToString(
        <MemoryRouter>
          <TermsOfService />
        </MemoryRouter>
      )

      expect(html).toContain('Terms of Service')
      expect(html).toContain('Eligibility &amp; Authentication')
      expect(html).toContain('Disclaimers &amp; Limitation of Liability')
    })

    it('renders PrivacyPolicy page explaining zero chat history and WebRTC TURN processing', () => {
      const html = renderToString(
        <MemoryRouter>
          <PrivacyPolicy />
        </MemoryRouter>
      )

      expect(html).toContain('Privacy Policy')
      expect(html).toContain('Zero Chat History Storage')
      expect(html).toContain('Peer-to-Peer WebRTC Video')
      expect(html).toContain('Self-Service Account Deletion')
    })

    it('renders SafetyTips page with practical advice for students', () => {
      const html = renderToString(
        <MemoryRouter>
          <SafetyTips />
        </MemoryRouter>
      )

      expect(html).toContain('Student Safety Tips')
      expect(html).toContain('Protect Your Personal Identity')
      expect(html).toContain('Trust Your Instincts (Hit Next)')
      expect(html).toContain('Report Serious Misconduct')
    })
  })

  describe('Phase 7: Admin UI & Landing Navbar', () => {
    it('renders subtle Admin Login link in Home landing page navbar', () => {
      const html = renderToString(
        <MemoryRouter>
          <AuthProvider>
            <Home />
          </AuthProvider>
        </MemoryRouter>
      )

      expect(html).toContain('Admin Login')
      expect(html).toContain('href="/admin/login"')
      expect(html).toContain('href="/community-guidelines"')
      expect(html).toContain('href="/safety-tips"')
      expect(html).toContain('href="/terms"')
      expect(html).toContain('href="/privacy"')
    })

    it('renders AdminLogin portal with administrative credential form', () => {
      const html = renderToString(
        <MemoryRouter>
          <AuthProvider>
            <AdminLogin />
          </AuthProvider>
        </MemoryRouter>
      )

      expect(html).toContain('Moderator Portal')
      expect(html).toContain('Admin UIU Webmail or ID')
      expect(html).toContain('Sign In to Moderation')
    })
  })

  describe('Phase 9: 404 Catch-All Page', () => {
    it('renders NotFound page with campus theme and home link', () => {
      const html = renderToString(
        <MemoryRouter>
          <NotFound />
        </MemoryRouter>
      )

      expect(html).toContain('Error 404')
      expect(html).toContain('Lost in the Campus Courtyard?')
      expect(html).toContain('Return to Adda Lobby')
    })
  })
})

