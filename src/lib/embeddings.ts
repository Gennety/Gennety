import OpenAI from "openai";
import { estimateEmbeddingCostUsd, getEmbeddingModel, aiPricing } from "@/lib/ai-costs";
import { recordComputeUsage } from "@/lib/analytics-tracking";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

interface EmbeddingLogContext {
  operation: string;
  ownerId?: string | null;
  agentId?: string | null;
  matchId?: string | null;
  beaconId?: string | null;
  chatId?: string | null;
  adviceSessionId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingUsage {
  provider: string;
  model: string;
  tokensInput: number;
  costUsd: number;
}

export async function generateEmbeddingWithUsage(
  text: string,
  logContext?: EmbeddingLogContext
): Promise<{ embedding: number[]; usage: EmbeddingUsage }> {
  const response = await getOpenAI().embeddings.create({
    model: getEmbeddingModel(),
    input: text,
  });

  const tokensInput = response.usage?.prompt_tokens ?? 0;
  const usage: EmbeddingUsage = {
    provider: aiPricing.embedding.provider,
    model: getEmbeddingModel(),
    tokensInput,
    costUsd: estimateEmbeddingCostUsd(tokensInput),
  };

  if (logContext) {
    await recordComputeUsage({
      category: "EMBEDDING",
      provider: usage.provider,
      model: usage.model,
      operation: logContext.operation,
      ownerId: logContext.ownerId,
      agentId: logContext.agentId,
      matchId: logContext.matchId,
      beaconId: logContext.beaconId,
      chatId: logContext.chatId,
      adviceSessionId: logContext.adviceSessionId,
      tokensInput: usage.tokensInput,
      tokensOutput: 0,
      costUsd: usage.costUsd,
      metadata: {
        text_length: text.length,
        ...logContext.metadata,
      },
    });
  }

  return { embedding: response.data[0].embedding, usage };
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await generateEmbeddingWithUsage(text);
  return result.embedding;
}

export function contextToEmbeddingText(context: {
  currentWork: string;
  expertise: string[];
  lookingFor: string;
  notLookingFor?: string | null;
  recentProblems?: string | null;
  recentWins?: string | null;
  networkingGoal: string;
  // From USER.md
  ownerProfession?: string | null;
  ownerDomain?: string | null;
  ownerGoals?: string | null;
  // From AGENTS.md
  agentSpecialization?: string | null;
  agentDomains?: string[] | null;
  // From SOUL.md
  collaborationStyle?: string | null;
}): string {
  const parts: string[] = [];

  // Owner identity (from USER.md)
  if (context.ownerProfession) parts.push(`Professional: ${context.ownerProfession}`);
  if (context.ownerDomain) parts.push(`Domain: ${context.ownerDomain}`);
  if (context.ownerGoals) parts.push(`Goals: ${context.ownerGoals}`);

  // Agent specialization (from AGENTS.md)
  if (context.agentSpecialization) parts.push(`Agent focus: ${context.agentSpecialization}`);
  if (context.agentDomains?.length) parts.push(`Operating in: ${context.agentDomains.join(', ')}`);

  // Collaboration style (from SOUL.md)
  if (context.collaborationStyle) parts.push(`Works best with: ${context.collaborationStyle}`);

  // Current active context (from MEMORY.md — highest weight, listed last)
  parts.push(`Networking goal: ${context.networkingGoal}`);
  parts.push(`Currently: ${context.currentWork}`);
  if (context.expertise?.length) parts.push(`Expert in: ${context.expertise.join(', ')}`);
  if (context.recentProblems) parts.push(`Working through: ${context.recentProblems}`);
  if (context.recentWins) parts.push(`Recently accomplished: ${context.recentWins}`);
  parts.push(`Looking for: ${context.lookingFor}`);

  return parts.join('. ');
}
