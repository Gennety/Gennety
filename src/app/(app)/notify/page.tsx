"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  PageHeader,
  SoftSurface,
  Surface,
  pageFrameClass,
  primaryButtonClass,
  subtleButtonClass,
} from "@/components/ui/app-chrome";

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
  const t = useTranslations();
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const [matches, setMatches] = useState<MatchProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/matches")
      .then((r) => r.json())
      .then((data) => {
        const list = data.matches ?? data ?? [];
        if (Array.isArray(list)) {
          setMatches(
            list.filter(
              (m: MatchProposal) => m.status === "PROPOSED" && !m.confirmedByMe
            )
          );
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionStatus]);

  async function handleAction(matchId: string, action: "confirm" | "dormant") {
    setActionLoading(matchId);
    setError(null);

    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action }),
      });

      const result = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(result?.error ?? "Failed to update match");
      }

      if (result?.status === "MATCHED" && result.matchId) {
        router.push(`/chat/${result.matchId}`);
        return;
      }

      setMatches((prev) => prev.filter((m) => m.matchId !== matchId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update match");
    } finally {
      setActionLoading(null);
    }
  }

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="p-12 text-center text-neutral-500 text-sm">
        {t("notify.loadingProposals")}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className={`${pageFrameClass} pt-16 text-center`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            className="text-neutral-500"
          >
            <path
              d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M8 14v1a2 2 0 004 0v-1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2 className="text-base font-medium text-white mb-1">
          {t("notify.noPending")}
        </h2>
        <p className="text-sm text-neutral-500 max-w-xs mx-auto mb-5">
          {t("notify.noPendingDesc")}
        </p>
        <a
          href="/activity"
          className="text-xs text-neutral-400 hover:text-white transition-colors"
        >
          {t("notify.browseNetwork")} &rarr;
        </a>
      </div>
    );
  }

  return (
    <div className={pageFrameClass}>
      <PageHeader title={t("notify.title")} />
      {error && (
        <p className="mb-6 rounded-[1.25rem] bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-inset ring-red-500/[0.16]">
          {error}
        </p>
      )}
      {matches.map((match) => (
        <Surface
          key={match.matchId}
          className="mb-5 px-5 py-5"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <span className="text-xl font-semibold text-white">
                {match.otherPerson.name ?? "Unknown"}
              </span>
              {match.otherPerson.location && (
                <p className="mt-1 text-xs text-neutral-500">
                  {match.otherPerson.location}
                </p>
              )}
            </div>
            <span className="inline-flex items-center rounded-full bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-neutral-400 ring-1 ring-inset ring-white/[0.05]">
              Proposal
            </span>
          </div>

          <SoftSurface className="px-4 py-4">
            <p className="text-base leading-7 text-neutral-200">
              {match.framingForMe}
            </p>
          </SoftSurface>

          <div className="mt-4 space-y-3">
            {match.otherPerson.currentWork && (
              <p className="text-sm text-neutral-400">
                <strong className="text-neutral-300">Working on:</strong>{" "}
                {match.otherPerson.currentWork}
              </p>
            )}

            {match.otherPerson.expertise &&
              match.otherPerson.expertise.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {match.otherPerson.expertise.map((e) => (
                    <span
                      key={e}
                      className="rounded-full bg-white/[0.03] px-3 py-1.5 text-xs text-neutral-400 ring-1 ring-inset ring-white/[0.05]"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              )}
          </div>

          <div className="mt-5 flex gap-3 border-t border-white/[0.05] pt-4">
            <button
              onClick={() => handleAction(match.matchId, "confirm")}
              disabled={actionLoading === match.matchId}
              className={`flex-1 ${primaryButtonClass}`}
            >
              {t("notify.yesIntroduce")}
            </button>
            <button
              onClick={() => handleAction(match.matchId, "dormant")}
              disabled={actionLoading === match.matchId}
              className={`flex-1 ${subtleButtonClass}`}
            >
              {t("notify.notNow")}
            </button>
          </div>
        </Surface>
      ))}
    </div>
  );
}
