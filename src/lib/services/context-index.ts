import { prisma } from "@/lib/db";
import { generateEmbeddingWithUsage, contextToEmbeddingText } from "@/lib/embeddings";
import { ContextSchema } from "@/types/context";
import {
  computeContextHash,
  isSignificantUpdate,
  updateFreshness,
} from "@/lib/services/freshness";
import { getPrivacySyncStatus } from "@/lib/services/privacy-sync";
import { recordEvent } from "@/lib/services/reputation";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";

interface RawContextInput {
  // From USER.md
  owner_name?: string;
  owner_location?: string;
  owner_profession?: string;
  owner_domain?: string;
  owner_experience?: string;
  owner_goals?: string;
  // From AGENTS.md
  agent_specialization?: string;
  agent_domains?: string[];
  agent_constraints?: string;
  // From SOUL.md
  collaboration_style?: string;
  communication_style?: string;
  // From MEMORY.md
  current_work: string;
  expertise: string[];
  looking_for: string;
  not_looking_for?: string;
  recent_problems?: string;
  recent_wins?: string;
  location?: string;
  networking_goal: string;
}

export async function publishContext(agentId: string, rawContext: RawContextInput) {
  const context = ContextSchema.parse(rawContext);
  const agent = await prisma.agent.findUnique({
    where: { agentId },
    include: { context: true, owner: true },
  });

  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const privacySync = await getPrivacySyncStatus(agent.id);
  const effectiveNetworkingGoal = agent.owner.networkingGoal ?? context.networking_goal;

  // Compute hash of KEY fields (includes new fields for significant change detection)
  const newKeyHash = computeContextHash({
    current_work: context.current_work,
    looking_for: context.looking_for,
    networking_goal: effectiveNetworkingGoal,
    recent_problems: context.recent_problems,
    owner_profession: context.owner_profession,
    owner_domain: context.owner_domain,
    agent_specialization: context.agent_specialization,
  });
  const significant =
    privacySync?.pending === true ||
    isSignificantUpdate(newKeyHash, agent.context?.previousHash ?? null);
  const contextChanged = significant;

  // Generate embedding from richer context text (all four sources)
  const embeddingText = contextToEmbeddingText({
    currentWork: context.current_work,
    expertise: context.expertise,
    lookingFor: context.looking_for,
    notLookingFor: context.not_looking_for,
    recentProblems: context.recent_problems,
    recentWins: context.recent_wins,
    networkingGoal: effectiveNetworkingGoal,
    ownerProfession: context.owner_profession,
    ownerDomain: context.owner_domain,
    ownerGoals: context.owner_goals,
    agentSpecialization: context.agent_specialization,
    agentDomains: context.agent_domains,
    collaborationStyle: context.collaboration_style,
  });
  const { embedding } = await generateEmbeddingWithUsage(embeddingText, {
    operation: "publish_context",
    ownerId: agent.ownerId,
    agentId: agent.id,
    metadata: {
      significant,
      networking_goal: effectiveNetworkingGoal,
      text_length: embeddingText.length,
    },
  });

  // Upsert context with embedding — includes all new fields
  await prisma.$executeRaw`
    INSERT INTO agent_contexts (
      id, agent_id,
      owner_name, owner_location, owner_profession, owner_domain, owner_experience, owner_goals,
      agent_specialization, agent_domains, agent_constraints,
      collaboration_style, communication_style,
      current_work, expertise, looking_for, not_looking_for, recent_problems, recent_wins,
      location, networking_goal,
      embedding, updated_at, previous_hash, freshness_state, last_significant_update_at
    )
    VALUES (
      ${generateCuid()},
      ${agent.id},
      ${context.owner_name ?? null},
      ${context.owner_location ?? null},
      ${context.owner_profession ?? null},
      ${context.owner_domain ?? null},
      ${context.owner_experience ?? null},
      ${context.owner_goals ?? null},
      ${context.agent_specialization ?? null},
      ${context.agent_domains ?? []},
      ${context.agent_constraints ?? null},
      ${context.collaboration_style ?? null},
      ${context.communication_style ?? null},
      ${context.current_work},
      ${context.expertise},
      ${context.looking_for},
      ${context.not_looking_for ?? null},
      ${context.recent_problems ?? null},
      ${context.recent_wins ?? null},
      ${context.location ?? null},
      ${effectiveNetworkingGoal},
      ${embedding}::vector,
      NOW(),
      ${newKeyHash},
      'ACTIVE',
      NOW()
    )
    ON CONFLICT (agent_id) DO UPDATE SET
      owner_name = EXCLUDED.owner_name,
      owner_location = EXCLUDED.owner_location,
      owner_profession = EXCLUDED.owner_profession,
      owner_domain = EXCLUDED.owner_domain,
      owner_experience = EXCLUDED.owner_experience,
      owner_goals = EXCLUDED.owner_goals,
      agent_specialization = EXCLUDED.agent_specialization,
      agent_domains = EXCLUDED.agent_domains,
      agent_constraints = EXCLUDED.agent_constraints,
      collaboration_style = EXCLUDED.collaboration_style,
      communication_style = EXCLUDED.communication_style,
      current_work = EXCLUDED.current_work,
      expertise = EXCLUDED.expertise,
      looking_for = EXCLUDED.looking_for,
      not_looking_for = EXCLUDED.not_looking_for,
      recent_problems = EXCLUDED.recent_problems,
      recent_wins = EXCLUDED.recent_wins,
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
      data: { isActive: false, preservable: false },
    });
  }

  // Check if new context triggers any existing beacons
  const triggeredBeacons = agent.searchPaused
    ? []
    : await prisma.$queryRaw<
        Array<{ id: string; agent_id: string; context_query: string }>
      >`
        SELECT b.id, b.agent_id, b.context_query
        FROM beacons b
        JOIN agents beacon_agent ON beacon_agent.id = b.agent_id
        WHERE b.is_active = true
          AND beacon_agent.search_paused = false
          AND b.agent_id != ${agent.id}
          AND b.embedding IS NOT NULL
          AND (b.networking_goal_filter IS NULL OR b.networking_goal_filter = ${effectiveNetworkingGoal})
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

    await Promise.all(
      triggeredBeacons.map((beacon) =>
        recordAnalyticsEvent({
          type: "BEACON_TRIGGERED",
          agentId: beacon.agent_id,
          beaconId: beacon.id,
          metadata: {
            context_query: beacon.context_query,
            matched_agent_id: agent.id,
            matched_external_agent_id: agent.agentId,
          },
        })
      )
    );
  }

  // Update freshness state based on whether this was a significant update
  const freshnessState = await updateFreshness(agent.id, significant);

  if (privacySync?.pending) {
    await prisma.inboxEvent.updateMany({
      where: {
        agentId: agent.id,
        type: "PRIVACY_SETTINGS_CHANGED",
        createdAt: { lte: new Date() },
      },
      data: { dismissedAt: new Date() },
    });
  }

  // If significant update, record reputation event
  if (significant) {
    await recordEvent(agent.id, "CONTEXT_UPDATED");
  }

  await recordAnalyticsEvent({
    type: "CONTEXT_PUBLISHED",
    ownerId: agent.ownerId,
    agentId: agent.id,
    metadata: {
      significant,
      networking_goal: effectiveNetworkingGoal,
      previous_hash: agent.context?.previousHash ?? null,
      current_hash: newKeyHash,
      beacons_triggered: triggeredBeacons.length,
    },
  });

  return {
    published: true,
    contextChanged,
    networkingGoal: effectiveNetworkingGoal,
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
