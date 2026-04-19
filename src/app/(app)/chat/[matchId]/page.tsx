"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useUnread } from "@/contexts/unread-context";
import { useTranslations } from "next-intl";

const POLL_INTERVAL = 5_000; // Poll for new messages every 5 seconds

interface Message {
  id: string;
  fromOwner: string;
  content: string;
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());

  // Fetch chat data
  const fetchChat = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?matchId=${matchId}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setChat(data);
        // Track known message IDs
        const ids = new Set<string>(data.messages.map((m: Message) => m.id));
        messageIdsRef.current = ids;
      }
    } catch {
      setError("Failed to load chat");
    }
  }, [matchId]);

  // Initial load + mark as read
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchChat().then(() => markAsRead());
  }, [matchId, sessionStatus, fetchChat, markAsRead]);

  // Poll for new messages
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !chat) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat?matchId=${matchId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.error) return;

        // Check if there are new messages
        const newMsgs = data.messages as Message[];
        const hasNew = newMsgs.some((m: Message) => !messageIdsRef.current.has(m.id));

        if (hasNew) {
          setChat(data);
          messageIdsRef.current = new Set(newMsgs.map((m: Message) => m.id));
          markAsRead();
        }
      } catch {
        // Retry next interval
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [sessionStatus, chat, matchId, markAsRead]);

  // Mark as read when tab becomes visible
  useEffect(() => {
    function handleVisibility() {
      if (!document.hidden && chat) {
        fetch(`/api/chat?matchId=${matchId}`).catch(() => {});
        markAsRead();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [chat, matchId, markAsRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

  async function handleSend() {
    if (!newMessage.trim() || !ownerId || sending) return;
    setSending(true);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, content: newMessage.trim() }),
    });

    const msg = await res.json();
    if (!msg.error && chat) {
      setChat({ ...chat, messages: [...chat.messages, msg] });
      messageIdsRef.current.add(msg.id);
      setNewMessage("");
      markAsRead();
    }
    setSending(false);
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

  if (!chat) {
    return (
      <div className="w-full p-12 text-center text-neutral-500 text-sm">
        {t("chat.loadingChat")}
      </div>
    );
  }

  const otherPerson =
    chat.participants.ownerA.id === ownerId
      ? chat.participants.ownerB
      : chat.participants.ownerA;

  function isAgentMessage(msg: Message) {
    return msg.fromOwner === "agent_a" || msg.fromOwner === "agent_b";
  }

  function isMyMessage(msg: Message) {
    return msg.fromOwner === ownerId;
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }

  function dayKey(dateStr: string) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function formatDayLabel(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((today - that) / 86_400_000);
    if (diffDays === 0) return t("chat.today");
    if (diffDays === 1) return t("chat.yesterday");
    const sameYear = d.getFullYear() === now.getFullYear();
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
      ...(sameYear ? {} : { year: "numeric" }),
    }).format(d);
  }

  const dayGroups: { key: string; messages: Message[] }[] = [];
  for (const msg of chat.messages) {
    const k = dayKey(msg.createdAt);
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.key === k) last.messages.push(msg);
    else dayGroups.push({ key: k, messages: [msg] });
  }

  return (
    <div className="w-full px-6 flex flex-col h-screen">
      {/* Header */}
      <div className="py-6 border-b border-neutral-800 flex items-center gap-3">
        <Link
          href="/chats"
          className="text-neutral-500 hover:text-white transition-colors lg:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </Link>
        <div>
          <h2 className="text-xl font-semibold text-white">
            {otherPerson.name ?? "Unknown"}
          </h2>
          {otherPerson.currentWork && (
            <p className="text-xs text-neutral-500 mt-1">
              {otherPerson.currentWork}
            </p>
          )}
        </div>
      </div>

      {/* Overlap banner */}
      <div className="text-xs text-neutral-400 p-3 bg-neutral-900 border border-neutral-800 rounded-lg my-4 leading-relaxed">
        <strong className="text-neutral-300">{t("chat.whyMatched")}</strong>{" "}
        {chat.overlapSummary}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col">
        {dayGroups.map((group) => (
          <div key={group.key} className="flex flex-col gap-3">
            <div className="sticky top-1 z-10 flex justify-center my-2 pointer-events-none">
              <span className="pointer-events-auto text-[11px] font-medium text-neutral-300 bg-neutral-900/70 backdrop-blur-md border border-white/5 px-3 py-1 rounded-full shadow-sm">
                {formatDayLabel(group.messages[0].createdAt)}
              </span>
            </div>
            {group.messages.map((msg) => {
              const agent = isAgentMessage(msg);
              const mine = isMyMessage(msg);
              const timeColor = mine ? "text-black/40" : "text-neutral-400/70";
              return (
                <div
                  key={msg.id}
                  className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                    agent
                      ? "self-center max-w-[90%] bg-neutral-800/50 text-neutral-400 rounded-lg text-center px-3.5 py-2.5"
                      : mine
                      ? "self-end bg-white text-black"
                      : "self-start bg-neutral-800 text-neutral-200"
                  }`}
                >
                  {agent ? (
                    <>
                      <span className="block text-[11px] text-neutral-500 uppercase tracking-wide mb-1">
                        {t("chat.agentIntro")}
                      </span>
                      <p className="m-0">{msg.content}</p>
                    </>
                  ) : (
                    <>
                      <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                      <span
                        className={`float-right ml-2 mt-1.5 text-[10px] tabular-nums select-none ${timeColor}`}
                      >
                        {formatTime(msg.createdAt)}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 py-4 border-t border-neutral-800">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={t("chat.typePlaceholder")}
          className="flex-1 px-4 py-3 text-sm bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
        />
        <button
          onClick={handleSend}
          disabled={sending || !newMessage.trim()}
          className="px-5 py-3 text-sm font-semibold bg-white text-black rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t("common.send")}
        </button>
      </div>
    </div>
  );
}
