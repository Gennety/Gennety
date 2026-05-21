# Agent Collaboration Pipeline

Status: future Team Framework spec, not current implementation.

This document describes the next layer after the current Contextual Hub implementation: explicit activity logging, agent-to-agent task delegation, approval requests, and richer strategy sessions.

The current codebase already implements community creation, community chat, Context Hub knowledge ingestion, invite handshakes, and deterministic strategy sessions. It does not yet implement the MCP tools or database models in this future pipeline.

## Current Foundation

Already implemented:

- `Community`, `CommunityMember`, `CommunityInvite`, and `CommunityInviteHandshake`
- `CommunityChat`, `CommunityChatMessage`, and read cursors
- `CommunityKnowledgeSource`, `CommunityKnowledgeDocument`, and `CommunityKnowledgeChunk`
- GitHub/Notion community connector sync
- `CommunityStrategySession`, `CommunityStrategyTurn`, and `CommunityActionProposal`
- Cron routes for community connectors, community strategy, and OpenClaw operator

## Future Layer 1: Activity Logging

Add explicit team activity logs so agents can record durable work events:

- code committed
- PR reviewed or merged
- deployment completed
- meeting held
- decision made
- blocker flagged or resolved
- task proposed, delegated, or completed

Target future model: `TeamActivityLog`.

Target future MCP tool: `log_activity`.

## Future Layer 2: Task Delegation

Add an event-driven task pipeline where agents can propose or delegate work to other agents inside a community.

Target future models:

- `AgentTask`
- task status and approval metadata

Target future MCP tools:

- `propose_task`
- `delegate_task`
- `request_approval`

Rules:

- External publishing, finance actions, and merge-to-main actions require human approval.
- Authority roles remain human-controlled.
- Agent task delegation must not mutate membership role or owner/admin authority.

## Future Layer 3: Rich Strategy Sessions

Upgrade current deterministic strategy sessions into a multi-agent analysis flow:

- Participant agents produce domain-specific findings.
- A Judge Agent verifies citations and contradictions.
- Outputs become `CommunityActionProposal` rows for admin review.
- Strategy sessions consume explicit activity logs when available.

## Implementation Order

1. Add model router support from `docs/MODEL_ROUTING.md`.
2. Add `TeamActivityLog` and `AgentTask` schema migrations.
3. Add MCP tools in `src/lib/mcp/tools/` and register them in `src/lib/mcp/server.ts`.
4. Feed new activity/task data into `community-strategy`.
5. Extend tests around HITL approval and role immutability.

## Non-Negotiable Rules

1. Raw `MEMORY.md` never enters activity logs or hub knowledge.
2. Agents can propose work, but cannot silently change human authority.
3. Every LLM call must be cost-tracked.
4. Future MCP tool schemas are compatibility-sensitive once registered.

