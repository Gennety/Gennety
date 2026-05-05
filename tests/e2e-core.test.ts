/**
 * Core E2E verification harness.
 *
 * Run with:
 *   node --import tsx tests/e2e-core.test.ts
 *
 * This test is hermetic. It injects an in-memory Prisma-compatible fake
 * through src/lib/db.ts's global prisma reuse path, and intercepts OpenAI
 * embeddings through global fetch. No real DB, LLM API, mailer, webhook, or
 * .env value is used.
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";

type Row = Record<string, any>;

const previousOpenAIKey = process.env.OPENAI_API_KEY;
const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
const originalFetch = globalThis.fetch;
const originalSetInterval = globalThis.setInterval;

process.env.OPENAI_API_KEY = "test-openai-key";
delete process.env.ANTHROPIC_API_KEY;

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`PASS: ${label}`);
}

function embeddingFor(text: string) {
  const lower = text.toLowerCase();
  const keys = [
    "b2b",
    "onboarding",
    "distribution",
    "gtm",
    "activation",
    "mentor",
    "robotics",
    "market",
    "privacy",
    "ops",
  ];
  const vector: number[] = keys.map((key) => (lower.includes(key) ? 1 : 0));
  if (!vector.some((value) => value !== 0)) vector[0] = 0.25;
  return vector;
}

function cosine(a: number[] | null | undefined, b: number[] | null | undefined) {
  if (!a?.length || !b?.length) return 0;
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index++) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
}

function installNetworkGuards() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!url.includes("/embeddings")) {
      throw new Error(`Unexpected network call in hermetic E2E test: ${url}`);
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as { input?: unknown };
    const text = Array.isArray(body.input)
      ? body.input.join(" ")
      : typeof body.input === "string"
        ? body.input
        : "";

    return new Response(
      JSON.stringify({
        object: "list",
        model: "text-embedding-ada-002",
        data: [{ object: "embedding", index: 0, embedding: embeddingFor(text) }],
        usage: { prompt_tokens: 1, total_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
}

function installUnrefIntervalGuard() {
  globalThis.setInterval = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
    const timer = originalSetInterval(handler, timeout, ...args);
    if (typeof (timer as any).unref === "function") (timer as any).unref();
    return timer;
  }) as typeof setInterval;
}

function restoreGlobals() {
  globalThis.fetch = originalFetch;
  globalThis.setInterval = originalSetInterval;
  if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousOpenAIKey;
  if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
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
    if ("lt" in condition) return value < condition.lt;
    if ("lte" in condition) return value <= condition.lte;
    if ("gt" in condition) return value > condition.gt;
    if ("gte" in condition) return value >= condition.gte;
    return Object.entries(condition).every(([key, nested]) =>
      matchesScalar(value?.[key], nested)
    );
  }
  return value === condition;
}

function matchesWhere(row: Row, where?: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") {
      return (condition as Row[]).some((item) => matchesWhere(row, item));
    }
    return matchesScalar(row[key], condition);
  });
}

function createFakePrisma() {
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}_${++counter}`;
  const db = {
    owners: [] as Row[],
    agents: [] as Row[],
    agentContexts: [] as Row[],
    beacons: [] as Row[],
    matches: [] as Row[],
    chats: [] as Row[],
    messages: [] as Row[],
    negotiationLogs: [] as Row[],
    inboxEvents: [] as Row[],
    adviceSessions: [] as Row[],
    analyticsEvents: [] as Row[],
    computeUsage: [] as Row[],
  };

  const ownerById = (id: string) => db.owners.find((owner) => owner.id === id) ?? null;
  const agentById = (id: string) => db.agents.find((agent) => agent.id === id) ?? null;
  const contextByAgentId = (agentId: string) =>
    db.agentContexts.find((context) => context.agentId === agentId) ?? null;
  const chatByMatchId = (matchId: string) =>
    db.chats.find((chat) => chat.matchId === matchId) ?? null;
  const matchById = (id: string) => db.matches.find((match) => match.id === id) ?? null;

  function applyData(row: Row, data: Row) {
    for (const [key, value] of Object.entries(data ?? {})) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        "increment" in value
      ) {
        row[key] = (row[key] ?? 0) + Number(value.increment);
      } else {
        row[key] = value;
      }
    }
    return row;
  }

  function shapeAgent(agent: Row | null, options?: Row): Row | null {
    if (!agent) return null;
    if (options?.select) {
      return Object.fromEntries(
        Object.entries(options.select)
          .filter(([, enabled]) => enabled)
          .map(([key]) => [key, agent[key]])
      );
    }
    const shaped = { ...agent };
    if (options?.include?.owner) shaped.owner = ownerById(agent.ownerId);
    if (options?.include?.context) shaped.context = contextByAgentId(agent.id);
    return shaped;
  }

  function shapeSelected(row: Row | null, options?: Row): Row | null {
    if (!row) return null;
    if (!options?.select) return { ...row };
    return Object.fromEntries(
      Object.entries(options.select)
        .filter(([, enabled]) => enabled)
        .map(([key]) => [key, row[key]])
    );
  }

  function shapeMatch(match: Row | null, options?: Row): Row | null {
    if (!match) return null;
    const shaped = { ...match };
    if (options?.include?.agentA) {
      shaped.agentA = shapeAgent(agentById(match.agentAId), options.include.agentA);
    }
    if (options?.include?.agentB) {
      shaped.agentB = shapeAgent(agentById(match.agentBId), options.include.agentB);
    }
    if (options?.include?.chat) {
      shaped.chat = chatByMatchId(match.id);
    }
    return shaped;
  }

  function shapeChat(chat: Row | null, options?: Row): Row | null {
    if (!chat) return null;
    const shaped = { ...chat };
    if (options?.include?.match) {
      shaped.match = shapeMatch(matchById(chat.matchId), options.include.match);
    }
    if (options?.include?.messages) {
      shaped.messages = db.messages
        .filter((message) => message.chatId === chat.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((message) => ({ ...message }));
    }
    return shaped;
  }

  function seedAgent(args: {
    ownerId: string;
    ownerName: string;
    email: string;
    networkingGoal: string;
    agentId: string;
    internalId: string;
    apiKey: string;
    displayName: string;
  }) {
    const owner = {
      id: args.ownerId,
      email: args.email,
      name: args.ownerName,
      networkingGoal: args.networkingGoal,
      createdAt: new Date(),
      onboarded: true,
    };
    const agent = {
      id: args.internalId,
      agentId: args.agentId,
      ownerId: args.ownerId,
      apiKey: args.apiKey,
      isActive: true,
      searchPaused: false,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      displayName: args.displayName,
      reputationScore: 40,
      reputationAcceptanceRate: 0,
      reputationNegotiationRate: 0,
      reputationCompletedMatches: 0,
      totalProposedMatches: 0,
      totalInitiatedNegotiations: 0,
      totalAcceptedByOwner: 0,
      totalNegotiationsAgreed: 0,
      interactionCount: 0,
      wakeWebhookEnabled: false,
      webhookUrl: null,
      webhookToken: null,
      wakeStreamLastConnectedAt: null,
      wakeStreamLastSeenAt: null,
      wakeStreamLastDisconnectedAt: null,
      wakeStreamLastError: null,
    };
    db.owners.push(owner);
    db.agents.push(agent);
    return { owner, agent };
  }

  const prisma = {
    __db: db,
    __seedAgent: seedAgent,

    agent: {
      findUnique: async (args: Row) => {
        const where = args.where ?? {};
        const agent =
          ("id" in where && db.agents.find((item) => item.id === where.id)) ||
          ("agentId" in where && db.agents.find((item) => item.agentId === where.agentId)) ||
          ("apiKey" in where && db.agents.find((item) => item.apiKey === where.apiKey)) ||
          ("ownerId" in where && db.agents.find((item) => item.ownerId === where.ownerId)) ||
          null;
        return shapeAgent(agent, args);
      },
      update: async (args: Row) => {
        const agent = db.agents.find((item) => matchesWhere(item, args.where));
        if (!agent) throw new Error("Agent not found");
        applyData(agent, args.data);
        return shapeAgent(agent, args);
      },
    },

    agentContext: {
      findUnique: async (args: Row) => {
        const context =
          ("id" in args.where && db.agentContexts.find((item) => item.id === args.where.id)) ||
          ("agentId" in args.where &&
            db.agentContexts.find((item) => item.agentId === args.where.agentId)) ||
          null;
        return shapeSelected(context, args);
      },
      update: async (args: Row) => {
        const context = db.agentContexts.find((item) => matchesWhere(item, args.where));
        if (!context) throw new Error("AgentContext not found");
        applyData(context, args.data);
        context.updatedAt = new Date();
        return { ...context };
      },
      findMany: async (args: Row = {}) =>
        db.agentContexts
          .filter((context) => matchesWhere(context, args.where))
          .map((context) => {
            const shaped = { ...context };
            if (args.include?.agent) {
              shaped.agent = shapeAgent(agentById(context.agentId), args.include.agent);
            }
            return shaped;
          }),
    },

    beacon: {
      updateMany: async (args: Row) => {
        let count = 0;
        for (const beacon of db.beacons) {
          if (matchesWhere(beacon, args.where)) {
            applyData(beacon, args.data);
            count++;
          }
        }
        return { count };
      },
    },

    match: {
      findFirst: async (args: Row) => {
        const match = db.matches.find((item) => matchesWhere(item, args.where)) ?? null;
        return shapeMatch(match, args);
      },
      findUnique: async (args: Row) => {
        const match = db.matches.find((item) => item.id === args.where.id) ?? null;
        return shapeMatch(match, args);
      },
      create: async (args: Row) => {
        const match = {
          id: nextId("match"),
          confirmedByA: false,
          confirmedByB: false,
          isPublic: true,
          createdAt: new Date(),
          proposedAt: null,
          matchedAt: null,
          ...args.data,
        };
        db.matches.push(match);
        return { ...match };
      },
      update: async (args: Row) => {
        const match = db.matches.find((item) => item.id === args.where.id);
        if (!match) throw new Error("Match not found");
        applyData(match, args.data);
        return shapeMatch(match, args);
      },
      findMany: async (args: Row) =>
        db.matches
          .filter((match) => matchesWhere(match, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((match) => shapeMatch(match, args)),
    },

    negotiationLog: {
      create: async (args: Row) => {
        const row = { id: nextId("negotiation_log"), createdAt: new Date(), ...args.data };
        db.negotiationLogs.push(row);
        return { ...row };
      },
    },

    chat: {
      findUnique: async (args: Row) => {
        const where = args.where ?? {};
        const chat =
          ("id" in where && db.chats.find((item) => item.id === where.id)) ||
          ("matchId" in where && db.chats.find((item) => item.matchId === where.matchId)) ||
          null;
        return shapeChat(chat, args);
      },
      upsert: async (args: Row) => {
        let chat = db.chats.find((item) => item.matchId === args.where.matchId);
        if (!chat) {
          chat = {
            id: nextId("chat"),
            matchId: args.create.matchId,
            status: "OPEN",
            createdAt: new Date(),
          };
          db.chats.push(chat);
          const messages = args.create.messages?.createMany?.data ?? [];
          for (const message of messages) {
            db.messages.push({
              id: nextId("message"),
              chatId: chat.id,
              adviceSessionId: null,
              createdAt: new Date(),
              ...message,
            });
          }
        }
        return { ...chat };
      },
      update: async (args: Row) => {
        const chat = db.chats.find((item) => matchesWhere(item, args.where));
        if (!chat) throw new Error("Chat not found");
        const messages = args.data?.messages?.createMany?.data ?? [];
        for (const message of messages) {
          db.messages.push({
            id: nextId("message"),
            chatId: chat.id,
            adviceSessionId: null,
            createdAt: new Date(),
            ...message,
          });
        }
        return shapeChat(chat, args);
      },
    },

    message: {
      count: async (args: Row) =>
        db.messages.filter((message) => matchesWhere(message, args.where)).length,
      create: async (args: Row) => {
        const row = {
          id: nextId("message"),
          kind: "HUMAN",
          adviceSessionId: null,
          createdAt: new Date(),
          ...args.data,
        };
        db.messages.push(row);
        return { ...row };
      },
      createMany: async (args: Row) => {
        for (const data of args.data) {
          db.messages.push({
            id: nextId("message"),
            kind: "HUMAN",
            adviceSessionId: null,
            createdAt: new Date(),
            ...data,
          });
        }
        return { count: args.data.length };
      },
    },

    adviceSession: {
      findFirst: async (args: Row) => {
        const rows = db.adviceSessions
          .filter((session) => matchesWhere(session, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ? { ...rows[0] } : null;
      },
      create: async (args: Row) => {
        const row = {
          id: nextId("advice_session"),
          status: "PENDING",
          responderOwnerId: null,
          respondedAt: null,
          startedAt: null,
          completedAt: null,
          summary: null,
          recommendation: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        };
        db.adviceSessions.push(row);
        return { ...row };
      },
      findUnique: async (args: Row) => {
        const row = db.adviceSessions.find((session) => session.id === args.where.id);
        return row ? { ...row } : null;
      },
      updateMany: async (args: Row) => {
        let count = 0;
        for (const session of db.adviceSessions) {
          if (matchesWhere(session, args.where)) {
            applyData(session, args.data);
            session.updatedAt = new Date();
            count++;
          }
        }
        return { count };
      },
    },

    inboxEvent: {
      findFirst: async (args: Row) => {
        const rows = db.inboxEvents
          .filter((event) => matchesWhere(event, args.where))
          .sort((a, b) => {
            if (args.orderBy?.createdAt === "desc") {
              return b.createdAt.getTime() - a.createdAt.getTime();
            }
            return a.createdAt.getTime() - b.createdAt.getTime();
          });
        return rows[0] ? { ...rows[0] } : null;
      },
      create: async (args: Row) => {
        const row = {
          id: nextId("inbox_event"),
          createdAt: new Date(),
          deliveredAt: null,
          dismissedAt: null,
          ...args.data,
        };
        db.inboxEvents.push(row);
        return { ...row };
      },
      updateMany: async (args: Row) => {
        let count = 0;
        for (const event of db.inboxEvents) {
          if (matchesWhere(event, args.where)) {
            applyData(event, args.data);
            count++;
          }
        }
        return { count };
      },
    },

    analyticsEvent: {
      create: async (args: Row) => {
        const row = {
          id: nextId("analytics_event"),
          createdAt: args.data?.createdAt ?? new Date(),
          ...args.data,
        };
        db.analyticsEvents.push(row);
        return { ...row };
      },
    },

    computeUsage: {
      create: async (args: Row) => {
        const row = {
          id: nextId("compute_usage"),
          createdAt: args.data?.createdAt ?? new Date(),
          ...args.data,
        };
        db.computeUsage.push(row);
        return { ...row };
      },
    },

    $transaction: async (callback: (tx: any) => Promise<any>) => callback(prisma),

    $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join("?");
      if (sql.includes("INSERT INTO agent_contexts")) {
        const agentId = values[1];
        let context = db.agentContexts.find((item) => item.agentId === agentId);
        if (!context) {
          context = {
            id: values[0],
            agentId,
            freshnessState: "ACTIVE",
            lastSignificantUpdateAt: new Date(),
            updatedAt: new Date(),
          };
          db.agentContexts.push(context);
        }
        Object.assign(context, {
          ownerName: values[2],
          ownerLocation: values[3],
          ownerProfession: values[4],
          ownerDomain: values[5],
          ownerExperience: values[6],
          ownerGoals: values[7],
          agentSpecialization: values[8],
          agentDomains: values[9] ?? [],
          agentConstraints: values[10],
          collaborationStyle: values[11],
          communicationStyle: values[12],
          currentWork: values[13],
          expertise: values[14],
          lookingFor: values[15],
          notLookingFor: values[16],
          recentProblems: values[17],
          recentWins: values[18],
          location: values[19],
          networkingGoal: values[20],
          embedding: values[21],
          previousHash: values[22],
          updatedAt: new Date(),
        });
        return 1;
      }

      if (sql.includes("INSERT INTO beacons")) {
        db.beacons.push({
          id: values[0],
          agentId: values[1],
          contextQuery: values[2],
          networkingGoalFilter: values[3],
          embedding: values[4],
          isActive: true,
          preservable: true,
          createdAt: new Date(),
          triggeredAt: null,
        });
        return 1;
      }

      throw new Error(`Unexpected executeRaw query in E2E fake: ${sql}`);
    },

    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join("?");

      if (sql.includes("FROM beacons b")) {
        const publishingAgentId = values[0];
        const effectiveGoal = values[1];
        const embedding = values[2];
        return db.beacons
          .filter(
            (beacon) =>
              beacon.isActive &&
              !beacon.triggeredAt &&
              agentById(beacon.agentId)?.searchPaused !== true &&
              beacon.agentId !== publishingAgentId &&
              (!beacon.networkingGoalFilter || beacon.networkingGoalFilter === effectiveGoal)
          )
          .map((beacon) => ({
            beacon,
            similarity: cosine(beacon.embedding, embedding),
          }))
          .filter(({ similarity }) => similarity > 0.75)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 10)
          .map(({ beacon }) => ({
            id: beacon.id,
            agent_id: beacon.agentId,
            owner_id: agentById(beacon.agentId)?.ownerId,
            context_query: beacon.contextQuery,
          }));
      }

      if (sql.includes("FROM agent_contexts ac") && sql.includes("a.reputation_score")) {
        const queryEmbedding = values[0];
        const seekerAgentId = values[1];
        const livenessCutoff = values[2];
        const minSimilarity = Number(values[4]);
        const limit = Number(values[5]);
        return db.agentContexts
          .filter((context) => context.agentId !== seekerAgentId)
          .map((context) => {
            const agent = agentById(context.agentId)!;
            return { context, agent, similarity: cosine(context.embedding, queryEmbedding) };
          })
          .filter(
            ({ context, agent, similarity }) =>
              agent.isActive &&
              agent.searchPaused !== true &&
              context.embedding &&
              !["STALE", "INACTIVE"].includes(context.freshnessState) &&
              agent.lastActiveAt > livenessCutoff &&
              similarity > minSimilarity
          )
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit)
          .map(({ context, agent, similarity }) => ({
            agent_id: context.agentId,
            external_agent_id: agent.agentId,
            similarity,
            current_work: context.currentWork,
            expertise: context.expertise,
            looking_for: context.lookingFor,
            networking_goal: context.networkingGoal,
            location: context.location,
            owner_profession: context.ownerProfession,
            owner_domain: context.ownerDomain,
            agent_specialization: context.agentSpecialization,
            freshness_state: context.freshnessState,
            reputation_score: agent.reputationScore,
            last_active_at: agent.lastActiveAt,
          }));
      }

      if (sql.includes("SELECT (1 - (a.embedding <=> b.embedding)) AS similarity")) {
        const targetAgentId = values[0];
        const initiatorAgentId = values[1];
        const targetContext = contextByAgentId(targetAgentId);
        const initiatorContext = contextByAgentId(initiatorAgentId);
        if (!targetContext?.embedding || !initiatorContext?.embedding) {
          return [{ similarity: null }];
        }
        return [{ similarity: cosine(initiatorContext.embedding, targetContext.embedding) }];
      }

      if (sql.includes("FROM agent_contexts ac")) {
        const beaconEmbedding = values[0];
        const settingAgentId = values[1];
        const goalFilter = values[2] ?? null;
        return db.agentContexts
          .filter((context) => context.agentId !== settingAgentId)
          .map((context) => {
            const agent = agentById(context.agentId)!;
            return { context, agent, similarity: cosine(context.embedding, beaconEmbedding) };
          })
          .filter(
            ({ context, agent, similarity }) =>
              agent.isActive &&
              agent.searchPaused !== true &&
              context.embedding &&
              (!goalFilter || context.networkingGoal === goalFilter) &&
              similarity > 0.75
          )
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5)
          .map(({ context, agent, similarity }) => ({
            agent_id: context.agentId,
            external_agent_id: agent.agentId,
            similarity,
            current_work: context.currentWork,
          }));
      }

      throw new Error(`Unexpected queryRaw query in E2E fake: ${sql}`);
    },
  };

  return prisma;
}

async function responseJson(response: Response) {
  return response.json() as Promise<Row>;
}

async function main() {
  installNetworkGuards();
  installUnrefIntervalGuard();

  const prisma = createFakePrisma();
  (globalThis as any).prisma = prisma;

  const alpha = prisma.__seedAgent({
    ownerId: "owner_alpha_e2e",
    ownerName: "Alpha Owner",
    email: "alpha.e2e@gennety.test",
    networkingGoal: "partnership",
    agentId: "agent_alpha_e2e",
    internalId: "agent_alpha_internal",
    apiKey: "gny_alpha_e2e",
    displayName: "Alpha",
  });
  const bravo = prisma.__seedAgent({
    ownerId: "owner_bravo_e2e",
    ownerName: "Bravo Owner",
    email: "bravo.e2e@gennety.test",
    networkingGoal: "partnership",
    agentId: "agent_bravo_e2e",
    internalId: "agent_bravo_internal",
    apiKey: "gny_bravo_e2e",
    displayName: "Bravo",
  });
  const charlie = prisma.__seedAgent({
    ownerId: "owner_charlie_e2e",
    ownerName: "Charlie Owner",
    email: "charlie.e2e@gennety.test",
    networkingGoal: "mentor",
    agentId: "agent_charlie_e2e",
    internalId: "agent_charlie_internal",
    apiKey: "gny_charlie_e2e",
    displayName: "Charlie",
  });
  const delta = prisma.__seedAgent({
    ownerId: "owner_delta_e2e",
    ownerName: "Delta Owner",
    email: "delta.e2e@gennety.test",
    networkingGoal: "partnership",
    agentId: "agent_delta_e2e",
    internalId: "agent_delta_internal",
    apiKey: "gny_delta_e2e",
    displayName: "Delta",
  });

  const { publishContext } = await import("../src/lib/services/context-index");
  const { findMatches } = await import("../src/lib/services/match-engine");
  const { setBeacon } = await import("../src/lib/services/beacon");
  const {
    initiateNegotiation,
    negotiate,
    proposeMatch,
    confirmMatch,
    markDormant,
  } = await import("../src/lib/services/negotiation");
  const {
    requestModelAdvice,
    respondToModelAdvice,
    cancelModelAdviceSession,
  } = await import("../src/lib/services/model-advice");
  const { POST: mcpPost } = await import("../src/app/api/mcp/route");

  {
    const publishedAlpha = await publishContext("agent_alpha_e2e", {
      owner_profession: "B2B SaaS product lead",
      owner_domain: "activation",
      current_work: "Building B2B onboarding intelligence for sales-led SaaS",
      expertise: ["product", "activation"],
      looking_for: "A distribution partner who runs GTM experiments",
      not_looking_for: "Generic AI founder chats",
      recent_problems: "Weak handoff from product onboarding to sales follow-up",
      recent_wins: "Shipped a retention dashboard",
      networking_goal: "partnership",
    });

    assert.equal(publishedAlpha.published, true);
    assert.equal(publishedAlpha.contextChanged, true);
    assert.equal(prisma.__db.agentContexts.length, 1);

    const emptyMatches = await findMatches("agent_alpha_e2e", {
      minSimilarity: 0.1,
      limit: 5,
    });
    assert.deepEqual(emptyMatches, []);

    const beacon = await setBeacon(
      "agent_alpha_e2e",
      "GTM distribution operator for B2B onboarding",
      "partnership"
    );
    assert.equal(beacon.isActive, true);
    assert.deepEqual(beacon.immediateMatches, []);

    const publishedBravo = await publishContext("agent_bravo_e2e", {
      owner_profession: "GTM operator",
      owner_domain: "distribution",
      current_work: "Running GTM distribution experiments for B2B onboarding teams",
      expertise: ["distribution", "gtm"],
      looking_for: "A product partner with activation data",
      recent_problems: "Need sharper onboarding signal before scaling outbound",
      networking_goal: "partnership",
    });
    assert.equal(publishedBravo.beaconsTriggered, 1);
    assert.ok(prisma.__db.beacons[0].triggeredAt instanceof Date);

    await publishContext("agent_charlie_e2e", {
      owner_profession: "B2B SaaS mentor",
      owner_domain: "activation",
      current_work: "Mentoring teams on B2B onboarding and GTM activation",
      expertise: ["mentor", "activation"],
      looking_for: "Mentees who need GTM coaching",
      networking_goal: "mentor",
    });

    const matches = await findMatches("agent_alpha_e2e", {
      minSimilarity: 0.1,
      limit: 5,
    });
    assert.equal(matches[0]?.agentExternalId, "agent_bravo_e2e");
    assert.equal(
      matches.some((match) => match.agentExternalId === "agent_charlie_e2e"),
      false,
      "incompatible mentor goal must be filtered out"
    );
    assert.equal("ownerName" in matches[0], false);
    assert.equal("recentWins" in matches[0], false);
    assert.equal("notLookingFor" in matches[0], false);

    ok("context publish -> beacon trigger -> goal-filtered search stays hermetic");
  }

  let matchedMatchId = "";
  let matchedChatId = "";

  {
    const started = await initiateNegotiation(
      "agent_alpha_e2e",
      "agent_bravo_e2e",
      "Alpha has product-side activation data; Bravo has distribution-side GTM loops."
    );
    matchedMatchId = started.matchId;
    assert.equal(started.status, "NEGOTIATING");
    assert.equal(prisma.__db.matches.length, 1);
    assert.equal(prisma.__db.negotiationLogs.length, 1);

    await assert.rejects(
      () => proposeMatch(matchedMatchId),
      /Cannot propose: both agents must explicitly accept/
    );

    const overlap =
      "Alpha has product-side onboarding signal while Bravo has GTM distribution loops for the same B2B activation problem.";
    await negotiate(
      matchedMatchId,
      "agent_alpha_e2e",
      "accept",
      overlap,
      "Bravo can pressure-test Alpha's activation data against real distribution motion.",
      "The overlap is specific and not competitive."
    );
    await negotiate(
      matchedMatchId,
      "agent_bravo_e2e",
      "accept",
      overlap,
      "Alpha can give Bravo product telemetry that sharpens outbound targeting.",
      "The product/distribution split creates a real collaboration."
    );

    const proposed = await proposeMatch(matchedMatchId);
    assert.equal(proposed.status, "PROPOSED");
    assert.equal(
      prisma.__db.inboxEvents.filter((event) => event.type === "MATCH_PROPOSED").length,
      2
    );

    const firstConfirm = await confirmMatch(matchedMatchId, alpha.owner.id);
    assert.equal(firstConfirm.status, "PROPOSED");
    assert.equal(firstConfirm.bothConfirmed, false);

    const duplicateConfirm = await confirmMatch(matchedMatchId, alpha.owner.id);
    assert.equal(duplicateConfirm.status, "PROPOSED");
    assert.equal(prisma.__db.chats.length, 0);

    const finalConfirm = await confirmMatch(matchedMatchId, bravo.owner.id);
    assert.equal(finalConfirm.status, "MATCHED");
    assert.equal(finalConfirm.bothConfirmed, true);
    assert.ok(finalConfirm.chatId);
    matchedChatId = finalConfirm.chatId;

    const introMessages = prisma.__db.messages.filter(
      (message) => message.chatId === matchedChatId && message.kind === "AGENT_INTRO"
    );
    assert.equal(prisma.__db.chats.length, 1);
    assert.equal(introMessages.length, 2);
    assert.equal(prisma.__db.matches[0].status, "MATCHED");
    assert.equal(
      prisma.__db.inboxEvents.filter((event) => event.type === "MATCH_CONFIRMED").length,
      2
    );

    const afterMatchedDuplicate = await confirmMatch(matchedMatchId, bravo.owner.id);
    assert.equal(afterMatchedDuplicate.chatId, matchedChatId);
    assert.equal(
      prisma.__db.messages.filter((message) => message.kind === "AGENT_INTRO").length,
      2,
      "duplicate confirmations must not duplicate opening messages"
    );

    ok("negotiation -> proposal -> mutual confirmation opens exactly one chat");
  }

  {
    await publishContext("agent_delta_e2e", {
      owner_profession: "Distribution strategist",
      owner_domain: "gtm",
      current_work: "Building GTM ops playbooks for B2B onboarding products",
      expertise: ["gtm", "ops"],
      looking_for: "A product partner with B2B onboarding telemetry",
      networking_goal: "partnership",
    });

    await assert.rejects(
      () => initiateNegotiation("agent_alpha_e2e", "agent_alpha_e2e"),
      /Cannot initiate negotiation with yourself/
    );
    await assert.rejects(
      () => initiateNegotiation("agent_alpha_e2e", "agent_charlie_e2e"),
      /Incompatible networking goals/
    );

    const second = await initiateNegotiation("agent_alpha_e2e", "agent_delta_e2e");
    const overlap =
      "Alpha's activation data and Delta's GTM ops playbooks meet around B2B onboarding conversion.";
    await negotiate(
      second.matchId,
      "agent_alpha_e2e",
      "accept",
      overlap,
      "Delta can turn Alpha's onboarding telemetry into an ops playbook."
    );
    await negotiate(
      second.matchId,
      "agent_delta_e2e",
      "accept",
      overlap,
      "Alpha can validate Delta's GTM playbook with product-side evidence."
    );
    await proposeMatch(second.matchId);

    await assert.rejects(
      () => confirmMatch(second.matchId, "owner_outsider_e2e"),
      /not part of this match/
    );

    const dormant = await markDormant(second.matchId, delta.owner.id);
    assert.equal(dormant.status, "DORMANT");
    assert.equal(
      prisma.__db.chats.some((chat) => chat.matchId === second.matchId),
      false,
      "dormant matches must not open chat"
    );
    await assert.rejects(
      () => confirmMatch(second.matchId, alpha.owner.id),
      /PROPOSED state/
    );

    ok("RBAC, malformed lifecycle actions, and dormant path reject unsafe state changes");
  }

  {
    await prisma.message.create({
      data: {
        chatId: matchedChatId,
        fromOwner: alpha.owner.id,
        kind: "HUMAN",
        content: "I can share activation cohorts from our latest onboarding tests.",
      },
    });
    await prisma.message.create({
      data: {
        chatId: matchedChatId,
        fromOwner: bravo.owner.id,
        kind: "HUMAN",
        content: "I can map those cohorts to outbound segments and test channels.",
      },
    });
    await prisma.message.create({
      data: {
        chatId: matchedChatId,
        fromOwner: alpha.owner.id,
        kind: "HUMAN",
        content: "The hard part is identifying high-intent accounts early enough.",
      },
    });
    await prisma.message.create({
      data: {
        chatId: matchedChatId,
        fromOwner: bravo.owner.id,
        kind: "HUMAN",
        content: "Then the useful next step is a small channel test tied to activation.",
      },
    });

    const pending = await requestModelAdvice({
      matchId: matchedMatchId,
      requesterOwnerId: alpha.owner.id,
      promptKey: "fit_check",
    });
    assert.equal(pending.status, "PENDING");
    assert.equal(
      prisma.__db.messages.some((message) => message.kind === "MODEL_ADVICE_REQUEST"),
      true
    );

    await assert.rejects(
      () =>
        respondToModelAdvice({
          sessionId: pending.id,
          ownerId: alpha.owner.id,
          action: "approve",
        }),
      /already requested/
    );

    const completed = await respondToModelAdvice({
      sessionId: pending.id,
      ownerId: bravo.owner.id,
      action: "approve",
    });
    assert.equal(completed?.status, "COMPLETED");
    assert.equal(
      prisma.__db.messages.filter((message) => message.kind === "MODEL_ADVICE_AGENT").length,
      4
    );
    assert.equal(
      prisma.__db.messages.filter((message) => message.kind === "MODEL_ADVICE_RESULT").length,
      1
    );

    const pendingToCancel = await requestModelAdvice({
      matchId: matchedMatchId,
      requesterOwnerId: bravo.owner.id,
      promptKey: "next_step",
    });
    await assert.rejects(
      () =>
        requestModelAdvice({
          matchId: matchedMatchId,
          requesterOwnerId: alpha.owner.id,
          promptKey: "reframe",
        }),
      /already running/
    );
    const cancelled = await cancelModelAdviceSession({
      sessionId: pendingToCancel.id,
      ownerId: alpha.owner.id,
    });
    assert.equal(cancelled?.status, "CANCELLED");

    ok("model advice requires counterparty approval, completes visibly, and gates live sessions");
  }

  {
    const unauth = await mcpPost(
      new NextRequest("http://localhost/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      })
    );
    assert.equal(unauth.status, 401);
    assert.equal((await responseJson(unauth)).error.message, "Unauthorized: invalid API key");

    const listResponse = await mcpPost(
      new NextRequest("http://localhost/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer gny_alpha_e2e" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 2 }),
      })
    );
    assert.equal(listResponse.status, 200);
    const listBody = await responseJson(listResponse);
    assert.ok(
      listBody.result.tools.some((tool: Row) => tool.name === "publish_context"),
      "MCP tools/list should expose publish_context"
    );

    const mismatchResponse = await mcpPost(
      new NextRequest("http://localhost/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer gny_alpha_e2e" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "set_beacon",
            arguments: {
              agent_id: "agent_bravo_e2e",
              context_query: "identity mismatch should not run",
            },
          },
          id: 3,
        }),
      })
    );
    assert.equal(mismatchResponse.status, 200);
    const mismatchBody = await responseJson(mismatchResponse);
    assert.equal(mismatchBody.result.isError, true);
    assert.match(mismatchBody.result.content[0].text, /Identity mismatch/);

    ok("MCP API returns structured JSON-RPC envelopes for auth, discovery, and RBAC errors");
  }

  assert.equal(
    prisma.__db.owners.filter((owner: Row) => owner.email.endsWith("@gennety.test")).length,
    4
  );
  assert.equal(prisma.__db.beacons.length, 1);
  assert.equal(prisma.__db.chats.length, 1);
  assert.equal(
    prisma.__db.adviceSessions.every((session: Row) =>
      ["COMPLETED", "CANCELLED"].includes(session.status)
    ),
    true
  );

  console.log(`\nAll ${passed} core E2E journeys passed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    restoreGlobals();
  });
