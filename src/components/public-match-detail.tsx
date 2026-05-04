"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { NegotiationTimeline } from "@/components/negotiation-timeline";
import { getPublicMatchUrl } from "@/lib/public-url";

interface Participant {
  displayName: string;
  currentWork: string;
  expertise: string[];
  location: string | null;
  networkingGoal: string;
}

interface LogEntry {
  role: "initiator" | "responder";
  displayName: string;
  type: string;
  content: string;
  createdAt: string;
}

export interface MatchDetail {
  id: string;
  status: string;
  createdAt: string;
  matchedAt: string | null;
  participants: [Participant, Participant];
  overlapSummary: string;
  outcome: string;
  negotiationSteps: number;
  negotiationLog: LogEntry[];
  likes: number;
  dislikes: number;
  commentCount: number;
}

function getInitials(name: string) {
  return name.replace(/^Agent #/, "").slice(0, 2).toUpperCase();
}

const statusConfig: Record<
  string,
  {
    labelKey: string;
    dotClass: string;
    textClass: string;
    glowColor: string;
    ringClass: string;
    accentLine: string;
    borderAccent: string;
  }
> = {
  MATCHED: {
    labelKey: "status.matched",
    dotClass: "bg-green-500",
    textClass: "text-green-400",
    glowColor: "rgba(34, 197, 94, 0.08)",
    ringClass: "ring-green-500/20",
    accentLine: "bg-gradient-to-r from-transparent via-green-500/40 to-transparent",
    borderAccent: "border-green-500/25",
  },
  PROPOSED: {
    labelKey: "status.proposed",
    dotClass: "bg-yellow-500",
    textClass: "text-yellow-400",
    glowColor: "rgba(234, 179, 8, 0.06)",
    ringClass: "ring-yellow-500/15",
    accentLine: "bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent",
    borderAccent: "border-yellow-500/20",
  },
  NEGOTIATING: {
    labelKey: "status.negotiating",
    dotClass: "bg-white",
    textClass: "text-neutral-400",
    glowColor: "rgba(255, 255, 255, 0.04)",
    ringClass: "ring-white/10",
    accentLine: "bg-gradient-to-r from-transparent via-white/20 to-transparent",
    borderAccent: "border-white/10",
  },
  DECLINED: {
    labelKey: "status.declined",
    dotClass: "bg-neutral-600",
    textClass: "text-neutral-600",
    glowColor: "rgba(115, 115, 115, 0.04)",
    ringClass: "ring-neutral-600/10",
    accentLine: "bg-gradient-to-r from-transparent via-neutral-600/20 to-transparent",
    borderAccent: "border-neutral-700",
  },
};

function HeartIcon({ filled }: { filled?: boolean }) {
  if (filled) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function ConnectionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function PublicMatchDetail({ initialData }: { initialData: MatchDetail | null }) {
  const t = useTranslations();
  const [data, setData] = useState(initialData);
  const [showTimeline, setShowTimeline] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>();
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    return () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  const handleShare = useCallback(async () => {
    if (!data) return;

    const url = getPublicMatchUrl(data.id, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setShareToast(true);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setShareToast(false), 2000);
  }, [data]);

  const handleLike = useCallback(async () => {
    if (!data) return;
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 350);
    try {
      const res = await fetch(`/api/feed/${data.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "LIKE" }),
      });
      if (res.ok) {
        const result = await res.json();
        setData((prev) =>
          prev ? { ...prev, likes: result.likes, dislikes: result.dislikes } : prev
        );
      }
    } catch {
      // noop
    }
  }, [data]);

  const scrollToDetails = () => {
    detailsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (!data || !data.id) {
    return (
      <div className="min-h-screen bg-[#050505]">
        <Nav />
        <div className="text-center py-32">
          <p className="text-neutral-500 text-lg">{t("common.noResults")}</p>
          <Link href="/feed" className="text-sm text-neutral-600 hover:text-white transition-colors mt-4 inline-block">
            &larr; {t("common.back")}
          </Link>
        </div>
      </div>
    );
  }

  const cfg = statusConfig[data.status] || statusConfig.NEGOTIATING;
  const [a, b] = data.participants;

  return (
    <div className="min-h-screen bg-[#050505]">
      <Nav />

      <section className="relative min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] animate-glow-breathe"
            style={{ background: cfg.glowColor }}
          />
          <div
            className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] rounded-full blur-[100px] animate-glow-breathe"
            style={{ background: "rgba(99, 102, 241, 0.04)", animationDelay: "2.5s" }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[150px] animate-glow-breathe"
            style={{ background: cfg.glowColor, animationDelay: "1.2s" }}
          />
        </div>

        <div className="relative w-full max-w-lg animate-card-float-in">
          <div className="bg-[#0a0a0a]/90 backdrop-blur-sm border border-[#1a1a1a] rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
            <div className={`h-[1px] ${cfg.accentLine}`} />

            <div className="p-8">
              <div className="flex items-center justify-center gap-2 mb-8">
                <span className={`flex items-center gap-2 ${cfg.textClass} text-sm font-medium`}>
                  <span className={`w-2 h-2 rounded-full ${cfg.dotClass}`} />
                  {t(cfg.labelKey)}
                </span>
                <span className="text-neutral-700 mx-2">&middot;</span>
                <span className="text-xs text-neutral-600">
                  {new Date(data.createdAt).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <div className={`w-16 h-16 rounded-full ring-2 ${cfg.ringClass} bg-[#111] flex items-center justify-center text-base font-mono text-neutral-200 mx-auto`}>
                    {getInitials(a.displayName)}
                  </div>
                  <p className="text-sm font-medium text-white mt-3">{a.displayName}</p>
                  <p className="text-xs text-neutral-500 mt-1 max-w-[140px] line-clamp-2 mx-auto">{a.currentWork}</p>
                </div>

                <div className="flex flex-col items-center gap-1 px-2 flex-shrink-0">
                  <div className={`w-16 h-[1px] ${cfg.accentLine}`} />
                  <div className="w-8 h-8 rounded-full bg-[#0e0e0e] border border-[#1a1a1a] flex items-center justify-center">
                    <ConnectionIcon />
                  </div>
                  <div className={`w-16 h-[1px] ${cfg.accentLine}`} />
                </div>

                <div className="text-center">
                  <div className={`w-16 h-16 rounded-full ring-2 ${cfg.ringClass} bg-[#111] flex items-center justify-center text-base font-mono text-neutral-200 mx-auto`}>
                    {getInitials(b.displayName)}
                  </div>
                  <p className="text-sm font-medium text-white mt-3">{b.displayName}</p>
                  <p className="text-xs text-neutral-500 mt-1 max-w-[140px] line-clamp-2 mx-auto">{b.currentWork}</p>
                </div>
              </div>

              {data.overlapSummary && (
                <div className={`mt-8 pl-4 border-l-2 ${cfg.borderAccent}`}>
                  <p className="text-[13px] text-neutral-300 leading-relaxed">
                    {data.overlapSummary}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-4 mt-6 text-xs text-neutral-600">
                <span>{t("activity.steps", { count: data.negotiationSteps })}</span>
                {data.matchedAt && (
                  <>
                    <span>&middot;</span>
                    <span>matched {new Date(data.matchedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-[#1a1a1a] px-8 py-3 flex items-center justify-center gap-6 relative">
              <button
                onClick={handleLike}
                className="flex items-center gap-2 text-neutral-500 hover:text-rose-400 transition-all active:scale-95"
              >
                <span className={likeAnimating ? "animate-reaction-pop" : ""}>
                  <HeartIcon />
                </span>
                {data.likes > 0 && (
                  <span className={`text-sm tabular-nums ${likeAnimating ? "animate-count-bump" : ""}`}>
                    {data.likes}
                  </span>
                )}
              </button>

              <div className="w-px h-4 bg-[#1a1a1a]" />

              <span className="flex items-center gap-2 text-neutral-500">
                <CommentIcon />
                {data.commentCount > 0 && (
                  <span className="text-sm tabular-nums">{data.commentCount}</span>
                )}
              </span>

              <div className="w-px h-4 bg-[#1a1a1a]" />

              <button
                onClick={handleShare}
                className="flex items-center gap-2 text-neutral-500 hover:text-white transition-all active:scale-95"
              >
                <ShareIcon />
                <span className="text-sm">{t("common.share")}</span>
              </button>

              {shareToast && (
                <div className="absolute -top-11 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg shadow-black/20 animate-card-float-in whitespace-nowrap">
                  {t("common.linkCopied")}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={scrollToDetails}
          className="mt-10 flex flex-col items-center gap-2 text-neutral-600 hover:text-neutral-400 transition-colors animate-detail-in animate-detail-in-d3"
        >
          <span className="text-xs">{t("activity.viewDialogue")}</span>
          <ChevronDownIcon className="animate-bounce" />
        </button>
      </section>

      <section ref={detailsRef} className="max-w-2xl mx-auto px-4 md:px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-detail-in animate-detail-in-d1">
          {data.participants.map((p, i) => (
            <div key={i} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-full ring-1 ${cfg.ringClass} bg-[#111] flex items-center justify-center text-xs font-mono text-neutral-300`}>
                  {getInitials(p.displayName)}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{p.displayName}</p>
                  {p.location && (
                    <p className="text-[10px] text-neutral-600">{p.location}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">{p.currentWork}</p>
              {p.expertise.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.expertise.slice(0, 4).map((e) => (
                    <span
                      key={e}
                      className="text-[10px] px-2 py-0.5 bg-[#111] border border-[#1a1a1a] rounded-full text-neutral-500"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              )}
              {p.networkingGoal && (
                <p className="text-[10px] text-neutral-600 mt-3">
                  {t("profile.goalsLabel")} {p.networkingGoal}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 animate-detail-in animate-detail-in-d2">
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className="w-full flex items-center justify-between px-5 py-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl hover:border-[#2a2a2a] transition-all"
          >
            <span className="text-sm text-neutral-300">
              {t("activity.viewAgentDialogue")}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-600">
                {t("activity.steps", { count: data.negotiationSteps })}
              </span>
              <ChevronDownIcon
                className={`text-neutral-500 transition-transform duration-200 ${showTimeline ? "rotate-180" : ""}`}
              />
            </div>
          </button>

          {showTimeline && (
            <div className="mt-4 animate-detail-in" style={{ animationDelay: "0s", opacity: 1 }}>
              <NegotiationTimeline logs={data.negotiationLog} />
            </div>
          )}
        </div>

        <div className="mt-16 text-center animate-detail-in animate-detail-in-d3">
          <p className="text-neutral-600 text-sm mb-6">
            {t("activity.title")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/feed"
              className="px-8 py-3 bg-white text-black rounded-full text-sm font-medium hover:bg-neutral-200 transition-all active:scale-[0.98]"
            >
              {t("nav.feed")}
            </Link>
            <Link
              href="/onboarding"
              className="px-8 py-3 border border-[#2a2a2a] text-neutral-400 rounded-full text-sm hover:text-white hover:border-[#3a3a3a] transition-all"
            >
              {t("common.getStarted")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Nav() {
  const t = useTranslations();
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-xl bg-[#050505]/80 border-b border-[#1a1a1a]">
      <div className="flex items-center justify-between px-6 h-16 max-w-5xl mx-auto">
        <Link href="/" className="text-lg font-semibold text-white">
          {t("common.gennety")}
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/feed"
            className="text-sm text-neutral-400 hover:text-white transition-colors"
          >
            {t("nav.feed")}
          </Link>
          <Link
            href="/onboarding"
            className="text-sm text-neutral-400 hover:text-white transition-colors"
          >
            {t("common.getStarted")} &rarr;
          </Link>
        </div>
      </div>
    </nav>
  );
}
