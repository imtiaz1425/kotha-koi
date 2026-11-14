import { Link } from 'react-router-dom'

export default function SafetyTips() {
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
              Student Protection Guide
            </span>
            <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface">
              Student Safety Tips
            </h1>
            <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-1">
              Practical advice for safe and enjoyable anonymous addas on campus.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-surface rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔒</span>
                <h3 className="font-headline-md text-sm font-bold text-on-surface">
                  Protect Your Personal Identity
                </h3>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Do not share your phone number, social media handles, student ID number, residential address, or banking/bKash information with strangers.
              </p>
            </div>

            <div className="p-4 bg-surface rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">📹</span>
                <h3 className="font-headline-md text-sm font-bold text-on-surface">
                  Camera &amp; Background Awareness
                </h3>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Be mindful of what is visible in your camera frame. Avoid displaying personal documents, identifiable room features, or private moments.
              </p>
            </div>

            <div className="p-4 bg-surface rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="font-headline-md text-sm font-bold text-on-surface">
                  Trust Your Instincts (Hit Next)
                </h3>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                If any conversation makes you uncomfortable, bored, or uneasy, leave immediately. Pressing Next or <kbd className="px-1 py-0.5 bg-surface-container border border-on-surface rounded font-mono text-[10px]">ESC</kbd> disconnects the peer instantly with zero consequences.
              </p>
            </div>

            <div className="p-4 bg-surface rounded-xl border-2 border-on-surface shadow-[2px_2px_0px_#1c1b1b] space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚩</span>
                <h3 className="font-headline-md text-sm font-bold text-on-surface">
                  Report Serious Misconduct
                </h3>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                If you encounter harassment, hate speech, threats, or vulgarity, click Report and select the relevant reason before skipping. Our moderators actively review reports.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#FFF5E6] rounded-xl border-2 border-on-surface text-xs text-on-surface-variant leading-relaxed">
            <strong>Campus Notice:</strong> KothaKoi is built to promote friendly student connection across different departments at UIU. Let&apos;s work together to keep the environment safe, creative, and welcoming for everyone.
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs gap-3">
          <p className="font-label-sm text-on-surface">KothaKoi (কথা কই) • Student Safety Tips</p>
          <div className="flex items-center gap-4 font-label-sm text-on-surface-variant">
            <Link to="/community-guidelines" className="hover:text-primary transition-colors underline">Guidelines</Link>
            <Link to="/terms" className="hover:text-primary transition-colors underline">Terms</Link>
            <Link to="/privacy" className="hover:text-primary transition-colors underline">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

