import { Link } from 'react-router-dom'

export default function PrivacyPolicy() {
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
              Data Protection &amp; Privacy
            </span>
            <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface">
              Privacy Policy
            </h1>
            <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-1">
              Last Updated: November 2026 • Product Draft for Student Transparency
            </p>
          </div>

          <div className="p-4 bg-secondary-container/40 rounded-xl border border-on-surface/30 text-xs text-on-surface-variant leading-relaxed">
            <strong>Privacy Guarantee:</strong> KothaKoi is designed from the ground up for anonymity. Your real student email and profile name are never shown to random chat partners.
          </div>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">1. What Information We Collect</h2>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-on-surface-variant space-y-2">
              <li>
                <strong>Account Credentials:</strong> UIU institutional email address and hashed authentication tokens/passwords. Used strictly to verify university enrollment and prevent unauthorized access.
              </li>
              <li>
                <strong>User Profile:</strong> Optional private account name, temporary chat nickname, chosen avatar preset, and in-app preferences.
              </li>
              <li>
                <strong>Safety &amp; Moderation Logs:</strong> User-submitted reports, structured violation categories, moderation audit actions, and reciprocal block lists to prevent repeat abuse.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">2. Ephemeral Chat Messages &amp; Media Handling</h2>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-on-surface-variant space-y-2">
              <li>
                <strong>Zero Chat History Storage:</strong> Real-time text messages are delivered ephemerally through Socket.IO in server memory. They are <strong>never written to our PostgreSQL database</strong> or persistent storage. Once your session ends, the messages vanish.
              </li>
              <li>
                <strong>Peer-to-Peer WebRTC Video:</strong> Audio and video streams are established directly between peer browsers whenever NAT topologies permit. When direct connection fails, encrypted media packets are relayed via Metered TURN servers. Relay servers do not record, inspect, or retain audio or video data.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">3. Cookies &amp; Local Storage</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              We use a single secure, HttpOnly session cookie (<code className="px-1 py-0.5 bg-surface-container border border-on-surface/30 rounded text-[11px]">kothakoi_session</code>) to maintain authentication. We do not use third-party advertising trackers or commercial surveillance analytics.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline-md text-lg font-bold text-on-surface">4. Self-Service Account Deletion</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              You may permanently delete your account at any time from your Profile settings. Deleting your account revokes active sessions, deletes your profile and password credentials, and irreversibly anonymizes your record so safety audit integrity is preserved without personally identifiable information.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs gap-3">
          <p className="font-label-sm text-on-surface">KothaKoi (কথা কই) • Privacy Policy</p>
          <div className="flex items-center gap-4 font-label-sm text-on-surface-variant">
            <Link to="/community-guidelines" className="hover:text-primary transition-colors underline">Guidelines</Link>
            <Link to="/terms" className="hover:text-primary transition-colors underline">Terms</Link>
            <Link to="/safety-tips" className="hover:text-primary transition-colors underline">Safety Tips</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

