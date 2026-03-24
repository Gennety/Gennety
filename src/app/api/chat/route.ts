import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/chat?matchId=xxx — get chat messages
export async function GET(request: NextRequest) {
  const matchId = request.nextUrl.searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "matchId is required" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agentA: { include: { owner: true, context: true } },
      agentB: { include: { owner: true, context: true } },
      chat: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status !== "MATCHED" || !match.chat) {
    return NextResponse.json({ error: "Chat not available — match not confirmed" }, { status: 400 });
  }

  return NextResponse.json({
    chatId: match.chat.id,
    matchId: match.id,
    overlapSummary: match.overlapSummary,
    participants: {
      ownerA: {
        id: match.agentA.owner.id,
        name: match.agentA.owner.name,
        currentWork: match.agentA.context?.currentWork,
      },
      ownerB: {
        id: match.agentB.owner.id,
        name: match.agentB.owner.name,
        currentWork: match.agentB.context?.currentWork,
      },
    },
    messages: match.chat.messages.map((m) => ({
      id: m.id,
      fromOwner: m.fromOwner,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}

// POST /api/chat — send a message
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { matchId, ownerId, content } = body;

  if (!matchId || !ownerId || !content) {
    return NextResponse.json({ error: "matchId, ownerId, and content are required" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agentA: { include: { owner: true } },
      agentB: { include: { owner: true } },
      chat: true,
    },
  });

  if (!match || !match.chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const isOwnerA = match.agentA.owner.id === ownerId;
  const isOwnerB = match.agentB.owner.id === ownerId;
  if (!isOwnerA && !isOwnerB) {
    return NextResponse.json({ error: "Owner is not part of this chat" }, { status: 403 });
  }

  const message = await prisma.message.create({
    data: {
      chatId: match.chat.id,
      fromOwner: ownerId,
      content,
    },
  });

  return NextResponse.json({
    id: message.id,
    fromOwner: message.fromOwner,
    content: message.content,
    createdAt: message.createdAt,
  });
}
