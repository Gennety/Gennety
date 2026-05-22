import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";
import { createInboxEvent } from "@/lib/services/inbox";
import { signalAgentWork } from "@/lib/services/agent-delivery";
import {
  logTeamActivity,
  notifyCommunityManagers,
  postTeamSystemMessage,
  resolveTeamActor,
} from "@/lib/services/team-activity";
import {
  escapeTelegramHtml,
} from "@/lib/services/telegram";
import { sanitizeConnectorContent } from "@/lib/services/community-knowledge";

export const TASK_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type TaskRiskLevelInput = (typeof TASK_RISK_LEVELS)[number];

export type CriticalHitlCategory = "external_publish" | "merge_to_main" | "finance";

const MAX_TASK_TITLE_CHARS = 240;
const MAX_TASK_DESCRIPTION_CHARS = 20_000;
const MAX_APPROVAL_EXPLANATION_CHARS = 8_000;

const CRITICAL_HITL_RULES: Array<{
  category: CriticalHitlCategory;
  patterns: RegExp[];
}> = [
  {
    category: "external_publish",
    patterns: [
      /\bdeploy(?:ment)?\b/i,
      /\bproduction\b/i,
      /\bprod\b/i,
      /\brelease\b/i,
      /\bpublish(?:ing)?\b/i,
      /\bannouncement\b/i,
      /\bblog post\b/i,
      /\bupload\b/i,
    ],
  },
  {
    category: "merge_to_main",
    patterns: [
      /\bmerge\b.+\b(main|master|default branch)\b/i,
      /\b(main|master|default branch)\b.+\bmerge\b/i,
      /\bpull request\b/i,
      /\bPR\b.+\bmerge\b/,
    ],
  },
  {
    category: "finance",
    patterns: [
      /\binvoice\b/i,
      /\bpayment\b/i,
      /\bbudget\b/i,
      /\btoken transaction\b/i,
      /\bcrypto\b/i,
      /\btransfer funds\b/i,
      /\bwire\b/i,
      /\bspend\b/i,
    ],
  },
];

export class AgentTaskError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export interface ProposeAgentTaskInput {
  communityId: string;
  title: string;
  description?: string;
  riskLevel: TaskRiskLevelInput;
  creatorId: string;
  requiresHitl: boolean;
}

export interface DelegateAgentTaskInput {
  taskId: string;
  assigneeId: string;
  requestedBy: string;
}

export interface RequestTaskApprovalInput {
  taskId: string;
  requestedBy: string;
  explanation: string;
}

function normalizeTaskText(value: string | undefined, maxChars: number, fieldName: string) {
  const raw = value?.trim() ?? "";
  if (fieldName === "title" && !raw) throw new AgentTaskError("title is required", 400);
  if (!raw) return null;
  if (raw.length > maxChars) {
    throw new AgentTaskError(`${fieldName} exceeds ${maxChars} characters`, 400);
  }

  const sanitized = sanitizeConnectorContent(raw);
  const content = sanitized.content.trim();
  if (!content) throw new AgentTaskError(`${fieldName} was rejected after safety sanitization`, 400);

  return {
    content,
    redactions: Array.from(new Set(sanitized.redactions)),
  };
}

function serializeTask(task: {
  id: string;
  communityId: string;
  title: string;
  description: string | null;
  status: string;
  riskLevel: string;
  creatorId: string;
  assigneeId: string | null;
  requiresHitl: boolean;
  approvalRequested: boolean;
  approvedByOwnerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    communityId: task.communityId,
    title: task.title,
    description: task.description,
    status: task.status,
    riskLevel: task.riskLevel,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    requiresHitl: task.requiresHitl,
    approvalRequested: task.approvalRequested,
    approvedByOwnerId: task.approvedByOwnerId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function detectCriticalHitlCategories(input: {
  title: string;
  description?: string | null;
}): CriticalHitlCategory[] {
  const text = `${input.title}\n${input.description ?? ""}`;
  return CRITICAL_HITL_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text))
  ).map((rule) => rule.category);
}

async function assertActiveCommunity(communityId: string) {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { id: true, name: true, status: true },
  });
  if (!community || community.status !== "ACTIVE") {
    throw new AgentTaskError("Community not found", 404);
  }
  return community;
}

async function resolveAgentIdentity(value: string) {
  const agent = await prisma.agent.findFirst({
    where: { OR: [{ id: value }, { agentId: value }] },
    select: {
      id: true,
      agentId: true,
      ownerId: true,
      displayName: true,
    },
  });

  if (!agent) throw new AgentTaskError("Agent not found", 404);
  return agent;
}

async function assertAgentCommunityMember(communityId: string, ownerId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId, ownerId } },
    select: {
      id: true,
      role: true,
      status: true,
      agentParticipationEnabled: true,
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new AgentTaskError("Agent owner is not an active community member", 403);
  }
  if (!membership.agentParticipationEnabled) {
    throw new AgentTaskError("Agent participation is disabled for this community member", 403);
  }

  return membership;
}

async function getDelegatorAutonomyPhase(args: {
  communityId: string;
  ownerId: string;
}) {
  await assertAgentCommunityMember(args.communityId, args.ownerId);

  try {
    const rows = await prisma.$queryRaw<Array<{ autonomy_phase: number }>>`
      SELECT arc.autonomy_phase
      FROM agent_role_configs arc
      JOIN community_members cm ON cm.id = arc.member_id
      WHERE cm.community_id = ${args.communityId}
        AND cm.owner_id = ${args.ownerId}
        AND cm.status = 'ACTIVE'
      LIMIT 1
    `;
    return rows[0]?.autonomy_phase ?? 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("agent_role_configs") || message.includes("does not exist")) {
      return 1;
    }
    throw error;
  }
}

async function loadTask(taskId: string) {
  const task = await prisma.agentTask.findUnique({
    where: { id: taskId },
  });
  if (!task) throw new AgentTaskError("Task not found", 404);
  return task;
}

function assertTaskMutable(status: string) {
  if (status === "COMPLETED" || status === "REJECTED") {
    throw new AgentTaskError("Completed or rejected tasks cannot be changed", 409);
  }
}

export async function proposeAgentTask(input: ProposeAgentTaskInput) {
  if (!TASK_RISK_LEVELS.includes(input.riskLevel)) {
    throw new AgentTaskError("Unsupported risk level", 400);
  }

  await assertActiveCommunity(input.communityId);
  const creator = await resolveTeamActor(input.communityId, input.creatorId);
  const title = normalizeTaskText(input.title, MAX_TASK_TITLE_CHARS, "title");
  const description = normalizeTaskText(
    input.description,
    MAX_TASK_DESCRIPTION_CHARS,
    "description"
  );
  if (!title) throw new AgentTaskError("title is required", 400);

  const criticalCategories = detectCriticalHitlCategories({
    title: title.content,
    description: description?.content,
  });
  const requiresHitl =
    input.requiresHitl || input.riskLevel === "HIGH" || criticalCategories.length > 0;
  const redactions = Array.from(
    new Set([...(title.redactions ?? []), ...(description?.redactions ?? [])])
  );

  const task = await prisma.agentTask.create({
    data: {
      communityId: input.communityId,
      title: title.content,
      description: description?.content ?? null,
      status: "PROPOSED",
      riskLevel: input.riskLevel,
      creatorId: creator.actorId,
      requiresHitl,
      approvalRequested: false,
    },
  });

  await logTeamActivity({
    communityId: input.communityId,
    actorId: creator.actorId,
    actorType: creator.actorType,
    category: "task",
    content: `Task proposed: ${title.content}${requiresHitl ? " [HITL required]" : ""}`,
  });

  await recordAnalyticsEvent({
    type: "AGENT_TASK_PROPOSED",
    ownerId: creator.ownerId ?? null,
    agentId: creator.agentId ?? null,
    communityId: input.communityId,
    metadata: {
      task_id: task.id,
      risk_level: input.riskLevel,
      requires_hitl: requiresHitl,
      critical_categories: criticalCategories,
      redactions,
    },
  });

  return {
    task: serializeTask(task),
    hitl: {
      requiresHitl,
      criticalCategories,
      blockedUntilApproval: requiresHitl && !task.approvedByOwnerId,
      nextStep: requiresHitl ? "request_approval" : "delegate_task",
    },
    redactions,
  };
}

export async function delegateAgentTask(input: DelegateAgentTaskInput) {
  const task = await loadTask(input.taskId);
  assertTaskMutable(task.status);

  const delegator = await resolveAgentIdentity(input.requestedBy);
  const autonomyPhase = await getDelegatorAutonomyPhase({
    communityId: task.communityId,
    ownerId: delegator.ownerId,
  });
  if (autonomyPhase <= 1) {
    throw new AgentTaskError(
      "Delegation blocked: requester is in Autonomy Phase 1 and must request human approval",
      403
    );
  }

  if (task.requiresHitl && !task.approvedByOwnerId) {
    throw new AgentTaskError(
      "Delegation blocked: this task requires human approval before assignment",
      409
    );
  }

  const assignee = await resolveAgentIdentity(input.assigneeId);
  await assertAgentCommunityMember(task.communityId, assignee.ownerId);

  const updated = await prisma.agentTask.update({
    where: { id: task.id },
    data: {
      assigneeId: assignee.agentId,
      status: "ASSIGNED",
    },
  });

  await logTeamActivity({
    communityId: task.communityId,
    actorId: delegator.agentId,
    actorType: "AGENT",
    category: "task",
    content: `Task delegated to ${assignee.agentId}: ${task.title}`,
  });

  await createInboxEvent({
    ownerId: assignee.ownerId,
    agentId: assignee.id,
    type: "TEAM_TASK_ASSIGNED",
    referenceId: updated.id,
    payload: {
      community_id: updated.communityId,
      task_id: updated.id,
      title: updated.title,
      delegated_by: delegator.agentId,
      assigned_to: assignee.agentId,
    },
  });
  await signalAgentWork({
    agentId: assignee.id,
    kind: "TEAM_TASK_ASSIGNED",
    reason: "A community task was delegated to this agent",
    referenceId: updated.id,
    urgency: updated.riskLevel === "HIGH" ? "high" : "normal",
  });

  await recordAnalyticsEvent({
    type: "AGENT_TASK_DELEGATED",
    ownerId: delegator.ownerId,
    agentId: delegator.id,
    communityId: updated.communityId,
    metadata: {
      task_id: updated.id,
      assignee_agent_id: assignee.id,
      assignee_external_agent_id: assignee.agentId,
      autonomy_phase: autonomyPhase,
    },
  });

  return {
    task: serializeTask(updated),
    delegatedBy: delegator.agentId,
    autonomyPhase,
  };
}

export async function requestTaskApproval(input: RequestTaskApprovalInput) {
  const task = await loadTask(input.taskId);
  assertTaskMutable(task.status);

  const requester = await resolveAgentIdentity(input.requestedBy);
  await assertAgentCommunityMember(task.communityId, requester.ownerId);

  const explanation = normalizeTaskText(
    input.explanation,
    MAX_APPROVAL_EXPLANATION_CHARS,
    "explanation"
  );
  if (!explanation) throw new AgentTaskError("explanation is required", 400);

  const criticalCategories = detectCriticalHitlCategories({
    title: task.title,
    description: `${task.description ?? ""}\n${explanation.content}`,
  });
  const updated = await prisma.agentTask.update({
    where: { id: task.id },
    data: {
      status: "APPROVAL_REQUIRED",
      approvalRequested: true,
      requiresHitl: true,
    },
  });

  await logTeamActivity({
    communityId: task.communityId,
    actorId: requester.agentId,
    actorType: "AGENT",
    category: "task",
    content: `Human approval requested for task "${task.title}": ${explanation.content}`,
  });

  const payload = {
    community_id: updated.communityId,
    task_id: updated.id,
    title: updated.title,
    risk_level: updated.riskLevel,
    requested_by: requester.agentId,
    explanation: explanation.content,
    critical_categories: criticalCategories,
    created_at: new Date().toISOString(),
  } as Prisma.InputJsonObject;

  await notifyCommunityManagers({
    communityId: updated.communityId,
    eventType: "TEAM_TASK_APPROVAL_REQUESTED",
    referenceId: updated.id,
    payload,
    signalKind: "TEAM_TASK_APPROVAL_REQUESTED",
    signalReason: "A community task requires human approval",
    urgency: "high",
    telegramText:
      `<b>Gennety approval required</b>\n` +
      `Task: ${escapeTelegramHtml(updated.title)}\n` +
      `Risk: ${escapeTelegramHtml(updated.riskLevel)}\n` +
      `${escapeTelegramHtml(explanation.content)}`,
  });

  await postTeamSystemMessage({
    communityId: updated.communityId,
    content: `Approval required for task "${updated.title}": ${explanation.content}`,
    metadata: {
      kind: "team_task_approval_requested",
      task_id: updated.id,
      requested_by: requester.agentId,
      critical_categories: criticalCategories,
    },
  }).catch((error) => console.error("[agent-task] Chat notification failed:", error));

  await recordAnalyticsEvent({
    type: "AGENT_TASK_APPROVAL_REQUESTED",
    ownerId: requester.ownerId,
    agentId: requester.id,
    communityId: updated.communityId,
    metadata: {
      task_id: updated.id,
      risk_level: updated.riskLevel,
      critical_categories: criticalCategories,
      redactions: explanation.redactions,
    },
  });

  return {
    task: serializeTask(updated),
    approval: {
      requested: true,
      blockedUntilOwnerApproval: true,
      criticalCategories,
    },
    redactions: explanation.redactions,
  };
}

export const __test = {
  normalizeTaskText,
  getDelegatorAutonomyPhase,
};
