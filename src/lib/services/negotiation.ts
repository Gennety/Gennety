import { prisma } from "@/lib/db";
import { sendMatchProposalEmail, sendMatchConfirmedEmail, shouldSend } from "@/lib/services/notification";
import { createChatWithOpeningMessages } from "@/lib/services/chat";
import { recordEvent } from "@/lib/services/reputation";

/**
 * NegotiationFSM — state machine for agent-to-agent match negotiation
 *
 * States: NEGOTIATING → PROPOSED → MATCHED | DORMANT | DECLINED
 *
 * Flow:
 * 1. Agent A calls initiate_negotiation(agent_b_id) → creates Match in NEGOTIATING
 * 2. Agent B calls negotiate(match_id, "accept", framing) → both agents agreed
 * 3. Agent A calls propose_match(match_id) → status becomes PROPOSED, owners notified
 * 4. Each owner confirms or declines:
 *    - Both confirm → MATCHED, chat opens
 *    - Either says "not now" → DORMANT
 *    - Either declines → DECLINED
 */

export async function initiateNegotiation(
  initiatorAgentId: string, // external agent_id like "agent_arlan_001"
  targetAgentId: string, // external agent_id of the other agent
  reasoning?: string // why the initiator thinks this match is valuable
) {
  if (initiatorAgentId === targetAgentId) {
    throw new Error("Cannot initiate negotiation with yourself");
  }

  const agentA = await prisma.agent.findUnique({
    where: { agentId: initiatorAgentId },
    include: { context: true, owner: true },
  });
  if (!agentA) throw new Error(`Agent not found: ${initiatorAgentId}`);
  if (!agentA.context) throw new Error(`Agent has no context: ${initiatorAgentId}`);

  const agentB = await prisma.agent.findUnique({
    where: { agentId: targetAgentId },
    include: { context: true, owner: true },
  });
  if (!agentB) throw new Error(`Agent not found: ${targetAgentId}`);
  if (!agentB.context) throw new Error(`Agent has no context: ${targetAgentId}`);

  // Normalize agent pair order for unique constraint
  const [normalizedAId, normalizedBId] =
    agentA.id < agentB.id ? [agentA.id, agentB.id] : [agentB.id, agentA.id];

  // Check for existing active negotiation between these two agents
  const existing = await prisma.match.findFirst({
    where: {
      agentAId: normalizedAId,
      agentBId: normalizedBId,
      status: { in: ["NEGOTIATING", "PROPOSED", "MATCHED"] },
    },
  });

  if (existing) {
    return {
      matchId: existing.id,
      status: existing.status,
      alreadyExists: true,
      message: `Active match already exists between ${initiatorAgentId} and ${targetAgentId}`,
    };
  }

  const match = await prisma.match.create({
    data: {
      agentAId: normalizedAId,
      agentBId: normalizedBId,
      initiatorAgentId: agentA.id,
      overlapSummary: "",
      framingForA: "",
      framingForB: "",
      status: "NEGOTIATING",
    },
  });

  // Log reasoning step if provided
  if (reasoning) {
    await prisma.negotiationLog.create({
      data: {
        matchId: match.id,
        agentId: agentA.id,
        role: "initiator",
        type: "reasoning",
        content: reasoning,
      },
    });
  }

  return {
    matchId: match.id,
    status: "NEGOTIATING",
    alreadyExists: false,
    agentA: {
      agentId: initiatorAgentId,
      currentWork: agentA.context.currentWork,
      expertise: agentA.context.expertise,
      lookingFor: agentA.context.lookingFor,
      ownerProfession: agentA.context.ownerProfession,
      ownerDomain: agentA.context.ownerDomain,
      agentSpecialization: agentA.context.agentSpecialization,
      collaborationStyle: agentA.context.collaborationStyle,
      networkingGoal: agentA.context.networkingGoal,
      reputationScore: Math.round(agentA.reputationScore),
      freshnessState: agentA.context.freshnessState,
    },
    agentB: {
      agentId: targetAgentId,
      currentWork: agentB.context.currentWork,
      expertise: agentB.context.expertise,
      lookingFor: agentB.context.lookingFor,
      ownerProfession: agentB.context.ownerProfession,
      ownerDomain: agentB.context.ownerDomain,
      agentSpecialization: agentB.context.agentSpecialization,
      collaborationStyle: agentB.context.collaborationStyle,
      networkingGoal: agentB.context.networkingGoal,
      reputationScore: Math.round(agentB.reputationScore),
      freshnessState: agentB.context.freshnessState,
    },
  };
}

export async function negotiate(
  matchId: string,
  agentExternalId: string,
  decision: "accept" | "decline",
  overlapSummary?: string,
  framingForOwner?: string,
  evaluation?: string // agent's evaluation of the match proposal
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agentA: { include: { owner: true } },
      agentB: { include: { owner: true } },
    },
  });

  if (!match) throw new Error(`Match not found: ${matchId}`);
  if (match.status !== "NEGOTIATING") {
    throw new Error(`Match is not in NEGOTIATING state (current: ${match.status})`);
  }

  const agent = await prisma.agent.findUnique({ where: { agentId: agentExternalId } });
  if (!agent) throw new Error(`Agent not found: ${agentExternalId}`);

  const isAgentA = match.agentAId === agent.id;
  const isAgentB = match.agentBId === agent.id;
  if (!isAgentA && !isAgentB) {
    throw new Error(`Agent ${agentExternalId} is not part of this match`);
  }

  if (decision === "decline") {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "DECLINED" },
    });

    // Log decline
    await prisma.negotiationLog.create({
      data: {
        matchId,
        agentId: agent.id,
        role: isAgentA ? "initiator" : "responder",
        type: "decline",
        content: evaluation || "Declined without explanation.",
      },
    });

    // Record reputation event for the initiating agent (negotiation was declined)
    // Find the initiator — the other agent from the one who declined
    const initiatorId = isAgentA ? match.agentBId : match.agentAId;
    await recordEvent(initiatorId, "NEGOTIATION_DECLINED");

    return { matchId, status: "DECLINED", message: "Negotiation declined" };
  }

  // Accept — update framing for this agent's owner
  const updateData: Record<string, string> = {};
  if (overlapSummary) updateData.overlapSummary = overlapSummary;
  if (isAgentA && framingForOwner) updateData.framingForA = framingForOwner;
  if (isAgentB && framingForOwner) updateData.framingForB = framingForOwner;

  await prisma.match.update({
    where: { id: matchId },
    data: updateData,
  });

  // Log evaluation step
  if (evaluation) {
    await prisma.negotiationLog.create({
      data: {
        matchId,
        agentId: agent.id,
        role: isAgentA ? "initiator" : "responder",
        type: "evaluation",
        content: evaluation,
      },
    });
  }

  // Log proposal step (overlap + framing provided = concrete proposal)
  if (overlapSummary && framingForOwner) {
    await prisma.negotiationLog.create({
      data: {
        matchId,
        agentId: agent.id,
        role: isAgentA ? "initiator" : "responder",
        type: "proposal",
        content: `Overlap: ${overlapSummary}\n\nFraming for owner: ${framingForOwner}`,
      },
    });
  }

  // Fetch updated match to check state
  const updated = await prisma.match.findUnique({ where: { id: matchId } });

  return {
    matchId,
    status: "NEGOTIATING",
    accepted: true,
    overlapSummary: updated?.overlapSummary,
    framingForA: updated?.framingForA,
    framingForB: updated?.framingForB,
    message: isAgentA
      ? "Agent A accepted. Waiting for Agent B to negotiate."
      : "Agent B accepted. Agent A can now propose the match.",
  };
}

export async function proposeMatch(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agentA: { include: { owner: true } },
      agentB: { include: { owner: true } },
    },
  });

  if (!match) throw new Error(`Match not found: ${matchId}`);
  if (match.status !== "NEGOTIATING") {
    throw new Error(`Match must be in NEGOTIATING state to propose (current: ${match.status})`);
  }

  // Validate both framings exist — quality gate
  if (!match.overlapSummary || !match.framingForA || !match.framingForB) {
    throw new Error(
      "Cannot propose: both agents must provide overlap_summary and framing for their owner. " +
        `Missing: ${[
          !match.overlapSummary && "overlap_summary",
          !match.framingForA && "framing_for_a",
          !match.framingForB && "framing_for_b",
        ]
          .filter(Boolean)
          .join(", ")}`
    );
  }

  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: "PROPOSED",
      proposedAt: new Date(),
    },
  });

  // Log agreement step
  await prisma.negotiationLog.create({
    data: {
      matchId,
      agentId: match.agentAId,
      role: "initiator",
      type: "agreement",
      content: `Mutual agreement reached. Both agents confirmed real value.\n\nOverlap: ${match.overlapSummary}\n\nProposal sent to both owners.`,
    },
  });

  // Record negotiation agreed for the initiating agent (agentA)
  await recordEvent(match.agentAId, "NEGOTIATION_AGREED");

  // Record MATCH_PROPOSED for both agents (increments totalProposedMatches)
  await Promise.all([
    recordEvent(match.agentAId, "MATCH_PROPOSED"),
    recordEvent(match.agentBId, "MATCH_PROPOSED"),
  ]);

  // Send email notifications to both owners (non-blocking, respects preferences)
  const emailPromises: Promise<unknown>[] = [];
  const ownerA = match.agentA.owner;
  const ownerB = match.agentB.owner;

  if (shouldSend(ownerA, "match")) {
    emailPromises.push(
      sendMatchProposalEmail({
        ownerEmail: ownerA.email,
        ownerName: ownerA.name,
        otherPersonName: ownerB.name,
        framing: match.framingForA,
        matchId,
        ownerId: ownerA.id,
      })
    );
  }
  if (shouldSend(ownerB, "match")) {
    emailPromises.push(
      sendMatchProposalEmail({
        ownerEmail: ownerB.email,
        ownerName: ownerB.name,
        otherPersonName: ownerA.name,
        framing: match.framingForB,
        matchId,
        ownerId: ownerB.id,
      })
    );
  }
  if (emailPromises.length > 0) {
    Promise.all(emailPromises).catch((err) =>
      console.error("[notification] Email batch failed:", err)
    );
  }

  return {
    matchId,
    status: "PROPOSED",
    proposedTo: {
      ownerA: { id: match.agentA.owner.id, name: match.agentA.owner.name, email: match.agentA.owner.email },
      ownerB: { id: match.agentB.owner.id, name: match.agentB.owner.name, email: match.agentB.owner.email },
    },
    framingForA: match.framingForA,
    framingForB: match.framingForB,
    overlapSummary: match.overlapSummary,
  };
}

export async function confirmMatch(matchId: string, ownerId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agentA: { include: { owner: true } },
      agentB: { include: { owner: true } },
    },
  });

  if (!match) throw new Error(`Match not found: ${matchId}`);
  if (match.status !== "PROPOSED") {
    throw new Error(`Match must be in PROPOSED state to confirm (current: ${match.status})`);
  }

  const isOwnerA = match.agentA.owner.id === ownerId;
  const isOwnerB = match.agentB.owner.id === ownerId;
  if (!isOwnerA && !isOwnerB) {
    throw new Error(`Owner ${ownerId} is not part of this match`);
  }

  const updateData: Record<string, boolean> = {};
  if (isOwnerA) updateData.confirmedByA = true;
  if (isOwnerB) updateData.confirmedByB = true;

  await prisma.match.update({
    where: { id: matchId },
    data: updateData,
  });

  // Record MATCH_ACCEPTED for the agent whose owner just confirmed
  const confirmingAgentId = isOwnerA ? match.agentAId : match.agentBId;
  await recordEvent(confirmingAgentId, "MATCH_ACCEPTED");

  // Check if both confirmed
  const newConfirmedByA = isOwnerA ? true : match.confirmedByA;
  const newConfirmedByB = isOwnerB ? true : match.confirmedByB;
  const bothConfirmed = newConfirmedByA && newConfirmedByB;

  if (bothConfirmed) {
    // Transition to MATCHED and create chat
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "MATCHED", matchedAt: new Date() },
    });

    const chat = await createChatWithOpeningMessages(matchId);

    // Record MATCH_COMPLETED for both agents
    await Promise.all([
      recordEvent(match.agentAId, "MATCH_COMPLETED"),
      recordEvent(match.agentBId, "MATCH_COMPLETED"),
    ]);

    // Send "match confirmed" email to both owners (non-blocking, respects preferences)
    const confirmEmailPromises: Promise<unknown>[] = [];
    const oA = match.agentA.owner;
    const oB = match.agentB.owner;

    if (shouldSend(oA, "match")) {
      confirmEmailPromises.push(
        sendMatchConfirmedEmail({
          ownerEmail: oA.email,
          ownerName: oA.name,
          otherPersonName: oB.name,
          overlapSummary: match.overlapSummary,
          matchId,
          ownerId: oA.id,
        })
      );
    }
    if (shouldSend(oB, "match")) {
      confirmEmailPromises.push(
        sendMatchConfirmedEmail({
          ownerEmail: oB.email,
          ownerName: oB.name,
          otherPersonName: oA.name,
          overlapSummary: match.overlapSummary,
          matchId,
          ownerId: oB.id,
        })
      );
    }
    if (confirmEmailPromises.length > 0) {
      Promise.all(confirmEmailPromises).catch((err) =>
        console.error("[notification] Match confirmed email failed:", err)
      );
    }

    return {
      matchId,
      status: "MATCHED",
      chatId: chat.id,
      bothConfirmed: true,
    };
  }

  return {
    matchId,
    status: "PROPOSED",
    confirmedByA: newConfirmedByA,
    confirmedByB: newConfirmedByB,
    bothConfirmed: false,
    message: `Waiting for ${!newConfirmedByA ? "Owner A" : "Owner B"} to confirm`,
  };
}

export async function markDormant(matchId: string, ownerId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agentA: { include: { owner: true } },
      agentB: { include: { owner: true } },
    },
  });

  if (!match) throw new Error(`Match not found: ${matchId}`);
  if (match.status !== "PROPOSED") {
    throw new Error(`Match must be in PROPOSED state to mark dormant (current: ${match.status})`);
  }

  const isOwnerA = match.agentA.owner.id === ownerId;
  const isOwnerB = match.agentB.owner.id === ownerId;
  if (!isOwnerA && !isOwnerB) {
    throw new Error(`Owner ${ownerId} is not part of this match`);
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { status: "DORMANT" },
  });

  return { matchId, status: "DORMANT", markedBy: ownerId };
}

export async function getMatches(agentExternalId: string) {
  const agent = await prisma.agent.findUnique({
    where: { agentId: agentExternalId },
  });
  if (!agent) throw new Error(`Agent not found: ${agentExternalId}`);

  const matches = await prisma.match.findMany({
    where: {
      OR: [{ agentAId: agent.id }, { agentBId: agent.id }],
    },
    include: {
      agentA: { include: { owner: true, context: true } },
      agentB: { include: { owner: true, context: true } },
      chat: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return matches.map((m) => {
    const isAgentA = m.agentAId === agent.id;
    const otherAgent = isAgentA ? m.agentB : m.agentA;
    const framingForMe = isAgentA ? m.framingForA : m.framingForB;

    return {
      matchId: m.id,
      status: m.status,
      overlapSummary: m.overlapSummary,
      framingForMe,
      otherAgent: {
        agentId: otherAgent.agentId,
        ownerName: otherAgent.owner.name,
        currentWork: otherAgent.context?.currentWork,
        expertise: otherAgent.context?.expertise,
        location: otherAgent.context?.location,
      },
      confirmedByMe: isAgentA ? m.confirmedByA : m.confirmedByB,
      confirmedByOther: isAgentA ? m.confirmedByB : m.confirmedByA,
      chatId: m.chat?.id ?? null,
      createdAt: m.createdAt,
      matchedAt: m.matchedAt,
    };
  });
}
