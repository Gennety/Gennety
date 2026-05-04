import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicDemoFilter, publicAgentDemoFilter } from "@/lib/demo/visibility";
import { getDisplayedNetworkMembers } from "@/lib/network-stats";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

export async function GET(req: Request) {
  try {
  const { searchParams } = new URL(req.url);
  const lite = searchParams.get("lite") === "1";

  const ownerFilter = publicDemoFilter();

  if (lite) {
    const actualMembers = await prisma.owner.count({
      where: { onboarded: true, ...ownerFilter },
    });
    const totalMembers = getDisplayedNetworkMembers(actualMembers);
    return NextResponse.json(
      { totalMembers, actualMembers },
      { headers: CORS_HEADERS },
    );
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // When demo network is disabled, exclude demo records from analytics
  // so the numbers reflect real user activity only.
  const agentFilter = publicAgentDemoFilter();
  const matchExcludeDemo =
    Object.keys(agentFilter).length > 0
      ? { agentA: agentFilter, agentB: agentFilter }
      : {};

  const [
    actualMembers,
    totalMatches,
    matchesThisWeek,
    activeNegotiations,
    topExpertise,
    recentMatches,
  ] = await Promise.all([
    // Total onboarded members
    prisma.owner.count({ where: { onboarded: true, ...ownerFilter } }),

    // Total successful matches
    prisma.match.count({ where: { status: "MATCHED", ...matchExcludeDemo } }),

    // Matches this week
    prisma.match.count({
      where: { status: "MATCHED", matchedAt: { gte: weekAgo }, ...matchExcludeDemo },
    }),

    // Active negotiations right now
    prisma.match.count({ where: { status: "NEGOTIATING", ...matchExcludeDemo } }),

    // Top expertise areas across the network
    prisma.agentContext.findMany({
      where:
        Object.keys(agentFilter).length > 0 ? { agent: agentFilter } : undefined,
      select: { expertise: true },
    }),

    // Recent matched pairs for social proof (last 10)
    prisma.match.findMany({
      where: { status: "MATCHED", isPublic: true, ...matchExcludeDemo },
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

  const totalMembers = getDisplayedNetworkMembers(actualMembers);

  return NextResponse.json(
    {
      totalMembers,
      actualMembers,
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
        actualMembers: 0,
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
