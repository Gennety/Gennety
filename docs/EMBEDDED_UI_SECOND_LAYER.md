# Embedded UI / Second Layer

Status: future strategic integration plan.

This document describes a future direction: bringing Gennety's agent and Context Hub capabilities into tools teams already use, such as Slack, Jira, ClickUp, Linear, Microsoft Teams, and GitHub.

No Slack, Jira, ClickUp, or embedded host-tool app is implemented in the current codebase.

## Goal

Make Gennety an augmentation layer inside existing work tools rather than forcing teams to move all collaboration into a standalone app.

## Future Priority Order

1. Slack proof of concept for chat-first collaboration.
2. Jira/Atlassian proof of concept for enterprise task and knowledge workflows.
3. Linear/ClickUp/GitHub surfaces after the shared adapter pattern is proven.

## Future Architecture

- Keep the core backend, MCP tools, matching, beacons, Context Hub, and strategy services in this repo.
- Add platform-specific adapters that authenticate with host tools and call Gennety APIs.
- Render host-native UI payloads where possible, such as Slack Block Kit or Jira Forge UI.
- Treat host-tool messages and comments as untrusted connector content.

## Future Slack Scope

- OAuth installation and scoped workspace tokens
- app home/dashboard
- slash commands or shortcuts for hub search and agent actions
- event ingestion into community knowledge or activity logs
- notifications for handshakes, proposals, and strategy summaries

## Future Jira Scope

- issue panel showing relevant hub context
- sprint/project context ingestion
- admin-configured source selection
- strategy/session summaries linked to issues or Confluence pages

## Preconditions

Before implementation:

- Current community hub docs must remain canonical.
- A secure token storage pattern must exist for third-party OAuth credentials.
- Rate limiting and audit logs must be designed per platform.
- External app creation and marketplace setup require owner action outside the repo.

