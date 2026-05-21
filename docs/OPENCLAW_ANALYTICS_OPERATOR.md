# OpenClaw Analytics Operator

Status: canonical current operator spec.

OpenClaw Operator is an internal admin/operator workflow, not a public MCP tool and not an end-user agent. It reviews safety reports, assembles analytics, optionally performs market search, and produces the weekly operator report.

## Entry Points

- `GET /api/admin/analytics/openclaw` previews the digest for the private dashboard.
- `POST /api/admin/analytics/openclaw` runs the operator manually.
- `GET /api/cron/openclaw-operator` runs from Vercel cron.
- The cron is hourly: `0 * * * *`.

The weekly report is due during the Sunday 23:00 Kyiv hour unless manually forced.

## Moderation Regulation

The operator reviews recent `Report` rows and applies conservative, reversible safety actions.

- Single serious reports can block the reporter from the reported owner pair and request manual review.
- The reported agent is paused only for repeated serious reports from multiple reporters or severe evidence with repeated reports.
- Low-risk categories do not trigger automatic punishment.
- The operator records `OPENCLAW_MODERATION_REVIEWED` and `OPENCLAW_MODERATION_ACTION` analytics events.
- The operator never exposes private emails in generated reports.

Serious categories include spam/scam, harassment, privacy violation, impersonation, and inappropriate content. Low-risk categories include low-quality or irrelevant match reports and generic other reports.

## Weekly Report

The report combines:

- Admin analytics sections from `src/lib/admin-analytics/service.ts`.
- Moderation outcomes from the current operator run.
- Optional market search snippets.
- A compact Russian operator summary generated with Anthropic when `ANTHROPIC_API_KEY` is present.
- A deterministic fallback report when generation fails or the key is absent.

Delivery targets:

- Email via `OPENCLAW_REPORT_EMAIL`.
- Telegram via `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, unless `OPENCLAW_REPORT_TELEGRAM_DISABLED=1`.

## Market Search

Market search is optional and disabled unless a provider key is configured.

Supported provider configuration:

- `OPENCLAW_WEB_SEARCH_PROVIDER=serper` with `SERPER_API_KEY`
- `OPENCLAW_WEB_SEARCH_PROVIDER=tavily` with `TAVILY_API_KEY`
- `OPENCLAW_WEB_SEARCH_PROVIDER=custom` with `OPENCLAW_WEB_SEARCH_ENDPOINT` and `OPENCLAW_WEB_SEARCH_API_KEY`

If `OPENCLAW_WEB_SEARCH_PROVIDER` is empty, the operator auto-detects `SERPER_API_KEY`, then `TAVILY_API_KEY`, then the custom endpoint pair.

## Compute Tracking

Generated weekly reports record `ComputeUsage` with:

- `category: "OPENCLAW_OPERATOR"`
- `operation: "openclaw_weekly_report"`
- model and token counts from the Anthropic response
- USD cost estimated through `src/lib/ai-costs.ts`

The operator does not enforce community strategy budgets. Community strategy budget guards live in `src/lib/services/community-budget.ts`.

## Invariants

1. OpenClaw Operator is admin-only and server-to-server guarded.
2. It does not expose a public MCP tool.
3. It does not read raw `MEMORY.md`.
4. It does not make product changes or community role changes.
5. Automatic moderation actions must be conservative and logged.
6. The weekly report is informational; it is not an autonomous deployment or product-decision system.

