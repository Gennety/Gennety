import assert from "node:assert/strict";

type Row = Record<string, any>;

const previousNodeEnv = process.env.NODE_ENV;
Object.assign(process.env, { NODE_ENV: "test" });

function restoreEnv() {
  if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
  delete (globalThis as any).prisma;
}

function matchesScalar(value: any, condition: any): boolean {
  if (
    condition &&
    typeof condition === "object" &&
    !(condition instanceof Date) &&
    !Array.isArray(condition)
  ) {
    if ("in" in condition) return condition.in.includes(value);
    if ("not" in condition) return value !== condition.not;
    if ("gte" in condition && value < condition.gte) return false;
    if ("lt" in condition && value >= condition.lt) return false;
    if ("gte" in condition || "lt" in condition) return true;
    return Object.entries(condition).every(([key, nested]) => matchesScalar(value?.[key], nested));
  }
  return value === condition;
}

function matchesWhere(row: Row, where?: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Row[]).some((item) => matchesWhere(row, item));
    if (key === "AND") return (condition as Row[]).every((item) => matchesWhere(row, item));
    return matchesScalar(row[key], condition);
  });
}

function shapeSelected(row: Row | null | undefined, args?: Row): Row | null {
  if (!row) return null;
  if (!args?.select) return { ...row };
  return Object.fromEntries(
    Object.entries(args.select)
      .filter(([, enabled]) => enabled)
      .map(([key, enabled]) => {
        if (key === "agentRoleConfig" && typeof enabled === "object") {
          return [key, row.agentRoleConfig ?? null];
        }
        return [key, row[key]];
      })
  );
}

function createFakePrisma() {
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}_${++counter}`;
  const now = () => new Date(Date.UTC(2026, 4, 20, 10, counter, 0));

  const db = {
    agents: [
      {
        id: "agent_alpha_internal",
        agentId: "agent_alpha",
        ownerId: "owner_alpha",
        displayName: "Alpha Agent",
        isActive: true,
      },
    ] as Row[],
    communities: [
      {
        id: "community_collab",
        name: "Collaboration Hub",
        description: "Build the team runtime.",
        status: "ACTIVE",
        knowledgeSummary: "Last summary",
      },
    ] as Row[],
    communityMembers: [
      {
        id: "member_alpha",
        communityId: "community_collab",
        ownerId: "owner_alpha",
        role: "MEMBER",
        status: "ACTIVE",
        agentParticipationEnabled: true,
        hubSpecialization: "Team runtime",
        skillTags: ["typescript"],
      },
    ] as Row[],
    agentRoleConfigs: [
      {
        id: "role_config_alpha",
        memberId: "member_alpha",
        autonomyPhase: 2,
        customSoul: "Prioritize research notes before delegating implementation.",
        createdAt: new Date(Date.UTC(2026, 4, 20, 8, 0, 0)),
        updatedAt: new Date(Date.UTC(2026, 4, 20, 8, 0, 0)),
      },
    ] as Row[],
    strategySessions: [
      {
        id: "strategy_1",
        communityId: "community_collab",
        status: "COMPLETED",
        summary: "Focus on dynamic instructions and weekly assessment.",
        completedAt: new Date(Date.UTC(2026, 4, 19, 12, 0, 0)),
      },
    ] as Row[],
    actionProposals: [
      {
        id: "proposal_1",
        communityId: "community_collab",
        status: "PENDING",
        type: "WORKLOAD_REBALANCE",
        title: "Review task ownership",
        summary: "Rebalance agent work.",
        createdAt: new Date(Date.UTC(2026, 4, 19, 13, 0, 0)),
      },
    ] as Row[],
    teamActivityLogs: [
      {
        id: "activity_1",
        communityId: "community_collab",
        actorId: "agent_alpha",
        actorType: "AGENT",
        category: "task",
        content: "Task delegated to agent_beta: Draft TypeScript tests",
        createdAt: new Date(Date.UTC(2026, 4, 20, 9, 0, 0)),
      },
      {
        id: "activity_2",
        communityId: "community_collab",
        actorId: "agent_alpha",
        actorType: "AGENT",
        category: "task",
        content: "Human approval requested for task \"Deploy\": needs owner sign-off",
        createdAt: new Date(Date.UTC(2026, 4, 20, 9, 10, 0)),
      },
      {
        id: "activity_3",
        communityId: "community_collab",
        actorId: "agent_alpha",
        actorType: "AGENT",
        category: "blocker",
        content: "Blocked by unclear ownership.",
        createdAt: new Date(Date.UTC(2026, 4, 20, 9, 20, 0)),
      },
    ] as Row[],
    agentInstructions: [] as Row[],
    agentTasks: [
      {
        id: "task_1",
        communityId: "community_collab",
        assigneeId: "agent_alpha",
        status: "COMPLETED",
        updatedAt: new Date(Date.UTC(2026, 4, 20, 9, 30, 0)),
      },
    ] as Row[],
    inboxEvents: [
      {
        id: "inbox_1",
        agentId: "agent_alpha_internal",
        createdAt: new Date(Date.UTC(2026, 4, 20, 9, 0, 0)),
        deliveredAt: new Date(Date.UTC(2026, 4, 20, 9, 5, 0)),
      },
      {
        id: "inbox_2",
        agentId: "agent_alpha_internal",
        createdAt: new Date(Date.UTC(2026, 4, 20, 9, 30, 0)),
        deliveredAt: new Date(Date.UTC(2026, 4, 20, 9, 50, 0)),
      },
    ] as Row[],
    selfAssessments: [] as Row[],
  };

  const withRoleConfig = (member: Row) => ({
    ...member,
    agentRoleConfig:
      db.agentRoleConfigs.find((config) => config.memberId === member.id) ?? null,
  });

  return {
    __db: db,
    agent: {
      findFirst: async (args: Row) =>
        shapeSelected(
          db.agents.find((agent) =>
            args.where?.OR
              ? args.where.OR.some((condition: Row) => matchesWhere(agent, condition))
              : matchesWhere(agent, args.where)
          ) ?? null,
          args
        ),
    },
    community: {
      findUnique: async (args: Row) =>
        shapeSelected(db.communities.find((item) => item.id === args.where.id) ?? null, args),
    },
    communityMember: {
      findUnique: async (args: Row) => {
        const key = args.where.communityId_ownerId;
        const row = db.communityMembers.find(
          (member) => member.communityId === key.communityId && member.ownerId === key.ownerId
        );
        return shapeSelected(row ? withRoleConfig(row) : null, args);
      },
      findMany: async (args: Row) =>
        db.communityMembers
          .filter((member) => matchesWhere(member, args.where))
          .map((member) => ({
            ...withRoleConfig(member),
            owner: {
              id: member.ownerId,
              agent: db.agents.find((agent) => agent.ownerId === member.ownerId) ?? null,
            },
          })),
    },
    agentRoleConfig: {
      findUnique: async (args: Row) =>
        shapeSelected(
          db.agentRoleConfigs.find((config) => config.memberId === args.where.memberId) ?? null,
          args
        ),
      findUniqueOrThrow: async (args: Row) => {
        const row = db.agentRoleConfigs.find((config) => config.memberId === args.where.memberId);
        if (!row) throw new Error("AgentRoleConfig not found");
        return shapeSelected(row, args);
      },
      create: async (args: Row) => {
        const row = {
          id: nextId("role_config"),
          autonomyPhase: 1,
          customSoul: null,
          createdAt: now(),
          updatedAt: now(),
          ...args.data,
        };
        db.agentRoleConfigs.push(row);
        return shapeSelected(row, args);
      },
    },
    communityStrategySession: {
      findFirst: async (args: Row) =>
        shapeSelected(
          db.strategySessions.find((session) => matchesWhere(session, args.where)) ?? null,
          args
        ),
    },
    communityActionProposal: {
      findMany: async (args: Row) =>
        db.actionProposals
          .filter((proposal) => matchesWhere(proposal, args.where))
          .slice(0, args.take ?? db.actionProposals.length)
          .map((proposal) => shapeSelected(proposal, args)),
    },
    teamActivityLog: {
      findMany: async (args: Row) =>
        db.teamActivityLogs
          .filter((log) => matchesWhere(log, args.where))
          .slice(0, args.take ?? db.teamActivityLogs.length)
          .map((log) => shapeSelected(log, args)),
      count: async (args: Row) =>
        db.teamActivityLogs.filter((log) => matchesWhere(log, args.where)).length,
    },
    agentInstruction: {
      findUnique: async (args: Row) => {
        const key = args.where.agentId_communityId;
        return (
          db.agentInstructions.find(
            (item) => item.agentId === key.agentId && item.communityId === key.communityId
          ) ?? null
        );
      },
      upsert: async (args: Row) => {
        const key = args.where.agentId_communityId;
        let row = db.agentInstructions.find(
          (item) => item.agentId === key.agentId && item.communityId === key.communityId
        );
        if (!row) {
          const created: Row = {
            id: nextId("instruction"),
            ...args.create,
          };
          db.agentInstructions.push(created);
          row = created;
        } else {
          Object.assign(row, args.update);
        }
        return { ...row };
      },
      updateMany: async (args: Row) => {
        const rows = db.agentInstructions.filter((item) => matchesWhere(item, args.where));
        rows.forEach((row) => Object.assign(row, args.data));
        return { count: rows.length };
      },
    },
    agentTask: {
      count: async (args: Row) => db.agentTasks.filter((task) => matchesWhere(task, args.where)).length,
    },
    inboxEvent: {
      findMany: async (args: Row) =>
        db.inboxEvents
          .filter((event) => matchesWhere(event, args.where))
          .map((event) => shapeSelected(event, args)),
    },
    agentSelfAssessment: {
      upsert: async (args: Row) => {
        const key = args.where.agentId_communityId_period;
        let row = db.selfAssessments.find(
          (assessment) =>
            assessment.agentId === key.agentId &&
            assessment.communityId === key.communityId &&
            assessment.period === key.period
        );
        if (!row) {
          const created: Row = { id: nextId("assessment"), createdAt: now(), ...args.create };
          db.selfAssessments.push(created);
          row = created;
        } else {
          Object.assign(row, args.update);
        }
        return { ...row };
      },
    },
  };
}

async function main() {
  const prisma = createFakePrisma();
  (globalThis as any).prisma = prisma;

  const {
    collectAgentSelfAssessment,
    expireAgentInstructionCache,
    getAgentInstruction,
    getDelegationRightsForAutonomyPhase,
    getIsoWeekPeriod,
    inferDelegationRightFromTask,
  } = await import("../src/lib/services/team-framework");
  const { getMyInstructionsTool, __test: toolTest } = await import(
    "../src/lib/mcp/tools/get-my-instructions"
  );

  assert.deepEqual(getDelegationRightsForAutonomyPhase(1), []);
  assert.deepEqual(getDelegationRightsForAutonomyPhase(2), [
    "code_draft",
    "docs_write",
    "research",
  ]);
  assert.deepEqual(getDelegationRightsForAutonomyPhase(3), ["*"]);
  assert.equal(inferDelegationRightFromTask({ title: "Draft API tests" }), "code_draft");
  assert.equal(inferDelegationRightFromTask({ title: "Write README guide" }), "docs_write");
  assert.equal(inferDelegationRightFromTask({ title: "Research Linear adapters" }), "research");
  console.log("PASS: autonomy phases map to delegation rights");

  const generatedAt = new Date(Date.UTC(2026, 4, 20, 10, 0, 0));
  const first = await getAgentInstruction({
    agentId: "agent_alpha",
    communityId: "community_collab",
    now: generatedAt,
  });

  assert.equal(first.cached, false);
  assert.equal(first.autonomyPhase, 2);
  assert.ok(first.instruction.includes("Prioritize research notes"));
  assert.ok(first.instruction.includes("Focus on dynamic instructions"));
  assert.ok(first.instruction.includes("Delegation rights: code_draft, docs_write, research"));

  const second = await getAgentInstruction({
    agentId: "agent_alpha",
    communityId: "community_collab",
    now: new Date(generatedAt.getTime() + 60 * 60 * 1000),
  });
  assert.equal(second.cached, true);

  const expired = await expireAgentInstructionCache({ communityId: "community_collab" });
  assert.equal(expired.expired, 1);
  const third = await getAgentInstruction({
    agentId: "agent_alpha",
    communityId: "community_collab",
    now: new Date(generatedAt.getTime() + 2 * 60 * 60 * 1000),
  });
  assert.equal(third.cached, false);
  console.log("PASS: dynamic AgentInstruction compiles, caches, and expires");

  const assessment = await collectAgentSelfAssessment({
    agentId: "agent_alpha",
    communityId: "community_collab",
    periodDate: new Date(Date.UTC(2026, 4, 20, 12, 0, 0)),
  });
  assert.equal(assessment.period, getIsoWeekPeriod(new Date(Date.UTC(2026, 4, 20, 12, 0, 0))));
  assert.equal(assessment.tasksCompleted, 1);
  assert.equal(assessment.tasksAutoDelegated, 1);
  assert.equal(assessment.approvalsRequested, 1);
  assert.equal(assessment.blockersRaised, 1);
  assert.equal(assessment.responseTimeP50, 5 * 60 * 1000);
  assert.equal(assessment.autoDelegatedRatio, 0.5);
  assert.ok(assessment.gaps.some((gap: string) => gap.includes("blocker")));
  console.log("PASS: AgentSelfAssessment aggregates weekly task and inbox metrics");

  assert.equal(getMyInstructionsTool.name, "get_my_instructions");
  toolTest.GetMyInstructionsArgsSchema.parse({
    agentId: "agent_alpha",
    communityId: "community_collab",
  });
  console.log("PASS: get_my_instructions MCP schema is registered locally");

  console.log("\nAll team framework tests passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreEnv);
