import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateEmbeddingWithUsage } from "@/lib/embeddings";
import { getFreshnessWeight } from "@/lib/services/freshness";
import {
  SEARCH_CUTOFF_MS,
  SEARCH_BOOST_WINDOW_MS,
  LIVENESS_BOOST,
} from "@/lib/config/liveness";
import { demoConfig } from "@/lib/config/demo";
import { publicAgentDemoFilter } from "@/lib/demo/visibility";

/**
 * GET /api/search
 *
 * Query params:
 *   q     — search query text (optional)
 *   type  — "all" | "people" | "agents" | "matches" (default: "all")
 *   mode  — "search" | "leaderboard" | "trending" | "suggestions" (default: "search")
 *   limit — max results (1–50, default 20)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() || "";
  const type = searchParams.get("type") || "all";
  const mode = searchParams.get("mode") || "search";
  const rawLimit = Number(searchParams.get("limit") || 20);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 20 : rawLimit, 50));

  try {
    if (mode === "leaderboard") return await handleLeaderboard(limit);
    if (mode === "trending") return await handleTrending(limit);
    if (mode === "suggestions") return await handleSuggestions();
    if (!query) return await handleTrending(limit);
    if (type === "matches") return await handleMatchSearch(query, limit);
    return await handleSemanticSearch(query, type, limit);
  } catch (error) {
    console.error("[search] Error:", error);
    return NextResponse.json(
      { results: [], error: "Search failed" },
      { status: 500 }
    );
  }
}

/* ─── Semantic search on AgentContext embeddings ─── */

async function handleSemanticSearch(
  query: string,
  type: string,
  limit: number
) {
  const { embedding: queryEmbedding } = await generateEmbeddingWithUsage(query, {
    operation: "public_search_semantic",
    metadata: {
      query,
      type,
      limit,
    },
  });
  const livenessCutoff = new Date(Date.now() - SEARCH_CUTOFF_MS);
  const boostCutoff = Date.now() - SEARCH_BOOST_WINDOW_MS;
  const demoClause = demoConfig.enabled
    ? Prisma.sql``
    : Prisma.sql`AND a.is_demo = false`;

  const rows = await prisma.$queryRaw<
    Array<{
      agent_internal_id: string;
      agent_external_id: string;
      display_name: string | null;
      similarity: number;
      owner_name: string | null;
      owner_profession: string | null;
      owner_domain: string | null;
      owner_goals: string | null;
      owner_location: string | null;
      agent_specialization: string | null;
      agent_domains: string[];
      current_work: string;
      expertise: string[];
      looking_for: string;
      networking_goal: string;
      location: string | null;
      collaboration_style: string | null;
      freshness_state: string;
      reputation_score: number;
      completed_matches: number;
      last_active_at: Date;
    }>
  >`
    SELECT
      ac.agent_id        AS agent_internal_id,
      a.agent_id         AS agent_external_id,
      a.display_name,
      (1 - (ac.embedding <=> ${queryEmbedding}::vector)) AS similarity,
      ac.owner_name,
      ac.owner_profession,
      ac.owner_domain,
      ac.owner_goals,
      ac.owner_location,
      ac.agent_specialization,
      ac.agent_domains,
      ac.current_work,
      ac.expertise,
      ac.looking_for,
      ac.networking_goal,
      ac.location,
      ac.collaboration_style,
      ac.freshness_state,
      a.reputation_score,
      a.reputation_completed_matches AS completed_matches,
      a.last_active_at
    FROM agent_contexts ac
    JOIN agents a ON a.id = ac.agent_id
    WHERE a.is_active = true
      ${demoClause}
      AND ac.embedding IS NOT NULL
      AND ac.freshness_state NOT IN ('STALE', 'INACTIVE')
      AND a.last_active_at > ${livenessCutoff}
      AND (1 - (ac.embedding <=> ${queryEmbedding}::vector)) > 0.45
    ORDER BY similarity DESC
    LIMIT ${limit * 2}
  `;

  const ranked = rows.map((r) => {
    const sem = Number(r.similarity);
    const rep = Number(r.reputation_score) / 100;
    const fresh = getFreshnessWeight(
      r.freshness_state as "ACTIVE" | "AGING" | "STALE" | "INACTIVE"
    );
    const live =
      new Date(r.last_active_at).getTime() > boostCutoff ? LIVENESS_BOOST : 0;

    const finalScore = sem * 0.7 + rep * 0.2 + fresh * 0.1 + live;

    return {
      type: "agent" as const,
      id: r.agent_internal_id,
      agentId: r.agent_external_id,
      displayName:
        r.display_name ||
        r.owner_name ||
        `Agent ${r.agent_external_id.slice(0, 8)}`,
      ownerName: r.owner_name,
      ownerProfession: r.owner_profession,
      ownerDomain: r.owner_domain,
      agentSpecialization: r.agent_specialization,
      agentDomains: r.agent_domains,
      currentWork: r.current_work,
      expertise: r.expertise,
      lookingFor: r.looking_for,
      networkingGoal: r.networking_goal,
      location: r.location || r.owner_location,
      collaborationStyle: r.collaboration_style,
      freshnessState: r.freshness_state,
      reputationScore: Math.round(Number(r.reputation_score)),
      completedMatches: r.completed_matches,
      similarity: Math.round(sem * 100),
      finalScore: Math.round(finalScore * 100),
    };
  });

  ranked.sort((a, b) => b.finalScore - a.finalScore);

  return NextResponse.json({
    results: ranked.slice(0, limit),
    query,
    type,
  });
}

/* ─── Match search (semantic on participants + text on overlap) ─── */

async function handleMatchSearch(query: string, limit: number) {
  const { embedding: queryEmbedding } = await generateEmbeddingWithUsage(query, {
    operation: "public_search_matches",
    metadata: {
      query,
      limit,
    },
  });
  const demoClause = demoConfig.enabled
    ? Prisma.sql``
    : Prisma.sql`AND a.is_demo = false`;
  const agentFilter = publicAgentDemoFilter();
  const matchDemoFilter =
    Object.keys(agentFilter).length > 0
      ? { agentA: agentFilter, agentB: agentFilter }
      : {};

  // Find agents whose context is similar to the query
  const similarAgents = await prisma.$queryRaw<
    Array<{ agent_id: string; similarity: number }>
  >`
    SELECT
      ac.agent_id,
      (1 - (ac.embedding <=> ${queryEmbedding}::vector)) AS similarity
    FROM agent_contexts ac
    JOIN agents a ON a.id = ac.agent_id
    WHERE a.is_active = true
      ${demoClause}
      AND ac.embedding IS NOT NULL
      AND (1 - (ac.embedding <=> ${queryEmbedding}::vector)) > 0.45
    ORDER BY similarity DESC
    LIMIT 50
  `;

  const agentIds = similarAgents.map((a) => a.agent_id);
  const simMap = new Map(
    similarAgents.map((a) => [a.agent_id, Number(a.similarity)])
  );

  // Also include text matches on overlapSummary
  const textMatchIds: string[] = [];
  const textMatches = await prisma.match.findMany({
    where: {
      isPublic: true,
      ...matchDemoFilter,
      overlapSummary: { contains: query, mode: "insensitive" },
    },
    select: { id: true },
    take: 20,
  });
  textMatchIds.push(...textMatches.map((m) => m.id));

  // Build OR condition
  const orConditions: Record<string, unknown>[] = [];
  if (agentIds.length > 0) {
    orConditions.push(
      { agentAId: { in: agentIds } },
      { agentBId: { in: agentIds } }
    );
  }
  if (textMatchIds.length > 0) {
    orConditions.push({ id: { in: textMatchIds } });
  }

  if (orConditions.length === 0) {
    return NextResponse.json({ results: [], query, type: "matches" });
  }

  const matches = await prisma.match.findMany({
    where: { isPublic: true, OR: orConditions, ...matchDemoFilter },
    take: limit * 2,
    orderBy: { createdAt: "desc" },
    include: {
      agentA: { include: { context: true } },
      agentB: { include: { context: true } },
      reactions: { select: { type: true } },
      _count: { select: { comments: true } },
    },
  });

  const scored = matches.map((m) => {
    const simA = simMap.get(m.agentAId) || 0;
    const simB = simMap.get(m.agentBId) || 0;
    const textBoost = textMatchIds.includes(m.id) ? 0.15 : 0;
    const maxSim = Math.max(simA, simB) + textBoost;
    return { match: m, similarity: Math.min(maxSim, 1) };
  });

  scored.sort((a, b) => b.similarity - a.similarity);

  return NextResponse.json({
    results: scored
      .slice(0, limit)
      .map((s) => formatMatchResult(s.match, Math.round(s.similarity * 100))),
    query,
    type: "matches",
  });
}

/* ─── Leaderboard: top agents by reputation ─── */

async function handleLeaderboard(limit: number) {
  // Exclude demo agents from leaderboard when demo network is disabled —
  // otherwise they'd inflate rankings with scripted activity.
  const agents = await prisma.agent.findMany({
    where: {
      isActive: true,
      context: { isNot: null },
      ...publicAgentDemoFilter(),
    },
    orderBy: { reputationScore: "desc" },
    take: limit,
    include: {
      context: true,
      owner: { select: { name: true } },
    },
  });

  const results = agents.map((a, i) => ({
    rank: i + 1,
    type: "agent" as const,
    id: a.id,
    agentId: a.agentId,
    displayName:
      a.displayName || a.owner.name || `Agent ${a.agentId.slice(0, 8)}`,
    ownerName: a.owner.name,
    ownerProfession: a.context?.ownerProfession || null,
    ownerDomain: a.context?.ownerDomain || null,
    agentSpecialization: a.context?.agentSpecialization || null,
    currentWork: a.context?.currentWork || "",
    expertise: a.context?.expertise || [],
    lookingFor: a.context?.lookingFor || "",
    networkingGoal: a.context?.networkingGoal || "",
    location: a.context?.location || null,
    reputationScore: Math.round(a.reputationScore),
    completedMatches: a.reputationCompletedMatches,
    freshnessState: a.context?.freshnessState || "INACTIVE",
  }));

  return NextResponse.json({ results, mode: "leaderboard" });
}

/* ─── Trending: recent matches with most engagement ─── */

async function handleTrending(limit: number) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const agentFilter = publicAgentDemoFilter();

  const matches = await prisma.match.findMany({
    where: {
      isPublic: true,
      createdAt: { gte: since },
      ...(Object.keys(agentFilter).length > 0
        ? { agentA: agentFilter, agentB: agentFilter }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
    include: {
      agentA: { include: { context: true } },
      agentB: { include: { context: true } },
      reactions: { select: { type: true } },
      _count: { select: { comments: true } },
    },
  });

  const scored = matches.map((m) => {
    const likes = m.reactions.filter((r) => r.type === "LIKE").length;
    const engagement = likes * 2 + m._count.comments;
    return { match: m, engagement };
  });

  scored.sort((a, b) => b.engagement - a.engagement);

  return NextResponse.json({
    results: scored
      .slice(0, limit)
      .map((s) => formatMatchResult(s.match, 0)),
    mode: "trending",
  });
}

/* ─── Suggestions: popular topics from agent expertise ─── */

async function handleSuggestions() {
  const demoWhereClause = demoConfig.enabled
    ? Prisma.sql``
    : Prisma.sql`AND a.is_demo = false`;
  const rows = await prisma.$queryRaw<
    Array<{ topic: string; cnt: bigint }>
  >`
    SELECT unnest(expertise) AS topic, count(*) AS cnt
    FROM agent_contexts
    JOIN agents a ON a.id = agent_contexts.agent_id
    WHERE TRUE
      ${demoWhereClause}
    GROUP BY topic
    ORDER BY cnt DESC
    LIMIT 12
  `;

  const topics = rows.map((r) => r.topic);

  // Also get popular networking goals
  const goals = await prisma.$queryRaw<
    Array<{ goal: string; cnt: bigint }>
  >`
    SELECT networking_goal AS goal, count(*) AS cnt
    FROM agent_contexts
    JOIN agents a ON a.id = agent_contexts.agent_id
    WHERE networking_goal IS NOT NULL
      ${demoWhereClause}
    GROUP BY networking_goal
    ORDER BY cnt DESC
    LIMIT 4
  `;

  const goalLabels = goals.map((g) => g.goal);

  return NextResponse.json({ topics, goals: goalLabels });
}

/* ─── Helpers ─── */

function formatMatchResult(
  m: {
    id: string;
    status: string;
    createdAt: Date;
    matchedAt: Date | null;
    overlapSummary: string;
    agentA: {
      agentId: string;
      displayName: string | null;
      context: {
        currentWork: string;
        expertise: string[];
        location: string | null;
        networkingGoal: string;
      } | null;
    };
    agentB: {
      agentId: string;
      displayName: string | null;
      context: {
        currentWork: string;
        expertise: string[];
        location: string | null;
        networkingGoal: string;
      } | null;
    };
    reactions: Array<{ type: string }>;
    _count: { comments: number };
  },
  similarity: number
) {
  const likes = m.reactions.filter((r) => r.type === "LIKE").length;
  return {
    type: "match" as const,
    id: m.id,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    matchedAt: m.matchedAt?.toISOString() || null,
    overlapSummary: m.overlapSummary,
    participants: [formatParticipant(m.agentA), formatParticipant(m.agentB)],
    likes,
    commentCount: m._count.comments,
    similarity,
  };
}

function formatParticipant(agent: {
  agentId: string;
  displayName: string | null;
  context: {
    currentWork: string;
    expertise: string[];
    location: string | null;
    networkingGoal: string;
  } | null;
}) {
  return {
    displayName:
      agent.displayName || `Agent #${agent.agentId.slice(0, 4)}`,
    currentWork: agent.context?.currentWork || "",
    expertise: agent.context?.expertise || [],
    location: agent.context?.location || null,
    networkingGoal: agent.context?.networkingGoal || "",
  };
}
