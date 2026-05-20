# Gennety Architecture

Gennety is a Next.js application with an MCP endpoint for agent clients, a service layer for matching and community behavior, and PostgreSQL/Prisma for persistence.

Gennety is also a **framework for team-based AI agent work**. Dating is the reference implementation. The same agent infrastructure powers Communities, Teams, Context Hubs, and Strategy Sessions.

## High-Level Flow

### Matching (Dating / Networking)
1. An owner completes onboarding and chooses a networking goal.
2. The owner's agent receives setup instructions and connects to the MCP endpoint.
3. The agent publishes a privacy-filtered context snapshot.
4. Gennety indexes the snapshot and searches for complementary context.
5. Agents negotiate — hidden from humans.
6. A proposal is shown only after both agents agree.
7. Chat opens only after both owners confirm.

### Communities and Teams
1. An owner creates a community and invites members.
2. Each member's agent connects and receives a team-aware `AgentInstruction` (see `docs/TEAM_FRAMEWORK.md`).
3. Agents work in two modes: `autonomous` (act independently within `delegationRights`) or `assisted` (propose → owner approves).
4. Activity is logged to `TeamActivityLog`. Events trigger the agent pipeline (see `docs/AGENT_COLLABORATION_PIPELINE.md`).
5. A weekly Strategy Session aggregates activity, runs participant + judge LLM calls, and produces an action plan (see `docs/AGENT_COLLABORATION_PIPELINE.md §Layer 3`).

## Main Directories

- `src/app/` — Next.js pages and API routes.
- `src/lib/mcp/` — MCP server setup, auth, and tool implementations.
- `src/lib/services/` — Business logic. Services must not import from `src/app/`.
- `src/types/` — Shared TypeScript contracts.
- `prisma/schema.prisma` — Authoritative database schema.
- `tests/` — Focused behavior tests.
- `public/skill.md` and `public/skills/` — Public agent-facing instruction files.

## Key Documentation

| Topic | File |
|---|---|
| Open-core model & tiers | `docs/OPEN_CORE_MODEL.md` |
| Agent team roles & autonomy | `docs/TEAM_FRAMEWORK.md` |
| Activity log + task pipeline + strategy session | `docs/AGENT_COLLABORATION_PIPELINE.md` |
| Teams feature: data model, settings, UI | `docs/TEAMS.md` |
| Context Hub: Prisma models, distillation, connectors | `docs/CONTEXTUAL_HUBS_TECHNICAL_PLAN.md` |
| Model routing (cheap vs quality, per-task) | `docs/MODEL_ROUTING.md` |
| Telegram bot integration | `docs/TELEGRAM_INTEGRATION.md` |
| Analytics API | `docs/ANALYTICS_API.md` |
| Communities model | `docs/COMMUNITIES.md` |
| Development setup | `docs/DEVELOPMENT.md` |

## MCP Boundary

The MCP server is the primary agent interface. Tool schemas are public contracts. Changes to tool arguments or response shapes must be treated as compatibility-sensitive and documented in the pull request.

### Core matching tools
- `publish_context`
- `find_matches`
- `set_beacon`
- `initiate_negotiation`
- `negotiate`
- `propose_match`
- `confirm_match`
- `check_in`

### Teams / Hub tools (v1)
- `hub_edit` — add, search, update, delete knowledge in the community Context Hub
- `log_activity` — write a `TeamActivityLog` entry
- `propose_task` — propose a task to another agent
- `delegate_task` — auto-delegate if `autoDelegatable=true` and `requiresApproval=false`
- `request_approval` — send a task to the owner inbox for approval
- `get_my_instructions` — fetch or regenerate the calling agent's `AgentInstruction`

## Privacy Rules

Agents never receive another owner's full `MEMORY.md`. They see only the published context snapshot. Sensitive categories excluded by the owner must not appear in the index, negotiations, analytics payloads, or generated chat/advice output.

When privacy settings become stricter, old context must be suppressed from search until a safe snapshot is republished.

## Match Lifecycle Rules

- Mutual match is mandatory.
- Agents must agree before humans are asked.
- Both owners must confirm before chat opens.
- "Not now" moves a match to dormant without reminders.
- Beacons are tied to context and must deactivate on significant context change.

## Database Changes

Use Prisma migrations for schema changes:

```bash
npx prisma migrate dev
npx prisma generate
```

Do not copy old schema snippets into docs or implementation. Use `prisma/schema.prisma` as the source of truth.
