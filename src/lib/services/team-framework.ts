import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { resolveModel } from "@/lib/model-router";

export const AGENT_INSTRUCTION_TTL_MS = 24 * 60 * 60 * 1000;

export const DELEGATION_RIGHTS_BY_AUTONOMY_PHASE = {
  1: [],
  2: ["code_draft", "docs_write", "research"],
  3: ["*"],
} as const;

export type DelegationRight =
  (typeof DELEGATION_RIGHTS_BY_AUTONOMY_PHASE)[keyof typeof DELEGATION_RIGHTS_BY_AUTONOMY_PHASE][number];

export interface DelegationProfile {
  autonomyPhase: 1 | 2 | 3;
  delegationRights: DelegationRight[];
  memberId: string;
}

export interface CompiledAgentInstruction {
  id: string;
  agentId: string;
  externalAgentId: string;
  communityId: string;
  communityName: string;
  generatedAt: Date;
  cached: boolean;
  autonomyPhase: 1 | 2 | 3;
  delegationRights: string[];
  instruction: string;
}

export interface AgentAssessmentMetrics {
  tasksCompleted: number;
  tasksAutoDelegated: number;
  approvalsRequested: number;
  blockersRaised: number;
  responseTimeP50: number;
  autoDelegatedRatio: number;
}

function clampAutonomyPhase(value: number | null | undefined): 1 | 2 | 3 {
  if (value === 3) return 3;
  if (value === 2) return 2;
  return 1;
}

export function getDelegationRightsForAutonomyPhase(phase: number | null | undefined) {
  const normalized = clampAutonomyPhase(phase);
  return [...DELEGATION_RIGHTS_BY_AUTONOMY_PHASE[normalized]];
}

function p50(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function startOfIsoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function getIsoWeekPeriod(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function getIsoWeekBounds(date = new Date()) {
  const start = startOfIsoWeek(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return {
    period: getIsoWeekPeriod(date),
    start,
    end,
  };
}

async function readFirstExisting(paths: string[]) {
  for (const filePath of paths) {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  return [
    "# Gennety Community Agent",
    "",
    "Operate from the published community context, respect owner consent, and keep high-risk actions human-gated.",
  ].join("\n");
}

async function loadSoulTemplate(role: string, customSoul: string | null) {
  const roleSlug = role.toLowerCase();
  const root = process.cwd();
  const staticSoul = await readFirstExisting([
    path.join(root, "public", "skills", `${roleSlug}_soul.md`),
    path.join(root, "templates", `${roleSlug}_soul.md`),
    path.join(root, "SOUL.md"),
    path.join(root, "public", "skills", "RULES.md"),
  ]);

  const override = customSoul?.trim();
  if (!override) return staticSoul.trim();

  return [
    staticSoul.trim(),
    "",
    "## Community Role Override",
    "",
    override,
  ].join("\n");
}

function formatList(items: string[], empty: string) {
  if (items.length === 0) return `- ${empty}`;
  return items.map((item) => `- ${item}`).join("\n");
}

function compileInstructionText(args: {
  externalAgentId: string;
  communityName: string;
  memberRole: string;
  autonomyPhase: 1 | 2 | 3;
  soul: string;
  currentGoals: string[];
  recentActivity: string[];
  openBlockers: string[];
  delegationRights: string[];
  generatedAt: Date;
}) {
  return [
    "# Gennety Dynamic AgentInstruction",
    "",
    `Agent: ${args.externalAgentId}`,
    `Community: ${args.communityName}`,
    `Member role: ${args.memberRole}`,
    `Generated at: ${args.generatedAt.toISOString()}`,
    `Autonomy phase: ${args.autonomyPhase}`,
    `Delegation rights: ${args.delegationRights.length > 0 ? args.delegationRights.join(", ") : "none"}`,
    "",
    "## Soul",
    "",
    args.soul,
    "",
    "## Current Goals",
    "",
    formatList(args.currentGoals, "No active weekly goals recorded yet."),
    "",
    "## Recent Team Activity",
    "",
    formatList(args.recentActivity, "No recent activity recorded."),
    "",
    "## Open Blockers",
    "",
    formatList(args.openBlockers, "No open blockers recorded."),
    "",
    "## Delegation Rules",
    "",
    args.autonomyPhase === 1
      ? "- Do not delegate tasks autonomously. Request human approval first."
      : args.autonomyPhase === 2
        ? "- You may delegate only code drafts, documentation writing, and research tasks. High-risk, production, merge, and financial work stays human-gated."
        : "- You may delegate routine work autonomously, but financial transactions, production branch merging, and external publishing remain human-gated.",
  ].join("\n");
}

async function resolveAgentCommunity(input: { agentId: string; communityId: string }) {
  const agent = await prisma.agent.findFirst({
    where: { OR: [{ id: input.agentId }, { agentId: input.agentId }] },
    select: {
      id: true,
      agentId: true,
      ownerId: true,
      displayName: true,
    },
  });
  if (!agent) throw new Error(`Agent not found: ${input.agentId}`);

  const community = await prisma.community.findUnique({
    where: { id: input.communityId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      knowledgeSummary: true,
    },
  });
  if (!community || community.status !== "ACTIVE") {
    throw new Error(`Community not found: ${input.communityId}`);
  }

  const member = await prisma.communityMember.findUnique({
    where: {
      communityId_ownerId: {
        communityId: input.communityId,
        ownerId: agent.ownerId,
      },
    },
    select: {
      id: true,
      role: true,
      status: true,
      agentParticipationEnabled: true,
      hubSpecialization: true,
      skillTags: true,
      agentRoleConfig: {
        select: {
          id: true,
          autonomyPhase: true,
          customSoul: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!member || member.status !== "ACTIVE") {
    throw new Error("Agent owner is not an active community member");
  }
  if (!member.agentParticipationEnabled) {
    throw new Error("Agent participation is disabled for this community member");
  }

  return { agent, community, member };
}

async function ensureRoleConfig(memberId: string) {
  const existing = await prisma.agentRoleConfig.findUnique({
    where: { memberId },
    select: {
      id: true,
      autonomyPhase: true,
      customSoul: true,
      updatedAt: true,
    },
  });
  if (existing) return existing;

  try {
    return await prisma.agentRoleConfig.create({
      data: { memberId },
      select: {
        id: true,
        autonomyPhase: true,
        customSoul: true,
        updatedAt: true,
      },
    });
  } catch {
    return prisma.agentRoleConfig.findUniqueOrThrow({
      where: { memberId },
      select: {
        id: true,
        autonomyPhase: true,
        customSoul: true,
        updatedAt: true,
      },
    });
  }
}

export async function getDelegationProfileForAgent(input: {
  agentId: string;
  communityId: string;
}): Promise<DelegationProfile> {
  const { member } = await resolveAgentCommunity(input);
  const roleConfig = member.agentRoleConfig ?? await ensureRoleConfig(member.id);
  const autonomyPhase = clampAutonomyPhase(roleConfig.autonomyPhase);
  return {
    autonomyPhase,
    delegationRights: getDelegationRightsForAutonomyPhase(autonomyPhase),
    memberId: member.id,
  };
}

export function inferDelegationRightFromTask(input: {
  title: string;
  description?: string | null;
}): DelegationRight | null {
  const text = `${input.title}\n${input.description ?? ""}`.toLowerCase();
  if (/\b(doc|docs|documentation|readme|spec|write[-\s]?up|guide|notes?)\b/.test(text)) {
    return "docs_write";
  }
  if (/\b(research|investigate|analysis|analyze|survey|compare|explore|findings?)\b/.test(text)) {
    return "research";
  }
  if (/\b(code|draft|prototype|implement|refactor|test|typescript|component|api)\b/.test(text)) {
    return "code_draft";
  }
  return null;
}

async function buildInstructionParts(input: {
  communityId: string;
  delegationRights: string[];
}) {
  const [latestSession, proposals, recentLogs, blockerLogs] = await Promise.all([
    prisma.communityStrategySession.findFirst({
      where: {
        communityId: input.communityId,
        status: { in: ["COMPLETED", "PARTIAL"] },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        summary: true,
        completedAt: true,
      },
    }),
    prisma.communityActionProposal.findMany({
      where: {
        communityId: input.communityId,
        status: { in: ["PENDING", "APPROVED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        title: true,
        summary: true,
        type: true,
      },
    }),
    prisma.teamActivityLog.findMany({
      where: { communityId: input.communityId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        actorId: true,
        actorType: true,
        category: true,
        content: true,
        createdAt: true,
      },
    }),
    prisma.teamActivityLog.findMany({
      where: {
        communityId: input.communityId,
        category: "blocker",
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        actorId: true,
        content: true,
        createdAt: true,
      },
    }),
  ]);

  const currentGoals = [
    ...(latestSession?.summary ? [`Latest strategy summary: ${latestSession.summary}`] : []),
    ...proposals.map((proposal) => `${proposal.type}: ${proposal.title}`),
  ].slice(0, 8);

  return {
    currentGoals,
    recentActivity: recentLogs.map(
      (log) =>
        `${log.createdAt.toISOString()} ${log.actorType}:${log.actorId} [${log.category}] ${log.content}`
    ),
    openBlockers: blockerLogs.map(
      (log) => `${log.createdAt.toISOString()} ${log.actorId}: ${log.content}`
    ),
    delegationRights: input.delegationRights,
  };
}

export async function getAgentInstruction(input: {
  agentId: string;
  communityId: string;
  now?: Date;
}): Promise<CompiledAgentInstruction> {
  const now = input.now ?? new Date();
  const { agent, community, member } = await resolveAgentCommunity(input);
  const roleConfig = member.agentRoleConfig ?? await ensureRoleConfig(member.id);
  const autonomyPhase = clampAutonomyPhase(roleConfig.autonomyPhase);
  const delegationRights = getDelegationRightsForAutonomyPhase(autonomyPhase);

  const cached = await prisma.agentInstruction.findUnique({
    where: {
      agentId_communityId: {
        agentId: agent.id,
        communityId: community.id,
      },
    },
  });

  const cacheFresh =
    cached &&
    now.getTime() - cached.generatedAt.getTime() < AGENT_INSTRUCTION_TTL_MS &&
    roleConfig.updatedAt.getTime() <= cached.generatedAt.getTime();

  if (cacheFresh) {
    return {
      id: cached.id,
      agentId: cached.agentId,
      externalAgentId: agent.agentId,
      communityId: cached.communityId,
      communityName: community.name,
      generatedAt: cached.generatedAt,
      cached: true,
      autonomyPhase,
      delegationRights: cached.delegationRights,
      instruction: compileInstructionText({
        externalAgentId: agent.agentId,
        communityName: community.name,
        memberRole: member.role,
        autonomyPhase,
        soul: cached.soul,
        currentGoals: cached.currentGoals,
        recentActivity: cached.recentActivity,
        openBlockers: cached.openBlockers,
        delegationRights: cached.delegationRights,
        generatedAt: cached.generatedAt,
      }),
    };
  }

  const soul = await loadSoulTemplate(member.role, roleConfig.customSoul);
  const parts = await buildInstructionParts({
    communityId: community.id,
    delegationRights,
  });

  const generated = await prisma.agentInstruction.upsert({
    where: {
      agentId_communityId: {
        agentId: agent.id,
        communityId: community.id,
      },
    },
    create: {
      agentId: agent.id,
      communityId: community.id,
      soul,
      currentGoals: parts.currentGoals,
      recentActivity: parts.recentActivity,
      openBlockers: parts.openBlockers,
      delegationRights: parts.delegationRights,
      generatedAt: now,
    },
    update: {
      soul,
      currentGoals: parts.currentGoals,
      recentActivity: parts.recentActivity,
      openBlockers: parts.openBlockers,
      delegationRights: parts.delegationRights,
      generatedAt: now,
    },
  });

  return {
    id: generated.id,
    agentId: generated.agentId,
    externalAgentId: agent.agentId,
    communityId: generated.communityId,
    communityName: community.name,
    generatedAt: generated.generatedAt,
    cached: false,
    autonomyPhase,
    delegationRights: generated.delegationRights,
    instruction: compileInstructionText({
      externalAgentId: agent.agentId,
      communityName: community.name,
      memberRole: member.role,
      autonomyPhase,
      soul: generated.soul,
      currentGoals: generated.currentGoals,
      recentActivity: generated.recentActivity,
      openBlockers: generated.openBlockers,
      delegationRights: generated.delegationRights,
      generatedAt: generated.generatedAt,
    }),
  };
}

export async function expireAgentInstructionCache(input: {
  communityId: string;
  agentId?: string;
}) {
  const staleGeneratedAt = new Date(0);
  const result = await prisma.agentInstruction.updateMany({
    where: {
      communityId: input.communityId,
      ...(input.agentId ? { agentId: input.agentId } : {}),
    },
    data: { generatedAt: staleGeneratedAt },
  });

  return { expired: result.count };
}

function buildQualitativeAssessment(
  metrics: AgentAssessmentMetrics,
  model: string
) {
  const gaps: string[] = [];
  const suggestions: string[] = [];

  if (metrics.tasksCompleted === 0) {
    gaps.push("No completed assigned tasks were recorded for this week.");
    suggestions.push("Pick one small, measurable task before the next strategy review.");
  }
  if (metrics.blockersRaised > 0) {
    gaps.push(`${metrics.blockersRaised} blocker signal(s) required team attention.`);
    suggestions.push("Convert repeated blockers into explicit Context Hub docs or task dependencies.");
  }
  if (metrics.approvalsRequested > metrics.tasksAutoDelegated) {
    gaps.push("Approval requests outnumbered autonomous delegations.");
    suggestions.push("Clarify safe delegation categories with the owner/admin.");
  }
  if (metrics.responseTimeP50 > 6 * 60 * 60 * 1000) {
    gaps.push("Median inbox response time exceeded six hours.");
    suggestions.push("Shorten check_in cadence while team work is active.");
  }
  if (metrics.autoDelegatedRatio >= 0.8 && metrics.approvalsRequested === 0) {
    suggestions.push("Autonomous delegation ratio is healthy; keep monitoring risk boundaries.");
  }

  suggestions.push(`Qualitative self-review routed through ${model}.`);

  return {
    gaps,
    suggestions,
  };
}

export async function collectAgentSelfAssessment(input: {
  agentId: string;
  communityId: string;
  periodDate?: Date;
}) {
  const { agent } = await resolveAgentCommunity(input);
  const bounds = getIsoWeekBounds(input.periodDate ?? new Date());
  const periodWhere = {
    gte: bounds.start,
    lt: bounds.end,
  };

  const [completedTasks, taskLogs, blockerLogs, inboxEvents] = await Promise.all([
    prisma.agentTask.count({
      where: {
        communityId: input.communityId,
        assigneeId: agent.agentId,
        status: "COMPLETED",
        updatedAt: periodWhere,
      },
    }),
    prisma.teamActivityLog.findMany({
      where: {
        communityId: input.communityId,
        actorId: agent.agentId,
        actorType: "AGENT",
        category: "task",
        createdAt: periodWhere,
      },
      select: { content: true },
    }),
    prisma.teamActivityLog.count({
      where: {
        communityId: input.communityId,
        actorId: agent.agentId,
        actorType: "AGENT",
        category: "blocker",
        createdAt: periodWhere,
      },
    }),
    prisma.inboxEvent.findMany({
      where: {
        agentId: agent.id,
        createdAt: periodWhere,
        deliveredAt: { not: null },
      },
      select: {
        createdAt: true,
        deliveredAt: true,
      },
    }),
  ]);

  const tasksAutoDelegated = taskLogs.filter((log) =>
    /^Task delegated to\b/i.test(log.content)
  ).length;
  const approvalsRequested = taskLogs.filter((log) =>
    /^Human approval requested\b/i.test(log.content)
  ).length;
  const responseTimes = inboxEvents
    .map((event) =>
      event.deliveredAt ? event.deliveredAt.getTime() - event.createdAt.getTime() : null
    )
    .filter((value): value is number => value !== null && value >= 0);
  const denominator = tasksAutoDelegated + approvalsRequested;
  const metrics: AgentAssessmentMetrics = {
    tasksCompleted: completedTasks,
    tasksAutoDelegated,
    approvalsRequested,
    blockersRaised: blockerLogs,
    responseTimeP50: p50(responseTimes),
    autoDelegatedRatio: denominator === 0 ? 0 : tasksAutoDelegated / denominator,
  };
  const model = await resolveModel("distillation");
  const qualitative = buildQualitativeAssessment(metrics, model);

  return prisma.agentSelfAssessment.upsert({
    where: {
      agentId_communityId_period: {
        agentId: agent.id,
        communityId: input.communityId,
        period: bounds.period,
      },
    },
    create: {
      agentId: agent.id,
      communityId: input.communityId,
      period: bounds.period,
      ...metrics,
      gaps: qualitative.gaps,
      suggestions: qualitative.suggestions,
    },
    update: {
      ...metrics,
      gaps: qualitative.gaps,
      suggestions: qualitative.suggestions,
    },
  });
}

export async function collectCommunitySelfAssessments(input: {
  communityId: string;
  periodDate?: Date;
}) {
  const members = await prisma.communityMember.findMany({
    where: {
      communityId: input.communityId,
      status: "ACTIVE",
      agentParticipationEnabled: true,
    },
    include: {
      owner: {
        include: { agent: true },
      },
    },
  });

  const assessments = [];
  for (const member of members) {
    if (!member.owner.agent) continue;
    assessments.push(
      await collectAgentSelfAssessment({
        agentId: member.owner.agent.id,
        communityId: input.communityId,
        periodDate: input.periodDate,
      })
    );
  }

  return assessments;
}

export const __test = {
  clampAutonomyPhase,
  buildQualitativeAssessment,
  compileInstructionText,
  p50,
};
