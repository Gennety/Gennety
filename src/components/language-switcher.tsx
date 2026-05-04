"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { localeCookieName, locales, localeNames, type Locale } from "@/i18n/config";

export function LanguageSwitcher({
  compact,
  dropUp,
}: {
  compact?: boolean;
  dropUp?: boolean;
}) {
  const locale = useLocale() as Locale;
  const tSettings = useTranslations("settings");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasExplicitLocale =
    typeof document === "undefined"
      ? true
      : document.cookie.split("; ").some((cookie) => cookie.startsWith(`${localeCookieName}=`));

  const selectedOption: Locale | "auto" = hasExplicitLocale ? locale : "auto";

  async function switchLocale(next: Locale | "auto") {
    if (next === selectedOption) {
      setOpen(false);
      return;
    }

    if (next === "auto") {
      document.cookie = `${localeCookieName}=; path=/; max-age=0`;
    } else {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    }

    setOpen(false);
    router.refresh();
  }

  const flag: Record<Locale, string> = { en: "EN", zh: "中", hi: "हि" };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-full transition-colors text-neutral-400 hover:text-white ${
          compact ? "px-2 py-1.5 text-xs" : "px-2.5 py-2 text-sm"
        }`}
      >
        <GlobeIcon />
        <span className="font-medium">{flag[locale]}</span>
        <ChevronIcon open={open} />
      </button>

      <div
        className={`absolute ${
          dropUp ? "bottom-full mb-1.5 origin-bottom-right" : "top-full mt-1.5 origin-top-right"
        } right-0 z-50 min-w-[160px] rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] shadow-2xl shadow-black/40 overflow-hidden transition-all duration-200 ${
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="py-1">
          <button
            onClick={() => switchLocale("auto")}
            className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors ${
              selectedOption === "auto"
                ? "text-white"
                : "text-neutral-500 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            <span>{tSettings("languageAuto")}</span>
            {selectedOption === "auto" && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-neutral-400"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => switchLocale(l)}
              className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors ${
                l === locale && selectedOption !== "auto"
                  ? "text-white"
                  : "text-neutral-500 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <span>{localeNames[l]}</span>
              {l === locale && selectedOption !== "auto" && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-neutral-400"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
