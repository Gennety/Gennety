# Model Routing & Manual Hub Editing

Status: future implementation spec.

The current codebase has `src/lib/ai-costs.ts` and direct service-level model choices, but it does not yet have a centralized `src/lib/model-router.ts`. The current Context Hub also supports manual knowledge ingestion through API/UI routes, but there is no public MCP `hub_edit` tool registered today.

## Goal

Introduce task-aware model routing and an MCP tool for explicit owner-requested Context Hub edits.

## Future Model Router

Create `src/lib/model-router.ts` with a task-based resolver:

```ts
export type ModelTask =
  | "distillation"
  | "embedding"
  | "hub_search_answer"
  | "hub_edit_chat"
  | "strategy_participant"
  | "strategy_judge"
  | "negotiation"
  | "match_scoring"
  | "handshake_eval"
  | "openclaw_weekly_report";
```

Default policy:

- cheap tier for distillation, embeddings, search answers, and batch scoring
- quality tier for negotiation, handshakes, strategy judge work, and manual edit intent parsing

Environment defaults should use explicit current model IDs and keep costs aligned with `src/lib/ai-costs.ts`.

## Future `hub_edit` MCP Tool

Add `src/lib/mcp/tools/hub-edit.ts` and register it in `src/lib/mcp/server.ts`.

Input:

```ts
interface HubEditInput {
  communityId: string;
  action: "add" | "update" | "delete" | "search";
  content?: string;
  documentId?: string;
  query?: string;
  requestedBy: string;
}
```

Behavior:

- `add` creates or reuses a `MANUAL` `CommunityKnowledgeSource`, distills the content, chunks it, and embeds it when embeddings are configured.
- `search` calls `searchCommunityKnowledge`.
- `update` supersedes the old document and creates a new distilled document.
- `delete` marks the document as `DELETED` and excludes chunks from retrieval.

## Current Equivalent

Today, manual hub edits are handled by authenticated community API routes and UI:

- `POST /api/communities/[id]/knowledge/manual`
- `GET /api/communities/[id]/knowledge/search`
- `POST /api/communities/[id]/knowledge/sources`
- `POST /api/communities/[id]/knowledge/channels`

## Invariants

1. Manual Hub edits require an explicit owner/member request.
2. Raw `MEMORY.md`, secrets, and connector instructions are untrusted input.
3. Deletes are soft deletes through document status.
4. Future MCP schema changes must be documented in `public/skill.md` and agent-facing skill files once exposed.

