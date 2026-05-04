import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { estimateAnthropicCostUsd, getAnthropicSonnetModel, aiPricing } from "@/lib/ai-costs";
import { recordComputeUsage } from "@/lib/analytics-tracking";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

interface MatchContext {
  overlapSummary: string;
  framingForA: string;
  framingForB: string;
  ownerA: { name: string | null; currentWork: string | null; expertise: string[] };
  ownerB: { name: string | null; currentWork: string | null; expertise: string[] };
}

async function generateOpeningMessage(
  ctx: MatchContext,
  forOwner: "A" | "B",
  refs: { ownerId: string; agentId: string; matchId: string; chatId: string }
): Promise<string> {
  const anthropic = getAnthropic();
  if (!anthropic) {
    return forOwner === "A" ? ctx.framingForA : ctx.framingForB;
  }

  const ownerName = forOwner === "A" ? ctx.ownerA.name : ctx.ownerB.name;
  const otherName = forOwner === "A" ? ctx.ownerB.name : ctx.ownerA.name;
  const otherWork = forOwner === "A" ? ctx.ownerB.currentWork : ctx.ownerA.currentWork;
  const framing = forOwner === "A" ? ctx.framingForA : ctx.framingForB;

  const response = await anthropic.messages.create({
    model: getAnthropicSonnetModel(),
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Generate a warm, specific opening message for ${ownerName ?? "this person"} to start a conversation with ${otherName ?? "their new connection"}.

Why they're meeting: ${ctx.overlapSummary}
Frame for this person: ${framing}
The other person works on: ${otherWork ?? "unknown"}

Format (exactly two lines):
"[Specific one-sentence reason you two should talk].
A good place to start: [concrete first question or topic]."

Be specific and concrete. No generic greetings. No filler words. Maximum 2 sentences.`,
      },
    ],
  });

  const tokensInput = response.usage?.input_tokens ?? 0;
  const tokensOutput = response.usage?.output_tokens ?? 0;
  await recordComputeUsage({
    category: "CHAT_OPENING",
    provider: aiPricing.anthropicSonnet.provider,
    model: getAnthropicSonnetModel(),
    operation: "chat_opening_message",
    ownerId: refs.ownerId,
    agentId: refs.agentId,
    matchId: refs.matchId,
    chatId: refs.chatId,
    tokensInput,
    tokensOutput,
    costUsd: estimateAnthropicCostUsd(tokensInput, tokensOutput),
    metadata: {
      for_owner: forOwner,
    },
  });

  const text = response.content.find((block) => block.type === "text");
  if (text?.text?.trim()) return text.text.trim();
  return framing;
}

export async function createChatWithOpeningMessages(matchId: string) {
  const existingChat = await prisma.chat.findUnique({
    where: { matchId },
  });
  if (existingChat) {
    return existingChat;
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      agentA: { include: { owner: true, context: true } },
      agentB: { include: { owner: true, context: true } },
    },
  });

  if (!match) throw new Error(`Match not found: ${matchId}`);

  const ctx: MatchContext = {
    overlapSummary: match.overlapSummary,
    framingForA: match.framingForA,
    framingForB: match.framingForB,
    ownerA: {
      name: match.agentA.owner.name,
      currentWork: match.agentA.context?.currentWork ?? null,
      expertise: match.agentA.context?.expertise ?? [],
    },
    ownerB: {
      name: match.agentB.owner.name,
      currentWork: match.agentB.context?.currentWork ?? null,
      expertise: match.agentB.context?.expertise ?? [],
    },
  };

  const chat = await prisma.chat.upsert({
    where: { matchId },
    update: {},
    create: { matchId },
  });

  let messageA: string;
  let messageB: string;
  try {
    [messageA, messageB] = await Promise.all([
      generateOpeningMessage(ctx, "A", {
        ownerId: match.agentA.owner.id,
        agentId: match.agentA.id,
        matchId: match.id,
        chatId: chat.id,
      }),
      generateOpeningMessage(ctx, "B", {
        ownerId: match.agentB.owner.id,
        agentId: match.agentB.id,
        matchId: match.id,
        chatId: chat.id,
      }),
    ]);
  } catch (err) {
    console.error("[chat] Anthropic API failed, using fallback:", err);
    messageA = ctx.framingForA;
    messageB = ctx.framingForB;
  }

  const existingMessages = await prisma.message.count({
    where: { chatId: chat.id, kind: "AGENT_INTRO" },
  });

  if (existingMessages === 0) {
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        messages: {
          createMany: {
            data: [
              { fromOwner: "agent_a", kind: "AGENT_INTRO", content: messageA },
              { fromOwner: "agent_b", kind: "AGENT_INTRO", content: messageB },
            ],
          },
        },
      },
    });
  }

  return chat;
}
