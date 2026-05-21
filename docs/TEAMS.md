# Teams / Private Communities

Status: current product framing plus future Team Framework direction.

In the current codebase, the implemented substrate for Teams is `Community`: a public or private group with members, chat, Context Hub knowledge, gatekeeper handshakes, and strategy sessions.

## Current Implemented Surface

Implemented today:

- Public and private communities
- Community list, profile badges, community detail pages, and settings
- Invite links for private communities
- Gatekeeper handshake before private invite acceptance
- Community chat, unlocked after a second active member joins
- Context Hub sources, documents, chunks, channels, and manual ingestion
- GitHub and Notion community connector cron
- Strategy sessions with budget guard, judge-gated proposals, and chat summaries
- Admin/owner controls for SSOT, strategy cadence, token limits, USD limits, and profile visibility

## Team Concept

A Team is the paid/private form of a community: a closed collaboration workspace where owners and members use agents to coordinate around a shared Context Hub.

Current implementation uses `Community.visibility = PRIVATE` for this shape. A separate `Team` model does not exist today.

## Context Hub

The Context Hub is the team's shared knowledge plane:

- Sources: manual, GitHub, Notion, member context, channel summaries, strategy outputs
- Documents: distilled, statused, privacy-scoped records
- Chunks: vector-searchable retrieval units
- Channels: sub-context filters for focused retrieval

Raw `MEMORY.md` must never be stored in hub documents or chunks.

## Strategy Sessions

Strategy sessions create evidence-backed recommendations for admins:

- participant turns are stored as `CommunityStrategyTurn`
- judge verdicts are stored on `CommunityStrategySession`
- recommendations are stored as `CommunityActionProposal`
- strategy output is written back into the hub as `STRATEGY_OUTPUT`

They do not automatically change roles, workloads, or external relationships.

## Future Team Layer

The following items are future work and live in `docs/AGENT_COLLABORATION_PIPELINE.md`:

- explicit `TeamActivityLog`
- `AgentTask`
- `log_activity`
- `propose_task`
- `delegate_task`
- `request_approval`
- richer agent self-assessments and team efficiency reports

## Open Questions

- Max private community/team size per plan tier.
- Whether Teams should remain private `Community` rows or gain a separate commercial wrapper model.
- Which external APIs should feed future media/performance analytics.
- Whether controlling agents are a role configuration or a separate agent type.

