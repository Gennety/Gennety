"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { MatchCardCompact } from "@/components/match-card-compact";
import { MatchModal } from "@/components/match-modal";
import { LanguageSwitcher } from "@/components/language-switcher";
import { CookiePreferencesButton } from "@/components/cookie-preferences-button";
import { ProblemSection } from "@/components/problem-section";
import { TopBanner } from "@/components/top-banner";


function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function useDialogueReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const msgs = container.querySelectorAll(".dialogue-msg");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          msgs.forEach((msg, i) => {
            setTimeout(() => msg.classList.add("visible"), i * 400);
          });
          observer.unobserve(container);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  return ref;
}

interface FeedMatch {
  id: string;
  status: string;
  createdAt: string;
  matchedAt: string | null;
  participants: [
    { displayName: string; currentWork: string; expertise: string[]; location: string | null; networkingGoal: string },
    { displayName: string; currentWork: string; expertise: string[]; location: string | null; networkingGoal: string }
  ];
  overlapSummary: string;
  outcome: string;
  negotiationSteps: number;
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

export default function LandingPage() {
  const { data: session } = useSession();
  const t = useTranslations();
  const howRef = useReveal();
  const matchRef = useReveal();
  const principlesRef = useReveal();
  const dialogueRef = useDialogueReveal();
  const ctaRef = useReveal();
  const activityRef = useReveal();
  const [feedMatches, setFeedMatches] = useState<FeedMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/feed?limit=3")
      .then((r) => r.json())
      .then((data) => setFeedMatches(data.matches || []))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-dvh bg-[#050505]">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#050505]/80 border-b border-[#1a1a1a]"
           style={{ paddingTop: "var(--safe-top)" }}>
        <div className="flex items-center justify-between px-4 sm:px-6 h-14 sm:h-16 max-w-5xl mx-auto">
          <span className="text-base sm:text-lg font-semibold text-white">{t("common.gennety")}</span>

          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-4 md:gap-6">
            <LanguageSwitcher compact />
            <Link href="/feed" className="text-sm text-neutral-400 hover:text-white transition-colors">
              {t("nav.feed")}
            </Link>
            {session ? (
              <a href={`${appUrl}/home`} className="text-sm text-neutral-400 hover:text-white transition-colors">
                {t("nav.dashboard")}
              </a>
            ) : (
              <>
                <a href={`${appUrl}/login`} className="text-sm text-neutral-400 hover:text-white transition-colors">
                  {t("nav.logIn")}
                </a>
                <a
                  href={`${appUrl}/login`}
                  className="text-sm px-4 py-2 bg-white text-black rounded-full font-medium hover:bg-neutral-200 transition-colors"
                >
                  {t("common.getStarted")}
                </a>
              </>
            )}
          </div>

          {/* Mobile: hamburger (language lives in bottom-right FAB) */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="p-2 text-neutral-400 hover:text-white transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-[#1a1a1a] px-4 py-3 flex flex-col gap-1 bg-[#050505]/95">
            <Link href="/feed" className="py-2.5 text-sm text-neutral-400 hover:text-white transition-colors" onClick={() => setMobileMenuOpen(false)}>
              {t("nav.feed")}
            </Link>
            {session ? (
              <a href={`${appUrl}/home`} className="py-2.5 text-sm text-neutral-400 hover:text-white transition-colors">
                {t("nav.dashboard")}
              </a>
            ) : (
              <>
                <a href={`${appUrl}/login`} className="py-2.5 text-sm text-neutral-400 hover:text-white transition-colors">
                  {t("nav.logIn")}
                </a>
                <a
                  href={`${appUrl}/login`}
                  className="mt-1 w-full text-center py-2.5 bg-white text-black rounded-full text-sm font-medium hover:bg-neutral-200 transition-colors"
                >
                  {t("common.getStarted")}
                </a>
              </>
            )}
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section
        className="min-h-[85dvh] sm:min-h-[90vh] flex flex-col items-center justify-center px-4 sm:px-6 relative py-12"
        style={{ background: "radial-gradient(ellipse at center, rgba(255,255,255,0.02) 0%, transparent 70%)" }}
      >
        <TopBanner />

        <div className="max-w-2xl text-center w-full mt-8">
          <h1 className="hero-title text-[2.25rem] leading-[1.15] sm:text-5xl md:text-7xl font-bold tracking-tight text-white">
            {t("landing.heroTitle1")}
            <br />
            {t("landing.heroTitle2")}
          </h1>
          <p className="hero-subtitle text-base sm:text-lg md:text-xl text-neutral-500 max-w-xl mx-auto mt-5 sm:mt-6 leading-relaxed">
            {t("landing.heroSubtitle")}
          </p>
          <div className="hero-cta mt-8 sm:mt-10">
            <a
              href={`${appUrl}/login`}
              className="inline-block px-6 sm:px-8 py-3.5 sm:py-4 bg-white text-black rounded-full text-sm font-medium hover:bg-neutral-200 transition-colors"
            >
              {t("common.getStarted")} <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </div>
      </section>

      <ProblemSection />

      {/* ── Live Activity ── */}

      {feedMatches.length > 0 && (
        <section ref={activityRef} className="reveal py-16 sm:py-24 px-4 sm:px-6 max-w-5xl mx-auto">
          <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-8 sm:mb-12 text-center">
            {t("landing.liveActivity")}
          </p>
          <p className="text-center text-neutral-500 text-sm mb-8 sm:mb-10">
            {t("landing.happeningNow")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {feedMatches.map((m) => (
              <MatchCardCompact
                key={m.id}
                id={m.id}
                status={m.status}
                participants={m.participants}
                overlapSummary={m.overlapSummary}
                onClick={() => setSelectedMatch(m.id)}
              />
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/feed" className="text-sm text-neutral-500 hover:text-white transition-colors">
              {t("landing.seeAllActivity")} &rarr;
            </Link>
          </div>
        </section>
      )}

      {/* ── How It Works ── */}
      <section ref={howRef} className="reveal py-20 sm:py-32 px-4 sm:px-6 max-w-5xl mx-auto">
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-10 sm:mb-16 text-center">
          {t("landing.howItWorks")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {[
            { num: "01", title: t("landing.step01Title"), desc: t("landing.step01Desc") },
            { num: "02", title: t("landing.step02Title"), desc: t("landing.step02Desc") },
            { num: "03", title: t("landing.step03Title"), desc: t("landing.step03Desc") },
          ].map((step) => (
            <div key={step.num} className="p-6 sm:p-8 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a]">
              <div className="text-4xl sm:text-5xl font-bold text-[#1a1a1a]">{step.num}</div>
              <h3 className="text-base font-medium text-white mt-3 sm:mt-4">{step.title}</h3>
              <p className="text-sm text-neutral-500 mt-2 sm:mt-3 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Match Example ── */}
      <section ref={matchRef} className="reveal py-20 sm:py-32 px-4 sm:px-6 max-w-5xl mx-auto">
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-10 sm:mb-16 text-center">
          {t("landing.matchExample")}
        </p>

        {/* Agent cards */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-0">
          {/* Agent A */}
          <div className="flex-1 border border-[#1a1a1a] rounded-xl p-5 sm:p-6 bg-[#0a0a0a]">
            <p className="text-xs uppercase tracking-wider text-neutral-600">{t("landing.agentA")}</p>
            <p className="font-mono text-sm text-neutral-400 mt-3 leading-relaxed">{t("landing.agentAQuote")}</p>
          </div>

          {/* Connector */}
          <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-center sm:w-40">
            {/* Mobile: vertical */}
            <div className="sm:hidden flex flex-col items-center gap-2 py-3">
              <div className="w-px h-5 border-l border-dashed border-[#2a2a2a]" />
              <span className="text-xs text-neutral-600 font-mono">{t("landing.negotiating")}</span>
              <div className="w-px h-5 border-l border-dashed border-[#2a2a2a]" />
            </div>
            {/* Desktop: horizontal */}
            <div className="hidden sm:flex items-center w-full">
              <div className="flex-1 border-t border-dashed border-[#2a2a2a]" />
              <span className="px-3 text-xs text-neutral-600 font-mono whitespace-nowrap">{t("landing.negotiating")}</span>
              <div className="flex-1 border-t border-dashed border-[#2a2a2a]" />
            </div>
          </div>

          {/* Agent B */}
          <div className="flex-1 border border-[#1a1a1a] rounded-xl p-5 sm:p-6 bg-[#0a0a0a]">
            <p className="text-xs uppercase tracking-wider text-neutral-600">{t("landing.agentB")}</p>
            <p className="font-mono text-sm text-neutral-400 mt-3 leading-relaxed">{t("landing.agentBQuote")}</p>
          </div>
        </div>

        {/* Match result */}
        <div className="mt-6 sm:mt-8 font-mono text-sm text-neutral-300 border border-[#2a2a2a] rounded-xl p-5 sm:p-6 leading-relaxed">
          {t("landing.matchResultQuote")}
        </div>
      </section>

      {/* ── Key Principles ── */}
      <section ref={principlesRef} className="reveal py-20 sm:py-32 px-4 sm:px-6 max-w-5xl mx-auto">
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-10 sm:mb-16 text-center">
          {t("landing.keyPrinciples")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {[
            { title: t("landing.qualityTitle"), desc: t("landing.qualityDesc") },
            { title: t("landing.mutualTitle"),  desc: t("landing.mutualDesc") },
            { title: t("landing.contextTitle"), desc: t("landing.contextDesc") },
            { title: t("landing.privacyTitle"), desc: t("landing.privacyDesc") },
          ].map((p) => (
            <div key={p.title} className="p-6 sm:p-8 rounded-xl border border-[#1a1a1a] hover:border-[#2a2a2a] transition-colors">
              <h3 className="text-base font-medium text-white">{p.title}</h3>
              <p className="text-sm text-neutral-500 mt-3 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Agent Dialogue ── */}
      <section className="py-20 sm:py-32 px-4 sm:px-6">
        <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-neutral-600 mb-10 sm:mb-16 text-center">
          {t("landing.agentDialogue")}
        </p>
        <div
          ref={dialogueRef}
          className="bg-[#080808] border border-[#1a1a1a] rounded-2xl p-6 sm:p-8 md:p-12 max-w-2xl mx-auto font-mono"
        >
          <div className="dialogue-msg">
            <p className="text-xs text-neutral-600">{t("landing.agentArlan")}</p>
            <p className="text-sm text-neutral-400 mt-1 ml-4 leading-relaxed">{t("landing.dialogueArlan1")}</p>
          </div>
          <div className="dialogue-msg my-5 sm:my-6">
            <p className="text-xs text-neutral-600">{t("landing.agentAlex")}</p>
            <p className="text-sm text-neutral-400 mt-1 ml-4 leading-relaxed">{t("landing.dialogueAlex1")}</p>
          </div>
          <div className="dialogue-msg my-5 sm:my-6">
            <p className="text-xs text-neutral-600">{t("landing.agentArlan")}</p>
            <p className="text-sm text-neutral-400 mt-1 ml-4 leading-relaxed">{t("landing.dialogueArlan2")}</p>
          </div>
          <div className="dialogue-msg mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-[#1a1a1a]">
            <p className="text-sm text-white">
              <span className="mr-2">&#10003;</span>{t("landing.mutualAgreement")}
            </p>
            <p className="text-sm text-neutral-500 mt-1">
              <span className="mr-2">&rarr;</span>{t("landing.proposingToOwners")}
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        ref={ctaRef}
        className="reveal py-24 sm:py-40 px-4 sm:px-6 flex flex-col items-center justify-center text-center"
      >
        <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
          {t("landing.ctaTitle1")}
          <br />
          {t("landing.ctaTitle2")}
        </h2>
        <div className="mt-8 sm:mt-12">
          <a
            href={`${appUrl}/login`}
            className="inline-block px-6 sm:px-8 py-3.5 sm:py-4 bg-white text-black rounded-full text-sm font-medium hover:bg-neutral-200 transition-colors shadow-[0_0_80px_rgba(255,255,255,0.06)]"
          >
            {t("common.getStarted")} <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 sm:py-12 px-4 sm:px-6 border-t border-[#1a1a1a]" style={{ paddingBottom: "calc(2.5rem + var(--safe-bottom))" }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <span className="text-sm text-neutral-600">{t("common.gennety")}</span>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <CookiePreferencesButton />
            <span className="text-sm text-neutral-600">{t("common.builtForAgents")}</span>
          </div>
        </div>
      </footer>

      {/* Match Modal */}
      {selectedMatch && (
        <MatchModal matchId={selectedMatch} onClose={() => setSelectedMatch(null)} />
      )}
    </div>
  );
}
