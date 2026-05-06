import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeErrorResponse } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import { getWakeStreamConnectionCount } from "@/lib/services/agent-wake-stream";
import { signalAgentWork } from "@/lib/services/agent-delivery";
import { createInboxEvent } from "@/lib/services/inbox";

const WAKE_TEST_ACK_TIMEOUT_MS = 12_000;
const WAKE_TEST_POLL_MS = 600;

async function waitForWakeTestOutcome(eventId: string) {
  const startedAt = Date.now();
  let event = await prisma.inboxEvent.findUnique({
    where: { id: eventId },
    select: {
      deliveredAt: true,
      dismissedAt: true,
    },
  });

  while (event && !event.dismissedAt && Date.now() - startedAt < WAKE_TEST_ACK_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, WAKE_TEST_POLL_MS));
    event = await prisma.inboxEvent.findUnique({
      where: { id: eventId },
      select: {
        deliveredAt: true,
        dismissedAt: true,
      },
    });
  }

  return {
    agentReceived: Boolean(event?.deliveredAt),
    ownerConfirmed: Boolean(event?.dismissedAt),
    deliveredAt: event?.deliveredAt ?? null,
    dismissedAt: event?.dismissedAt ?? null,
  };
}

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
    const confirmation = await waitForWakeTestOutcome(confirmationEvent.id);

    const updated = await prisma.agent.findUnique({
      where: { id: agent.id },
      select: {
        wakeStreamLastConnectedAt: true,
        wakeStreamLastSeenAt: true,
        wakeStreamLastDisconnectedAt: true,
        wakeStreamLastError: true,
      },
    });

    const wakeStreamConnected = connectionCount > 0 || result.channel === "stream";
    const ok = confirmation.ownerConfirmed;

    let message =
      "Realtime stream was not available when the test ran. Polling fallback still works.";

    if (wakeStreamConnected && result.delivered && confirmation.ownerConfirmed) {
      message =
        "Wakeup test completed. OpenClaw confirmed that it delivered the message to you in its normal communication channel.";
    } else if (wakeStreamConnected && result.delivered && confirmation.agentReceived) {
      message =
        "Wakeup reached OpenClaw and it checked in, but it has not confirmed delivery to you yet. This usually means the owner-notification step inside OpenClaw did not complete.";
    } else if (wakeStreamConnected && result.delivered) {
      message =
        "Wakeup signal was sent, but OpenClaw did not complete check_in in time. The realtime channel is live, but the agent did not finish the full notification loop.";
    }

    return NextResponse.json({
      ok,
      channel: result.channel,
      delivered: result.delivered,
      agentReceived: confirmation.agentReceived,
      ownerConfirmed: confirmation.ownerConfirmed,
      connectionCount: result.connectionCount,
      inboxEventId: confirmationEvent.id,
      deliveredAt: confirmation.deliveredAt,
      dismissedAt: confirmation.dismissedAt,
      message,
      wakeStreamConnected,
      wakeStreamLastConnectedAt: updated?.wakeStreamLastConnectedAt ?? null,
      wakeStreamLastSeenAt: updated?.wakeStreamLastSeenAt ?? null,
      wakeStreamLastDisconnectedAt: updated?.wakeStreamLastDisconnectedAt ?? null,
      wakeStreamLastError: updated?.wakeStreamLastError ?? null,
    });
  } catch (error) {
    return safeErrorResponse(error, "Failed to test Wakeup");
  }
}
