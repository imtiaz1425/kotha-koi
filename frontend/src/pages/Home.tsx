/**
 * Home.tsx – KothaKoi landing page
 * Exclusively for United International University (UIU) students.
 * Preserves the retro neo-brutalist orange/cream/pixel-tea aesthetic
 * and fits approximately within one screen on desktop.
 */
import { Link } from 'react-router-dom'
import { useAuth } from '../context'
import { OnlineBadge } from '../components/OnlineBadge'
import { ProfileDropdown } from '../components/ProfileDropdown'

export default function Home() {
  const { user, isAuthenticated } = useAuth()

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col justify-between overflow-x-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#FFF5E6] border-b-2 border-on-surface shadow-[0_2px_0px_#1c1b1b] shrink-0">
        <div className="h-14 sm:h-16 max-w-7xl mx-auto px-margin lg:px-margin-desktop flex items-center justify-between gap-gutter">
          {/* Logo */}
          <div className="flex items-center gap-space-sm">
            <Link className="flex items-center gap-space-xs select-none" to="/">
              <span className="font-headline-md text-headline-md font-bold tracking-tight text-on-surface">
                KothaKoi
              </span>
              <span className="font-headline-md text-headline-md font-bold text-primary">
                .
              </span>
              <span className="hidden sm:inline-block font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-secondary-container text-on-secondary-container border border-on-surface ml-1">
                কথা কই
              </span>
            </Link>
          </div>

          {/* Centre badge: UIU only & Online Count */}
          <div className="flex items-center gap-2">
            <OnlineBadge />
            <div className="hidden md:inline-flex items-center gap-space-xs px-space-sm py-1 bg-surface-container-lowest border-2 border-on-surface rounded-full shadow-[2px_2px_0px_#1c1b1b]">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
              <span className="font-label-sm text-label-sm text-on-surface font-bold tracking-wide">
                🎓 UIU Students Only • 100% Anonymous
              </span>
            </div>
          </div>

          {/* Nav */}
          <div className="flex items-center gap-space-md">
            <nav className="flex items-center gap-space-md lg:gap-gutter-desktop">
              <a
                className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
                href="#how-it-works"
              >
                How it works
              </a>
              <Link
                className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors hidden sm:inline-block"
                to="/community-guidelines"
              >
                Campus Guidelines
              </Link>
              {isAuthenticated ? (
                <Link
                  className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors font-bold"
                  to="/profile"
                >
                  My Profile
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors font-bold"
                    to="/login"
                  >
                    Login
                  </Link>
                  <Link
                    className="hidden sm:inline-block font-label-sm text-xs px-2.5 py-1 bg-secondary-container text-on-surface border border-on-surface rounded-lg shadow-[1px_1px_0px_#1c1b1b] hover:bg-[#ffe087] transition-all font-bold"
                    to="/register"
                  >
                    Register
                  </Link>
                </div>
              )}
              <Link
                to="/admin/login"
                className="font-label-sm text-[10px] sm:text-[11px] text-on-surface-variant/70 hover:text-on-surface transition-colors border border-on-surface/20 hover:border-on-surface/50 rounded px-1.5 py-0.5 ml-1"
                title="Administrator Login"
              >
                Admin Login
              </Link>
            </nav>

            {/* Profile Dropdown Container */}
            <ProfileDropdown buttonId="profile-menu-btn" />
          </div>
        </div>
      </header>

      {/* ── Main Hero Section ───────────────────────────────────── */}
      <main className="flex-1 flex flex-col justify-center items-center w-full px-margin lg:px-margin-desktop py-space-sm sm:py-space-md relative overflow-hidden">
        {/* Ambient background decoration */}
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-primary-container/15 blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-2xl mx-auto flex flex-col items-center text-center my-auto">
          {/* Mascot */}
          <div className="relative mb-space-sm sm:mb-space-md group select-none">
            {/* Floating badge */}
            <div className="absolute -top-4 -right-8 bg-secondary-container text-on-surface px-space-xs py-0.5 rounded shadow-md border-2 border-on-surface text-label-sm font-label-sm animate-bounce">
              Adda Vibes ☕
            </div>

            {/* Tea-cup SVG frame */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 bg-surface-container-lowest rounded-xl border-2 border-on-surface shadow-[4px_4px_0px_#1c1b1b] p-2 flex items-center justify-center transition-transform hover:-rotate-2">
              <svg
                className="w-full h-full text-on-surface"
                fill="none"
                viewBox="0 0 64 64"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="Retro pixel tea-cup mascot"
              >
                {/* Steam */}
                <path
                  d="M22 10V6H24V10H22ZM28 8V4H30V8H28ZM36 10V6H38V10H36Z"
                  fill="#F47721"
                />
                {/* Cup body */}
                <rect
                  fill="#FFE087"
                  height="26"
                  rx="2"
                  stroke="#1c1b1b"
                  strokeWidth="2"
                  width="30"
                  x="14"
                  y="16"
                />
                {/* Pattern lines */}
                <path
                  d="M14 26H44M14 34H44"
                  stroke="#9C4500"
                  strokeDasharray="2 3"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
                {/* Handle */}
                <path
                  d="M44 20H49C51.2091 20 53 21.7909 53 24V28C53 30.2091 51.2091 32 49 32H44"
                  stroke="#1c1b1b"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
                {/* Eyes */}
                <rect fill="#1c1b1b" height="4" width="3" x="20" y="24" />
                <rect fill="#1c1b1b" height="4" width="3" x="35" y="24" />
                {/* Cheeks */}
                <rect fill="#F47721" height="2" width="3" x="18" y="29" />
                <rect fill="#F47721" height="2" width="3" x="37" y="29" />
                {/* Smile */}
                <path
                  d="M26 31C26 32.5 27.5 34 29 34C30.5 34 32 32.5 32 31"
                  stroke="#1c1b1b"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
                {/* Saucer */}
                <rect
                  fill="#FFFFFF"
                  height="4"
                  rx="1"
                  stroke="#1c1b1b"
                  strokeWidth="2"
                  width="38"
                  x="10"
                  y="44"
                />
                {/* Sparks */}
                <rect fill="#F47721" height="2" width="2" x="4" y="20" />
                <rect fill="#9C4500" height="2" width="2" x="52" y="12" />
              </svg>
            </div>
          </div>

          {/* Headline */}
          <h1 className="font-headline-xl text-[34px] sm:text-[44px] md:text-[50px] leading-tight text-on-surface font-bold tracking-tight mb-1">
            Bored?{' '}
            <span className="text-primary-container relative inline-block underline decoration-wavy decoration-2 underline-offset-4">
              Kotha Koi.
            </span>
          </h1>

          <p className="font-headline-md text-headline-md text-primary font-bold mb-1">
            কথা কই{' '}
            <span className="text-on-surface font-normal text-body-lg">
              • Meet someone new from UIU.
            </span>
          </p>

          <p className="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto mb-space-sm sm:mb-space-md">
            Connect with a random UIU peer. Stay 100% anonymous. Zero profile
            footprints, zero cringe.
          </p>

          {/* ── Single Prominent CTA Button ──────────────────── */}
          <div className="w-full max-w-xs mx-auto mb-space-sm sm:mb-space-md">
            <Link
              id="start-adda-btn"
              to={
                isAuthenticated
                  ? user?.hasProfile
                    ? '/chat'
                    : '/choose-nickname'
                  : '/login'
              }
              className="group relative w-full inline-flex items-center justify-center gap-space-sm px-space-lg py-3 bg-primary-container text-on-surface border-2 border-on-surface rounded-xl shadow-[4px_4px_0px_#1c1b1b] hover:shadow-[2px_2px_0px_#1c1b1b] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all select-none"
            >
              <span className="text-xl" aria-hidden="true">
                ☕
              </span>
              <span className="font-headline-md text-headline-md font-bold text-on-surface">
                Start Adda
              </span>
              <span className="material-symbols-outlined text-[22px] text-on-surface group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </Link>
          </div>

          {/* UIU Email Verification Note */}
          <div className="inline-flex items-center gap-space-xs px-space-md py-1 bg-surface-container-low border border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b] mb-space-sm sm:mb-space-md max-w-xl">
            <span className="material-symbols-outlined text-primary text-[17px] shrink-0">
              verified_user
            </span>
            <span className="font-label-sm text-label-sm text-on-surface text-center">
              🔒 Exclusively for <span className="font-bold">UIU students</span>{' '}
              (UIU email verified) • Real identities are never shown.
            </span>
          </div>

          {/* Feature Badges */}
          <div className="w-full max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-space-xs sm:gap-space-sm">
            <div className="inline-flex items-center gap-1.5 px-space-sm py-1 bg-surface-container-lowest border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b]">
              <span className="text-sm">🎲</span>
              <span className="font-label-sm text-label-sm font-bold text-on-surface">
                Random fun nicknames
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-space-sm py-1 bg-surface-container-lowest border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b]">
              <span className="text-sm">⚡</span>
              <span className="font-label-sm text-label-sm font-bold text-on-surface">
                Instant skip with
              </span>
              <span className="font-label-sm text-label-sm px-1 rounded bg-surface-variant border border-on-surface text-on-surface font-mono">
                'Next' / [ESC]
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-space-sm py-1 bg-surface-container-lowest border-2 border-on-surface rounded-lg shadow-[2px_2px_0px_#1c1b1b]">
              <span className="text-sm">🛡️</span>
              <span className="font-label-sm text-label-sm font-bold text-on-surface">
                Instant report &amp; block controls
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0">
        <div className="max-w-7xl mx-auto px-margin lg:px-margin-desktop py-2.5 sm:py-space-sm flex flex-col md:flex-row items-center justify-between gap-space-xs sm:gap-space-sm text-center md:text-left">
          <div className="flex flex-col gap-0.5">
            <p className="font-label-md text-label-md text-on-surface font-bold">
              KothaKoi (কথা কই) • Built for UIU student addas &amp; friendly
              chats
            </p>
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              Zero profile footprints. Ephemeral connections exclusive to United
              International University.
            </p>
          </div>
          <div className="flex items-center gap-space-md lg:gap-gutter-desktop flex-wrap justify-center">
            <Link
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors underline decoration-1 underline-offset-2"
              to="/safety-tips"
            >
              Safety Tips
            </Link>
            <Link
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors underline decoration-1 underline-offset-2"
              to="/community-guidelines"
            >
              Community Standards
            </Link>
            <Link
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors underline decoration-1 underline-offset-2"
              to="/terms"
            >
              Terms of Service
            </Link>
            <Link
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors underline decoration-1 underline-offset-2"
              to="/privacy"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
