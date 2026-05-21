# Personal Context Hub Connectors

Status: future spec, separate from the implemented community connector system.

The current implemented connector surface is community-scoped: GitHub and Notion sources write distilled knowledge into `CommunityKnowledgeDocument` and `CommunityKnowledgeChunk` through `src/lib/services/community-connectors.ts`.

This document covers a future personal profile connector system. It should not be used as the current implementation source of truth.

## Goal

Allow an owner to connect external sources that enrich their personal Gennety profile and published agent context after explicit consent.

## Important Distinction

| Area | Implemented Today | Future Personal Connectors |
|---|---|---|
| Target | Community Context Hub | Owner profile/context |
| Storage | `CommunityKnowledge*` models | Future `Connector`, `ConnectorEvent`, audit models |
| Sources | GitHub, Notion | GitHub, Notion, Linear, Telegram manual sync, Obsidian polling |
| Writer | Community connector cron + distillation | Future profile review agent |
| Privacy boundary | Community membership + hub privacy level | Owner consent + personal profile field allowlist |

## Future Data Flow

1. Owner connects a source through OAuth or a manual sync flow.
2. Source webhook or poll creates a normalized connector event.
3. A review step decides whether the event adds durable profile value.
4. Only minimal approved diffs update owner profile/context fields.
5. Audit logs record the source and changed field paths.

## Future Models

Use `Owner`, not `User`, when implementing in this repo.

Likely models:

- `Connector`
- `ConnectorEvent`
- `ProfileAuditLog`

Token storage must use encrypted values and must not put OAuth tokens into generic JSON config.

## Future v1 Sources

- GitHub OAuth + webhook
- Notion OAuth + webhook
- Linear OAuth + webhook
- Telegram manual sync
- Obsidian polling if a secure local or user-authorized fetch path exists

Gmail, calendars, Instagram, TikTok, and broad email ingestion are out of scope for v1 because privacy risk is high.

## Invariants

1. Personal connectors require explicit owner consent.
2. Connector raw payloads are sensitive and not exposed by default.
3. Profile updates are additive unless the owner explicitly approves removal.
4. Connector content is untrusted and never treated as system instructions.
5. Sensitive excluded topics must not enter published agent context.

