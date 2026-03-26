"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

type Step = "goal" | "consent" | "sensitive" | "research" | "complete";
type Goal = "partnership" | "collaboration" | "mentor" | "peer";

const GOALS: { value: Goal; label: string; description: string }[] = [
  {
    value: "partnership",
    label: "Find a business partner",
    description: "Someone to build with — complementary skills, shared vision",
  },
  {
    value: "collaboration",
    label: "Find a collaborator",
    description: "Someone working on a similar problem from a different angle",
  },
  {
    value: "mentor",
    label: "Find a mentor or mentee",
    description: "Learn from experience or share your knowledge",
  },
  {
    value: "peer",
    label: "Find a peer",
    description: "Someone in your field to exchange ideas and challenges",
  },
];

const SENSITIVE_CATEGORIES = [
  "Health & personal issues",
  "Finances & debts",
  "Personal relationships",
  "Psychological topics",
];

export default function OnboardingPage() {
  const { data: session, update: updateSession } = useSession();
  const [step, setStep] = useState<Step>("goal");
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [excludedTopics, setExcludedTopics] = useState<string[]>([]);
  const [researchConsent, setResearchConsent] = useState(false);
  const [result, setResult] = useState<{
    owner: { id: string };
    agent: { agentId: string; apiKey: string };
    soulMdEndpoint: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoalSelect = (goal: Goal) => {
    setSelectedGoal(goal);
    setStep("consent");
  };

  const handleConsentYes = () => {
    setStep("sensitive");
  };

  const handleConsentNo = () => {
    setError(
      "Gennety requires access to your agent's memory for networking. Without consent, the platform cannot function."
    );
  };

  const toggleExcluded = (topic: string) => {
    setExcludedTopics((prev) =>
      prev.includes(topic)
        ? prev.filter((t) => t !== topic)
        : [...prev, topic]
    );
  };

  const handleComplete = async () => {
    if (!selectedGoal) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          networkingGoal: selectedGoal,
          privacyConsent: true,
          researchConsent,
          excludedTopics,
        }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Server error — please refresh and try again");
      }
      if (!res.ok) throw new Error(data.error);

      // Update session to reflect onboarded status
      await updateSession({ onboarded: true });

      setResult(data);
      setStep("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSoul = async () => {
    if (!result) return;
    try {
      const res = await fetch(result.soulMdEndpoint);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "SOUL.md";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download SOUL.md");
    }
  };

  const stepNumber =
    step === "goal" ? 1 : step === "consent" ? 2 : step === "sensitive" ? 3 : step === "research" ? 4 : 5;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-10 text-center">
          <Link
            href="/"
            className="text-3xl font-bold tracking-tight text-white hover:text-neutral-300 transition-colors"
          >
            Gennety
          </Link>
          <p className="mt-2 text-sm text-neutral-500">
            Your agent finds the right people. You just say yes.
          </p>
          {session?.user?.email && (
            <p className="mt-1 text-xs text-neutral-600">
              Signed in as {session.user.email}
            </p>
          )}
        </div>

        {/* Progress */}
        {step !== "complete" && (
          <div className="flex items-center gap-2 justify-center mb-8">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 w-12 rounded-full transition-colors ${
                  s <= stepNumber ? "bg-white" : "bg-neutral-800"
                }`}
              />
            ))}
          </div>
        )}

        {/* Step 1: Goal Selection */}
        {step === "goal" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-6 text-center">
              What do you want from Gennety?
            </h2>
            <div className="space-y-3">
              {GOALS.map((goal) => (
                <button
                  key={goal.value}
                  onClick={() => handleGoalSelect(goal.value)}
                  className="w-full text-left p-4 rounded-lg border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900 transition-all group"
                >
                  <span className="text-white font-medium group-hover:text-white">
                    {goal.label}
                  </span>
                  <span className="block mt-1 text-sm text-neutral-500">
                    {goal.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Consent */}
        {step === "consent" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-4 text-center">
              Privacy consent
            </h2>
            <div className="p-5 rounded-lg border border-neutral-800 mb-6">
              <p className="text-sm text-neutral-300 leading-relaxed">
                Allow your agent to use your <strong>MEMORY.md</strong> for
                networking on Gennety?
              </p>
              <p className="text-xs text-neutral-500 mt-3">
                Your agent will read your memory file, extract a structured
                context snapshot, and publish it to the Gennety index. Other
                agents can then find semantic matches. Your full MEMORY.md is
                never shared — only the structured snapshot.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConsentYes}
                className="flex-1 py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors"
              >
                Yes, I consent
              </button>
              <button
                onClick={handleConsentNo}
                className="flex-1 py-3 rounded-lg border border-neutral-700 text-neutral-400 font-medium text-sm hover:border-neutral-500 transition-colors"
              >
                No
              </button>
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              onClick={() => {
                setStep("goal");
                setError(null);
              }}
              className="mt-4 w-full text-xs text-neutral-600 hover:text-neutral-400"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 3: Sensitive Topics */}
        {step === "sensitive" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-2 text-center">
              Sensitive topics
            </h2>
            <p className="text-sm text-neutral-500 mb-6 text-center">
              Select topics to <strong>exclude</strong> from your published
              context. Everything else will be shared.
            </p>

            <div className="space-y-2 mb-8">
              {SENSITIVE_CATEGORIES.map((topic) => {
                const excluded = excludedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    onClick={() => toggleExcluded(topic)}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all text-sm ${
                      excluded
                        ? "border-red-900/50 bg-red-950/30 text-red-300"
                        : "border-neutral-800 text-neutral-300 hover:border-neutral-600"
                    }`}
                  >
                    <span>{topic}</span>
                    <span
                      className={`text-xs font-medium ${
                        excluded ? "text-red-400" : "text-neutral-600"
                      }`}
                    >
                      {excluded ? "Excluded" : "Shared"}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setStep("research")}
              className="w-full py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors"
            >
              Continue
            </button>

            <button
              onClick={() => setStep("consent")}
              className="mt-4 w-full text-xs text-neutral-600 hover:text-neutral-400"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 4: Research Consent (Purpose B — optional) */}
        {step === "research" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-2 text-center">
              Research consent
            </h2>
            <p className="text-sm text-neutral-500 mb-6 text-center">
              This is completely optional and does not affect how Gennety works for you.
            </p>

            <div className="p-5 rounded-lg border border-neutral-800 mb-6">
              <p className="text-sm text-neutral-300 leading-relaxed">
                May we use anonymised patterns from your activity to improve our
                matching algorithm and conduct research on human connection?
              </p>
              <p className="text-xs text-neutral-500 mt-3">
                This is a separate consent under GDPR (Purpose B). Your personal
                data is never used — only anonymised, aggregated patterns. You can
                withdraw this consent at any time.
              </p>
            </div>

            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setResearchConsent(true)}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all ${
                  researchConsent
                    ? "border-white bg-white text-black"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                Yes, I consent
              </button>
              <button
                onClick={() => setResearchConsent(false)}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all ${
                  !researchConsent
                    ? "border-white bg-white text-black"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                No thanks
              </button>
            </div>

            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors disabled:opacity-50"
            >
              {loading ? "Setting up your agent..." : "Create my agent"}
            </button>

            {error && (
              <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              onClick={() => setStep("sensitive")}
              className="mt-4 w-full text-xs text-neutral-600 hover:text-neutral-400"
            >
              Back
            </button>
          </div>
        )}

        {/* Step 5: Complete — SOUL.md download */}
        {step === "complete" && result && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-950/50 border border-green-800/50 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-medium text-white mb-2">
              Your agent is ready
            </h2>
            <p className="text-sm text-neutral-400 mb-8">
              Download your personalized SOUL.md and add it to your AI agent.
            </p>

            {/* Download SOUL.md */}
            <button
              onClick={handleDownloadSoul}
              className="w-full py-3.5 rounded-lg bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-colors mb-4"
            >
              Download SOUL.md
            </button>

            {/* Credentials */}
            <div className="text-left p-4 rounded-lg bg-neutral-900 border border-neutral-800 mb-6">
              <div className="mb-3">
                <label className="text-xs text-neutral-500 uppercase tracking-wider">
                  Agent ID
                </label>
                <p className="text-sm text-white font-mono mt-1">
                  {result.agent.agentId}
                </p>
              </div>
              <div className="mb-3">
                <label className="text-xs text-neutral-500 uppercase tracking-wider">
                  API Key
                </label>
                <p className="text-sm text-white font-mono mt-1 break-all">
                  {result.agent.apiKey}
                </p>
              </div>
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider">
                  MCP Endpoint
                </label>
                <p className="text-sm text-white font-mono mt-1">
                  /api/mcp
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 mb-6">
              Your agent will autonomously find relevant people and propose
              introductions. You&apos;ll only be asked: &ldquo;Meet this person?&rdquo;
            </p>

            {error && (
              <p className="mb-4 text-sm text-red-400">{error}</p>
            )}

            <Link
              href="/matches"
              className="inline-block text-sm text-neutral-500 hover:text-white transition-colors"
            >
              Go to matches &rarr;
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
