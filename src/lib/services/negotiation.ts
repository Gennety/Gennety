import { prisma } from "@/lib/db";
import { createChatWithOpeningMessages } from "@/lib/services/chat";
import { recordEvent } from "@/lib/services/reputation";
import { createInboxEvent } from "@/lib/services/inbox";
import { signalAgentWork } from "@/lib/services/agent-delivery";
import { areNetworkingGoalsCompatible } from "@/lib/networking-goal";
import type { NetworkingGoal } from "@/types/context";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";

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
  reasoning?: string, // why the initiator thinks this match is valuable
  options?: {
    candidateSimilarity?: number;
    discoverySource?: "UNKNOWN" | "SEARCH" | "BEACON";
    sourceBeaconId?: string;
  }
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
  if (agentA.searchPaused) {
    throw new Error("Cannot initiate negotiation: initiator search is paused by the owner.");
  }

  const agentB = await prisma.agent.findUnique({
    where: { agentId: targetAgentId },
    include: { context: true, owner: true },
  });
  if (!agentB) throw new Error(`Agent not found: ${targetAgentId}`);
  if (!agentB.context) throw new Error(`Agent has no context: ${targetAgentId}`);
  if (agentB.searchPaused) {
    throw new Error("Cannot initiate negotiation: target agent search is paused by the owner.");
  }
  if (
    !areNetworkingGoalsCompatible(
      agentA.context.networkingGoal as NetworkingGoal,
      agentB.context.networkingGoal as NetworkingGoal
    )
  ) {
    throw new Error(
      `Incompatible networking goals: ${agentA.context.networkingGoal} vs ${agentB.context.networkingGoal}`
    );
  }

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

  let matchSimilarity = options?.candidateSimilarity ?? null;
  if (matchSimilarity === null) {
    const similarityRows = await prisma.$queryRaw<Array<{ similarity: number | null }>>`
      SELECT (1 - (a.embedding <=> b.embedding)) AS similarity
      FROM agent_contexts a
      JOIN agent_contexts b ON b.agent_id = ${agentB.id}
      WHERE a.agent_id = ${agentA.id}
        AND a.embedding IS NOT NULL
        AND b.embedding IS NOT NULL
      LIMIT 1
    `;
    const similarityValue = similarityRows[0]?.similarity;
    matchSimilarity =
      similarityValue !== null && similarityValue !== undefined
        ? Number(similarityValue)
        : null;
  }

  const discoverySource =
    options?.discoverySource ?? (options?.sourceBeaconId ? "BEACON" : "UNKNOWN");

  const match = await prisma.match.create({
    data: {
      agentAId: normalizedAId,
      agentBId: normalizedBId,
      initiatorAgentId: agentA.id,
      overlapSummary: "",
      framingForA: "",
      framingForB: "",
      matchSimilarity,
      discoverySource,
      sourceBeaconId: options?.sourceBeaconId ?? null,
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

  await recordAnalyticsEvent({
    type: "NEGOTIATION_INITIATED",
    ownerId: agentA.owner.id,
    agentId: agentA.id,
    matchId: match.id,
    beaconId: options?.sourceBeaconId ?? null,
    metadata: {
      initiator_external_agent_id: initiatorAgentId,
      target_external_agent_id: targetAgentId,
      similarity: matchSimilarity,
      discovery_source: discoverySource,
      reasoning: reasoning ?? null,
    },
  });

  signalAgentWork({
    agentId: agentB.id,
    kind: "NEGOTIATION_STARTED",
    reason: "New agent negotiation request",
    referenceId: match.id,
    urgency: "high",
  }).catch((error) => {
    console.error("[negotiation] Failed to signal target agent:", error);
  });

  return {
    matchId: match.id,
    status: "NEGOTIATING",
    alreadyExists: false,
    matchSimilarity,
    discoverySource,
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
      agentA: { include: { owner: true, context: true } },
      agentB: { include: { owner: true, context: true } },
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

    await recordAnalyticsEvent({
      type: "NEGOTIATION_DECLINED",
      ownerId: agent.ownerId,
      agentId: agent.id,
      matchId,
      metadata: {
        role: isAgentA ? "initiator" : "responder",
        evaluation: evaluation ?? null,
      },
    });

    return { matchId, status: "DECLINED", message: "Negotiation declined" };
  }

  // Accept — update framing for this agent's owner
  const updateData: Record<string, string | Date> = {};
  if (overlapSummary) updateData.overlapSummary = overlapSummary;
  if (isAgentA && framingForOwner) updateData.framingForA = framingForOwner;
  if (isAgentB && framingForOwner) updateData.framingForB = framingForOwner;
  updateData[isAgentA ? "agentAAcceptedAt" : "agentBAcceptedAt"] = new Date();

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

  await recordAnalyticsEvent({
    type: "NEGOTIATION_ACCEPTED",
    ownerId: agent.ownerId,
    agentId: agent.id,
    matchId,
    metadata: {
      role: isAgentA ? "initiator" : "responder",
      overlap_summary: overlapSummary ?? null,
      framing_for_owner: framingForOwner ?? null,
      evaluation: evaluation ?? null,
    },
  });

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
      agentA: { include: { owner: true, context: true } },
      agentB: { include: { owner: true, context: true } },
    },
  });

  if (!match) throw new Error(`Match not found: ${matchId}`);
  if (match.status !== "NEGOTIATING") {
    throw new Error(`Match must be in NEGOTIATING state to propose (current: ${match.status})`);
  }
  if (match.agentA.searchPaused || match.agentB.searchPaused) {
    throw new Error("Cannot propose: match search is paused for one of the owners.");
  }
  if (
    !match.agentA.context ||
    !match.agentB.context ||
    !areNetworkingGoalsCompatible(
      match.agentA.context.networkingGoal as NetworkingGoal,
      match.agentB.context.networkingGoal as NetworkingGoal
    )
  ) {
    throw new Error("Cannot propose: networking goals are no longer compatible.");
  }
  if (!match.agentAAcceptedAt || !match.agentBAcceptedAt) {
    throw new Error("Cannot propose: both agents must explicitly accept the negotiation first.");
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

  await Promise.all([
    recordAnalyticsEvent({
      type: "MATCH_PROPOSED",
      ownerId: match.agentA.owner.id,
      agentId: match.agentAId,
      matchId,
      beaconId: match.sourceBeaconId,
      metadata: {
        discovery_source: match.discoverySource,
        similarity: match.matchSimilarity,
      },
    }),
    recordAnalyticsEvent({
      type: "MATCH_PROPOSED",
      ownerId: match.agentB.owner.id,
      agentId: match.agentBId,
      matchId,
      beaconId: match.sourceBeaconId,
      metadata: {
        discovery_source: match.discoverySource,
        similarity: match.matchSimilarity,
      },
    }),
  ]);

  // Write inbox events for both owners — agents will deliver them via check_in.
  const ownerA = match.agentA.owner;
  const ownerB = match.agentB.owner;

  await Promise.all([
    createInboxEvent({
      ownerId: ownerA.id,
      agentId: match.agentAId,
      type: "MATCH_PROPOSED",
      referenceId: matchId,
      payload: {
        match_id: matchId,
        other_agent_id: match.agentB.agentId,
        other_display_name: match.agentB.displayName,
        other_owner_name: ownerB.name,
        framing: match.framingForA,
        overlap_summary: match.overlapSummary,
        proposed_at: new Date().toISOString(),
      },
    }),
    createInboxEvent({
      ownerId: ownerB.id,
      agentId: match.agentBId,
      type: "MATCH_PROPOSED",
      referenceId: matchId,
      payload: {
        match_id: matchId,
        other_agent_id: match.agentA.agentId,
        other_display_name: match.agentA.displayName,
        other_owner_name: ownerA.name,
        framing: match.framingForB,
        overlap_summary: match.overlapSummary,
        proposed_at: new Date().toISOString(),
      },
    }),
  ]).catch((err) => console.error("[inbox] Match proposal events failed:", err));

  signalAgentWork({
    agentId: match.agentAId,
    kind: "MATCH_PROPOSED",
    reason: "New match proposal",
    referenceId: matchId,
    urgency: "high",
  }).catch((error) => console.error("[negotiation] Failed to signal agent A:", error));
  signalAgentWork({
    agentId: match.agentBId,
    kind: "MATCH_PROPOSED",
    reason: "New match proposal",
    referenceId: matchId,
    urgency: "high",
  }).catch((error) => console.error("[negotiation] Failed to signal agent B:", error));

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
  const confirmation = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: {
        agentA: { include: { owner: true } },
        agentB: { include: { owner: true } },
        chat: true,
      },
    });

    if (!match) throw new Error(`Match not found: ${matchId}`);

    const isOwnerA = match.agentA.owner.id === ownerId;
    const isOwnerB = match.agentB.owner.id === ownerId;
    if (!isOwnerA && !isOwnerB) {
      throw new Error(`Owner ${ownerId} is not part of this match`);
    }

    if (match.status === "MATCHED") {
      return {
        phase: "matched" as const,
        finalizedNow: false,
        newlyConfirmed: false,
        confirmedByA: true,
        confirmedByB: true,
        confirmingAgentId: isOwnerA ? match.agentAId : match.agentBId,
        chatId: match.chat?.id ?? null,
        agentAId: match.agentAId,
        agentBId: match.agentBId,
        overlapSummary: match.overlapSummary,
        agentA: match.agentA,
        agentB: match.agentB,
      };
    }

    if (match.status !== "PROPOSED") {
      throw new Error(`Match must be in PROPOSED state to confirm (current: ${match.status})`);
    }

    const confirmingAgentId = isOwnerA ? match.agentAId : match.agentBId;
    const wasConfirmedByMe = isOwnerA ? match.confirmedByA : match.confirmedByB;

    if (!wasConfirmedByMe) {
      await tx.match.update({
        where: { id: matchId },
        data: isOwnerA ? { confirmedByA: true } : { confirmedByB: true },
      });
    }

    const refreshed = await tx.match.findUnique({
      where: { id: matchId },
      include: {
        agentA: { include: { owner: true } },
        agentB: { include: { owner: true } },
        chat: true,
      },
    });

    if (!refreshed) {
      throw new Error(`Match not found after confirmation: ${matchId}`);
    }

    const bothConfirmed = refreshed.confirmedByA && refreshed.confirmedByB;
    let finalizedNow = false;

    if (bothConfirmed && refreshed.status === "PROPOSED") {
      await tx.match.update({
        where: { id: matchId },
        data: {
          status: "MATCHED",
          matchedAt: refreshed.matchedAt ?? new Date(),
        },
      });
      finalizedNow = true;
    }

    return {
      phase: bothConfirmed ? ("matched" as const) : ("proposed" as const),
      finalizedNow,
      newlyConfirmed: !wasConfirmedByMe,
      confirmedByA: refreshed.confirmedByA,
      confirmedByB: refreshed.confirmedByB,
      confirmingAgentId,
      chatId: refreshed.chat?.id ?? null,
      agentAId: refreshed.agentAId,
      agentBId: refreshed.agentBId,
      overlapSummary: refreshed.overlapSummary,
      agentA: refreshed.agentA,
      agentB: refreshed.agentB,
    };
  });

  if (confirmation.newlyConfirmed) {
    await recordEvent(confirmation.confirmingAgentId, "MATCH_ACCEPTED");
    await recordAnalyticsEvent({
      type: "OWNER_CONFIRMED_MATCH",
      ownerId,
      agentId: confirmation.confirmingAgentId,
      matchId,
    });
  }

  if (confirmation.phase === "proposed") {
    return {
      matchId,
      status: "PROPOSED",
      confirmedByA: confirmation.confirmedByA,
      confirmedByB: confirmation.confirmedByB,
      bothConfirmed: false,
      message: `Waiting for ${!confirmation.confirmedByA ? "Owner A" : "Owner B"} to confirm`,
    };
  }

  const chat = confirmation.chatId
    ? { id: confirmation.chatId }
    : await createChatWithOpeningMessages(matchId);

  if (confirmation.finalizedNow) {
    await Promise.all([
      recordEvent(confirmation.agentAId, "MATCH_COMPLETED"),
      recordEvent(confirmation.agentBId, "MATCH_COMPLETED"),
    ]);

    const ownerA = confirmation.agentA.owner;
    const ownerB = confirmation.agentB.owner;
    const matchedAt = new Date().toISOString();

    await Promise.all([
      createInboxEvent({
        ownerId: ownerA.id,
        agentId: confirmation.agentAId,
        type: "MATCH_CONFIRMED",
        referenceId: matchId,
        payload: {
          match_id: matchId,
          chat_id: chat.id,
          other_agent_id: confirmation.agentB.agentId,
          other_display_name: confirmation.agentB.displayName,
          other_owner_name: ownerB.name,
          overlap_summary: confirmation.overlapSummary,
          matched_at: matchedAt,
        },
      }),
      createInboxEvent({
        ownerId: ownerB.id,
        agentId: confirmation.agentBId,
        type: "MATCH_CONFIRMED",
        referenceId: matchId,
        payload: {
          match_id: matchId,
          chat_id: chat.id,
          other_agent_id: confirmation.agentA.agentId,
          other_display_name: confirmation.agentA.displayName,
          other_owner_name: ownerA.name,
          overlap_summary: confirmation.overlapSummary,
          matched_at: matchedAt,
        },
      }),
    ]).catch((err) => console.error("[inbox] Match confirmed events failed:", err));

    signalAgentWork({
      agentId: confirmation.agentAId,
      kind: "MATCH_CONFIRMED",
      reason: "Match confirmed — chat open",
      referenceId: matchId,
      urgency: "high",
    }).catch((error) => console.error("[negotiation] Failed to signal agent A:", error));
    signalAgentWork({
      agentId: confirmation.agentBId,
      kind: "MATCH_CONFIRMED",
      reason: "Match confirmed — chat open",
      referenceId: matchId,
      urgency: "high",
    }).catch((error) => console.error("[negotiation] Failed to signal agent B:", error));

    await Promise.all([
      recordAnalyticsEvent({
        type: "MATCH_CONFIRMED",
        ownerId,
        agentId: confirmation.confirmingAgentId,
        matchId,
      }),
      recordAnalyticsEvent({
        type: "CHAT_OPENED",
        matchId,
        chatId: chat.id,
      }),
    ]);
  }

  return {
    matchId,
    status: "MATCHED",
    chatId: chat.id,
    bothConfirmed: true,
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

  await recordAnalyticsEvent({
    type: "MATCH_DORMANT",
    ownerId,
    agentId: isOwnerA ? match.agentAId : match.agentBId,
    matchId,
    beaconId: match.sourceBeaconId,
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
