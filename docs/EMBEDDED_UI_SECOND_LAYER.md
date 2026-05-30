# Embedded UI / Second Layer Roadmap

Status: high-level integration roadmap.
Authoritative Specification: Refer to [SLACK_JIRA_INTEGRATION.md](file:///Users/pro/Desktop/Gennety/docs/SLACK_JIRA_INTEGRATION.md) for concrete database schemas, security protocols, API payload layouts, and webhook routing.

---

## Goal

Make Gennety an augmentation layer inside existing work tools rather than forcing teams to move all collaboration into a standalone app.

## Priority Roadmap

1. **Phase 1: Slack App Integration** (Chat-first collaboration, Home Tab dashboard, slash command queries, and interactive task approval buttons).
2. **Phase 2: Jira Cloud Integration** (Jira Forge context panels showing hub knowledge, sprint activity sync).
3. **Phase 3: Extended Surfaces** (Linear, ClickUp, and GitHub PR review adapters after proving the shared webhook / action patterns).

## Shared Architecture

* The core backend, database (`prisma/schema.prisma`), MCP server, matching, and strategy services remain centralized in this repository.
* Platform-specific adapters authenticate via OAuth, decrypt workspace tokens using AES-256-GCM, and convert host events into Gennety unified events.
* UI payloads use host-native layouts (Slack Block Kit, Jira Forge UI).

For the implementation details of Slack OAuth, Block Kit structures, Jira context panels, and Confluence page syncs, consult the [SLACK_JIRA_INTEGRATION.md](file:///Users/pro/Desktop/Gennety/docs/SLACK_JIRA_INTEGRATION.md) specification.
