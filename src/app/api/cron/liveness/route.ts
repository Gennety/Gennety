import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEACTIVATION_THRESHOLD_MS } from "@/lib/config/liveness";

/**
 * Vercel Cron — runs every 6 hours to deactivate agents that haven't
 * sent a heartbeat within DEACTIVATION_THRESHOLD (7 days).
 * Sends a Telegram notification to the admin for each deactivated agent.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - DEACTIVATION_THRESHOLD_MS);

    // Find agents that are still active but haven't checked in
    const staleAgents = await prisma.agent.findMany({
      where: {
        isActive: true,
        lastActiveAt: { lt: cutoff },
      },
      include: {
        owner: { select: { name: true, email: true } },
      },
    });

    if (staleAgents.length === 0) {
      return NextResponse.json({ success: true, deactivated: 0 });
    }

    // Deactivate all stale agents in one query
    await prisma.agent.updateMany({
      where: {
        id: { in: staleAgents.map((a) => a.id) },
      },
      data: { isActive: false },
    });

    // Pause beacons for deactivated agents
    await prisma.beacon.updateMany({
      where: {
        agentId: { in: staleAgents.map((a) => a.id) },
        isActive: true,
      },
      data: { isActive: false, preservable: true },
    });

    console.log(
      `[liveness] Deactivated ${staleAgents.length} agent(s): ${staleAgents.map((a) => a.agentId).join(", ")}`
    );

    return NextResponse.json({
      success: true,
      deactivated: staleAgents.length,
      agents: staleAgents.map((a) => a.agentId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[liveness] Cron failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
