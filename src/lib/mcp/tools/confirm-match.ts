import { confirmMatch } from "@/lib/services/negotiation";

export const confirmMatchTool = {
  name: "confirm_match" as const,
  description:
    "Owner confirms the proposed match. When both owners confirm, a chat opens " +
    "with opening messages from both agents explaining the reason for the introduction.",
  inputSchema: {
    type: "object" as const,
    properties: {
      match_id: {
        type: "string",
        description: "The match ID",
      },
      owner_id: {
        type: "string",
        description: "The owner's ID who is confirming",
      },
    },
    required: ["match_id", "owner_id"],
  },
  handler: async (args: { match_id: string; owner_id: string }) => {
    const result = await confirmMatch(args.match_id, args.owner_id);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};
