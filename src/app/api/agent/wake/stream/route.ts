import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/mcp/auth";
import { prisma } from "@/lib/db";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";
import { createAgentWakeStream } from "@/lib/services/agent-wake-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(getBearerToken(request));

  if (!agent) {
    return NextResponse.json({ error: "Unauthorized: invalid agent token" }, { status: 401 });
  }

  const connectedAt = new Date();
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      wakeStreamLastConnectedAt: connectedAt,
      wakeStreamLastSeenAt: connectedAt,
      wakeStreamLastDisconnectedAt: null,
      wakeStreamLastError: null,
    },
  });

  await recordAnalyticsEvent({
    type: "AGENT_WAKE_STREAM_CONNECTED",
    ownerId: agent.ownerId,
    agentId: agent.id,
    createdAt: connectedAt,
  });

  const { stream, connectionId } = createAgentWakeStream({
    agentInternalId: agent.id,
    agentExternalId: agent.agentId,
    onDisconnect: ({ disconnectedAt, reason }) => {
      prisma.agent
        .update({
          where: { id: agent.id },
          data: {
            wakeStreamLastSeenAt: disconnectedAt,
            wakeStreamLastDisconnectedAt: disconnectedAt,
            wakeStreamLastError: reason === "connection_rotation" || reason === "client_cancelled" ? null : reason,
          },
        })
        .catch((error) => console.error("[wake-stream] Failed to persist disconnect:", error));

      recordAnalyticsEvent({
        type: "AGENT_WAKE_STREAM_DISCONNECTED",
        ownerId: agent.ownerId,
        agentId: agent.id,
        metadata: { connection_id: connectionId, reason },
        createdAt: disconnectedAt,
      }).catch((error) => console.error("[wake-stream] Failed to record disconnect:", error));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
