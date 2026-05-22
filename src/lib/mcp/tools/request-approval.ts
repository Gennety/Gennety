import { z } from "zod";
import { requestTaskApproval } from "@/lib/services/agent-task";

const RequestApprovalArgsSchema = z.object({
  taskId: z.string().min(1),
  requestedBy: z.string().min(1),
  explanation: z.string().min(1).max(8_000),
});

export const requestApprovalTool = {
  name: "request_approval" as const,
  description:
    "Move a community task into APPROVAL_REQUIRED and notify owners/admins. " +
    "Use this before any high-risk or critical operation is executed.",
  inputSchema: {
    type: "object" as const,
    properties: {
      taskId: {
        type: "string",
        description: "ID of the task requiring approval",
      },
      requestedBy: {
        type: "string",
        description: "Agent ID requesting human approval",
      },
      explanation: {
        type: "string",
        description: "Why the action is necessary and what risks the owner should review",
      },
    },
    required: ["taskId", "requestedBy", "explanation"],
  },
  handler: async (args: unknown) => {
    const input = RequestApprovalArgsSchema.parse(args);
    const result = await requestTaskApproval(input);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};

export const __test = {
  RequestApprovalArgsSchema,
};
