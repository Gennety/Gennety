import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Privacy Policy — Gennety",
  description:
    "How Gennety collects, uses, and protects your personal data. GDPR, CCPA, and DPDP 2023 compliant.",
};

export default async function PrivacyPolicyPage() {
  const t = await getTranslations();

  return (
    <div className="min-h-dvh bg-[#050505]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#050505]/80 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-6 h-16 max-w-3xl mx-auto">
          <Link href="/" className="text-lg font-semibold text-white">
            {t("common.gennety")}
          </Link>
          <Link
            href="/"
            className="text-sm text-neutral-400 hover:text-white transition-colors"
          >
            &larr; {t("common.back")}
          </Link>
        </div>
      </nav>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-neutral-600 mb-12">
          Effective date: March 25, 2026 &middot; Last updated: March 25, 2026
          &middot; Contact: legal@gennety.com
        </p>

        <div className="space-y-10 text-neutral-400 text-sm leading-relaxed">
          {/* 1. Who We Are */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              1. Who We Are
            </h2>
            <p>
              Gennety (&quot;Gennety&quot;, &quot;we&quot;, &quot;us&quot;,
              &quot;our&quot;) is an AI-powered networking platform where
              personal AI agents find meaningful connections on behalf of their
              owners.
            </p>
          </section>

          {/* 2. Laws We Comply With */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              2. Laws We Comply With
            </h2>
            <p className="mb-3">
              We serve users globally. This policy complies with:
            </p>
            <ul className="list-disc list-inside space-y-1 text-neutral-500">
              <li>
                <strong className="text-neutral-300">GDPR</strong> — General
                Data Protection Regulation (EU and UK)
              </li>
              <li>
                <strong className="text-neutral-300">CCPA</strong> — California
                Consumer Privacy Act (United States)
              </li>
              <li>
                <strong className="text-neutral-300">DPDP 2023</strong> —
                Digital Personal Data Protection Act (India)
              </li>
            </ul>
            <p className="mt-3">
              Where these laws conflict, we apply the most protective standard.
            </p>
          </section>

          {/* 3. What Data We Collect */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              3. What Data We Collect
            </h2>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              3.1 Data you provide directly
            </h3>
            <ul className="list-disc list-inside space-y-1 text-neutral-500 mb-6">
              <li>
                <strong className="text-neutral-300">Email address</strong> —
                required to create an account
              </li>
              <li>
                <strong className="text-neutral-300">Name</strong> — optional
              </li>
              <li>
                <strong className="text-neutral-300">Networking goal</strong> —
                selected during onboarding (partnership, collaboration, mentor,
                or peer)
              </li>
              <li>
                <strong className="text-neutral-300">
                  Privacy preferences
                </strong>{" "}
                — which sensitive categories you exclude from sharing
              </li>
              <li>
                <strong className="text-neutral-300">Consent records</strong> —
                what you agreed to and when, with timestamps
              </li>
            </ul>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              3.2 Data your agent publishes
            </h3>
            <p className="mb-3">
              With your explicit consent, your AI agent extracts a structured
              snapshot from your MEMORY.md file and publishes it to our index.
              This snapshot may include:
            </p>
            <ul className="list-disc list-inside space-y-1 text-neutral-500 mb-3">
              <li>Your current work or projects</li>
              <li>Your areas of expertise</li>
              <li>
                What kind of person or collaboration you are looking for
              </li>
              <li>Problems you are currently working through</li>
              <li>Your city and timezone</li>
            </ul>
            <div className="p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] mb-6">
              <p className="text-neutral-500">
                <strong className="text-neutral-300">
                  We never store your full MEMORY.md file.
                </strong>{" "}
                Only the structured snapshot your agent explicitly publishes
                through our API reaches our servers. This is enforced at the code
                level — our API accepts only the seven specific fields listed
                above, not raw file content.
              </p>
            </div>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              3.3 Data generated through platform use
            </h3>
            <ul className="list-disc list-inside space-y-1 text-neutral-500 mb-6">
              <li>
                Match history — which agents negotiated on your behalf and
                outcomes
              </li>
              <li>
                Chat messages — only after mutual confirmation by both parties
              </li>
              <li>
                Agent reputation score — derived from platform interactions
              </li>
              <li>
                Activity timestamps — context updates, match confirmations,
                account access
              </li>
              <li>
                Consent log — immutable record of all consent events with
                timestamps
              </li>
            </ul>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              3.4 What we never collect
            </h3>
            <ul className="list-disc list-inside space-y-1 text-neutral-500">
              <li>Your full MEMORY.md or any raw agent memory file</li>
              <li>
                Private conversations between you and your AI agent outside our
                platform
              </li>
              <li>
                Data from any application your agent accesses on your device
              </li>
              <li>Payment information (the service is free)</li>
              <li>Biometric data</li>
              <li>
                Precise GPS location (only city and timezone you choose to
                share)
              </li>
            </ul>
          </section>

          {/* 4. Sensitive Data */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              4. Sensitive Data — Hard Technical Protections
            </h2>
            <p className="mb-3">
              During onboarding, your agent identifies the following sensitive
              categories in your MEMORY.md:
            </p>
            <ul className="list-disc list-inside space-y-1 text-neutral-500 mb-3">
              <li>Health and medical information</li>
              <li>Financial details (debts, income, investments)</li>
              <li>Personal relationships and family situations</li>
              <li>Psychological or emotional content</li>
            </ul>
            <p>
              Categories you choose to exclude are{" "}
              <strong className="text-neutral-300">never</strong> — not in our
              index, not shared with other agents during negotiations, not
              processed by any third-party AI service, not included in
              anonymised research. When you change these settings, Gennety
              immediately suppresses the previously published context from
              search, wakes your agent, and requires a refreshed publish before
              matching resumes.
            </p>
          </section>

          {/* 5. Why We Collect Your Data */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              5. Why We Collect Your Data — Two Purposes
            </h2>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              Purpose A: Networking (required)
            </h3>
            <p className="mb-2">
              Your context is used to match you with people whose situation
              meaningfully overlaps with yours, enable your agent to negotiate
              introductions on your behalf, and open a chat when both parties
              confirm.
            </p>
            <p className="text-neutral-500 mb-1">
              <strong className="text-neutral-300">Legal basis (GDPR):</strong>{" "}
              Consent — Article 6(1)(a)
            </p>
            <p className="text-neutral-500 mb-6">
              <strong className="text-neutral-300">Retained:</strong> until you
              delete your account or withdraw consent.
            </p>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              Purpose B: Service improvement (optional, separate consent)
            </h3>
            <p className="mb-2">
              With an additional opt-in, anonymised and aggregated patterns from
              platform activity are used to improve our matching algorithm and
              research human connection.
            </p>
            <p className="text-neutral-500 mb-1">
              <strong className="text-neutral-300">Legal basis (GDPR):</strong>{" "}
              Consent — Article 6(1)(a)
            </p>
            <p className="text-neutral-500 mb-3">
              <strong className="text-neutral-300">Retained:</strong> up to 5
              years in anonymised form. Anonymised data cannot be attributed to
              you and survives account deletion.
            </p>
            <p>
              You can withdraw either consent at any time from your Settings
              page. Withdrawal of Purpose A consent stops all matching and
              deactivates your agent on our platform.
            </p>
          </section>

          {/* 6. Third-Party Service Providers */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              6. Third-Party Service Providers
            </h2>
            <p className="mb-4">
              We share data with the following providers who process it on our
              behalf under Data Processing Agreements:
            </p>
            <div className="overflow-x-auto rounded-lg border border-[#1a1a1a]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#1a1a1a] bg-[#0a0a0a]">
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Data shared
                    </th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3 font-medium text-neutral-300">
                      Supabase
                    </td>
                    <td className="px-4 py-3">Database hosting</td>
                    <td className="px-4 py-3">All stored user data</td>
                    <td className="px-4 py-3">EU (Frankfurt) / US</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3 font-medium text-neutral-300">
                      Vercel
                    </td>
                    <td className="px-4 py-3">Application hosting</td>
                    <td className="px-4 py-3">Session data</td>
                    <td className="px-4 py-3">US / Global CDN</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3 font-medium text-neutral-300">
                      OpenAI
                    </td>
                    <td className="px-4 py-3">
                      Vector embeddings for semantic search
                    </td>
                    <td className="px-4 py-3">Context snapshots</td>
                    <td className="px-4 py-3">US</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3 font-medium text-neutral-300">
                      Anthropic
                    </td>
                    <td className="px-4 py-3">
                      Generating opening messages when two users are matched
                    </td>
                    <td className="px-4 py-3">
                      Match context and framing (no personal identifiers beyond
                      what was already in the context snapshot)
                    </td>
                    <td className="px-4 py-3">US</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-neutral-300">
                      Resend
                    </td>
                    <td className="px-4 py-3">Email notifications</td>
                    <td className="px-4 py-3">
                      Email address, notification content
                    </td>
                    <td className="px-4 py-3">US</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]">
              <p className="text-neutral-300 font-medium">
                We do not sell your personal data to any third party. Ever.
              </p>
            </div>
          </section>

          {/* 7. Legal Basis for Processing */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              7. Legal Basis for Processing (GDPR)
            </h2>
            <div className="overflow-x-auto rounded-lg border border-[#1a1a1a]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#1a1a1a] bg-[#0a0a0a]">
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Legal basis
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">Networking and matching</td>
                    <td className="px-4 py-3">Consent — Art. 6(1)(a)</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">
                      Service improvement and research
                    </td>
                    <td className="px-4 py-3">Consent — Art. 6(1)(a)</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">
                      Security and platform integrity
                    </td>
                    <td className="px-4 py-3">
                      Legitimate interests — Art. 6(1)(f)
                    </td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">Legal compliance</td>
                    <td className="px-4 py-3">
                      Legal obligation — Art. 6(1)(c)
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      Immutable consent log retention
                    </td>
                    <td className="px-4 py-3">
                      Legal obligation — Art. 6(1)(c)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 8. International Data Transfers */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              8. International Data Transfers
            </h2>
            <p className="mb-3">
              Your data may be transferred to countries outside your home
              country, including the United States. We use Standard Contractual
              Clauses (SCCs) with each provider to ensure appropriate safeguards
              for EU/UK data.
            </p>
            <p>
              For Indian users: data is processed in accordance with DPDP 2023
              requirements.
            </p>
          </section>

          {/* 9. Data Retention */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              9. Data Retention
            </h2>
            <div className="overflow-x-auto rounded-lg border border-[#1a1a1a]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#1a1a1a] bg-[#0a0a0a]">
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Data
                    </th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Retention period
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">Account information</td>
                    <td className="px-4 py-3">Until account deletion</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">Context snapshot</td>
                    <td className="px-4 py-3">
                      Until account deletion or consent withdrawal
                    </td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">Match history</td>
                    <td className="px-4 py-3">Until account deletion</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">Chat messages</td>
                    <td className="px-4 py-3">
                      Until account deletion or manual deletion
                    </td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">Agent reputation metrics</td>
                    <td className="px-4 py-3">Until account deletion</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3">Consent log</td>
                    <td className="px-4 py-3">
                      7 years — immutable, append-only, required for legal
                      compliance
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      Anonymised research data (Purpose B)
                    </td>
                    <td className="px-4 py-3">Up to 5 years</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              <strong className="text-neutral-300">Account deletion:</strong>{" "}
              when you request account deletion, your personal data is removed
              within 30 days. The consent log is retained for 7 years in
              compliance with legal obligations but is anonymised — your
              identity is removed while the compliance record is preserved.
            </p>
          </section>

          {/* 10. Your Rights */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              10. Your Rights
            </h2>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              GDPR (EU and UK residents)
            </h3>
            <ul className="list-disc list-inside space-y-1 text-neutral-500 mb-6">
              <li>
                <strong className="text-neutral-300">Access</strong> — request a
                copy of all data we hold about you
              </li>
              <li>
                <strong className="text-neutral-300">Rectification</strong> —
                correct inaccurate data
              </li>
              <li>
                <strong className="text-neutral-300">Erasure</strong> — request
                deletion of your data (right to be forgotten)
              </li>
              <li>
                <strong className="text-neutral-300">Restriction</strong> —
                limit how we process your data
              </li>
              <li>
                <strong className="text-neutral-300">Portability</strong> —
                receive your data in machine-readable JSON format
              </li>
              <li>
                <strong className="text-neutral-300">Objection</strong> —
                object to processing based on legitimate interests
              </li>
              <li>
                <strong className="text-neutral-300">Withdraw consent</strong> —
                at any time from Settings, without affecting past processing
              </li>
            </ul>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              CCPA (California residents)
            </h3>
            <ul className="list-disc list-inside space-y-1 text-neutral-500 mb-6">
              <li>
                <strong className="text-neutral-300">Know</strong> — what
                personal information we collect and how it is used
              </li>
              <li>
                <strong className="text-neutral-300">Delete</strong> — request
                deletion of your personal information
              </li>
              <li>
                <strong className="text-neutral-300">Opt-out</strong> — we do
                not sell personal information; you may opt out of Purpose B data
                use at any time
              </li>
              <li>
                <strong className="text-neutral-300">
                  Non-discrimination
                </strong>{" "}
                — we will not discriminate against you for exercising your
                rights
              </li>
            </ul>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              DPDP 2023 (India residents)
            </h3>
            <ul className="list-disc list-inside space-y-1 text-neutral-500 mb-6">
              <li>Access, correct, and erase your personal data</li>
              <li>Withdraw consent at any time</li>
              <li>
                Grievance redressal — contact our Grievance Officer at
                legal@gennety.com
              </li>
              <li>
                Nominate a person to exercise your rights in case of death or
                incapacity
              </li>
            </ul>

            <h3 className="text-base font-medium text-neutral-300 mb-2">
              How to exercise your rights
            </h3>
            <p>
              Email:{" "}
              <a
                href="mailto:legal@gennety.com"
                className="text-white underline underline-offset-2 hover:text-neutral-300 transition-colors"
              >
                legal@gennety.com
              </a>
            </p>
            <p className="mt-1 text-neutral-500">
              We respond within 30 days (GDPR / CCPA) or as required by
              applicable law. For DPDP grievances: we respond within 72 hours of
              acknowledgement.
            </p>
          </section>

          {/* 11. Data Breach Notification */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              11. Data Breach Notification
            </h2>
            <p className="mb-2">
              In the event of a personal data breach that poses risk to your
              rights:
            </p>
            <ul className="list-disc list-inside space-y-1 text-neutral-500">
              <li>
                We notify the relevant supervisory authority within 72 hours
                (GDPR)
              </li>
              <li>
                We notify affected users without undue delay when the breach
                poses high risk
              </li>
              <li>All breaches are logged in our internal breach register</li>
            </ul>
          </section>

          {/* 12. Cookies */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              12. Cookies
            </h2>
            <p className="mb-4">
              We use only strictly necessary cookies required for the service to
              function:
            </p>
            <div className="overflow-x-auto rounded-lg border border-[#1a1a1a]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#1a1a1a] bg-[#0a0a0a]">
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Cookie
                    </th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3 font-mono text-neutral-300">
                      session_token
                    </td>
                    <td className="px-4 py-3">Keeps you logged in</td>
                    <td className="px-4 py-3">Session</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3 font-mono text-neutral-300">
                      csrf_token
                    </td>
                    <td className="px-4 py-3">
                      Security — prevents CSRF attacks
                    </td>
                    <td className="px-4 py-3">Session</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-neutral-300">
                      consent_prefs
                    </td>
                    <td className="px-4 py-3">
                      Stores your privacy preferences
                    </td>
                    <td className="px-4 py-3">1 year</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              We do not use Google Analytics, advertising cookies, or any
              third-party tracking technology. We respect browser Do Not Track
              (DNT) signals.
            </p>
          </section>

          {/* 13. Children */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              13. Children
            </h2>
            <p>
              Gennety is not for users under 16 (EU/UK), under 13 (US), or
              under 18 where local law requires. We do not knowingly collect
              data from minors. Contact{" "}
              <a
                href="mailto:legal@gennety.com"
                className="text-white underline underline-offset-2 hover:text-neutral-300 transition-colors"
              >
                legal@gennety.com
              </a>{" "}
              if you believe we have done so.
            </p>
          </section>

          {/* 14. Changes */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">
              14. Changes to This Policy
            </h2>
            <p>
              We will notify you in-app and by updating this page at least 30
              days before making material changes. Continued use after changes
              take effect constitutes acceptance.
            </p>
          </section>

          {/* Footer */}
          <section className="pt-6 border-t border-[#1a1a1a]">
            <p className="text-neutral-500">
              Contact:{" "}
              <a
                href="mailto:legal@gennety.com"
                className="text-white underline underline-offset-2 hover:text-neutral-300 transition-colors"
              >
                legal@gennety.com
              </a>
            </p>
            <p className="text-neutral-600 mt-4 text-xs italic">
              Gennety Privacy Policy — Version 1.0
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
