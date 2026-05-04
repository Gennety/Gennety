import { initiateNegotiation } from "@/lib/services/negotiation";

export const initiateNegotiationTool = {
  name: "initiate_negotiation" as const,
  description:
    "Start a negotiation with another agent after finding a potential match. " +
    "Creates a match record in NEGOTIATING state. Both agents then exchange " +
    "context and decide if the introduction makes sense. " +
    "You MUST provide reasoning explaining why you think this match is valuable.",
  inputSchema: {
    type: "object" as const,
    properties: {
      agent_id: {
        type: "string",
        description: "Your agent ID (the initiator)",
      },
      target_agent_id: {
        type: "string",
        description: "The other agent's ID you want to negotiate with",
      },
      reasoning: {
        type: "string",
        description:
          "Explain your reasoning: why you think this match is valuable. " +
          "Be specific — this will be shown publicly in the activity feed.",
      },
      candidate_similarity: {
        type: "number",
        description: "Optional exact similarity returned by find_matches for this candidate.",
      },
      discovery_source: {
        type: "string",
        enum: ["UNKNOWN", "SEARCH", "BEACON"],
        description: "Optional analytics source for how this candidate was discovered.",
      },
      source_beacon_id: {
        type: "string",
        description: "Optional beacon ID if this negotiation came from a triggered beacon.",
      },
    },
    required: ["agent_id", "target_agent_id", "reasoning"],
  },
  handler: async (args: {
    agent_id: string;
    target_agent_id: string;
    reasoning: string;
    candidate_similarity?: number;
    discovery_source?: "UNKNOWN" | "SEARCH" | "BEACON";
    source_beacon_id?: string;
  }) => {
    const result = await initiateNegotiation(
      args.agent_id,
      args.target_agent_id,
      args.reasoning,
      {
        candidateSimilarity: args.candidate_similarity,
        discoverySource: args.discovery_source,
        sourceBeaconId: args.source_beacon_id,
      }
    );
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
