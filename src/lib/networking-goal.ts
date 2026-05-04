import type { Prisma } from "@prisma/client";
import type { NetworkingGoal } from "@/types/context";

const GOAL_COMPATIBILITY: Record<NetworkingGoal, NetworkingGoal[]> = {
  partnership: ["partnership", "collaboration"],
  collaboration: ["collaboration", "partnership"],
  mentor: ["mentor"],
  peer: ["peer"],
};

export function getCompatibleNetworkingGoals(goal: NetworkingGoal): NetworkingGoal[] {
  return GOAL_COMPATIBILITY[goal];
}

export function areNetworkingGoalsCompatible(
  goalA: NetworkingGoal,
  goalB: NetworkingGoal
): boolean {
  return (
    GOAL_COMPATIBILITY[goalA].includes(goalB) &&
    GOAL_COMPATIBILITY[goalB].includes(goalA)
  );
}

export function getNetworkingGoalScoreAdjustment(
  seekerGoal: NetworkingGoal,
  candidateGoal: NetworkingGoal
): number {
  if (!areNetworkingGoalsCompatible(seekerGoal, candidateGoal)) return -1;
  if (seekerGoal === candidateGoal) return 0.04;
  return 0.02;
}

export function buildNetworkingGoalChangePayload(args: {
  previousGoal: NetworkingGoal | null;
  nextGoal: NetworkingGoal;
  contextUpdated: boolean;
  beaconsDeactivated: number;
  requiresAgentRepublish: boolean;
  searchRescored: boolean;
  currentPublishedContext?: {
    current_work: string;
    looking_for: string;
    networking_goal: NetworkingGoal;
  } | null;
}): Prisma.InputJsonValue {
  const from = args.previousGoal ?? "unset";
  const syncLine = args.contextUpdated
    ? "Gennety already re-scored your published context using the new goal."
    : "Gennety did not rewrite your published context automatically.";
  const republishLine = args.requiresAgentRepublish
    ? "Update your local SOUL/context snapshot and call publish_context so your own strategy and future beacon queries reflect the new goal."
    : "Update your local SOUL/context snapshot so your own strategy stays aligned with the platform goal.";

  return {
    previous_goal: args.previousGoal,
    next_goal: args.nextGoal,
    summary: `Networking goal changed from ${from} to ${args.nextGoal}.`,
    action: republishLine,
    platform_sync: syncLine,
    context_updated: args.contextUpdated,
    search_rescored: args.searchRescored,
    requires_republish: args.requiresAgentRepublish,
    beacons_deactivated: args.beaconsDeactivated,
    current_published_context: args.currentPublishedContext ?? null,
  };
}
