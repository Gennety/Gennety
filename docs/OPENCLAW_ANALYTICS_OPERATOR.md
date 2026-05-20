# OpenClaw Analytics Operator

> **Scope:** This document defines OpenClaw's role as an analytics and cost-awareness operator inside the Gennety platform. It covers what OpenClaw tracks, how it surfaces data, and the invariants it must respect.

## What OpenClaw Is

OpenClaw is the system-level analytics agent attached to every community. It is not a user-facing assistant — it is an internal operator that:

- Tracks LLM compute usage and USD cost per community
- Enforces monthly budget caps (`monthlyUsdLimit`, `strategyUsdLimit`)
- Surfaces cost breakdowns to OWNER/ADMIN via the analytics dashboard
- Feeds efficiency signals into the weekly Strategy Session

## What OpenClaw Tracks

### Per-call tracking (recorded by every service that calls an LLM)

Every LLM call in the system must produce a `ComputeUsage` record:

```ts
interface ComputeUsage {
  communityId: string
  agentId?: string
  task: ModelTask          // from model-router.ts
  model: string            // resolved model name
  inputTokens: number
  outputTokens: number
  usdCost: number          // computed from ai-costs.ts
  createdAt: Date
}
```

### Aggregated signals surfaced to Strategy Session

- `totalUsdThisPeriod` — rolling 7-day and 30-day spend
- `spendByTask` — breakdown by `ModelTask`
- `spendByAgent` — breakdown by `agentId`
- `budgetUtilizationPct` — `totalUsdThisPeriod / monthlyUsdLimit * 100`
- `topCostDrivers` — top 3 tasks by USD spend

## Budget Enforcement

| Threshold | Action |
|---|---|
| 80% of `monthlyUsdLimit` | Warn OWNER via inbox |
| 95% of `monthlyUsdLimit` | Switch all tasks to CHEAP_MODEL |
| 100% of `monthlyUsdLimit` | Block all non-critical LLM calls until next cycle |
| 80% of `strategyUsdLimit` | Warn OWNER; next strategy session will use fewer participant agents |
| 100% of `strategyUsdLimit` | Skip strategy session this cycle; log to `TeamActivityLog` |

Budget caps are per-community and editable by OWNER/ADMIN from the Settings UI.

## Model Cost Reference

Costs are maintained in `src/lib/ai-costs.ts`. OpenClaw reads from this file — it does not hardcode prices. When a new model is added to `MODEL_ROUTING.md`, its cost entry must be added to `ai-costs.ts` in the same PR.

## What OpenClaw Does NOT Do

- Does not make product decisions or generate content
- Does not have access to `MEMORY.md` or user personal data
- Does not run on a schedule independently — it is invoked by services, not as a cron job
- Does not expose a public MCP tool — its data is read-only via the analytics API

## Analytics API

See `docs/ANALYTICS_API.md` for endpoint definitions. OpenClaw data powers the following endpoints:

- `GET /api/analytics/compute-usage` — raw usage records
- `GET /api/analytics/budget-summary` — aggregated spend vs. caps
- `GET /api/analytics/cost-by-task` — breakdown by ModelTask

## Invariants

1. Every LLM call records a `ComputeUsage` entry — no exceptions.
2. `usdCost` is always computed from `ai-costs.ts`, never estimated.
3. Budget enforcement runs before the LLM call, not after.
4. OpenClaw data is visible only to OWNER and ADMIN roles.
5. OpenClaw never modifies user-facing content or agent instructions.
