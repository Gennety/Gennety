"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

/* ─── Customize modal ──────────────────────────────────────── */

function CustomizeModal({
  onSave,
  onCancel,
}: {
  onSave: (consents: ConsentCategories) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("cookie");
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [functional, setFunctional] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("customizeTitle")}
        className="w-full max-w-lg rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          {t("customizeTitle")}
        </h2>

        <div className="space-y-4 mb-6">
          {categories.map((cat) => (
            <div
              key={cat.key}
              className="flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{cat.label}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{cat.desc}</p>
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

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-neutral-500 hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            onClick={() =>
              onSave({
                necessary: true,
                analytics,
                marketing,
                functional,
              })
            }
            className="px-5 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-lg transition-colors"
          >
            {t("savePreferences")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main banner ──────────────────────────────────────────── */

export function CookieConsent() {
  const t = useTranslations("cookie");
  const { hasConsented, submitConsent } = useCookieConsent();
  const [hiding, setHiding] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);

  const dismiss = useCallback(
    (action: "accepted" | "rejected" | "partial", consents: ConsentCategories) => {
      setHiding(true);
      setShowCustomize(false);
      submitConsent(action, consents);
    },
    [submitConsent]
  );

  if (hasConsented) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label="Cookie consent"
        aria-live="polite"
        className={`fixed bottom-0 left-0 right-0 z-[100] p-4 transition-all duration-300 ${
          hiding ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="max-w-2xl mx-auto rounded-xl border border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-xl p-5 shadow-[0_-4px_40px_rgba(0,0,0,0.5)]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <p className="text-sm text-neutral-400 leading-relaxed flex-1">
              {t("message")}{" "}
              <Link
                href="/cookie-policy"
                className="text-white underline underline-offset-2 hover:text-neutral-300 transition-colors"
              >
                {t("policy")}
              </Link>
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => dismiss("rejected", ALL_REJECTED)}
                className="px-3 py-2 text-sm text-neutral-500 hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg transition-colors"
              >
                {t("decline")}
              </button>
              <button
                onClick={() => setShowCustomize(true)}
                className="px-3 py-2 text-sm text-neutral-400 hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg transition-colors"
              >
                {t("customize")}
              </button>
              <button
                onClick={() => dismiss("accepted", ALL_ACCEPTED)}
                className="px-5 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-lg transition-colors"
              >
                {t("accept")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCustomize && (
        <CustomizeModal
          onSave={(consents) => {
            const allTrue = consents.analytics && consents.marketing && consents.functional;
            const allFalse = !consents.analytics && !consents.marketing && !consents.functional;
            const action = allTrue ? "accepted" : allFalse ? "rejected" : "partial";
            dismiss(action, consents);
          }}
          onCancel={() => setShowCustomize(false)}
        />
      )}
    </>
  );
}
