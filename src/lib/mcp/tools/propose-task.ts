import { z } from "zod";
import {
  proposeAgentTask,
  TASK_RISK_LEVELS,
} from "@/lib/services/agent-task";

const ProposeTaskArgsSchema = z.object({
  communityId: z.string().min(1),
  title: z.string().min(1).max(240),
  description: z.string().min(1).max(20_000).optional(),
  riskLevel: z.enum(TASK_RISK_LEVELS),
  creatorId: z.string().min(1),
  requiresHitl: z.boolean(),
});

export const proposeTaskTool = {
  name: "propose_task" as const,
  description:
    "Create a community agent task in PROPOSED state. " +
    "High-risk or critical operations are automatically marked as HITL-blocked.",
  inputSchema: {
    type: "object" as const,
    properties: {
      communityId: {
        type: "string",
        description: "ID of the target community",
      },
      title: {
        type: "string",
        description: "Short task title",
      },
      description: {
        type: "string",
        description: "Optional task details",
      },
      riskLevel: {
        type: "string",
        enum: TASK_RISK_LEVELS,
        description: "Risk level for the proposed task",
      },
      creatorId: {
        type: "string",
        description: "Authenticated agent ID or owner ID proposing the task",
      },
      requiresHitl: {
        type: "boolean",
        description: "Whether this task explicitly requires human approval",
      },
    },
    required: ["communityId", "title", "riskLevel", "creatorId", "requiresHitl"],
  },
  handler: async (args: unknown) => {
    const input = ProposeTaskArgsSchema.parse(args);
    const result = await proposeAgentTask(input);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};

export const __test = {
  ProposeTaskArgsSchema,
};
