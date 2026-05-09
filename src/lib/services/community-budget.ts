import { prisma } from "@/lib/db";

export class CommunityBudgetError extends Error {
  constructor(
    message: string,
    public readonly status = 402
  ) {
    super(message);
  }
}

export interface CommunityBudgetState {
  communityId: string;
  sessionTokenLimit: number;
  monthlyTokenLimit: number | null;
  monthTokensUsed: number;
  monthCostUsd: number;
  remainingMonthlyTokens: number | null;
}

export function estimateStrategyTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function canSpendCommunityTokens(args: {
  requestedTokens: number;
  sessionTokenLimit: number;
  sessionTokensUsed: number;
  monthlyTokenLimit?: number | null;
  monthTokensUsed?: number;
}) {
  const sessionRemaining = args.sessionTokenLimit - args.sessionTokensUsed;
  if (args.requestedTokens > sessionRemaining) {
    return {
      allowed: false,
      reason: "SESSION_LIMIT",
      remainingTokens: Math.max(0, sessionRemaining),
    } as const;
  }

  if (args.monthlyTokenLimit !== null && args.monthlyTokenLimit !== undefined) {
    const monthlyRemaining = args.monthlyTokenLimit - (args.monthTokensUsed ?? 0);
    if (args.requestedTokens > monthlyRemaining) {
      return {
        allowed: false,
        reason: "MONTHLY_LIMIT",
        remainingTokens: Math.max(0, monthlyRemaining),
      } as const;
    }
  }

  return {
    allowed: true,
    reason: null,
    remainingTokens: sessionRemaining - args.requestedTokens,
  } as const;
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getCommunityBudgetState(communityId: string, now = new Date()): Promise<CommunityBudgetState> {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: {
      id: true,
      strategyTokenLimit: true,
      monthlyTokenLimit: true,
    },
  });

  if (!community) throw new CommunityBudgetError("Community not found", 404);

  const aggregate = await prisma.computeUsage.aggregate({
    where: {
      communityId,
      createdAt: { gte: monthStart(now) },
    },
    _sum: {
      tokensInput: true,
      tokensOutput: true,
      costUsd: true,
    },
  });

  const monthTokensUsed =
    (aggregate._sum.tokensInput ?? 0) + (aggregate._sum.tokensOutput ?? 0);
  const remainingMonthlyTokens =
    community.monthlyTokenLimit === null
      ? null
      : Math.max(0, community.monthlyTokenLimit - monthTokensUsed);

  return {
    communityId,
    sessionTokenLimit: community.strategyTokenLimit,
    monthlyTokenLimit: community.monthlyTokenLimit,
    monthTokensUsed,
    monthCostUsd: aggregate._sum.costUsd ?? 0,
    remainingMonthlyTokens,
  };
}

export async function assertCommunityBudgetAvailable(args: {
  communityId: string;
  requestedTokens: number;
  sessionTokensUsed?: number;
  sessionTokenLimit?: number;
}) {
  const state = await getCommunityBudgetState(args.communityId);
  const decision = canSpendCommunityTokens({
    requestedTokens: args.requestedTokens,
    sessionTokenLimit: args.sessionTokenLimit ?? state.sessionTokenLimit,
    sessionTokensUsed: args.sessionTokensUsed ?? 0,
    monthlyTokenLimit: state.monthlyTokenLimit,
    monthTokensUsed: state.monthTokensUsed,
  });

  if (!decision.allowed) {
    throw new CommunityBudgetError(
      decision.reason === "MONTHLY_LIMIT"
        ? "Community monthly token limit exceeded"
        : "Community strategy session token limit exceeded"
    );
  }

  return { state, decision };
}

