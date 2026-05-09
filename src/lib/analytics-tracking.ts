import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface AnalyticsEventArgs {
  type: string;
  ownerId?: string | null;
  agentId?: string | null;
  matchId?: string | null;
  beaconId?: string | null;
  chatId?: string | null;
  adviceSessionId?: string | null;
  communityId?: string | null;
  strategySessionId?: string | null;
  knowledgeSourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  createdAt?: Date;
}

export interface ComputeUsageArgs {
  category: string;
  provider: string;
  model: string;
  operation: string;
  ownerId?: string | null;
  agentId?: string | null;
  matchId?: string | null;
  beaconId?: string | null;
  chatId?: string | null;
  adviceSessionId?: string | null;
  communityId?: string | null;
  strategySessionId?: string | null;
  knowledgeSourceId?: string | null;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;
  metadata?: Prisma.InputJsonValue;
  createdAt?: Date;
}

export async function recordAnalyticsEvent(args: AnalyticsEventArgs) {
  return prisma.analyticsEvent.create({
    data: {
      type: args.type,
      ownerId: args.ownerId ?? null,
      agentId: args.agentId ?? null,
      matchId: args.matchId ?? null,
      beaconId: args.beaconId ?? null,
      chatId: args.chatId ?? null,
      adviceSessionId: args.adviceSessionId ?? null,
      communityId: args.communityId ?? null,
      strategySessionId: args.strategySessionId ?? null,
      knowledgeSourceId: args.knowledgeSourceId ?? null,
      metadata: args.metadata,
      createdAt: args.createdAt,
    },
  });
}

export async function recordComputeUsage(args: ComputeUsageArgs) {
  return prisma.computeUsage.create({
    data: {
      category: args.category,
      provider: args.provider,
      model: args.model,
      operation: args.operation,
      ownerId: args.ownerId ?? null,
      agentId: args.agentId ?? null,
      matchId: args.matchId ?? null,
      beaconId: args.beaconId ?? null,
      chatId: args.chatId ?? null,
      adviceSessionId: args.adviceSessionId ?? null,
      communityId: args.communityId ?? null,
      strategySessionId: args.strategySessionId ?? null,
      knowledgeSourceId: args.knowledgeSourceId ?? null,
      tokensInput: args.tokensInput ?? 0,
      tokensOutput: args.tokensOutput ?? 0,
      costUsd: args.costUsd ?? 0,
      metadata: args.metadata,
      createdAt: args.createdAt,
    },
  });
}
