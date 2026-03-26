import { prisma } from "@/lib/db";
import { generateEmbedding, contextToEmbeddingText } from "@/lib/embeddings";
import { ContextSchema } from "@/types/context";
import {
  computeContextHash,
  isSignificantUpdate,
  updateFreshness,
} from "@/lib/services/freshness";
import { recordEvent } from "@/lib/services/reputation";

interface RawContextInput {
  current_work: string;
  expertise: string[];
  looking_for: string;
  not_looking_for?: string;
  recent_problems?: string;
  location?: string;
  networking_goal: string;
}

export async function publishContext(agentId: string, rawContext: RawContextInput) {
  const context = ContextSchema.parse(rawContext);
  const agent = await prisma.agent.findUnique({
    where: { agentId },
    include: { context: true },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  // Compute hash of KEY fields only (current_work, looking_for, recent_problems)
  const newKeyHash = computeContextHash({
    current_work: context.current_work,
    looking_for: context.looking_for,
    recent_problems: context.recent_problems,
  });
  const significant = isSignificantUpdate(newKeyHash, agent.context?.previousHash ?? null);
  const contextChanged = significant;

  // Generate embedding from context text
  const embeddingText = contextToEmbeddingText({
    currentWork: context.current_work,
    expertise: context.expertise,
    lookingFor: context.looking_for,
    notLookingFor: context.not_looking_for,
    recentProblems: context.recent_problems,
    networkingGoal: context.networking_goal,
  });
  const embedding = await generateEmbedding(embeddingText);

  // Upsert context with embedding
  await prisma.$executeRaw`
    INSERT INTO agent_contexts (id, agent_id, current_work, expertise, looking_for, not_looking_for, recent_problems, location, networking_goal, embedding, updated_at, previous_hash, freshness_state, last_significant_update_at)
    VALUES (
      ${generateCuid()},
      ${agent.id},
      ${context.current_work},
      ${context.expertise},
      ${context.looking_for},
      ${context.not_looking_for ?? null},
      ${context.recent_problems ?? null},
      ${context.location ?? null},
      ${context.networking_goal},
      ${embedding}::vector,
      NOW(),
      ${newKeyHash},
      'ACTIVE',
      NOW()
    )
    ON CONFLICT (agent_id) DO UPDATE SET
      current_work = EXCLUDED.current_work,
      expertise = EXCLUDED.expertise,
      looking_for = EXCLUDED.looking_for,
      not_looking_for = EXCLUDED.not_looking_for,
      recent_problems = EXCLUDED.recent_problems,
      location = EXCLUDED.location,
      networking_goal = EXCLUDED.networking_goal,
      embedding = EXCLUDED.embedding,
      updated_at = NOW(),
      previous_hash = EXCLUDED.previous_hash
  `;

  // If context changed significantly, deactivate old beacons
  if (contextChanged && agent.context) {
    await prisma.beacon.updateMany({
      where: { agentId: agent.id, isActive: true },
      data: { isActive: false },
    });
  }

  // Check if new context triggers any existing beacons
  const triggeredBeacons = await prisma.$queryRaw<
    Array<{ id: string; agent_id: string; context_query: string }>
  >`
    SELECT b.id, b.agent_id, b.context_query
    FROM beacons b
    WHERE b.is_active = true
      AND b.agent_id != ${agent.id}
      AND b.embedding IS NOT NULL
      AND (1 - (b.embedding <=> ${embedding}::vector)) > 0.75
    ORDER BY (1 - (b.embedding <=> ${embedding}::vector)) DESC
    LIMIT 10
  `;

  // Mark triggered beacons
  if (triggeredBeacons.length > 0) {
    await prisma.beacon.updateMany({
      where: { id: { in: triggeredBeacons.map((b) => b.id) } },
      data: { triggeredAt: new Date() },
    });
  }

  // Update freshness state based on whether this was a significant update
  const freshnessState = await updateFreshness(agent.id, significant);

  // If significant update, record reputation event
  if (significant) {
    await recordEvent(agent.id, "CONTEXT_UPDATED");
  }

  return {
    published: true,
    contextChanged,
    freshnessState,
    beaconsTriggered: triggeredBeacons.length,
    triggeredBeaconAgents: triggeredBeacons.map((b) => b.agent_id),
  };
}

function generateCuid(): string {
  // Simple cuid-like ID generation
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `c${timestamp}${random}`;
}
