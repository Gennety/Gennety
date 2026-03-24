"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-neutral-500">
          Loading chat...
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}

function ChatContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const matchId = params.matchId as string;
  const ownerId = searchParams.get("ownerId");

  const [chat, setChat] = useState<ChatData | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/chat?matchId=${matchId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setChat(data);
        }
      })
      .catch(() => setError("Failed to load chat"));
  }, [matchId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages]);

  async function handleSend() {
    if (!newMessage.trim() || !ownerId || sending) return;
    setSending(true);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, ownerId, content: newMessage.trim() }),
    });

    const msg = await res.json();
    if (!msg.error && chat) {
      setChat({ ...chat, messages: [...chat.messages, msg] });
      setNewMessage("");
    }
    setSending(false);
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-12 text-center text-neutral-500 text-sm">
        {error}
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="max-w-xl mx-auto p-12 text-center text-neutral-500 text-sm">
        Loading chat...
      </div>
    );
  }

  if (!ownerId) {
    return (
      <div className="max-w-xl mx-auto p-12 text-center text-neutral-500 text-sm">
        Missing ownerId parameter.
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

  return (
    <div className="max-w-xl mx-auto px-6 flex flex-col h-screen">
      {/* Header */}
      <div className="py-6 border-b border-neutral-800">
        <h2 className="text-xl font-semibold text-white">
          {otherPerson.name ?? "Unknown"}
        </h2>
        {otherPerson.currentWork && (
          <p className="text-xs text-neutral-500 mt-1">
            {otherPerson.currentWork}
          </p>
        )}
      </div>

      {/* Overlap banner */}
      <div className="text-xs text-neutral-400 p-3 bg-neutral-900 border border-neutral-800 rounded-lg my-4 leading-relaxed">
        <strong className="text-neutral-300">Why you matched:</strong>{" "}
        {chat.overlapSummary}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-3">
        {chat.messages.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
              isAgentMessage(msg)
                ? "self-center max-w-[90%] bg-neutral-800/50 text-neutral-400 rounded-lg text-center"
                : isMyMessage(msg)
                ? "self-end bg-white text-black"
                : "self-start bg-neutral-800 text-neutral-200"
            }`}
          >
            {isAgentMessage(msg) && (
              <span className="block text-[11px] text-neutral-500 uppercase tracking-wide mb-1">
                Agent intro
              </span>
            )}
            <p className="m-0">{msg.content}</p>
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
          placeholder="Type a message..."
          className="flex-1 px-4 py-3 text-sm bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
        />
        <button
          onClick={handleSend}
          disabled={sending || !newMessage.trim()}
          className="px-5 py-3 text-sm font-semibold bg-white text-black rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}
