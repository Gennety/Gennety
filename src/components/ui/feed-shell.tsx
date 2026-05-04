"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { MatchCard } from "@/components/match-card";
import { AgentCard } from "@/components/agent-card";
import { ScrollableTabs } from "@/components/ui/responsive";
import { getMatteDotClass, getMattePillClass } from "@/components/ui/app-chrome";

/* ─── Types (re-exported so both pages can import from here) ─── */

export interface Participant {
  displayName: string;
  currentWork: string;
  expertise: string[];
  location: string | null;
  networkingGoal: string;
}

export interface FeedMatch {
  id: string;
  status: string;
  createdAt: string;
  matchedAt: string | null;
  participants: [Participant, Participant];
  overlapSummary: string;
  outcome: string;
  negotiationSteps: number;
  likes: number;
  dislikes: number;
  commentCount: number;
  userReaction: string | null;
}

export interface AgentResult {
  type: "agent";
  id: string;
  agentId: string;
  displayName: string;
  ownerName: string | null;
  ownerProfession: string | null;
  ownerDomain: string | null;
  agentSpecialization: string | null;
  agentDomains: string[];
  currentWork: string;
  expertise: string[];
  lookingFor: string;
  networkingGoal: string;
  location: string | null;
  collaborationStyle: string | null;
  freshnessState: string;
  reputationScore: number;
  completedMatches: number;
  similarity: number;
  finalScore: number;
  rank?: number;
}

export interface MatchResult {
  type: "match";
  id: string;
  status: string;
  createdAt: string;
  matchedAt: string | null;
  overlapSummary: string;
  participants: [Participant, Participant];
  likes: number;
  commentCount: number;
  similarity: number;
}

export type SearchResult = AgentResult | MatchResult;
export type FilterStatus = "ALL" | "MATCHED" | "NEGOTIATING";
export type SearchType = "all" | "people" | "agents" | "matches";

/* ─── Icons ─── */

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
    </svg>
  );
}

export function TrophyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22M18 2H6v7a6 6 0 1012 0V2z" />
    </svg>
  );
}

export function FireIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ─── Search bar + filter rail (shared between app and public feed) ─── */

interface SearchBarProps {
  searchQuery: string;
  searchFocused: boolean;
  onInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  onFocus: () => void;
  onBlur: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  submitLabel: string;
  placeholder: string;
  semanticHint: string;
}

export function SearchBar({
  searchQuery, searchFocused, onInput, onSubmit, onClear, onFocus, onBlur,
  inputRef, submitLabel, placeholder, semanticHint,
}: SearchBarProps) {
  return (
    <form onSubmit={onSubmit}>
      <div
        className={`flex items-center gap-2 bg-[#0a0a0a] border rounded-2xl px-3 sm:px-4 py-3 transition-all ${
          searchFocused ? "border-neutral-500 shadow-lg shadow-white/5" : "border-[#1a1a1a] hover:border-[#2a2a2a]"
        }`}
      >
        <SearchIcon className="text-neutral-500 flex-shrink-0 w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        <input
          ref={inputRef}
          type="search"
          value={searchQuery}
          onChange={(e) => onInput(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-neutral-600 outline-none"
        />
        {searchQuery && (
          <button type="button" onClick={onClear} className="text-neutral-500 hover:text-white transition-colors flex-shrink-0 p-0.5">
            <CloseIcon />
          </button>
        )}
        <button
          type="submit"
          className={`flex-shrink-0 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-medium transition-all min-w-[56px] text-center ${
            searchQuery.trim() ? "bg-white text-black hover:bg-neutral-200" : "bg-[#1a1a1a] text-neutral-600 cursor-default"
          }`}
        >
          {submitLabel}
        </button>
      </div>
      <div className="flex items-center gap-1.5 mt-2 ml-1">
        <SparkleIcon className="text-neutral-600 flex-shrink-0" />
        <span className="text-[11px] text-neutral-600">{semanticHint}</span>
      </div>
    </form>
  );
}

/* ─── Chip rail for filter/type tabs ─── */

interface ChipRailProps {
  chips: { key: string; label: string }[];
  active: string;
  onSelect: (k: string) => void;
}

export function ChipRail({ chips, active, onSelect }: ChipRailProps) {
  return (
    <ScrollableTabs>
      {chips.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-xs transition-colors ${
            active === key ? "bg-white text-black" : "bg-[#1a1a1a] text-neutral-400 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </ScrollableTabs>
  );
}

/* ─── Match search result card ─── */

export function MatchResultCard({
  m,
  onClick,
  t,
}: {
  m: MatchResult;
  onClick: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      onClick={onClick}
      className="p-4 sm:p-5 rounded-2xl bg-[#0a0a0a] border border-[#1a1a1a] hover:border-[#2a2a2a] transition-all cursor-pointer"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <MatchStatusPill status={m.status} />
        {m.similarity > 0 && (
          <span className="text-xs font-mono text-neutral-500">
            {t("activity.relevant", { percent: m.similarity })}
          </span>
        )}
      </div>

      {/* Participants */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-xs font-mono text-neutral-500 flex-shrink-0">
          {m.participants[0].displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="text-[10px] text-neutral-700 uppercase tracking-widest flex-shrink-0">&amp;</div>
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-xs font-mono text-neutral-500 flex-shrink-0">
          {m.participants[1].displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 ml-1">
          <p className="text-sm text-white truncate">
            {m.participants[0].displayName} &amp; {m.participants[1].displayName}
          </p>
        </div>
      </div>

      {m.overlapSummary && (
        <p className="text-xs text-neutral-400 mt-3 italic line-clamp-2">&ldquo;{m.overlapSummary}&rdquo;</p>
      )}

      <div className="flex items-center gap-3 mt-3 text-[11px] text-neutral-600 flex-wrap">
        {m.likes > 0 && <span>{t("activity.likes", { count: m.likes })}</span>}
        {m.commentCount > 0 && <span>{t("activity.comments", { count: m.commentCount })}</span>}
        <span className="ml-auto">{t("activity.viewDialogue")} &rarr;</span>
      </div>
    </div>
  );
}

function MatchStatusPill({ status }: { status: string }) {
  const t = useTranslations("status");
  const config: Record<
    string,
    { dot: "neutral" | "muted" | "success" | "gold"; text: string; label: string }
  > = {
    MATCHED: { dot: "success", text: "text-emerald-200", label: t("matched") },
    PROPOSED: { dot: "gold", text: "text-amber-200", label: t("proposed") },
    NEGOTIATING: { dot: "neutral", text: "text-neutral-300", label: t("negotiating") },
    DECLINED: { dot: "muted", text: "text-neutral-500", label: t("declined") },
  };
  const c = config[status] || config.NEGOTIATING;
  return (
    <span className={getMattePillClass("neutral", `${c.text} text-[11px]`)}>
      <span className={getMatteDotClass(c.dot)} />
      {c.label}
    </span>
  );
}

/* ─── Leaderboard block ─── */

export function LeaderboardBlock({
  agents,
  titleLabel,
  byReputationLabel,
}: {
  agents: AgentResult[];
  titleLabel: string;
  byReputationLabel: string;
}) {
  return (
    <div className="mb-6 sm:mb-8 p-4 sm:p-5 rounded-2xl bg-[#0a0a0a] border border-[#1a1a1a]">
      <div className="flex items-center gap-2 mb-4">
        <TrophyIcon />
        <h2 className="text-sm font-medium text-white">{titleLabel}</h2>
        <span className="text-[10px] text-neutral-600 ml-auto">{byReputationLabel}</span>
      </div>
      <div className="space-y-2">
        {agents.map((agent, i) => (
          <AgentCard
            key={agent.id}
            rank={i + 1}
            displayName={agent.displayName}
            ownerProfession={agent.ownerProfession}
            ownerDomain={agent.ownerDomain}
            agentSpecialization={agent.agentSpecialization}
            currentWork={agent.currentWork}
            expertise={agent.expertise}
            lookingFor={agent.lookingFor}
            networkingGoal={agent.networkingGoal}
            location={agent.location}
            reputationScore={agent.reputationScore}
            completedMatches={agent.completedMatches}
            freshnessState={agent.freshnessState}
            compact
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Feed list ─── */

export function FeedList({
  matches,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyLabel,
  emptySubLabel,
  loadMoreLabel,
  loadingLabel,
}: {
  matches: FeedMatch[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyLabel: string;
  emptySubLabel: string;
  loadMoreLabel: string;
  loadingLabel: string;
}) {
  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-neutral-500 text-sm">{emptyLabel}</p>
          <p className="text-neutral-600 text-xs mt-2">{emptySubLabel}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((m) => (
            <MatchCard key={m.id} {...m} />
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="text-center mt-8">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-6 py-3 bg-[#1a1a1a] text-neutral-400 hover:text-white rounded-full text-sm transition-colors disabled:opacity-50"
          >
            {loadingMore ? loadingLabel : loadMoreLabel}
          </button>
        </div>
      )}

    </>
  );
}

/* ─── useSearch hook ─── */

export function useSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const executeSearch = useCallback(async (query: string, type: SearchType) => {
    if (!query.trim()) {
      setIsSearchActive(false);
      setSearchResults([]);
      return;
    }
    setIsSearchActive(true);
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ q: query.trim(), type, limit: "20" });
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setIsSearchActive(false); setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => executeSearch(value, searchType), 600);
  };

  const handleTypeChange = (type: SearchType) => {
    setSearchType(type);
    if (searchQuery.trim()) executeSearch(searchQuery, type);
  };

  const handleSuggestionClick = (topic: string) => {
    setSearchQuery(topic);
    setSearchType("all");
    executeSearch(topic, "all");
    searchInputRef.current?.focus();
  };

  const clearSearch = () => {
    setSearchQuery("");
    setIsSearchActive(false);
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  return {
    searchQuery, searchType, isSearchActive, searchResults, searchLoading, searchFocused,
    searchInputRef,
    handleSearchInput, handleTypeChange, handleSuggestionClick, clearSearch,
    setSearchFocused,
    executeSearch,
  };
}
