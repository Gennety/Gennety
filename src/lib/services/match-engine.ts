import { prisma } from "@/lib/db";
import { generateEmbedding, contextToEmbeddingText } from "@/lib/embeddings";
import { getFreshnessWeight } from "@/lib/services/freshness";

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

  const minSimilarity = filters?.minSimilarity ?? 0.7;
  const limit = filters?.limit ?? 10;

  // Build the embedding text from agent's context for comparison
  const embeddingText = contextToEmbeddingText({
    currentWork: agent.context.currentWork,
    expertise: agent.context.expertise,
    lookingFor: agent.context.lookingFor,
    notLookingFor: agent.context.notLookingFor,
    recentProblems: agent.context.recentProblems,
    networkingGoal: agent.context.networkingGoal,
  });
  const queryEmbedding = await generateEmbedding(embeddingText);

  // Semantic search via pgvector — exclude STALE and INACTIVE agents
  const goalFilter = filters?.networkingGoal ?? null;

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
      freshness_state: string;
      reputation_score: number;
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
      ac.freshness_state,
      a.reputation_score
    FROM agent_contexts ac
    JOIN agents a ON a.id = ac.agent_id
    WHERE ac.agent_id != ${agent.id}
      AND a.is_active = true
      AND ac.embedding IS NOT NULL
      AND ac.freshness_state NOT IN ('STALE', 'INACTIVE')
      AND (${goalFilter}::text IS NULL OR ac.networking_goal = ${goalFilter})
      AND (1 - (ac.embedding <=> ${queryEmbedding}::vector)) > ${minSimilarity}
    ORDER BY similarity DESC
    LIMIT ${limit * 2}
  `;

  // Apply composite ranking: semantic(70%) + reputation(20%) + freshness(10%)
  const ranked = results.map((r) => {
    const semanticScore = Number(r.similarity);
    const reputationNormalized = Number(r.reputation_score) / 100;
    const freshnessWeight = getFreshnessWeight(
      r.freshness_state as "ACTIVE" | "AGING" | "STALE" | "INACTIVE"
    );

    const finalScore =
      semanticScore * 0.70 +
      reputationNormalized * 0.20 +
      freshnessWeight * 0.10;

    return {
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
    };
  });

  // Sort by final composite score and return top N
  ranked.sort((a, b) => b.finalScore - a.finalScore);
  return ranked.slice(0, limit);
}
