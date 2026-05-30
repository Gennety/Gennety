import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Cookie Policy — Gennety",
  description: "How Gennety uses cookies and your privacy choices.",
};

export default async function CookiePolicyPage() {
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
          Cookie Policy
        </h1>
        <p className="text-sm text-neutral-600 mb-12">
          Effective date: March 25, 2026 &middot; Last updated: March 25, 2026
        </p>

        <div className="space-y-10 text-neutral-400 text-sm leading-relaxed">
          {/* What Are Cookies */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">What Are Cookies</h2>
            <p>
              Cookies are small text files placed on your device when you visit a website.
              They help the site remember information about your visit.
            </p>
          </section>

          {/* Cookies We Use */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">Cookies We Use</h2>
            <p className="mb-4">
              Gennety uses only <strong className="text-neutral-300">strictly necessary cookies</strong> —
              cookies that are essential for the website to function. Without these cookies,
              the service cannot operate.
            </p>
            <div className="overflow-x-auto rounded-lg border border-[#1a1a1a]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#1a1a1a] bg-[#0a0a0a]">
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">Cookie</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">Purpose</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3 font-mono text-neutral-300">session_token</td>
                    <td className="px-4 py-3">Keeps you logged in during your session</td>
                    <td className="px-4 py-3">Session</td>
                  </tr>
                  <tr className="border-b border-[#1a1a1a]">
                    <td className="px-4 py-3 font-mono text-neutral-300">csrf_token</td>
                    <td className="px-4 py-3">Security — prevents cross-site request forgery attacks</td>
                    <td className="px-4 py-3">Session</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-neutral-300">cookie_consent_given</td>
                    <td className="px-4 py-3">Remembers your cookie banner choices in browser storage</td>
                    <td className="px-4 py-3">Until browser storage is cleared or the policy version changes</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]">
              <p className="text-neutral-500 mb-1">We do <strong className="text-neutral-400">not</strong> use:</p>
              <ul className="list-disc list-inside text-neutral-500 space-y-1">
                <li>Analytics cookies (no Google Analytics, no Mixpanel, no Segment)</li>
                <li>Advertising or tracking cookies</li>
                <li>Social media cookies</li>
                <li>Any third-party cookies for marketing purposes</li>
              </ul>
            </div>
          </section>

          {/* Consent Choices */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">Consent Choices</h2>
            <p>
              We show a cookie preferences banner so you can accept, reject, or customize
              optional categories. Your browser stores a local UX cache of the choice, and
              the server keeps an append-only consent audit record without storing your raw IP address.
            </p>
          </section>

          {/* Third-Party Cookies */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">Third-Party Cookies</h2>
            <p>
              Our infrastructure providers (Supabase for database, Vercel for hosting) may
              set technical session cookies for performance and security. These are not used
              for advertising or tracking.
            </p>
          </section>

          {/* Managing Cookies */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">Managing Cookies</h2>
            <p className="mb-3">
              You can control cookies through your browser settings. Note that disabling
              session cookies will prevent you from logging in to Gennety.
            </p>
            <p>Most browsers allow you to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-neutral-500">
              <li>View cookies that have been set</li>
              <li>Block cookies from specific sites</li>
              <li>Delete all cookies when you close your browser</li>
            </ul>
          </section>

          {/* Do Not Track */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">Do Not Track</h2>
            <p>
              We respect browser Do Not Track (DNT) signals. When DNT is enabled, we do not
              set any cookies beyond the strictly necessary ones listed above — which we
              already limit to in all cases.
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-lg font-medium text-white mb-3">Changes</h2>
            <p>
              We will notify you of any material changes to this policy in-app and on this
              page.
            </p>
          </section>

          {/* Contact */}
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
              Gennety Cookie Policy — Version 1.0
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}
