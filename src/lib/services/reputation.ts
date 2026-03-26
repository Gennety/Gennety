import { prisma } from "@/lib/db";
import { getFreshnessScore } from "@/lib/services/freshness";

// Component weights
const WEIGHT_ACCEPTANCE = 0.30;
const WEIGHT_NEGOTIATION = 0.25;
const WEIGHT_FRESHNESS = 0.20;
const WEIGHT_COMPLETED = 0.25;

// Max single-event score change
const MAX_SINGLE_CHANGE = 10;

// Early-stage threshold
const EARLY_STAGE_THRESHOLD = 5;
const EARLY_STAGE_WEIGHT = 0.5;

export type ReputationEvent =
  | "MATCH_ACCEPTED"
  | "MATCH_PROPOSED"
  | "MATCH_DECLINED_BY_OWNER"
  | "NEGOTIATION_AGREED"
  | "NEGOTIATION_DECLINED"
  | "MATCH_COMPLETED"
  | "CONTEXT_UPDATED";

export interface ReputationBreakdown {
  agent_id: string;
  score: number;
  freshness_state: string;
  components: {
    match_acceptance_rate: { value: number; score: number; weight: number };
    negotiation_success_rate: { value: number; score: number; weight: number };
    context_freshness: { score: number; weight: number; days_since_update: number };
    completed_matches: { count: number; score: number; weight: number };
  };
  interaction_count: number;
  is_early_stage: boolean;
}

/**
 * Record a reputation event and recalculate the score.
 * Updates raw counters on Agent, then calls recalculateReputation().
 */
export async function recordEvent(
  agentInternalId: string,
  event: ReputationEvent
): Promise<void> {
  const updateData: Record<string, { increment: number }> = {};

  switch (event) {
    case "MATCH_ACCEPTED":
      // Owner said "yes" — only increment accepted count (proposed count
      // was already incremented via MATCH_PROPOSED when the match was proposed)
      updateData.totalAcceptedByOwner = { increment: 1 };
      updateData.interactionCount = { increment: 1 };
      break;

    case "MATCH_PROPOSED":
      // Match was proposed to the owner — increment proposed count
      // This fires in proposeMatch() for both agents
      updateData.totalProposedMatches = { increment: 1 };
      break;

    case "MATCH_DECLINED_BY_OWNER":
      // "Not now" = neutral — this function should NOT be called for "not now"
      // Kept as no-op safety net
      break;

    case "NEGOTIATION_AGREED":
      updateData.totalNegotiationsAgreed = { increment: 1 };
      updateData.totalInitiatedNegotiations = { increment: 1 };
      updateData.interactionCount = { increment: 1 };
      break;

    case "NEGOTIATION_DECLINED":
      updateData.totalInitiatedNegotiations = { increment: 1 };
      updateData.interactionCount = { increment: 1 };
      break;

    case "MATCH_COMPLETED":
      updateData.reputationCompletedMatches = { increment: 1 };
      updateData.interactionCount = { increment: 1 };
      break;

    case "CONTEXT_UPDATED":
      // No counter changes — freshness component is computed from AgentContext
      updateData.interactionCount = { increment: 1 };
      break;
  }

  await prisma.agent.update({
    where: { id: agentInternalId },
    data: updateData,
  });

  await recalculateReputation(agentInternalId);
}

/**
 * Recalculate the full reputation score from component values.
 * Applies early-stage weighting and caps single-event change at 10 points.
 */
export async function recalculateReputation(
  agentInternalId: string
): Promise<number> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentInternalId },
    include: { context: true },
  });

  if (!agent) throw new Error(`Agent not found: ${agentInternalId}`);

  const previousScore = agent.reputationScore;

  // Component 1: Match acceptance rate (0–100)
  let acceptanceScore = 0;
  if (agent.totalProposedMatches > 0) {
    const rate = agent.totalAcceptedByOwner / agent.totalProposedMatches;
    acceptanceScore = rate * 100;
  }

  // Component 2: Negotiation success rate (0–100)
  let negotiationScore = 0;
  if (agent.totalInitiatedNegotiations > 0) {
    const rate = agent.totalNegotiationsAgreed / agent.totalInitiatedNegotiations;
    negotiationScore = rate * 100;
  }

  // Component 3: Context freshness (0–100)
  const freshnessState = (agent.context?.freshnessState ?? "INACTIVE") as
    | "ACTIVE"
    | "AGING"
    | "STALE"
    | "INACTIVE";
  const freshnessScore = getFreshnessScore(freshnessState);

  // Component 4: Completed matches — logarithmic scale (0–100)
  // log2(count + 1) scaled so that ~64 matches = 100
  const completedScore = Math.min(
    100,
    (Math.log2(agent.reputationCompletedMatches + 1) / Math.log2(65)) * 100
  );

  // Weighted total
  let rawScore =
    acceptanceScore * WEIGHT_ACCEPTANCE +
    negotiationScore * WEIGHT_NEGOTIATION +
    freshnessScore * WEIGHT_FRESHNESS +
    completedScore * WEIGHT_COMPLETED;

  // Early-stage weighting: blend towards 40 (starting score)
  if (agent.interactionCount < EARLY_STAGE_THRESHOLD) {
    rawScore = rawScore * EARLY_STAGE_WEIGHT + 40 * (1 - EARLY_STAGE_WEIGHT);
  }

  // Cap change at ±10 points from previous score
  let newScore = rawScore;
  const delta = newScore - previousScore;
  if (Math.abs(delta) > MAX_SINGLE_CHANGE) {
    newScore = previousScore + Math.sign(delta) * MAX_SINGLE_CHANGE;
  }

  // Clamp to 0–100
  newScore = Math.max(0, Math.min(100, newScore));

  // Update raw component rates for transparency
  const acceptanceRate =
    agent.totalProposedMatches > 0
      ? agent.totalAcceptedByOwner / agent.totalProposedMatches
      : 0;
  const negotiationRate =
    agent.totalInitiatedNegotiations > 0
      ? agent.totalNegotiationsAgreed / agent.totalInitiatedNegotiations
      : 0;

  await prisma.agent.update({
    where: { id: agentInternalId },
    data: {
      reputationScore: newScore,
      reputationAcceptanceRate: acceptanceRate,
      reputationNegotiationRate: negotiationRate,
    },
  });

  return newScore;
}

/**
 * Get full reputation breakdown for an agent.
 * Used by get_reputation() MCP tool.
 */
export async function getReputationBreakdown(
  agentExternalId: string
): Promise<ReputationBreakdown> {
  const agent = await prisma.agent.findUnique({
    where: { agentId: agentExternalId },
    include: { context: true },
  });

  if (!agent) throw new Error(`Agent not found: ${agentExternalId}`);

  const freshnessState = (agent.context?.freshnessState ?? "INACTIVE") as
    | "ACTIVE"
    | "AGING"
    | "STALE"
    | "INACTIVE";

  const daysSinceUpdate = agent.context
    ? Math.floor(
        (Date.now() - agent.context.lastSignificantUpdateAt.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : -1;

  const acceptanceRate =
    agent.totalProposedMatches > 0
      ? agent.totalAcceptedByOwner / agent.totalProposedMatches
      : 0;
  const negotiationRate =
    agent.totalInitiatedNegotiations > 0
      ? agent.totalNegotiationsAgreed / agent.totalInitiatedNegotiations
      : 0;

  const completedScore = Math.min(
    100,
    (Math.log2(agent.reputationCompletedMatches + 1) / Math.log2(65)) * 100
  );

  return {
    agent_id: agent.agentId,
    score: Math.round(agent.reputationScore),
    freshness_state: freshnessState,
    components: {
      match_acceptance_rate: {
        value: Number(acceptanceRate.toFixed(2)),
        score: Math.round(acceptanceRate * 100),
        weight: WEIGHT_ACCEPTANCE,
      },
      negotiation_success_rate: {
        value: Number(negotiationRate.toFixed(2)),
        score: Math.round(negotiationRate * 100),
        weight: WEIGHT_NEGOTIATION,
      },
      context_freshness: {
        score: getFreshnessScore(freshnessState),
        weight: WEIGHT_FRESHNESS,
        days_since_update: daysSinceUpdate,
      },
      completed_matches: {
        count: agent.reputationCompletedMatches,
        score: Math.round(completedScore),
        weight: WEIGHT_COMPLETED,
      },
    },
    interaction_count: agent.interactionCount,
    is_early_stage: agent.interactionCount < EARLY_STAGE_THRESHOLD,
  };
}
