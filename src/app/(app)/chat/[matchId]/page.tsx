"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChatReportDialog } from "@/components/chat-report-dialog";
import { useUnread } from "@/contexts/unread-context";
import { useTranslations } from "next-intl";
import { MODEL_ADVICE_PRESETS } from "@/lib/model-advice";

const POLL_INTERVAL = 5_000;
const MAX_TEXTAREA_HEIGHT = 132;

interface Message {
  id: string;
  fromOwner: string;
  kind: string;
  adviceSessionId: string | null;
  content: string;
  createdAt: string;
}

interface AdviceSession {
  id: string;
  requestedByOwnerId: string;
  responderOwnerId: string | null;
  promptKey: string | null;
  promptTitle: string;
  promptText: string;
  status: string;
  respondedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  summary: string | null;
  recommendation: string | null;
  createdAt: string;
}

interface ChatData {
  chatId: string;
  matchId: string;
  overlapSummary: string;
  participants: {
    ownerA: { id: string; name: string | null; currentWork: string | null };
    ownerB: { id: string; name: string | null; currentWork: string | null };
  };
  messages: Message[];
  adviceSessions: AdviceSession[];
}

function ModelAdviceIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <g transform="rotate(-45 50 50)">
        <rect x="20" y="25" width="60" height="24" rx="6" />
        <line x1="40" y1="25" x2="40" y2="49" />
        <line x1="60" y1="25" x2="60" y2="49" />
        <path d="M40 49v51a10 10 0 0010 10h0a10 10 0 0010-10V49" />
      </g>
      <line x1="10" y1="90" x2="45" y2="90" />
    </svg>
  );
}

function SearchIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5L17 17" />
    </svg>
  );
}

function ExportIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10 3v8" />
      <path d="M6.5 8.5L10 12l3.5-3.5" />
      <path d="M4 14.5h12" />
    </svg>
  );
}

function MoreIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="10" cy="4" r="1" />
      <circle cx="10" cy="10" r="1" />
      <circle cx="10" cy="16" r="1" />
    </svg>
  );
}

function FlagIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 17V4" />
      <path d="M5 4h9l-1.4 3L14 10H5" />
    </svg>
  );
}

function ChevronIcon({
  className = "w-4 h-4",
  open = false,
}: {
  className?: string;
  open?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M5 7.5l5 5 5-5" />
    </svg>
  );
}

function CloseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 5l10 10" />
      <path d="M15 5L5 15" />
    </svg>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({
  text,
  query,
  markClassName,
}: {
  text: string;
  query: string;
  markClassName: string;
}) {
  if (!query) return <>{text}</>;

  const normalizedQuery = query.trim();
  if (!normalizedQuery) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escapeRegExp(normalizedQuery)})`, "ig"));

  return (
    <>
      {parts.map((part, index) => {
        const isMatch = part.toLowerCase() === normalizedQuery.toLowerCase();
        if (!isMatch) return <Fragment key={`${part}-${index}`}>{part}</Fragment>;

        return (
          <mark key={`${part}-${index}`} className={markClassName}>
            {part}
          </mark>
        );
      })}
    </>
  );
}

export default function ChatPage() {
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const matchId = params.matchId as string;
  const ownerId = session?.user?.id;
  const { markAsRead } = useUnread();
  const t = useTranslations();

  const [chat, setChat] = useState<ChatData | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advicePresetId, setAdvicePresetId] = useState<string>(MODEL_ADVICE_PRESETS[0]?.id ?? "");
  const [submittingAdvice, setSubmittingAdvice] = useState(false);
  const [respondingAdvice, setRespondingAdvice] = useState(false);
  const [cancellingAdvice, setCancellingAdvice] = useState(false);
  const [sidebarSlot, setSidebarSlot] = useState<HTMLElement | null>(null);
  const [isAdvicePanelOpen, setIsAdvicePanelOpen] = useState(false);
  const [dismissedAdviceTipKey, setDismissedAdviceTipKey] = useState<string | null>(null);
  const [isMatchReasonDismissed, setIsMatchReasonDismissed] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    autosize();
  }, [newMessage, autosize]);

  const fetchChat = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?matchId=${matchId}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      setError(null);
      setChat(data);
      messageIdsRef.current = new Set<string>(data.messages.map((message: Message) => message.id));
    } catch {
      setError("Failed to load chat");
    }
  }, [matchId]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchChat().then(() => markAsRead());
  }, [fetchChat, markAsRead, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !chat) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat?matchId=${matchId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.error) return;

        const nextMessages = data.messages as Message[];
        const hasNew = nextMessages.some((message) => !messageIdsRef.current.has(message.id));
        const adviceChanged =
          JSON.stringify(data.adviceSessions) !== JSON.stringify(chat.adviceSessions);

        if (hasNew || adviceChanged) {
          setChat(data);
          messageIdsRef.current = new Set(nextMessages.map((message) => message.id));
          markAsRead();
        }
      } catch {
        // Retry on next tick.
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [chat, markAsRead, matchId, sessionStatus]);

  useEffect(() => {
    function handleVisibility() {
      if (!document.hidden && chat) {
        fetch(`/api/chat?matchId=${matchId}`).catch(() => {});
        markAsRead();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [chat, markAsRead, matchId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }

      if (
        event.key === "Escape" &&
        document.activeElement === searchInputRef.current &&
        searchQuery
      ) {
        event.preventDefault();
        setSearchQuery("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery]);

  useEffect(() => {
    const desktopMedia = window.matchMedia("(min-width: 1024px)");

    const syncSidebarSlot = () => {
      setSidebarSlot(
        desktopMedia.matches
          ? document.getElementById("app-right-sidebar-slot")
          : null
      );
    };

    syncSidebarSlot();
    desktopMedia.addEventListener("change", syncSidebarSlot);

    return () => desktopMedia.removeEventListener("change", syncSidebarSlot);
  }, []);

  useEffect(() => {
    if (!isActionsMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        actionsMenuRef.current &&
        !actionsMenuRef.current.contains(event.target as Node)
      ) {
        setIsActionsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isActionsMenuOpen]);

  const otherPerson = useMemo(() => {
    if (!chat || !ownerId) return null;
    return chat.participants.ownerA.id === ownerId
      ? chat.participants.ownerB
      : chat.participants.ownerA;
  }, [chat, ownerId]);

  const isOwnerA = !!chat && chat.participants.ownerA.id === ownerId;
  const myIntroSlot = isOwnerA ? "agent_a" : "agent_b";
  const myAdviceSlot = isOwnerA ? "advice_agent_a" : "advice_agent_b";

  const adviceSessionMap = useMemo(
    () => new Map((chat?.adviceSessions ?? []).map((session) => [session.id, session])),
    [chat?.adviceSessions]
  );

  const filteredMessages = useMemo(() => {
    const messages = chat?.messages ?? [];
    if (!deferredSearchQuery) return messages;

    const normalizedQuery = deferredSearchQuery.toLowerCase();
    return messages.filter((message) => message.content.toLowerCase().includes(normalizedQuery));
  }, [chat?.messages, deferredSearchQuery]);

  const hasActiveSearch = deferredSearchQuery.length > 0;

  const latestAdviceSession = chat?.adviceSessions[0] ?? null;
  const latestAdviceSessionId = latestAdviceSession?.id;
  const latestAdviceStatus = latestAdviceSession?.status;
  const adviceLocked =
    latestAdviceStatus === "PENDING" || latestAdviceStatus === "ACTIVE";
  const awaitingMyAdviceApproval =
    latestAdviceStatus === "PENDING" &&
    latestAdviceSession?.requestedByOwnerId !== ownerId;
  const showModelAdviceNote =
    !latestAdviceStatus ||
    latestAdviceStatus === "DECLINED" ||
    latestAdviceStatus === "FAILED" ||
    latestAdviceStatus === "CANCELLED";
  const adviceTipKey = latestAdviceSessionId
    ? `${latestAdviceSessionId}:${latestAdviceStatus ?? "unknown"}`
    : "idle";
  const showFloatingAdviceTip =
    showModelAdviceNote && dismissedAdviceTipKey !== adviceTipKey;
  const matchReasonDismissKey = chat
    ? `gennety-chat-match-reason:${matchId}:${chat.overlapSummary}`
    : null;

  useEffect(() => {
    if (!latestAdviceStatus) return;

    if (latestAdviceStatus === "PENDING" || latestAdviceStatus === "ACTIVE") {
      setIsAdvicePanelOpen(true);
    }
  }, [latestAdviceSessionId, latestAdviceStatus]);

  useEffect(() => {
    if (!matchReasonDismissKey) return;

    try {
      setIsMatchReasonDismissed(window.localStorage.getItem(matchReasonDismissKey) === "1");
    } catch {
      setIsMatchReasonDismissed(false);
    }
  }, [matchReasonDismissKey]);

  function isAgentIntro(msg: Message) {
    return msg.kind === "AGENT_INTRO";
  }

  function isAdviceAgentMessage(msg: Message) {
    return msg.kind === "MODEL_ADVICE_AGENT";
  }

  function isHumanMessage(msg: Message) {
    return msg.kind === "HUMAN";
  }

  function isMyMessage(msg: Message) {
    return msg.fromOwner === ownerId;
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr);
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  }

  function dayKey(dateStr: string) {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function formatDayLabel(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const that = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diffDays = Math.round((today - that) / 86_400_000);
    if (diffDays === 0) return t("chat.today");
    if (diffDays === 1) return t("chat.yesterday");
    const sameYear = date.getFullYear() === now.getFullYear();
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
      ...(sameYear ? {} : { year: "numeric" }),
    }).format(date);
  }

  function getMessageAuthorLabel(message: Message) {
    if (isHumanMessage(message)) {
      return isMyMessage(message)
        ? t("chat.roles.you")
        : otherPerson?.name ?? t("common.unknown");
    }

    if (isAgentIntro(message)) {
      return message.fromOwner === myIntroSlot
        ? t("chat.roles.yourAgent")
        : t("chat.roles.otherAgent", {
            name: otherPerson?.name ?? t("common.unknown"),
          });
    }

    if (isAdviceAgentMessage(message)) {
      return message.fromOwner === myAdviceSlot
        ? t("chat.roles.yourAgent")
        : t("chat.roles.otherAgent", {
            name: otherPerson?.name ?? t("common.unknown"),
          });
    }

    return t("chat.roles.modelAdvice");
  }

  function handleExport() {
    if (!chat || !otherPerson) return;

    const formatDateTime = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const lines = [
      t("chat.exportFile.title", {
        name: otherPerson.name ?? t("common.unknown"),
      }),
      `${t("chat.exportFile.generatedAt")}: ${formatDateTime.format(new Date())}`,
      `${t("chat.exportFile.participants")}: ${t("chat.roles.you")} / ${
        otherPerson.name ?? t("common.unknown")
      }`,
      `${t("chat.exportFile.messageCount")}: ${chat.messages.length}`,
      `${t("chat.exportFile.matchReason")}: ${chat.overlapSummary}`,
      "",
      ...chat.messages.flatMap((message) => {
        const header = `[${formatDateTime.format(new Date(message.createdAt))}] ${getMessageAuthorLabel(message)}`;
        const indentedContent = message.content.replace(/\n/g, "\n  ");
        return [`${header}`, `  ${indentedContent}`, ""];
      }),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateSuffix = new Date().toISOString().slice(0, 10);
    link.href = objectUrl;
    link.download = `gennety-chat-${matchId}-${dateSuffix}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }

  async function handleSend() {
    if (!newMessage.trim() || !ownerId || sending) return;
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, content: newMessage.trim() }),
      });

      const msg = await res.json();
      if (msg.error) {
        setError(msg.error);
        return;
      }

      if (chat) {
        setChat({ ...chat, messages: [...chat.messages, msg] });
        messageIdsRef.current.add(msg.id);
      }
      setNewMessage("");
      markAsRead();
    } finally {
      setSending(false);
    }
  }

  async function handleRequestAdvice() {
    if (!chat || !ownerId || adviceLocked || submittingAdvice) return;
    setSubmittingAdvice(true);
    setIsAdvicePanelOpen(true);

    try {
      const res = await fetch("/api/chat/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, promptKey: advicePresetId }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      await fetchChat();
    } finally {
      setSubmittingAdvice(false);
    }
  }

  async function handleAdviceDecision(action: "approve" | "decline") {
    if (!latestAdviceSession || respondingAdvice) return;
    setRespondingAdvice(true);

    try {
      const res = await fetch("/api/chat/advice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: latestAdviceSession.id, action }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      await fetchChat();
    } finally {
      setRespondingAdvice(false);
    }
  }

  async function handleCancelAdvice() {
    if (
      !latestAdviceSession ||
      cancellingAdvice ||
      (latestAdviceSession.status !== "PENDING" && latestAdviceSession.status !== "ACTIVE")
    ) {
      return;
    }

    setCancellingAdvice(true);
    setIsAdvicePanelOpen(true);

    try {
      const res = await fetch("/api/chat/advice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: latestAdviceSession.id, action: "cancel" }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      await fetchChat();
    } finally {
      setCancellingAdvice(false);
    }
  }

  if (sessionStatus === "loading") {
    return (
      <div className="w-full p-12 text-center text-neutral-500 text-sm">
        {t("chat.loadingChat")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-12 text-center text-neutral-500 text-sm">
        {error}
      </div>
    );
  }

  if (!chat || !otherPerson) {
    return (
      <div className="w-full p-12 text-center text-neutral-500 text-sm">
        {t("chat.loadingChat")}
      </div>
    );
  }

  const dayGroups: { key: string; messages: Message[] }[] = [];
  for (const message of filteredMessages) {
    const key = dayKey(message.createdAt);
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.key === key) last.messages.push(message);
    else dayGroups.push({ key, messages: [message] });
  }

  const latestAdviceRequesterName =
    latestAdviceSession?.requestedByOwnerId === chat.participants.ownerA.id
      ? chat.participants.ownerA.name
      : latestAdviceSession
      ? chat.participants.ownerB.name
      : null;

  const modelAdvicePanelProps = {
    t,
    ownerId: ownerId ?? "",
    latestAdviceSession,
    latestAdviceRequesterName,
    adviceLocked,
    advicePresetId,
    awaitingMyAdviceApproval: !!awaitingMyAdviceApproval,
    submittingAdvice,
    respondingAdvice,
    cancellingAdvice,
    isOpen: isAdvicePanelOpen,
    onPresetChange: setAdvicePresetId,
    onToggleOpen: () => setIsAdvicePanelOpen((current) => !current),
    onRequest: handleRequestAdvice,
    onApprove: () => handleAdviceDecision("approve"),
    onDecline: () => handleAdviceDecision("decline"),
    onCancel: handleCancelAdvice,
  };

  return (
    <div className="w-full h-screen px-4 sm:px-6 lg:px-8">
      <section className="min-w-0 flex flex-col h-screen">
        <div className="py-6 border-b border-neutral-800 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/chats"
              className="text-neutral-500 hover:text-white transition-colors lg:hidden"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 4l-6 6 6 6" />
              </svg>
            </Link>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-white">
                {otherPerson.name ?? t("common.unknown")}
              </h2>
              {otherPerson.currentWork && (
                <p className="mt-1 truncate text-xs text-neutral-500">
                  {otherPerson.currentWork}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">{t("chat.searchLabel")}</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("chat.searchPlaceholder")}
                className="chat-search-input w-full rounded-2xl border border-neutral-800 bg-neutral-900/80 py-2.5 pl-10 pr-24 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
                  aria-label={t("chat.clearSearch")}
                >
                  {t("chat.clearSearch")}
                </button>
              )}
            </label>

            <div className="flex items-center gap-2">
              {hasActiveSearch && (
                <span className="rounded-full border border-white/8 bg-white/5 px-3 py-2 text-xs text-neutral-300">
                  {t("chat.searchMatches", { count: filteredMessages.length })}
                </span>
              )}
              <div ref={actionsMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsActionsMenuOpen((current) => !current)}
                  aria-label={t("chat.actions.openMenu")}
                  aria-expanded={isActionsMenuOpen}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition-colors hover:border-white/20 hover:bg-white/8"
                >
                  <MoreIcon />
                </button>
                {isActionsMenuOpen && (
                  <div className="absolute right-0 top-12 z-30 w-44 overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/98 p-1 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        handleExport();
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-200 transition-colors hover:bg-white/8 hover:text-white"
                    >
                      <ExportIcon />
                      <span>{t("chat.export")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        setIsReportDialogOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-100 transition-colors hover:bg-red-500/10"
                    >
                      <FlagIcon />
                      <span>{t("chat.report.action")}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {!isMatchReasonDismissed && (
          <div className="relative my-4 rounded-lg border border-neutral-800 bg-neutral-900 p-3 pr-12 text-xs leading-relaxed text-neutral-400">
            <button
              type="button"
              onClick={() => {
                setIsMatchReasonDismissed(true);

                if (!matchReasonDismissKey) return;

                try {
                  window.localStorage.setItem(matchReasonDismissKey, "1");
                } catch {
                  // Ignore storage failures and keep local UI state.
                }
              }}
              aria-label={t("chat.dismissMatchReason")}
              className="absolute right-2 top-2 p-1 text-neutral-500/70 transition-colors hover:text-white"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
            <strong className="text-neutral-300">{t("chat.whyMatched")}</strong>{" "}
            {chat.overlapSummary}
          </div>
        )}

        <div className="relative flex-1 min-h-0">
          {showFloatingAdviceTip && (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-20 hidden justify-end px-2 sm:px-4 lg:flex">
              <ModelAdviceChatNote
                dismissLabel={t("chat.modelAdvice.dismissTip")}
                text={t("chat.modelAdvice.description")}
                onDismiss={() => setDismissedAdviceTipKey(adviceTipKey)}
              />
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-end px-2 sm:px-4 lg:hidden">
            <div className="pointer-events-auto w-full max-w-[22rem]">
              <ModelAdvicePanel {...modelAdvicePanelProps} />
            </div>
          </div>

          <div className="flex h-full flex-col overflow-y-auto py-4 no-scrollbar">
          {hasActiveSearch && filteredMessages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <div className="max-w-sm rounded-[28px] border border-white/8 bg-neutral-900/70 px-6 py-8">
                <p className="text-sm font-medium text-white">
                  {t("chat.searchNoResults", { query: deferredSearchQuery })}
                </p>
                <p className="mt-2 text-sm text-neutral-500">{t("chat.searchEmptyHint")}</p>
              </div>
            </div>
          ) : (
            dayGroups.map((group) => (
            <div key={group.key} className="flex flex-col gap-3">
              <div className="sticky top-1 z-10 flex justify-center my-2 pointer-events-none">
                <span className="pointer-events-auto text-[11px] font-medium text-neutral-300 bg-neutral-900/70 backdrop-blur-md border border-white/5 px-3 py-1 rounded-full shadow-sm">
                  {formatDayLabel(group.messages[0].createdAt)}
                </span>
              </div>

              {group.messages.map((message) => {
                if (isHumanMessage(message)) {
                  const mine = isMyMessage(message);
                  const timeColor = mine ? "text-black/40" : "text-neutral-400/70";

                  return (
                    <div
                      key={message.id}
                      className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                        mine
                          ? "self-end bg-white text-black"
                          : "self-start bg-neutral-800 text-neutral-200"
                      }`}
                    >
                      <span className="whitespace-pre-wrap break-words">
                        <HighlightedText
                          text={message.content}
                          query={deferredSearchQuery}
                          markClassName={
                            mine
                              ? "rounded bg-black/10 px-0.5 text-black"
                              : "rounded bg-white/10 px-0.5 text-white"
                          }
                        />
                      </span>
                      <span
                        className={`float-right ml-2 mt-1.5 text-[10px] tabular-nums select-none ${timeColor}`}
                      >
                        {formatTime(message.createdAt)}
                      </span>
                    </div>
                  );
                }

                if (isAgentIntro(message)) {
                  return (
                    <div
                      key={message.id}
                      className="self-center max-w-[90%] bg-neutral-800/50 text-neutral-400 rounded-lg text-center px-3.5 py-2.5 text-sm"
                    >
                      <span className="block text-[11px] text-neutral-500 uppercase tracking-wide mb-1">
                        {message.fromOwner === myIntroSlot
                          ? t("chat.agentIntroFromYou")
                          : t("chat.agentIntroFromOther", {
                              name: otherPerson.name ?? t("common.unknown"),
                            })}
                      </span>
                      <p className="m-0 whitespace-pre-wrap">
                        <HighlightedText
                          text={message.content}
                          query={deferredSearchQuery}
                          markClassName="rounded bg-white/10 px-0.5 text-neutral-100"
                        />
                      </p>
                    </div>
                  );
                }

                if (isAdviceAgentMessage(message)) {
                  const mine = message.fromOwner === myAdviceSlot;
                  return (
                    <div
                      key={message.id}
                      className={`max-w-[88%] rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                        mine
                          ? "self-end border-amber-300/20 bg-amber-200 text-[#241600]"
                          : "self-start border-cyan-400/15 bg-cyan-950/60 text-cyan-50"
                      }`}
                    >
                      <span
                        className={`block text-[11px] uppercase tracking-[0.16em] mb-1 ${
                          mine ? "text-[#6a4300]/70" : "text-cyan-200/65"
                        }`}
                      >
                        {mine
                          ? t("chat.modelAdvice.yourAgent")
                          : t("chat.modelAdvice.otherAgent", {
                              name: otherPerson.name ?? t("common.unknown"),
                            })}
                      </span>
                      <p className="m-0 whitespace-pre-wrap">
                        <HighlightedText
                          text={message.content}
                          query={deferredSearchQuery}
                          markClassName={
                            mine
                              ? "rounded bg-black/10 px-0.5 text-[#241600]"
                              : "rounded bg-white/10 px-0.5 text-white"
                          }
                        />
                      </p>
                    </div>
                  );
                }

                const session = message.adviceSessionId
                  ? adviceSessionMap.get(message.adviceSessionId)
                  : null;
                const isActiveAdvice =
                  message.kind === "MODEL_ADVICE_STATUS" && session?.status === "ACTIVE";

                return (
                  <div key={message.id} className="self-center max-w-[92%]">
                    <div
                      className={`relative overflow-hidden rounded-2xl border px-4 py-3 text-sm whitespace-pre-wrap ${
                        message.kind === "MODEL_ADVICE_RESULT"
                          ? "border-amber-300/20 bg-gradient-to-br from-neutral-900 to-amber-950/40 text-neutral-100"
                          : "border-neutral-800 bg-neutral-900/80 text-neutral-300"
                      } ${isActiveAdvice ? "model-advice-shimmer model-advice-pulse" : ""}`}
                    >
                      <div className="mb-2 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                        <ModelAdviceIcon className="w-4 h-4" />
                        <span>
                          {message.kind === "MODEL_ADVICE_RESULT"
                            ? t("chat.modelAdvice.reportBadge")
                            : t("chat.modelAdvice.badge")}
                        </span>
                      </div>
                      <HighlightedText
                        text={message.content}
                        query={deferredSearchQuery}
                        markClassName="rounded bg-amber-200/15 px-0.5 text-amber-100"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            ))
          )}
          <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="flex gap-2 py-4 border-t border-neutral-800 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder={t("chat.typePlaceholder")}
            className="flex-1 px-4 py-3 text-sm bg-neutral-900 border border-neutral-800 rounded-2xl text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-600 resize-none leading-5 break-words"
            style={{ maxHeight: MAX_TEXTAREA_HEIGHT, overflowY: "hidden" }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !newMessage.trim()}
            aria-label={t("common.send")}
            className="relative px-5 py-3 text-sm font-semibold bg-white text-black rounded-2xl hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className={sending ? "invisible" : ""}>{t("common.send")}</span>
            {sending && (
              <span
                className="absolute inset-0 flex items-center justify-center gap-1"
                aria-hidden="true"
              >
                <span
                  className="w-1 h-1 bg-black rounded-full animate-dot-blink"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-1 h-1 bg-black rounded-full animate-dot-blink"
                  style={{ animationDelay: "200ms" }}
                />
                <span
                  className="w-1 h-1 bg-black rounded-full animate-dot-blink"
                  style={{ animationDelay: "400ms" }}
                />
              </span>
            )}
          </button>
        </div>
      </section>
      {sidebarSlot
        ? createPortal(<ModelAdvicePanel {...modelAdvicePanelProps} />, sidebarSlot)
        : null}
      <ChatReportDialog
        open={isReportDialogOpen}
        chatId={chat.chatId}
        targetName={otherPerson.name}
        onClose={() => setIsReportDialogOpen(false)}
      />
    </div>
  );
}

function ModelAdvicePanel({
  t,
  ownerId,
  latestAdviceSession,
  latestAdviceRequesterName,
  adviceLocked,
  advicePresetId,
  awaitingMyAdviceApproval,
  submittingAdvice,
  respondingAdvice,
  cancellingAdvice,
  isOpen,
  onPresetChange,
  onToggleOpen,
  onRequest,
  onApprove,
  onDecline,
  onCancel,
}: {
  t: ReturnType<typeof useTranslations>;
  ownerId: string;
  latestAdviceSession: AdviceSession | null;
  latestAdviceRequesterName: string | null;
  adviceLocked: boolean;
  advicePresetId: string;
  awaitingMyAdviceApproval: boolean;
  submittingAdvice: boolean;
  respondingAdvice: boolean;
  cancellingAdvice: boolean;
  isOpen: boolean;
  onPresetChange: (value: string) => void;
  onToggleOpen: () => void;
  onRequest: () => void;
  onApprove: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  const isRequester = latestAdviceSession?.requestedByOwnerId === ownerId;
  const isPendingRequester = latestAdviceSession?.status === "PENDING" && isRequester;
  const isActiveSession = latestAdviceSession?.status === "ACTIVE";
  const canCancel =
    !!latestAdviceSession &&
    (latestAdviceSession.status === "PENDING" || latestAdviceSession.status === "ACTIVE");
  const showLoadingState = submittingAdvice || isPendingRequester || isActiveSession;
  const shimmer = isActiveSession;
  const controlsDisabled = adviceLocked || cancellingAdvice || respondingAdvice;
  const loadingLabel = isActiveSession
    ? t("chat.modelAdvice.processing")
    : t("chat.modelAdvice.waitingForOther");

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[28px] border border-white/12 bg-white/8 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl ${
        shimmer ? "model-advice-shimmer model-advice-pulse" : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.02)_38%,rgba(255,255,255,0.01)_100%)]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/20" />
      <div className="relative">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex w-full items-start justify-between gap-3 text-left"
          aria-expanded={isOpen}
        >
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/10 p-2 text-amber-100">
              <ModelAdviceIcon className="w-4 h-4" />
            </div>
            <p className="pt-0.5 text-sm font-semibold">{t("chat.modelAdvice.title")}</p>
          </div>
          <ChevronIcon open={isOpen} className="mt-1 w-4 h-4 text-neutral-400" />
        </button>

        {isOpen && awaitingMyAdviceApproval && latestAdviceSession ? (
          <div className="mt-4 rounded-[22px] bg-white/7 p-4 backdrop-blur-xl">
            <p className="text-sm font-medium text-white">
              {t("chat.modelAdvice.approvalTitle", {
                name: latestAdviceRequesterName ?? t("common.unknown"),
              })}
            </p>
            <p className="mt-3 rounded-2xl bg-black/15 px-3 py-2.5 text-sm leading-relaxed text-neutral-200 whitespace-pre-wrap">
              {latestAdviceSession.promptText}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={onApprove}
                disabled={respondingAdvice || cancellingAdvice}
                className="flex-1 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-40"
              >
                {respondingAdvice ? t("chat.modelAdvice.processing") : t("chat.modelAdvice.approve")}
              </button>
              <button
                onClick={onDecline}
                disabled={respondingAdvice || cancellingAdvice}
                className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm text-neutral-100 transition-colors hover:bg-white/14 disabled:opacity-40"
              >
                {t("chat.modelAdvice.decline")}
              </button>
            </div>
          </div>
        ) : isOpen ? (
          <>
            <div className="mt-4 space-y-2">
              {MODEL_ADVICE_PRESETS.map((preset) => {
                const active = advicePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onPresetChange(preset.id)}
                    disabled={controlsDisabled}
                    className={`w-full rounded-2xl px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "bg-white/16 text-white"
                        : "bg-white/[0.045] text-neutral-300 hover:bg-white/8"
                    } disabled:opacity-50`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="block text-sm font-medium">{preset.title}</span>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          active ? "bg-amber-200" : "bg-neutral-700"
                        }`}
                      />
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={onRequest}
              disabled={adviceLocked || submittingAdvice || cancellingAdvice}
              className={`relative mt-3 w-full overflow-hidden rounded-2xl bg-amber-200 px-4 py-3 text-sm font-semibold text-[#241600] transition-colors hover:bg-amber-100 disabled:opacity-40 ${
                showLoadingState ? "model-advice-shimmer model-advice-pulse" : ""
              }`}
            >
              <span className="relative z-[1]">
                {cancellingAdvice
                  ? t("chat.modelAdvice.cancelling")
                  : showLoadingState
                  ? t("chat.modelAdvice.processing")
                  : t("chat.modelAdvice.request")}
              </span>
            </button>

            {showLoadingState && (
              <div className="mt-4">
                <div className="model-advice-loader-track">
                  <span className="model-advice-loader-bar" />
                </div>
                <p className="mt-2 text-center text-xs text-neutral-400">
                  {loadingLabel}
                </p>
                {canCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={cancellingAdvice || respondingAdvice}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/10 disabled:opacity-40"
                  >
                    {cancellingAdvice
                      ? t("chat.modelAdvice.cancelling")
                      : t("common.cancel")}
                  </button>
                )}
              </div>
            )}
          </>
        ) : null}

        {latestAdviceSession?.status === "COMPLETED" && (
          <div className="mt-3 rounded-2xl bg-white/7 p-4 backdrop-blur-xl">
            <p className="text-sm text-white">{latestAdviceSession.promptTitle}</p>
            {latestAdviceSession.summary && (
              <p className="mt-2 text-xs leading-relaxed text-neutral-300">
                {latestAdviceSession.summary}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ModelAdviceChatNote({
  dismissLabel,
  text,
  onDismiss,
}: {
  dismissLabel: string;
  text: string;
  onDismiss: () => void;
}) {
  return (
    <aside className="model-advice-note model-advice-shimmer pointer-events-auto relative w-full max-w-[20rem] overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-neutral-900/96 to-black px-3.5 py-3 text-[13px] text-neutral-300 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="group absolute right-1 top-1 z-10 flex h-10 w-10 cursor-pointer touch-manipulation items-center justify-center text-neutral-400 transition-all duration-200 ease-in-out hover:text-white active:scale-[0.96] active:text-white"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-inset ring-white/[0.08] transition-all duration-200 ease-in-out group-hover:bg-white/[0.08] group-hover:ring-white/[0.14] group-active:bg-white/[0.12]">
          <CloseIcon className="w-3.5 h-3.5" />
        </span>
      </button>
      <p className="model-advice-note-copy m-0 pr-10 leading-relaxed text-neutral-300">
        {text}
      </p>
    </aside>
  );
}
