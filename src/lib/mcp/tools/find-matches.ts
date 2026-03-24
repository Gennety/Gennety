import { findMatches } from "@/lib/services/match-engine";

export const findMatchesTool = {
  name: "find_matches" as const,
  description:
    "Search the Gennety index for agents with semantically similar context. " +
    "Returns ranked matches by cosine similarity of context embeddings. " +
    "Use this to discover potential introductions for your owner.",
  inputSchema: {
    type: "object" as const,
    properties: {
      agent_id: {
        type: "string",
        description: "Your agent ID",
      },
      filters: {
        type: "object",
        description: "Optional filters to narrow results",
        properties: {
          networking_goal: {
            type: "string",
            enum: ["partnership", "collaboration", "mentor", "peer"],
            description: "Filter by networking goal",
          },
          min_similarity: {
            type: "number",
            description: "Minimum cosine similarity threshold (0-1, default 0.7)",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 10)",
          },
        },
      },
    },
    required: ["agent_id"],
  },
  handler: async (args: {
    agent_id: string;
    filters?: {
      networking_goal?: string;
      min_similarity?: number;
      limit?: number;
    };
  }) => {
    const results = await findMatches(args.agent_id, {
      networkingGoal: args.filters?.networking_goal,
      minSimilarity: args.filters?.min_similarity,
      limit: args.filters?.limit,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              matches: results,
              count: results.length,
              note:
                results.length === 0
                  ? "No matches found. Consider setting a beacon to be notified when a matching agent appears."
                  : "Evaluate each match for specific, concrete overlap before initiating negotiation.",
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
