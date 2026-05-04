import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { loadMessages } from "./messages";
import { localeCookieName, resolveLocale } from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(localeCookieName)?.value ?? null;
  const headerStore = await headers();
  const acceptLang = headerStore.get("accept-language");
  const locale = resolveLocale({
    cookie: raw ? `${localeCookieName}=${encodeURIComponent(raw)}` : null,
    acceptLanguage: acceptLang,
  });

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
