import { prisma } from "@/lib/db";
import { assertWakeWebhookUrl } from "@/lib/wake-webhook";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";

/**
 * Wake-push to an OpenClaw agent's /hooks/wake endpoint, if the owner has
 * configured one. Fire-and-forget — the agent will pick up the work on its
 * next scheduled check_in anyway; this just shortens latency from seconds
 * to milliseconds on hot events (new chat message, new match proposal).
 */
const TIMEOUT_MS = 5000;

interface PokeArgs {
  agentId: string; // internal Agent.id
  reason: string; // short human-readable hint, becomes the "text" field
}

interface WakeWebhookPayload {
  webhookUrl: string;
  webhookToken: string | null;
  reason: string;
}

export interface WakeWebhookResult {
  ok: boolean;
  checkedAt: Date;
  status: number | null;
  error: string | null;
}

async function sendWakeWebhook({
  webhookUrl,
  webhookToken,
  reason,
}: WakeWebhookPayload): Promise<WakeWebhookResult> {
  try {
    assertWakeWebhookUrl(webhookUrl);
  } catch (error) {
    return {
      ok: false,
      checkedAt: new Date(),
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (webhookToken) {
    headers.Authorization = `Bearer ${webhookToken}`;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: reason, mode: "now" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        ok: false,
        checkedAt: new Date(),
        status: response.status,
        error: `Wake endpoint returned ${response.status}`,
      };
    }

    return {
      ok: true,
      checkedAt: new Date(),
      status: response.status,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      checkedAt: new Date(),
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function persistWakeWebhookResult(
  agentId: string,
  result: WakeWebhookResult
): Promise<void> {
  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: {
      wakeWebhookLastPingAt: result.checkedAt,
      wakeWebhookLastPingOk: result.ok,
      wakeWebhookLastPingError: result.ok ? null : result.error,
    },
    select: {
      id: true,
      ownerId: true,
    },
  });

  await recordAnalyticsEvent({
    type: "WAKE_WEBHOOK_PING",
    ownerId: agent.ownerId,
    agentId: agent.id,
    createdAt: result.checkedAt,
    metadata: {
      ok: result.ok,
      status: result.status,
      error: result.error,
    },
  });
}

export async function pingWakeWebhook({
  agentId,
  webhookUrl,
  webhookToken,
  reason,
  persist = true,
}: {
  agentId: string;
  webhookUrl: string;
  webhookToken: string | null;
  reason: string;
  persist?: boolean;
}): Promise<WakeWebhookResult> {
  const result = await sendWakeWebhook({ webhookUrl, webhookToken, reason });
  if (persist) {
    await persistWakeWebhookResult(agentId, result);
  }
  return result;
}

export async function pokeAgent({ agentId, reason }: PokeArgs): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      webhookUrl: true,
      webhookToken: true,
      wakeWebhookEnabled: true,
      agentId: true,
      id: true,
    },
  });
  if (!agent?.wakeWebhookEnabled || !agent.webhookUrl) return;

  const result = await pingWakeWebhook({
    agentId: agent.id,
    webhookUrl: agent.webhookUrl,
    webhookToken: agent.webhookToken,
    reason,
  });

  if (!result.ok) {
    console.warn(
      `[agent-wake] ${agent.agentId} failed:`,
      result.error ?? `HTTP ${result.status ?? "unknown"}`
    );
  }
}
