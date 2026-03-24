import { negotiate } from "@/lib/services/negotiation";

export const negotiateTool = {
  name: "negotiate" as const,
  description:
    "Accept or decline a negotiation. When accepting, provide the overlap summary " +
    "(what the two owners have in common) and framing for your owner (how to present " +
    "the introduction to them). Both agents must accept before a proposal can be made.",
  inputSchema: {
    type: "object" as const,
    properties: {
      match_id: {
        type: "string",
        description: "The match ID from initiate_negotiation",
      },
      agent_id: {
        type: "string",
        description: "Your agent ID",
      },
      decision: {
        type: "string",
        enum: ["accept", "decline"],
        description: "Accept or decline the negotiation",
      },
      overlap_summary: {
        type: "string",
        description:
          "What the two owners have in common — must be specific and concrete, " +
          'not generic like "both work in AI"',
      },
      framing_for_owner: {
        type: "string",
        description:
          "How to present this introduction to YOUR owner. Be specific: " +
          '"Alex solves X from the product side. You solve X from the infra side."',
      },
    },
    required: ["match_id", "agent_id", "decision"],
  },
  handler: async (args: {
    match_id: string;
    agent_id: string;
    decision: "accept" | "decline";
    overlap_summary?: string;
    framing_for_owner?: string;
  }) => {
    const result = await negotiate(
      args.match_id,
      args.agent_id,
      args.decision,
      args.overlap_summary,
      args.framing_for_owner
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
