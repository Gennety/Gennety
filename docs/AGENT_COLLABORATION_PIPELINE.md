# Agent Collaboration Pipeline Specification

Status: authoritative future Team Framework spec.
Cross-references:
- [MODEL_ROUTING.md](file:///Users/pro/Desktop/Gennety/docs/MODEL_ROUTING.md) (model selection and cost tracking)
- [TEAM_FRAMEWORK.md](file:///Users/pro/Desktop/Gennety/docs/TEAM_FRAMEWORK.md) (AgentInstruction parameters, dynamic autonomy)
- [TELEGRAM_INTEGRATION.md](file:///Users/pro/Desktop/Gennety/docs/TELEGRAM_INTEGRATION.md) (Block E - Team Space notifications)
- [CONTEXTUAL_HUBS_TECHNICAL_PLAN.md](file:///Users/pro/Desktop/Gennety/docs/CONTEXTUAL_HUBS_TECHNICAL_PLAN.md) (Contextual Hub schema)

---

## 1. Goal and Concepts

The Agent Collaboration Pipeline defines the mechanism by which multiple agents coordinate, delegate work, record accomplishments, and consult with human owners. It introduces:
1. **Durable Event Log** (`TeamActivityLog`): A shared chronological ledger of team activities.
2. **Task State Machine** (`AgentTask`): A structured pipeline for delegating, running, and approving work.
3. **Human-in-the-Loop (HITL) Gateways**: Enforcing mandatory manual approval for high-risk operations (financial transactions, external code merges, public deployment).

---

## 2. Database Schema

Add the following structures to `prisma/schema.prisma`. 

```prisma
enum AgentTaskStatus {
  PROPOSED
  ASSIGNED
  RUNNING
  APPROVAL_REQUIRED
  COMPLETED
  REJECTED
}

enum TaskRiskLevel {
  LOW
  MEDIUM
  HIGH
}

model TeamActivityLog {
  id          String   @id @default(cuid())
  communityId String   @map("community_id")
  community   Community @relation(fields: [communityId], references: [id], onDelete: Cascade)
  
  actorId     String   @map("actor_id") // Agent display name or Owner ID
  actorType   String   @map("actor_type") // "AGENT" | "OWNER" | "SYSTEM"
  category    String   @map("category") // "code" | "deploy" | "meeting" | "decision" | "blocker" | "task"
  content     String   @db.Text
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([communityId])
  @@index([createdAt])
  @@map("team_activity_logs")
}

model AgentTask {
  id          String          @id @default(cuid())
  communityId String          @map("community_id")
  community   Community       @relation(fields: [communityId], references: [id], onDelete: Cascade)
  
  title       String
  description String?         @db.Text
  status      AgentTaskStatus @default(PROPOSED)
  riskLevel   TaskRiskLevel   @default(LOW)
  
  creatorId   String          @map("creator_id") // Agent or human Owner ID
  assigneeId  String?         @map("assignee_id") // Target Agent ID
  
  requiresHitl       Boolean @default(false) @map("requires_hitl")
  approvalRequested  Boolean @default(false) @map("approval_requested")
  approvedByOwnerId  String? @map("approved_by_owner_id")
  approvedByOwner    Owner?  @relation(fields: [approvedByOwnerId], references: [id], onDelete: SetNull)
  
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt @map("updated_at")

  @@index([communityId])
  @@index([status])
  @@map("agent_tasks")
}
```

*Note: Update Owner relationships in `Owner` model:*
```prisma
// Inside model Owner
// agentTasksApproved AgentTask[]
// activityLogs      TeamActivityLog[] (if actorType is OWNER)
```

---

## 3. Workflow and Security Invariants

### 3.1 Human-in-the-Loop (HITL) Gateway Rules

Automatic execution is strictly prohibited for operations in the following categories:
* `external_publish`: Uploading code, blog posts, or publishing announcements to production platforms.
* `merge_to_main`: Merging pull requests into the default branch of repositories.
* `finance`: Issuing invoices, making token transactions, or modifying budgets.

When an agent initiates a task belonging to these categories:
1. `AgentTask` is created with `requiresHitl = true` and `status = PROPOSED`.
2. The agent calls `request_approval` MCP tool, changing status to `APPROVAL_REQUIRED`.
3. An notification is pushed to the Owner (via Telegram/Slack/Dashboard UI).
4. The task remains blocked until the Owner explicitly calls a webhook or approves via UI, which records `approvedByOwnerId` and updates status to `ASSIGNED` or `COMPLETED`.

### 3.2 Immutability and Permissions
* **Logs are Read-Only**: Once written, a `TeamActivityLog` cannot be modified or deleted by any agent or admin.
* **No Role Mutating**: Agents can propose or request tasks, but cannot alter `CommunityMember` role values or grant administration levels to themselves or other agents.

---

## 4. MCP Tools Specifications

Create files in `src/lib/mcp/tools/` and register them in the server.

### 4.1 `log_activity`
Allows an agent to submit a verified event to the community ledger.
* **Input Schema**:
  ```ts
  interface LogActivityInput {
    communityId: string;
    category: "code" | "deploy" | "meeting" | "decision" | "blocker" | "task";
    content: string;
    actorId: string;
  }
  ```
* **Execution**: Normalizes input, ensures no raw secrets are leaked, inserts into `TeamActivityLog`, and triggers real-time UI/Telegram alerts if the category is `"blocker"`.

### 4.2 `propose_task`
Creates a new task in the pipeline.
* **Input Schema**:
  ```ts
  interface ProposeTaskInput {
    communityId: string;
    title: string;
    description?: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    creatorId: string;
    requiresHitl: boolean;
  }
  ```

### 4.3 `delegate_task`
Assigns an existing task to another agent.
* **Input Schema**:
  ```ts
  interface DelegateTaskInput {
    taskId: string;
    assigneeId: string;
    requestedBy: string; // The delegating Agent ID
  }
  ```
* **Constraint Check**: Checks if the delegating agent has appropriate Autonomy Phase rights (configured in `AgentRoleConfig`, see [TEAM_FRAMEWORK.md](file:///Users/pro/Desktop/Gennety/docs/TEAM_FRAMEWORK.md)). If in Phase 1, delegation fails immediately.

### 4.4 `request_approval`
Explicit request for human verification of a task.
* **Input Schema**:
  ```ts
  interface RequestApprovalInput {
    taskId: string;
    requestedBy: string; // Agent ID
    explanation: string; // Detail explaining why this action is necessary and its risks
  }
  ```
* **Execution**: Sets `status = APPROVAL_REQUIRED`, creates `approval_requested = true`, and emits notifications.

---

## 5. Multi-Agent Strategy Sessions Integration

The weekly strategy engine (`src/lib/services/community-strategy.ts`) is upgraded to use these models:
1. **Data Ingestion**: The system reads all `TeamActivityLog` rows created during the week.
2. **Debate Stage**: Agents representing team members use `resolveModel("strategy_participant")` to evaluate their own progress (refer to `AgentSelfAssessment` in [TEAM_FRAMEWORK.md](file:///Users/pro/Desktop/Gennety/docs/TEAM_FRAMEWORK.md)).
3. **Synthesis & Judging**: A Judge Agent uses `resolveModel("strategy_judge")` to review logs, verify claims, resolve conflicts, and output `CommunityActionProposal` objects.
4. **Action Proposal**: Generated proposals are mapped as `AgentTask` entries flagged with `requiresHitl = true` for owner sign-off.
