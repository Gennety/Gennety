import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const ReportChatSchema = z.object({
  chatId: z.string().min(1),
  category: z.enum([
    "SPAM_OR_SCAM",
    "HARASSMENT",
    "PRIVACY_VIOLATION",
    "IMPERSONATION",
    "INAPPROPRIATE_CONTENT",
    "LOW_QUALITY_OR_IRRELEVANT_MATCH",
    "OTHER",
  ]),
  details: z.string().trim().min(12).max(2000),
});

export async function POST(request: NextRequest) {
  const rateLimited = rateLimit(request, {
    maxRequests: 8,
    windowMs: 60_000,
    keyPrefix: "chat-report",
  });
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
    validated = ReportChatSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid report" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const chat = await prisma.chat.findUnique({
    where: { id: validated.chatId },
    include: {
      match: {
        include: {
          agentA: { include: { owner: true } },
          agentB: { include: { owner: true } },
        },
      },
    },
  });

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const ownerA = chat.match.agentA.owner;
  const ownerB = chat.match.agentB.owner;
  const isOwnerA = ownerA.id === auth.ownerId;
  const isOwnerB = ownerB.id === auth.ownerId;

  if (!isOwnerA && !isOwnerB) {
    return NextResponse.json(
      { error: "You are not a participant of this chat" },
      { status: 403 }
    );
  }

  const targetOwner = isOwnerA ? ownerB : ownerA;
  const reason = [
    `Category: ${validated.category}`,
    `Reported owner: ${targetOwner.name ?? "Unknown"} (${targetOwner.id})`,
    `Match: ${chat.matchId}`,
    "",
    validated.details,
  ].join("\n");

  const report = await prisma.report.create({
    data: {
      chatId: chat.id,
      reporterId: auth.ownerId,
      reason,
    },
  });

  return NextResponse.json({
    reportId: report.id,
    status: "submitted",
  });
}
