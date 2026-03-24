import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { confirmMatch, markDormant } from "@/lib/services/negotiation";

// GET /api/matches?ownerId=xxx — get all proposed/matched/dormant matches for an owner
export async function GET(request: NextRequest) {
  const ownerId = request.nextUrl.searchParams.get("ownerId");
  if (!ownerId) {
    return NextResponse.json({ error: "ownerId is required" }, { status: 400 });
  }

  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    include: { agent: true },
  });
  if (!owner || !owner.agent) {
    return NextResponse.json({ error: "Owner or agent not found" }, { status: 404 });
  }

  const matches = await prisma.match.findMany({
    where: {
      OR: [{ agentAId: owner.agent.id }, { agentBId: owner.agent.id }],
      status: { in: ["PROPOSED", "MATCHED", "DORMANT"] },
    },
    include: {
      agentA: { include: { owner: true, context: true } },
      agentB: { include: { owner: true, context: true } },
      chat: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const result = matches.map((m) => {
    const isAgentA = m.agentAId === owner.agent!.id;
    const otherAgent = isAgentA ? m.agentB : m.agentA;
    const framingForMe = isAgentA ? m.framingForA : m.framingForB;
    const confirmedByMe = isAgentA ? m.confirmedByA : m.confirmedByB;

    return {
      matchId: m.id,
      status: m.status,
      overlapSummary: m.overlapSummary,
      framingForMe,
      confirmedByMe,
      otherPerson: {
        name: otherAgent.owner.name,
        currentWork: otherAgent.context?.currentWork,
        expertise: otherAgent.context?.expertise,
        location: otherAgent.context?.location,
      },
      chatId: m.chat?.id ?? null,
      proposedAt: m.proposedAt,
      matchedAt: m.matchedAt,
    };
  });

  return NextResponse.json(result);
}

// POST /api/matches — confirm or mark dormant
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { matchId, ownerId, action } = body;

  if (!matchId || !ownerId || !action) {
    return NextResponse.json({ error: "matchId, ownerId, and action are required" }, { status: 400 });
  }

  try {
    if (action === "confirm") {
      const result = await confirmMatch(matchId, ownerId);
      return NextResponse.json(result);
    } else if (action === "dormant") {
      const result = await markDormant(matchId, ownerId);
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: "action must be 'confirm' or 'dormant'" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
