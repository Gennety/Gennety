"use client";

import { useTranslations } from "next-intl";
import { getMatteDotClass, getMattePillClass } from "@/components/ui/app-chrome";

interface Participant {
  displayName: string;
  currentWork: string;
  expertise: string[];
  location: string | null;
  networkingGoal: string;
}

interface MatchCardCompactProps {
  id: string;
  status: string;
  participants: [Participant, Participant];
  overlapSummary: string;
  onClick?: () => void;
}

function getInitials(name: string) {
  return name
    .replace(/^Agent #/, "")
    .slice(0, 2)
    .toUpperCase();
}

function StatusDot({ status }: { status: string }) {
  const t = useTranslations("status");
  let dotTone: "neutral" | "muted" | "success" | "gold" = "muted";
  let label = status;
  let textClass = "text-neutral-400";

  switch (status) {
    case "MATCHED":
      dotTone = "success";
      textClass = "text-emerald-200";
      label = t("matched");
      break;
    case "PROPOSED":
      dotTone = "gold";
      textClass = "text-amber-200";
      label = t("proposed");
      break;
    case "NEGOTIATING":
      dotTone = "neutral";
      textClass = "text-neutral-300";
      label = t("negotiating");
      break;
  }

  return (
    <span className={getMattePillClass("neutral", `${textClass} text-xs`)}>
      <span className={getMatteDotClass(dotTone)} />
      {label}
    </span>
  );
}

export function MatchCardCompact({
  status,
  participants,
  overlapSummary,
  onClick,
}: MatchCardCompactProps) {
  const [a, b] = participants;

  return (
    <div
      onClick={onClick}
      className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-6 hover:border-[#2a2a2a] transition-transform duration-300 hover:-translate-y-1 cursor-pointer"
    >
      {/* Avatars */}
      <div className="flex items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center text-xs font-mono text-neutral-400">
          {getInitials(a.displayName)}
        </div>
        <span className="text-neutral-700 text-xs">&harr;</span>
        <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center text-xs font-mono text-neutral-400">
          {getInitials(b.displayName)}
        </div>
      </div>

      {/* Names */}
      <div className="flex justify-between mt-4">
        <p className="text-sm font-medium text-white">{a.displayName}</p>
        <p className="text-sm font-medium text-white">{b.displayName}</p>
      </div>

      {/* Current work */}
      <div className="flex justify-between mt-1">
        <p className="text-xs text-neutral-500 line-clamp-1 flex-1 pr-2">
          {a.currentWork}
        </p>
        <p className="text-xs text-neutral-500 line-clamp-1 flex-1 pl-2 text-right">
          {b.currentWork}
        </p>
      </div>

      {/* Overlap */}
      {overlapSummary && (
        <p className="text-xs text-neutral-400 italic mt-4 line-clamp-1">
          &ldquo;{overlapSummary}&rdquo;
        </p>
      )}

      {/* Status */}
      <div className="mt-4">
        <StatusDot status={status} />
      </div>
    </div>
  );
}
