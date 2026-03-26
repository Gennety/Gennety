import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { safeErrorResponse } from "@/lib/api-error";
import { MatchActionSchema } from "@/types/match-action";
import { ZodError } from "zod";
import { confirmMatch, markDormant } from "@/lib/services/negotiation";

// GET /api/matches — get all proposed/matched/dormant matches for an owner (requires auth)
export async function GET() {
  const auth = await getAuthenticatedOwner();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerId = auth.ownerId;

  let owner;
  try {
    owner = await prisma.owner.findUnique({
      where: { id: ownerId },
      include: { agent: true },
    });
  } catch {
    return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  }
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

  // Get the owner's agent context freshness state
  const agentContext = await prisma.agentContext.findUnique({
    where: { agentId: owner.agent.id },
    select: { freshnessState: true },
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

  return NextResponse.json({
    matches: result,
    freshnessState: agentContext?.freshnessState ?? null,
  });

  return NextResponse.json(result);
}

// POST /api/matches — confirm or mark dormant (requires auth)
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOwner();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  let validated;
  try {
    validated = MatchActionSchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      const firstError = e.issues[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const matchId = validated.matchId;
  const action = validated.action;
  const ownerId = auth.ownerId;

  try {
    if (action === "confirm") {
      const result = await confirmMatch(matchId, ownerId);
      return NextResponse.json(result);
    } else {
      const result = await markDormant(matchId, ownerId);
      return NextResponse.json(result);
    }
  } catch (error) {
    return safeErrorResponse(error, "Match action failed", 400);
  }
}
