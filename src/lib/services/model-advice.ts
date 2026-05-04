import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getModelAdvicePreset } from "@/lib/model-advice";
import { z } from "zod";
import { estimateAnthropicCostUsd, getAnthropicSonnetModel, aiPricing } from "@/lib/ai-costs";
import { recordAnalyticsEvent, recordComputeUsage } from "@/lib/analytics-tracking";

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function setAnthropicForTests(client: Anthropic | null) {
  _anthropic = client;
}

const AdviceGenerationSchema = z.object({
  turns: z
    .array(
      z.object({
        speaker: z.enum(["agent_a", "agent_b"]),
        message: z.string().min(1).max(1200),
      })
    )
    .min(2)
    .max(6),
  report: z.object({
    verdict: z.enum(["strong_fit", "promising_but_reframe", "not_enough_overlap", "too_early"]),
    summary: z.string().min(1).max(1600),
    advice_for_both: z.array(z.string().min(1).max(300)).min(1).max(3),
    next_moves: z.array(z.string().min(1).max(300)).min(1).max(3),
    alternate_angles: z.array(z.string().min(1).max(300)).max(3),
  }),
});

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function getVerdictLabel(verdict: z.infer<typeof AdviceGenerationSchema>["report"]["verdict"]) {
  switch (verdict) {
    case "strong_fit":
      return "Strong fit";
    case "promising_but_reframe":
      return "Promising, but reframe it";
    case "not_enough_overlap":
      return "Not enough overlap";
    case "too_early":
      return "Too early to call";
  }
}

function compactText(value: string | null | undefined) {
  return value?.trim() || "Not provided";
}

function formatContextSummary(label: string, context: {
  currentWork?: string | null;
  expertise?: string[];
  lookingFor?: string | null;
  recentProblems?: string | null;
  collaborationStyle?: string | null;
  communicationStyle?: string | null;
}) {
  return [
    `${label}:`,
    `- Current work: ${compactText(context.currentWork)}`,
    `- Expertise: ${(context.expertise ?? []).join(", ") || "Not provided"}`,
    `- Looking for: ${compactText(context.lookingFor)}`,
    `- Recent problems: ${compactText(context.recentProblems)}`,
    `- Collaboration style: ${compactText(context.collaborationStyle)}`,
    `- Communication style: ${compactText(context.communicationStyle)}`,
  ].join("\n");
}

function formatTranscript(messages: Array<{
  fromOwner: string;
  content: string;
  kind: string;
  createdAt: Date;
}>, ownerAId: string, ownerBId: string, ownerAName: string, ownerBName: string) {
  if (messages.length === 0) {
    return "No human chat yet.";
  }

  return messages
    .map((message) => {
      let speaker = "System";
      if (message.kind === "AGENT_INTRO") {
        speaker = message.fromOwner === "agent_a" ? `${ownerAName}'s intro agent` : `${ownerBName}'s intro agent`;
      } else if (message.fromOwner === ownerAId) {
        speaker = ownerAName;
      } else if (message.fromOwner === ownerBId) {
        speaker = ownerBName;
      }

      return `[${message.createdAt.toISOString()}] ${speaker}: ${message.content}`;
    })
    .join("\n");
}

function formatReportMessage(report: z.infer<typeof AdviceGenerationSchema>["report"]) {
  const lines = [
    "Model advice report",
    `Verdict: ${getVerdictLabel(report.verdict)}`,
    "",
    report.summary,
    "",
    "What to do next:",
    ...report.next_moves.map((item) => `- ${item}`),
  ];

  if (report.advice_for_both.length > 0) {
    lines.push("", "How to talk better:");
    lines.push(...report.advice_for_both.map((item) => `- ${item}`));
  }

  if (report.alternate_angles.length > 0) {
    lines.push("", "Alternative angles:");
    lines.push(...report.alternate_angles.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

async function generateAdviceContent(args: {
  adviceSessionId?: string;
  chatId?: string;
  matchId?: string;
  promptText: string;
  overlapSummary: string;
  ownerAId: string;
  ownerBId: string;
  ownerAName: string;
  ownerBName: string;
  ownerAContext: {
    currentWork?: string | null;
    expertise?: string[];
    lookingFor?: string | null;
    recentProblems?: string | null;
    collaborationStyle?: string | null;
    communicationStyle?: string | null;
  };
  ownerBContext: {
    currentWork?: string | null;
    expertise?: string[];
    lookingFor?: string | null;
    recentProblems?: string | null;
    collaborationStyle?: string | null;
    communicationStyle?: string | null;
  };
  transcriptMessages: Array<{
    fromOwner: string;
    content: string;
    kind: string;
    createdAt: Date;
  }>;
}) {
  const transcript = formatTranscript(
    args.transcriptMessages,
    args.ownerAId,
    args.ownerBId,
    args.ownerAName,
    args.ownerBName
  );

  const fallback = buildFallbackAdvice({
    promptText: args.promptText,
    overlapSummary: args.overlapSummary,
    ownerAName: args.ownerAName,
    ownerBName: args.ownerBName,
    ownerAContext: args.ownerAContext,
    ownerBContext: args.ownerBContext,
    transcriptMessages: args.transcriptMessages,
  });

  const anthropic = getAnthropic();
  if (!anthropic) return fallback;

  let response;
  try {
    response = await anthropic.messages.create({
      model: getAnthropicSonnetModel(),
      max_tokens: 1400,
      temperature: 0.5,
      system:
        "You simulate two networking agents inside Gennety. They are honest, concrete, and slightly adversarial in a productive way. They should help two humans find common ground, reveal mismatch, and suggest the strongest next direction without flattery. They must only use the supplied transcript and context snapshots. Output valid JSON only.",
      messages: [
        {
          role: "user",
          content: [
            `Question from the humans:\n${args.promptText}`,
            "",
            `Original match reason:\n${args.overlapSummary}`,
            "",
            formatContextSummary(`${args.ownerAName} (agent_a)`, args.ownerAContext),
            "",
            formatContextSummary(`${args.ownerBName} (agent_b)`, args.ownerBContext),
            "",
            "Current chat transcript:",
            transcript,
            "",
            "Return JSON with this exact shape:",
            JSON.stringify(
              {
                turns: [
                  { speaker: "agent_a", message: "..." },
                  { speaker: "agent_b", message: "..." },
                ],
                report: {
                  verdict: "strong_fit",
                  summary: "...",
                  advice_for_both: ["..."],
                  next_moves: ["..."],
                  alternate_angles: ["..."],
                },
              },
              null,
              2
            ),
            "",
            "Rules:",
            "- 4 turns is ideal; 2-6 allowed.",
            "- Make each agent sound like a real participant in the chat, not a narrator.",
            "- Each turn must add a new angle, challenge, or bridge.",
            "- The report must be specific and actionable.",
            "- If the chat is too short, say so honestly in the verdict.",
          ].join("\n"),
        },
      ],
    });
  } catch (error) {
    console.warn("[model-advice] Anthropic generation failed, using fallback:", error);
    return fallback;
  }

  const tokensInput = response.usage?.input_tokens ?? 0;
  const tokensOutput = response.usage?.output_tokens ?? 0;
  if (args.adviceSessionId && args.chatId && args.matchId) {
    await recordComputeUsage({
      category: "MODEL_ADVICE",
      provider: aiPricing.anthropicSonnet.provider,
      model: getAnthropicSonnetModel(),
      operation: "model_advice_generation",
      ownerId: args.ownerAId,
      matchId: args.matchId,
      chatId: args.chatId,
      adviceSessionId: args.adviceSessionId,
      tokensInput,
      tokensOutput,
      costUsd: estimateAnthropicCostUsd(tokensInput, tokensOutput),
      metadata: {
        owner_b_id: args.ownerBId,
        prompt_length: args.promptText.length,
        transcript_messages: args.transcriptMessages.length,
      },
    });
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const jsonText = extractJsonObject(text);
  if (!jsonText) return fallback;

  try {
    return AdviceGenerationSchema.parse(JSON.parse(jsonText));
  } catch {
    return fallback;
  }
}

function buildFallbackAdvice(args: {
  promptText: string;
  overlapSummary: string;
  ownerAName: string;
  ownerBName: string;
  ownerAContext: {
    currentWork?: string | null;
    expertise?: string[];
    lookingFor?: string | null;
    recentProblems?: string | null;
  };
  ownerBContext: {
    currentWork?: string | null;
    expertise?: string[];
    lookingFor?: string | null;
    recentProblems?: string | null;
  };
  transcriptMessages: Array<{
    fromOwner: string;
    content: string;
    kind: string;
    createdAt: Date;
  }>;
}) {
  const humanMessages = args.transcriptMessages.filter((message) => message.kind === "HUMAN");
  const verdict =
    humanMessages.length < 3
      ? "too_early"
      : args.overlapSummary.length > 100
      ? "promising_but_reframe"
      : "strong_fit";

  return AdviceGenerationSchema.parse({
    turns: [
      {
        speaker: "agent_a",
        message: `I see a real opening around ${compactText(args.ownerAContext.currentWork)} and ${compactText(args.ownerBContext.currentWork)}, but the chat still needs a sharper shared objective.`,
      },
      {
        speaker: "agent_b",
        message: `Agreed. The strongest overlap is ${args.overlapSummary.toLowerCase()}. If they continue, they should anchor on one concrete problem instead of staying broad.`,
      },
      {
        speaker: "agent_a",
        message: `${args.ownerAName} should test whether ${args.ownerBName} wants a practical collaboration, a lightweight exchange, or just discovery. That answer will remove most ambiguity.`,
      },
      {
        speaker: "agent_b",
        message: `And ${args.ownerBName} should answer with a concrete next move: a call, a shared document, a warm intro, or a no-go. Momentum matters more than politeness here.`,
      },
    ],
    report: {
      verdict,
      summary:
        verdict === "too_early"
          ? "The conversation is still too short to judge long-term fit confidently. There is visible overlap, but the humans have not pressure-tested it yet."
          : `There is a credible match, but the conversation should narrow around one concrete outcome. Right now the connection looks more promising than proven.`,
      advice_for_both: [
        "Name the exact problem you want to solve together before continuing the thread.",
        "Respond to the strongest point the other person already made instead of opening a new branch.",
      ],
      next_moves: [
        "Each person should state one concrete thing they can offer in the next two weeks.",
        "Choose one follow-up format: short call, async notes, or a specific intro request.",
      ],
      alternate_angles: [
        "If the current topic stalls, test whether the better fit is feedback, distribution, or a peer exchange instead of a direct collaboration.",
      ],
    },
  });
}

async function getChatWithParticipants(chatId: string) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      match: {
        include: {
          agentA: { include: { owner: true, context: true } },
          agentB: { include: { owner: true, context: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!chat) {
    throw new Error("Chat not found");
  }

  return chat;
}

function getOwnerSide(chat: Awaited<ReturnType<typeof getChatWithParticipants>>, ownerId: string) {
  const ownerAId = chat.match.agentA.owner.id;
  const ownerBId = chat.match.agentB.owner.id;
  if (ownerId === ownerAId) {
    return { isOwnerA: true, otherOwnerId: ownerBId };
  }
  if (ownerId === ownerBId) {
    return { isOwnerA: false, otherOwnerId: ownerAId };
  }
  return null;
}

export async function requestModelAdvice(args: {
  matchId: string;
  requesterOwnerId: string;
  promptKey?: string;
  promptText?: string;
}) {
  const match = await prisma.match.findUnique({
    where: { id: args.matchId },
    include: {
      agentA: { include: { owner: true } },
      agentB: { include: { owner: true } },
      chat: true,
    },
  });

  if (!match || !match.chat || match.status !== "MATCHED") {
    throw new Error("Chat is not available for model advice");
  }

  if (match.chat.status !== "OPEN") {
    throw new Error("Chat is closed");
  }

  const isOwnerA = match.agentA.owner.id === args.requesterOwnerId;
  const isOwnerB = match.agentB.owner.id === args.requesterOwnerId;
  if (!isOwnerA && !isOwnerB) {
    throw new Error("You are not a participant of this chat");
  }

  const preset = getModelAdvicePreset(args.promptKey);
  const promptTitle = preset?.title ?? "Custom advice request";
  const promptText = args.promptText?.trim() || preset?.prompt;

  if (!promptText) {
    throw new Error("Choose a preset or write your own question");
  }

  try {
    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.adviceSession.findFirst({
        where: {
          chatId: match.chat!.id,
          status: { in: ["PENDING", "ACTIVE"] },
        },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        throw new Error("A model advice session is already running in this chat");
      }

      const created = await tx.adviceSession.create({
        data: {
          chatId: match.chat!.id,
          requestedByOwnerId: args.requesterOwnerId,
          promptKey: preset?.id ?? null,
          promptTitle,
          promptText,
        },
      });

      await tx.message.create({
        data: {
          chatId: match.chat!.id,
          fromOwner: "system",
          kind: "MODEL_ADVICE_REQUEST",
          adviceSessionId: created.id,
          content: `Model advice requested.\nQuestion: ${promptText}\nWaiting for the other person to approve the agents joining this chat.`,
        },
      });

      return created;
    });

    await recordAnalyticsEvent({
      type: "ADVICE_REQUESTED",
      ownerId: args.requesterOwnerId,
      matchId: match.id,
      chatId: match.chat.id,
      adviceSessionId: session.id,
      metadata: {
        prompt_key: preset?.id ?? null,
        prompt_title: promptTitle,
      },
    });

    return session;
  } catch (error) {
    if (isAdviceSessionConflictError(error)) {
      throw new Error("A model advice session is already running in this chat");
    }
    throw error;
  }
}

function isAdviceSessionConflictError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String((error as { code?: unknown }).code) : null;
  return code === "P2002";
}

function isRunningAdviceSessionStatus(status: string) {
  return status === "PENDING" || status === "ACTIVE";
}

async function transitionAdviceSessionFromPending(args: {
  sessionId: string;
  ownerId: string;
  nextStatus: "ACTIVE" | "DECLINED";
}) {
  const now = new Date();
  const data =
    args.nextStatus === "ACTIVE"
      ? {
          responderOwnerId: args.ownerId,
          respondedAt: now,
          startedAt: now,
          status: "ACTIVE" as const,
        }
      : {
          responderOwnerId: args.ownerId,
          respondedAt: now,
          completedAt: now,
          status: "DECLINED" as const,
        };

  const result = await prisma.adviceSession.updateMany({
    where: {
      id: args.sessionId,
      status: "PENDING",
      responderOwnerId: null,
    },
    data,
  });

  if (result.count !== 1) {
    throw new Error("This model advice session is no longer awaiting approval");
  }
}

async function completeAdviceSessionIfActive(args: {
  sessionId: string;
  chatId: string;
  generated: z.infer<typeof AdviceGenerationSchema>;
}) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.adviceSession.updateMany({
      where: {
        id: args.sessionId,
        status: "ACTIVE",
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        summary: args.generated.report.summary,
        recommendation: args.generated.report.next_moves.join("\n"),
      },
    });

    if (result.count !== 1) {
      return null;
    }

    await tx.message.createMany({
      data: args.generated.turns.map((turn) => ({
        chatId: args.chatId,
        fromOwner: turn.speaker === "agent_a" ? "advice_agent_a" : "advice_agent_b",
        kind: "MODEL_ADVICE_AGENT",
        adviceSessionId: args.sessionId,
        content: turn.message,
      })),
    });

    await tx.message.create({
      data: {
        chatId: args.chatId,
        fromOwner: "system",
        kind: "MODEL_ADVICE_RESULT",
        adviceSessionId: args.sessionId,
        content: formatReportMessage(args.generated.report),
      },
    });

    return tx.adviceSession.findUnique({
      where: { id: args.sessionId },
    });
  });
}

async function failAdviceSessionIfActive(args: {
  sessionId: string;
  chatId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.adviceSession.updateMany({
      where: {
        id: args.sessionId,
        status: "ACTIVE",
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      return null;
    }

    await tx.message.create({
      data: {
        chatId: args.chatId,
        fromOwner: "system",
        kind: "MODEL_ADVICE_STATUS",
        adviceSessionId: args.sessionId,
        content:
          "Model advice could not complete this time. Try again after a few more messages or with a sharper question.",
      },
    });

    return tx.adviceSession.findUnique({
      where: { id: args.sessionId },
    });
  });
}

export const __test = {
  buildFallbackAdvice,
  completeAdviceSessionIfActive,
  failAdviceSessionIfActive,
  formatReportMessage,
  generateAdviceContent,
  isRunningAdviceSessionStatus,
  setAnthropicForTests,
  isAdviceSessionConflictError,
};

export async function cancelModelAdviceSession(args: {
  sessionId: string;
  ownerId: string;
}) {
  const session = await prisma.adviceSession.findUnique({
    where: { id: args.sessionId },
  });

  if (!session) {
    throw new Error("Model advice session not found");
  }

  if (!isRunningAdviceSessionStatus(session.status)) {
    throw new Error("This model advice session is no longer running");
  }

  const chat = await getChatWithParticipants(session.chatId);
  if (chat.status !== "OPEN") {
    throw new Error("Chat is closed");
  }

  const side = getOwnerSide(chat, args.ownerId);
  if (!side) {
    throw new Error("You are not a participant of this chat");
  }

  const result = await prisma.adviceSession.updateMany({
    where: {
      id: session.id,
      status: { in: ["PENDING", "ACTIVE"] },
    },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    throw new Error("This model advice session is no longer running");
  }

  await prisma.message.create({
    data: {
      chatId: session.chatId,
      fromOwner: "system",
      kind: "MODEL_ADVICE_STATUS",
      adviceSessionId: session.id,
      content: "Model advice was cancelled. You can choose another mode and start again.",
    },
  });

  await recordAnalyticsEvent({
    type: "ADVICE_CANCELLED",
    ownerId: args.ownerId,
    chatId: session.chatId,
    adviceSessionId: session.id,
  });

  return prisma.adviceSession.findUnique({
    where: { id: session.id },
  });
}

export async function respondToModelAdvice(args: {
  sessionId: string;
  ownerId: string;
  action: "approve" | "decline";
}) {
  const session = await prisma.adviceSession.findUnique({
    where: { id: args.sessionId },
  });

  if (!session) {
    throw new Error("Model advice session not found");
  }

  if (session.status !== "PENDING") {
    throw new Error("This model advice session is no longer awaiting approval");
  }

  const chat = await getChatWithParticipants(session.chatId);
  if (chat.status !== "OPEN") {
    throw new Error("Chat is closed");
  }
  const side = getOwnerSide(chat, args.ownerId);
  if (!side) {
    throw new Error("You are not a participant of this chat");
  }

  if (session.requestedByOwnerId === args.ownerId) {
    throw new Error("You already requested this model advice session");
  }

  if (args.action === "decline") {
    await transitionAdviceSessionFromPending({
      sessionId: session.id,
      ownerId: args.ownerId,
      nextStatus: "DECLINED",
    });

    const declined = await prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: {
          chatId: session.chatId,
          fromOwner: "system",
          kind: "MODEL_ADVICE_STATUS",
          adviceSessionId: session.id,
          content: "Model advice was declined. The agents stayed out of the chat.",
        },
      });

      return tx.adviceSession.findUnique({
        where: { id: session.id },
      });
    });

    await recordAnalyticsEvent({
      type: "ADVICE_DECLINED",
      ownerId: args.ownerId,
      matchId: chat.match.id,
      chatId: session.chatId,
      adviceSessionId: session.id,
    });

    return declined;
  }

  await transitionAdviceSessionFromPending({
    sessionId: session.id,
    ownerId: args.ownerId,
    nextStatus: "ACTIVE",
  });

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        chatId: session.chatId,
        fromOwner: "system",
        kind: "MODEL_ADVICE_STATUS",
        adviceSessionId: session.id,
        content: "Both people approved model advice. The agents are entering the chat and reviewing the conversation.",
      },
    });
  });

  await recordAnalyticsEvent({
    type: "ADVICE_APPROVED",
    ownerId: args.ownerId,
    matchId: chat.match.id,
    chatId: session.chatId,
    adviceSessionId: session.id,
  });

  try {
    const refreshed = await getChatWithParticipants(session.chatId);
    const ownerAName = refreshed.match.agentA.owner.name ?? "Person A";
    const ownerBName = refreshed.match.agentB.owner.name ?? "Person B";

    const transcriptMessages = refreshed.messages
      .filter((message) =>
        (message.kind === "HUMAN" || message.kind === "AGENT_INTRO") &&
        message.adviceSessionId === null
      )
      .slice(-16);

    const generated = await generateAdviceContent({
      adviceSessionId: session.id,
      chatId: session.chatId,
      matchId: refreshed.match.id,
      promptText: session.promptText,
      overlapSummary: refreshed.match.overlapSummary,
      ownerAId: refreshed.match.agentA.owner.id,
      ownerBId: refreshed.match.agentB.owner.id,
      ownerAName,
      ownerBName,
      ownerAContext: refreshed.match.agentA.context ?? {},
      ownerBContext: refreshed.match.agentB.context ?? {},
      transcriptMessages,
    });

    const completed = await completeAdviceSessionIfActive({
      sessionId: session.id,
      chatId: session.chatId,
      generated,
    });

    if (completed) {
      await recordAnalyticsEvent({
        type: "ADVICE_COMPLETED",
        ownerId: session.requestedByOwnerId,
        matchId: refreshed.match.id,
        chatId: session.chatId,
        adviceSessionId: session.id,
      });
      return completed;
    }
  } catch (error) {
    const failed = await failAdviceSessionIfActive({
      sessionId: session.id,
      chatId: session.chatId,
    });

    if (!failed) {
      return prisma.adviceSession.findUnique({
        where: { id: session.id },
      });
    }

    await recordAnalyticsEvent({
      type: "ADVICE_FAILED",
      ownerId: session.requestedByOwnerId,
      matchId: chat.match.id,
      chatId: session.chatId,
      adviceSessionId: session.id,
    });

    throw error;
  }

  return prisma.adviceSession.findUnique({
    where: { id: session.id },
  });
}
