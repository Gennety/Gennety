import type { NetworkingGoal } from "@/types/context";
import { prisma } from "@/lib/db";
import { contextToEmbeddingText, generateEmbeddingWithUsage } from "@/lib/embeddings";
import { computeContextHash } from "@/lib/services/freshness";
import { createInboxEvent } from "@/lib/services/inbox";
import { signalAgentWork } from "@/lib/services/agent-delivery";
import { getPrivacySyncStatus } from "@/lib/services/privacy-sync";
import { buildNetworkingGoalChangePayload } from "@/lib/networking-goal";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";

export async function syncNetworkingGoalForAgent(args: {
  ownerId: string;
  previousGoal: NetworkingGoal | null;
  nextGoal: NetworkingGoal;
}) {
  if (args.previousGoal === args.nextGoal) {
    return {
      changed: false,
      notified: false,
      contextUpdated: false,
      beaconsDeactivated: 0,
      searchRescored: false,
    };
  }

  const agent = await prisma.agent.findUnique({
    where: { ownerId: args.ownerId },
    include: {
      context: true,
      owner: true,
    },
  });

  if (!agent) {
    return {
      changed: true,
      notified: false,
      contextUpdated: false,
      beaconsDeactivated: 0,
      searchRescored: false,
    };
  }

  const privacySync = await getPrivacySyncStatus(agent.id);
  const searchSuppressed = privacySync?.pending === true;

  let contextUpdated = false;
  let searchRescored = false;
  const deactivated = await prisma.beacon.updateMany({
    where: { agentId: agent.id, isActive: true },
    data: { isActive: false, preservable: false },
  });
  const beaconsDeactivated = deactivated.count;

  if (agent.context) {
    if (!searchSuppressed) {
      const embeddingText = contextToEmbeddingText({
        currentWork: agent.context.currentWork,
        expertise: agent.context.expertise,
        lookingFor: agent.context.lookingFor,
        notLookingFor: agent.context.notLookingFor,
        recentProblems: agent.context.recentProblems,
        recentWins: agent.context.recentWins,
        networkingGoal: args.nextGoal,
        ownerProfession: agent.context.ownerProfession,
        ownerDomain: agent.context.ownerDomain,
        ownerGoals: agent.context.ownerGoals,
        agentSpecialization: agent.context.agentSpecialization,
        agentDomains: agent.context.agentDomains,
        collaborationStyle: agent.context.collaborationStyle,
      });
      const { embedding } = await generateEmbeddingWithUsage(embeddingText, {
        operation: "networking_goal_sync",
        ownerId: args.ownerId,
        agentId: agent.id,
        metadata: {
          previous_goal: args.previousGoal,
          next_goal: args.nextGoal,
        },
      });
      const previousHash = computeContextHash({
        current_work: agent.context.currentWork,
        looking_for: agent.context.lookingFor,
        networking_goal: args.nextGoal,
        recent_problems: agent.context.recentProblems,
        owner_profession: agent.context.ownerProfession,
        owner_domain: agent.context.ownerDomain,
        agent_specialization: agent.context.agentSpecialization,
      });

      await prisma.$executeRaw`
        UPDATE agent_contexts
        SET networking_goal = ${args.nextGoal},
            embedding = ${embedding}::vector,
            previous_hash = ${previousHash},
            freshness_state = 'ACTIVE',
            updated_at = NOW(),
            last_significant_update_at = NOW()
        WHERE agent_id = ${agent.id}
      `;

      contextUpdated = true;
      searchRescored = true;
    }
  }

  await prisma.inboxEvent.updateMany({
    where: {
      agentId: agent.id,
      type: "NETWORKING_GOAL_CHANGED",
      dismissedAt: null,
    },
    data: { dismissedAt: new Date() },
  });

  const payload = buildNetworkingGoalChangePayload({
    previousGoal: args.previousGoal,
    nextGoal: args.nextGoal,
    contextUpdated,
    beaconsDeactivated,
    requiresAgentRepublish: true,
    searchRescored,
    currentPublishedContext: agent.context
      ? {
          current_work: agent.context.currentWork,
          looking_for: agent.context.lookingFor,
          networking_goal: contextUpdated
            ? args.nextGoal
            : (agent.context.networkingGoal as NetworkingGoal),
        }
      : null,
  });

  await createInboxEvent({
    ownerId: args.ownerId,
    agentId: agent.id,
    type: "NETWORKING_GOAL_CHANGED",
    referenceId: agent.id,
    payload,
  });

  signalAgentWork({
    agentId: agent.id,
    kind: "NETWORKING_GOAL_CHANGED",
    reason: "Networking goal changed — refresh strategy and republish context",
    referenceId: agent.id,
    urgency: "high",
  }).catch((error) => {
    console.error("[networking-goal-sync] Failed to signal agent:", error);
  });

  await recordAnalyticsEvent({
    type: "NETWORKING_GOAL_CHANGED",
    ownerId: args.ownerId,
    agentId: agent.id,
    metadata: {
      previous_goal: args.previousGoal,
      next_goal: args.nextGoal,
      context_updated: contextUpdated,
      beacons_deactivated: beaconsDeactivated,
      search_rescored: searchRescored,
    },
  });

  return {
    changed: true,
    notified: true,
    contextUpdated,
    beaconsDeactivated,
    searchRescored,
  };
}
