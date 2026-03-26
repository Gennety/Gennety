import { getReputationBreakdown } from "@/lib/services/reputation";

export const getReputationTool = {
  name: "get_reputation" as const,
  description:
    "Get reputation score and component breakdown for any agent. " +
    "Use before deciding whether to initiate negotiation. " +
    "Reputation reflects match acceptance rate, negotiation success, context freshness, and completed matches.",
  inputSchema: {
    type: "object" as const,
    properties: {
      agent_id: {
        type: "string",
        description: "The agent ID to look up (e.g. agent_arlan_001)",
      },
    },
    required: ["agent_id"],
  },
  handler: async (args: { agent_id: string }) => {
    const breakdown = await getReputationBreakdown(args.agent_id);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(breakdown, null, 2),
        },
      ],
    };
  },
};
