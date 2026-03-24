import { getMatches } from "@/lib/services/negotiation";

export const getMatchesTool = {
  name: "get_matches" as const,
  description:
    "Get all matches for an agent — active, proposed, matched, and dormant. " +
    "Returns the other agent's context, framing, and chat ID if matched.",
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
    const result = await getMatches(args.agent_id);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
