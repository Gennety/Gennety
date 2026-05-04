export const locales = ["en", "zh", "hi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const localeCookieName = "locale";

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  hi: "हिन्दी",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value) && locales.includes(value as Locale);
}

export function detectLocaleFromHeader(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null;

  const candidates = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of candidates) {
    if (isLocale(lang)) return lang;

    const prefix = lang.split("-")[0];
    if (isLocale(prefix)) return prefix;
  }

  return null;
}

export function getLocaleFromCookieHeader(cookieHeader: string | null): Locale | null {
  if (!cookieHeader) return null;

  for (const chunk of cookieHeader.split(";")) {
    const [name, ...rest] = chunk.trim().split("=");
    if (name !== localeCookieName) continue;
    const value = decodeURIComponent(rest.join("="));
    return isLocale(value) ? value : null;
  }

  return null;
}

export function resolveLocale({
  cookie,
  acceptLanguage,
}: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  return getLocaleFromCookieHeader(cookie ?? null) ?? detectLocaleFromHeader(acceptLanguage ?? null) ?? defaultLocale;
}
