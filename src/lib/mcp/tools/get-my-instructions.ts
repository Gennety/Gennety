import { z } from "zod";
import { getAgentInstruction } from "@/lib/services/team-framework";

const GetMyInstructionsArgsSchema = z.object({
  agentId: z.string().min(1),
  communityId: z.string().min(1),
});

export const getMyInstructionsTool = {
  name: "get_my_instructions" as const,
  description:
    "Return this agent's active dynamic AgentInstruction for a community, regenerating it when the 24h TTL expires or role settings changed.",
  inputSchema: {
    type: "object" as const,
    properties: {
      agentId: {
        type: "string",
        description: "Your agent ID",
      },
      communityId: {
        type: "string",
        description: "Community ID whose team instructions should be loaded",
      },
    },
    required: ["agentId", "communityId"],
  },
  handler: async (args: unknown) => {
    const input = GetMyInstructionsArgsSchema.parse(args);
    const result = await getAgentInstruction(input);
    return {
      content: [{ type: "text" as const, text: result.instruction }],
    };
  },
};

export const __test = {
  GetMyInstructionsArgsSchema,
};
