import { prisma } from "@/lib/db";
import { demoConfig } from "@/lib/config/demo";

type QuotaField =
  | "negotiationsInitiated"
  | "negotiationsResponded"
  | "chatMessagesSent";

function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function getOrCreate(demoAgentId: string) {
  const day = todayUtc();
  return prisma.demoAgentQuota.upsert({
    where: { demoAgentId_day: { demoAgentId, day } },
    create: { demoAgentId, day },
    update: {},
  });
}

export async function isPaused(demoAgentId: string): Promise<{ paused: boolean; reason?: string }> {
  const q = await getOrCreate(demoAgentId);
  return { paused: q.paused, reason: q.pauseReason ?? undefined };
}

export async function canPerform(demoAgentId: string, field: QuotaField): Promise<boolean> {
  const q = await getOrCreate(demoAgentId);
  if (q.paused) return false;
  const cap = demoConfig.perAgentCaps[field];
  if (q[field] >= cap) return false;
  const ceiling = demoConfig.dailyBudgetUsd * demoConfig.perAgentBudgetShare;
  if (q.costUsd >= ceiling) {
    await pauseAgent(demoAgentId, `Spent $${q.costUsd.toFixed(4)} today — over per-agent share of $${ceiling.toFixed(4)}`);
    return false;
  }
  return true;
}

export async function recordAction(
  demoAgentId: string,
  field: QuotaField,
  usage?: { tokensInput?: number; tokensOutput?: number; costUsd?: number }
) {
  const day = todayUtc();
  await prisma.demoAgentQuota.upsert({
    where: { demoAgentId_day: { demoAgentId, day } },
    create: {
      demoAgentId,
      day,
      [field]: 1,
      llmCalls: usage ? 1 : 0,
      tokensUsed: (usage?.tokensInput ?? 0) + (usage?.tokensOutput ?? 0),
      costUsd: usage?.costUsd ?? 0,
    },
    update: {
      [field]: { increment: 1 },
      llmCalls: usage ? { increment: 1 } : undefined,
      tokensUsed: usage
        ? { increment: (usage.tokensInput ?? 0) + (usage.tokensOutput ?? 0) }
        : undefined,
      costUsd: usage?.costUsd ? { increment: usage.costUsd } : undefined,
    },
  });
}

export async function pauseAgent(demoAgentId: string, reason: string) {
  const day = todayUtc();
  await prisma.demoAgentQuota.upsert({
    where: { demoAgentId_day: { demoAgentId, day } },
    create: { demoAgentId, day, paused: true, pauseReason: reason },
    update: { paused: true, pauseReason: reason },
  });
}

export async function getTodayTotalSpendUsd(): Promise<number> {
  const day = todayUtc();
  const agg = await prisma.demoAgentQuota.aggregate({
    where: { day },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ?? 0;
}

export async function isBudgetExhausted(): Promise<boolean> {
  const spent = await getTodayTotalSpendUsd();
  return spent >= demoConfig.dailyBudgetUsd;
}
