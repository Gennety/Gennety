"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  useCookieConsent,
  type ConsentCategories,
} from "@/hooks/useCookieConsent";

const ALL_ACCEPTED: ConsentCategories = {
  necessary: true,
  analytics: true,
  marketing: true,
  functional: true,
};

const ALL_REJECTED: ConsentCategories = {
  necessary: true,
  analytics: false,
  marketing: false,
  functional: false,
};

/* ─── Toggle switch ────────────────────────────────────────── */

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
        checked ? "bg-white" : "bg-[#333]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow transition-transform ${
          checked
            ? "translate-x-5 bg-black"
            : "translate-x-0 bg-neutral-500"
        }`}
      />
    </button>
  );
}

/* ─── (CustomizeModal removed — settings now render inline) ── */

/* ─── Main banner ──────────────────────────────────────────── */

export function CookieConsent() {
  const t = useTranslations("cookie");
  const { hasConsented, submitConsent } = useCookieConsent();
  const [hiding, setHiding] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);

  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [functional, setFunctional] = useState(false);

  const dismiss = useCallback(
    (action: "accepted" | "rejected" | "partial", consents: ConsentCategories) => {
      setHiding(true);
      setShowCustomize(false);
      submitConsent(action, consents);
    },
    [submitConsent]
  );

  if (hasConsented) return null;

  const categories: {
    key: string;
    label: string;
    desc: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
  }[] = [
    {
      key: "necessary",
      label: t("cat.necessary"),
      desc: t("cat.necessaryDesc"),
      checked: true,
      onChange: () => {},
      disabled: true,
    },
    {
      key: "analytics",
      label: t("cat.analytics"),
      desc: t("cat.analyticsDesc"),
      checked: analytics,
      onChange: setAnalytics,
    },
    {
      key: "marketing",
      label: t("cat.marketing"),
      desc: t("cat.marketingDesc"),
      checked: marketing,
      onChange: setMarketing,
    },
    {
      key: "functional",
      label: t("cat.functional"),
      desc: t("cat.functionalDesc"),
      checked: functional,
      onChange: setFunctional,
    },
  ];

  return (
    <div
      role="dialog"
      aria-label={t("ariaLabel")}
      aria-live="polite"
      className={`fixed bottom-0 left-0 right-0 z-[100] p-2 sm:p-4 transition-all duration-300 ${
        hiding ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <div className="max-w-6xl mx-auto rounded-xl border border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-xl p-3 sm:px-5 sm:py-4 shadow-[0_-4px_40px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto">
        {!showCustomize ? (
          /* ── Default banner view ── */
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <p className="text-sm text-neutral-400 leading-relaxed flex-1 sm:whitespace-nowrap">
              {t("message")}{" "}
              <Link
                href="/cookie-policy"
                className="text-white underline underline-offset-2 hover:text-neutral-300 transition-colors"
              >
                {t("policy")}
              </Link>
            </p>
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:shrink-0">
              <button
                onClick={() => dismiss("rejected", ALL_REJECTED)}
                className="px-2.5 sm:px-3 py-1.5 sm:py-1.5 text-[11px] sm:text-xs text-neutral-500 hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg transition-colors"
              >
                {t("decline")}
              </button>
              <button
                onClick={() => setShowCustomize(true)}
                className="px-2.5 sm:px-3 py-1.5 sm:py-1.5 text-[11px] sm:text-xs text-neutral-400 hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg transition-colors"
              >
                {t("customize")}
              </button>
              <button
                onClick={() => dismiss("accepted", ALL_ACCEPTED)}
                className="px-3 sm:px-4 py-1.5 sm:py-1.5 text-[11px] sm:text-xs font-medium text-black bg-white hover:bg-neutral-200 rounded-lg transition-colors"
              >
                {t("accept")}
              </button>
            </div>
          </div>
        ) : (
          /* ── Inline customize view ── */
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">
                {t("customizeTitle")}
              </h2>
              <button
                onClick={() => setShowCustomize(false)}
                className="px-3 py-1.5 text-xs text-neutral-500 hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg transition-colors"
              >
                {t("cancel")}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4">
              {categories.map((cat) => (
                <div
                  key={cat.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#1a1a1a] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white">{cat.label}</p>
                    <p className="text-[11px] text-neutral-500 leading-tight mt-0.5 line-clamp-2 sm:line-clamp-1">
                      {cat.desc}
                    </p>
                  </div>
                  <Toggle
                    checked={cat.checked}
                    disabled={cat.disabled}
                    onChange={cat.onChange}
                    label={cat.label}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  const consents: ConsentCategories = {
                    necessary: true,
                    analytics,
                    marketing,
                    functional,
                  };
                  const allTrue = analytics && marketing && functional;
                  const allFalse = !analytics && !marketing && !functional;
                  const action = allTrue ? "accepted" : allFalse ? "rejected" : "partial";
                  dismiss(action, consents);
                }}
                className="px-5 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-lg transition-colors"
              >
                {t("savePreferences")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
