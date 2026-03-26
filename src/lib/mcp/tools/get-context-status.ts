import { prisma } from "@/lib/db";

export const getContextStatusTool = {
  name: "get_context_status" as const,
  description:
    "Get the current freshness state of your published context and any notifications about state changes. " +
    "Returns freshness state, days since significant update, active/paused beacon counts.",
  inputSchema: {
    type: "object" as const,
    properties: {
      agent_id: {
        type: "string",
        description: "Your agent ID (e.g. agent_arlan_001)",
      },
    },
    required: ["agent_id"],
  },
  handler: async (args: { agent_id: string }) => {
    const agent = await prisma.agent.findUnique({
      where: { agentId: args.agent_id },
      include: {
        context: true,
        beacons: true,
      },
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

    const activeBeacons = agent.beacons.filter((b) => b.isActive);
    const pausedBeacons = agent.beacons.filter((b) => !b.isActive && b.preservable);

    const daysSinceSignificantUpdate = agent.context
      ? Math.floor(
          (Date.now() - agent.context.lastSignificantUpdateAt.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : -1;

    // Generate notifications based on freshness state
    const notifications: string[] = [];
    if (agent.context) {
      switch (agent.context.freshnessState) {
        case "AGING":
          notifications.push(
            `Your context has not been updated for ${daysSinceSignificantUpdate} days. Recommend checking if current_work, looking_for, or recent_problems have changed.`
          );
          break;
        case "STALE":
          notifications.push(
            `Matching paused — your context has not been updated for ${daysSinceSignificantUpdate} days. Publish an updated context to resume matching and reactivate beacons.`
          );
          break;
        case "INACTIVE":
          notifications.push(
            `Profile is sleeping — your context has not been updated for ${daysSinceSignificantUpdate} days. You are excluded from the index entirely. Publish an updated context to re-enter.`
          );
          break;
      }
    }

    const result = {
      hasContext: !!agent.context,
      freshnessState: agent.context?.freshnessState ?? null,
      daysSinceSignificantUpdate,
      context: agent.context
        ? {
            currentWork: agent.context.currentWork,
            expertise: agent.context.expertise,
            lookingFor: agent.context.lookingFor,
            notLookingFor: agent.context.notLookingFor,
            recentProblems: agent.context.recentProblems,
            location: agent.context.location,
            networkingGoal: agent.context.networkingGoal,
            updatedAt: agent.context.updatedAt,
            previousHash: agent.context.previousHash,
          }
        : null,
      activeBeacons: activeBeacons.map((b) => ({
        beaconId: b.id,
        contextQuery: b.contextQuery,
        createdAt: b.createdAt,
        triggeredAt: b.triggeredAt,
      })),
      activeBeaconCount: activeBeacons.length,
      pausedBeaconCount: pausedBeacons.length,
      notifications,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
