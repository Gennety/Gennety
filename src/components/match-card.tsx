"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { getPublicMatchUrl } from "@/lib/public-url";
import {
  codePanelClass,
  cx,
  getMatteDotClass,
  getMattePillClass,
} from "@/components/ui/app-chrome";

interface Participant {
  displayName: string;
  currentWork: string;
  expertise: string[];
  location: string | null;
  networkingGoal: string;
}

interface CommentData {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null };
}

interface NegotiationLogEntry {
  role: "initiator" | "responder";
  displayName: string;
  type: string;
  content: string;
  createdAt: string;
}

interface MatchDialogueDetail {
  negotiationLog: NegotiationLogEntry[];
}

interface MatchCardProps {
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
  onClick?: () => void;
}

function getInitials(name: string) {
  return name
    .replace(/^Agent #/, "")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function commentTimeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatDialogueTime(dateStr: string) {
  const d = new Date(dateStr);
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  const month = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  return `${hours}:${mins} · ${month} ${day}`;
}

/* ─── Status config ─── */

const statusConfig: Record<
  string,
  {
    label: string;
    dotClass: string;
    textClass: string;
    accentLine: string;
    ringClass: string;
    borderAccent: string;
    pulse: boolean;
  }
> = {
  MATCHED: {
    label: "status.matched",
    dotClass: "bg-green-500",
    textClass: "text-green-400",
    accentLine: "bg-gradient-to-r from-transparent via-green-500/40 to-transparent",
    ringClass: "ring-green-500/20",
    borderAccent: "border-green-500/25",
    pulse: false,
  },
  PROPOSED: {
    label: "status.proposed",
    dotClass: "bg-yellow-500",
    textClass: "text-yellow-400",
    accentLine: "bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent",
    ringClass: "ring-yellow-500/15",
    borderAccent: "border-yellow-500/20",
    pulse: false,
  },
  NEGOTIATING: {
    label: "status.negotiating",
    dotClass: "bg-white",
    textClass: "text-neutral-400",
    accentLine: "bg-gradient-to-r from-transparent via-white/20 to-transparent",
    ringClass: "ring-white/10",
    borderAccent: "border-white/10",
    pulse: true,
  },
  DECLINED: {
    label: "status.declined",
    dotClass: "bg-neutral-600",
    textClass: "text-neutral-600",
    accentLine: "bg-gradient-to-r from-transparent via-neutral-600/20 to-transparent",
    ringClass: "ring-neutral-600/10",
    borderAccent: "border-neutral-700",
    pulse: false,
  },
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations();
  const cfg = statusConfig[status] || statusConfig.NEGOTIATING;
  const tone =
    status === "MATCHED"
      ? "success"
      : status === "PROPOSED"
      ? "gold"
      : status === "DECLINED"
      ? "muted"
      : "neutral";
  return (
    <span className={getMattePillClass(tone, cx("px-2.5 py-1", cfg.textClass))}>
      <span className={getMatteDotClass(
        status === "MATCHED"
          ? "success"
          : status === "PROPOSED"
          ? "gold"
          : status === "DECLINED"
          ? "muted"
          : "neutral"
      )} />
      {t(cfg.label)}
    </span>
  );
}

/* ─── Icons ─── */

function HeartIcon({ filled }: { filled?: boolean }) {
  if (filled) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

function ThumbDownIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2V13M22 11V4a2 2 0 00-2-2H7.5a3 3 0 00-2.94 2.41l-1.4 7A3 3 0 006.08 15H10v4a3 3 0 003 3l1-1 3-7h5" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 15V5" />
      <path d="M6.5 8.5L10 5l3.5 3.5" />
    </svg>
  );
}

function ConnectionIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function DialogueTypePill({ type }: { type: string }) {
  const styles: Record<string, string> = {
    reasoning: "bg-white/[0.055] text-neutral-200",
    proposal: "bg-white/[0.05] text-neutral-300",
    evaluation: "bg-white/[0.05] text-neutral-300",
    agreement: "bg-white/[0.075] text-neutral-100",
    decline: "bg-white/[0.04] text-neutral-500",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
        styles[type] ?? "bg-white/[0.04] text-neutral-500"
      }`}
    >
      {type}
    </span>
  );
}

/* ─── Component ─── */

export function MatchCard({
  id,
  status,
  createdAt,
  participants,
  overlapSummary,
  negotiationSteps,
  likes: initialLikes,
  dislikes: initialDislikes,
  commentCount: initialCommentCount,
  userReaction: initialUserReaction,
  onClick,
}: MatchCardProps) {
  const [a, b] = participants;
  const cfg = statusConfig[status] || statusConfig.NEGOTIATING;

  // Social state
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [userReaction, setUserReaction] = useState<string | null>(initialUserReaction);
  const [reactionLoading, setReactionLoading] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [dislikeAnimating, setDislikeAnimating] = useState(false);

  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentSending, setCommentSending] = useState(false);

  const [shareToast, setShareToast] = useState(false);
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [dialogue, setDialogue] = useState<NegotiationLogEntry[]>([]);
  const [dialogueLoaded, setDialogueLoaded] = useState(false);
  const [dialogueLoading, setDialogueLoading] = useState(false);
  const [dialogueError, setDialogueError] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>();
  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (commentsOpen && commentsLoaded) {
      commentInputRef.current?.focus();
    }
  }, [commentsOpen, commentsLoaded]);

  const handleReaction = useCallback(
    async (type: "LIKE" | "DISLIKE") => {
      if (reactionLoading) return;
      setReactionLoading(true);

      // Trigger animation
      if (type === "LIKE") setLikeAnimating(true);
      else setDislikeAnimating(true);
      setTimeout(() => {
        setLikeAnimating(false);
        setDislikeAnimating(false);
      }, 350);

      const prevLikes = likes;
      const prevDislikes = dislikes;
      const prevReaction = userReaction;

      if (userReaction === type) {
        setUserReaction(null);
        if (type === "LIKE") setLikes((l) => Math.max(0, l - 1));
        else setDislikes((d) => Math.max(0, d - 1));
      } else {
        if (userReaction === "LIKE") setLikes((l) => Math.max(0, l - 1));
        if (userReaction === "DISLIKE") setDislikes((d) => Math.max(0, d - 1));
        setUserReaction(type);
        if (type === "LIKE") setLikes((l) => l + 1);
        else setDislikes((d) => d + 1);
      }

      try {
        const res = await fetch(`/api/feed/${id}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
        if (res.ok) {
          const data = await res.json();
          setLikes(data.likes);
          setDislikes(data.dislikes);
          setUserReaction(data.userReaction);
        } else {
          setLikes(prevLikes);
          setDislikes(prevDislikes);
          setUserReaction(prevReaction);
        }
      } catch {
        setLikes(prevLikes);
        setDislikes(prevDislikes);
        setUserReaction(prevReaction);
      } finally {
        setReactionLoading(false);
      }
    },
    [id, likes, dislikes, userReaction, reactionLoading]
  );

  const handleShare = useCallback(async () => {
    const url = getPublicMatchUrl(id, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setShareToast(true);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setShareToast(false), 2000);
  }, [id]);

  const loadComments = useCallback(async () => {
    if (commentsLoaded || commentsLoading) return;
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/feed/${id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments);
        setCommentsLoaded(true);
      }
    } finally {
      setCommentsLoading(false);
    }
  }, [id, commentsLoaded, commentsLoading]);

  const toggleComments = useCallback(() => {
    const opening = !commentsOpen;
    setCommentsOpen(opening);
    if (opening && !commentsLoaded) loadComments();
  }, [commentsOpen, commentsLoaded, loadComments]);

  const handleSubmitComment = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = newComment.trim();
      if (!text || commentSending) return;
      setCommentSending(true);

      try {
        const res = await fetch(`/api/feed/${id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        if (res.ok) {
          const data = await res.json();
          setComments((prev) => [...prev, data.comment]);
          setCommentCount(data.commentCount);
          setNewComment("");
        }
      } finally {
        setCommentSending(false);
      }
    },
    [id, newComment, commentSending]
  );

  const loadDialogue = useCallback(async () => {
    if (dialogueLoaded || dialogueLoading) return;
    setDialogueLoading(true);
    setDialogueError(false);

    try {
      const res = await fetch(`/api/feed/${id}`);
      if (!res.ok) {
        setDialogueError(true);
        return;
      }

      const data: MatchDialogueDetail = await res.json();
      setDialogue(data.negotiationLog ?? []);
      setDialogueLoaded(true);
    } catch {
      setDialogueError(true);
    } finally {
      setDialogueLoading(false);
    }
  }, [dialogueLoaded, dialogueLoading, id]);

  const toggleDialogue = useCallback(async () => {
    const nextOpen = !dialogueOpen;
    setDialogueOpen(nextOpen);

    if (nextOpen && !dialogueLoaded) {
      await loadDialogue();
    }
  }, [dialogueLoaded, dialogueOpen, loadDialogue]);

  return (
    <div className="group relative overflow-hidden rounded-[1.75rem] bg-neutral-950/68 ring-1 ring-inset ring-white/[0.06] transition-all duration-300 hover:bg-neutral-950/78 hover:ring-white/[0.10]">
      {/* Status accent line at top */}
      <div className={`h-px opacity-80 ${cfg.accentLine}`} />

      <div className="px-6 pb-5 pt-5">
        {/* Header: status + time */}
        <div className="flex items-center justify-between mb-5">
          <StatusBadge status={status} />
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-neutral-600">
              {negotiationSteps} step{negotiationSteps !== 1 ? "s" : ""}
            </span>
            <span className="text-[11px] text-neutral-600 font-mono">
              {timeAgo(createdAt)}
            </span>
          </div>
        </div>

        {/* Avatars + connector */}
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-sm font-mono text-neutral-300 ring-1 ${cfg.ringClass}`}>
            {getInitials(a.displayName)}
          </div>

          <div className="flex-1 flex items-center">
            <div className={`flex-1 h-[1px] ${cfg.accentLine}`} />
            <div className="mx-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.03] ring-1 ring-inset ring-white/[0.05]">
              <ConnectionIcon />
            </div>
            <div className={`flex-1 h-[1px] ${cfg.accentLine}`} />
          </div>

          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-sm font-mono text-neutral-300 ring-1 ${cfg.ringClass}`}>
            {getInitials(b.displayName)}
          </div>
        </div>

        {/* Names + descriptions */}
        <div className="flex justify-between mt-4">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-sm font-medium text-white truncate">{a.displayName}</p>
            <p className="text-xs text-neutral-500 mt-1 line-clamp-1">{a.currentWork}</p>
          </div>
          <div className="flex-1 min-w-0 pl-4 text-right">
            <p className="text-sm font-medium text-white truncate">{b.displayName}</p>
            <p className="text-xs text-neutral-500 mt-1 line-clamp-1">{b.currentWork}</p>
          </div>
        </div>

        {/* Overlap summary with accent border */}
        {overlapSummary && (
          <div className={`mt-5 rounded-[1.25rem] bg-white/[0.03] px-4 py-4 ring-1 ring-inset ring-white/[0.05]`}>
            <p className="text-[13px] leading-6 text-neutral-200">
              {overlapSummary}
            </p>
          </div>
        )}

        {/* Expertise tags */}
        {(a.expertise.length > 0 || b.expertise.length > 0) && (
          <div className="flex justify-between mt-4 gap-4">
            <div className="flex gap-1.5 flex-wrap flex-1 min-w-0">
              {a.expertise.slice(0, 2).map((e) => (
                <span
                  key={e}
                  className="max-w-[120px] truncate rounded-full bg-white/[0.03] px-2.5 py-1 text-[10px] text-neutral-500 ring-1 ring-inset ring-white/[0.05]"
                >
                  {e}
                </span>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap flex-1 min-w-0 justify-end">
              {b.expertise.slice(0, 2).map((e) => (
                <span
                  key={e}
                  className="max-w-[120px] truncate rounded-full bg-white/[0.03] px-2.5 py-1 text-[10px] text-neutral-500 ring-1 ring-inset ring-white/[0.05]"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* View link */}
        <div className="mt-4 border-t border-white/[0.05] pt-3">
          <button
            type="button"
            onClick={toggleDialogue}
            className="inline-flex items-center gap-2 text-xs text-neutral-500 transition-colors hover:text-neutral-200"
          >
            <span>{dialogueOpen ? "Hide agent dialogue" : "View agent dialogue"}</span>
            <ChevronDownIcon
              className={`transition-transform duration-300 ${
                dialogueOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ${
          dialogueOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/[0.05] px-6 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-600">
                  Agent dialogue
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Full negotiation stays inside the activity card.
                </p>
              </div>
              <span className="text-[11px] text-neutral-600">
                {dialogue.length || negotiationSteps} step
                {((dialogue.length || negotiationSteps) !== 1) ? "s" : ""}
              </span>
            </div>

            {dialogueLoading ? (
              <div className="flex items-center justify-center rounded-[1.25rem] bg-white/[0.03] py-8 ring-1 ring-inset ring-white/[0.05]">
                <div className="w-5 h-5 border-2 border-neutral-700 border-t-neutral-300 rounded-full animate-spin" />
              </div>
            ) : dialogueError ? (
              <div className="rounded-[1.25rem] bg-red-950/14 px-4 py-3 text-sm text-red-200/80 ring-1 ring-inset ring-red-500/[0.15]">
                Failed to load agent dialogue.
              </div>
            ) : (
              <div className="space-y-3">
                {dialogue.map((log, index) => (
                  <article
                    key={`${log.createdAt}-${index}`}
                    className={cx(codePanelClass, "px-4 py-4")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {log.displayName}
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-600">
                          Step {index + 1} · {formatDialogueTime(log.createdAt)}
                        </p>
                      </div>
                      <DialogueTypePill type={log.type} />
                    </div>

                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">
                      {log.content}
                    </p>
                  </article>
                ))}

                {!dialogueLoading && dialogueLoaded && dialogue.length === 0 && (
                  <div className="rounded-[1.25rem] bg-white/[0.03] px-4 py-6 text-sm text-neutral-500 ring-1 ring-inset ring-white/[0.05]">
                    No dialogue has been recorded for this match yet.
                  </div>
                )}
              </div>
            )}

            {onClick && (
              <div className="mt-4 pt-1">
                <button
                  type="button"
                  onClick={onClick}
                  className="text-xs text-neutral-500 transition-colors hover:text-white"
                >
                  Open standalone view &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Social actions bar ─── */}
      <div className="relative flex items-center gap-1 border-t border-white/[0.05] px-6 py-2.5">
        {/* Like */}
        <button
          onClick={() => handleReaction("LIKE")}
          disabled={reactionLoading}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all active:scale-95 ${
            userReaction === "LIKE"
              ? "bg-rose-500/10 text-rose-300"
              : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300"
          } disabled:opacity-50`}
        >
          <span className={likeAnimating ? "animate-reaction-pop" : ""}>
            <HeartIcon filled={userReaction === "LIKE"} />
          </span>
          {likes > 0 && (
            <span className={`tabular-nums ${likeAnimating ? "animate-count-bump" : ""}`}>
              {likes}
            </span>
          )}
        </button>

        {/* Dislike */}
        <button
          onClick={() => handleReaction("DISLIKE")}
          disabled={reactionLoading}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all active:scale-95 ${
            userReaction === "DISLIKE"
              ? "bg-red-500/10 text-red-300"
              : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300"
          } disabled:opacity-50`}
        >
          <span className={dislikeAnimating ? "animate-reaction-pop" : ""}>
            <ThumbDownIcon filled={userReaction === "DISLIKE"} />
          </span>
          {dislikes > 0 && (
            <span className={`tabular-nums ${dislikeAnimating ? "animate-count-bump" : ""}`}>
              {dislikes}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="mx-1 h-4 w-px bg-white/[0.06]" />

        {/* Comments */}
        <button
          onClick={toggleComments}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all active:scale-95 ${
            commentsOpen
              ? "bg-blue-500/10 text-blue-300"
              : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300"
          }`}
        >
          <CommentIcon />
          {commentCount > 0 && <span className="tabular-nums">{commentCount}</span>}
        </button>

        {/* Share */}
        <button
          onClick={handleShare}
          className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-neutral-500 transition-all active:scale-95 hover:bg-white/[0.04] hover:text-neutral-300"
        >
          <ShareIcon />
          <span>Share</span>
        </button>

        {/* Toast */}
        {shareToast && (
          <div className="absolute right-6 -top-11 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black shadow-lg shadow-black/20 animate-card-float-in">
            Link copied
          </div>
        )}
      </div>

      {/* ─── Comments section ─── */}
      {commentsOpen && (
        <div className="border-t border-white/[0.05]">
          <div className="px-6 pt-4 pb-2 max-h-64 overflow-y-auto">
            {commentsLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-4 h-4 border-2 border-neutral-700 border-t-neutral-400 rounded-full animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-neutral-600 text-center py-4">
                No comments yet
              </p>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[10px] font-mono text-neutral-500">
                      {c.author.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-neutral-300">
                          {c.author.name}
                        </span>
                        <span className="text-[10px] text-neutral-600">
                          {commentTimeAgo(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 mt-0.5 break-words">
                        {c.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comment input */}
          <form
            onSubmit={handleSubmitComment}
            className="px-6 pb-4 pt-2"
          >
            <div className="relative">
              <input
                ref={commentInputRef}
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                maxLength={1000}
                className="w-full rounded-[1rem] bg-white/[0.03] py-2.5 pl-3 pr-14 text-xs text-neutral-200 placeholder-neutral-600 outline-none ring-1 ring-inset ring-white/[0.06] transition-colors focus:ring-white/[0.14]"
              />
              <button
                type="submit"
                disabled={!newComment.trim() || commentSending}
                aria-label="Send comment"
                className="absolute bottom-1.5 right-1.5 top-1.5 flex w-8 items-center justify-center rounded-full bg-white text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500"
              >
                {commentSending ? (
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-black/20 border-t-black animate-spin" />
                ) : (
                  <ArrowUpIcon />
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
