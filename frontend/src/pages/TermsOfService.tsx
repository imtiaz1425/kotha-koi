import { Link } from 'react-router-dom'

export default function TermsOfService() {
  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FFF5E6] border-b-2 border-on-surface shadow-[0_2px_0px_#1c1b1b] shrink-0">
        <div className="h-14 sm:h-16 max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1 select-none">
            <span className="font-headline-md text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              KothaKoi
            </span>
            <span className="font-headline-md text-xl sm:text-2xl font-bold text-primary">.</span>
            <span className="hidden sm:inline-block font-label-sm text-[11px] px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container border border-on-surface ml-1">
              কথা কই
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="px-3 py-1 bg-surface-container text-on-surface font-label-sm text-xs font-bold rounded-lg border border-on-surface hover:bg-secondary-container transition-all"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="p-6 sm:p-8 bg-surface-container-lowest rounded-2xl border-2 border-on-surface shadow-[6px_6px_0px_#1c1b1b] space-y-6">
          <div className="border-b-2 border-on-surface/20 pb-4">
            <span className="font-mono text-xs font-bold text-primary uppercase tracking-wider block mb-1">
              Terms &amp; Conditions
            </span>
            <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface">
              Terms of Service
            </h1>
            <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-1">
              Last Updated: November 2026 • Product Draft for Student Use
            </p>
          </div>

          <div className="p-4 bg-secondary-container/40 rounded-xl border border-on-surface/30 text-xs text-on-surface-variant leading-relaxed">
            <strong>Legal Notice:</strong> This document represents an initial product terms draft for an independent, student-led open source pilot. It is not legally certified advice and does not imply institutional partnership with United International University.
          </div>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">1. Eligibility &amp; Authentication</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Registration on KothaKoi requires a UIU email address (such as <code className="px-1 py-0.5 bg-surface-container border border-on-surface/30 rounded text-[11px]">@uiu.ac.bd</code> or <code className="px-1 py-0.5 bg-surface-container border border-on-surface/30 rounded text-[11px]">@bscse.uiu.ac.bd</code>) as an application-level eligibility rule. KothaKoi is an independent student portfolio project and is not affiliated with, operated by, or endorsed by United International University.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">2. Nature of the Service</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              KothaKoi provides real-time, 1-to-1 anonymous matchmaking for text and WebRTC video/audio communication. Connections are randomized. The platform does not guarantee matchmaking availability or continuous uninterrupted uptime.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">3. Prohibited Conduct</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Users agree not to transmit illegal content, solicit minors, display non-consensual sexual content, perpetrate hate speech, distribute malware, or record video/audio streams of other students without explicit consent.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">4. Account Suspension &amp; Termination</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              KothaKoi administrators reserve the right to warn, suspend, or permanently ban any user account that violates these Terms or the Community Guidelines. Banned accounts forfeit access to all platform features.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">5. Disclaimers &amp; Limitation of Liability</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              The service is provided &quot;AS IS&quot; without warranties of any kind. To the maximum extent permitted by applicable laws of Bangladesh, KothaKoi developers shall not be liable for user conduct, network interruptions, or indirect damages arising from use of the platform.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs gap-3">
          <p className="font-label-sm text-on-surface">KothaKoi (কথা কই) • Terms of Service</p>
          <div className="flex items-center gap-4 font-label-sm text-on-surface-variant">
            <Link to="/community-guidelines" className="hover:text-primary transition-colors underline">Guidelines</Link>
            <Link to="/privacy" className="hover:text-primary transition-colors underline">Privacy</Link>
            <Link to="/safety-tips" className="hover:text-primary transition-colors underline">Safety Tips</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

