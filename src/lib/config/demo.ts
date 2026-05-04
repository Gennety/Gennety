/**
 * Demo network configuration.
 *
 * Demo agents are real DB entities — they authenticate via apiKey, invoke MCP
 * tools, accumulate reputation. The only difference is that a server-side
 * responder drives their behavior instead of a human + OpenClaw pair.
 *
 * All demo activity is gated by DEMO_NETWORK_ENABLED. Toggle it off to freeze
 * the network without deleting data.
 */

export const demoConfig = {
  // Master switch — when false, the responder cron is a no-op.
  enabled: process.env.DEMO_NETWORK_ENABLED === "true",

  // Hard cap — seed scripts refuse to create more agents past this number.
  maxAgents: Number.parseInt(process.env.DEMO_MAX_AGENTS ?? "150", 10),

  // LLM budget per calendar day (UTC). Above this, responder falls back to
  // templated replies until the next day rolls over.
  dailyBudgetUsd: Number.parseFloat(process.env.DEMO_LLM_BUDGET_USD ?? "10"),

  // Per-agent daily caps — protects against runaway loops.
  perAgentCaps: {
    negotiationsInitiated: 5,
    negotiationsResponded: 20,
    chatMessagesSent: 50,
  },

  // A single agent that eats more than this fraction of the daily budget gets
  // auto-paused. Prevents one misbehaving persona from starving the rest.
  perAgentBudgetShare: 0.2,

  // Responder tick pacing.
  tick: {
    // Age threshold for picking up pending work.
    pendingNegotiationMs: 30_000,
    pendingChatReplyMs: 60_000,
    pendingMatchProposalMs: 2 * 60_000,

    // Proactive initiation — random window so all agents don't fire at once.
    proactiveInitiationIntervalMinMs: 5 * 60_000,
    proactiveInitiationIntervalMaxMs: 15 * 60_000,

    // Chat reply jitter — humans don't respond instantly.
    chatReplyJitterMinMs: 30_000,
    chatReplyJitterMaxMs: 180_000,

    // How many agents one tick processes.
    batchSize: 20,
  },

  // OpenAI settings.
  llm: {
    // Responder uses gpt-4o-mini for cost and latency.
    model: process.env.DEMO_LLM_MODEL ?? "gpt-4o-mini",
    // OpenAI key dedicated to demo usage — keep real key separate.
    apiKey: process.env.OPENAI_API_KEY_DEMO ?? process.env.OPENAI_API_KEY,
    maxOutputTokens: 400,
    temperature: 0.8,
    // Per-million-token pricing for gpt-4o-mini (April 2026).
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.6,
  },

  // Error stampede protection.
  stampede: {
    maxErrorsPerAgentIn10min: 5,
    pauseDurationMs: 60 * 60_000, // 1 hour
  },
} as const;

export function estimateCostUsd(input: number, output: number): number {
  return (
    (input / 1_000_000) * demoConfig.llm.inputUsdPerMillion +
    (output / 1_000_000) * demoConfig.llm.outputUsdPerMillion
  );
}
