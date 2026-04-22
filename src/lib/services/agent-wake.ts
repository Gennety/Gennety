import { prisma } from "@/lib/db";

/**
 * Wake-push to an OpenClaw agent's /hooks/wake endpoint, if the owner has
 * configured one. Fire-and-forget — the agent will pick up the work on its
 * next scheduled check_in anyway; this just shortens latency from seconds
 * to milliseconds on hot events (new chat message, new match proposal).
 *
 * No-op when the agent has no webhookUrl. Errors are logged, never thrown.
 */
const TIMEOUT_MS = 5000;

interface PokeArgs {
  agentId: string; // internal Agent.id
  reason: string; // short human-readable hint, becomes the "text" field
}

export async function pokeAgent({ agentId, reason }: PokeArgs): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { webhookUrl: true, webhookToken: true, agentId: true },
  });
  if (!agent?.webhookUrl) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (agent.webhookToken) {
    headers.Authorization = `Bearer ${agent.webhookToken}`;
  }

  try {
    const response = await fetch(agent.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: reason, mode: "now" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[agent-wake] ${agent.agentId} returned ${response.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[agent-wake] ${agent.agentId} failed:`, msg);
  }
}
