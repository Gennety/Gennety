import { prisma } from "@/lib/db";
import { createInboxEvent } from "@/lib/services/inbox";
import { signalAgentWork } from "@/lib/services/agent-delivery";

const MAX_CONTENT_LENGTH = 4000;

export const sendChatMessageTool = {
  name: "send_chat_message" as const,
  description:
    "Send a chat message on behalf of your owner. Use this when the owner replies to their chat " +
    "through your channel (Telegram, Discord, etc.) — the message is stored in the Gennety chat " +
    "so the owner can continue the conversation on the platform and the other side sees it immediately. " +
    "Only works for MATCHED chats in OPEN status. Writes the message as if the owner sent it from the web UI.",
  inputSchema: {
    type: "object" as const,
    properties: {
      agent_id: {
        type: "string",
        description: "Your agent ID",
      },
      match_id: {
        type: "string",
        description: "The match ID whose chat to post into",
      },
      content: {
        type: "string",
        description: `The message content (max ${MAX_CONTENT_LENGTH} characters)`,
        minLength: 1,
        maxLength: MAX_CONTENT_LENGTH,
      },
    },
    required: ["agent_id", "match_id", "content"],
  },
  handler: async (args: { agent_id: string; match_id: string; content: string }) => {
    const content = args.content?.trim();
    if (!content) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "content is required" }) },
        ],
        isError: true,
      };
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `content exceeds ${MAX_CONTENT_LENGTH} chars` }),
          },
        ],
        isError: true,
      };
    }

    const agent = await prisma.agent.findUnique({
      where: { agentId: args.agent_id },
      select: { id: true, ownerId: true, displayName: true, owner: { select: { name: true } } },
    });
    if (!agent) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: `Agent not found: ${args.agent_id}` }) },
        ],
        isError: true,
      };
    }

    const match = await prisma.match.findUnique({
      where: { id: args.match_id },
      include: {
        agentA: { select: { id: true, ownerId: true, agentId: true } },
        agentB: { select: { id: true, ownerId: true, agentId: true } },
        chat: { select: { id: true, status: true } },
      },
    });
    if (!match || !match.chat) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Chat not found" }) }],
        isError: true,
      };
    }

    if (match.status !== "MATCHED") {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Match is ${match.status} — chat not open` }),
          },
        ],
        isError: true,
      };
    }
    if (match.chat.status !== "OPEN") {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Chat is ${match.chat.status} — no new messages accepted` }),
          },
        ],
        isError: true,
      };
    }

    const isSideA = match.agentA.id === agent.id;
    const isSideB = match.agentB.id === agent.id;
    if (!isSideA && !isSideB) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "Agent is not part of this chat" }) },
        ],
        isError: true,
      };
    }

    const message = await prisma.message.create({
      data: {
        chatId: match.chat.id,
        fromOwner: agent.ownerId,
        content,
      },
    });

    // Sender is caught up — advance their read cursor.
    const readField = isSideA ? "lastReadByA" : "lastReadByB";
    await prisma.chat.update({
      where: { id: match.chat.id },
      data: { [readField]: new Date() },
    });

    // Write inbox event for the OTHER agent so their owner gets notified.
    const recipientAgent = isSideA ? match.agentB : match.agentA;
    createInboxEvent({
      ownerId: recipientAgent.ownerId,
      agentId: recipientAgent.id,
      type: "NEW_MESSAGE",
      referenceId: match.chat.id,
      payload: {
        match_id: match.id,
        chat_id: match.chat.id,
        message_id: message.id,
        from_owner_id: agent.ownerId,
        from_owner_name: agent.owner.name ?? agent.displayName,
        message_preview: content.length > 300 ? content.slice(0, 300) + "..." : content,
        created_at: message.createdAt.toISOString(),
      },
    }).catch((err) => console.error("[send_chat_message] inbox event failed:", err));

    signalAgentWork({
      agentId: recipientAgent.id,
      kind: "NEW_MESSAGE",
      reason: "New chat message",
      referenceId: match.chat.id,
      urgency: "high",
    }).catch((err) => console.error("[send_chat_message] Failed to signal recipient agent:", err));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            message_id: message.id,
            chat_id: match.chat.id,
            created_at: message.createdAt.toISOString(),
          }),
        },
      ],
    };
  },
};
