"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { getCountryOptions, matchesCountryQuery } from "@/lib/countries";

type Step = "use_openclaw" | "install" | "thesis" | "goal" | "country" | "consent" | "sensitive" | "research" | "complete";
type Goal = "partnership" | "collaboration" | "mentor" | "peer";
type OS = "unix" | "windows";
type OpenClawStatus = "using" | "installed_later" | null;

const AGENT_PLATFORM = "open_claw";
const FILE_NAME = "SOUL.md";

const INSTALL_COMMANDS: Record<OS, string> = {
  unix: "curl -fsSL https://openclaw.ai/install.sh | bash",
  windows: "iwr -useb https://openclaw.ai/install.ps1 | iex",
};

const CODING_AGENT_INSTALL_PROMPT = `Install OpenClaw on this machine.

Goal:
OpenClaw must be installed and configured so it is ready for the next step in Gennety onboarding. End state: OpenClaw is installed, an LLM provider is configured, the local gateway or local runtime is running if the official setup includes it, and the system is ready to receive the next setup prompt.

AUTHORITATIVE SOURCES
Use only:
1. https://openclaw.com
2. OpenClaw's official documentation site, but only if it is linked from the official OpenClaw website or clearly presented as official OpenClaw documentation.

Trust the official website and official docs over your prior knowledge. If the docs and your assumptions conflict, follow the docs.

HOW TO WORK
1. First, inspect openclaw.com and the relevant official install / quickstart / onboarding docs.
2. Build a concrete plan in 5–10 short steps.
3. Show me that short plan in one message.
4. Then execute it end to end.
5. Do not ask me to confirm every routine command. Proceed by default and give short status updates as you go.
6. Do as much as possible yourself. Your default mode is action, not explanation.
7. If something fails, debug it and continue until you are genuinely blocked.

ASK ME ONLY WHEN YOU MUST
Stop and ask me only if:
- You need an API key that I must generate myself.
  Tell me the exact official page to open, what to click, and then ask me to paste the key here.
- You need a third-party integration that only I can create or authorize.
  Examples: Telegram bot, Slack app, Discord bot, login-based provider setup.
  Walk me through it in chat, then ask me only for the resulting token or credential.
- You need one real product decision from me that cannot be inferred.
  Example: which communication channel I want OpenClaw to use.
  Ask once, then remember it for the rest of the session.
- You hit a blocker you cannot resolve yourself.
  Report the exact step, exact error, and what you already tried.

DO NOT ASK ME ABOUT
Do not ask me about:
- shell choice
- whether to install prerequisites
- default ports
- default paths
- whether to keep standard defaults
- cosmetic preferences
- minor config choices the official docs already answer

Pick sane defaults, follow the official flow, and tell me what you picked only when it matters.

INSTALLATION BEHAVIOR
- Detect the OS and shell.
- Find the current official installation path for this OS from openclaw.com or the official docs.
- Run the correct install steps for the machine you are on.
- If the installer launches a setup or onboarding wizard, drive it end to end.
- Default to Anthropic Claude as the LLM provider unless I tell you otherwise.
- If an API key is required, that is where you stop and ask me.
- Accept recommended defaults unless the official docs say otherwise.
- If OpenClaw requires a local gateway, daemon, background service, workspace, or skills setup, configure those according to the official flow.
- If there is an official verification step, run it.
- If there is no documented verification step, verify in the most direct safe way available: confirm the relevant process or service starts, confirm the CLI or app responds normally, and confirm the configured provider works if the official flow supports such a check.

OUTPUT STYLE
- Start with a short plan.
- Then stream concise progress updates.
- When you need input from me, ask for one concrete thing at a time.
- Do not restart the whole explanation after each reply. Continue from where you left off.

FINAL CHECK
Before declaring success, verify all of the following as applicable to the official OpenClaw flow:
- installation completed successfully
- required runtime or gateway is running
- the selected LLM provider is configured
- OpenClaw is ready for the next onboarding step

FINAL SUMMARY
At the end, give me a short summary with:
- OS detected
- what you installed
- install location or main path, if relevant
- config file location, if relevant
- provider in use
- local URL, port, or runtime entrypoint, if relevant
- how to start and stop OpenClaw next time
- whether anything still requires my action

If everything is complete, end with:
"OpenClaw is installed and ready. Go back to Gennety and continue the onboarding."`;

function AgentLogoMark({
  brand,
  className = "h-4 w-4",
}: {
  brand: "cursor" | "codex" | "claude_code";
  className?: string;
}) {
  if (brand === "cursor") {
    return (
      <svg className={`${className} text-white`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22.106 5.68 12.5.135a.998.998 0 0 0-.998 0L1.893 5.68a.84.84 0 0 0-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 0 0 .998 0l9.608-5.547a.84.84 0 0 0 .42-.727V6.407a.84.84 0 0 0-.42-.726Zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 0 0-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514Z" />
      </svg>
    );
  }

  if (brand === "codex") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9.064 3.344a4.578 4.578 0 0 1 2.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 0 0 .043 0 4.55 4.55 0 0 1 3.046.275l.047.022.116.057a4.581 4.581 0 0 1 2.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 0 1-.134 1.223.123.123 0 0 0 .03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 0 1-2.201 1.388.123.123 0 0 0-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 0 0-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 0 1-1.945-.466 4.544 4.544 0 0 1-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 0 1-.37-.961 4.582 4.582 0 0 1-.014-2.298.124.124 0 0 0 .006-.056.085.085 0 0 0-.027-.048 4.467 4.467 0 0 1-1.034-1.651 3.896 3.896 0 0 1-.251-1.192 5.189 5.189 0 0 1 .141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 0 0 .065-.066 4.51 4.51 0 0 1 .829-1.615 4.535 4.535 0 0 1 1.837-1.388Zm3.482 10.565a.637.637 0 0 0 0 1.272h3.636a.637.637 0 1 0 0-1.272h-3.636ZM8.462 9.23a.637.637 0 0 0-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 1 0 1.095.649l1.454-2.455a.636.636 0 0 0 .005-.64L8.462 9.23Z" fill="url(#codex-gradient)" />
        <path
          clipRule="evenodd"
          d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"
          fillRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <title>Claude Code</title>
      <path
        clipRule="evenodd"
        d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"
        fill="#D97757"
        fillRule="evenodd"
      />
    </svg>
  );
}

export default function OnboardingPage() {
  const { data: session } = useSession();
  const t = useTranslations();
  const locale = useLocale();
  const [step, setStep] = useState<Step>("use_openclaw");
  const [openClawStatus, setOpenClawStatus] = useState<OpenClawStatus>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [excludedTopics, setExcludedTopics] = useState<string[]>([]);
  const [researchConsent, setResearchConsent] = useState(false);
  const [installOs, setInstallOs] = useState<OS>("unix");
  const [result, setResult] = useState<{
    owner: { id: string };
    agent: { agentId: string; apiKey: string };
    fileName: string;
    soulMdEndpoint: string;
    setupPrompt: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [showInstallManual, setShowInstallManual] = useState(false);
  const [isInstallPromptExpanded, setIsInstallPromptExpanded] = useState(false);
  const [isGranovetterExpanded, setIsGranovetterExpanded] = useState(false);

  const GOALS: { value: Goal; label: string; description: string }[] = [
    {
      value: "partnership",
      label: t("goals.partnership"),
      description: t("goals.partnershipDesc"),
    },
    {
      value: "collaboration",
      label: t("goals.collaboration"),
      description: t("goals.collaborationDesc"),
    },
    {
      value: "mentor",
      label: t("goals.mentor"),
      description: t("goals.mentorDesc"),
    },
    {
      value: "peer",
      label: t("goals.peer"),
      description: t("goals.peerDesc"),
    },
  ];

  const SENSITIVE_CATEGORIES = [
    t("sensitiveTopics.health"),
    t("sensitiveTopics.finances"),
    t("sensitiveTopics.relationships"),
    t("sensitiveTopics.psychological"),
  ];
  const countryOptions = getCountryOptions(locale);
  const filteredCountries = countryQuery.trim()
    ? countryOptions.filter((country) => matchesCountryQuery(country, countryQuery))
    : countryOptions;
  const selectedCountry = selectedCountryCode
    ? countryOptions.find((country) => country.code === selectedCountryCode) ?? null
    : null;

  const fileName = FILE_NAME;

  const handleGoalSelect = (goal: Goal) => {
    setSelectedGoal(goal);
    setStep("country");
  };

  const handleConsentYes = () => {
    setStep("sensitive");
  };

  const handleConsentNo = () => {
    setError(
      t("onboarding.consentError")
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
    if (!selectedGoal || !selectedCountryCode) return;
    setLoading(true);
    setError(null);

    try {
      const body = {
        agentPlatform: AGENT_PLATFORM,
        networkingGoal: selectedGoal,
        countryCode: selectedCountryCode,
        privacyConsent: true,
        researchConsent,
        excludedTopics,
      };

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(t("onboarding.errors.invalidResponse"));
      }
      if (!res.ok) throw new Error(data.error);

      // Refresh JWT so middleware sees onboarded=true.
      try {
        await fetch("/api/auth/session");
      } catch {
        // Non-critical
      }

      setResult(data);
      setStep("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("onboarding.somethingWentWrong"));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // silently fail
    }
  };

  const handleDownloadFile = async () => {
    if (!result) return;
    try {
      const res = await fetch(result.soulMdEndpoint);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("onboarding.errors.downloadFailed", { fileName }));
    }
  };

  const TOTAL_STEPS = 7;
  const stepNumber =
    step === "use_openclaw" ? 1
      : step === "install" ? 1
      : step === "thesis" ? 2
      : step === "goal" ? 3
      : step === "country" ? 4
      : step === "consent" ? 5
      : step === "sensitive" ? 6
      : step === "research" ? 7
      : 8;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className={`w-full ${step === "install" || step === "thesis" ? "max-w-4xl" : "max-w-lg"}`}>
        {/* Header */}
        <div className="mb-10 text-center">
          <Link
            href="/"
            className="text-3xl font-bold tracking-tight text-white hover:text-neutral-300 transition-colors"
          >
            {t("common.gennety")}
          </Link>
          <p className="mt-2 text-sm text-neutral-500">
            {t("onboarding.tagline")}
          </p>
          {session?.user?.email && (
            <p className="mt-1 text-xs text-neutral-600">
              {t("onboarding.signedInAs", { email: session.user.email })}
            </p>
          )}
        </div>

        {/* Progress */}
        {step !== "complete" && (
          <div className="flex items-center gap-2 justify-center mb-8">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                className={`h-1 w-8 rounded-full transition-colors ${
                  s <= stepNumber ? "bg-white" : "bg-neutral-800"
                }`}
              />
            ))}
          </div>
        )}

        {/* Step 1a: Do you use OpenClaw? */}
        {step === "use_openclaw" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-3 text-center">
              {t("onboarding.useOpenClawTitle")}
            </h2>
            <p className="text-sm text-neutral-500 mb-8 text-center">
              {t("onboarding.useOpenClawDesc")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setOpenClawStatus("using");
                  setStep("thesis");
                }}
                className="py-4 rounded-lg bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors"
              >
                {t("onboarding.yesUsing")}
              </button>
              <button
                onClick={() => setStep("install")}
                className="py-4 rounded-lg border border-neutral-700 text-neutral-300 font-medium text-sm hover:border-neutral-500 hover:text-white transition-colors"
              >
                {t("onboarding.noNotYet")}
              </button>
            </div>
          </div>
        )}

        {/* Step 1b: Install OpenClaw */}
        {step === "install" && (
          <div>
            <div className="rounded-[28px] border border-neutral-800 bg-neutral-950/70 p-5 md:p-8">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-2xl font-medium text-white">
                  Install OpenClaw with a coding agent
                </h2>
                <p className="mt-3 whitespace-nowrap text-sm leading-6 text-neutral-400">
                  Copy this prompt into Cursor, Codex, Claude Code, or another coding agent and let it install OpenClaw for you.
                </p>
              </div>

              <div className="mt-7 flex items-center justify-center gap-5 md:gap-6">
                {(["cursor", "codex", "claude_code"] as const).map((brand) => (
                  <div key={brand} className="flex items-center justify-center">
                    <AgentLogoMark brand={brand} className="h-12 w-12 md:h-14 md:w-14" />
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-2xl border border-neutral-800 bg-black/25 p-4 md:p-5">
                <div className="flex justify-end">
                  <button
                    onClick={() => handleCopy(CODING_AGENT_INSTALL_PROMPT, "installPrompt")}
                    className="shrink-0 rounded-xl border border-neutral-700 bg-neutral-100 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white"
                  >
                    {copied === "installPrompt" ? "Copied!" : "Copy"}
                  </button>
                </div>

                <div
                  className={`relative mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 ${
                    isInstallPromptExpanded ? "" : "max-h-[200px] overflow-hidden"
                  } ${
                    isInstallPromptExpanded
                      ? ""
                      : "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[60px] after:rounded-b-2xl after:bg-gradient-to-b after:from-transparent after:to-neutral-950 after:content-['']"
                  }`}
                >
                  <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-neutral-200">
                    {CODING_AGENT_INSTALL_PROMPT}
                  </pre>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => setIsInstallPromptExpanded((current) => !current)}
                    className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
                  >
                    <span>{isInstallPromptExpanded ? "Show less" : "Show more"}</span>
                    <svg
                      className={`h-3.5 w-3.5 transition-transform ${isInstallPromptExpanded ? "rotate-180" : ""}`}
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M4 6.5 8 10l4-3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setOpenClawStatus("installed_later");
                  setStep("thesis");
                }}
                className="mt-6 w-full rounded-xl bg-white py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
              >
                {t("onboarding.installedContinue")}
              </button>

              <button
                onClick={() => setShowInstallManual((current) => !current)}
                className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
              >
                Set up manually
              </button>

              {showInstallManual && (
                <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950/90 p-4 md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-white">
                        Manual setup
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                        Run the command below in your terminal. It installs OpenClaw and launches the setup wizard.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <a
                        href="https://openclaw.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-neutral-300 transition-colors"
                      >
                        openclaw.com ↗
                      </a>
                      <span className="text-neutral-800">·</span>
                      <a
                        href="https://docs.openclaw.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-neutral-300 transition-colors"
                      >
                        Documentation ↗
                      </a>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-8 md:grid-cols-[1fr_320px]">
                    <div>
                      <div className="inline-flex p-0.5 rounded-lg border border-neutral-800 bg-neutral-950 mb-3 text-xs">
                        <button
                          onClick={() => setInstallOs("unix")}
                          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                            installOs === "unix"
                              ? "bg-neutral-800 text-white"
                              : "text-neutral-500 hover:text-neutral-300"
                          }`}
                        >
                          {t("onboarding.installOsUnix")}
                        </button>
                        <button
                          onClick={() => setInstallOs("windows")}
                          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                            installOs === "windows"
                              ? "bg-neutral-800 text-white"
                              : "text-neutral-500 hover:text-neutral-300"
                          }`}
                        >
                          {t("onboarding.installOsWindows")}
                        </button>
                      </div>

                      <div className="relative mb-4">
                        <pre className="p-4 pr-14 rounded-lg border border-neutral-700 bg-neutral-900 font-mono text-xs text-neutral-200 leading-relaxed whitespace-pre-wrap break-all select-all">
                          {INSTALL_COMMANDS[installOs]}
                        </pre>
                        <button
                          onClick={() => handleCopy(INSTALL_COMMANDS[installOs], "command")}
                          className="absolute top-2 right-2 p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 transition-colors"
                          aria-label={t("onboarding.copyCommand")}
                        >
                          {copied === "command" ? (
                            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <aside className="md:border-l md:border-neutral-800 md:pl-6 border-t border-neutral-800 pt-6 md:border-t-0 md:pt-0">
                      <h3 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-4">
                        {t("onboarding.installChecklistTitle")}
                      </h3>
                      <ol className="space-y-4 text-xs leading-relaxed">
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <li key={n} className="flex gap-3">
                            <div className="w-5 h-5 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[10px] font-semibold text-neutral-400">{n}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-neutral-200 font-medium">
                                {t(`onboarding.installStep${n}Title`)}
                              </p>
                              {n === 4 ? (
                                <div className="text-neutral-500 mt-1 space-y-0.5">
                                  <div>
                                    <span className="text-neutral-400">{t("onboarding.installStep4Anthropic")}</span>{" "}
                                    <a
                                      href="https://console.anthropic.com/settings/keys"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="underline hover:text-neutral-300 break-all"
                                    >
                                      console.anthropic.com
                                    </a>
                                  </div>
                                  <div>
                                    <span className="text-neutral-400">{t("onboarding.installStep4OpenAI")}</span>{" "}
                                    <a
                                      href="https://platform.openai.com/api-keys"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="underline hover:text-neutral-300 break-all"
                                    >
                                      platform.openai.com
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-neutral-500 mt-1">
                                  {t(`onboarding.installStep${n}Desc`)}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </aside>
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep("use_openclaw")}
                className="mt-5 w-full text-xs text-neutral-600 hover:text-neutral-400"
              >
                {t("common.back")}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Granovetter Thesis */}
        {step === "thesis" && (
          <div className="px-2 py-6 sm:px-6 sm:py-10">
            <div className="mx-auto max-w-3xl text-center">
              <p className="animate-detail-in text-[11px] font-semibold uppercase tracking-[0.35em] text-neutral-500">
                {t("onboarding.granovetterEyebrow")}
              </p>

              <div className="relative mx-auto mt-5 max-w-[680px]">
                <h2 className="animate-detail-in animate-detail-in-d1 mx-auto text-balance text-[25px] font-semibold leading-[1.28] text-white sm:text-[38px] sm:leading-[1.2]">
                  {t("onboarding.granovetterQuote")}
                </h2>

                <button
                  type="button"
                  onClick={() => setIsGranovetterExpanded((current) => !current)}
                  className="animate-detail-in animate-detail-in-d2 mt-5 inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-neutral-400 transition-colors hover:text-white sm:absolute sm:left-full sm:top-1 sm:ml-5 sm:mt-0"
                >
                  <span>{isGranovetterExpanded ? t("onboarding.granovetterReadLess") : t("onboarding.granovetterReadMore")}</span>
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${isGranovetterExpanded ? "rotate-180" : ""}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 6.5 8 10l4-3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <AnimatePresence initial={false}>
                {isGranovetterExpanded && (
                  <motion.div
                    key="granovetter-details"
                    initial={{ opacity: 0, height: 0, y: 16 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: 8 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="mx-auto mt-8 max-w-2xl text-left">
                      <p className="text-[15px] font-semibold leading-7 text-white sm:text-base">
                        {t("onboarding.granovetterIntro")}
                      </p>

                      <div className="mt-6 space-y-6 text-[13px] leading-6 text-neutral-300 sm:text-[14px] sm:leading-6">
                        <div>
                          <h3 className="text-sm font-semibold tracking-[0.01em] text-white sm:text-[15px]">
                            {t("onboarding.granovetterSection1Title")}
                          </h3>
                          <p className="mt-2 text-pretty">
                            {t("onboarding.granovetterSection1Body")}
                          </p>
                        </div>

                        <div>
                          <h3 className="text-sm font-semibold tracking-[0.01em] text-white sm:text-[15px]">
                            {t("onboarding.granovetterSection2Title")}
                          </h3>
                          <p className="mt-2 whitespace-pre-line text-pretty">
                            {t("onboarding.granovetterSection2Body")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="animate-detail-in animate-detail-in-d3 mt-10 flex flex-col items-center gap-4">
                <button
                  onClick={() => setStep("goal")}
                  className="w-full rounded-xl bg-white py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200 sm:w-auto sm:min-w-48 sm:px-8"
                >
                  {t("common.continue")}
                </button>

                <button
                  onClick={() => setStep(openClawStatus === "installed_later" ? "install" : "use_openclaw")}
                  className="text-xs text-neutral-600 transition-colors hover:text-neutral-400"
                >
                  {t("common.back")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Goal Selection */}
        {step === "goal" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-6 text-center">
              {t("onboarding.goalTitle")}
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

            <button
              onClick={() => setStep("thesis")}
              className="mt-4 w-full text-xs text-neutral-600 hover:text-neutral-400"
            >
              {t("common.back")}
            </button>
          </div>
        )}

        {/* Step 4: Country */}
        {step === "country" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-2 text-center">
              {t("onboarding.countryTitle")}
            </h2>
            <p className="mb-6 text-sm text-center text-neutral-500">
              {t("onboarding.countryDesc")}
            </p>

            <div className="rounded-[24px] border border-neutral-800 bg-neutral-950/70 p-4">
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="m14.583 14.583 3.334 3.334M16.25 9.167a7.083 7.083 0 1 1-14.167 0 7.083 7.083 0 0 1 14.167 0Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                <input
                  value={countryQuery}
                  onChange={(event) => setCountryQuery(event.target.value)}
                  autoFocus
                  placeholder={t("onboarding.countrySearchPlaceholder")}
                  className="w-full rounded-2xl border border-neutral-800 bg-black/30 py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-600"
                />
              </div>

              <div className="mt-4 max-h-[360px] overflow-y-auto pr-1">
                {filteredCountries.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {filteredCountries.map((country) => {
                      const isSelected = country.code === selectedCountryCode;

                      return (
                        <button
                          key={country.code}
                          onClick={() => setSelectedCountryCode(country.code)}
                          className={`rounded-2xl border px-3 py-3 text-left transition-all ${
                            isSelected
                              ? "border-white bg-white text-black shadow-[0_12px_30px_rgba(255,255,255,0.08)]"
                              : "border-neutral-800 bg-black/20 text-neutral-200 hover:border-neutral-600 hover:bg-neutral-900"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span className="text-xl leading-none">{country.flag}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {country.name}
                              </span>
                              <span
                                className={`block text-[10px] uppercase tracking-[0.22em] ${
                                  isSelected ? "text-neutral-600" : "text-neutral-600"
                                }`}
                              >
                                {country.code}
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">
                    {t("onboarding.countryNoResults", { query: countryQuery.trim() })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-800 bg-black/20 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-600">
                {t("onboarding.countrySelected")}
              </p>
              {selectedCountry ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-white">
                  <span className="text-lg leading-none">{selectedCountry.flag}</span>
                  <span>{selectedCountry.name}</span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">
                  {t("onboarding.countrySelectedEmpty")}
                </p>
              )}
            </div>

            <button
              onClick={() => setStep("consent")}
              disabled={!selectedCountryCode}
              className="mt-6 w-full rounded-lg bg-white py-3 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.continue")}
            </button>

            <button
              onClick={() => setStep("goal")}
              className="mt-4 w-full text-xs text-neutral-600 hover:text-neutral-400"
            >
              {t("common.back")}
            </button>
          </div>
        )}

        {/* Step 5: Consent */}
        {step === "consent" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-4 text-center">
              {t("onboarding.consentTitle")}
            </h2>
            <div className="p-5 rounded-lg border border-neutral-800 mb-6">
              <p className="text-sm text-neutral-300 leading-relaxed">
                {t("onboarding.consentQuestion")}
              </p>
              <p className="text-xs text-neutral-500 mt-3">
                {t("onboarding.consentDesc")}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConsentYes}
                className="flex-1 py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors"
              >
                {t("onboarding.yesConsent")}
              </button>
              <button
                onClick={handleConsentNo}
                className="flex-1 py-3 rounded-lg border border-neutral-700 text-neutral-400 font-medium text-sm hover:border-neutral-500 transition-colors"
              >
                {t("onboarding.noConsent")}
              </button>
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              onClick={() => {
                setStep("country");
                setError(null);
              }}
              className="mt-4 w-full text-xs text-neutral-600 hover:text-neutral-400"
            >
              {t("common.back")}
            </button>
          </div>
        )}

        {/* Step 6: Sensitive Topics */}
        {step === "sensitive" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-2 text-center">
              {t("onboarding.sensitiveTitle")}
            </h2>
            <p className="text-sm text-neutral-500 mb-6 text-center"
              dangerouslySetInnerHTML={{ __html: t("onboarding.sensitiveDesc") }}
            />

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
                      {excluded ? t("status.excluded") : t("status.shared")}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setStep("research")}
              className="w-full py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors"
            >
              {t("common.continue")}
            </button>

            <button
              onClick={() => setStep("consent")}
              className="mt-4 w-full text-xs text-neutral-600 hover:text-neutral-400"
            >
              {t("common.back")}
            </button>
          </div>
        )}

        {/* Step 7: Research Consent (Purpose B — optional) */}
        {step === "research" && (
          <div>
            <h2 className="text-lg font-medium text-neutral-200 mb-2 text-center">
              {t("onboarding.researchTitle")}
            </h2>
            <p className="text-sm text-neutral-500 mb-6 text-center">
              {t("onboarding.researchOptional")}
            </p>

            <div className="p-5 rounded-lg border border-neutral-800 mb-6">
              <p className="text-sm text-neutral-300 leading-relaxed">
                {t("onboarding.researchQuestion")}
              </p>
              <p className="text-xs text-neutral-500 mt-3">
                {t("onboarding.researchDesc")}
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
                {t("onboarding.yesConsent")}
              </button>
              <button
                onClick={() => setResearchConsent(false)}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all ${
                  !researchConsent
                    ? "border-white bg-white text-black"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }`}
              >
                {t("onboarding.noThanks")}
              </button>
            </div>

            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors disabled:opacity-50"
            >
              {loading ? t("onboarding.settingUp") : t("onboarding.createAgent")}
            </button>

            {error && (
              <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              onClick={() => setStep("sensitive")}
              className="mt-4 w-full text-xs text-neutral-600 hover:text-neutral-400"
            >
              {t("common.back")}
            </button>
          </div>
        )}

        {/* Complete — Copy setup prompt */}
        {step === "complete" && result && (
          <div>
            <div className="w-14 h-14 mx-auto mb-6 rounded-full bg-green-950/50 border border-green-800/50 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="text-center mb-8">
              <h2 className="text-lg font-medium text-white">
                {t("onboarding.agentReady")}
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                {t("onboarding.copyPromptDesc")}
              </p>
            </div>

            {/* Setup prompt */}
            <div className="relative mb-4">
              <div className="p-4 rounded-lg border border-neutral-700 bg-neutral-900 font-mono text-xs text-neutral-300 leading-relaxed break-all select-all">
                {result.setupPrompt}
              </div>
              <button
                onClick={() => handleCopy(result.setupPrompt, "prompt")}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 transition-colors"
              >
                {copied === "prompt" ? (
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>

            <button
              onClick={() => handleCopy(result.setupPrompt, "prompt")}
              className="w-full py-3.5 rounded-lg bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-colors mb-6"
            >
              {copied === "prompt" ? t("common.copied") : t("onboarding.copySetupPrompt")}
            </button>

            {/* How it works */}
            <div className="space-y-3 mb-6">
              {[
                {
                  num: "1",
                  title: t("onboarding.step1Title"),
                  desc: t("onboarding.step1Desc"),
                },
                {
                  num: "2",
                  title: t("onboarding.step2Title", { fileName }),
                  desc: t("onboarding.step2Desc"),
                },
                {
                  num: "3",
                  title: t("onboarding.step3Title"),
                  desc: t("onboarding.step3Desc"),
                },
              ].map((item) => (
                <div
                  key={item.num}
                  className="flex gap-4 p-3 rounded-lg border border-neutral-800/50 text-left"
                >
                  <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-semibold text-neutral-400">{item.num}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-300">{item.title}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Manual setup fallback */}
            <div className="border-t border-neutral-800 pt-4">
              <button
                onClick={() => setShowManual(!showManual)}
                className="w-full flex items-center justify-between text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                <span>{t("onboarding.preferManual")}</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${showManual ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showManual && (
                <div className="mt-3 space-y-2">
                  <button
                    onClick={handleDownloadFile}
                    className="w-full py-2.5 rounded-lg border border-neutral-800 text-neutral-400 text-xs font-medium hover:border-neutral-600 hover:text-neutral-300 transition-colors"
                  >
                    {t("onboarding.downloadFile", { fileName })}
                  </button>
                  <div className="p-3 rounded-lg bg-neutral-900/50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-neutral-600">{t("onboarding.agentId")}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] text-neutral-400 font-mono truncate">{result.agent.agentId}</span>
                        <button
                          onClick={() => handleCopy(result.agent.agentId, "agentId")}
                          className="text-neutral-700 hover:text-neutral-400 transition-colors shrink-0"
                        >
                          {copied === "agentId" ? (
                            <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-neutral-600">{t("onboarding.apiKey")}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] text-neutral-400 font-mono truncate">{result.agent.apiKey}</span>
                        <button
                          onClick={() => handleCopy(result.agent.apiKey, "apiKey")}
                          className="text-neutral-700 hover:text-neutral-400 transition-colors shrink-0"
                        >
                          {copied === "apiKey" ? (
                            <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
            )}

            {/* Go to dashboard */}
            <div className="mt-6 text-center">
              <Link
                href="/home"
                className="inline-block py-2.5 px-6 rounded-lg border border-neutral-700 text-neutral-300 font-medium text-sm hover:border-neutral-500 hover:text-white transition-colors"
              >
                {t("onboarding.goToDashboard")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
