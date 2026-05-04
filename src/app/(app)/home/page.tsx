"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  LiveStatusDot,
  MetricCard,
  PageHeader,
  SectionTitle,
  SoftSurface,
  Surface,
  cx,
  getMatteDotClass,
  getMattePillClass,
  pageFrameClass,
  subtleButtonSmallClass,
} from "@/components/ui/app-chrome";

interface Stats {
  totalMembers: number;
  actualMembers: number;
  totalMatches: number;
  matchesThisWeek: number;
  activeNegotiations: number;
  topExpertise: { tag: string; count: number }[];
  recentMatches: {
    id: string;
    overlapSummary: string;
    matchedAt: string | null;
    personA: { displayName: string; currentWork: string; networkingGoal: string };
    personB: { displayName: string; currentWork: string; networkingGoal: string };
  }[];
}

interface MyData {
  matchCount: number;
  pendingCount: number;
  freshnessState: string | null;
  agentActive: boolean;
  privacySync: {
    pending: boolean;
    searchPaused: boolean;
    changedAt: string;
    summary: string | null;
    action: string | null;
  } | null;
}

export default function HomePage() {
  const { data: session, status: sessionStatus } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [myData, setMyData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useTranslations();

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/matches").then((r) => r.json()),
    ])
      .then(([statsData, matchesData]) => {
        setStats(statsData);

        const matches = matchesData.matches ?? matchesData ?? [];
        const matched = Array.isArray(matches)
          ? matches.filter((m: { status: string }) => m.status === "MATCHED").length
          : 0;
        const pending = Array.isArray(matches)
          ? matches.filter(
              (m: { status: string; confirmedByMe: boolean }) =>
                m.status === "PROPOSED" && !m.confirmedByMe
            ).length
          : 0;

        setMyData({
          matchCount: matched,
          pendingCount: pending,
          freshnessState: matchesData.freshnessState ?? null,
          agentActive:
            !matchesData.freshnessState ||
            matchesData.freshnessState === "ACTIVE" ||
            matchesData.freshnessState === "AGING",
          privacySync: matchesData.privacySync ?? null,
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionStatus]);

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="p-12 text-center">
        <div className="w-6 h-6 border-2 border-neutral-700 border-t-white rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const userName = session?.user?.name?.split(" ")[0] || "there";

  return (
    <div className={pageFrameClass}>
      <PageHeader
        title={t("home.welcomeBack", { name: userName })}
        subtitle={t("home.networkStatus")}
      />

      {myData?.privacySync?.pending && (
        <div
          className={`mb-8 rounded-[1.5rem] p-4 ring-1 ring-inset ${
            myData.privacySync.searchPaused
              ? "bg-amber-950/18 ring-amber-500/[0.14]"
              : "bg-sky-950/18 ring-sky-500/[0.14]"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                className={`text-sm font-medium ${
                  myData.privacySync.searchPaused ? "text-amber-200" : "text-sky-200"
                }`}
              >
                {myData.privacySync.searchPaused
                  ? "Your privacy settings changed. Search is paused until your agent republishes a safe context."
                  : "Your agent is refreshing its published context for your latest privacy settings."}
              </p>
              {myData.privacySync.summary && (
                <p className="mt-2 text-xs leading-relaxed text-neutral-300">
                  {myData.privacySync.summary}
                </p>
              )}
            </div>
            <Link
              href="/settings"
              className={cx(subtleButtonSmallClass, "shrink-0")}
            >
              Review settings
            </Link>
          </div>
        </div>
      )}

      <Surface className="mb-8 px-5 py-5">
        <SectionTitle
          title={t("home.yourAgent")}
          action={
            <AgentStatusBadge
              active={myData?.agentActive ?? false}
              state={myData?.freshnessState}
            />
          }
        />

        <SoftSurface className="px-4 py-4">
          <div className="flex items-center gap-0 mb-5">
            <ProgressStep
              step={1}
              label={t("home.profileCreated")}
              done={true}
            />
            <ProgressConnector done={myData ? myData.matchCount > 0 || myData.pendingCount > 0 : false} />
            <ProgressStep
              step={2}
              label={t("home.agentSearching")}
              done={myData ? myData.matchCount > 0 || myData.pendingCount > 0 : false}
              active={myData ? myData.matchCount === 0 && myData.pendingCount === 0 : true}
            />
            <ProgressConnector done={(myData?.matchCount ?? 0) > 0} />
            <ProgressStep
              step={3}
              label={t("home.firstMatch")}
              done={(myData?.matchCount ?? 0) > 0}
              active={(myData?.pendingCount ?? 0) > 0 && (myData?.matchCount ?? 0) === 0}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-white/[0.05] pt-4 sm:grid-cols-2">
            <Link
              href="/matches"
              className="rounded-[1.1rem] bg-white/[0.03] px-4 py-4 transition hover:bg-white/[0.05]"
            >
              <div className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-white">
                {myData?.matchCount ?? 0}
              </div>
              <div className="mt-2 text-xs text-neutral-500">{t("home.activeMatches")}</div>
            </Link>
            <Link
              href="/notify"
              className="rounded-[1.1rem] bg-white/[0.03] px-4 py-4 transition hover:bg-white/[0.05]"
            >
              <div className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-white">
                {myData?.pendingCount ?? 0}
              </div>
              <div className="mt-2 text-xs text-neutral-500">{t("home.pendingProposals")}</div>
            </Link>
          </div>
        </SoftSurface>
      </Surface>

      <div className="mb-8 grid grid-cols-2 gap-3">
        <MetricCard
          value={stats?.totalMembers ?? 0}
          label={t("home.membersInNetwork")}
        />
        <MetricCard
          value={stats?.totalMatches ?? 0}
          label={t("home.matchesMade")}
        />
        <MetricCard
          value={stats?.matchesThisWeek ?? 0}
          label={t("home.matchesThisWeek")}
        />
        <MetricCard
          value={
            <div className="flex items-center gap-2">
              <span>{stats?.activeNegotiations ?? 0}</span>
              {(stats?.activeNegotiations ?? 0) > 0 ? (
                <span className="relative mt-1 h-1.5 w-1.5 rounded-full bg-white">
                  <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-75" />
                </span>
              ) : null}
            </div>
          }
          label={t("home.negotiationsNow")}
        />
      </div>

      {stats && stats.topExpertise.length > 0 && (
        <Surface className="mb-8 px-5 py-5">
          <SectionTitle
            eyebrow="Network"
            title={t("home.popularExpertise")}
            subtitle="Live patterns across the network right now."
          />
          <div className="flex flex-wrap gap-2">
            {stats.topExpertise.map(({ tag, count }) => (
              <span
                key={tag}
                className="rounded-full bg-white/[0.03] px-3 py-1.5 text-xs text-neutral-400 ring-1 ring-inset ring-white/[0.05]"
              >
                {tag}
                <span className="ml-1.5 text-neutral-600">{count}</span>
              </span>
            ))}
          </div>
        </Surface>
      )}

      <Surface className="px-5 py-5">
        <SectionTitle
          eyebrow="Recent activity"
          title={t("home.recentMatches")}
          action={
            <Link href="/activity" className={subtleButtonSmallClass}>
              {t("common.viewAll")}
            </Link>
          }
        />

        {stats && stats.recentMatches.length > 0 ? (
          <div className="space-y-3">
            {stats.recentMatches.map((match) => (
              <RecentMatchCard key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-neutral-600">
            {t("home.matchesWillAppear")}
          </p>
        )}
      </Surface>
    </div>
  );
}

/* ── Sub-components ── */

function AgentStatusBadge({
  active,
  state,
}: {
  active: boolean;
  state: string | null | undefined;
}) {
  const t = useTranslations();

  if (!active) {
    const message =
      state === "STALE"
        ? t("home.pausedUpdateContext")
        : state === "INACTIVE"
        ? t("home.sleeping")
        : t("freshness.inactive");
    return (
      <span className={getMattePillClass("warning", "text-xs")}>
        <span className={getMatteDotClass("warning")} />
        {message}
      </span>
    );
  }
  return (
    <span className={getMattePillClass("success", "text-xs")}>
      <LiveStatusDot tone="success" />
      {t("home.activeSearching")}
    </span>
  );
}

function ProgressStep({
  step,
  label,
  done,
  active,
}: {
  step: number;
  label: string;
  done: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <div
        className={`mb-1.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
          done
            ? "bg-emerald-950/70 text-emerald-200"
            : active
            ? "bg-white/[0.08] text-white"
            : "bg-white/[0.04] text-neutral-600"
        }`}
      >
        {done ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          step
        )}
      </div>
      <span
        className={`text-[11px] text-center leading-tight ${
          done ? "text-emerald-300/80" : active ? "text-neutral-300" : "text-neutral-600"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function ProgressConnector({ done }: { done: boolean }) {
  return (
    <div
      className={`mt-[-14px] h-px flex-1 ${
        done ? "bg-green-500/24" : "bg-white/[0.06]"
      }`}
    />
  );
}

function RecentMatchCard({
  match,
}: {
  match: Stats["recentMatches"][number];
}) {
  const timeAgo = match.matchedAt ? getTimeAgo(match.matchedAt) : "";

  return (
    <SoftSurface className="px-4 py-4">
      {/* Who matched */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[10px] font-mono text-neutral-400">
          {match.personA.displayName.slice(0, 1).toUpperCase()}
        </div>
        <span className="text-[10px] text-neutral-600">&harr;</span>
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[10px] font-mono text-neutral-400">
          {match.personB.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-neutral-300">
            {match.personA.displayName}
          </span>
          <span className="text-xs text-neutral-600"> &amp; </span>
          <span className="text-xs text-neutral-300">
            {match.personB.displayName}
          </span>
        </div>
        {timeAgo && (
          <span className="text-[10px] text-neutral-600 flex-shrink-0">
            {timeAgo}
          </span>
        )}
      </div>

      {/* Why they matched */}
      <p className="text-xs leading-relaxed text-neutral-400 line-clamp-2">
        &ldquo;{match.overlapSummary}&rdquo;
      </p>
    </SoftSurface>
  );
}

function getTimeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
