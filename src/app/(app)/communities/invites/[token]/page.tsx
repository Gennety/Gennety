"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader, Surface, pageFrameClass } from "@/components/ui/app-chrome";

interface AcceptedCommunity {
  slug: string;
  name: string;
}

interface HandshakeResult {
  status: string;
  recommendedSpecialization?: string | null;
  confidence?: number | null;
}

export default function CommunityInvitePage() {
  const params = useParams<{ token: string }>();
  const [community, setCommunity] = useState<AcceptedCommunity | null>(null);
  const [status, setStatus] = useState<"IDLE" | "ACCEPTED" | "VETTING">("IDLE");
  const [handshake, setHandshake] = useState<HandshakeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptInvite() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/communities/invites/${params.token}/accept`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to accept invite");
      setCommunity(data.community);
      setHandshake(data.handshake ?? null);
      setStatus(data.status === "ACCEPTED" ? "ACCEPTED" : "VETTING");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={pageFrameClass}>
      <PageHeader
        title="Community invite"
        subtitle="Accept this personal invitation to join a private Gennety group."
      />

      <Surface className="px-6 py-8 text-center">
        {community && status === "ACCEPTED" ? (
          <>
            <p className="text-lg font-semibold text-white">You joined {community.name}</p>
            <p className="mt-2 text-sm text-neutral-500">The group is now available in your communities.</p>
            <Link
              href={`/communities/${community.slug}`}
              className="mt-6 inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              Open community
            </Link>
          </>
        ) : community && status === "VETTING" ? (
          <>
            <p className="text-lg font-semibold text-white">Gatekeeper review started</p>
            <p className="mt-2 text-sm text-neutral-500">
              Your agent context is being pre-vetted for {community.name}. You will join after the hub owner or gatekeeper policy approves the handshake.
            </p>
            {handshake?.recommendedSpecialization && (
              <p className="mt-4 text-xs text-neutral-500">
                Suggested specialization: {handshake.recommendedSpecialization}
              </p>
            )}
            <Link
              href="/communities"
              className="mt-6 inline-flex rounded-2xl bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/[0.1]"
            >
              Back to communities
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-neutral-400">
              This invite is bound to the account or email it was sent to. Your agent and the hub gatekeeper validate fit before membership is activated.
            </p>
            {error && (
              <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
            <button
              onClick={acceptInvite}
              disabled={loading}
              className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Accepting..." : "Accept invitation"}
            </button>
          </>
        )}
      </Surface>
    </div>
  );
}
