"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { locales, localeNames, type Locale } from "@/i18n/config";

/* ── Constants ── */

const GOALS: { value: string; labelKey: string; descKey: string }[] = [
  { value: "partnership", labelKey: "goals.partnership", descKey: "goals.partnershipDesc" },
  { value: "collaboration", labelKey: "goals.collaboration", descKey: "goals.collaborationDesc" },
  { value: "mentor", labelKey: "goals.mentor", descKey: "goals.mentorDesc" },
  { value: "peer", labelKey: "goals.peer", descKey: "goals.peerDesc" },
];

const SENSITIVE_CATEGORY_KEYS: { value: string; labelKey: string }[] = [
  { value: "Health & personal issues", labelKey: "sensitiveTopics.health" },
  { value: "Finances & debts", labelKey: "sensitiveTopics.finances" },
  { value: "Personal relationships", labelKey: "sensitiveTopics.relationships" },
  { value: "Psychological topics", labelKey: "sensitiveTopics.psychological" },
];

const PLATFORM_LABELS: Record<string, string> = {
  open_claw: "Open Claw",
  nemo_claw: "Nemo Claw",
  zero_claw: "Zero Claw",
  nano_claw: "Nano-Claw",
};

/* ── Types ── */

interface Settings {
  agentActive: boolean;
  excludedTopics: string[];
  researchConsent: boolean;
  hasPassword: boolean;
  hasGoogleAccount: boolean;
  networkingGoal: string | null;
  notifyAllEmails: boolean;
  notifyMatchProposals: boolean;
  notifyNewMessages: boolean;
  notifyFreshness: boolean;
  agentId: string | null;
  agentPlatform: string | null;
}

/* ── Page ── */

export default function SettingsPage() {
  const t = useTranslations();
  const { status: sessionStatus } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load settings");
        return r.json();
      })
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [sessionStatus]);

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="p-12 text-center">
        <div className="w-6 h-6 border-2 border-neutral-700 border-t-white rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="px-6 py-10">
        <p className="text-sm text-neutral-500">{error ?? "Could not load settings."}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 max-w-2xl">
      <h1 className="text-2xl font-semibold text-white mb-8">{t("settings.title")}</h1>

      {/* P0 Sections */}
      <AgentStatusSection
        active={settings.agentActive}
        onUpdate={(v) => setSettings({ ...settings, agentActive: v })}
      />

      {settings.hasPassword && <ChangePasswordSection />}

      <ExcludedTopicsSection
        topics={settings.excludedTopics}
        onUpdate={(v) => setSettings({ ...settings, excludedTopics: v })}
      />

      <ResearchConsentSection
        consent={settings.researchConsent}
        onUpdate={(v) => setSettings({ ...settings, researchConsent: v })}
      />

      {/* P1 Sections */}
      <NetworkingGoalSection
        goal={settings.networkingGoal}
        onUpdate={(v) => setSettings({ ...settings, networkingGoal: v })}
      />

      <NotificationsSection
        allEmails={settings.notifyAllEmails}
        matchProposals={settings.notifyMatchProposals}
        newMessages={settings.notifyNewMessages}
        freshness={settings.notifyFreshness}
        onUpdate={(key, val) => setSettings({ ...settings, [key]: val })}
      />

      <LanguageSection />

      {settings.agentId && (
        <RegenerateKeySection agentId={settings.agentId} />
      )}

      {settings.agentId && settings.agentPlatform && (
        <DownloadSoulSection agentId={settings.agentId} platform={settings.agentPlatform} />
      )}

      <SetupPromptSection />

      {/* Cookie preferences */}

      {/* P2 */}
      <DeleteAccountSection />
    </div>
  );
}

/* ── Section wrapper ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-neutral-800 rounded-xl p-5 bg-neutral-900/50 mb-4">
      <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

/* ── Inline save feedback ── */

function useSave() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = useCallback(async (url: string, body: unknown, method = "PATCH") => {
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return data;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, saved, err, save };
}

function SaveStatus({ saving, saved, err }: { saving: boolean; saved: boolean; err: string | null }) {
  const t = useTranslations();
  if (saving) return <span className="text-xs text-neutral-500">{t("common.saving")}</span>;
  if (saved) return <span className="text-xs text-green-400">{t("common.saved")}</span>;
  if (err) return <span className="text-xs text-red-400">{err}</span>;
  return null;
}

/* ── P0: Agent Status ── */

function AgentStatusSection({ active, onUpdate }: { active: boolean; onUpdate: (v: boolean) => void }) {
  const t = useTranslations();
  const { saving, saved, err, save } = useSave();

  const toggle = async () => {
    const next = !active;
    const result = await save("/api/settings", { agentActive: next });
    if (result) onUpdate(next);
  };

  return (
    <Section title={t("settings.agentStatus")}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white font-medium">
            {active ? t("settings.activeSearching") : t("settings.paused")}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {active
              ? t("settings.agentActiveDesc")
              : t("settings.agentPausedDesc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus saving={saving} saved={saved} err={err} />
          <button
            onClick={toggle}
            disabled={saving}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              active ? "bg-green-500" : "bg-neutral-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                active ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      </div>
    </Section>
  );
}

/* ── P0: Change Password ── */

function ChangePasswordSection() {
  const t = useTranslations();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const { saving, saved, err, save } = useSave();
  const [localErr, setLocalErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalErr(null);
    if (newPw !== confirm) {
      setLocalErr(t("auth.passwordsDontMatch"));
      return;
    }
    if (newPw.length < 8) {
      setLocalErr(t("auth.passwordMinLength"));
      return;
    }
    const result = await save("/api/settings/password", {
      currentPassword: current,
      newPassword: newPw,
    }, "POST");
    if (result) {
      setCurrent("");
      setNewPw("");
      setConfirm("");
    }
  };

  return (
    <Section title={t("settings.changePassword")}>
      <div className="space-y-3">
        <input
          type="password"
          placeholder={t("settings.currentPassword")}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-neutral-800/50 border border-neutral-700 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500"
        />
        <input
          type="password"
          placeholder={t("settings.newPassword")}
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-neutral-800/50 border border-neutral-700 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500"
        />
        <input
          type="password"
          placeholder={t("settings.confirmPassword")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-neutral-800/50 border border-neutral-700 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500"
        />
        <div className="flex items-center justify-between">
          <div>
            <SaveStatus saving={saving} saved={saved} err={err} />
            {localErr && <span className="text-xs text-red-400">{localErr}</span>}
          </div>
          <button
            onClick={handleSubmit}
            disabled={saving || !current || !newPw || !confirm}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("settings.updatePassword")}
          </button>
        </div>
      </div>
    </Section>
  );
}

/* ── P0: Excluded Topics ── */

function ExcludedTopicsSection({
  topics,
  onUpdate,
}: {
  topics: string[];
  onUpdate: (v: string[]) => void;
}) {
  const t = useTranslations();
  const [local, setLocal] = useState(topics);
  const { saving, saved, err, save } = useSave();
  const changed = JSON.stringify(local) !== JSON.stringify(topics);

  const toggle = (topic: string) => {
    setLocal((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleSave = async () => {
    const result = await save("/api/settings", { excludedTopics: local });
    if (result) onUpdate(local);
  };

  return (
    <Section title={t("settings.sensitiveTopics")}>
      <p className="text-xs text-neutral-500 mb-3">
        {t.rich("settings.sensitiveTopicsDesc", {
          strong: (chunks) => <strong className="text-neutral-400">{chunks}</strong>,
        })}
      </p>
      <div className="space-y-2 mb-4">
        {SENSITIVE_CATEGORY_KEYS.map((cat) => {
          const excluded = local.includes(cat.value);
          return (
            <button
              key={cat.value}
              onClick={() => toggle(cat.value)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-sm ${
                excluded
                  ? "border-red-900/50 bg-red-950/30 text-red-300"
                  : "border-neutral-800 text-neutral-300 hover:border-neutral-600"
              }`}
            >
              <span>{t(cat.labelKey)}</span>
              <span className={`text-xs font-medium ${excluded ? "text-red-400" : "text-neutral-600"}`}>
                {excluded ? "Excluded" : "Shared"}
              </span>
            </button>
          );
        })}
      </div>
      {changed && (
        <div className="flex items-center justify-between">
          <SaveStatus saving={saving} saved={saved} err={err} />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      )}
      {!changed && (saved || err) && <SaveStatus saving={saving} saved={saved} err={err} />}
    </Section>
  );
}

/* ── P0: Research Consent ── */

function ResearchConsentSection({
  consent,
  onUpdate,
}: {
  consent: boolean;
  onUpdate: (v: boolean) => void;
}) {
  const t = useTranslations();
  const { saving, saved, err, save } = useSave();
  const [showConfirm, setShowConfirm] = useState(false);

  const toggle = async (value: boolean) => {
    if (!value && consent) {
      setShowConfirm(true);
      return;
    }
    const result = await save("/api/settings", { researchConsent: value });
    if (result) onUpdate(value);
  };

  const confirmWithdraw = async () => {
    const result = await save("/api/settings", { researchConsent: false });
    if (result) {
      onUpdate(false);
      setShowConfirm(false);
    }
  };

  return (
    <Section title={t("settings.researchConsent")}>
      <p className="text-xs text-neutral-500 mb-3">
        {t("settings.researchDesc")}
      </p>

      {showConfirm ? (
        <div className="p-4 rounded-lg border border-amber-900/50 bg-amber-950/20 mb-3">
          <p className="text-sm text-amber-300 mb-3">
            {t("settings.withdrawConfirm")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmWithdraw}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              {saving ? t("settings.withdrawing") : t("settings.yesWithdraw")}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-400 text-xs hover:border-neutral-500 transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => toggle(true)}
              disabled={saving}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                consent
                  ? "border-white bg-white text-black"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              {t("onboarding.yesConsent")}
            </button>
            <button
              onClick={() => toggle(false)}
              disabled={saving}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                !consent
                  ? "border-white bg-white text-black"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              {t("onboarding.noThanks")}
            </button>
          </div>
          <SaveStatus saving={saving} saved={saved} err={err} />
        </div>
      )}
    </Section>
  );
}

/* ── P1: Networking Goal ── */

function NetworkingGoalSection({
  goal,
  onUpdate,
}: {
  goal: string | null;
  onUpdate: (v: string) => void;
}) {
  const t = useTranslations();
  const { saving, saved, err, save } = useSave();

  const select = async (value: string) => {
    if (value === goal) return;
    const result = await save("/api/settings", { networkingGoal: value });
    if (result) onUpdate(value);
  };

  return (
    <Section title={t("settings.networkingGoal")}>
      <div className="space-y-2 mb-3">
        {GOALS.map((g) => (
          <button
            key={g.value}
            onClick={() => select(g.value)}
            disabled={saving}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              goal === g.value
                ? "border-white bg-white/5 text-white"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
            }`}
          >
            <span className="text-sm font-medium">{t(g.labelKey)}</span>
            <span className="block mt-0.5 text-xs text-neutral-500">{t(g.descKey)}</span>
          </button>
        ))}
      </div>
      <SaveStatus saving={saving} saved={saved} err={err} />
    </Section>
  );
}

/* ── P1: Email Notifications ── */

function NotificationsSection({
  allEmails,
  matchProposals,
  newMessages,
  freshness,
  onUpdate,
}: {
  allEmails: boolean;
  matchProposals: boolean;
  newMessages: boolean;
  freshness: boolean;
  onUpdate: (key: string, val: boolean) => void;
}) {
  const t = useTranslations();
  const { saving, saved, err, save } = useSave();

  const toggle = async (key: string, current: boolean) => {
    const result = await save("/api/settings", { [key]: !current });
    if (result) onUpdate(key, !current);
  };

  const rows = [
    { key: "notifyMatchProposals", label: t("settings.matchProposals"), desc: t("settings.matchProposalsDesc"), value: matchProposals },
    { key: "notifyNewMessages", label: t("settings.newMessages"), desc: t("settings.newMessagesDesc"), value: newMessages },
    { key: "notifyFreshness", label: t("settings.freshnessWarnings"), desc: t("settings.freshnessWarningsDesc"), value: freshness },
  ];

  return (
    <Section title={t("settings.emailNotifications")}>
      {/* Global kill switch */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
        <div>
          <p className="text-sm text-white font-medium">{t("settings.allEmailNotifications")}</p>
          <p className="text-xs text-neutral-500">
            {allEmails ? t("settings.emailsEnabled") : t("settings.emailsDisabled")}
          </p>
        </div>
        <button
          onClick={() => toggle("notifyAllEmails", allEmails)}
          disabled={saving}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            allEmails ? "bg-green-500" : "bg-neutral-700"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              allEmails ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {/* Per-type toggles */}
      <div className={`space-y-3 transition-opacity ${allEmails ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-300">{row.label}</p>
              <p className="text-xs text-neutral-600">{row.desc}</p>
            </div>
            <button
              onClick={() => toggle(row.key, row.value)}
              disabled={saving || !allEmails}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                row.value ? "bg-green-500" : "bg-neutral-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  row.value ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <SaveStatus saving={saving} saved={saved} err={err} />
      </div>
    </Section>
  );
}

/* ── P1: Regenerate API Key ── */

function RegenerateKeySection({ agentId }: { agentId: string }) {
  const t = useTranslations();
  const { saving, saved, err, save } = useSave();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const regenerate = async () => {
    const result = await save("/api/settings/regenerate-key", {}, "POST");
    if (result?.apiKey) {
      setNewKey(result.apiKey);
      setShowConfirm(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Section title={t("settings.apiKeyTitle")}>
      <p className="text-xs text-neutral-500 mb-3">
        {t("settings.agentIdLabel")} <span className="font-mono text-neutral-400">{agentId}</span>
      </p>

      {newKey ? (
        <div className="mb-3">
          <p className="text-xs text-amber-400 mb-2">
            {t("settings.newKeyGenerated")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2.5 rounded-lg bg-neutral-800 text-xs text-neutral-300 font-mono break-all">
              {newKey}
            </code>
            <button
              onClick={() => handleCopy(newKey)}
              className="shrink-0 p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors"
            >
              {copied ? (
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
      ) : showConfirm ? (
        <div className="p-4 rounded-lg border border-red-900/50 bg-red-950/20 mb-3">
          <p className="text-sm text-red-300 mb-3">
            {t("settings.regenerateWarning")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={regenerate}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500 transition-colors disabled:opacity-50"
            >
              {saving ? t("settings.generating") : t("settings.yesRegenerate")}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-400 text-xs hover:border-neutral-500 transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <SaveStatus saving={saving} saved={saved} err={err} />
          <button
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 rounded-lg border border-red-900/50 text-red-300 text-sm font-medium hover:border-red-700 hover:bg-red-950/30 transition-colors"
          >
            {t("settings.regenerateKey")}
          </button>
        </div>
      )}
    </Section>
  );
}

/* ── P1: Language ── */

function LanguageSection() {
  const t = useTranslations();
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const [selected, setSelected] = useState<Locale | "auto">(currentLocale);

  // Check if user has an explicit cookie set
  useEffect(() => {
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("locale="));
    if (!cookie) setSelected("auto");
  }, []);

  const handleChange = async (value: Locale | "auto") => {
    setSelected(value);
    if (value === "auto") {
      // Delete the locale cookie so auto-detection kicks in
      document.cookie = "locale=; path=/; max-age=0";
    } else {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: value }),
      });
    }
    router.refresh();
  };

  return (
    <Section title={t("settings.language")}>
      <p className="text-xs text-neutral-500 mb-3">
        {t("settings.languageDesc")}
      </p>
      <div className="space-y-1.5">
        {/* Auto option */}
        <button
          onClick={() => handleChange("auto")}
          className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
            selected === "auto"
              ? "border-white bg-white/5 text-white"
              : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
          }`}
        >
          {t("settings.languageAuto")}
        </button>
        {/* Locale options */}
        {locales.map((l) => (
          <button
            key={l}
            onClick={() => handleChange(l)}
            className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
              selected === l
                ? "border-white bg-white/5 text-white"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
            }`}
          >
            {localeNames[l]}
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ── P1: Download SOUL.md ── */

function DownloadSoulSection({ agentId, platform }: { agentId: string; platform: string }) {
  const t = useTranslations();
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSoulContent = async (): Promise<string> => {
    const res = await fetch(`/api/soul/${agentId}`);
    if (!res.ok) throw new Error("Failed to fetch SOUL.md");
    return res.text();
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const text = await fetchSoulContent();
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "SOUL.md";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download SOUL.md");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    setError(null);
    try {
      const text = await fetchSoulContent();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy content");
    }
  };

  return (
    <Section title={t("settings.agentInstructions")}>
      <p className="text-xs text-neutral-500 mb-3">
        {t("settings.platform")} <span className="text-neutral-400">{PLATFORM_LABELS[platform] ?? platform}</span>
      </p>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-400 mr-auto">{error}</span>}
        <button
          onClick={handleCopy}
          disabled={copied}
          className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-sm font-medium hover:border-neutral-500 hover:text-white transition-colors disabled:opacity-50"
        >
          {copied ? t("common.copied") : t("settings.copyContent")}
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-sm font-medium hover:border-neutral-500 hover:text-white transition-colors disabled:opacity-50"
        >
          {downloading ? t("settings.downloading") : t("settings.downloadSoul")}
        </button>
      </div>
    </Section>
  );
}

/* ── Setup Prompt (OpenClaw onboarding) ── */

function SetupPromptSection() {
  const t = useTranslations();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrompt = async () => {
    if (prompt) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/openclaw-prompt");
      if (!res.ok) throw new Error("Failed to load prompt");
      const data = await res.json();
      setPrompt(data.prompt);
      setExpanded(true);
    } catch {
      setError(t("settings.failedToLoadPrompt"));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // silently fail
    }
  };

  return (
    <Section title={t("settings.setupPrompt")}>
      <p className="text-xs text-neutral-500 mb-3">
        {t("settings.setupPromptDesc")}
      </p>

      {expanded && prompt && (
        <div className="mb-3">
          <div className="max-h-[300px] overflow-y-auto p-4 rounded-lg border border-neutral-800 bg-neutral-900/80 font-mono text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap select-all">
            {prompt}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={loadPrompt}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-sm font-medium hover:border-neutral-500 hover:text-white transition-colors disabled:opacity-50"
        >
          {loading
            ? t("common.loading")
            : expanded
              ? t("settings.hidePrompt")
              : t("settings.showPrompt")}
        </button>
        {expanded && prompt && (
          <button
            onClick={handleCopy}
            disabled={copied}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50"
          >
            {copied ? t("common.copied") : t("settings.copyPrompt")}
          </button>
        )}
      </div>
    </Section>
  );
}

/* ── P2: Delete Account ── */

function DeleteAccountSection() {
  const t = useTranslations();
  const [showConfirm, setShowConfirm] = useState(false);
  const [email, setEmail] = useState("");
  const { saving, err, save } = useSave();

  const handleDelete = async () => {
    const result = await save("/api/settings/delete-account", { confirmEmail: email }, "POST");
    if (result?.ok) {
      signOut({ callbackUrl: "/" });
    }
  };

  return (
    <div className="border border-red-900/30 rounded-xl p-5 bg-red-950/10 mt-8 mb-4">
      <h2 className="text-xs font-medium text-red-400/80 uppercase tracking-wider mb-3">
        {t("settings.dangerZone")}
      </h2>

      {showConfirm ? (
        <div>
          <p className="text-sm text-red-300 mb-3">
            {t("settings.deleteConfirm")}
          </p>
          <input
            type="email"
            placeholder={t("settings.typeEmailConfirm")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-neutral-900 border border-red-900/50 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-700 mb-3"
          />
          {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={saving || !email}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50"
            >
              {saving ? t("settings.deleting") : t("settings.deleteMyAccount")}
            </button>
            <button
              onClick={() => {
                setShowConfirm(false);
                setEmail("");
              }}
              className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-400 text-sm hover:border-neutral-500 transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-400">
            {t("settings.deleteDesc")}
          </p>
          <button
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 rounded-lg border border-red-900/50 text-red-300 text-sm font-medium hover:border-red-700 hover:bg-red-950/30 transition-colors"
          >
            {t("settings.deleteAccount")}
          </button>
        </div>
      )}
    </div>
  );
}

