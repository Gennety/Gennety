"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  PageHeader,
  SoftSurface,
  Surface,
  cx,
  getMatteDotClass,
  getMattePillClass,
  pageFrameClass,
  primaryButtonClass,
  tabActiveClass,
  tabBaseClass,
  tabIdleClass,
} from "@/components/ui/app-chrome";

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
    <div className={pageFrameClass}>
      <PageHeader title={t("matches.title")} />

      <FreshnessIndicator state={freshnessState} />

      <div className="mb-8 flex flex-wrap gap-2">
        <button
          onClick={() => setTab("active")}
          className={cx(tabBaseClass, tab === "active" ? tabActiveClass : tabIdleClass)}
        >
          {t("matches.active", { count: activeMatches.length })}
        </button>
        <button
          onClick={() => setTab("sent")}
          className={cx(tabBaseClass, tab === "sent" ? tabActiveClass : tabIdleClass)}
        >
          {t("matches.sent", { count: sentMatches.length })}
        </button>
        <button
          onClick={() => setTab("dormant")}
          className={cx(tabBaseClass, tab === "dormant" ? tabActiveClass : tabIdleClass)}
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
        <Surface
          key={match.matchId}
          className="mb-4 px-5 py-5"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <span className="text-lg font-semibold text-white">
                {match.otherPerson.name ?? "Unknown"}
              </span>
              {match.otherPerson.location ? (
                <p className="mt-1 text-xs text-neutral-500">{match.otherPerson.location}</p>
              ) : null}
            </div>
            <StatusBadge
              status={match.status}
              sentWaiting={
                match.status === "PROPOSED" &&
                match.initiatedByMe &&
                !match.confirmedByOther
              }
            />
          </div>

          <SoftSurface className="px-4 py-4">
            <p className="text-sm leading-6 text-neutral-200">
              {match.framingForMe}
            </p>
          </SoftSurface>

          <div className="mt-4 space-y-3">
            {match.otherPerson.currentWork && (
              <p className="text-xs text-neutral-400">
                <strong className="text-neutral-300">{t("matches.workingOn")}</strong>{" "}
                {match.otherPerson.currentWork}
              </p>
            )}

            {match.otherPerson.expertise &&
              match.otherPerson.expertise.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {match.otherPerson.expertise.map((e) => (
                    <span
                      key={e}
                      className="rounded-full bg-white/[0.03] px-3 py-1.5 text-[11px] text-neutral-400 ring-1 ring-inset ring-white/[0.05]"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/[0.05] pt-4">
            {match.status === "MATCHED" && match.chatId && (
              <Link
                href={`/chat/${match.matchId}`}
                className={primaryButtonClass}
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
                  className={primaryButtonClass}
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
        </Surface>
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
      className={`mb-8 flex items-center gap-2.5 rounded-[1.25rem] px-4 py-3 ring-1 ring-inset ${config.bg}`}
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
        text: "text-sky-200",
        dot: "info" as const,
      }
    : status === "MATCHED"
    ? {
        text: "text-emerald-200",
        dot: "success" as const,
      }
    : status === "PROPOSED"
    ? {
        text: "text-amber-200",
        dot: "gold" as const,
      }
    : {
        text: "text-neutral-300",
        dot: "neutral" as const,
      };

  const label = sentWaiting ? t("sent") : t(status.toLowerCase());

  return (
    <span className={getMattePillClass("neutral", styles.text)}>
      <span className={getMatteDotClass(styles.dot)} />
      {label}
    </span>
  );
}
