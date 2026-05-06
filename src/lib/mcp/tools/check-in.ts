import { prisma } from "@/lib/db";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/config/liveness";
import { computeFreshnessState } from "@/lib/services/freshness";
import { getUndeliveredEvents, markDelivered } from "@/lib/services/inbox";

// Short heartbeat while there's unacked work so owner sees events promptly.
const BUSY_HEARTBEAT_MS = 30 * 1000;

export const checkInTool = {
  name: "check_in" as const,
  description:
    "Heartbeat endpoint — call on the cadence specified by next_check_in_ms (short when inbox has unacked events, otherwise ~15 min). " +
    "Returns the inbox of events to relay to the owner (new messages, match proposals, match confirmations, freshness warnings), " +
    "plus Wakeup test confirmations, privacy and networking-goal update tasks, triggered beacons, incoming negotiations, pending match proposals, and context freshness status. " +
    "After delivering inbox events to the owner, call ack_inbox with the event_ids so they stop being returned. " +
    "Keeps your agent visible in search results.",
  inputSchema: {
    type: "object" as const,
    properties: {
      agent_id: {
        type: "string",
        description: "Your agent ID",
      },
    },
    required: ["agent_id"],
  },
  handler: async (args: { agent_id: string }) => {
    const agent = await prisma.agent.findUnique({
      where: { agentId: args.agent_id },
      include: { context: true },
    });

    if (!agent) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Agent not found: ${args.agent_id}` }),
          },
        ],
        isError: true,
      };
    }

    // Update heartbeat + auto-resurrect if deactivated
    const data: { lastActiveAt: Date; isActive?: boolean } = {
      lastActiveAt: new Date(),
    };
    if (!agent.isActive && !agent.searchPaused) {
      data.isActive = true;
    }
    await prisma.agent.update({
      where: { id: agent.id },
      data,
    });

    // Fetch undelivered+undismissed inbox events and mark as delivered.
    const inboxEvents = await getUndeliveredEvents(agent.id);
    const firstTimeDelivery = inboxEvents.filter((e) => e.deliveredAt === null).map((e) => e.id);
    if (firstTimeDelivery.length > 0) {
      markDelivered(firstTimeDelivery).catch((err) =>
        console.error("[check_in] Failed to mark inbox events delivered:", err)
      );
    }

    // Fetch triggered beacons (beacons with triggeredAt set, still active)
    const triggeredBeacons = await prisma.beacon.findMany({
      where: {
        agentId: agent.id,
        triggeredAt: { not: null },
        isActive: true,
      },
      select: {
        id: true,
        contextQuery: true,
        triggeredAt: true,
      },
    });

    // Fetch pending match proposals (PROPOSED status, not yet confirmed by this agent)
    const pendingMatches = await prisma.match.findMany({
      where: {
        status: "PROPOSED",
        OR: [
          { agentAId: agent.id, confirmedByA: false },
          { agentBId: agent.id, confirmedByB: false },
        ],
      },
      select: {
        id: true,
        overlapSummary: true,
        framingForA: true,
        framingForB: true,
        agentAId: true,
        agentBId: true,
        createdAt: true,
      },
    });

    // Fetch incoming negotiations — other agents initiated, this agent hasn't responded yet
    const incomingNegotiations = await prisma.match.findMany({
      where: {
        status: "NEGOTIATING",
        agentBId: agent.id,
        negotiationLogs: {
          none: {
            agentId: agent.id,
            type: { in: ["evaluation", "agreement", "decline"] },
          },
        },
      },
      select: {
        id: true,
        overlapSummary: true,
        agentA: {
          select: {
            agentId: true,
            displayName: true,
            context: {
              select: {
                currentWork: true,
                expertise: true,
                lookingFor: true,
                networkingGoal: true,
              },
            },
          },
        },
        negotiationLogs: {
          where: { type: { in: ["reasoning", "proposal"] } },
          select: { type: true, content: true },
          orderBy: { createdAt: "asc" as const },
        },
        createdAt: true,
      },
    });

    // Compute context freshness status
    let contextStatus = "NO_CONTEXT";
    let daysSinceUpdate: number | null = null;
    if (agent.context) {
      const freshness = computeFreshnessState(agent.context.lastSignificantUpdateAt);
      contextStatus = freshness;
      daysSinceUpdate = Math.floor(
        (Date.now() - agent.context.lastSignificantUpdateAt.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Build recommended actions
    const recommendedActions: string[] = [];

    if (contextStatus === "NO_CONTEXT") {
      recommendedActions.push("You have not published context yet — call publish_context to join the network");
    } else if (contextStatus === "AGING") {
      recommendedActions.push(`Your context is AGING (${daysSinceUpdate} days old) — re-publish to stay visible in search`);
    } else if (contextStatus === "STALE") {
      recommendedActions.push(`Your context is STALE (${daysSinceUpdate} days old) — you are excluded from search. Re-publish now`);
    } else if (contextStatus === "INACTIVE") {
      recommendedActions.push(`Your context is INACTIVE (${daysSinceUpdate} days old) — fully excluded. Re-publish to rejoin the network`);
    }

    if (incomingNegotiations.length > 0) {
      recommendedActions.push(
        `${incomingNegotiations.length} agent${incomingNegotiations.length > 1 ? "s" : ""} want to negotiate with you — respond with negotiate()`
      );
    }

    if (pendingMatches.length > 0) {
      recommendedActions.push(
        `${pendingMatches.length} match${pendingMatches.length > 1 ? "es" : ""} awaiting owner confirmation — remind your owner`
      );
    }

    if (triggeredBeacons.length > 0) {
      recommendedActions.push(
        `${triggeredBeacons.length} beacon${triggeredBeacons.length > 1 ? "s" : ""} triggered — evaluate new candidates`
      );
    }

    if (agent.searchPaused) {
      recommendedActions.unshift(
        "Owner paused match search — do not call find_matches, set_beacon, initiate_negotiation, or propose_match until search is resumed"
      );
    }

    if (inboxEvents.length > 0) {
      recommendedActions.push(
        `${inboxEvents.length} inbox event${inboxEvents.length > 1 ? "s" : ""} awaiting delivery — relay to owner, then call ack_inbox`
      );
    }

    const privacyEvents = inboxEvents.filter((event) => event.type === "PRIVACY_SETTINGS_CHANGED");
    if (privacyEvents.length > 0) {
      recommendedActions.unshift(
        "Privacy settings changed — update the published context immediately using the latest inbox event before matching again"
      );
    }

    const goalEvents = inboxEvents.filter((event) => event.type === "NETWORKING_GOAL_CHANGED");
    if (goalEvents.length > 0) {
      recommendedActions.unshift(
        "Networking goal changed — update your local strategy, reset beacon plans, and re-publish context using the new goal"
      );
    }

    // Dynamic heartbeat — short while there's unacked work so the owner sees events promptly.
    const nextCheckInMs = inboxEvents.length > 0 ? BUSY_HEARTBEAT_MS : HEARTBEAT_INTERVAL_MS;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "alive",
              resurrected: !agent.isActive && !agent.searchPaused,
              search_paused: agent.searchPaused,
              next_check_in_ms: nextCheckInMs,
              context_status: contextStatus,
              days_since_update: daysSinceUpdate,
              inbox: inboxEvents.map((e) => ({
                event_id: e.id,
                type: e.type,
                created_at: e.createdAt,
                first_delivered_at: e.deliveredAt,
                payload: e.payload,
              })),
              triggered_beacons: triggeredBeacons.map((b) => ({
                beacon_id: b.id,
                context_query: b.contextQuery,
                triggered_at: b.triggeredAt,
              })),
              pending_matches: pendingMatches.map((m) => ({
                match_id: m.id,
                overlap_summary: m.overlapSummary,
                framing: m.agentAId === agent.id ? m.framingForA : m.framingForB,
                proposed_at: m.createdAt,
              })),
              incoming_negotiations: incomingNegotiations.map((n) => ({
                match_id: n.id,
                from_agent: n.agentA.agentId,
                from_display_name: n.agentA.displayName,
                their_context: n.agentA.context
                  ? {
                      current_work: n.agentA.context.currentWork,
                      expertise: n.agentA.context.expertise,
                      looking_for: n.agentA.context.lookingFor,
                      networking_goal: n.agentA.context.networkingGoal,
                    }
                  : null,
                their_reasoning: n.negotiationLogs.map((l) => ({
                  type: l.type,
                  content: l.content,
                })),
                initiated_at: n.createdAt,
              })),
              recommended_actions: recommendedActions,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
