import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";

// GET /api/chats — list all chats for authenticated owner
export async function GET() {
  const auth = await getAuthenticatedOwner();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerId = auth.ownerId;

  // Find all matches where this owner is involved and chat exists
  const matches = await prisma.match.findMany({
    where: {
      status: "MATCHED",
      chat: { isNot: null },
      OR: [
        { agentA: { ownerId } },
        { agentB: { ownerId } },
      ],
    },
    include: {
      agentA: { include: { owner: { select: { id: true, name: true } }, context: { select: { currentWork: true, ownerProfession: true } } } },
      agentB: { include: { owner: { select: { id: true, name: true } }, context: { select: { currentWork: true, ownerProfession: true } } } },
      chat: {
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: { select: { messages: true } },
        },
      },
    },
    orderBy: { matchedAt: "desc" },
  });

  const chats = matches.map((match) => {
    const isOwnerA = match.agentA.owner.id === ownerId;
    const other = isOwnerA ? match.agentB : match.agentA;
    const chat = match.chat!;
    const lastMessage = chat.messages[0] ?? null;
    const lastReadAt = isOwnerA ? chat.lastReadByA : chat.lastReadByB;

    return {
      matchId: match.id,
      chatId: chat.id,
      chatStatus: chat.status,
      otherPerson: {
        id: other.owner.id,
        name: other.owner.name,
        currentWork: other.context?.currentWork ?? null,
        profession: other.context?.ownerProfession ?? null,
      },
      lastMessage: lastMessage
        ? {
            content: lastMessage.content,
            fromOwner: lastMessage.fromOwner,
            kind: lastMessage.kind,
            createdAt: lastMessage.createdAt,
          }
        : null,
      unreadCount: lastReadAt
        ? 0 // Will be computed below
        : chat._count.messages, // Never read = all unread (minus agent messages handled below)
      overlapSummary: match.overlapSummary,
    };
  });

  // Compute accurate unread counts with a separate query per chat
  // (batched for efficiency)
  const chatIds = chats.map((c) => c.chatId);
  const ownerSides = new Map<string, { isOwnerA: boolean; lastReadAt: Date | null }>();

  for (const match of matches) {
    const isOwnerA = match.agentA.owner.id === ownerId;
    const chat = match.chat!;
    ownerSides.set(chat.id, {
      isOwnerA,
      lastReadAt: isOwnerA ? chat.lastReadByA : chat.lastReadByB,
    });
  }

  if (chatIds.length > 0) {
    // Get unread counts: messages created after lastReadAt, not from this owner
    for (const chatEntry of chats) {
      const side = ownerSides.get(chatEntry.chatId);
      if (!side) continue;

      const where: Record<string, unknown> = {
        chatId: chatEntry.chatId,
        fromOwner: { not: ownerId },
      };

      if (side.lastReadAt) {
        where.createdAt = { gt: side.lastReadAt };
      }

      chatEntry.unreadCount = await prisma.message.count({ where });
    }
  }

  return NextResponse.json({ chats });
}
