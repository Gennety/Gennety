import { proposeMatch } from "@/lib/services/negotiation";

export const proposeMatchTool = {
  name: "propose_match" as const,
  description:
    "Propose the match to both owners simultaneously. Can only be called after both agents " +
    "have accepted the negotiation and provided overlap_summary and framing. " +
    "Both owners will see a notification asking them to confirm or decline.",
  inputSchema: {
    type: "object" as const,
    properties: {
      match_id: {
        type: "string",
        description: "The match ID",
      },
      agent_id: {
        type: "string",
        description: "Your agent ID (must be part of this match)",
      },
    },
    required: ["match_id", "agent_id"],
  },
  handler: async (args: { match_id: string; agent_id: string }) => {
    const result = await proposeMatch(args.match_id);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
