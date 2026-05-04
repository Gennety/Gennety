import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Recent DemoResponderLog entries for the admin panel.
 *
 *   GET /api/admin/demo/logs?limit=50&onlyErrors=1
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

  const url = request.nextUrl;
  const limit = Math.min(200, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50);
  const onlyErrors = url.searchParams.get("onlyErrors") === "1";

  const logs = await prisma.demoResponderLog.findMany({
    where: onlyErrors ? { success: false } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      demoAgentId: true,
      event: true,
      mcpTool: true,
      targetId: true,
      targetType: true,
      success: true,
      errorCode: true,
      errorMessage: true,
      latencyMs: true,
      tokensInput: true,
      tokensOutput: true,
      costUsd: true,
    },
  });

  return NextResponse.json({ logs });
}
