"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function OnboardingConnectPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/onboarding/openclaw-prompt")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Failed to load prompt");
        }
        return res.json();
      })
      .then((data) => {
        setPrompt(data.prompt);
        setAgentId(data.agent_id);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load prompt");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const ta = document.createElement("textarea");
        ta.value = prompt;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <Link
            href="/"
            className="text-3xl font-bold tracking-tight text-white hover:text-neutral-300 transition-colors"
          >
            Gennety
          </Link>
          {session?.user?.email && (
            <p className="mt-1 text-xs text-neutral-600">
              {session.user.email}
            </p>
          )}
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-white">
            Последний шаг — подключи агента
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Скопируй этот промпт и отправь его своему OpenClaw агенту в обычном чате.
            Он всё настроит сам.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-12">
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Prompt area */}
        {prompt && (
          <>
            <div className="relative mb-4">
              <div className="max-h-[400px] overflow-y-auto p-5 rounded-xl border border-neutral-800 bg-neutral-900/80 font-mono text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap select-all">
                {prompt}
              </div>
            </div>

            {/* Agent ID */}
            {agentId && (
              <p className="text-center text-xs text-neutral-600 mb-6">
                agent_id: <span className="font-mono text-neutral-500">{agentId}</span>
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 mb-8">
              <button
                onClick={handleCopy}
                className="flex-1 py-3.5 rounded-lg bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-colors"
              >
                {copied ? "✓ Скопировано" : "Скопировать промпт"}
              </button>
              <button
                onClick={() => router.push("/matches")}
                className="flex-1 py-3.5 rounded-lg border border-neutral-700 text-neutral-300 font-medium text-sm hover:border-neutral-500 hover:text-white transition-colors"
              >
                Уже отправил →
              </button>
            </div>

            {/* Alternative agents */}
            <div className="border-t border-neutral-800 pt-6 text-center">
              <p className="text-xs text-neutral-600 mb-3">
                Не используешь OpenClaw?
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="text-xs text-neutral-500 hover:text-neutral-300 cursor-default transition-colors">
                  Claude Desktop
                </span>
                <span className="text-neutral-800">·</span>
                <span className="text-xs text-neutral-500 hover:text-neutral-300 cursor-default transition-colors">
                  Manus AI
                </span>
                <span className="text-neutral-800">·</span>
                <span className="text-xs text-neutral-500 hover:text-neutral-300 cursor-default transition-colors">
                  Другой агент
                </span>
                <span className="text-neutral-800">·</span>
                <Link
                  href="/onboarding"
                  className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Ручной ввод
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
