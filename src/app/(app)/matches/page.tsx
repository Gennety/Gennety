"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface MatchItem {
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
  proposedAt: string | null;
  matchedAt: string | null;
}

export default function MatchesPage() {
  const { status } = useSession();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [freshnessState, setFreshnessState] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "dormant">("active");
  const [loading, setLoading] = useState(true);

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
      <div className="max-w-xl mx-auto p-12 text-center text-neutral-500 text-sm">
        Loading matches...
      </div>
    );
  }

  const activeMatches = matches.filter(
    (m) => m.status === "MATCHED" || m.status === "PROPOSED"
  );
  const dormantMatches = matches.filter((m) => m.status === "DORMANT");
  const displayed = tab === "active" ? activeMatches : dormantMatches;

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold text-white mb-6">Your matches</h1>

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
          Active ({activeMatches.length})
        </button>
        <button
          onClick={() => setTab("dormant")}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "dormant"
              ? "text-white border-white"
              : "text-neutral-500 border-transparent hover:text-neutral-300"
          }`}
        >
          Dormant ({dormantMatches.length})
        </button>
      </div>

      {displayed.length === 0 && (
        <div className="text-center pt-16">
          <p className="text-neutral-500 text-sm">
            {tab === "active"
              ? "No active matches yet. Your agent is looking."
              : "No dormant matches."}
          </p>
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
            <StatusBadge status={match.status} />
          </div>

          <p className="text-sm leading-relaxed text-neutral-300 mb-3 p-3 bg-neutral-800/50 rounded-lg border-l-2 border-neutral-600">
            {match.framingForMe}
          </p>

          {match.otherPerson.currentWork && (
            <p className="text-xs text-neutral-400 mb-2">
              <strong className="text-neutral-300">Working on:</strong>{" "}
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

          <div className="flex gap-3">
            {match.status === "MATCHED" && match.chatId && (
              <Link
                href={`/chat/${match.matchId}`}
                className="inline-block px-5 py-2.5 text-sm font-semibold bg-white text-black rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Open chat
              </Link>
            )}
            {match.status === "PROPOSED" && !match.confirmedByMe && (
              <Link
                href="/notify"
                className="inline-block px-5 py-2.5 text-sm font-semibold bg-white text-black rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Review proposal
              </Link>
            )}
            {match.status === "DORMANT" && (
              <span className="text-xs text-neutral-500 italic">
                You can revisit this match anytime
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FreshnessIndicator({ state }: { state: string | null }) {
  if (!state || state === "ACTIVE") return null;

  const config = {
    AGING: {
      dot: "bg-amber-400",
      bg: "bg-amber-950/30 border-amber-800/40",
      text: "text-amber-200",
      message: "Your agent's context may be getting outdated",
    },
    STALE: {
      dot: "bg-red-400",
      bg: "bg-red-950/30 border-red-800/40",
      text: "text-red-200",
      message: "Matching paused — ask your agent to update your context",
    },
    INACTIVE: {
      dot: "bg-neutral-500",
      bg: "bg-neutral-800/50 border-neutral-700",
      text: "text-neutral-300",
      message: "Your profile is sleeping — ask your agent to reconnect",
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

function StatusBadge({ status }: { status: string }) {
  const colors =
    status === "MATCHED"
      ? "bg-green-950/50 text-green-400 border-green-800/50"
      : status === "PROPOSED"
      ? "bg-amber-950/50 text-amber-400 border-amber-800/50"
      : "bg-neutral-800 text-neutral-400 border-neutral-700";

  return (
    <span
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide border ${colors}`}
    >
      {status}
    </span>
  );
}
