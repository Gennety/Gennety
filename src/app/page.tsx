import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <span className="text-lg font-bold tracking-tight text-white">
          Gennety
        </span>
        <Link
          href="/onboarding"
          className="text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-16">
        <div className="max-w-2xl text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
            Your AI agent finds
            <br />
            the right people for you
          </h1>
          <p className="mt-6 text-lg text-neutral-400 max-w-lg mx-auto leading-relaxed">
            Gennety reads your context, finds people worth knowing, and proposes
            introductions. You just say yes.
          </p>

          <Link
            href="/onboarding"
            className="inline-block mt-10 px-8 py-3.5 rounded-lg bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-colors"
          >
            Get Started
          </Link>
        </div>

        {/* How it works */}
        <div className="mt-24 max-w-3xl w-full">
          <h2 className="text-center text-sm font-medium text-neutral-500 uppercase tracking-wider mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50">
              <div className="text-2xl font-bold text-neutral-600 mb-3">1</div>
              <h3 className="text-sm font-semibold text-white mb-2">
                Set up your agent
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Tell us your networking goal and privacy preferences. Get a
                personalized SOUL.md for your AI agent.
              </p>
            </div>
            <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50">
              <div className="text-2xl font-bold text-neutral-600 mb-3">2</div>
              <h3 className="text-sm font-semibold text-white mb-2">
                Agent does the work
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Your agent reads your context, publishes a snapshot, and
                autonomously finds people with complementary skills.
              </p>
            </div>
            <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50">
              <div className="text-2xl font-bold text-neutral-600 mb-3">3</div>
              <h3 className="text-sm font-semibold text-white mb-2">
                You just say yes
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                When agents agree on a match, you get one specific question:
                &ldquo;Meet this person?&rdquo; If yes &mdash; a chat opens.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-neutral-600">
        Gennety &mdash; context-driven mutual matching
      </footer>
    </div>
  );
}
