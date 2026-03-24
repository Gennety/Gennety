import { markDormant } from "@/lib/services/negotiation";

export const markDormantTool = {
  name: "mark_dormant" as const,
  description:
    'Owner said "not now" — match moves to dormant status. No reminders, no re-proposals. ' +
    "Owner can return to dormant matches manually at any time.",
  inputSchema: {
    type: "object" as const,
    properties: {
      match_id: {
        type: "string",
        description: "The match ID",
      },
      owner_id: {
        type: "string",
        description: "The owner's ID who is declining",
      },
    },
    required: ["match_id", "owner_id"],
  },
  handler: async (args: { match_id: string; owner_id: string }) => {
    const result = await markDormant(args.match_id, args.owner_id);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
