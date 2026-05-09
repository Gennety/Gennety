"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_SPECIALIZATION_LABELS,
  type CommunityCategory,
} from "@/types/community";
import {
  PageHeader,
  Surface,
  getMattePillClass,
  pageFrameClass,
} from "@/components/ui/app-chrome";

interface CommunitySummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  category: keyof typeof COMMUNITY_CATEGORY_LABELS | null;
  specialization: keyof typeof COMMUNITY_SPECIALIZATION_LABELS | null;
  memberCount: number;
  viewer: {
    isMember: boolean;
    canManage: boolean;
  };
}

const CATEGORIES: Array<"ALL" | CommunityCategory> = [
  "ALL",
  "INVESTMENTS",
  "SCIENCE",
  "TECHNOLOGY",
];

export default function CommunitiesPage() {
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | CommunityCategory>("ALL");
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [myCommunities, setMyCommunities] = useState<CommunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const query = selectedCategory === "ALL" ? "" : `?category=${selectedCategory}`;

      try {
        const [publicRes, mineRes] = await Promise.all([
          fetch(`/api/communities${query}`),
          fetch("/api/communities/me"),
        ]);
        const publicData = await publicRes.json().catch(() => null);
        const mineData = await mineRes.json().catch(() => null);

        if (!publicRes.ok) throw new Error(publicData?.error ?? "Failed to load communities");
        if (!mineRes.ok) throw new Error(mineData?.error ?? "Failed to load your communities");

        if (!cancelled) {
          setCommunities(publicData.communities ?? []);
          setMyCommunities(mineData.communities ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load communities");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory]);

  async function joinCommunity(id: string) {
    setJoiningId(id);
    try {
      const res = await fetch(`/api/communities/${id}/join`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to join community");

      setCommunities((items) =>
        items.map((item) => (item.id === id ? data.community : item))
      );
      setMyCommunities((items) => {
        if (items.some((item) => item.id === id)) return items;
        return [data.community, ...items];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join community");
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div className={pageFrameClass}>
      <PageHeader
        title="Communities"
        subtitle="Create focused professional groups, invite real people, and discover open hubs."
        action={
          <Link href="/communities/new" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90">
            New group
          </Link>
        }
      />

      {myCommunities.length > 0 && (
        <Surface className="mb-6 px-5 py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Your groups
            </h2>
            <span className="text-xs text-neutral-600">{myCommunities.length}/3 owned or joined</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {myCommunities.slice(0, 4).map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                compact
                joining={joiningId === community.id}
                onJoin={joinCommunity}
              />
            ))}
          </div>
        </Surface>
      )}

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${
              selectedCategory === category
                ? "bg-white text-black"
                : "bg-white/[0.04] text-neutral-400 ring-1 ring-inset ring-white/[0.08] hover:text-white"
            }`}
          >
            {category === "ALL" ? "All" : COMMUNITY_CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-white" />
        </div>
      ) : communities.length === 0 ? (
        <Surface className="px-8 py-10 text-center">
          <p className="text-sm text-neutral-400">No public communities in this category yet.</p>
          <p className="mt-2 text-xs text-neutral-600">Create the first one and make it visible in the catalog.</p>
        </Surface>
      ) : (
        <div className="grid gap-4">
          {communities.map((community) => (
            <CommunityCard
              key={community.id}
              community={community}
              joining={joiningId === community.id}
              onJoin={joinCommunity}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommunityCard({
  community,
  compact = false,
  joining,
  onJoin,
}: {
  community: CommunitySummary;
  compact?: boolean;
  joining: boolean;
  onJoin: (id: string) => void;
}) {
  const specialization = community.specialization
    ? COMMUNITY_SPECIALIZATION_LABELS[community.specialization]
    : community.category
    ? COMMUNITY_CATEGORY_LABELS[community.category]
    : "Custom community";

  return (
    <Surface className={compact ? "px-4 py-4" : "px-5 py-5"}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/communities/${community.slug}`} className="text-lg font-semibold text-white hover:text-neutral-200">
            {community.name}
          </Link>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={getMattePillClass("muted", "text-xs")}>{specialization}</span>
            <span className={getMattePillClass(community.visibility === "PUBLIC" ? "neutral" : "muted", "text-xs")}>
              {community.visibility === "PUBLIC" ? "Public" : "Private"}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs text-neutral-500">{community.memberCount} members</span>
      </div>

      {!compact && community.description && (
        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-neutral-400">
          {community.description}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-600">
          {community.visibility === "PUBLIC" ? "Anyone can join from this page." : "Entry is only by direct invitation."}
        </p>
        {community.viewer.isMember ? (
          <Link href={`/communities/${community.slug}`} className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1]">
            Open
          </Link>
        ) : (
          <button
            onClick={() => onJoin(community.id)}
            disabled={community.visibility !== "PUBLIC" || joining}
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {joining ? "Joining..." : community.visibility === "PUBLIC" ? "Join" : "Invite only"}
          </button>
        )}
      </div>
    </Surface>
  );
}
