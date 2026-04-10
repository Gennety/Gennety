"use client";

import { useTranslations } from "next-intl";
import { useCookieConsent } from "@/hooks/useCookieConsent";

export function CookiePreferencesButton() {
  const t = useTranslations("cookie");
  const { withdrawConsent } = useCookieConsent();

  return (
    <button
      onClick={withdrawConsent}
      className="text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
    >
      {t("preferences")}
    </button>
  );
}
