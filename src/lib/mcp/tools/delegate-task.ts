import { z } from "zod";
import { delegateAgentTask } from "@/lib/services/agent-task";

const DelegateTaskArgsSchema = z.object({
  taskId: z.string().min(1),
  assigneeId: z.string().min(1),
  requestedBy: z.string().min(1),
});

export const delegateTaskTool = {
  name: "delegate_task" as const,
  description:
    "Assign an existing community task to another agent. " +
    "Delegation is blocked in Autonomy Phase 1 and for HITL tasks without owner approval.",
  inputSchema: {
    type: "object" as const,
    properties: {
      taskId: {
        type: "string",
        description: "ID of the task to delegate",
      },
      assigneeId: {
        type: "string",
        description: "Target agent ID",
      },
      requestedBy: {
        type: "string",
        description: "Delegating agent ID",
      },
    },
    required: ["taskId", "assigneeId", "requestedBy"],
  },
  handler: async (args: unknown) => {
    const input = DelegateTaskArgsSchema.parse(args);
    const result = await delegateAgentTask(input);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};

export const __test = {
  DelegateTaskArgsSchema,
};
