"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface MatchItem {
  matchId: string;
  status: string;
  overlapSummary: string;
  framingForMe: string;
  confirmedByMe: boolean;
  confirmedByOther: boolean;
  initiatedByMe: boolean;
  otherPerson: {
    name: string | null;
    currentWork: string | null;
    expertise: string[] | null;
    location: string | null;
  };
  chatId: string | null;
  proposedAt: string | null;
  matchedAt: string | null;
}

export default function MatchesPage() {
  const { status } = useSession();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [freshnessState, setFreshnessState] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "sent" | "dormant">("active");
  const [loading, setLoading] = useState(true);
  const t = useTranslations();

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/matches")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.matches && Array.isArray(data.matches)) {
          setMatches(data.matches);
          setFreshnessState(data.freshnessState ?? null);
        } else if (Array.isArray(data)) {
          // Backward compat with old array response
          setMatches(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [status]);

  if (status === "loading" || loading) {
    return (
      <div className="p-12 text-center text-neutral-500 text-sm">
        {t("matches.loadingMatches")}
      </div>
    );
  }

  // "Sent" — proposals my agent initiated that the other side hasn't accepted
  // yet (waiting on the recipient). Once they accept, it flips to "Active".
  const sentMatches = matches.filter(
    (m) => m.status === "PROPOSED" && m.initiatedByMe && !m.confirmedByOther
  );
  // "Active" — confirmed matches, plus incoming proposals I need to review.
  const activeMatches = matches.filter(
    (m) =>
      m.status === "MATCHED" ||
      (m.status === "PROPOSED" && !(m.initiatedByMe && !m.confirmedByOther))
  );
  const dormantMatches = matches.filter((m) => m.status === "DORMANT");
  const displayed =
    tab === "active"
      ? activeMatches
      : tab === "sent"
      ? sentMatches
      : dormantMatches;

  return (
    <div className="px-6 py-10">
      <h1 className="text-2xl font-semibold text-white mb-6">{t("matches.title")}</h1>

      <FreshnessIndicator state={freshnessState} />

      <div className="flex gap-0 mb-6 border-b border-neutral-800">
        <button
          onClick={() => setTab("active")}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "active"
              ? "text-white border-white"
              : "text-neutral-500 border-transparent hover:text-neutral-300"
          }`}
        >
          {t("matches.active", { count: activeMatches.length })}
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "sent"
              ? "text-white border-white"
              : "text-neutral-500 border-transparent hover:text-neutral-300"
          }`}
        >
          {t("matches.sent", { count: sentMatches.length })}
        </button>
        <button
          onClick={() => setTab("dormant")}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "dormant"
              ? "text-white border-white"
              : "text-neutral-500 border-transparent hover:text-neutral-300"
          }`}
        >
          {t("matches.dormant", { count: dormantMatches.length })}
        </button>
      </div>

      {displayed.length === 0 && (
        <div className="text-center pt-12 pb-8">
          {tab === "active" ? (
            <>
              <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-4">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="text-neutral-500"
                >
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                  <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-white font-medium text-sm mb-1">
                {t("matches.agentSearching")}
              </p>
              <p className="text-neutral-500 text-xs leading-relaxed max-w-xs mx-auto mb-5">
                {t("matches.agentSearchingDesc")}
              </p>
              <div className="flex flex-col items-center gap-2">
                <Link
                  href="/activity"
                  className="text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  {t("matches.seeNetwork")} &rarr;
                </Link>
              </div>
            </>
          ) : tab === "sent" ? (
            <p className="text-neutral-500 text-sm">
              {t("matches.noSent")}
            </p>
          ) : (
            <p className="text-neutral-500 text-sm">
              {t("matches.noDormant")}
            </p>
          )}
        </div>
      )}

      {displayed.map((match) => (
        <div
          key={match.matchId}
          className="border border-neutral-800 rounded-xl p-6 mb-4 bg-neutral-900/50"
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-lg font-semibold text-white">
              {match.otherPerson.name ?? "Unknown"}
            </span>
            <StatusBadge
              status={match.status}
              sentWaiting={
                match.status === "PROPOSED" &&
                match.initiatedByMe &&
                !match.confirmedByOther
              }
            />
          </div>

          <p className="text-sm leading-relaxed text-neutral-300 mb-3 p-3 bg-neutral-800/50 rounded-lg border-l-2 border-neutral-600">
            {match.framingForMe}
          </p>

          {match.otherPerson.currentWork && (
            <p className="text-xs text-neutral-400 mb-2">
              <strong className="text-neutral-300">{t("matches.workingOn")}</strong>{" "}
              {match.otherPerson.currentWork}
            </p>
          )}

          {match.otherPerson.expertise &&
            match.otherPerson.expertise.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {match.otherPerson.expertise.map((e) => (
                  <span
                    key={e}
                    className="text-[11px] px-2 py-0.5 bg-neutral-800 rounded-full text-neutral-400"
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}

          <div className="flex gap-3 items-center">
            {match.status === "MATCHED" && match.chatId && (
              <Link
                href={`/chat/${match.matchId}`}
                className="inline-block px-5 py-2.5 text-sm font-semibold bg-white text-black rounded-lg hover:bg-neutral-200 transition-colors"
              >
                {t("matches.openChat")}
              </Link>
            )}
            {match.status === "PROPOSED" &&
              match.initiatedByMe &&
              !match.confirmedByOther && (
                <span className="text-xs text-neutral-400 italic">
                  {t("matches.awaitingResponse")}
                </span>
              )}
            {match.status === "PROPOSED" &&
              !match.confirmedByMe &&
              !(match.initiatedByMe && !match.confirmedByOther) && (
                <Link
                  href="/notify"
                  className="inline-block px-5 py-2.5 text-sm font-semibold bg-white text-black rounded-lg hover:bg-neutral-200 transition-colors"
                >
                  {t("matches.reviewProposal")}
                </Link>
              )}
            {match.status === "DORMANT" && (
              <span className="text-xs text-neutral-500 italic">
                {t("matches.revisitMatch")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FreshnessIndicator({ state }: { state: string | null }) {
  const t = useTranslations("matches");

  if (!state || state === "ACTIVE") return null;

  const config = {
    AGING: {
      dot: "bg-amber-400",
      bg: "bg-amber-950/30 border-amber-800/40",
      text: "text-amber-200",
      message: t("freshnessAging"),
    },
    STALE: {
      dot: "bg-red-400",
      bg: "bg-red-950/30 border-red-800/40",
      text: "text-red-200",
      message: t("freshnessStale"),
    },
    INACTIVE: {
      dot: "bg-neutral-500",
      bg: "bg-neutral-800/50 border-neutral-700",
      text: "text-neutral-300",
      message: t("freshnessInactive"),
    },
  }[state];

  if (!config) return null;

  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border mb-6 ${config.bg}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${config.dot}`} />
      <span className={`text-sm ${config.text}`}>{config.message}</span>
    </div>
  );
}

function StatusBadge({
  status,
  sentWaiting,
}: {
  status: string;
  sentWaiting?: boolean;
}) {
  const t = useTranslations("status");

  const styles = sentWaiting
    ? {
        text: "text-sky-400",
        dot: "bg-sky-400",
        glow: "shadow-[0_0_8px_rgba(56,189,248,0.5)]",
      }
    : status === "MATCHED"
    ? {
        text: "text-emerald-400",
        dot: "bg-emerald-400",
        glow: "shadow-[0_0_8px_rgba(52,211,153,0.6)]",
      }
    : status === "PROPOSED"
    ? {
        text: "text-amber-400",
        dot: "bg-amber-400",
        glow: "shadow-[0_0_8px_rgba(251,191,36,0.5)]",
      }
    : {
        text: "text-neutral-500",
        dot: "bg-neutral-500",
        glow: "",
      };

  const label = sentWaiting ? t("sent") : t(status.toLowerCase());

  return (
    <span className={`inline-flex items-center gap-2 text-[11px] font-medium tracking-wide ${styles.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot} ${styles.glow}`} />
      {label}
    </span>
  );
}
