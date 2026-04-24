import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

export async function GET() {
  try {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalMembers,
    totalMatches,
    matchesThisWeek,
    activeNegotiations,
    topExpertise,
    recentMatches,
  ] = await Promise.all([
    // Total onboarded members
    prisma.owner.count({ where: { onboarded: true } }),

    // Total successful matches
    prisma.match.count({ where: { status: "MATCHED" } }),

    // Matches this week
    prisma.match.count({
      where: { status: "MATCHED", matchedAt: { gte: weekAgo } },
    }),

    // Active negotiations right now
    prisma.match.count({ where: { status: "NEGOTIATING" } }),

    // Top expertise areas across the network
    prisma.agentContext.findMany({
      select: { expertise: true },
    }),

    // Recent matched pairs for social proof (last 10)
    prisma.match.findMany({
      where: { status: "MATCHED", isPublic: true },
      orderBy: { matchedAt: "desc" },
      take: 5,
      include: {
        agentA: { include: { context: true } },
        agentB: { include: { context: true } },
      },
    }),
  ]);

  // Aggregate top expertise tags
  const tagCounts: Record<string, number> = {};
  for (const ctx of topExpertise) {
    for (const tag of ctx.expertise) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));

  // Format recent matches for display
  const recentMatchesFmt = recentMatches.map((m) => ({
    id: m.id,
    overlapSummary: m.overlapSummary,
    matchedAt: m.matchedAt?.toISOString() ?? null,
    personA: {
      displayName: m.agentA.displayName || "Member",
      currentWork: m.agentA.context?.currentWork ?? "",
      networkingGoal: m.agentA.context?.networkingGoal ?? "",
    },
    personB: {
      displayName: m.agentB.displayName || "Member",
      currentWork: m.agentB.context?.currentWork ?? "",
      networkingGoal: m.agentB.context?.networkingGoal ?? "",
    },
  }));

  return NextResponse.json(
    {
      totalMembers,
      totalMatches,
      matchesThisWeek,
      activeNegotiations,
      topExpertise: sortedTags,
      recentMatches: recentMatchesFmt,
    },
    { headers: CORS_HEADERS },
  );
  } catch {
    return NextResponse.json(
      {
        totalMembers: 0,
        totalMatches: 0,
        matchesThisWeek: 0,
        activeNegotiations: 0,
        topExpertise: [],
        recentMatches: [],
      },
      { headers: CORS_HEADERS },
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
