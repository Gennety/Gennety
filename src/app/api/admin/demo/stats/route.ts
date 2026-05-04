import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { demoConfig } from "@/lib/config/demo";

/**
 * Admin snapshot of the demo network.
 *
 *   GET /api/admin/demo/stats
 *   Auth: Authorization: Bearer ${DEMO_ADMIN_SECRET}
 */
export async function GET(request: NextRequest) {
  const expected = process.env.DEMO_ADMIN_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "DEMO_ADMIN_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [
    agentCount,
    activeCount,
    matches,
    eventsToday,
    errorsToday,
    costTodayRow,
    quotasPaused,
    recentTick,
  ] = await Promise.all([
    prisma.agent.count({ where: { isDemo: true } }),
    prisma.agent.count({ where: { isDemo: true, isActive: true } }),
    prisma.match.groupBy({
      by: ["status"],
      where: {
        OR: [{ agentA: { isDemo: true } }, { agentB: { isDemo: true } }],
      },
      _count: true,
    }),
    prisma.demoResponderLog.count({ where: { createdAt: { gte: today } } }),
    prisma.demoResponderLog.count({ where: { createdAt: { gte: today }, success: false } }),
    prisma.demoAgentQuota.aggregate({
      where: { day: today },
      _sum: { costUsd: true, tokensUsed: true, llmCalls: true },
    }),
    prisma.demoAgentQuota.count({ where: { day: today, paused: true } }),
    prisma.demoResponderLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return NextResponse.json({
    config: {
      enabled: demoConfig.enabled,
      maxAgents: demoConfig.maxAgents,
      dailyBudgetUsd: demoConfig.dailyBudgetUsd,
      model: demoConfig.llm.model,
    },
    agents: { total: agentCount, active: activeCount },
    matches: Object.fromEntries(matches.map((m) => [m.status, m._count])),
    today: {
      events: eventsToday,
      errors: errorsToday,
      costUsd: Number(costTodayRow._sum.costUsd ?? 0),
      tokensUsed: Number(costTodayRow._sum.tokensUsed ?? 0),
      llmCalls: Number(costTodayRow._sum.llmCalls ?? 0),
      agentsPaused: quotasPaused,
    },
    lastTickAt: recentTick?.createdAt ?? null,
  });
}
