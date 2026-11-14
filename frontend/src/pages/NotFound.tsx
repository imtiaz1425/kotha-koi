import { Link } from 'react-router-dom'

export default function NotFound() {
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
          <Link
            to="/"
            className="px-3 py-1 bg-surface-container text-on-surface font-label-sm text-xs font-bold rounded-lg border border-on-surface hover:bg-secondary-container transition-all"
          >
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Main 404 Stage */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6 bg-surface-container-lowest p-8 rounded-2xl border-2 border-on-surface shadow-[6px_6px_0px_#1c1b1b]">
          <div className="inline-block p-4 bg-secondary-container rounded-2xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] text-4xl sm:text-5xl">
            ☕❓
          </div>

          <div className="space-y-2">
            <span className="font-mono text-xs font-bold text-primary uppercase tracking-widest block">
              Error 404
            </span>
            <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface">
              Lost in the Campus Courtyard?
            </h1>
            <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
              The page you are looking for does not exist, has been removed, or is currently unavailable.
            </p>
          </div>

          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-container text-on-surface font-headline-md text-xs sm:text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-on-surface shadow-[3px_3px_0px_#1c1b1b] hover:bg-[#ff8638] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">home</span>
              <span>Return to Adda Lobby</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#FFF5E6] border-t-2 border-on-surface shadow-[0_-2px_0px_#1c1b1b] shrink-0 py-3 text-center text-xs text-on-surface-variant font-label-sm">
        KothaKoi (কথা কই) • Ephemeral Student Addas
      </footer>
    </div>
  )
}

