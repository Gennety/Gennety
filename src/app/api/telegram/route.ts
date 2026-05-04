import { NextRequest, NextResponse } from "next/server";
import { safeErrorResponse } from "@/lib/api-error";
import {
  answerTelegramCallbackQuery,
  isConfiguredTelegramChat,
} from "@/lib/services/telegram";
import {
  setAgentSearchPaused,
  setAgentSearchPausedByExternalId,
} from "@/lib/services/agent-search";

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number | string } };
  };
}

function isAuthorized(request: NextRequest, chatId: string | number | null | undefined) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (expectedSecret) {
    const actualSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (actualSecret !== expectedSecret) return false;
  }

  return isConfiguredTelegramChat(chatId);
}

function parseTextCommand(text: string) {
  const [commandWithBot, agentId] = text.trim().split(/\s+/);
  const command = commandWithBot.split("@")[0];
  if (!agentId) return null;

  if (command === "/pause_search" || command === "/stop_matches") {
    return { paused: true, agentId };
  }
  if (command === "/resume_search" || command === "/start_matches") {
    return { paused: false, agentId };
  }

  return null;
}

function parseCallbackCommand(data: string) {
  const [action, id] = data.split(":");
  if (!id) return null;

  if (action === "pause_search_id") return { paused: true, agentInternalId: id };
  if (action === "resume_search_id") return { paused: false, agentInternalId: id };

  return null;
}

async function applyCommand(command: { paused: boolean; agentId?: string; agentInternalId?: string }) {
  if (command.agentInternalId) {
    await setAgentSearchPaused({
      agentInternalId: command.agentInternalId,
      paused: command.paused,
      source: "telegram",
    });
    return;
  }

  if (!command.agentId) throw new Error("Agent ID is required");

  await setAgentSearchPausedByExternalId({
    agentExternalId: command.agentId,
    paused: command.paused,
    source: "telegram",
  });
}

export async function POST(request: NextRequest) {
  try {
    const update = (await request.json()) as TelegramUpdate;
    const messageChatId = update.message?.chat?.id;
    const callbackChatId = update.callback_query?.message?.chat?.id;
    const chatId = messageChatId ?? callbackChatId;

    if (!isAuthorized(request, chatId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const callbackId = update.callback_query?.id;
    const command =
      update.callback_query?.data
        ? parseCallbackCommand(update.callback_query.data)
        : update.message?.text
          ? parseTextCommand(update.message.text)
          : null;

    if (!command) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    await applyCommand(command);

    if (callbackId) {
      answerTelegramCallbackQuery(callbackId, command.paused ? "Search paused" : "Search resumed").catch(
        (error) => console.error("[telegram] callback answer failed:", error)
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return safeErrorResponse(error, "Failed to handle Telegram update");
  }
}
