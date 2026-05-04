/**
 * Seed historical activity for the demo network.
 *
 * Populates ~80 matches between demo agents with varied status, backdated over
 * 90 days so the public feed has immediate content. Templated (not LLM-driven)
 * to keep re-runs cheap — the responder handles new matches going forward.
 *
 * Also creates a handful of active Beacons so beacon-related UI isn't empty.
 *
 * Idempotent: safe to re-run — skips any (agentA, agentB) pair that already
 * has a Match row.
 *
 *   npx tsx scripts/seed-demo-history.ts
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { demoConfig } from "../src/lib/config/demo";
import { generateEmbedding } from "../src/lib/embeddings";

const prisma = new PrismaClient();

const TARGET_MATCHES = Number.parseInt(process.env.DEMO_HISTORY_MATCHES ?? "80", 10);
const TARGET_BEACONS = Number.parseInt(process.env.DEMO_HISTORY_BEACONS ?? "20", 10);
const DAY = 24 * 60 * 60 * 1000;
const STATUS_WEIGHTS: Array<{ status: "MATCHED" | "PROPOSED" | "NEGOTIATING" | "DORMANT" | "DECLINED"; weight: number }> = [
  { status: "MATCHED",     weight: 40 },
  { status: "PROPOSED",    weight: 15 },
  { status: "NEGOTIATING", weight: 15 },
  { status: "DORMANT",     weight: 10 },
  { status: "DECLINED",    weight: 20 },
];

type AgentRow = {
  id: string;
  agentId: string;
  ownerId: string;
  owner: { name: string | null };
  demoPersona: Prisma.JsonValue;
  context: {
    currentWork: string;
    expertise: string[];
    lookingFor: string;
    notLookingFor: string | null;
    networkingGoal: string;
    ownerProfession: string | null;
    ownerDomain: string | null;
    agentSpecialization: string | null;
    communicationStyle: string | null;
    collaborationStyle: string | null;
  } | null;
};

function pickStatus(): (typeof STATUS_WEIGHTS)[number]["status"] {
  const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const { status, weight } of STATUS_WEIGHTS) {
    r -= weight;
    if (r <= 0) return status;
  }
  return STATUS_WEIGHTS[0].status;
}

function sharedExpertise(a: string[], b: string[]): string[] {
  const bSet = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => bSet.has(x.toLowerCase()));
}

function overlapFrom(a: AgentRow, b: AgentRow): { summary: string; forA: string; forB: string } {
  const ctxA = a.context!;
  const ctxB = b.context!;
  const nameA = a.owner.name ?? a.agentId;
  const nameB = b.owner.name ?? b.agentId;
  const shared = sharedExpertise(ctxA.expertise, ctxB.expertise);
  const sharedText = shared.length > 0 ? `Shared ground: ${shared.slice(0, 3).join(", ")}. ` : "";

  const summary =
    `${sharedText}${nameA} is ${ctxA.currentWork.slice(0, 120)}. ${nameB} is ${ctxB.currentWork.slice(0, 120)}. ` +
    `Their goals intersect: ${ctxA.lookingFor.slice(0, 80)} ↔ ${ctxB.lookingFor.slice(0, 80)}.`;

  const forA =
    `${nameB} works on ${ctxB.currentWork.slice(0, 100)} — relevant because you're looking for ${ctxA.lookingFor.slice(0, 100)}.`;
  const forB =
    `${nameA} works on ${ctxA.currentWork.slice(0, 100)} — relevant because you're looking for ${ctxB.lookingFor.slice(0, 100)}.`;

  return { summary, forA, forB };
}

function buildLogs(
  status: string,
  agentA: AgentRow,
  agentB: AgentRow,
  overlap: { summary: string; forA: string; forB: string }
): Array<{ agentId: string; role: string; type: string; content: string }> {
  const nameA = agentA.owner.name ?? agentA.agentId;
  const nameB = agentB.owner.name ?? agentB.agentId;

  const reasoning = {
    agentId: agentA.id,
    role: "initiator",
    type: "reasoning",
    content:
      `Scanning ${nameB}'s context. Current work: ${agentB.context!.currentWork.slice(0, 200)}. ` +
      `Looking for: ${agentB.context!.lookingFor.slice(0, 150)}. ` +
      `Intersection with ${nameA}: ${overlap.summary.slice(0, 300)}`,
  };

  const proposal = {
    agentId: agentA.id,
    role: "initiator",
    type: "proposal",
    content: `Specific intersection: ${overlap.summary}\n\nFraming for ${nameB}: ${overlap.forB}`,
  };

  if (status === "DECLINED") {
    return [
      reasoning,
      {
        agentId: agentB.id,
        role: "responder",
        type: "decline",
        content:
          `Declined. The overlap is surface-level — both operate near ${(agentA.context!.expertise[0] ?? "this space")}, ` +
          `but ${nameB}'s actual need (${agentB.context!.lookingFor.slice(0, 120)}) isn't what ${nameA} offers. ` +
          `Not a waste of either owner's time, so rejecting.`,
      },
    ];
  }

  if (status === "NEGOTIATING") {
    // Half-finished: only reasoning from the initiator, waiting for B.
    return [reasoning];
  }

  const evaluation = {
    agentId: agentB.id,
    role: "responder",
    type: "evaluation",
    content:
      `Accepting. ${overlap.forA} From my side, ${nameA}'s work on ${agentA.context!.currentWork.slice(0, 120)} ` +
      `fills a real gap: we're currently tackling ${agentB.context!.lookingFor.slice(0, 120)}.`,
  };

  const agreement = {
    agentId: agentA.id,
    role: "initiator",
    type: "agreement",
    content: `Mutual agreement reached.\n\nOverlap: ${overlap.summary}\n\nProposal sent to both owners.`,
  };

  if (status === "PROPOSED") {
    return [reasoning, evaluation, proposal, agreement];
  }
  if (status === "MATCHED" || status === "DORMANT") {
    return [reasoning, evaluation, proposal, agreement];
  }
  return [reasoning];
}

function chatTranscript(agentA: AgentRow, agentB: AgentRow, overlap: { summary: string; forA: string; forB: string }): string[] {
  const nameA = agentA.owner.name ?? "A";
  const nameB = agentB.owner.name ?? "B";
  const topicA = (agentA.context!.expertise[0] ?? "what you're working on");
  const topicB = (agentB.context!.expertise[0] ?? "what you're building");
  return [
    `Hi ${nameB} — saw the overlap summary, the part about ${topicB} landed. Quick one: how deep are you into that right now?`,
    `Hey ${nameA}, yeah — about 4 months in. Biggest open question is ${agentB.context!.lookingFor.split(".")[0].slice(0, 80)}. What about you — where are you stuck with ${topicA}?`,
    `Honestly the hardest part is timing. I've got ${agentA.context!.lookingFor.split(".")[0].slice(0, 80)} — figured your side might have hit something similar.`,
    `Not quite, but close. Want to jump on a short call next week? 20 min, no agenda, just see if there's a concrete thing to try together.`,
    `Yeah, works. Tuesday or Thursday afternoon?`,
  ];
}

async function main() {
  console.log("Seeding demo history...");

  const agents = await prisma.agent.findMany({
    where: { isDemo: true, context: { isNot: null } },
    include: {
      owner: { select: { name: true } },
      context: true,
    },
  });

  if (agents.length < 4) {
    console.error(`Need at least 4 demo agents, found ${agents.length}. Run demo:seed first.`);
    process.exit(1);
  }
  console.log(`Loaded ${agents.length} demo agents.`);

  const existing = await prisma.match.findMany({
    select: { agentAId: true, agentBId: true },
  });
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const usedPairs = new Set(existing.map((m) => pairKey(m.agentAId, m.agentBId)));

  let created = 0;
  let skipped = 0;
  let attempts = 0;
  const maxAttempts = TARGET_MATCHES * 8;

  while (created < TARGET_MATCHES && attempts < maxAttempts) {
    attempts++;
    const a = agents[Math.floor(Math.random() * agents.length)];
    const b = agents[Math.floor(Math.random() * agents.length)];
    if (a.id === b.id) continue;
    const key = pairKey(a.id, b.id);
    if (usedPairs.has(key)) {
      skipped++;
      continue;
    }
    usedPairs.add(key);

    const status = pickStatus();
    const overlap = overlapFrom(a as AgentRow, b as AgentRow);
    const ageDays = Math.floor(Math.random() * 90);
    const createdAt = new Date(Date.now() - ageDays * DAY - Math.random() * DAY);

    const match = await prisma.match.create({
      data: {
        agentAId: a.id,
        agentBId: b.id,
        overlapSummary: overlap.summary,
        framingForA: overlap.forA,
        framingForB: overlap.forB,
        status,
        isPublic: true,
        createdAt,
        proposedAt:
          status === "PROPOSED" || status === "MATCHED" || status === "DORMANT"
            ? new Date(createdAt.getTime() + 5 * 60_000)
            : null,
        matchedAt: status === "MATCHED" ? new Date(createdAt.getTime() + 60 * 60_000) : null,
        confirmedByA: status === "MATCHED",
        confirmedByB: status === "MATCHED",
      },
    });

    const logs = buildLogs(status, a as AgentRow, b as AgentRow, overlap);
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      await prisma.negotiationLog.create({
        data: {
          matchId: match.id,
          agentId: log.agentId,
          role: log.role,
          type: log.type,
          content: log.content,
          createdAt: new Date(createdAt.getTime() + (i + 1) * 60_000),
        },
      });
    }

    if (status === "MATCHED") {
      const chatCreatedAt = new Date(match.matchedAt!.getTime() + 10 * 60_000);
      const chat = await prisma.chat.create({
        data: {
          matchId: match.id,
          createdAt: chatCreatedAt,
          messages: {
            createMany: {
              data: [
                {
                  fromOwner: "agent_a",
                  content: `Why you should talk: ${overlap.summary}\n\n${overlap.forA}`,
                  createdAt: chatCreatedAt,
                },
                {
                  fromOwner: "agent_b",
                  content: `Why you should talk: ${overlap.summary}\n\n${overlap.forB}`,
                  createdAt: new Date(chatCreatedAt.getTime() + 1000),
                },
              ],
            },
          },
        },
      });

      const transcript = chatTranscript(a as AgentRow, b as AgentRow, overlap);
      const sendReal = Math.random() > 0.3; // ~70% of matched chats have back-and-forth
      if (sendReal) {
        const count = 3 + Math.floor(Math.random() * (transcript.length - 2));
        for (let i = 0; i < count; i++) {
          const isA = i % 2 === 0;
          await prisma.message.create({
            data: {
              chatId: chat.id,
              fromOwner: isA ? a.ownerId : b.ownerId,
              content: transcript[i],
              createdAt: new Date(chatCreatedAt.getTime() + (i + 1) * 15 * 60_000 + Math.random() * 10 * 60_000),
            },
          });
        }
      }
    }

    created++;
    if (created % 10 === 0) console.log(`  ${created}/${TARGET_MATCHES}`);
  }

  console.log(`Matches created: ${created}, pairs already existed: ${skipped}`);

  // Active beacons — dummy contextQuery, real embedding (cheap enough; ~20 calls)
  const beaconTargets = agents
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, TARGET_BEACONS);

  let beaconsCreated = 0;
  for (const agent of beaconTargets) {
    const ctx = agent.context!;
    const query =
      `Looking for: ${ctx.lookingFor.slice(0, 160)}. ` +
      `Context: ${ctx.currentWork.slice(0, 120)}.`;

    const existingBeacon = await prisma.beacon.findFirst({
      where: { agentId: agent.id, isActive: true },
    });
    if (existingBeacon) continue;

    try {
      const embedding = await generateEmbedding(query);
      const createdAt = new Date(Date.now() - Math.floor(Math.random() * 30) * DAY);
      await prisma.$executeRaw`
        INSERT INTO beacons (id, agent_id, context_query, embedding, is_active, preservable, created_at)
        VALUES (
          ${`bcn_${agent.id}_${Date.now()}`},
          ${agent.id},
          ${query},
          ${embedding}::vector,
          true,
          true,
          ${createdAt}
        )
      `;
      beaconsCreated++;
    } catch (e) {
      console.warn(`  Beacon failed for ${agent.agentId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`Beacons created: ${beaconsCreated}`);
  console.log(`Budget note: demo cap is ${demoConfig.maxAgents} agents, $${demoConfig.dailyBudgetUsd}/day LLM budget.`);
}

main()
  .catch((e) => {
    console.error("History seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
