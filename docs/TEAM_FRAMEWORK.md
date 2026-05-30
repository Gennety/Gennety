# Gennety Team Framework Specification

Status: authoritative future framework design specification.
Cross-references:
- [MODEL_ROUTING.md](file:///Users/pro/Desktop/Gennety/docs/MODEL_ROUTING.md) (cheap vs quality LLM tasks)
- [AGENT_COLLABORATION_PIPELINE.md](file:///Users/pro/Desktop/Gennety/docs/AGENT_COLLABORATION_PIPELINE.md) (Activity logs, tasks, and delegation MCP tools)
- [TELEGRAM_INTEGRATION.md](file:///Users/pro/Desktop/Gennety/docs/TELEGRAM_INTEGRATION.md) (Block E - Team Space notifications)
- [SLACK_JIRA_INTEGRATION.md](file:///Users/pro/Desktop/Gennety/docs/SLACK_JIRA_INTEGRATION.md) (corporate adapter interfaces)

---

## 1. Goal and Concepts

The **Gennety Team Framework** is a modular runtime and protocol designed to orchestrate human and AI agent cooperation. It leverages:
1. **Dynamic Instructions**: Instruction sets assembled on-the-fly reflecting the current state of team work.
2. **Periodic Self-Assessment**: Agents analyzing their own efficiency metrics prior to team planning loops.
3. **Autonomy Phases**: Graduated execution permission tiers.
4. **Abstracted SDK Layer**: Ensuring the core engine can run independently of the frontend application.

---

## 2. Database Schema

Add the following structures to `prisma/schema.prisma`:

```prisma
model AgentRoleConfig {
  id            String          @id @default(cuid())
  memberId      String          @unique @map("member_id")
  member        CommunityMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  
  autonomyPhase Int             @default(1) @map("autonomy_phase") // 1 = assisted, 2 = supervised, 3 = autonomous
  customSoul    String?         @map("custom_soul") @db.Text // DB override of static soul.md templates
  
  createdAt     DateTime        @default(now()) @map("created_at")
  updatedAt     DateTime        @updatedAt @map("updated_at")

  @@map("agent_role_configs")
}

model AgentInstruction {
  id               String   @id @default(cuid())
  agentId          String   @map("agent_id") // References Agent model
  communityId      String   @map("community_id")
  
  soul             String   @db.Text
  currentGoals     String[] @default([]) @map("current_goals")
  recentActivity   String[] @default([]) @map("recent_activity")
  openBlockers     String[] @default([]) @map("open_blockers")
  delegationRights String[] @default([]) @map("delegation_rights")
  generatedAt      DateTime @default(now()) @map("generated_at")

  @@unique([agentId, communityId])
  @@map("agent_instructions")
}

model AgentSelfAssessment {
  id                 String   @id @default(cuid())
  agentId            String   @map("agent_id")
  communityId        String   @map("community_id")
  period             String   @map("period") // Format: "YYYY-Www" (e.g., "2026-W21")
  
  tasksCompleted     Int      @map("tasks_completed")
  tasksAutoDelegated Int      @map("tasks_auto_delegated")
  approvalsRequested Int      @map("approvals_requested")
  blockersRaised     Int      @map("blockers_raised")
  responseTimeP50    Float    @map("response_time_p50") // MS
  autoDelegatedRatio Float    @map("auto_delegated_ratio")
  
  gaps               String[] @default([])
  suggestions        String[] @default([])
  createdAt          DateTime @default(now()) @map("created_at")

  @@unique([agentId, communityId, period])
  @@map("agent_self_assessments")
}
```

---

## 3. Core Engine Mechanics

### 3.1 Dynamic `AgentInstruction` Lifecycle

Instead of static prompts, agents execute inside a contextual wrapper generated dynamically:

```mermaid
graph TD
    A[Agent Startup / Tool Invocation] --> B{Cached Instruction Exist?}
    B -- Yes (Age < 24 hours) --> C[Return Cache]
    B -- No / Expired --> D[Compile Context]
    D --> E[Read public/skills/[role]_soul.md]
    D --> F[Fetch custom overrides in AgentRoleConfig]
    D --> G[Fetch recent TeamActivityLog rows]
    D --> H[Fetch unresolved blockers from Context Hub]
    D --> I[Fetch goals from last WeeklyStrategySummary]
    E & F & G & H & I --> J[Assemble & Store in AgentInstruction]
    J --> K[Return instruction]
```

1. **Caching (TTL)**: `AgentInstruction` caches are valid for 24 hours.
2. **On-Demand Expiry**: Strategy Engine execution resets the TTL, forcing regeneration during the next agent tick to load the newly formulated weekly strategy.
3. **Autonomy Phase Delegation Rights**:
   * **Phase 1 (assisted)**: `delegationRights = []` (Any task requires HITL signature).
   * **Phase 2 (supervised)**: `delegationRights = ["code_draft", "docs_write", "research"]`.
   * **Phase 3 (autonomous)**: `delegationRights = ["*"]` (Excludes financial transactions and prod branch merging, which remain permanently human-gated).

### 3.2 `AgentSelfAssessment` and Strategy Planning

1. **Aggregation**: Before the strategy session, each agent calculates its performance metrics for the target calendar week (e.g. `tasksCompleted`, latency metrics).
2. **Qualitative Evaluation**: The agent runs `resolveModel("distillation")` over its own logs to find skill gaps and recommendations.
3. **Weekly Ingestion**: The Judge Agent (`resolveModel("strategy_judge")`) reads all `AgentSelfAssessment` JSON outputs to diagnose bottlenecks and allocate upcoming goals in the weekly summary.

---

## 4. MCP Tool `get_my_instructions`

Registered in `src/lib/mcp/server.ts`:
* **Input Schema**:
  ```ts
  interface GetMyInstructionsInput {
    agentId: string;
    communityId: string;
  }
  ```
* **Response**: Returns the compiled string of the active `AgentInstruction`.
