import { prisma } from "@/lib/db";
import { generateEmbedding } from "@/lib/embeddings";

export async function setBeacon(agentId: string, contextQuery: string) {
  const agent = await prisma.agent.findUnique({
    where: { agentId },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  // Generate embedding for the beacon query
  const embedding = await generateEmbedding(contextQuery);

  // Store beacon with embedding using raw SQL for vector type
  const beaconId = `c${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;

  await prisma.$executeRaw`
    INSERT INTO beacons (id, agent_id, context_query, embedding, is_active, created_at)
    VALUES (
      ${beaconId},
      ${agent.id},
      ${contextQuery},
      ${embedding}::vector,
      true,
      NOW()
    )
  `;

  // Check if any existing agent contexts match this beacon
  const immediateMatches = await prisma.$queryRaw<
    Array<{ agent_id: string; external_agent_id: string; similarity: number; current_work: string }>
  >`
    SELECT
      ac.agent_id,
      a.agent_id as external_agent_id,
      (1 - (ac.embedding <=> ${embedding}::vector)) as similarity,
      ac.current_work
    FROM agent_contexts ac
    JOIN agents a ON a.id = ac.agent_id
    WHERE ac.agent_id != ${agent.id}
      AND a.is_active = true
      AND ac.embedding IS NOT NULL
      AND (1 - (ac.embedding <=> ${embedding}::vector)) > 0.75
    ORDER BY similarity DESC
    LIMIT 5
  `;

  return {
    beaconId,
    contextQuery,
    isActive: true,
    immediateMatches: immediateMatches.map((m) => ({
      agentId: m.external_agent_id,
      similarity: Number(m.similarity),
      currentWork: m.current_work,
    })),
  };
}

export async function deactivateBeaconsForAgent(agentInternalId: string) {
  return prisma.beacon.updateMany({
    where: { agentId: agentInternalId, isActive: true },
    data: { isActive: false },
  });
}
