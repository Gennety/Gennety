"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  COMMUNITY_CATEGORY_LABELS,
  COMMUNITY_SPECIALIZATIONS_BY_CATEGORY,
  COMMUNITY_SPECIALIZATION_LABELS,
  type CommunityCategory,
  type CommunitySpecialization,
  type CommunityVisibility,
} from "@/types/community";
import {
  PageHeader,
  Surface,
  pageFrameClass,
} from "@/components/ui/app-chrome";

interface CommunitySettings {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: CommunityVisibility;
  profileVisibility: "VISIBLE" | "HIDDEN";
  category: CommunityCategory | null;
  specialization: CommunitySpecialization | null;
  viewer: {
    canManage: boolean;
    showOnProfile: boolean;
  };
}

const CATEGORIES = Object.keys(COMMUNITY_CATEGORY_LABELS) as CommunityCategory[];

export default function CommunitySettingsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;
  const [community, setCommunity] = useState<CommunitySettings | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<CommunityVisibility>("PRIVATE");
  const [profileVisible, setProfileVisible] = useState(true);
  const [showOnProfile, setShowOnProfile] = useState(true);
  const [category, setCategory] = useState<CommunityCategory>("TECHNOLOGY");
  const [specialization, setSpecialization] = useState<CommunitySpecialization>("AI_DEVELOPMENT");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/communities/${slug}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Failed to load community");
        const next = data.community as CommunitySettings;
        if (cancelled) return;

        if (!next.viewer.canManage) {
          setError("Only community owners and admins can open settings");
          setCommunity(null);
          return;
        }

        const nextCategory = next.category ?? "TECHNOLOGY";
        const nextSpecialization =
          next.specialization ?? COMMUNITY_SPECIALIZATIONS_BY_CATEGORY[nextCategory][0]!;

        setCommunity(next);
        setName(next.name);
        setDescription(next.description ?? "");
        setVisibility(next.visibility);
        setProfileVisible(next.profileVisibility === "VISIBLE");
        setShowOnProfile(next.viewer.showOnProfile);
        setCategory(nextCategory);
        setSpecialization(nextSpecialization);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load community");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!community) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/communities/${community.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          visibility,
          profileVisibility: profileVisible ? "VISIBLE" : "HIDDEN",
          category: visibility === "PUBLIC" ? category : category || null,
          specialization: visibility === "PUBLIC" ? specialization : specialization || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to save community");

      const visibilityRes = await fetch(`/api/communities/${community.id}/profile-visibility`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ showOnProfile }),
      });
      const visibilityData = await visibilityRes.json().catch(() => null);
      if (!visibilityRes.ok) {
        throw new Error(visibilityData?.error ?? "Failed to save profile visibility");
      }

      setCommunity(visibilityData.community ?? data.community);
      setMessage("Community updated");
      if (data.community.slug !== slug) {
        router.replace(`/communities/${data.community.slug}/settings`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save community");
    } finally {
      setSaving(false);
    }
  }

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!community) return;
    setInviting(true);
    setError(null);
    setMessage(null);
    setInviteUrl(null);

    try {
      const res = await fetch(`/api/communities/${community.id}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteeEmail }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to create invite");
      setInviteUrl(data.inviteUrl);
      setInviteeEmail("");
      setMessage(data.emailDelivery?.sent ? "Invite sent" : "Invite link created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invite");
    } finally {
      setInviting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-white" />
      </div>
    );
  }

  if (error && !community) {
    return (
      <div className={pageFrameClass}>
        <Surface className="px-8 py-8 text-center">
          <p className="text-sm text-neutral-400">{error}</p>
          <Link href="/communities" className="mt-4 inline-flex text-sm text-white hover:text-neutral-300">
            Back to communities
          </Link>
        </Surface>
      </div>
    );
  }

  if (!community) return null;

  return (
    <div className={pageFrameClass}>
      <PageHeader
        title="Community settings"
        subtitle={community.name}
        action={
          <Link href={`/communities/${community.slug}`} className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1]">
            Open
          </Link>
        }
      />

      <Surface className="mb-6 px-5 py-5">
        <form onSubmit={save} className="space-y-5">
          <Field label="Name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/[0.18]"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-neutral-600 focus:border-white/[0.18]"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Visibility">
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as CommunityVisibility)}
                className="w-full rounded-2xl border border-white/[0.08] bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-white/[0.18]"
              >
                <option value="PUBLIC">Public: catalog and open link</option>
                <option value="PRIVATE">Private: direct invite only</option>
              </select>
            </Field>

            <Field label="Profile visibility">
              <select
                value={profileVisible ? "VISIBLE" : "HIDDEN"}
                onChange={(event) => setProfileVisible(event.target.value === "VISIBLE")}
                className="w-full rounded-2xl border border-white/[0.08] bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-white/[0.18]"
              >
                <option value="VISIBLE">Show this group in owner profile</option>
                <option value="HIDDEN">Hide this group from owner profile</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <select
                value={category}
                onChange={(event) => {
                  const next = event.target.value as CommunityCategory;
                  setCategory(next);
                  setSpecialization(COMMUNITY_SPECIALIZATIONS_BY_CATEGORY[next][0]!);
                }}
                className="w-full rounded-2xl border border-white/[0.08] bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-white/[0.18]"
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {COMMUNITY_CATEGORY_LABELS[item]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Specialization">
              <select
                value={specialization}
                onChange={(event) => setSpecialization(event.target.value as CommunitySpecialization)}
                className="w-full rounded-2xl border border-white/[0.08] bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-white/[0.18]"
              >
                {COMMUNITY_SPECIALIZATIONS_BY_CATEGORY[category].map((item) => (
                  <option key={item} value={item}>
                    {COMMUNITY_SPECIALIZATION_LABELS[item]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-white">Show my membership in profile</span>
              <span className="text-xs text-neutral-500">This controls your own membership card.</span>
            </span>
            <input
              type="checkbox"
              checked={showOnProfile}
              onChange={(event) => setShowOnProfile(event.target.checked)}
              className="h-4 w-4"
            />
          </label>

          {message && <div className="rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-200">{message}</div>}
          {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </form>
      </Surface>

      <Surface className="px-5 py-5">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
          Invite people
        </h2>
        <form onSubmit={createInvite} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={inviteeEmail}
            onChange={(event) => setInviteeEmail(event.target.value)}
            type="email"
            required
            placeholder="person@example.com"
            className="min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/[0.18]"
          />
          <button
            type="submit"
            disabled={inviting}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inviting ? "Inviting..." : "Create invite"}
          </button>
        </form>

        {inviteUrl && (
          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-neutral-500">Invite link</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                readOnly
                value={inviteUrl}
                className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-neutral-300"
              />
              <button
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
                className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1]"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}
