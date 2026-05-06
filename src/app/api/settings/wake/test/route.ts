import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeErrorResponse } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import { getWakeStreamConnectionCount } from "@/lib/services/agent-wake-stream";
import { signalAgentWork } from "@/lib/services/agent-delivery";
import { createInboxEvent } from "@/lib/services/inbox";

export async function POST(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, {
      maxRequests: 5,
      windowMs: 60_000,
      keyPrefix: "settings-wake-test",
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
        ownerId: true,
        wakeStreamLastConnectedAt: true,
        wakeStreamLastSeenAt: true,
        wakeStreamLastDisconnectedAt: true,
        wakeStreamLastError: true,
      },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const connectionCount = getWakeStreamConnectionCount(agent.id);
    if (connectionCount === 0) {
      return NextResponse.json({
        ok: false,
        channel: "polling",
        delivered: false,
        connectionCount: 0,
        message:
          "Realtime stream is not connected right now. Ask OpenClaw to enable Wakeup, then refresh status. Polling fallback still works.",
        wakeStreamConnected: false,
        wakeStreamLastConnectedAt: agent.wakeStreamLastConnectedAt,
        wakeStreamLastSeenAt: agent.wakeStreamLastSeenAt,
        wakeStreamLastDisconnectedAt: agent.wakeStreamLastDisconnectedAt,
        wakeStreamLastError: agent.wakeStreamLastError,
      });
    }

    const confirmationEvent = await createInboxEvent({
      ownerId: agent.ownerId,
      agentId: agent.id,
      type: "WAKEUP_TEST_CONFIRMATION",
      referenceId: `wakeup_test:${agent.id}:${Date.now()}`,
      payload: {
        action: "confirm_wakeup_to_owner",
        source: "settings_test_wakeup",
        urgency: "normal",
        message_suggestion:
          "Wakeup is working. I am receiving live realtime notifications from Gennety, so if someone writes to you in chat or a new match appears, I can react immediately.",
        delivery_instruction:
          "Send a short confirmation to the owner in your normal communication channel, for example Telegram if that is where you talk to them. After sending it, call ack_inbox for this event.",
        created_at: new Date().toISOString(),
      },
    });

    const result = await signalAgentWork({
      agentId: agent.id,
      kind: "GENERAL",
      reason: "Wakeup test from Gennety settings — check_in and confirm to owner",
      referenceId: confirmationEvent.id,
      urgency: "normal",
    });

    const updated = await prisma.agent.findUnique({
      where: { id: agent.id },
      select: {
        wakeStreamLastConnectedAt: true,
        wakeStreamLastSeenAt: true,
        wakeStreamLastDisconnectedAt: true,
        wakeStreamLastError: true,
      },
    });

    const ok = result.channel === "stream" && result.delivered;

    return NextResponse.json({
      ok,
      channel: result.channel,
      delivered: result.delivered,
      connectionCount: result.connectionCount,
      inboxEventId: confirmationEvent.id,
      message: ok
        ? "Wakeup test sent. OpenClaw should call check_in immediately and confirm to you in its normal communication channel."
        : "Realtime stream was not available when the test ran. Polling fallback still works.",
      wakeStreamConnected: ok,
      wakeStreamLastConnectedAt: updated?.wakeStreamLastConnectedAt ?? null,
      wakeStreamLastSeenAt: updated?.wakeStreamLastSeenAt ?? null,
      wakeStreamLastDisconnectedAt: updated?.wakeStreamLastDisconnectedAt ?? null,
      wakeStreamLastError: updated?.wakeStreamLastError ?? null,
    });
  } catch (error) {
    return safeErrorResponse(error, "Failed to test Wakeup");
  }
}
