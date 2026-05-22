import { z } from "zod";
import {
  logTeamActivity,
  TEAM_ACTIVITY_CATEGORIES,
} from "@/lib/services/team-activity";

const LogActivityArgsSchema = z.object({
  communityId: z.string().min(1),
  category: z.enum(TEAM_ACTIVITY_CATEGORIES),
  content: z.string().min(1).max(10_000),
  actorId: z.string().min(1),
});

export const logActivityTool = {
  name: "log_activity" as const,
  description:
    "Append a verified event to a community's team activity ledger. " +
    "Content is safety-sanitized before storage. Blocker logs notify community owners/admins.",
  inputSchema: {
    type: "object" as const,
    properties: {
      communityId: {
        type: "string",
        description: "ID of the target community",
      },
      category: {
        type: "string",
        enum: TEAM_ACTIVITY_CATEGORIES,
        description: "Activity category",
      },
      content: {
        type: "string",
        description: "Activity content to append to the immutable ledger",
      },
      actorId: {
        type: "string",
        description: "Authenticated agent ID or owner ID recording the event",
      },
    },
    required: ["communityId", "category", "content", "actorId"],
  },
  handler: async (args: unknown) => {
    const input = LogActivityArgsSchema.parse(args);
    const result = await logTeamActivity(input);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};

export const __test = {
  LogActivityArgsSchema,
};
