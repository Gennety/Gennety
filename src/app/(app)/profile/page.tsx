"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_SPECIALIZATION_LABELS,
} from "@/types/community";
import {
  getMatteDotClass,
  getMattePillClass,
  MetricCard,
  PageHeader,
  SoftSurface,
  Surface,
  pageFrameClass,
} from "@/components/ui/app-chrome";

interface ProfileData {
  name: string | null;
  networkingGoal: string | null;
  memberSince: string;
  context: {
    ownerName: string | null;
    ownerProfession: string | null;
    ownerDomain: string | null;
    ownerExperience: string | null;
    ownerGoals: string | null;
    ownerLocation: string | null;
    currentWork: string;
    expertise: string[];
    lookingFor: string;
    notLookingFor: string | null;
    recentProblems: string | null;
    recentWins: string | null;
    location: string | null;
    networkingGoal: string;
    collaborationStyle: string | null;
    communicationStyle: string | null;
    agentSpecialization: string | null;
    agentDomains: string[];
    freshnessState: string;
    lastUpdated: string;
    lastSignificantUpdate: string;
  } | null;
  reputation: {
    score: number;
    acceptanceRate: number;
    completedMatches: number;
    totalProposed: number;
    interactionCount: number;
  };
  agent: {
    displayName: string | null;
    isActive: boolean;
    lastActiveAt: string | null;
  };
  communities: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    visibility: "PUBLIC" | "PRIVATE";
    category: keyof typeof COMMUNITY_CATEGORY_LABELS | null;
    specialization: keyof typeof COMMUNITY_SPECIALIZATION_LABELS | null;
    memberCount: number;
    viewer: {
      canManage: boolean;
      showOnProfile: boolean;
    };
  }>;
}

export default function ProfilePage() {
  const t = useTranslations();
  const { status: sessionStatus } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    fetch("/api/profile")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error(data?.error ?? "Failed to load profile");
        }
        return data;
      })
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [sessionStatus]);

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="p-12 text-center">
        <div className="w-6 h-6 border-2 border-neutral-700 border-t-white rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="px-6 py-10">
        <p className="text-sm text-neutral-500">
          {error ?? "Could not load profile."}
        </p>
      </div>
    );
  }

  const ctx = profile.context;
  const rep = profile.reputation;

  return (
    <div className={pageFrameClass}>
      {/* Header */}
      <PageHeader
        title={ctx?.ownerName ?? profile.name ?? t("profile.title")}
        subtitle={
          [
            ctx?.ownerProfession,
            ctx?.ownerDomain,
            ctx?.location ?? ctx?.ownerLocation,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        action={<FreshnessBadge state={ctx?.freshnessState} />}
      />

      {/* No context yet */}
      {!ctx && (
        <Surface className="mb-6 px-8 py-8 text-center">
          <p className="text-sm text-neutral-400 mb-2">
            {t("profile.noContext")}
          </p>
          <p className="text-xs text-neutral-600">
            {t("profile.noContextDesc")}
          </p>
        </Surface>
      )}

      {ctx && (
        <>
          {/* What I'm working on */}
          <Section title={t("profile.currentWork")}>
            <p className="text-sm text-neutral-300 leading-relaxed">
              {ctx.currentWork}
            </p>
          </Section>

          {/* Expertise */}
          {ctx.expertise.length > 0 && (
            <Section title={t("profile.expertise")}>
              <div className="flex flex-wrap gap-2">
                {ctx.expertise.map((tag) => (
                  <span
                    key={tag}
                    className={getMattePillClass("muted", "text-xs")}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Looking for */}
          <Section title={t("profile.lookingFor")}>
            <p className="text-sm text-neutral-300 leading-relaxed">
              {ctx.lookingFor}
            </p>
            <GoalBadge goal={ctx.networkingGoal} />
          </Section>

          {/* Not looking for */}
          {ctx.notLookingFor && (
            <Section title={t("profile.notLookingFor")}>
              <p className="text-sm text-neutral-400 leading-relaxed">
                {ctx.notLookingFor}
              </p>
            </Section>
          )}

          {/* Current wins & problems */}
          {(ctx.recentWins || ctx.recentProblems) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {ctx.recentWins && (
                <SoftSurface className="px-4 py-4">
                  <h3 className="text-xs font-medium text-green-400/80 mb-2">
                    {t("profile.recentWins")}
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed">
                    {ctx.recentWins}
                  </p>
                </SoftSurface>
              )}
              {ctx.recentProblems && (
                <SoftSurface className="px-4 py-4">
                  <h3 className="text-xs font-medium text-amber-400/80 mb-2">
                    {t("profile.currentChallenges")}
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed">
                    {ctx.recentProblems}
                  </p>
                </SoftSurface>
              )}
            </div>
          )}

          {/* Work style */}
          {(ctx.collaborationStyle || ctx.communicationStyle) && (
            <Section title={t("profile.workStyle")}>
              {ctx.collaborationStyle && (
                <div className="mb-2">
                  <span className="text-xs text-neutral-500">
                    {t("profile.collaboration")}{" "}
                  </span>
                  <span className="text-sm text-neutral-300">
                    {ctx.collaborationStyle}
                  </span>
                </div>
              )}
              {ctx.communicationStyle && (
                <div>
                  <span className="text-xs text-neutral-500">
                    {t("profile.communication")}{" "}
                  </span>
                  <span className="text-sm text-neutral-300">
                    {ctx.communicationStyle}
                  </span>
                </div>
              )}
            </Section>
          )}

          {/* Experience & Goals */}
          {(ctx.ownerExperience || ctx.ownerGoals) && (
            <Section title={t("profile.background")}>
              {ctx.ownerExperience && (
                <div className="mb-2">
                  <span className="text-xs text-neutral-500">
                    {t("profile.experience")}{" "}
                  </span>
                  <span className="text-sm text-neutral-300">
                    {ctx.ownerExperience}
                  </span>
                </div>
              )}
              {ctx.ownerGoals && (
                <div>
                  <span className="text-xs text-neutral-500">{t("profile.goalsLabel")} </span>
                  <span className="text-sm text-neutral-300">
                    {ctx.ownerGoals}
                  </span>
                </div>
              )}
            </Section>
          )}

          {/* Agent specialization */}
          {(ctx.agentSpecialization || ctx.agentDomains.length > 0) && (
            <Section title={t("profile.agentFocus")}>
              {ctx.agentSpecialization && (
                <p className="text-sm text-neutral-300 mb-2">
                  {ctx.agentSpecialization}
                </p>
              )}
              {ctx.agentDomains.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {ctx.agentDomains.map((d) => (
                    <span
                      key={d}
                      className={getMattePillClass("muted", "px-2.5 py-1 text-xs")}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          )}
        </>
      )}

      <CommunitiesSection communities={profile.communities ?? []} />

      {/* Reputation & Stats */}
      <Surface className="mb-6 px-5 py-5">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
          {t("profile.reputation")}
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard value={rep.score.toFixed(0)} label={t("profile.score")} />
          <MetricCard
            value={
              rep.totalProposed > 0
                ? `${(rep.acceptanceRate * 100).toFixed(0)}%`
                : "\u2014"
            }
            label={t("profile.acceptance")}
          />
          <MetricCard value={rep.completedMatches} label={t("profile.matchesLabel")} />
        </div>
      </Surface>

      {/* Meta footer */}
      <div className="flex items-center justify-between text-xs text-neutral-600 pt-2">
        <span>
          {t("profile.memberSince", {
            date: new Date(profile.memberSince).toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            }),
          })}
        </span>
        {ctx && (
          <span>
            {t("profile.lastUpdated", {
              time: getTimeAgo(ctx.lastUpdated),
            })}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function CommunitiesSection({ communities }: { communities: ProfileData["communities"] }) {
  return (
    <Surface className="mb-6 px-5 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Communities
        </h2>
        <Link href="/communities/new" className="text-xs font-medium text-neutral-300 hover:text-white">
          Create
        </Link>
      </div>

      {communities.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.025] px-4 py-4 text-sm text-neutral-500 ring-1 ring-inset ring-white/[0.05]">
          No visible communities yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {communities.map((community) => (
            <Link
              key={community.id}
              href={`/communities/${community.slug}`}
              className="rounded-2xl bg-white/[0.025] p-4 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.04] hover:ring-white/[0.1]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{community.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {community.specialization
                      ? COMMUNITY_SPECIALIZATION_LABELS[community.specialization]
                      : community.category
                      ? COMMUNITY_CATEGORY_LABELS[community.category]
                      : "Custom community"}
                  </p>
                </div>
                <span className={getMattePillClass(community.visibility === "PUBLIC" ? "neutral" : "muted", "shrink-0 text-xs")}>
                  {community.visibility === "PUBLIC" ? "Open link" : "Invite only"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-neutral-600">
                <span>{community.memberCount} members</span>
                <span>{community.visibility === "PUBLIC" ? "Anyone can join" : "Direct invitation required"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Surface>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 rounded-[1.5rem] bg-neutral-950/55 p-5 ring-1 ring-inset ring-white/[0.06]">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
        {title}
      </h2>
      {children}
    </div>
  );
}

function FreshnessBadge({ state }: { state?: string }) {
  if (!state) return null;

  const config: Record<string, { color: string; label: string }> = {
    ACTIVE: { color: "text-green-400", label: "Active" },
    AGING: { color: "text-yellow-400", label: "Aging" },
    STALE: { color: "text-amber-400", label: "Stale" },
    INACTIVE: { color: "text-neutral-500", label: "Inactive" },
  };

  const c = config[state] ?? config.INACTIVE!;

  return (
    <span className={getMattePillClass("neutral", `text-xs ${c.color}`)}>
      <span
        className={getMatteDotClass(
          state === "ACTIVE"
            ? "success"
            : state === "AGING" || state === "STALE"
            ? "warning"
            : "muted"
        )}
      />
      {c.label}
    </span>
  );
}

function GoalBadge({ goal }: { goal: string }) {
  const labels: Record<string, string> = {
    partnership: "Looking for a partner",
    collaboration: "Open to collaborate",
    mentor: "Seeking a mentor",
    peer: "Looking for peers",
  };

  return (
    <span className={getMattePillClass("muted", "mt-2 inline-flex text-xs")}>
      {labels[goal] ?? goal}
    </span>
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
