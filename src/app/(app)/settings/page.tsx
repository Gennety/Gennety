"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { locales, localeNames, type Locale } from "@/i18n/config";
import {
  LiveStatusDot,
  PageHeader,
  codePanelClass,
  cx,
  dangerButtonClass,
  dangerButtonSmallClass,
  dangerSubtleButtonClass,
  getMattePillClass,
  inputClass,
  pageFrameClass,
  panelSoftClass,
  primaryButtonClass,
  primaryButtonSmallClass,
  sectionDescriptionClass,
  sectionHeaderClass,
  sectionShellClass,
  sectionTitleClass,
  subtleButtonClass,
  subtleButtonSmallClass,
} from "@/components/ui/app-chrome";

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

const WAKE_PATH = "/hooks/wake";
const SECTION_SHELL = sectionShellClass;
const SECTION_TITLE = sectionTitleClass;
const SUBTLE_SURFACE = panelSoftClass;
const CODE_SURFACE = codePanelClass;
const INPUT = inputClass;
const PRIMARY_BUTTON = primaryButtonClass;
const PRIMARY_BUTTON_SM = primaryButtonSmallClass;
const SECONDARY_BUTTON = subtleButtonClass;
const SECONDARY_BUTTON_SM = subtleButtonSmallClass;
const DANGER_BUTTON = dangerButtonClass;
const DANGER_BUTTON_SM = dangerButtonSmallClass;
const DANGER_SUBTLE_BUTTON = dangerSubtleButtonClass;
const OPTION_BUTTON =
  "w-full rounded-xl px-4 py-3 text-left transition-all ring-1 ring-inset";
const OPTION_ACTIVE = "bg-white/[0.07] text-white ring-white/[0.18]";
const OPTION_IDLE =
  "bg-neutral-950/38 text-neutral-400 ring-white/[0.07] hover:bg-neutral-900/70 hover:text-neutral-200 hover:ring-white/[0.13]";

/* ── Types ── */

interface Settings {
  agentActive: boolean;
  excludedTopics: string[];
  researchConsent: boolean;
  hasPassword: boolean;
  hasGoogleAccount: boolean;
  networkingGoal: string | null;
  agentId: string | null;
  agentPlatform: string | null;
  wakeWebhookEnabled: boolean;
  webhookUrl: string;
  webhookTokenSet: boolean;
  wakeWebhookLastPingAt: string | null;
  wakeWebhookLastPingOk: boolean | null;
  wakeWebhookLastPingError: string | null;
  wakeStreamConnected: boolean;
  wakeStreamConnectionCount: number;
  wakeStreamLastConnectedAt: string | null;
  wakeStreamLastSeenAt: string | null;
  wakeStreamLastDisconnectedAt: string | null;
  wakeStreamLastError: string | null;
  wakeDeliveryMode: "stream" | "webhook" | "polling";
  privacySync: {
    pending: boolean;
    searchPaused: boolean;
    changedAt: string;
    lastPublishedAt: string | null;
    summary: string | null;
    action: string | null;
    newlyExcluded: string[];
    newlyAllowed: string[];
    excludedNow: string[];
    sharedNow: string[];
    reviewFields: string[];
    recommendedAdditions: string[];
    recommendedRemovals: string[];
  } | null;
}

/* ── Page ── */

export default function SettingsPage() {
  const t = useTranslations();
  const { status: sessionStatus } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const r = await fetch("/api/settings");
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(data?.error ?? "Failed to load settings");
      }
      setSettings(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    loadSettings();
  }, [sessionStatus, loadSettings]);

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
        <p className="text-sm text-neutral-400">{error ?? "Could not load settings."}</p>
      </div>
    );
  }

  return (
    <div className={pageFrameClass}>
      <PageHeader title={t("settings.title")} />

      {/* P0 Sections */}
      <AgentStatusSection
        active={settings.agentActive}
        onUpdate={(v) => setSettings({ ...settings, agentActive: v })}
      />

      {settings.hasPassword && <ChangePasswordSection />}

      <ExcludedTopicsSection
        topics={settings.excludedTopics}
        privacySync={settings.privacySync}
        onUpdate={(v) => setSettings({ ...settings, excludedTopics: v })}
        onRefresh={() => loadSettings({ silent: true })}
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

      <LanguageSection />

      {settings.agentId && (
        <RegenerateKeySection agentId={settings.agentId} />
      )}

      {settings.agentId && settings.agentPlatform && (
        <DownloadSoulSection agentId={settings.agentId} platform={settings.agentPlatform} />
      )}

      <SetupPromptSection />

      {settings.agentId && (
        <AdvancedSection>
          <InstantWakeSection
            settings={settings}
            onUpdate={(patch) => setSettings({ ...settings, ...patch })}
            onRefresh={() => loadSettings({ silent: true })}
          />
        </AdvancedSection>
      )}

      {/* Cookie preferences */}

      {/* P2 */}
      <DeleteAccountSection />
    </div>
  );
}

/* ── Section wrapper ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={SECTION_SHELL}>
      <div className={sectionHeaderClass}>
        <h2 className={SECTION_TITLE}>{title}</h2>
      </div>
      {children}
    </section>
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
  if (saving) return <span className="text-[13px] text-neutral-400">{t("common.saving")}</span>;
  if (saved) return <span className="text-[13px] text-green-400">{t("common.saved")}</span>;
  if (err) return <span className="text-[13px] text-red-400">{err}</span>;
  return null;
}

function Surface({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`${SUBTLE_SURFACE} ${className}`}>{children}</div>;
}

function StatusPill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={getMattePillClass("neutral", cx("gap-1.5 px-2.5 py-1", className))}>
      {children}
    </span>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-all ${
        checked
          ? "bg-emerald-500 ring-emerald-400/25"
          : "bg-neutral-800 ring-white/[0.08]"
      } disabled:opacity-50`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
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
      <Surface className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div>
          <StatusPill
            className={active ? "bg-emerald-950/70 text-emerald-200" : "bg-white/[0.04] text-neutral-300"}
          >
            {active && <AgentSearchingIcon />}
            {active ? t("settings.activeSearching") : t("settings.paused")}
          </StatusPill>
          <p className="mt-3 text-[13px] leading-5 text-neutral-400">
            {active
              ? t("settings.agentActiveDesc")
              : t("settings.agentPausedDesc")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus saving={saving} saved={saved} err={err} />
          <ToggleSwitch checked={active} disabled={saving} onClick={toggle} />
        </div>
      </Surface>
    </Section>
  );
}

function AgentSearchingIcon() {
  return <LiveStatusDot tone="success" />;
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
          className={INPUT}
        />
        <input
          type="password"
          placeholder={t("settings.newPassword")}
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          className={INPUT}
        />
        <input
          type="password"
          placeholder={t("settings.confirmPassword")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={INPUT}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SaveStatus saving={saving} saved={saved} err={err} />
            {localErr && <span className="text-[13px] text-red-400">{localErr}</span>}
          </div>
          <button
            onClick={handleSubmit}
            disabled={saving || !current || !newPw || !confirm}
            className={PRIMARY_BUTTON}
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
  privacySync,
  onUpdate,
  onRefresh,
}: {
  topics: string[];
  privacySync: Settings["privacySync"];
  onUpdate: (v: string[]) => void;
  onRefresh: () => Promise<void>;
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
    if (result) {
      onUpdate(local);
      await onRefresh();
    }
  };

  return (
    <Section title={t("settings.sensitiveTopics")}>
      <p className={cx(sectionDescriptionClass, "mb-4")}>
        {t.rich("settings.sensitiveTopicsDesc", {
          strong: (chunks) => <strong className="text-neutral-400">{chunks}</strong>,
        })}
      </p>
      {privacySync?.pending && (
        <div
          className={`mb-4 rounded-xl p-4 ring-1 ring-inset ${
            privacySync.searchPaused
              ? "bg-amber-950/18 ring-amber-500/[0.14]"
              : "bg-sky-950/18 ring-sky-500/[0.14]"
          }`}
        >
          <p
            className={`text-sm font-medium ${
              privacySync.searchPaused ? "text-amber-200" : "text-sky-200"
            }`}
          >
            {privacySync.searchPaused
              ? "Search paused until your agent republishes a privacy-safe context"
              : "Agent refresh in progress for your latest privacy settings"}
          </p>
          {privacySync.summary && (
            <p className="mt-2 text-xs leading-relaxed text-neutral-300">
              {privacySync.summary}
            </p>
          )}
          {privacySync.action && (
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              {privacySync.action}
            </p>
          )}
          {privacySync.newlyExcluded.length > 0 && (
            <p className="mt-3 text-xs text-red-300">
              Stop sharing: {privacySync.newlyExcluded.join(", ")}
            </p>
          )}
          {privacySync.newlyAllowed.length > 0 && (
            <p className="mt-2 text-xs text-emerald-300">
              Can now be shared if useful: {privacySync.newlyAllowed.join(", ")}
            </p>
          )}
          {privacySync.recommendedRemovals.length > 0 && (
            <ul className="mt-3 list-disc list-inside space-y-1 text-xs text-neutral-400">
              {privacySync.recommendedRemovals.slice(0, 2).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {privacySync.recommendedAdditions.length > 0 && (
            <ul className="mt-3 list-disc list-inside space-y-1 text-xs text-neutral-400">
              {privacySync.recommendedAdditions.slice(0, 2).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            Changed at {new Date(privacySync.changedAt).toLocaleString()}
          </p>
        </div>
      )}
      <div className="mb-4 space-y-2.5">
        {SENSITIVE_CATEGORY_KEYS.map((cat) => {
          const excluded = local.includes(cat.value);
          return (
            <button
              key={cat.value}
              onClick={() => toggle(cat.value)}
              className={`${OPTION_BUTTON} flex items-center justify-between text-sm ${
                excluded
                  ? "bg-red-950/20 text-red-200 ring-red-500/[0.18]"
                  : `${OPTION_IDLE} text-neutral-300`
              }`}
            >
              <span>{t(cat.labelKey)}</span>
              <span className={`text-xs font-medium ${excluded ? "text-red-400" : "text-neutral-400"}`}>
                {excluded ? "Excluded" : "Shared"}
              </span>
            </button>
          );
        })}
      </div>
      {changed && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SaveStatus saving={saving} saved={saved} err={err} />
          <button
            onClick={handleSave}
            disabled={saving}
            className={PRIMARY_BUTTON}
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
      <p className={cx(sectionDescriptionClass, "mb-4")}>
        {t("settings.researchDesc")}
      </p>

      {showConfirm ? (
        <div className="mb-3 rounded-xl bg-amber-950/18 p-4 ring-1 ring-inset ring-amber-500/[0.14]">
          <p className="text-sm text-amber-300 mb-3">
            {t("settings.withdrawConfirm")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmWithdraw}
              disabled={saving}
              className="inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-600 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              {saving ? t("settings.withdrawing") : t("settings.yesWithdraw")}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className={SECONDARY_BUTTON_SM}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => toggle(true)}
              disabled={saving}
              className={consent ? PRIMARY_BUTTON : SECONDARY_BUTTON}
            >
              {t("onboarding.yesConsent")}
            </button>
            <button
              onClick={() => toggle(false)}
              disabled={saving}
              className={!consent ? PRIMARY_BUTTON : SECONDARY_BUTTON}
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
            className={`${OPTION_BUTTON} ${
              goal === g.value
                ? OPTION_ACTIVE
                : OPTION_IDLE
            }`}
          >
            <span className="text-sm font-medium">{t(g.labelKey)}</span>
            <span className="mt-1 block text-[13px] leading-5 text-neutral-400">{t(g.descKey)}</span>
          </button>
        ))}
      </div>
      <SaveStatus saving={saving} saved={saved} err={err} />
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
      <p className={cx(sectionDescriptionClass, "mb-4")}>
        {t("settings.agentIdLabel")} <span className="font-mono text-neutral-400">{agentId}</span>
      </p>

      {newKey ? (
        <div className="mb-3">
          <p className="text-xs text-amber-400 mb-2">
            {t("settings.newKeyGenerated")}
          </p>
          <div className="flex items-center gap-2">
            <code className={`flex-1 p-3 text-xs text-neutral-300 font-mono break-all ${CODE_SURFACE}`}>
              {newKey}
            </code>
            <button
              onClick={() => handleCopy(newKey)}
              className={cx(SECONDARY_BUTTON_SM, "h-10 w-10 shrink-0 p-0")}
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
        <div className="mb-3 rounded-xl bg-red-950/18 p-4 ring-1 ring-inset ring-red-500/[0.14]">
          <p className="text-sm text-red-300 mb-3">
            {t("settings.regenerateWarning")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={regenerate}
              disabled={saving}
              className={DANGER_BUTTON_SM}
            >
              {saving ? t("settings.generating") : t("settings.yesRegenerate")}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className={SECONDARY_BUTTON_SM}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SaveStatus saving={saving} saved={saved} err={err} />
          <button
            onClick={() => setShowConfirm(true)}
            className={DANGER_SUBTLE_BUTTON}
          >
            {t("settings.regenerateKey")}
          </button>
        </div>
      )}
    </Section>
  );
}

/* ── P1: Advanced / Instant wake-up ── */

function AdvancedSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <section className={cx(SECTION_SHELL, open && "border-white/[0.16]")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "group flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left ring-1 ring-inset transition-colors",
          open
            ? "bg-white/[0.055] ring-white/[0.13]"
            : "ring-transparent hover:bg-white/[0.035] hover:ring-white/[0.09]"
        )}
      >
        <div>
          <h2 className={cx(SECTION_TITLE, open && "text-white")}>Advanced</h2>
          <p className={cx(sectionDescriptionClass, open && "text-neutral-300")}>
            Technical connectivity and diagnostics for your agent.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cx("text-xs transition-colors group-hover:text-neutral-200", open ? "text-neutral-200" : "text-neutral-400")}>
            {open ? "Hide" : "Show"}
          </span>
          <span className={cx(
            "flex h-8 w-8 items-center justify-center rounded-full transition-colors group-hover:bg-white/[0.08] group-hover:text-white",
            open ? "bg-white/[0.08] text-white" : "text-neutral-400"
          )}>
            <ChevronIcon open={open} className="h-4 w-4" />
          </span>
        </div>
      </button>

      {open && <div className="mt-4 border-t border-white/[0.10] pt-5">{children}</div>}
    </section>
  );
}

function ChevronIcon({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={`${className} transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function normalizeWakeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith(WAKE_PATH) ? trimmed.slice(0, -WAKE_PATH.length) : trimmed;
}

function buildWakeWebhookUrl(baseUrl: string): string {
  const normalized = normalizeWakeBaseUrl(baseUrl);
  return normalized ? `${normalized}${WAKE_PATH}` : "";
}

function formatWakeTimestamp(value: string | null): string | null {
  return value ? new Date(value).toLocaleString() : null;
}

function getInstantWakeStatus(settings: Pick<
  Settings,
  | "wakeStreamConnected"
  | "wakeStreamConnectionCount"
  | "wakeStreamLastConnectedAt"
  | "wakeStreamLastSeenAt"
  | "wakeStreamLastDisconnectedAt"
  | "wakeStreamLastError"
  | "wakeWebhookEnabled"
  | "webhookUrl"
  | "webhookTokenSet"
  | "wakeWebhookLastPingAt"
  | "wakeWebhookLastPingOk"
  | "wakeWebhookLastPingError"
>) {
  if (settings.wakeStreamConnected) {
    return {
      label: "Realtime connected",
      tone: "bg-emerald-950/60 text-emerald-200",
      detail:
        settings.wakeStreamConnectionCount > 1
          ? `${settings.wakeStreamConnectionCount} live OpenClaw wake streams are connected.`
          : "Your OpenClaw has an outbound realtime channel open.",
    };
  }

  if (settings.wakeStreamLastConnectedAt) {
    return {
      label: "Waiting for agent",
      tone: "bg-sky-950/60 text-sky-200",
      detail: settings.wakeStreamLastSeenAt
        ? `Last realtime contact: ${formatWakeTimestamp(settings.wakeStreamLastSeenAt)}. Polling fallback is active.`
        : "OpenClaw has connected before. Gennety will use polling until it reconnects.",
    };
  }

  if (settings.wakeWebhookEnabled && settings.webhookUrl && settings.webhookTokenSet && settings.wakeWebhookLastPingOk === true) {
    return {
      label: "Legacy webhook connected",
      tone: "bg-emerald-950/60 text-emerald-200",
      detail: settings.wakeWebhookLastPingAt
        ? `Inbound webhook last succeeded at ${formatWakeTimestamp(settings.wakeWebhookLastPingAt)}.`
        : "Inbound webhook is enabled and the last check succeeded.",
    };
  }

  if (settings.wakeWebhookEnabled && settings.wakeWebhookLastPingOk === false) {
    return {
      label: "Legacy webhook attention",
      tone: "bg-red-950/60 text-red-200",
      detail:
        settings.wakeWebhookLastPingError ??
        "The inbound webhook failed. Polling fallback still works.",
    };
  }

  if (settings.wakeWebhookEnabled && (!settings.webhookUrl || !settings.webhookTokenSet)) {
    return {
      label: "Legacy webhook needs setup",
      tone: "bg-amber-950/60 text-amber-200",
      detail: "Save both the public base URL and bearer token, or turn the legacy webhook off.",
    };
  }

  return {
    label: "Polling fallback",
    tone: "bg-neutral-800/90 text-neutral-300",
    detail: "OpenClaw has not opened the realtime stream yet. Scheduled check-ins still deliver all work.",
  };
}

function InstantWakeSection({
  settings,
  onUpdate,
  onRefresh,
}: {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onRefresh: () => Promise<void>;
}) {
  const { saving, saved, err, save } = useSave();
  const [baseUrl, setBaseUrl] = useState(() => normalizeWakeBaseUrl(settings.webhookUrl));
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [manualOpen, setManualOpen] = useState(settings.wakeWebhookEnabled);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [wakeTesting, setWakeTesting] = useState(false);
  const [wakeTestMessage, setWakeTestMessage] = useState<string | null>(null);
  const [wakeTestOk, setWakeTestOk] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    setBaseUrl(normalizeWakeBaseUrl(settings.webhookUrl));
  }, [settings.webhookUrl]);

  useEffect(() => {
    if (settings.wakeWebhookEnabled) {
      setManualOpen(true);
    }
  }, [settings.wakeWebhookEnabled]);

  const desiredUrl = buildWakeWebhookUrl(baseUrl);
  const dirty = desiredUrl !== settings.webhookUrl || token.length > 0;
  const status = getInstantWakeStatus(settings);
  const legacyWebhookConfigured = Boolean(settings.webhookUrl && settings.webhookTokenSet);

  const handleToggle = async () => {
    const next = !settings.wakeWebhookEnabled;
    const result = await save("/api/settings", { wakeWebhookEnabled: next });
    if (result) {
      onUpdate({ wakeWebhookEnabled: next });
    }
  };

  const handleSave = async () => {
    const body: Record<string, string> = {};

    if (!desiredUrl && (settings.webhookUrl || settings.webhookTokenSet)) {
      body.webhookUrl = "";
      body.webhookToken = "";
    } else {
      if (desiredUrl !== settings.webhookUrl) body.webhookUrl = desiredUrl;
      if (token.length > 0) body.webhookToken = token;
    }

    if (Object.keys(body).length === 0) return;

    const result = await save("/api/settings", body);
    if (result) {
      const cleared = body.webhookUrl === "";
      onUpdate({
        webhookUrl: cleared ? "" : desiredUrl,
        webhookTokenSet: cleared ? false : token.length > 0 ? true : settings.webhookTokenSet,
        wakeWebhookEnabled: cleared ? false : settings.wakeWebhookEnabled,
        wakeWebhookLastPingAt: null,
        wakeWebhookLastPingOk: null,
        wakeWebhookLastPingError: null,
      });
      setToken("");
      setTestMessage(null);
      setTestError(null);
    }
  };

  const handleClear = async () => {
    const result = await save("/api/settings", { webhookUrl: "", webhookToken: "" });
    if (result) {
      setBaseUrl("");
      setToken("");
      setTestMessage(null);
      setTestError(null);
      onUpdate({
        webhookUrl: "",
        webhookTokenSet: false,
        wakeWebhookEnabled: false,
        wakeWebhookLastPingAt: null,
        wakeWebhookLastPingOk: null,
        wakeWebhookLastPingError: null,
      });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMessage(null);
    setTestError(null);
    try {
      const res = await fetch("/api/settings/webhook/test", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to test connection");
      }

      onUpdate({
        wakeWebhookLastPingAt: data.checkedAt ?? null,
        wakeWebhookLastPingOk: data.ok,
        wakeWebhookLastPingError: data.error ?? null,
      });

      if (data.ok) {
        setTestMessage("Connection succeeded.");
      } else {
        setTestError(data.error ?? "Wake endpoint did not confirm successfully.");
      }
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const handleWakeTest = async () => {
    setWakeTesting(true);
    setWakeTestMessage(null);
    setWakeTestOk(null);
    try {
      const res = await fetch("/api/settings/wake/test", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to test Wakeup");
      }

      onUpdate({
        wakeStreamConnected: Boolean(data.wakeStreamConnected),
        wakeStreamConnectionCount: data.connectionCount ?? 0,
        wakeStreamLastConnectedAt: data.wakeStreamLastConnectedAt ?? null,
        wakeStreamLastSeenAt: data.wakeStreamLastSeenAt ?? null,
        wakeStreamLastDisconnectedAt: data.wakeStreamLastDisconnectedAt ?? null,
        wakeStreamLastError: data.wakeStreamLastError ?? null,
        wakeDeliveryMode:
          data.channel === "stream" || data.channel === "webhook" ? data.channel : "polling",
      });
      setWakeTestOk(Boolean(data.ok));
      setWakeTestMessage(
        data?.message ??
          (data.ok
            ? "Wakeup test sent. OpenClaw should confirm to you in its normal channel."
            : "Wakeup stream is not connected.")
      );
    } catch (e) {
      setWakeTestOk(false);
      setWakeTestMessage(e instanceof Error ? e.message : "Failed to test Wakeup");
    } finally {
      setWakeTesting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setWakeTestMessage(null);
    setWakeTestOk(null);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const loadPrompt = useCallback(async () => {
    setPromptLoading(true);
    setPromptError(null);
    try {
      const res = await fetch("/api/onboarding/openclaw-prompt?mode=instant-wake");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load setup prompt");
      }
      setPrompt(data.prompt);
      return data.prompt as string;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load setup prompt";
      setPromptError(message);
      return null;
    } finally {
      setPromptLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrompt();
  }, [loadPrompt]);

  const handleCopyPrompt = async () => {
    const text = prompt ?? (await loadPrompt());
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch {
      setPromptError("Failed to copy the prompt");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-white">Realtime wake-up for your agent</h3>
          <p className={sectionDescriptionClass}>
            OpenClaw keeps an outbound connection to Gennety, so hot events can
            wake it without exposing a public URL.
          </p>
        </div>
      </div>

      <Surface className="px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <StatusPill className={status.tone}>{status.label}</StatusPill>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-neutral-400">{status.detail}</p>

            {settings.wakeStreamLastConnectedAt && (
              <p className="mt-2 text-xs text-neutral-500">
                Last stream connect: {formatWakeTimestamp(settings.wakeStreamLastConnectedAt)}
              </p>
            )}

            <div className="mt-3 grid gap-1 text-xs text-neutral-500 sm:grid-cols-3">
              <p>
                Mode:{" "}
                <span className="text-neutral-400">
                  {settings.wakeDeliveryMode === "stream"
                    ? "Realtime stream"
                    : settings.wakeDeliveryMode === "webhook"
                    ? "Legacy webhook"
                    : "Polling fallback"}
                </span>
              </p>
              <p>
                Live streams:{" "}
                <span className="text-neutral-400">{settings.wakeStreamConnectionCount}</span>
              </p>
              <p>
                Last contact:{" "}
                <span className="text-neutral-400">
                  {formatWakeTimestamp(settings.wakeStreamLastSeenAt) ?? "Not yet"}
                </span>
              </p>
            </div>

            {wakeTestMessage && (
              <p className={`mt-2 text-xs ${wakeTestOk ? "text-green-400" : "text-amber-300"}`}>
                {wakeTestMessage}
              </p>
            )}

          </div>
          <div className="flex flex-wrap justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={handleWakeTest}
              disabled={wakeTesting}
              className={PRIMARY_BUTTON_SM}
            >
              {wakeTesting ? "Testing..." : "Test Wakeup"}
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className={SECONDARY_BUTTON_SM}
            >
              {refreshing ? "Refreshing..." : "Refresh status"}
            </button>
          </div>
        </div>
      </Surface>

      <div className="border-t border-neutral-800 pt-5">
        <div>
          <p className="text-[13px] font-semibold uppercase text-neutral-300">
            Recommended setup
          </p>
          <p className={sectionDescriptionClass}>
            Let your OpenClaw open the realtime stream itself. No public agent
            URL, DNS setup, or Tailscale Funnel is required.
          </p>
        </div>

        <div className="mt-3">
          <p className="text-sm font-semibold text-white">OpenClaw Prompt</p>
          <p className={sectionDescriptionClass}>
            Copy this prompt and send it to your OpenClaw. It will configure
            the outbound wake stream and keep scheduled polling as fallback.
          </p>

          {promptError && <p className="mt-3 text-xs text-red-400">{promptError}</p>}

          <div className={`mt-3 max-h-[220px] overflow-y-auto p-3 font-mono text-xs text-neutral-300 whitespace-pre-wrap ${CODE_SURFACE}`}>
            {prompt ?? (promptLoading ? "Loading prompt..." : "Prompt unavailable right now.")}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleCopyPrompt}
              disabled={promptLoading}
              className={`${PRIMARY_BUTTON_SM} whitespace-nowrap`}
            >
              {promptCopied ? "Copied" : promptLoading ? "Loading..." : "Copy OpenClaw Prompt"}
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-800 pt-4">
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="group inline-flex min-h-9 items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-neutral-400 transition-colors hover:bg-white/[0.035] hover:text-white"
        >
          <span>{manualOpen ? "Hide legacy webhook configuration" : "Legacy incoming webhook"}</span>
          <ChevronIcon open={manualOpen} className="h-3.5 w-3.5" />
        </button>
      </div>

      {manualOpen && (
        <div className="space-y-3">
          <p className="text-[13px] leading-5 text-neutral-400">
            Optional power-user path if you already expose a public agent endpoint.
            The default realtime channel above does not need this. Gennety will use{" "}
            <code className="text-neutral-400 font-mono">{WAKE_PATH}</code> automatically.
          </p>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-950/40 px-3 py-3 ring-1 ring-inset ring-white/[0.08]">
            <div>
              <p className="text-[13px] font-medium text-neutral-200">Enable legacy inbound webhook</p>
              <p className="mt-1 text-xs text-neutral-500">
                Uses a public HTTPS endpoint only when no realtime stream is connected.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.wakeWebhookEnabled}
              disabled={saving}
              onClick={handleToggle}
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-[13px] text-neutral-400">Agent base URL (HTTPS)</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://your-agent.example.com"
              className={INPUT}
            />
          </label>

          <p className="text-xs text-neutral-500">
            Wake endpoint preview:{" "}
            <span className="font-mono text-neutral-400">{desiredUrl || `https://…${WAKE_PATH}`}</span>
          </p>

          {settings.webhookUrl && (
            <p className="font-mono text-xs text-neutral-500 break-all">
              Saved legacy webhook: {settings.webhookUrl}
            </p>
          )}

          {settings.wakeWebhookLastPingAt && (
            <p className="text-xs text-neutral-500">
              Last legacy check: {formatWakeTimestamp(settings.wakeWebhookLastPingAt)}
            </p>
          )}

          {testMessage && <p className="text-xs text-green-400">{testMessage}</p>}
          {testError && <p className="text-xs text-red-400">{testError}</p>}

          {settings.wakeWebhookLastPingOk === false && settings.wakeWebhookLastPingError && !testError && (
            <p className="text-xs text-red-300">{settings.wakeWebhookLastPingError}</p>
          )}

          <label className="block">
            <span className="mb-1 block text-[13px] text-neutral-400">
              Bearer token {settings.webhookTokenSet && !token && (
                <span className="text-neutral-500">(currently set - leave empty to keep)</span>
              )}
            </span>
            <div className="flex gap-2">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={settings.webhookTokenSet ? "•••••••••" : "token"}
                autoComplete="off"
                className={`${INPUT} flex-1 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className={SECONDARY_BUTTON_SM}
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <SaveStatus saving={saving} saved={saved} err={err} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !settings.wakeWebhookEnabled || !legacyWebhookConfigured}
                className={SECONDARY_BUTTON_SM}
              >
                {testing ? "Testing..." : "Test legacy webhook"}
              </button>
              {(settings.webhookUrl || settings.webhookTokenSet) && (
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className={SECONDARY_BUTTON_SM}
                >
                  Clear
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className={PRIMARY_BUTTON_SM}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── P1: Language ── */

function LanguageSection() {
  const t = useTranslations();
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const [selected, setSelected] = useState<Locale | "auto">(() => {
    if (typeof document === "undefined") {
      return currentLocale;
    }

    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("locale="));

    return cookie ? currentLocale : "auto";
  });

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
      <p className={cx(sectionDescriptionClass, "mb-4")}>
        {t("settings.languageDesc")}
      </p>
      <div className="space-y-1.5">
        {/* Auto option */}
        <button
          onClick={() => handleChange("auto")}
          className={`${OPTION_BUTTON} text-sm ${
            selected === "auto"
              ? OPTION_ACTIVE
              : OPTION_IDLE
          }`}
        >
          {t("settings.languageAuto")}
        </button>
        {/* Locale options */}
        {locales.map((l) => (
          <button
            key={l}
            onClick={() => handleChange(l)}
            className={`${OPTION_BUTTON} text-sm ${
              selected === l
                ? OPTION_ACTIVE
                : OPTION_IDLE
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
      <Surface className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-[13px] text-neutral-400">{t("settings.platform")}</p>
          <p className="mt-1 text-sm text-neutral-300">{PLATFORM_LABELS[platform] ?? platform}</p>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopy}
            disabled={copied}
            className={SECONDARY_BUTTON}
          >
            {copied ? t("common.copied") : t("settings.copyContent")}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={SECONDARY_BUTTON}
          >
            {downloading ? t("settings.downloading") : t("settings.downloadSoul")}
          </button>
        </div>
      </Surface>
    </Section>
  );
}

/* ── Setup Prompt (OpenClaw onboarding) ── */

function SetupPromptSection() {
  const t = useTranslations();
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/openclaw-prompt");
        if (!res.ok) throw new Error("Failed to load prompt");
        const data = await res.json();
        if (!cancelled) setPrompt(data.prompt);
      } catch {
        if (!cancelled) setError(t("settings.failedToLoadPrompt"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

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
      <p className={cx(sectionDescriptionClass, "mb-4")}>
        {t("settings.setupPromptDesc")}
      </p>

      <div className={`mb-3 max-h-[300px] overflow-y-auto p-4 font-mono text-xs leading-relaxed text-neutral-300 whitespace-pre-wrap select-all ${CODE_SURFACE}`}>
        {loading ? t("common.loading") : prompt}
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          disabled={!prompt || copied}
          className={PRIMARY_BUTTON}
        >
          {copied ? t("common.copied") : t("settings.copyPrompt")}
        </button>
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
    <div className="mt-10 rounded-xl bg-red-500/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <h2 className="mb-4 text-[13px] font-semibold uppercase text-red-200">
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
            className="mb-3 w-full min-h-10 rounded-xl bg-red-950/[0.16] px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 transition focus:outline-none focus:bg-red-950/[0.22]"
          />
          {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={saving || !email}
              className={DANGER_BUTTON}
            >
              {saving ? t("settings.deleting") : t("settings.deleteMyAccount")}
            </button>
            <button
              onClick={() => {
                setShowConfirm(false);
                setEmail("");
              }}
              className={SECONDARY_BUTTON}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-400">
            {t("settings.deleteDesc")}
          </p>
          <button
            onClick={() => setShowConfirm(true)}
            className={DANGER_SUBTLE_BUTTON}
          >
            {t("settings.deleteAccount")}
          </button>
        </div>
      )}
    </div>
  );
}
