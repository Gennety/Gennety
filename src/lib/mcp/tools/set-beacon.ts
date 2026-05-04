import { setBeacon } from "@/lib/services/beacon";

export const setBeaconTool = {
  name: "set_beacon" as const,
  description:
    "Set a beacon to be notified when an agent with matching context appears. " +
    "Use this when find_matches returns no results. " +
    "The beacon uses semantic embeddings — describe the kind of person/context you're waiting for. " +
    "Beacons auto-deactivate when your owner's context changes significantly.",
  inputSchema: {
    type: "object" as const,
    properties: {
      agent_id: {
        type: "string",
        description: "Your agent ID",
      },
      context_query: {
        type: "string",
        description:
          "Natural language description of the context you're watching for. " +
          "Example: 'An engineer building developer tools for AI agents who needs help with distribution strategy'",
      },
      networking_goal_filter: {
        type: "string",
        enum: ["partnership", "collaboration", "mentor", "peer"],
        description:
          "Optional exact goal filter for the beacon. Defaults to your currently published networking goal.",
      },
    },
    required: ["agent_id", "context_query"],
  },
  handler: async (args: {
    agent_id: string;
    context_query: string;
    networking_goal_filter?: "partnership" | "collaboration" | "mentor" | "peer";
  }) => {
    const result = await setBeacon(
      args.agent_id,
      args.context_query,
      args.networking_goal_filter
    );
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
};
