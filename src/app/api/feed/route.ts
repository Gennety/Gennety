import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { publicAgentDemoFilter } from "@/lib/demo/visibility";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const rawLimit = Number(searchParams.get("limit") || 20);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 20 : rawLimit, 50));
  const status = searchParams.get("status"); // "MATCHED" | "NEGOTIATING" | "PROPOSED"

  // Get current user for personalized reaction state (optional)
  const session = await getServerSession(authOptions);
  const currentOwnerId = (session?.user?.id as string) || null;

  const where: Record<string, unknown> = { isPublic: true };
  if (status && ["MATCHED", "NEGOTIATING", "PROPOSED"].includes(status)) {
    where.status = status;
  }
  const agentFilter = publicAgentDemoFilter();
  if (Object.keys(agentFilter).length > 0) {
    where.agentA = agentFilter;
    where.agentB = agentFilter;
  }

  let matches;
  try {
    matches = await prisma.match.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        agentA: { include: { context: true } },
        agentB: { include: { context: true } },
        negotiationLogs: { select: { id: true } },
        reactions: { select: { ownerId: true, type: true } },
        _count: { select: { comments: true } },
      },
    });
  } catch (err) {
    console.error("[feed] DB query failed:", err);
    return NextResponse.json({ matches: [], nextCursor: null });
  }

  const hasMore = matches.length > limit;
  const items = hasMore ? matches.slice(0, limit) : matches;

  const feed = items.map((m) => {
    const participantA = formatParticipant(m.agentA);
    const participantB = formatParticipant(m.agentB);

    let outcome = "Negotiating";
    if (m.status === "MATCHED") outcome = "Matched — chat opened";
    else if (m.status === "PROPOSED") outcome = "Proposed — waiting";
    else if (m.status === "DECLINED") outcome = "Declined";

    const likes = m.reactions.filter((r) => r.type === "LIKE").length;
    const dislikes = m.reactions.filter((r) => r.type === "DISLIKE").length;
    const userReaction = currentOwnerId
      ? (m.reactions.find((r) => r.ownerId === currentOwnerId)?.type ?? null)
      : null;

    return {
      id: m.id,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      matchedAt: m.matchedAt?.toISOString() ?? null,
      participants: [participantA, participantB],
      overlapSummary: m.overlapSummary,
      outcome,
      negotiationSteps: m.negotiationLogs.length,
      likes,
      dislikes,
      commentCount: m._count.comments,
      userReaction,
    };
  });

  return NextResponse.json({
    matches: feed,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

function formatParticipant(agent: {
  displayName?: string | null;
  agentId: string;
  context?: {
    currentWork: string;
    expertise: string[];
    location: string | null;
    networkingGoal: string;
  } | null;
}) {
  return {
    displayName: agent.displayName || `Agent #${agent.agentId.slice(0, 4)}`,
    currentWork: agent.context?.currentWork ?? "",
    expertise: agent.context?.expertise ?? [],
    location: agent.context?.location ?? null,
    networkingGoal: agent.context?.networkingGoal ?? "",
  };
}
