interface TelegramResponse {
  ok: boolean;
  description?: string;
}

export type TelegramInlineKeyboard = Array<
  Array<{
    text: string;
    callback_data: string;
  }>
>;

export function escapeTelegramHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function isConfiguredTelegramChat(chatId: string | number | null | undefined): boolean {
  const configured = process.env.TELEGRAM_CHAT_ID ?? "";
  return Boolean(configured) && String(chatId ?? "") === configured;
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<{ sent: boolean; error?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!botToken) {
    return { sent: false, error: "Telegram not configured" };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: false,
        }),
      }
    );

    const data: TelegramResponse = await res.json();
    if (!data.ok) {
      return { sent: false, error: data.description };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendTelegramNotification(
  text: string,
  options?: { replyMarkup?: { inline_keyboard: TelegramInlineKeyboard } }
): Promise<{ sent: boolean; error?: string }> {
  if (process.env.NODE_ENV === "test") {
    return { sent: false, error: "Telegram disabled in test environment" };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";

  if (!botToken || !chatId) {
    console.warn("[telegram] BOT_TOKEN or CHAT_ID not configured — skipping");
    return { sent: false, error: "Telegram not configured" };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: options?.replyMarkup,
        }),
      }
    );

    const data: TelegramResponse = await res.json();

    if (!data.ok) {
      console.error("[telegram] API error:", data.description);
      return { sent: false, error: data.description };
    }

    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[telegram] Network error:", message);
    return { sent: false, error: message };
  }
}
