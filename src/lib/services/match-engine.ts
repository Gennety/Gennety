import { prisma } from "@/lib/db";
import { generateEmbeddingWithUsage, contextToEmbeddingText } from "@/lib/embeddings";
import { getFreshnessWeight } from "@/lib/services/freshness";
import {
  areNetworkingGoalsCompatible,
  getCompatibleNetworkingGoals,
  getNetworkingGoalScoreAdjustment,
} from "@/lib/networking-goal";
import type { NetworkingGoal } from "@/types/context";
import {
  SEARCH_CUTOFF_MS,
  SEARCH_BOOST_WINDOW_MS,
  LIVENESS_BOOST,
} from "@/lib/config/liveness";

interface MatchResult {
  agentId: string;
  agentExternalId: string;
  similarity: number;
  finalScore: number;
  reputationScore: number;
  freshnessState: string;
  currentWork: string;
  expertise: string[];
  lookingFor: string;
  networkingGoal: string;
  location: string | null;
  ownerProfession: string | null;
  ownerDomain: string | null;
  agentSpecialization: string | null;
}

export async function findMatches(
  agentId: string,
  filters?: { networkingGoal?: string; minSimilarity?: number; limit?: number }
): Promise<MatchResult[]> {
  const agent = await prisma.agent.findUnique({
    where: { agentId },
    include: { context: true },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);
  if (!agent.context) throw new Error(`Agent has no published context: ${agentId}`);
  if (agent.searchPaused) {
    throw new Error("Match search is paused by the owner. Resume search before calling find_matches.");
  }

  const minSimilarity = filters?.minSimilarity ?? 0.7;
  const limit = filters?.limit ?? 10;

  // Build the embedding text from agent's full context (all four sources)
  const embeddingText = contextToEmbeddingText({
    currentWork: agent.context.currentWork,
    expertise: agent.context.expertise,
    lookingFor: agent.context.lookingFor,
    notLookingFor: agent.context.notLookingFor,
    recentProblems: agent.context.recentProblems,
    recentWins: agent.context.recentWins,
    networkingGoal: agent.context.networkingGoal,
    ownerProfession: agent.context.ownerProfession,
    ownerDomain: agent.context.ownerDomain,
    ownerGoals: agent.context.ownerGoals,
    agentSpecialization: agent.context.agentSpecialization,
    agentDomains: agent.context.agentDomains,
    collaborationStyle: agent.context.collaborationStyle,
  });
  const { embedding: queryEmbedding } = await generateEmbeddingWithUsage(embeddingText, {
    operation: "find_matches",
    ownerId: agent.ownerId,
    agentId: agent.id,
    metadata: {
      min_similarity: minSimilarity,
      limit,
    },
  });

  // Semantic search via pgvector — exclude STALE/INACTIVE agents and liveness cutoff
  const seekerGoal = agent.context.networkingGoal as NetworkingGoal;
  const explicitGoalFilter = (filters?.networkingGoal as NetworkingGoal | undefined) ?? null;
  const compatibleGoals = explicitGoalFilter
    ? [explicitGoalFilter]
    : getCompatibleNetworkingGoals(seekerGoal);
  const livenessCutoff = new Date(Date.now() - SEARCH_CUTOFF_MS);

  const results = await prisma.$queryRaw<
    Array<{
      agent_id: string;
      external_agent_id: string;
      similarity: number;
      current_work: string;
      expertise: string[];
      looking_for: string;
      networking_goal: string;
      location: string | null;
      owner_profession: string | null;
      owner_domain: string | null;
      agent_specialization: string | null;
      freshness_state: string;
      reputation_score: number;
      last_active_at: Date;
    }>
  >`
    SELECT
      ac.agent_id,
      a.agent_id as external_agent_id,
      (1 - (ac.embedding <=> ${queryEmbedding}::vector)) as similarity,
      ac.current_work,
      ac.expertise,
      ac.looking_for,
      ac.networking_goal,
      ac.location,
      ac.owner_profession,
      ac.owner_domain,
      ac.agent_specialization,
      ac.freshness_state,
      a.reputation_score,
      a.last_active_at
    FROM agent_contexts ac
    JOIN agents a ON a.id = ac.agent_id
    WHERE ac.agent_id != ${agent.id}
      AND a.is_active = true
      AND a.search_paused = false
      AND ac.embedding IS NOT NULL
      AND ac.freshness_state NOT IN ('STALE', 'INACTIVE')
      AND a.last_active_at > ${livenessCutoff}
      AND (1 - (ac.embedding <=> ${queryEmbedding}::vector)) > ${minSimilarity}
    ORDER BY similarity DESC
    LIMIT ${limit * 4}
  `;

  // Apply composite ranking: semantic(70%) + reputation(20%) + freshness(10%) + liveness boost
  const boostCutoff = Date.now() - SEARCH_BOOST_WINDOW_MS;
  const ranked = results.flatMap((r) => {
    const candidateGoal = r.networking_goal as NetworkingGoal;
    const goalAllowed = explicitGoalFilter
      ? candidateGoal === explicitGoalFilter
      : compatibleGoals.includes(candidateGoal);

    if (!goalAllowed || !areNetworkingGoalsCompatible(seekerGoal, candidateGoal)) {
      return [];
    }

    const semanticScore = Number(r.similarity);
    const reputationNormalized = Number(r.reputation_score) / 100;
    const freshnessWeight = getFreshnessWeight(
      r.freshness_state as "ACTIVE" | "AGING" | "STALE" | "INACTIVE"
    );

    // Agents active within the last 24h get a small ranking boost
    const lastActive = new Date(r.last_active_at).getTime();
    const livenessBoost = lastActive > boostCutoff ? LIVENESS_BOOST : 0;
    const goalAdjustment = getNetworkingGoalScoreAdjustment(seekerGoal, candidateGoal);

    const finalScore =
      semanticScore * 0.70 +
      reputationNormalized * 0.20 +
      freshnessWeight * 0.10 +
      livenessBoost +
      goalAdjustment;

    return [{
      agentId: r.agent_id,
      agentExternalId: r.external_agent_id,
      similarity: semanticScore,
      finalScore,
      reputationScore: Math.round(Number(r.reputation_score)),
      freshnessState: r.freshness_state,
      currentWork: r.current_work,
      expertise: r.expertise,
      lookingFor: r.looking_for,
      networkingGoal: r.networking_goal,
      location: r.location,
      ownerProfession: r.owner_profession,
      ownerDomain: r.owner_domain,
      agentSpecialization: r.agent_specialization,
    }];
  });

  // Sort by final composite score and return top N
  ranked.sort((a, b) => b.finalScore - a.finalScore);
  return ranked.slice(0, limit);
}
