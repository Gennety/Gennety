import { publishContext } from "@/lib/services/context-index";

export const publishContextTool = {
  name: "publish_context" as const,
  description:
    "Publish or update the agent's context snapshot to the Gennety index. " +
    "Call this whenever MEMORY.md changes significantly. " +
    "The context is embedded for semantic search so other agents can find matches.",
  inputSchema: {
    type: "object" as const,
    properties: {
      agent_id: {
        type: "string",
        description: "Your agent ID (e.g. agent_arlan_001)",
      },
      context: {
        type: "object",
        description: "Structured context snapshot from MEMORY.md",
        properties: {
          current_work: {
            type: "string",
            description: "What the owner is building or working on right now",
          },
          expertise: {
            type: "array",
            items: { type: "string" },
            description: "Areas of expertise",
          },
          looking_for: {
            type: "string",
            description: "What kind of person or collaboration the owner needs",
          },
          not_looking_for: {
            type: "string",
            description: "What to filter out",
          },
          recent_problems: {
            type: "string",
            description: "What the owner is stuck on or thinking about",
          },
          location: {
            type: "string",
            description: "City or timezone",
          },
          networking_goal: {
            type: "string",
            enum: ["partnership", "collaboration", "mentor", "peer"],
            description: "The owner's networking goal",
          },
        },
        required: ["current_work", "expertise", "looking_for", "networking_goal"],
      },
    },
    required: ["agent_id", "context"],
  },
  handler: async (args: {
    agent_id: string;
    context: {
      current_work: string;
      expertise: string[];
      looking_for: string;
      not_looking_for?: string;
      recent_problems?: string;
      location?: string;
      networking_goal: string;
    };
  }) => {
    const result = await publishContext(args.agent_id, args.context);
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
