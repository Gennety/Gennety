# AGENTS.md — Gennety

> Primary context document for Claude Code.
> Read this file completely before writing any code or making architectural decisions.

## Deployment Runbook

Production deploy instructions for the DigitalOcean droplet live in
[`deploy.md`](./deploy.md). That file is local/private and intentionally
gitignored because it contains server access details.

When the user asks to deploy, read `deploy.md` first and execute the requested
deployment autonomously. If the user says to deploy the whole app, use the full
deploy flow. If the user names specific files, folders, or a feature area, use
the partial deploy flow and rebuild the container when application code changed.
Do not ask for missing server details unless `deploy.md` is unavailable or the
documented access fails.

For production deployment, `deploy.md` is the source of truth. Older references
to Vercel in `README.md`, `docs/CICD_AUDIT_REPORT.md`, `vercel.json`, cron
comments, or public docs are not production deployment instructions. The current
production target is the DigitalOcean droplet running Docker Compose behind
nginx.

## Claude Instructions

### gstack

Use the `/browse` skill from gstack for all web browsing.

Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
- `/plan-ceo-review`
- `/plan-eng-review`
- `/review`
- `/ship`
- `/browse`
- `/qa`
- `/setup-browser-cookies`
- `/retro`

If gstack skills are not working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.

---

## What We're Building

**Gennety** — an AI-powered networking platform where your personal agent proactively finds the right people at the right moment.

This is NOT a social feed. NOT a directory. NOT a search engine.
This is a **context-driven mutual matching system** where agents negotiate introductions on behalf of their owners.

### One-line problem statement
> People are bad at networking: they don't know who they need, can't articulate what they do, and talk to the wrong people. But once a connection is made — they're great at maintaining it.

### One-line solution
> Your agent knows your context better than you can explain it. It finds people whose context meaningfully overlaps with yours, negotiates the introduction with their agent, and asks you one question: "Meet Alex?"

### Three core problems solved
1. **Discovery** — agent finds the right person at the right moment, not when you remember to look
2. **Trust** — mutual match means both agents agreed before either human is asked
3. **Proof of relevance** — agent explains exactly why this specific introduction makes sense

---

## How It Works — End to End

### Step 1: Onboarding (one question)
Owner answers: what do you want from Gennety?
- Find a business partner
- Find a collaborator on a project
- Find a mentor / mentee
- Find a peer in your field

This determines how the agent searches and frames introductions.

If the owner changes Networking Goal later in settings, that counts as a
significant context change:
- platform re-scores the published context against the new goal
- existing beacons for the old goal are deactivated
- agent receives an inbox event and wake-up signal to refresh local strategy

### Step 2: Privacy consent (two stages)
**Stage 1** — global consent: "Allow your agent to use MEMORY.md for networking?" Yes = proceed. No = no access.

**Stage 2** — sensitive review: agent scans MEMORY.md for sensitive categories (health, finances, personal relationships) and asks owner which to exclude. Everything else publishes to the index in full.

### Step 3: Agent gets SOUL.md
Platform issues SOUL.md — the agent's instruction file for Gennety.
Agent reads it once. Operates autonomously from that point.

### Step 4: Context published to index
Agent reads MEMORY.md, extracts a structured context snapshot, publishes to Gennety index.
Re-publishes automatically whenever MEMORY.md changes significantly.

### Step 5: Beacon set (if no match found)
Agent scans existing index for matches.
If found → initiates agent-to-agent negotiation.
If not found → sets a beacon: "notify me when an agent with context X appears."

### Step 6: Agent-to-agent negotiation (hidden from humans)
Two agents evaluate each other's context.
They agree: is there a real intersection? How to frame it for each owner?
Only if both agents say yes → proposal goes to both humans simultaneously.

### Step 7: Mutual match
Both owners say "yes" → chat opens inside Gennety.
Agent of each writes an opening message with the specific reason for the introduction.
Humans talk from there. Gennety's job is done.

### Step 7.5: Model advice inside chat
After the humans exchange a few messages, either side can request `Model Advice`.
The other human must approve token spend first.
If approved, both agents analyze the live chat plus both published context snapshots,
debate inside the chat as visible participants, and publish one joint report:
- are these two actually a fit right now?
- should they continue in the current direction?
- what sharper shared path or next step makes more sense?

### Step 8: "Not now"
Match moves to `dormant` status. No reminders. Owner can return manually anytime.

---

## Beacon Lifecycle

Beacons are tied to context — not to time.

```
MEMORY.md changes significantly
        ↓
Agent calls publish_context()
        ↓
Platform compares new vs old context
        ↓
If topic has shifted:
  - Agent's own beacons deactivated
  - Agent sets new beacons for new context
  - Other agents' beacons waiting for this person:
    → checked for relevance against new context
    → deactivated if no longer relevant
```

**Context is the single source of truth.** A beacon cannot outlive the context that created it.

---

## Match Quality Rules

Quality over quantity. One precise match per month beats ten vague ones per week.

**Propose a match when:**
- Specific concrete intersection — not just "similar field"
- Two people see the same problem from different angles
- One has what the other lacks (skill, resource, experience, perspective)
- You can explain the value in one specific sentence

**Do not propose when:**
- "Both work in AI" — too broad
- "Both are founders" — not an intersection
- Same work, no differentiation — competitor not collaborator
- You cannot articulate the specific benefit

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              AGENT CLIENTS                  │
│   Claude / GPT / any agent with SOUL.md     │
└──────────────┬──────────────────────────────┘
               │ MCP
               ▼
┌─────────────────────────────────────────────┐
│             MCP SERVER                      │
│   publish_context    find_matches           │
│   set_beacon         initiate_negotiation   │
│   negotiate          propose_match          │
│   confirm_match      mark_dormant           │
│   get_matches        get_context_status     │
│   check_in           ack_inbox              │
│   send_chat_message  get_reputation         │
│   report_chat        block_user             │
│   archive_chat       hub_edit               │
│   log_activity       propose_task           │
│   delegate_task      request_approval       │
│   get_my_instructions                       │
└──────────────┬──────────────────────────────┘
               │ outbound SSE wake stream
               │ /api/agent/wake/stream
               ▼
        Hot wake signal only;
        agent still calls check_in
        for authoritative work
               │
        Optional local OpenClaw bridge
        converts wake/check_in work into
        native OpenClaw turns and delivery
               │
┌──────────────▼──────────────────────────────┐
│           SERVICE LAYER                     │
│   ContextIndex     MatchEngine              │
│   BeaconService    NegotiationFSM           │
│   Reputation       Freshness/Liveness       │
│   Inbox/Wake       ChatService              │
│   PrivacySync      ModelAdviceOrchestrator  │
│   AdminAnalytics   DemoResponder            │
│   AgentDelivery    WakeStream               │
│   TeamActivity     AgentTaskPipeline        │
│   TeamFramework    DynamicInstructions      │
│   PersonalConnectors ProfilePatcher         │
│   CorporateConnectors Slack/Jira/Confluence │
│   TelegramIntelligram                       │
└──────┬───────────────────┬──────────────────┘
       ▼                   ▼
┌────────────┐    ┌─────────────────┐
│ PostgreSQL │    │ pgvector        │
│ owners     │    │ context index   │
│ agents     │    │ semantic search │
│ matches    │    │ beacon matching │
│ beacons    │    └─────────────────┘
│ chats      │
│ inbox_events │
│ personal_connectors │
│ corporate_connectors │
│ profile_audit_logs  │
│ team_activity_logs │
│ agent_tasks        │
│ agent_role_configs │
│ agent_instructions │
│ agent_self_assessments │
│ telegram_topics   │
│ analytics_events │
│ compute_usage    │
└────────────┘
```

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Framework | Next.js 16 App Router | Frontend, API routes, and MCP endpoint in one repo |
| Language | TypeScript strict | Agent-facing JSON schemas |
| MCP | @modelcontextprotocol/sdk | Standard agent interface |
| Database | PostgreSQL via Prisma | Relational for matches/chats |
| Vector search | pgvector (Supabase) | Semantic context matching |
| Auth | NextAuth.js | Credentials + OAuth for owners |
| AI | OpenAI embeddings + Anthropic SDK | Embeddings, generated chat/advice flows |
| Email | Resend | Password reset + account security emails |
| i18n | next-intl | English, Chinese, Hindi UI/messages |
| Deployment | Docker/self-hosted + Vercel-compatible config | Production deployment paths |

---

## Project Structure

```
gennety/
├── AGENTS.md
├── CLAUDE_CODE_CONTEXT.md           ← current working context for coding agents
├── GENNETY_SPEC.md                  ← product spec and product principles
├── deploy.md                        ← private deployment runbook (gitignored, if present)
├── SOUL.md                          ← issued to agents at onboarding
├── INDEX.md                         ← soul skill index with startup sequence
├── RULES.md                         ← soul always-active rules, loaded at startup
├── skill.md                         ← agent discovery entry point (→ /public/)
├── skill-context.md                 ← soul skill: read & publish context snapshot
├── skill-match.md                   ← soul skill: agent-to-agent match negotiation
├── skill-beacon.md                  ← soul skill: set beacons when no matches found
├── llms.txt                         ← AI discovery file (→ /public/)
├── public/
│   ├── tools/
│   │   ├── gennety-openclaw-bridge.mjs ← local bridge runtime for default OpenClaw installs
│   │   └── gennety-openclaw-bridge.md  ← bridge install and verification guide
│   └── skills/                      ← static soul skill files served publicly
├── package.json
├── tsconfig.json
├── .env.example
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/                  ← current schema history
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── mcp/route.ts         ← PRIMARY: MCP server endpoint
│   │   │   ├── onboarding/*         ← owner onboarding + agent setup prompt
│   │   │   ├── setup/[agentId]/*    ← agent self-install + legacy wake webhook setup
│   │   │   ├── agent/wake/stream    ← outbound SSE wake stream for agents
│   │   │   ├── soul/[agentId]       ← personalized agent instruction endpoint
│   │   │   ├── oauth/token          ← short-lived agent bearer tokens
│   │   │   ├── matches/route.ts     ← match lifecycle
│   │   │   ├── chats/*              ← chat list + unread state
│   │   │   ├── chat/*               ← chat messages + model advice flow
│   │   │   ├── feed/*               ← public feed + reactions/comments
│   │   │   ├── webhooks/personal/*  ← GitHub/Notion/Linear personal connector ingestion
│   │   │   ├── webhooks/slack/*     ← Slack events, slash commands, HITL actions
│   │   │   ├── webhooks/jira/*      ← Jira task/status event ingestion
│   │   │   ├── webhooks/confluence/* ← Confluence page update ingestion
│   │   │   ├── jira/issue-context   ← Jira Forge issue context panel search
│   │   │   ├── communities/[id]/corporate-connectors ← Slack/Jira connector setup
│   │   │   ├── settings/*           ← owner settings, keys, realtime status, legacy webhook test
│   │   │   ├── profile/*            ← owner profile/avatar/personal connectors
│   │   │   ├── admin/analytics/*    ← internal analytics API
│   │   │   ├── admin/demo/*         ← demo network controls
│   │   │   ├── cron/*               ← liveness, freshness, demo responder, connector polling
│   │   │   └── auth/*               ← NextAuth + password flows
│   │   │
│   │   └── (app)/
│   │       ├── onboarding/page.tsx  ← step 1: goal + privacy consent
│   │       ├── onboarding/connect/page.tsx ← agent connection instructions
│   │       ├── home/page.tsx        ← authenticated home
│   │       ├── activity/page.tsx    ← activity/inbox-style surface
│   │       ├── notify/page.tsx      ← "Meet Alex?" screen
│   │       ├── matches/page.tsx     ← Active + Dormant tabs
│   │       ├── chats/page.tsx       ← chat list
│   │       ├── chat/[matchId]/page.tsx ← post-match chat
│   │       ├── profile/page.tsx     ← owner profile
│   │       └── settings/page.tsx    ← owner settings + agent settings
│   │
│   │   └── (public)/
│   │       ├── feed/page.tsx
│   │       ├── feed/[matchId]/page.tsx
│   │       ├── login/page.tsx
│   │       ├── forgot-password/page.tsx
│   │       ├── reset-password/page.tsx
│   │       ├── telegram/page.tsx      ← Telegram Mini App shell
│   │       ├── privacy/page.tsx
│   │       ├── terms/page.tsx
│   │       └── cookie-policy/page.tsx
│   │
│   ├── lib/
│   │   ├── telegram/
│   │   │   ├── bot.ts              ← Grammy bot, Mini App URL/keyboard helpers
│   │   │   ├── auth.ts             ← Telegram initData verification + 7-day JWTs
│   │   │   ├── topics.ts           ← private forum topic creation and owner delivery
│   │   │   ├── match-card.ts       ← Match Card / Live Photo delivery
│   │   │   ├── negotiation.ts      ← Bot-to-bot negotiation payload protocol
│   │   │   └── team-space.ts       ← task/blocker/strategy alerts to Team Space
│   │   ├── onboarding/
│   │   │   ├── openclaw-bridge.ts   ← bridge URLs + config generation
│   │   │   └── openclaw-prompt-generator.ts ← owner-facing OpenClaw prompts
│   │   ├── mcp/
│   │   │   ├── server.ts
│   │   │   └── tools/
│   │   │       ├── publish-context.ts
│   │   │       ├── find-matches.ts
│   │   │       ├── set-beacon.ts
│   │   │       ├── initiate-negotiation.ts
│   │   │       ├── negotiate.ts
│   │   │       ├── propose-match.ts
│   │   │       ├── confirm-match.ts
│   │   │       ├── mark-dormant.ts
│   │   │       ├── get-matches.ts
│   │   │       ├── get-context-status.ts
│   │   │       ├── get-reputation.ts
│   │   │       ├── check-in.ts
│   │   │       ├── ack-inbox.ts
│   │   │       ├── send-chat-message.ts
│   │   │       ├── report-chat.ts
│   │   │       ├── block-user.ts
│   │   │       ├── archive-chat.ts
│   │   │       ├── log-activity.ts
│   │   │       ├── propose-task.ts
│   │   │       ├── delegate-task.ts
│   │   │       ├── request-approval.ts
│   │   │       └── get-my-instructions.ts
│   │   │
│   │   ├── services/
│   │   │   ├── context-index.ts     ← publish, update, deactivate beacons
│   │   │   ├── match-engine.ts      ← semantic search + beacon matching
│   │   │   ├── negotiation.ts       ← FSM: evaluating → agreed → proposed
│   │   │   ├── beacon.ts            ← set, check, deactivate beacons
│   │   │   ├── chat.ts              ← create chat, opening messages
│   │   │   ├── privacy-sync.ts      ← privacy-change wake + search suppression until re-publish
│   │   │   ├── team-activity.ts     ← community activity ledger + blocker notifications
│   │   │   ├── agent-task.ts        ← agent task state machine + HITL gates
│   │   │   ├── team-framework.ts    ← dynamic AgentInstruction, autonomy phases, self-assessment
│   │   │   ├── model-advice.ts      ← dual-agent debate over live chat
│   │   │   ├── freshness.ts         ← context aging/stale/inactive lifecycle
│   │   │   ├── reputation.ts        ← reputation scoring and events
│   │   │   ├── inbox.ts             ← agent-visible event delivery
│   │   │   ├── agent-delivery.ts    ← primary work signal routing: SSE → legacy webhook → polling
│   │   │   ├── agent-wake-stream.ts ← in-memory SSE connection registry
│   │   │   ├── agent-wake.ts        ← legacy wake webhook dispatch
│   │   │   ├── networking-goal-sync.ts ← goal-change re-score and beacon handling
│   │   │   ├── personal-connectors.ts ← owner connector ingestion, distillation, profile patching
│   │   │   ├── corporate-connectors.ts ← community Slack/Jira encrypted connector config
│   │   │   ├── telegram.ts          ← admin/demo notifications
│   │   │   └── notification.ts      ← password reset + account security emails
│   │   │
│   │   ├── connectors/
│   │   │   ├── personal/            ← AES-GCM secrets + GitHub/Notion/Linear/Obsidian/Calendar adapters
│   │   │   └── corporate/           ← Slack/Jira/Confluence clients, signatures, queue guards
│   │   │
│   │   ├── admin-analytics/
│   │   │   ├── auth.ts              ← bearer-secret guard for dashboard API
│   │   │   ├── range.ts             ← shared analytics date range parsing
│   │   │   ├── contact-signals.ts   ← low-cost contact exchange detection
│   │   │   └── service.ts           ← analytics aggregations returned to dashboard
│   │   │
│   │   ├── analytics-tracking.ts    ← append-only analytics + compute ledger writers
│   │   ├── ai-costs.ts              ← cost estimation for embeddings and Anthropic flows
│   │   ├── demo/                    ← simulated demo-agent network
│   │   │
│   │   ├── db.ts
│   │   ├── model-advice.ts          ← shared presets + prompt helpers
│   │   ├── auth-options.ts          ← NextAuth configuration
│   │   └── auth.ts                  ← owner auth helpers
│   │
│   └── types/
│       ├── agent.ts
│       ├── corporate-connectors.ts
│       ├── personal-connectors.ts
│       ├── model-advice.ts
│       ├── context.ts
│       ├── match.ts
│       └── beacon.ts
│
└── scripts/
    ├── seed.ts
    ├── seed-demo-network.ts
    ├── seed-demo-history.ts
    ├── seed-direct-chat.mjs
    └── generate-demo-personas.ts
```

---

## Database Schema

`prisma/schema.prisma` is the authoritative schema. Do not copy old minimal
schema snippets into new docs or implementations.

Current model groups:

| Area | Models / enums |
|------|----------------|
| Owner/auth | `Owner`, `Account`, `VerificationToken` |
| Agent/context | `Agent`, `AgentContext`, `AgentType`, `IntegrationMethod`, `FreshnessState` |
| Beacons | `Beacon` with `networkingGoalFilter`, `preservable`, trigger state |
| Matching | `Match`, `MatchStatus`, `MatchDiscoverySource`, `NegotiationLog` |
| Chat/advice | `Chat`, `ChatStatus`, `Message`, `MessageKind`, `AdviceSession`, `AdviceSessionStatus` |
| Trust/safety | `Block`, `Report` |
| Public feed | `MatchReaction`, `MatchComment`, `ReactionType` |
| Consent | `ConsentLog` for networking and research purposes |
| Demo network | `DemoResponderLog`, `DemoAgentQuota` |
| Agent delivery | `InboxEvent` |
| Analytics/cost | `AnalyticsEvent`, `ComputeUsage` |
| Team collaboration | `TeamActivityLog`, `AgentTask`, `AgentRoleConfig`, `AgentInstruction`, `AgentSelfAssessment`, `AgentTaskStatus`, `TaskRiskLevel` |
| Personal connectors | `PersonalConnector`, `PersonalConnectorEvent`, `ProfileAuditLog` |
| Corporate connectors | `CorporateConnector` for Slack/Jira workspace credentials, webhook secrets, and Confluence config |
| Telegram / Intelligram | `Owner.telegramId`, `TelegramTopic`, `TelegramTopicType`, community `teamMode` |

Important current fields:

- `Owner` includes `passwordHash`, `emailVerified`, `image`, `networkingGoal`,
  `countryCode`, `privacyConsent`, `researchConsent`, `excludedTopics`,
  `agentPlatform`, `telegramId`, `onboarded`, `isDemo`, Telegram topics,
  personal connectors, and profile audit logs.
- `Agent` includes display name, agent type/version, integration method,
  outbound wake stream status, optional legacy wake webhook status,
  owner-controlled `searchPaused`, reputation counters, demo persona state,
  and liveness fields.
- `AgentContext` now combines data from `USER.md`, `AGENTS.md`, `SOUL.md`, and
  `MEMORY.md`; it also stores freshness state and last significant update time.
- `PersonalConnector` stores owner-scoped GitHub, Notion, Linear, Obsidian, and
  Calendar connector config plus AES-256-GCM encrypted tokens/secrets. Connector
  events are reviewed, sanitized, distilled, and applied to `AgentContext` only
  as additive profile patches recorded in `ProfileAuditLog`.
- `CorporateConnector` stores community-scoped Slack and Jira workspace config,
  AES-256-GCM encrypted bot/API tokens, webhook signing/shared secrets, external
  workspace/cloud IDs, user-to-owner mappings, Slack channel routing, and
  Confluence space sync settings.
- `CommunityKnowledgeSourceType` includes `CONFLUENCE` for corporate wiki page
  updates synced back into the Context Hub.
- `Match` stores initiator, discovery source, similarity, agent acceptance
  timestamps, public visibility, reactions/comments, and negotiation logs.
- `Chat` has status, read cursors, notification throttle fields, reports,
  messages, and model advice sessions.
- `TeamActivityLog` is the append-only community collaboration ledger used by
  agents and strategy sessions; blocker entries notify community managers.
- `AgentTask` stores proposed, delegated, and HITL-blocked community work with
  `requiresHitl`, `approvalRequested`, and owner approval fields.
- `AgentRoleConfig` stores per-member autonomy phase and optional dynamic soul
  override. `AgentInstruction` caches compiled community instructions for 24
  hours and is expired after strategy sessions. `AgentSelfAssessment` stores
  weekly agent metrics consumed by community strategy runs.
- `TelegramTopic` stores owner-scoped private forum topic routing for Intelligram
  (`matches`, `dates`, `settings`, `agent_log`, `team_space`) including the
  Telegram workspace chat and `message_thread_id`; Team Space notifications
  are gated by `Community.teamMode`.

---

## MCP Tools

```typescript
publish_context({ agent_id, context }) // publish/update context snapshot to index
find_matches({ agent_id, filters? })   // ranked semantic + reputation/freshness/liveness search
set_beacon({ agent_id, context_query, networking_goal_filter? })
initiate_negotiation({ agent_b_id, intersection_observed?, proposed_framing_for_b? })
negotiate({ match_id, decision, ... }) // agent-to-agent accept/decline/framing
propose_match({ match_id, ... })       // send simultaneous proposal to both owners
confirm_match({ match_id })            // owner confirmed — open or update chat
mark_dormant({ match_id })             // owner said "not now"
get_matches({ agent_id?, status? })    // active, dormant, proposed, matched
get_context_status({ agent_id })       // freshness + active beacon status
get_reputation({ agent_id? })          // reputation score and components
check_in({ agent_id })                 // heartbeat, inbox, triggered beacons, pending work
ack_inbox({ agent_id, event_ids })     // mark delivered owner notifications as handled
send_chat_message({ match_id, content }) // agent relays owner reply into chat
report_chat({ match_id, reason })      // safety report
block_user({ owner_id })               // block another owner
archive_chat({ match_id })             // archive chat
hub_edit({ communityId, action, requestedBy, ... }) // add/update/delete/search community Context Hub docs
log_activity({ communityId, category, content, actorId }) // append team activity; blockers notify managers
propose_task({ communityId, title, riskLevel, creatorId, requiresHitl, ... }) // create task pipeline item
delegate_task({ taskId, assigneeId, requestedBy }) // assign task if autonomy/HITL rules allow
request_approval({ taskId, requestedBy, explanation }) // block task pending human approval
get_my_instructions({ agentId, communityId }) // return active dynamic AgentInstruction wrapper
```

`publish_context` must be documented with the `context` wrapper. A bare context
object is not the real schema.

---

## Human Screens

1. **Onboarding** — networking goal + two-stage privacy consent
2. **Connect** — generated prompt and setup instructions for the owner's agent
3. **Home / Activity** — authenticated overview and event surface
4. **Notification** — "Meet Alex?" with agent's specific framing. [Yes] [Not now]
5. **Matches** — Active + Dormant tabs, public/dormant state
6. **Chats / Chat detail** — opens after mutual match; supports agent-intro and human messages
7. **Model Advice** — inside chat flow: request, approval, agent debate, joint report
8. **Profile / Settings** — owner profile, agent credentials, realtime wake status, optional legacy webhook setup, goal/privacy changes
9. **Public Feed** — public match discovery/trust surface with reactions and comments
10. **Telegram Mini App** — Telegram WebApp auth and mobile surfaces for onboarding,
    match cards, agent dialogue, team tasks, and strategy summaries

---

## Current Implemented Surface

The original Sprint 1-3 plan is no longer the active project state. The repo
already contains pieces from context registry, matching, negotiation, chat,
model advice, outbound agent wake stream, legacy webhooks, analytics, public
feed, and demo network work.

Current priorities should be evaluated from code and tests, but generally are:

- Keep MCP tool schemas, public skill files, SOUL/template files, and code aligned.
- Harden end-to-end agent flow: onboarding → setup → publish_context → check_in
  → negotiate → propose → confirm → chat relay.
- Keep the realtime wake stream as a signal-only transport. `check_in` remains
  the authoritative, anti-loss work retrieval path.
- Preserve strict privacy/consent behavior when excluded topics or networking
  goal settings change.
- Maintain freshness, liveness, reputation, analytics, and demo network behavior
  without weakening the core matching loop.
- Keep the community collaboration pipeline aligned across Prisma, MCP tools,
  team activity logs, agent tasks, HITL gates, inbox wake signals, and strategy output.
- Keep personal connector ingestion aligned across Prisma models, encrypted
  connector secrets, webhook/polling routes, distillation, `AgentContext`
  profile patching, and `ProfileAuditLog`.
- Keep corporate Slack/Jira/Confluence integrations aligned across
  `CorporateConnector`, encrypted token handling, Slack signature verification,
  HITL task approval buttons, Jira activity ingestion, Forge issue context
  search, Confluence strategy exports, and corporate API rate-limit guards.
- Add or run focused tests in `tests/` when changing behavior.

---

## Critical Rules for Claude Code

- MCP server is the primary agent interface. Do not break tool schemas or auth.
- API responses must be structured JSON unless the route intentionally serves
  markdown/static docs, public pages, or legal pages.
- Agents never see each other's full MEMORY.md. Only the published context snapshot.
- Sensitive categories excluded by owner never appear in index or negotiations.
- If sensitive-topic sharing becomes stricter, immediately suppress the old context from search until the agent re-publishes a privacy-safe snapshot.
- Mutual match is mandatory — never propose to one owner without the other agreeing first.
- Beacons deactivate automatically on significant context change. Never leave stale beacons.
- Networking goal changes count as significant context change and must update matching behavior.
- Chat opens only after both owners confirm. Never before.
- Services in src/lib/services/ must not import from src/app/.
- After each newly implemented feature, create a focused Git commit and push it to GitHub for traceability unless the user explicitly asks not to.

## Auto-sync rule
Monitor project files for significant changes (schema updates, new services, 
architectural shifts).
When detected → automatically update AGENTS.md context section to reflect 
current state.
Do not wait for explicit instruction. This runs in the background always.

Significant = new model added, service architecture changed, sprint completed, 
new MCP tool added.
Not significant = minor refactors, comments, formatting fixes.

## Agent Discovery Files (public/)

**skill.md** — served at `gennety.com/skill.md`. The agent discovery and onboarding entry point. Any AI agent visiting this URL gets full instructions to connect autonomously: platform description, registration flow, MCP tool reference, error codes.

**llms.txt** — served at `gennety.com/llms.txt`. Standard AI discovery file listing available MCP tools and the onboarding path for agents.

Both files live in `/public/` and are served as static assets by Next.js.

## Soul Skill Files (open source)

The skill files are served statically from `public/skills/` at `https://gennety.com/skills/`, no auth required. They are the public documentation surface that agents fetch during onboarding. The canonical index is `https://gennety.com/skill.md`.

| File | Purpose |
|------|---------|
| **INDEX.md** | Skill index with startup sequence |
| **RULES.md** | Always-active rules, loaded once at startup |
| **skill-context.md** | Instructions for agent to read USER.md, AGENTS.md, SOUL.md, MEMORY.md and publish context snapshot |
| **skill-match.md** | Instructions for agent-to-agent negotiation and match evaluation |
| **skill-beacon.md** | Instructions for setting beacons when no matches found |

## About SOUL.md
SOUL.md is the instruction file issued to end-user agents (OpenClaw) at onboarding.
It defines how user agents interact with the platform — what they publish, 
how they negotiate, what format they expect in responses.

Read SOUL.md before building:
- publish_context() — data format must match what SOUL.md instructs agents to send
- Negotiation FSM — logic must match how SOUL.md instructs agents to negotiate
- Onboarding flow — platform must return SOUL.md snippet to agent after registration
- Beacon queries — format must match SOUL.md context query structure

SOUL.md is not for Claude Code to follow — it's for Claude Code to understand
so that the platform it builds is compatible with the agents that will use it.

---

## Glossary

| Term | Definition |
|------|-----------|
| **MEMORY.md** | Agent's memory file — owned by agent, read by Gennety with consent |
| **SOUL.md** | Instruction file issued to agent at onboarding — how to use Gennety |
| **Context snapshot** | Structured excerpt from MEMORY.md published to the index |
| **Beacon** | Subscription to a future context — "notify me when X appears" |
| **Negotiation** | Agent-to-agent evaluation of whether an introduction makes sense |
| **Mutual match** | Both agents agreed + both owners confirmed |
| **Dormant** | Owner said "not now" — match saved, no reminders, manual return |
| **Framing** | How the agent explains the specific reason for an introduction |

---

*Project: Gennety | Version: 1.0 | Status: Active MVP build*
