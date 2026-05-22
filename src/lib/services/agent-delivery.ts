import { prisma } from "@/lib/db";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";
import { pingWakeWebhook } from "@/lib/services/agent-wake";
import { emitWakeStreamEvent } from "@/lib/services/agent-wake-stream";

export type AgentWorkKind =
  | "NEW_MESSAGE"
  | "MATCH_PROPOSED"
  | "MATCH_CONFIRMED"
  | "PRIVACY_SETTINGS_CHANGED"
  | "NETWORKING_GOAL_CHANGED"
  | "AGENT_SEARCH_CHANGED"
  | "BEACON_TRIGGERED"
  | "NEGOTIATION_STARTED"
  | "COMMUNITY_HANDSHAKE_REQUESTED"
  | "COMMUNITY_CHAT_MESSAGE"
  | "COMMUNITY_STRATEGY_COMPLETED"
  | "TEAM_ACTIVITY"
  | "TEAM_BLOCKER_LOGGED"
  | "TEAM_TASK_ASSIGNED"
  | "TEAM_TASK_APPROVAL_REQUESTED"
  | "GENERAL";

export interface SignalAgentWorkArgs {
  agentId: string; // internal Agent.id
  reason: string;
  kind?: AgentWorkKind;
  urgency?: "normal" | "high";
  referenceId?: string | null;
}

export interface SignalAgentWorkResult {
  channel: "stream" | "webhook" | "polling";
  delivered: boolean;
  connectionCount: number;
}

export async function signalAgentWork({
  agentId,
  reason,
  kind = "GENERAL",
  urgency = "normal",
  referenceId = null,
}: SignalAgentWorkArgs): Promise<SignalAgentWorkResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      agentId: true,
      ownerId: true,
      webhookUrl: true,
      webhookToken: true,
      wakeWebhookEnabled: true,
    },
  });

  if (!agent) {
    return { channel: "polling", delivered: false, connectionCount: 0 };
  }

  const streamResult = emitWakeStreamEvent(agent.id, {
    kind,
    reason,
    urgency,
    referenceId,
  });

  if (streamResult.delivered) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        wakeStreamLastSeenAt: streamResult.deliveredAt,
        wakeStreamLastError: null,
      },
    });

    await recordAnalyticsEvent({
      type: "AGENT_WAKE_SIGNAL",
      ownerId: agent.ownerId,
      agentId: agent.id,
      metadata: {
        channel: "stream",
        delivered: true,
        connection_count: streamResult.connectionCount,
        kind,
        reason,
        urgency,
        reference_id: referenceId,
      },
      createdAt: streamResult.deliveredAt,
    });

    return {
      channel: "stream",
      delivered: true,
      connectionCount: streamResult.connectionCount,
    };
  }

  if (agent.wakeWebhookEnabled && agent.webhookUrl) {
    const webhookResult = await pingWakeWebhook({
      agentId: agent.id,
      webhookUrl: agent.webhookUrl,
      webhookToken: agent.webhookToken,
      reason,
    });

    await recordAnalyticsEvent({
      type: "AGENT_WAKE_SIGNAL",
      ownerId: agent.ownerId,
      agentId: agent.id,
      metadata: {
        channel: "webhook",
        delivered: webhookResult.ok,
        status: webhookResult.status,
        error: webhookResult.error,
        connection_count: 0,
        kind,
        reason,
        urgency,
        reference_id: referenceId,
      },
      createdAt: webhookResult.checkedAt,
    });

    return {
      channel: "webhook",
      delivered: webhookResult.ok,
      connectionCount: 0,
    };
  }

  await recordAnalyticsEvent({
    type: "AGENT_WAKE_SIGNAL",
    ownerId: agent.ownerId,
    agentId: agent.id,
    metadata: {
      channel: "polling",
      delivered: false,
      connection_count: 0,
      kind,
      reason,
      urgency,
      reference_id: referenceId,
    },
  });

  return { channel: "polling", delivered: false, connectionCount: 0 };
}
