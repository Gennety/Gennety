import { prisma } from "@/lib/db";
import { generateEmbedding, contextToEmbeddingText } from "@/lib/embeddings";

interface MatchResult {
  agentId: string;
  agentExternalId: string;
  similarity: number;
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

  // Semantic search via pgvector cosine similarity
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
      ac.location
    FROM agent_contexts ac
    JOIN agents a ON a.id = ac.agent_id
    WHERE ac.agent_id != ${agent.id}
      AND a.is_active = true
      AND ac.embedding IS NOT NULL
      AND (${goalFilter}::text IS NULL OR ac.networking_goal = ${goalFilter})
      AND (1 - (ac.embedding <=> ${queryEmbedding}::vector)) > ${minSimilarity}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;

  return results.map((r) => ({
    agentId: r.agent_id,
    agentExternalId: r.external_agent_id,
    similarity: Number(r.similarity),
    currentWork: r.current_work,
    expertise: r.expertise,
    lookingFor: r.looking_for,
    networkingGoal: r.networking_goal,
    location: r.location,
  }));
}
