"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_SPECIALIZATION_LABELS,
} from "@/types/community";
import {
  PageHeader,
  Surface,
  getMattePillClass,
  pageFrameClass,
} from "@/components/ui/app-chrome";

interface CommunityDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  profileVisibility: "VISIBLE" | "HIDDEN";
  category: keyof typeof COMMUNITY_CATEGORY_LABELS | null;
  specialization: keyof typeof COMMUNITY_SPECIALIZATION_LABELS | null;
  memberCount: number;
  owner: { id: string; name: string | null; image: string | null };
  members: Array<{
    ownerId: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
    name: string | null;
    image: string | null;
  }>;
  viewer: {
    isMember: boolean;
    canManage: boolean;
    isOwner: boolean;
  };
}

export default function CommunityDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${slug}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to load community");
      setCommunity(data.community);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load community");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function join() {
    if (!community) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${community.id}/join`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to join community");
      setCommunity(data.community);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join community");
    } finally {
      setActionLoading(false);
    }
  }

  async function leave() {
    if (!community) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${community.id}/leave`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to leave community");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to leave community");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-white" />
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className={pageFrameClass}>
        <Surface className="px-8 py-8 text-center">
          <p className="text-sm text-neutral-400">{error ?? "Community not found"}</p>
          <Link href="/communities" className="mt-4 inline-flex text-sm text-white hover:text-neutral-300">
            Back to communities
          </Link>
        </Surface>
      </div>
    );
  }

  const specialization = community.specialization
    ? COMMUNITY_SPECIALIZATION_LABELS[community.specialization]
    : community.category
    ? COMMUNITY_CATEGORY_LABELS[community.category]
    : "Custom community";

  return (
    <div className={pageFrameClass}>
      <PageHeader
        title={community.name}
        subtitle={specialization}
        action={
          community.viewer.canManage ? (
            <Link href={`/communities/${community.slug}/settings`} className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1]">
              Settings
            </Link>
          ) : null
        }
      />

      <Surface className="mb-6 px-5 py-5">
        <div className="mb-5 flex flex-wrap gap-2">
          <span className={getMattePillClass(community.visibility === "PUBLIC" ? "neutral" : "muted", "text-xs")}>
            {community.visibility === "PUBLIC" ? "Public" : "Private"}
          </span>
          <span className={getMattePillClass("muted", "text-xs")}>
            {community.memberCount} members
          </span>
          <span className={getMattePillClass("muted", "text-xs")}>
            {community.visibility === "PUBLIC" ? "Open link" : "Invite only"}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-neutral-300">
          {community.description ?? "No description yet."}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
          <p className="text-xs text-neutral-500">
            Owned by {community.owner.name ?? "Gennety member"}
          </p>
          {community.viewer.isMember ? (
            community.viewer.isOwner ? (
              <span className="text-xs text-neutral-500">You own this community</span>
            ) : (
              <button
                onClick={leave}
                disabled={actionLoading}
                className="rounded-xl bg-white/[0.04] px-4 py-2 text-sm font-medium text-neutral-300 ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
              >
                {actionLoading ? "Leaving..." : "Leave"}
              </button>
            )
          ) : (
            <button
              onClick={join}
              disabled={community.visibility !== "PUBLIC" || actionLoading}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {actionLoading ? "Joining..." : community.visibility === "PUBLIC" ? "Join community" : "Invite only"}
            </button>
          )}
        </div>
      </Surface>

      <Surface className="px-5 py-5">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Members
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {community.members.map((member) => (
            <Link key={member.ownerId} href={`/u/${member.ownerId}`} className="flex items-center gap-3 rounded-2xl bg-white/[0.025] px-4 py-3 ring-1 ring-inset ring-white/[0.05] transition-colors hover:bg-white/[0.04]">
              {member.image ? (
                <img src={member.image} alt={member.name ?? "Member"} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-400">
                  {member.name?.charAt(0).toUpperCase() ?? "?"}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{member.name ?? "Gennety member"}</p>
                <p className="text-xs text-neutral-600">{member.role.toLowerCase()}</p>
              </div>
            </Link>
          ))}
        </div>
      </Surface>
    </div>
  );
}
