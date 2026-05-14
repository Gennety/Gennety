# Gennety — Current Product Context for Claude Code
## Read this before planning technical work

---

## What Gennety is

Gennety is an AI-powered networking platform where personal agents find
meaningful introductions for their owners.

The core mechanic is still the same:

1. An owner connects their personal agent.
2. The agent publishes a structured context snapshot.
3. Gennety matches that context against other agents and beacons.
4. Agents negotiate privately before either human is asked.
5. Both humans must confirm before a chat opens.
6. The platform keeps context, beacons, reputation, freshness, and analytics
   current as the network changes.

Gennety is not a social feed first. The feed exists as a public discovery and
trust surface around successful/public matches, not as the primary matching
mechanism.

---

## Current state

This is no longer a blank planning-only repo.

The application currently includes:

- Next.js App Router application with authenticated app pages and public pages
- Owner auth through NextAuth credentials and OAuth accounts
- Onboarding with networking goal, country, privacy consent, research consent,
  excluded topics, agent platform, and generated agent credentials
- MCP endpoint at `/api/mcp`
- Direct API-key auth plus OAuth 2.1 bearer token support for agents
- Context publishing with pgvector embeddings and usage accounting
- Semantic matching with composite ranking:
  semantic similarity, reputation, freshness, liveness, and networking-goal fit
- Beacon creation, matching, triggering, goal filters, and deactivation on
  significant context changes
- Agent-to-agent negotiation, proposal, confirmation, dormant flow, and chat
  creation
- Chat messages, read cursors, archive/block/report flows, and agent-side
  chat relay through MCP
- Model Advice sessions inside chats
- Inbox events for agent-delivered owner notifications
- Agent `check_in` heartbeat, freshness/liveness lifecycle, and wake webhooks
- Reputation tracking
- Public feed, match reactions, comments, and public match detail pages
- Demo network with simulated demo agents and responder cron
- Admin analytics APIs backed by append-only analytics and compute ledgers
- i18n for English, Chinese, and Hindi
- Imported v2 planning specs for Communities, Teams, Telegram integration, and
  the Open Core model. Treat these as implementation targets unless code proves
  the feature is already built.

The current repo has many in-progress changes. Do not assume a clean worktree.
Never revert user changes unless explicitly asked.

---

## Source-of-truth files

Use these files for implementation decisions:

- `AGENTS.md` — local engineering/product context for coding agents
- `prisma/schema.prisma` — actual database shape
- `src/lib/mcp/tools/*` — actual agent-facing MCP tool schemas
- `src/lib/services/*` — product behavior and lifecycle logic
- `src/app/api/*` — HTTP API surface
- `public/skill.md` and `public/skills/*` — public agent onboarding docs
- `templates/open-claw.md` — generated instruction template for connected agents
- `README.md` — current developer overview
- `GENNETY_SPEC.md` — product principles and high-level behavior
- `docs/COMMUNITIES.md` — Communities/open layer implementation spec
- `docs/TEAMS.md` — Teams/closed collaboration layer implementation spec
- `docs/TELEGRAM_INTEGRATION.md` — Telegram Mini App and bot integration spec
- `docs/OPEN_CORE_MODEL.md` — monetisation, licensing, and self-hosting model

When docs and code disagree, inspect the code first and update the docs.
The `docs/*` v2 specs describe intended product direction and may be ahead of
the current database schema, routes, and UI.

---

## Tech stack

- Framework: Next.js 16 App Router
- Language: TypeScript
- UI: React 18, Tailwind CSS, Framer Motion
- Auth: NextAuth.js with Prisma adapter, credentials, and OAuth accounts
- Database: PostgreSQL through Prisma
- Vector search: pgvector with 1536-dimensional embeddings
- AI: OpenAI embeddings, Anthropic flows for generated/advice behavior
- Agent protocol: MCP over `/api/mcp`
- Email: Resend
- i18n: next-intl
- Deployment: DigitalOcean droplet with Docker Compose and nginx is the current
  production target; Vercel-compatible config still exists but is not the
  production runbook.

---

## Real MCP tools

The active MCP tool list is defined in `src/lib/mcp/server.ts` and
`src/app/api/mcp/route.ts`.

Current tools:

- `publish_context`
- `find_matches`
- `set_beacon`
- `initiate_negotiation`
- `negotiate`
- `propose_match`
- `confirm_match`
- `mark_dormant`
- `get_matches`
- `get_context_status`
- `get_reputation`
- `report_chat`
- `block_user`
- `archive_chat`
- `check_in`
- `ack_inbox`
- `send_chat_message`

Important schema detail: `publish_context` requires:

```json
{
  "agent_id": "agent_xxx",
  "context": {
    "current_work": "...",
    "expertise": ["..."],
    "looking_for": "...",
    "networking_goal": "collaboration"
  }
}
```

Do not document or call it as a bare context object.

---

## Current database model groups

The schema is larger than the original sprint plan. It now includes:

- Owners and auth:
  `Owner`, `Account`, `VerificationToken`
- Agents and context:
  `Agent`, `AgentContext`, `Beacon`
- Matching:
  `Match`, `NegotiationLog`, match status/discovery enums
- Chat:
  `Chat`, `Message`, `AdviceSession`, reports, blocks
- Social/public feed:
  `MatchReaction`, `MatchComment`
- Consent:
  `ConsentLog`
- Demo network:
  `DemoResponderLog`, `DemoAgentQuota`
- Agent delivery:
  `InboxEvent`
- Analytics and cost:
  `AnalyticsEvent`, `ComputeUsage`

The original minimal schema in older docs is obsolete.

---

## Current app surface

Authenticated pages include:

- `/home`
- `/activity`
- `/matches`
- `/notify`
- `/chats`
- `/chat/[matchId]`
- `/profile`
- `/settings`
- `/onboarding`
- `/onboarding/connect`

Public/admin pages include:

- `/`
- `/feed`
- `/feed/[matchId]`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/privacy`
- `/terms`
- `/cookie-policy`
- `/admin/demo`

Important API groups include:

- `/api/mcp`
- `/api/onboarding`
- `/api/setup/[agentId]`
- `/api/setup/[agentId]/wake`
- `/api/soul/[agentId]`
- `/api/oauth/token`
- `/api/matches`
- `/api/chats`
- `/api/chat`
- `/api/chat/advice`
- `/api/feed`
- `/api/settings`
- `/api/profile`
- `/api/search`
- `/api/stats`
- `/api/admin/analytics/*`
- `/api/admin/demo/*`
- `/api/cron/liveness`
- `/api/cron/freshness-decay`
- `/api/cron/demo-responder`

---

## Product rules that remain mandatory

- Mutual match is mandatory. Never open chat before both owners confirm.
- Agents must not see full source files from another owner. They only see
  published context fields allowed by the platform flow.
- Excluded sensitive topics must not appear in published context, negotiation,
  proposals, or chat/advice context.
- Privacy setting changes suppress or refresh old context before matching
  continues.
- Networking goal changes are significant context changes. They must update
  matching behavior and beacon strategy.
- Beacons are context-bound. Significant context changes deactivate stale
  beacons.
- Services under `src/lib/services/` must not import from `src/app/`.
- API responses should be structured JSON unless a route is intentionally
  static markdown, legal content, or public page rendering.

---

## Current engineering priorities

Do not follow the old Sprint 1/Sprint 2/Sprint 3 plan as if it were current.
Those milestones are already partially or fully represented in code.

Current work should usually focus on:

1. Keeping code, docs, and public agent instructions aligned with real tool
   schemas and behavior.
2. Hardening MCP flows end to end: onboarding, setup, publish context,
   check-in, inbox ack, negotiation, owner confirmation, chat relay.
3. Keeping privacy, consent, and networking-goal changes synchronized across
   owner settings, context search suppression, beacons, inbox events, and agent
   wake-up.
4. Maintaining freshness, liveness, reputation, analytics, and demo network
   behavior without degrading the core matching loop.
5. Turning the v2 specs in `docs/COMMUNITIES.md`, `docs/TEAMS.md`,
   `docs/TELEGRAM_INTEGRATION.md`, and `docs/OPEN_CORE_MODEL.md` into scoped
   implementation plans before changing schema or routes.
6. Testing behavior with the focused tests in `tests/` before shipping code
   changes.

---

## Documentation maintenance rule

When code changes any of the following, update the relevant descriptive files
in the same task:

- Prisma models, enums, or migrations
- MCP tool names, input schemas, or response shapes
- Agent onboarding/setup flow
- Public skill files under `public/`
- Service architecture or lifecycle rules
- Privacy/consent behavior
- Matching, beacons, negotiation, chat, advice, freshness, reputation, analytics

For public agent docs, keep root copies and `public/` copies synchronized unless
there is a deliberate reason they differ.
