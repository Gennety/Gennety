import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { SendMessageSchema } from "@/types/chat-input";
import { createInboxEvent } from "@/lib/services/inbox";
import { pokeAgent } from "@/lib/services/agent-wake";
import { ZodError } from "zod";

// GET /api/chat?matchId=xxx — get chat messages (requires auth)
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedOwner();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matchId = request.nextUrl.searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "matchId is required" }, { status: 400 });
  }

  let match;
  try {
    match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        agentA: { include: { owner: true, context: true } },
        agentB: { include: { owner: true, context: true } },
        chat: {
          include: {
            messages: { orderBy: { createdAt: "asc" } },
            adviceSessions: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status !== "MATCHED" || !match.chat) {
    return NextResponse.json({ error: "Chat not available — match not confirmed" }, { status: 400 });
  }

  // Verify caller is a participant of this chat
  const isOwnerA = match.agentA.owner.id === auth.ownerId;
  const isOwnerB = match.agentB.owner.id === auth.ownerId;
  if (!isOwnerA && !isOwnerB) {
    return NextResponse.json({ error: "You are not a participant of this chat" }, { status: 403 });
  }

  // Mark chat as read for this owner
  const readField = isOwnerA ? "lastReadByA" : "lastReadByB";
  await prisma.chat.update({
    where: { id: match.chat.id },
    data: { [readField]: new Date() },
  });

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
      kind: m.kind,
      adviceSessionId: m.adviceSessionId,
      content: m.content,
      createdAt: m.createdAt,
    })),
    adviceSessions: match.chat.adviceSessions.map((session) => ({
      id: session.id,
      requestedByOwnerId: session.requestedByOwnerId,
      responderOwnerId: session.responderOwnerId,
      promptKey: session.promptKey,
      promptTitle: session.promptTitle,
      promptText: session.promptText,
      status: session.status,
      respondedAt: session.respondedAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      summary: session.summary,
      recommendation: session.recommendation,
      createdAt: session.createdAt,
    })),
  });
}

// POST /api/chat — send a message (requires auth)
export async function POST(request: NextRequest) {
  const rateLimited = rateLimit(request, { maxRequests: 30, windowMs: 60_000, keyPrefix: "chat" });
  if (rateLimited) return rateLimited;

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
    validated = SendMessageSchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      const firstError = e.issues[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const matchId = validated.matchId;
  const ownerId = auth.ownerId;
  const content = validated.content;

  let match;
  try {
    match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        agentA: { include: { owner: true } },
        agentB: { include: { owner: true } },
        chat: true,
      },
    });
  } catch {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (!match || !match.chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  if (match.chat.status !== "OPEN") {
    return NextResponse.json(
      { error: `Chat is ${match.chat.status} — no new messages accepted` },
      { status: 403 }
    );
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
      kind: "HUMAN",
      content,
    },
  });

  // Update read cursor — sender has seen everything up to now
  const readField = isOwnerA ? "lastReadByA" : "lastReadByB";
  await prisma.chat.update({
    where: { id: match.chat.id },
    data: { [readField]: new Date() },
  });

  // Write inbox event for the recipient's agent — the agent delivers it via check_in.
  const recipientOwner = isOwnerA ? match.agentB.owner : match.agentA.owner;
  const recipientAgentInternalId = isOwnerA ? match.agentBId : match.agentAId;
  const senderOwner = isOwnerA ? match.agentA.owner : match.agentB.owner;

  createInboxEvent({
    ownerId: recipientOwner.id,
    agentId: recipientAgentInternalId,
    type: "NEW_MESSAGE",
    referenceId: match.chat.id,
    payload: {
      match_id: match.id,
      chat_id: match.chat.id,
      message_id: message.id,
      from_owner_id: senderOwner.id,
      from_owner_name: senderOwner.name,
      message_preview: content.length > 300 ? content.slice(0, 300) + "..." : content,
      created_at: message.createdAt.toISOString(),
    },
  }).catch((err) => console.error("[inbox] NEW_MESSAGE event failed:", err));

  pokeAgent({ agentId: recipientAgentInternalId, reason: "New chat message" });

  return NextResponse.json({
    id: message.id,
    fromOwner: message.fromOwner,
    kind: message.kind,
    adviceSessionId: message.adviceSessionId,
    content: message.content,
    createdAt: message.createdAt,
  });
}
