import { Link } from 'react-router-dom'

export default function CommunityGuidelines() {
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
              Campus Standards &amp; Respect
            </span>
            <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface">
              KothaKoi Community Guidelines
            </h1>
            <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-1">
              Effective Date: November 2026 • Product Draft for UIU Student Community
            </p>
          </div>

          {/* Disclaimer Banner */}
          <div className="p-4 bg-secondary-container/40 rounded-xl border border-on-surface/30 text-xs text-on-surface-variant leading-relaxed">
            <strong>Disclaimer &amp; Project Notice:</strong> KothaKoi is an independent student-built portfolio project. It is not affiliated with, sponsored by, or endorsed by United International University (UIU). These community standards are self-defined guidelines for respectful peer interaction during project testing and demonstration.
          </div>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface flex items-center gap-2">
              <span>🤝</span> 1. The Core Principle: Mutual Campus Respect
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Every person you connect with on KothaKoi is a fellow UIU student. Treat them with the same courtesy and respect you would offer a classmate in the university cafeteria, library, or campus courtyard. Anonymous does not mean unaccountable.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface flex items-center gap-2">
              <span>🚫</span> 2. Unacceptable Behaviors (Zero Tolerance)
            </h2>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-on-surface-variant space-y-2">
              <li>
                <strong>Harassment &amp; Bullying:</strong> Targeting fellow students with derogatory comments, intimidation, personal attacks, or unwanted sexual remarks.
              </li>
              <li>
                <strong>Nudity &amp; Sexual Content:</strong> Displaying nudity, sexually explicit material, or engaging in sexual solicitation on video or text.
              </li>
              <li>
                <strong>Hate Speech:</strong> Discriminatory slurs, hate speech targeting religion, gender, ethnic background, or disability.
              </li>
              <li>
                <strong>Doxxing &amp; Non-Consensual Recording:</strong> Attempting to force peers to reveal real names or student IDs, or recording video/audio without express consent.
              </li>
              <li>
                <strong>Commercial Spam &amp; Bots:</strong> Promoting commercial products, scam links, automated bots, or solicitations.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface flex items-center gap-2">
              <span>🛡️</span> 3. Instant Safety Tools: Next, Block, and Report
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              You always have full control over every conversation:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-on-surface-variant space-y-1.5">
              <li>
                <strong>Next:</strong> Press the Next button (or <kbd className="px-1 py-0.5 bg-surface-container border border-on-surface rounded font-mono text-[11px]">ESC</kbd>) to instantly disconnect and find a new partner.
              </li>
              <li>
                <strong>Block:</strong> Permanently prevents you and that student from ever matching again.
              </li>
              <li>
                <strong>Report:</strong> Submits structured violation reports directly to the administration queue for moderation review.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface flex items-center gap-2">
              <span>⚖️</span> 4. Moderation &amp; Enforcement
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              Administrators review flagged reports. Accounts confirmed of violating these guidelines may receive formal warnings, temporary suspensions (24h to 7 days), or permanent revocation of KothaKoi access.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs gap-3">
          <p className="font-label-sm text-on-surface">KothaKoi (কথা কই) • Campus Community Guidelines</p>
          <div className="flex items-center gap-4 font-label-sm text-on-surface-variant">
            <Link to="/terms" className="hover:text-primary transition-colors underline">Terms</Link>
            <Link to="/privacy" className="hover:text-primary transition-colors underline">Privacy</Link>
            <Link to="/safety-tips" className="hover:text-primary transition-colors underline">Safety Tips</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

