"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

const REPORT_CATEGORIES = [
  "SPAM_OR_SCAM",
  "HARASSMENT",
  "PRIVACY_VIOLATION",
  "IMPERSONATION",
  "INAPPROPRIATE_CONTENT",
  "LOW_QUALITY_OR_IRRELEVANT_MATCH",
  "OTHER",
] as const;

type ReportCategory = (typeof REPORT_CATEGORIES)[number];

interface ChatReportDialogProps {
  open: boolean;
  chatId: string | null;
  targetName: string | null;
  onClose: () => void;
}

function CloseIcon({ className = "h-4 w-4" }: { className?: string }) {
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

function FlagIcon({ className = "h-4 w-4" }: { className?: string }) {
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

export function ChatReportDialog({
  open,
  chatId,
  targetName,
  onClose,
}: ChatReportDialogProps) {
  const t = useTranslations();
  const [category, setCategory] = useState<ReportCategory>("SPAM_OR_SCAM");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => !!chatId && details.trim().length >= 12 && !submitting,
    [chatId, details, submitting]
  );

  useEffect(() => {
    if (!open) return;

    setCategory("SPAM_OR_SCAM");
    setDetails("");
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  async function submitReport() {
    if (!canSubmit || !chatId) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/chat/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          category,
          details: details.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? t("chat.report.submitError"));
        return;
      }

      setSubmitted(true);
    } catch {
      setError(t("chat.report.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={t("common.cancel")}
        onClick={onClose}
      />
      <section className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-white/10 bg-neutral-950 p-5 text-white shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-200 ring-1 ring-inset ring-red-400/20">
              <FlagIcon />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                {t("chat.report.title")}
              </h2>
              <p className="mt-1 text-sm leading-5 text-neutral-500">
                {t("chat.report.subtitle", {
                  name: targetName ?? t("common.unknown"),
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-2 flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
            aria-label={t("common.cancel")}
          >
            <CloseIcon />
          </button>
        </div>

        {submitted ? (
          <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-400/8 px-4 py-3">
            <p className="text-sm font-medium text-emerald-100">
              {t("chat.report.submittedTitle")}
            </p>
            <p className="mt-1 text-sm leading-5 text-emerald-100/70">
              {t("chat.report.submittedDesc")}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
            >
              {t("chat.report.done")}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                {t("chat.report.categoryLabel")}
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as ReportCategory)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-neutral-900 px-3 py-3 text-sm text-white outline-none transition-colors focus:border-neutral-600"
              >
                {REPORT_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {t(`chat.report.categories.${item}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                {t("chat.report.reasonLabel")}
              </span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={5}
                maxLength={2000}
                placeholder={t("chat.report.reasonPlaceholder")}
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-neutral-900 px-3 py-3 text-sm leading-5 text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-600"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                {t("chat.report.minReason")}
              </span>
            </label>

            {error && (
              <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/8"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={!canSubmit}
                className="flex-1 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? t("chat.report.submitting") : t("chat.report.submit")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
