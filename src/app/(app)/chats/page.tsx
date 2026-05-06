"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChatReportDialog } from "@/components/chat-report-dialog";

interface ChatPreview {
  matchId: string;
  chatId: string;
  chatStatus: string;
  otherPerson: {
    id: string;
    name: string | null;
    currentWork: string | null;
    profession: string | null;
  };
  lastMessage: {
    content: string;
    fromOwner: string;
    kind: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  overlapSummary: string;
}

export default function ChatsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuChatId, setOpenMenuChatId] = useState<string | null>(null);
  const [reportChat, setReportChat] = useState<ChatPreview | null>(null);
  const t = useTranslations();

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/chats")
      .then((r) => r.json())
      .then((data) => {
        if (data?.chats) setChats(data.chats);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionStatus]);

  useEffect(() => {
    if (!openMenuChatId) return;

    function closeMenu() {
      setOpenMenuChatId(null);
    }

    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [openMenuChatId]);

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="p-12 text-center text-neutral-500 text-sm">
        {t("chats.loadingChats")}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="px-6 py-10">
        <h1 className="text-2xl font-semibold text-white mb-6">{t("chats.title")}</h1>
        <div className="text-center pt-12 pb-8">
          <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mx-auto mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-neutral-500">
              <path
                d="M4 4h12a2 2 0 012 2v8a2 2 0 01-2 2H8l-4 3v-3a2 2 0 01-2-2V6a2 2 0 012-2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-white font-medium text-sm mb-1">{t("chats.noChats")}</p>
          <p className="text-neutral-500 text-xs leading-relaxed max-w-xs mx-auto mb-5">
            {t("chats.noChatsDesc")}
          </p>
          <Link
            href="/matches"
            className="text-xs text-neutral-400 hover:text-white transition-colors"
          >
            {t("chats.viewMatches")} &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-10">
      <h1 className="text-2xl font-semibold text-white mb-6">{t("chats.title")}</h1>

      <div className="flex flex-col">
        {chats.map((chat) => (
          <div
            key={chat.matchId}
            className="group relative -mx-4 rounded-xl transition-colors hover:bg-neutral-800/40"
          >
            <Link
              href={`/chat/${chat.matchId}`}
              className="flex items-center gap-3.5 px-4 py-4 pr-14"
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-semibold text-neutral-400 group-hover:bg-neutral-700 transition-colors">
                  {chat.otherPerson.name
                    ? chat.otherPerson.name.charAt(0).toUpperCase()
                    : "?"}
                </div>
                {chat.unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-[#050505]" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={`text-sm truncate ${
                      chat.unreadCount > 0
                        ? "font-semibold text-white"
                        : "font-medium text-neutral-300"
                    }`}
                  >
                    {chat.otherPerson.name ?? "Unknown"}
                  </span>
                  {chat.lastMessage && (
                    <span className="text-[11px] text-neutral-600 shrink-0 ml-2">
                      {formatTime(chat.lastMessage.createdAt)}
                    </span>
                  )}
                </div>

                {chat.otherPerson.profession && (
                  <p className="text-[11px] text-neutral-600 truncate mb-0.5">
                    {chat.otherPerson.profession}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <p
                    className={`text-xs truncate ${
                      chat.unreadCount > 0
                        ? "text-neutral-300"
                        : "text-neutral-500"
                    }`}
                  >
                    {chat.lastMessage
                      ? chat.lastMessage.fromOwner === session?.user?.id
                        ? t("chats.you", { message: chat.lastMessage.content })
                        : chat.lastMessage.kind === "AGENT_INTRO"
                        ? t("chats.agent", { message: chat.lastMessage.content })
                        : chat.lastMessage.kind.startsWith("MODEL_ADVICE")
                        ? t("chats.modelAdvice", { message: chat.lastMessage.content })
                        : chat.lastMessage.content
                      : t("chats.noMessages")}
                  </p>

                  {chat.unreadCount > 0 && (
                    <span className="shrink-0 ml-2 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-blue-500 text-white text-[11px] font-bold rounded-full">
                      {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>

            <div
              className="absolute right-1 top-1/2 z-10 -translate-y-1/2"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setOpenMenuChatId((current) =>
                    current === chat.chatId ? null : chat.chatId
                  )
                }
                aria-label={t("chat.actions.openMenu")}
                aria-expanded={openMenuChatId === chat.chatId}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-neutral-500 opacity-100 transition-colors hover:bg-white/5 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
              >
                <MoreIcon />
              </button>
              {openMenuChatId === chat.chatId && (
                <div className="absolute right-0 top-11 z-30 w-36 overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/98 p-1 shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenuChatId(null);
                      setReportChat(chat);
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
        ))}
      </div>
      <ChatReportDialog
        open={!!reportChat}
        chatId={reportChat?.chatId ?? null}
        targetName={reportChat?.otherPerson.name ?? null}
        onClose={() => setReportChat(null)}
      />
    </div>
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

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
