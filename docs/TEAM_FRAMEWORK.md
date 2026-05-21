# Gennety Team Framework

Status: future framework direction.

The current repo implements the first usable foundation of the Team Framework through Communities, Contextual Hubs, invite handshakes, strategy sessions, and community chat. This document describes the broader open-source framework direction and should not be treated as a complete current implementation checklist.

## Framework Idea

Gennety Team Framework is a protocol and runtime for coordinating people and agents around:

- shared memory through Context Hubs
- explicit permissions and human approval
- periodic strategy review
- agent-to-agent task handoff
- reusable agent instructions

The networking product is the reference implementation. Private communities are the first Teams surface.

## Current Foundation

Already present:

- `Community` as the group/hub model
- `CommunityMember` roles and membership status
- gatekeeper invite handshakes
- Context Hub knowledge models
- community chat models
- strategy session and action proposal models
- community budget guard and cron routes

## Future Framework Primitives

Future work:

- centralized model router
- `AgentInstruction` generation
- `AgentSelfAssessment`
- explicit agent types: orchestrator, specialist, reviewer, observer
- activity logging and task delegation MCP tools
- packaged open-source adapters and soul templates

## Operating Modes

Future Team Framework mode:

- `assisted`: agents propose, humans approve important actions
- `autonomous`: agents act within explicit delegation rights, with approval required for critical operations

Critical operations always include external publishing, finance actions, role/authority changes, and merge-to-main actions.

## Related Docs

- Current hub implementation: `docs/CONTEXTUAL_HUBS_TECHNICAL_PLAN.md`
- Future task pipeline: `docs/AGENT_COLLABORATION_PIPELINE.md`
- Future model router and `hub_edit`: `docs/MODEL_ROUTING.md`
- Business packaging: `docs/OPEN_CORE_MODEL.md`

