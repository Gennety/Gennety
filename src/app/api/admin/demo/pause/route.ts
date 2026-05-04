import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pauseAgent } from "@/lib/demo/quota";

/**
 * Pause or unpause a single demo agent for today.
 *
 *   POST /api/admin/demo/pause
 *   body: { demoAgentId: string, paused: boolean, reason?: string }
 *   Auth: Authorization: Bearer ${DEMO_ADMIN_SECRET}
 */
export async function POST(request: NextRequest) {
  const expected = process.env.DEMO_ADMIN_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "DEMO_ADMIN_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    demoAgentId?: string;
    paused?: boolean;
    reason?: string;
  };
  if (!body.demoAgentId || typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "demoAgentId and paused required" }, { status: 400 });
  }

  if (body.paused) {
    await pauseAgent(body.demoAgentId, body.reason ?? "manual admin pause");
  } else {
    const d = new Date();
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    await prisma.demoAgentQuota.updateMany({
      where: { demoAgentId: body.demoAgentId, day },
      data: { paused: false, pauseReason: null },
    });
  }
  return NextResponse.json({ success: true });
}
