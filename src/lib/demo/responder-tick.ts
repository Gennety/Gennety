import { prisma } from "@/lib/db";
import { demoConfig } from "@/lib/config/demo";
import * as brain from "@/lib/demo/responder-brain";
import * as client from "@/lib/demo/responder-client";
import {
  isPaused,
  canPerform,
  recordAction,
  isBudgetExhausted,
  pauseAgent,
} from "@/lib/demo/quota";

/**
 * Responder tick — runs periodically from the /api/cron/demo-responder route.
 *
 * Each tick:
 *   1. Responds to pending negotiations where the demo agent is Agent B.
 *   2. Proposes matches that both sides have accepted.
 *   3. Confirms proposed matches on behalf of the demo owner.
 *   4. Replies in chats where the real user sent the last message.
 *   5. For a handful of demo agents, picks a candidate from the index and
 *      initiates a new negotiation. This creates visible motion.
 *
 * All writes go through services/* — identical code path to MCP agents.
 */

type Outcome = {
  negotiationsResponded: number;
  proposalsSent: number;
  proposalsConfirmed: number;
  chatReplies: number;
  initiations: number;
  errors: number;
  budgetExhausted: boolean;
};

export async function runDemoResponderTick(): Promise<Outcome> {
  const outcome: Outcome = {
    negotiationsResponded: 0,
    proposalsSent: 0,
    proposalsConfirmed: 0,
    chatReplies: 0,
    initiations: 0,
    errors: 0,
    budgetExhausted: false,
  };

  if (!demoConfig.enabled) return outcome;

  if (await isBudgetExhausted()) {
    outcome.budgetExhausted = true;
    return outcome;
  }

  await handlePendingNegotiations(outcome);
  await handleReadyProposals(outcome);
  await handleIncomingProposals(outcome);
  await handlePendingChatReplies(outcome);
  await handleProactiveInitiations(outcome);

  return outcome;
}

/* ─── 1. respond to negotiations initiated by someone else ─── */

async function handlePendingNegotiations(outcome: Outcome) {
  const cutoff = new Date(Date.now() - demoConfig.tick.pendingNegotiationMs);

  const matches = await prisma.match.findMany({
    where: {
      status: "NEGOTIATING",
      createdAt: { lt: cutoff },
      OR: [
        { agentA: { isDemo: true } },
        { agentB: { isDemo: true } },
      ],
    },
    include: {
      agentA: { include: { context: true, owner: true } },
      agentB: { include: { context: true, owner: true } },
      negotiationLogs: {
        select: { agentId: true, type: true, content: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    take: demoConfig.tick.batchSize,
  });

  for (const m of matches) {
    // A demo needs to act iff its own framing slot is still empty — this
    // catches both the responder case (nothing filled) and the initiator
    // case (responder accepted, initiator still needs to seal with its own
    // framing).
    const demoSides = [
      { agent: m.agentA, isA: true, myFraming: m.framingForA, otherFraming: m.framingForB },
      { agent: m.agentB, isA: false, myFraming: m.framingForB, otherFraming: m.framingForA },
    ].filter((s) => s.agent.isDemo && s.myFraming === "");

    for (const s of demoSides) {
      const demo = s.agent;
      const other = s.isA ? m.agentB : m.agentA;
      if (!demo.context || !other.context) continue;
      if ((await isPaused(demo.id)).paused) continue;
      if (!(await canPerform(demo.id, "negotiationsResponded"))) continue;

      // Gather what the other side has said — reasoning/evaluation/proposal
      // all count as "their pitch" we're reacting to.
      const otherPitch = m.negotiationLogs
        .filter((l) => l.agentId === other.id)
        .map((l) => l.content)
        .join("\n\n");

      // Need something to react to — either overlap+other's framing (other
      // already accepted) or their reasoning (they initiated).
      if (!otherPitch && !m.overlapSummary) continue;

      const pitch = m.overlapSummary
        ? `Overlap: ${m.overlapSummary}\n\nTheir framing to me: ${s.otherFraming}\n\nEarlier notes:\n${otherPitch}`
        : otherPitch;

      try {
        const { decision, usage } = await brain.evaluateIncomingNegotiation({
          self: asPersona(demo),
          initiator: asPersona(other),
          initiatorReasoning: pitch,
        });

        const overlapSummary = decision.overlap_summary || m.overlapSummary || "";
        if (decision.decision === "accept" && (!overlapSummary || !decision.framing_for_owner)) {
          // LLM said accept but didn't populate required fields — treat as
          // malformed and burn the attempt on our quota so we don't retry in
          // a tight loop.
          await recordAction(demo.id, "negotiationsResponded", usage);
          continue;
        }

        await client.respondToNegotiation({
          selfInternalId: demo.id,
          selfExternalId: demo.agentId,
          matchId: m.id,
          decision: decision.decision,
          overlapSummary,
          framingForOwner: decision.framing_for_owner || "",
          evaluation: decision.evaluation,
          usage,
        });
        await recordAction(demo.id, "negotiationsResponded", usage);
        outcome.negotiationsResponded++;
      } catch (e) {
        outcome.errors++;
        await pauseIfStampede(demo.id, e);
      }

      if (await isBudgetExhausted()) {
        outcome.budgetExhausted = true;
        return;
      }
    }
  }
}

/* ─── 2. propose matches where both agents have accepted ─── */

async function handleReadyProposals(outcome: Outcome) {
  const candidates = await prisma.match.findMany({
    where: {
      status: "NEGOTIATING",
      overlapSummary: { not: "" },
      framingForA: { not: "" },
      framingForB: { not: "" },
      OR: [
        { agentA: { isDemo: true } },
        { agentB: { isDemo: true } },
      ],
    },
    include: { agentA: true, agentB: true },
    take: demoConfig.tick.batchSize,
  });

  for (const m of candidates) {
    // Prefer the demo side as the proposer so we don't block on real agents.
    const proposer = m.agentA.isDemo ? m.agentA : m.agentB;
    try {
      await client.propose({ selfInternalId: proposer.id, matchId: m.id });
      outcome.proposalsSent++;
    } catch (e) {
      outcome.errors++;
      await pauseIfStampede(proposer.id, e);
    }
  }
}

/* ─── 3. demo owners confirm or dismiss incoming proposals ─── */

async function handleIncomingProposals(outcome: Outcome) {
  const cutoff = new Date(Date.now() - demoConfig.tick.pendingMatchProposalMs);

  const matches = await prisma.match.findMany({
    where: {
      status: "PROPOSED",
      proposedAt: { lt: cutoff },
      OR: [
        { agentA: { isDemo: true } },
        { agentB: { isDemo: true } },
      ],
    },
    include: {
      agentA: { include: { context: true, owner: true } },
      agentB: { include: { context: true, owner: true } },
    },
    take: demoConfig.tick.batchSize,
  });

  for (const m of matches) {
    const sides = [
      { agent: m.agentA, isA: true, alreadyActed: m.confirmedByA },
      { agent: m.agentB, isA: false, alreadyActed: m.confirmedByB },
    ].filter((s) => s.agent.isDemo && !s.alreadyActed);

    for (const s of sides) {
      if ((await isPaused(s.agent.id)).paused) continue;
      const other = s.isA ? m.agentB : m.agentA;
      if (!s.agent.context || !other.context) continue;

      try {
        const { decision, usage } = await brain.decideMatchProposal({
          self: asPersona(s.agent),
          overlapSummary: m.overlapSummary,
          framingForMe: s.isA ? m.framingForA : m.framingForB,
          otherOwnerName: other.owner.name ?? other.agentId,
          otherCurrentWork: other.context.currentWork,
        });

        if (decision.decision === "confirm") {
          await client.confirm({
            selfInternalId: s.agent.id,
            matchId: m.id,
            ownerId: s.agent.ownerId,
            usage,
          });
          outcome.proposalsConfirmed++;
        } else {
          await client.dormant({
            selfInternalId: s.agent.id,
            matchId: m.id,
            ownerId: s.agent.ownerId,
            usage,
          });
        }
      } catch (e) {
        outcome.errors++;
        await pauseIfStampede(s.agent.id, e);
      }

      if (await isBudgetExhausted()) {
        outcome.budgetExhausted = true;
        return;
      }
    }
  }
}

/* ─── 4. chat replies ─── */

async function handlePendingChatReplies(outcome: Outcome) {
  const cutoff = new Date(Date.now() - demoConfig.tick.pendingChatReplyMs);

  const chats = await prisma.chat.findMany({
    where: {
      status: "OPEN",
      match: {
        status: "MATCHED",
        OR: [
          { agentA: { isDemo: true } },
          { agentB: { isDemo: true } },
        ],
      },
    },
    include: {
      match: {
        include: {
          agentA: { include: { context: true, owner: true } },
          agentB: { include: { context: true, owner: true } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
    take: demoConfig.tick.batchSize,
  });

  for (const c of chats) {
    if (c.messages.length === 0) continue;
    const last = c.messages[0];
    if (last.createdAt > cutoff) continue; // too fresh — wait

    // Determine which demo owner (if any) should reply.
    const demoOwners = [
      { agent: c.match.agentA, isA: true },
      { agent: c.match.agentB, isA: false },
    ].filter((s) => s.agent.isDemo);

    for (const s of demoOwners) {
      // Demo owner replies if the last message is NOT from them.
      const lastFromThisOwner = last.fromOwner === s.agent.ownerId;
      const lastFromTheirOpener =
        last.fromOwner === (s.isA ? "agent_a" : "agent_b");
      if (lastFromThisOwner || lastFromTheirOpener) continue;

      if ((await isPaused(s.agent.id)).paused) continue;
      if (!(await canPerform(s.agent.id, "chatMessagesSent"))) continue;
      if (!s.agent.context) continue;

      // Build history. Ordered oldest-first for the LLM.
      const history = [...c.messages]
        .reverse()
        .map((m) => {
          if (m.fromOwner === s.agent.ownerId) return { from: "me" as const, content: m.content };
          if (m.fromOwner === "agent_a") return { from: s.isA ? "opener_me" as const : "opener_them" as const, content: m.content };
          if (m.fromOwner === "agent_b") return { from: s.isA ? "opener_them" as const : "opener_me" as const, content: m.content };
          return { from: "them" as const, content: m.content };
        });

      const other = s.isA ? c.match.agentB : c.match.agentA;

      try {
        const { reply, usage, moderation } = await brain.generateChatReply({
          self: asPersona(s.agent),
          otherOwnerName: other.owner.name ?? "the other person",
          overlapSummary: c.match.overlapSummary,
          history,
        });

        if (moderation || !reply) {
          await recordAction(s.agent.id, "chatMessagesSent", usage);
          continue;
        }

        await client.sendChatMessage({
          selfInternalId: s.agent.id,
          chatId: c.id,
          ownerId: s.agent.ownerId,
          content: reply,
          isOwnerA: s.isA,
          usage,
        });
        await recordAction(s.agent.id, "chatMessagesSent", usage);
        outcome.chatReplies++;
      } catch (e) {
        outcome.errors++;
        await pauseIfStampede(s.agent.id, e);
      }

      if (await isBudgetExhausted()) {
        outcome.budgetExhausted = true;
        return;
      }
    }
  }
}

/* ─── 5. proactive initiations ─── */

async function handleProactiveInitiations(outcome: Outcome) {
  // Pick a handful of demo agents that haven't ticked recently.
  const minGap = demoConfig.tick.proactiveInitiationIntervalMinMs;
  const cutoff = new Date(Date.now() - minGap);

  const due = await prisma.agent.findMany({
    where: {
      isDemo: true,
      isActive: true,
      context: { isNot: null },
      OR: [{ lastDemoTickAt: null }, { lastDemoTickAt: { lt: cutoff } }],
    },
    include: {
      context: true,
      owner: true,
    },
    take: 3, // keep each tick small — cron fires every 60s
    orderBy: { lastDemoTickAt: { sort: "asc", nulls: "first" } },
  });

  for (const agent of due) {
    // Randomized jitter — if agent rolled a high number, skip this tick.
    const jitter = Math.random();
    const gapRange =
      demoConfig.tick.proactiveInitiationIntervalMaxMs - minGap;
    const threshold = Math.min(1, minGap / (minGap + jitter * gapRange));
    if (Math.random() > threshold) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { lastDemoTickAt: new Date() },
      });
      continue;
    }

    if ((await isPaused(agent.id)).paused) continue;
    if (!(await canPerform(agent.id, "negotiationsInitiated"))) continue;
    if (!agent.context) continue;

    try {
      const candidates = await client.findCandidatesFor(agent.agentId);
      // Skip trivial cases — if every candidate is another demo agent with
      // a stale similar context, don't spam. Prefer real agents where possible.
      if (candidates.length === 0) continue;

      const { plan, usage } = await brain.pickInitiationTarget({
        self: asPersona(agent),
        candidates: candidates.map((c) => ({
          agentId: c.agentExternalId,
          ownerName: c.agentExternalId,
          ownerProfession: c.ownerProfession,
          currentWork: c.currentWork,
          expertise: c.expertise,
          lookingFor: c.lookingFor,
          networkingGoal: c.networkingGoal,
          similarity: c.similarity,
        })),
      });

      if (!plan.shouldInitiate || !plan.targetAgentId) {
        await recordAction(agent.id, "negotiationsInitiated", usage);
        await prisma.agent.update({
          where: { id: agent.id },
          data: { lastDemoTickAt: new Date() },
        });
        continue;
      }

      await client.startNegotiation({
        selfInternalId: agent.id,
        selfExternalId: agent.agentId,
        targetExternalId: plan.targetAgentId,
        reasoning: plan.reasoning,
        usage,
        candidateSimilarity:
          candidates.find((candidate) => candidate.agentExternalId === plan.targetAgentId)?.similarity,
      });
      await recordAction(agent.id, "negotiationsInitiated", usage);
      await prisma.agent.update({
        where: { id: agent.id },
        data: { lastDemoTickAt: new Date() },
      });
      outcome.initiations++;
    } catch (e) {
      outcome.errors++;
      await pauseIfStampede(agent.id, e);
      // Still update tick timestamp so we don't re-try this agent immediately.
      await prisma.agent.update({
        where: { id: agent.id },
        data: { lastDemoTickAt: new Date() },
      });
    }

    if (await isBudgetExhausted()) {
      outcome.budgetExhausted = true;
      return;
    }
  }
}

/* ─── helpers ─── */

type AgentWithContextAndOwner = {
  id: string;
  agentId: string;
  ownerId: string;
  owner: { name: string | null };
  demoPersona: unknown;
  context: {
    currentWork: string;
    expertise: string[];
    lookingFor: string;
    notLookingFor: string | null;
    networkingGoal: string;
    ownerProfession: string | null;
    ownerDomain: string | null;
    agentSpecialization: string | null;
    collaborationStyle: string | null;
    communicationStyle: string | null;
  } | null;
};

function asPersona(a: AgentWithContextAndOwner): brain.AgentPersona {
  const persona = (a.demoPersona ?? {}) as Record<string, unknown>;
  const ctx = a.context!;
  return {
    agentId: a.agentId,
    ownerName: a.owner.name ?? a.agentId,
    niche: persona.niche as string | undefined,
    personalityTraits: persona.personalityTraits as string[] | undefined,
    responseTempo: persona.responseTempo as "fast" | "medium" | "slow" | undefined,
    agreementBias: persona.agreementBias as number | undefined,
    communicationStyle: ctx.communicationStyle,
    collaborationStyle: ctx.collaborationStyle,
    currentWork: ctx.currentWork,
    expertise: ctx.expertise,
    lookingFor: ctx.lookingFor,
    notLookingFor: ctx.notLookingFor,
    networkingGoal: ctx.networkingGoal,
    ownerProfession: ctx.ownerProfession,
    ownerDomain: ctx.ownerDomain,
    agentSpecialization: ctx.agentSpecialization,
  };
}

async function pauseIfStampede(demoAgentId: string, err: unknown): Promise<void> {
  const since = new Date(Date.now() - 10 * 60_000);
  const recentErrors = await prisma.demoResponderLog.count({
    where: { demoAgentId, success: false, createdAt: { gte: since } },
  });
  if (recentErrors >= demoConfig.stampede.maxErrorsPerAgentIn10min) {
    await pauseAgent(
      demoAgentId,
      `Stampede: ${recentErrors} errors in 10min. Last: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
