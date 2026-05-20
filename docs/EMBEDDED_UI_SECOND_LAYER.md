# Embedded UI / Second Layer: Gennety as an Additional Interface in Existing Tools

**Status**: Strategy & Implementation Plan
**Created**: 2026-05-21
**Related Documents**: [TEAMS.md](TEAMS.md), [TEAM_FRAMEWORK.md](TEAM_FRAMEWORK.md), [CONTEXT_HUB_CONNECTORS.md](CONTEXT_HUB_CONNECTORS.md), [GENNETY_SPEC.md](GENNETY_SPEC.md), [AGENTS.md](AGENTS.md)

## Overview and Core Idea

Gennety is designed as a **team collaboration hub** powered by AI agents, context enrichment, and intelligent matching. The key innovation is not forcing teams to migrate to a new platform, but offering Gennety as a **second layer (embedded UI / augmentation layer)** that integrates natively into the tools teams already use daily.

This approach minimizes adoption friction: teams continue working in Slack, Jira/Atlassian, ClickUp, Linear, Microsoft Teams, etc., while gaining access to Gennety's full capabilities directly inside those interfaces:

1. **Group Chat** (as described in the Teams section of the repo)
2. **Context Hub** (profile enrichment, team intelligence, workload visibility)
3. **Dialogue Analysis** (AI-powered insights from conversations, expertise detection, bottleneck identification)
4. **Agent-to-Agent Communication** (bot-to-bot negotiation and orchestration, with results surfaced in the host UI)

**Positioning**: "Add Gennety to your existing workspace — get the full AI team hub without switching platforms."

This is the ultimate realization of the connector strategy: instead of only pulling data *into* Gennety, we bring Gennety's intelligence *back into* the tools where work actually happens.

## Why This Matters (Friction Reduction)

Most teams are deeply embedded in established tools:
- Communication happens in Slack or Teams
- Task/project management in Jira, ClickUp, Linear, Asana
- Knowledge in Confluence/Notion

Asking them to adopt a new standalone platform creates high resistance (learning curve, data migration, habit disruption, tool fatigue).

By embedding Gennety as a **second layer**:
- We leverage existing user bases and workflows
- Installation feels like "adding a superpower" rather than migration
- Perfect for enterprise/B2B (especially deep Jira/Atlassian integration)
- Aligns with open-source philosophy: community can build connectors and embedded apps for additional tools
- Directly addresses team pains (context loss, poor matching, burnout) without forcing change

## How It Works Technically and Conceptually

Gennety acts as the **central intelligent backend**:
- Agents (personal, team, OpenClaw, etc.) and the Match/Beacon/Negotiation engines run centrally
- Context is enriched via connectors (pulling from host tools + others)
- All heavy logic (Prompt Injection reconciliation, bot-to-bot dialogue, analysis) happens in Gennety
- Results, chat interfaces, insights, and actions are delivered through **platform-specific embedded UIs**

**Flow**:
1. User installs Gennety App/Integration in their host tool (Slack App, Jira Forge App, etc.)
2. OAuth grants scoped access
3. Gennety pulls relevant context (tasks, messages, user activity)
4. AI agents process and enrich profiles/context hub
5. Group chat, analysis, and agent interactions are rendered natively inside the host UI (side panels, modals, Home tabs, custom views)
6. Actions (create tasks, post messages, trigger negotiations) flow back to the host tool or Gennety

Backend and core agents remain unified — only the presentation layer is platform-specific.

### Key Embedded Functions

1. **Group Chat (Teams Section)**
   - Full-featured group/team chat as specified in [TEAMS.md](TEAMS.md) and [TEAM_FRAMEWORK.md](TEAM_FRAMEWORK.md)
   - In Slack: native channels, threads, AI agents participating as teammates, Home tab for Gennety dashboard
   - In other tools: embedded chat panels or integration with existing messaging
   - Supports agent-to-agent negotiation visible or summarized in chat

2. **Context Hub**
   - Real-time enriched profiles and team dashboards
   - Workload from Jira/ClickUp, communication patterns from Slack, expertise signals
   - Visualizations and AI insights directly in the host interface

3. **Dialogue Analysis**
   - AI scans conversations (Slack threads, Jira comments, etc.)
   - Detects expertise, sentiment, collaboration patterns, potential matches
   - Surfaces actionable insights without leaving the tool

4. **Agent-to-Agent (Bot-to-Bot) Communication**
   - Agents negotiate, share context, and orchestrate in the background
   - Results (proposals, summaries, automated actions) appear seamlessly in the embedded UI
   - Users see only high-value outputs ("Your agent negotiated a match — confirm?")

## Integration by Platform

### Slack (Highest Priority — First Implementation Target)
- **Why**: Most natural for chat and social context; excellent developer experience with Bolt framework
- **Capabilities**: Custom apps with sidebars, modals, Home tabs, slash commands, event subscriptions, real-time sockets
- **Features to Embed**: Full group chat experience, agent participation, context hub sidebar, dialogue analysis summaries, one-click match proposals
- **Positioning**: "Gennety AI Team Hub right inside your Slack workspace"

### Jira / Atlassian Ecosystem (Enterprise Priority)
- **Why**: Dominant in software/dev teams; deep access to issues, sprints, Confluence knowledge
- **Implementation**: Atlassian Forge apps or Connect apps for custom panels, issue views, dashboards, macros
- **Features**: Context enrichment from issue history, AI-created Jira issues from Gennety discussions, team workload dashboards, expertise mapping
- **Enterprise Angle**: Compliance-ready, granular permissions, perfect for B2B/enterprise segment

### ClickUp and Similar Task Tools
- Custom apps or deep integrations
- Task/workload panels with AI insights and matching suggestions
- Sync with Goals and custom fields for skill tagging

### Other Tools
- Linear, Asana, Monday.com: Similar task intelligence
- Microsoft Teams: Communication layer (analogous to Slack)
- GitHub: Code activity, PR expertise signals
- Browser extensions or iframes as quick-start options for broader coverage

## Connection to Existing Systems

This strategy is the natural evolution of the **Context Hub Connectors** documented in [CONTEXT_HUB_CONNECTORS.md](CONTEXT_HUB_CONNECTORS.md):
- Connectors pull external data *into* Gennety for enrichment
- Embedded UI brings Gennety capabilities *back out* into host tools
- Bidirectional flow creates a seamless experience

It also builds directly on the Teams and agent collaboration framework in [TEAMS.md](TEAMS.md) and [TEAM_FRAMEWORK.md](TEAM_FRAMEWORK.md).

## Technical Considerations and Architecture

- **Unified Backend**: All agents, MCP tools, Match Engine, Beacon Engine, Negotiation FSM, Reputation System remain in the core Next.js/MCP/Supabase stack
- **Platform-Specific Frontends**: Separate lightweight implementations (Slack Bolt app, Jira Forge app, etc.) that call the central MCP API and render results
- **Authentication & Permissions**: OAuth 2.0 with minimal scopes; user consent flows; granular control
- **Data Flow**: Real-time via webhooks/events where possible; polling as fallback
- **Open Source Extensibility**: Each embedded app can be a separate repo or plugin; community contributions encouraged
- **Marketplaces**: Publish to Slack App Directory, Atlassian Marketplace for discoverability
- **Consistency**: Shared design system and component library for unified Gennety branding across embeds
- **Performance & Limits**: Respect host platform rate limits; efficient caching and incremental sync

## Benefits
- Dramatically lower adoption barrier
- Leverages existing workflows and data
- Positions Gennety as an "AI augmentation layer" rather than a competitor
- Easier enterprise sales ("enhance what you already use")
- Scalable through platform ecosystems
- Strong alignment with open-source and connector strategy

## Risks and Mitigations
- **UI Fragmentation**: Mitigated by shared design system and clear guidelines
- **Platform Limitations**: Start with most flexible (Slack), then expand
- **Marketplace Approval**: Plan for review processes and compliance
- **Maintenance Overhead**: Modular architecture; prioritize high-impact platforms
- **User Education**: Clear onboarding flows and value communication

## Implementation Roadmap (High-Level)
1. Finalize group chat specification in Teams section (reference existing TEAMS.md)
2. Design shared architecture for embedded UIs (backend MCP extensions + platform adapters)
3. **Priority 1**: Build Slack App PoC (full group chat + context hub sidebar + agent integration)
4. Add tasks to project trackers
5. Develop Jira Forge integration (enterprise focus)
6. Expand to ClickUp/Linear
7. Update marketing materials, presentations, and GTM strategy with new positioning
8. Community/open-source launch of connector templates

## Full Implementation Prompt for Autonomous Coding Agent

**Instructions for the Coding Agent (Claude, Cursor, or equivalent):**

You are an expert full-stack TypeScript/Next.js developer specializing in AI agent platforms, MCP (Model Context Protocol), and platform integrations (Slack Bolt, Atlassian Forge, etc.). Your goal is to implement the **Embedded UI / Second Layer** feature for Gennety as described above.

**Core Principles**:
- Work **fully autonomously** wherever possible using the existing codebase, architecture, and patterns from GENNETY_SPEC.md, AGENTS.md, CONTEXT_HUB_CONNECTORS.md, TEAMS.md, TEAM_FRAMEWORK.md, and other docs.
- Rely on the detailed guidance in this document and the repo's existing patterns (MCP tools, Prisma schema, Next.js App Router, Supabase, etc.).
- Prioritize **Slack integration first** as the highest-ROI starting point.
- Maintain consistency with the existing tech stack: TypeScript, Next.js 16, Tailwind, Prisma, pgvector, MCP server in src/lib/mcp/.
- All new code must follow existing conventions (file structure, error handling, auth patterns, i18n where applicable).

**Step-by-Step Implementation Plan** (Execute in order; create PRs or branches as needed for review):

### Phase 1: Preparation and Planning (Autonomous)
1. Read and internalize all related files: TEAMS.md, TEAM_FRAMEWORK.md, CONTEXT_HUB_CONNECTORS.md, GENNETY_SPEC.md, ARCHITECTURE.md, AGENTS.md.
2. Analyze current MCP tools and identify extension points for embedded UIs (new tools or endpoints for chat, context sync, analysis).
3. Design the high-level architecture:
   - Central "Embedded UI Service" module (new folder src/lib/embedded-ui/ or similar)
   - Platform adapters (slack/, jira/, etc.)
   - Shared types and interfaces
4. Update relevant docs if needed (but do not block on this).

**If you need clarification on architecture decisions that are not covered in existing docs, create a detailed proposal in a new GitHub issue and notify the maintainer.**

### Phase 2: Slack Integration (Highest Priority — Fully Autonomous Where Possible)
1. Set up a new Slack App in the Slack API console (you cannot do this — **notify the user immediately** with exact steps: create app at api.slack.com/apps, choose "From scratch", add required scopes: chat:write, channels:read, users:read, app_mentions:read, etc., and provide the exact manifest or settings needed).
2. Implement Slack Bolt app in a new module (e.g., src/integrations/slack/ or as a separate service/micro-app that calls the main MCP API).
3. Add event listeners for messages, app_home_opened, etc.
4. Implement:
   - Embedded group chat view (using Block Kit or custom UI)
   - Context hub sidebar or modal
   - Agent participation (forward relevant messages to MCP tools like negotiate or publish_context)
   - Real-time updates via Socket Mode or webhooks
5. Handle OAuth flow for workspace installation (store tokens securely in Supabase or Prisma).
6. Surface Gennety features: one-click "Enrich with Gennety", "Start Agent Negotiation", dialogue analysis summaries.
7. Test thoroughly with the existing test suite and add new tests.

**Manual Step Notification**: For creating the Slack App, obtaining Client ID/Secret, and configuring Event Subscriptions / Interactivity — notify the user with precise instructions and wait for confirmation before proceeding with code that depends on those credentials.

### Phase 3: Jira / Atlassian Integration (Autonomous After Setup)
1. Research and implement Atlassian Forge app (or Connect if simpler).
2. Create custom UI modules for issue panels, dashboards, and Confluence macros.
3. Integrate with Jira REST API for issue data, user activity, and Confluence content.
4. Map to Gennety Context Hub and chat features.
5. Handle OAuth and scoped permissions.

**Manual Step**: Setting up the Forge app in Atlassian Developer Console and publishing to Marketplace — notify user for manual steps (app creation, scopes, distribution settings).

### Phase 4: Core Backend Extensions (Fully Autonomous)
1. Extend MCP server with new tools:
   - get_embedded_context
   - analyze_dialogue
   - initiate_embedded_chat
   - sync_host_data
2. Add Prisma models if needed for embedded sessions/tokens (follow existing schema patterns).
3. Implement shared services for rendering UI payloads (JSON for Block Kit, Forge UI, etc.).
4. Ensure all agent-to-agent communication works seamlessly and surfaces correctly.
5. Add comprehensive logging, error handling, and rate limiting.

### Phase 5: Testing, Documentation, and Deployment (Autonomous + Notifications)
1. Write unit/integration tests for all new code.
2. Update README.md, GENNETY_SPEC.md, and this document with implementation status.
3. Prepare deployment scripts (Docker, Vercel, etc.) — follow existing patterns.
4. For production deployment of new services or marketplace listings — **notify the user** with exact steps required (e.g., environment variables, DNS, app review submissions).

**General Rules for the Agent**:
- **Autonomous by Default**: Implement, test, commit to a feature branch, and open a Pull Request with detailed description. Use conventional commits.
- **When to Notify User** (create GitHub issue or comment and tag maintainer):
  - Any OAuth app creation or marketplace setup in external platforms (Slack, Atlassian, etc.)
  - Addition of new environment variables or secrets
  - Changes to production infrastructure or deployment pipelines
  - Decisions that require business input (e.g., exact feature prioritization, pricing implications, legal/compliance reviews)
  - Any ambiguity in existing codebase that blocks progress after thorough investigation
- **Never block on minor details**: If something is unclear but low-risk, make a reasonable assumption, document it in the PR, and proceed.
- **Quality Standards**: Code must be clean, typed, documented (JSDoc or comments), follow existing linting (ESLint), and pass all tests.
- **Security**: Follow SECURITY.md; use least-privilege principles for all integrations.
- **Performance**: Optimize for real-time where possible; cache aggressively.

**Success Criteria**:
- Working Slack embedded experience with group chat, context hub, and agent integration
- Clean, maintainable codebase extension
- Full backward compatibility with existing MCP clients and agents
- Documentation updated
- Ready for Jira PoC

Start by creating a feature branch (e.g., feature/embedded-ui-second-layer) and begin Phase 1. Report progress via PR comments or issues as you go.

**End of Prompt** — Execute thoroughly and autonomously, escalating only where explicitly required.

---

*This document serves as both the detailed specification and the executable prompt for implementation agents. It is ready for immediate use by coding assistants.*
