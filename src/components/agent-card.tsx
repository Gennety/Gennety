"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cx, getMattePillClass, panelSoftClass } from "@/components/ui/app-chrome";

interface AgentCardProps {
  rank?: number;
  displayName: string;
  ownerProfession: string | null;
  ownerDomain: string | null;
  agentSpecialization: string | null;
  agentDomains?: string[];
  collaborationStyle?: string | null;
  currentWork: string;
  expertise: string[];
  lookingFor: string;
  networkingGoal: string;
  location: string | null;
  reputationScore: number;
  completedMatches: number;
  freshnessState: string;
  similarity?: number;
  compact?: boolean;
}

function getInitials(name: string) {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function FreshnessDot({ state }: { state: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-green-500",
    AGING: "bg-yellow-500",
    STALE: "bg-neutral-600",
    INACTIVE: "bg-neutral-700",
  };
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${colors[state] || colors.INACTIVE}`}
      title={state}
    />
  );
}

function FreshnessLabel({ state }: { state: string }) {
  const config: Record<string, { color: string; label: string }> = {
    ACTIVE: { color: "text-green-400", label: "Active" },
    AGING: { color: "text-yellow-400", label: "Aging" },
    STALE: { color: "text-neutral-500", label: "Stale" },
    INACTIVE: { color: "text-neutral-600", label: "Inactive" },
  };
  const c = config[state] || config.INACTIVE;
  return <span className={`text-[11px] ${c.color}`}>{c.label}</span>;
}

function GoalBadge({ goal }: { goal: string }) {
  const colors: Record<string, string> = {
    partnership: "bg-indigo-950/45 text-indigo-200",
    collaboration: "bg-blue-950/45 text-blue-200",
    mentor: "bg-amber-950/45 text-amber-200",
    peer: "bg-emerald-950/45 text-emerald-200",
  };
  const cls = colors[goal] || "bg-white/[0.04] text-neutral-400";
  return (
    <span className={getMattePillClass("muted", `px-2.5 py-1 text-[10px] ${cls}`)}>
      {goal}
    </span>
  );
}

/* ─── Expanded profile panel (shared by compact & full) ─── */

function ProfilePanel({
  displayName,
  ownerProfession,
  ownerDomain,
  agentSpecialization,
  agentDomains,
  collaborationStyle,
  currentWork,
  expertise,
  lookingFor,
  networkingGoal,
  location,
  reputationScore,
  completedMatches,
  freshnessState,
  similarity,
  onClose,
}: AgentCardProps & { onClose: () => void }) {
  const t = useTranslations();
  return (
    <div
      className="mt-3 border-t border-white/[0.06] pt-4 animate-in fade-in slide-in-from-top-1 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Profile header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-14 h-14 rounded-full bg-[#1a1a1a] flex items-center justify-center text-base font-mono text-neutral-400 flex-shrink-0">
          {getInitials(displayName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold text-white">{displayName}</h3>
            <FreshnessDot state={freshnessState} />
            <GoalBadge goal={networkingGoal} />
          </div>
          {(ownerProfession || ownerDomain) && (
            <p className="text-sm text-neutral-400 mt-0.5">
              {[ownerProfession, ownerDomain].filter(Boolean).join(" · ")}
            </p>
          )}
          {location && (
            <p className="text-xs text-neutral-500 mt-0.5">{location}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-neutral-600 hover:text-white transition-colors p-1 flex-shrink-0"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

        {/* Stats row */}
      <div className={cx("mb-4 flex items-center gap-4 rounded-[1.1rem] p-3", panelSoftClass)}>
        <div className="text-center flex-1">
          <p className="text-base font-semibold text-white">
            {reputationScore}
          </p>
          <p className="text-[10px] text-neutral-500 mt-0.5">{t("components.reputation")}</p>
        </div>
        <div className="h-8 w-px bg-white/[0.06]" />
        <div className="text-center flex-1">
          <p className="text-base font-semibold text-white">
            {completedMatches}
          </p>
          <p className="text-[10px] text-neutral-500 mt-0.5">{t("components.matchesLabel")}</p>
        </div>
        <div className="h-8 w-px bg-white/[0.06]" />
        <div className="text-center flex-1">
          <FreshnessLabel state={freshnessState} />
          <p className="text-[10px] text-neutral-500 mt-0.5">{t("components.statusLabel")}</p>
        </div>
        {similarity != null && similarity > 0 && (
          <>
            <div className="h-8 w-px bg-white/[0.06]" />
            <div className="text-center flex-1">
              <p className="text-base font-semibold text-white">
                {similarity}%
              </p>
              <p className="text-[10px] text-neutral-500 mt-0.5">{t("components.relevance")}</p>
            </div>
          </>
        )}
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {/* Current work */}
        <ProfileSection label={t("components.currentlyWorkingOn")}>
          <p className="text-sm text-neutral-300">{currentWork}</p>
        </ProfileSection>

        {/* Looking for */}
        {lookingFor && (
          <ProfileSection label={t("components.lookingFor")}>
            <p className="text-sm text-neutral-300">{lookingFor}</p>
          </ProfileSection>
        )}

        {/* Agent info */}
        {agentSpecialization && (
          <ProfileSection label={t("components.agentSpecialization")}>
            <p className="text-sm text-neutral-300">{agentSpecialization}</p>
          </ProfileSection>
        )}

        {/* Agent domains */}
        {agentDomains && agentDomains.length > 0 && (
          <ProfileSection label={t("components.agentDomains")}>
            <div className="flex flex-wrap gap-1.5">
              {agentDomains.map((d) => (
                <span
                  key={d}
                  className={getMattePillClass("muted", "rounded-full px-2 py-0.5 text-[11px]")}
                >
                  {d}
                </span>
              ))}
            </div>
          </ProfileSection>
        )}

        {/* Collaboration style */}
        {collaborationStyle && (
          <ProfileSection label={t("components.collaborationStyle")}>
            <p className="text-sm text-neutral-300">{collaborationStyle}</p>
          </ProfileSection>
        )}

        {/* Expertise */}
        {expertise.length > 0 && (
          <ProfileSection label={t("components.expertise")}>
            <div className="flex flex-wrap gap-1.5">
              {expertise.map((tag) => (
                <span
                  key={tag}
                  className={getMattePillClass("neutral", "rounded-full px-2.5 py-1 text-xs")}
                >
                  {tag}
                </span>
              ))}
            </div>
          </ProfileSection>
        )}
      </div>
    </div>
  );
}

function ProfileSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] text-neutral-600 uppercase tracking-wider mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ─── Main AgentCard ─── */

export function AgentCard(props: AgentCardProps) {
  const {
    rank,
    displayName,
    ownerProfession,
    ownerDomain,
    agentSpecialization,
    currentWork,
    expertise,
    lookingFor,
    networkingGoal,
    location,
    reputationScore,
    completedMatches,
    freshnessState,
    similarity,
    compact,
  } = props;

  const [expanded, setExpanded] = useState(false);

  if (compact) {
    return (
      <div
        onClick={() => setExpanded(!expanded)}
        className="group cursor-pointer rounded-[1.25rem] bg-neutral-950/62 p-3 ring-1 ring-inset ring-white/[0.06] transition-all hover:bg-neutral-950/78 hover:ring-white/[0.10]"
      >
        <div className="flex items-center gap-3">
          {/* Rank */}
          {rank != null && (
            <span className="text-xs font-mono text-neutral-600 w-5 text-right flex-shrink-0">
              {rank}
            </span>
          )}

          {/* Avatar */}
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-xs font-mono text-neutral-500 transition-colors group-hover:bg-white/[0.07]">
            {getInitials(displayName)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white truncate">
                {displayName}
              </span>
              <FreshnessDot state={freshnessState} />
            </div>
            <p className="text-xs text-neutral-500 truncate">
              {ownerProfession || currentWork}
            </p>
          </div>

          {/* Score + chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <span className="text-xs font-mono text-neutral-400">
                {reputationScore}
              </span>
              <p className="text-[10px] text-neutral-600">score</p>
            </div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-neutral-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* Expanded profile */}
        {expanded && (
          <ProfilePanel {...props} onClose={() => setExpanded(false)} />
        )}
      </div>
    );
  }

  /* ─── Full card (search results) ─── */
  return (
      <div
        onClick={() => setExpanded(!expanded)}
      className="cursor-pointer rounded-[1.5rem] bg-neutral-950/62 p-6 ring-1 ring-inset ring-white/[0.06] transition-all hover:bg-neutral-950/78 hover:ring-white/[0.10]"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        {/* Rank badge */}
        {rank != null && (
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-xs font-mono text-neutral-500">
            {rank}
          </div>
        )}

        {/* Avatar */}
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-sm font-mono text-neutral-400">
          {getInitials(displayName)}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-medium text-white">{displayName}</h3>
            <FreshnessDot state={freshnessState} />
            <GoalBadge goal={networkingGoal} />
          </div>
          {(ownerProfession || ownerDomain) && (
            <p className="text-sm text-neutral-400 mt-0.5">
              {[ownerProfession, ownerDomain].filter(Boolean).join(" · ")}
            </p>
          )}
          {location && (
            <p className="text-xs text-neutral-600 mt-0.5">{location}</p>
          )}
        </div>

        {/* Relevance / Score + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            {similarity != null && similarity > 0 && (
              <div className="mb-1">
                <span className="text-sm font-mono text-white">
                  {similarity}%
                </span>
                <p className="text-[10px] text-neutral-600">relevance</p>
              </div>
            )}
            <span className="text-xs font-mono text-neutral-500">
              {reputationScore} rep
            </span>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-neutral-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Preview (when collapsed) */}
      {!expanded && (
        <>
          <p className="text-sm text-neutral-300 mt-4 line-clamp-2">
            {currentWork}
          </p>

          {agentSpecialization && (
            <p className="text-xs text-neutral-500 mt-2 italic">
              Agent: {agentSpecialization}
            </p>
          )}

          {lookingFor && (
            <p className="text-xs text-neutral-500 mt-1.5">
              <span className="text-neutral-600">Looking for:</span>{" "}
              {lookingFor}
            </p>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              {expertise.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] text-neutral-400"
                >
                  {tag}
                </span>
              ))}
              {expertise.length > 4 && (
                <span className="px-2 py-0.5 text-[11px] text-neutral-600">
                  +{expertise.length - 4}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-3">
              <span className="text-[11px] text-neutral-600">
                {completedMatches} match
                {completedMatches !== 1 ? "es" : ""}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Expanded profile */}
      {expanded && (
        <ProfilePanel {...props} onClose={() => setExpanded(false)} />
      )}
    </div>
  );
}
