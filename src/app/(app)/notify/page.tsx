"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface MatchProposal {
  matchId: string;
  status: string;
  overlapSummary: string;
  framingForMe: string;
  confirmedByMe: boolean;
  otherPerson: {
    name: string | null;
    currentWork: string | null;
    expertise: string[] | null;
    location: string | null;
  };
  chatId: string | null;
}

export default function NotifyPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-neutral-500">Loading...</div>
      }
    >
      <NotifyContent />
    </Suspense>
  );
}

function NotifyContent() {
  const searchParams = useSearchParams();
  const ownerId = searchParams.get("ownerId");
  const [matches, setMatches] = useState<MatchProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerId) return;
    fetch(`/api/matches?ownerId=${ownerId}`)
      .then((r) => r.json())
      .then((data) => {
        setMatches(
          data.filter(
            (m: MatchProposal) => m.status === "PROPOSED" && !m.confirmedByMe
          )
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ownerId]);

  async function handleAction(matchId: string, action: "confirm" | "dormant") {
    setActionLoading(matchId);
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, ownerId, action }),
    });
    const result = await res.json();

    if (result.status === "MATCHED" && result.chatId) {
      window.location.href = `/chat/${result.chatId}?ownerId=${ownerId}`;
      return;
    }

    setMatches((prev) => prev.filter((m) => m.matchId !== matchId));
    setActionLoading(null);
  }

  if (!ownerId) {
    return (
      <div className="max-w-xl mx-auto p-12 text-center text-neutral-500 text-sm">
        Missing ownerId parameter.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-12 text-center text-neutral-500 text-sm">
        Loading proposals...
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24 text-center">
        <h2 className="text-xl font-semibold text-white mb-2">
          No pending proposals
        </h2>
        <p className="text-sm text-neutral-500">
          Your agent is looking. You&apos;ll be notified when someone matches.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold text-white mb-8">
        New introductions
      </h1>
      {matches.map((match) => (
        <div
          key={match.matchId}
          className="border border-neutral-800 rounded-xl p-6 mb-5 bg-neutral-900/50"
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-xl font-semibold text-white">
              {match.otherPerson.name ?? "Unknown"}
            </span>
            {match.otherPerson.location && (
              <span className="text-sm text-neutral-500">
                {match.otherPerson.location}
              </span>
            )}
          </div>

          <p className="text-base leading-relaxed text-neutral-300 mb-4 p-3.5 bg-neutral-800/50 rounded-lg border-l-2 border-neutral-600">
            {match.framingForMe}
          </p>

          {match.otherPerson.currentWork && (
            <p className="text-sm text-neutral-400 mb-3">
              <strong className="text-neutral-300">Working on:</strong>{" "}
              {match.otherPerson.currentWork}
            </p>
          )}

          {match.otherPerson.expertise &&
            match.otherPerson.expertise.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {match.otherPerson.expertise.map((e) => (
                  <span
                    key={e}
                    className="text-xs px-2.5 py-1 bg-neutral-800 rounded-full text-neutral-400"
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}

          <div className="flex gap-3">
            <button
              onClick={() => handleAction(match.matchId, "confirm")}
              disabled={actionLoading === match.matchId}
              className="flex-1 py-3 text-sm font-semibold bg-white text-black rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50"
            >
              Yes, introduce us
            </button>
            <button
              onClick={() => handleAction(match.matchId, "dormant")}
              disabled={actionLoading === match.matchId}
              className="flex-1 py-3 text-sm font-medium border border-neutral-700 text-neutral-400 rounded-lg hover:border-neutral-500 transition-colors disabled:opacity-50"
            >
              Not now
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
