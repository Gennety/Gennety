import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeErrorResponse } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import { pingWakeWebhook } from "@/lib/services/agent-wake";

export async function POST(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, {
      maxRequests: 5,
      windowMs: 60_000,
      keyPrefix: "settings-webhook-test",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findUnique({
      where: { ownerId: auth.ownerId },
      select: {
        id: true,
        webhookUrl: true,
        webhookToken: true,
        wakeWebhookEnabled: true,
      },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (!agent.webhookUrl || !agent.webhookToken) {
      return NextResponse.json(
        { error: "Save both the base URL and bearer token first" },
        { status: 400 }
      );
    }

    const result = await pingWakeWebhook({
      agentId: agent.id,
      webhookUrl: agent.webhookUrl,
      webhookToken: agent.webhookToken,
      reason: "Test connection from Gennety settings",
    });

    return NextResponse.json({
      ok: result.ok,
      enabled: agent.wakeWebhookEnabled,
      checkedAt: result.checkedAt,
      statusCode: result.status,
      error: result.error,
    });
  } catch (error) {
    return safeErrorResponse(error, "Failed to test wake webhook");
  }
}
