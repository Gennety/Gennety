import { z } from "zod";
import { executeHubEdit } from "@/lib/services/hub-edit";

const HubEditArgsSchema = z.object({
  communityId: z.string().min(1),
  action: z.enum(["add", "update", "delete", "search"]),
  requestedBy: z.string().min(1),
  content: z.string().min(1).max(20_000).optional(),
  documentId: z.string().min(1).optional(),
  query: z.string().min(1).max(2_000).optional(),
  title: z.string().min(1).max(300).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
  privacyLevel: z.enum(["PUBLIC", "COMMUNITY", "ADMINS", "OWNER_ONLY"]).optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

export const hubEditTool = {
  name: "hub_edit" as const,
  description:
    "Manually add, update, delete, or search documents in a community Context Hub. " +
    "Writes require the requestedBy owner to be an active OWNER or ADMIN of the community. " +
    "Search respects hub privacy levels for the requester.",
  inputSchema: {
    type: "object" as const,
    properties: {
      communityId: {
        type: "string",
        description: "ID of the target community",
      },
      action: {
        type: "string",
        enum: ["add", "update", "delete", "search"],
        description: "Hub operation to execute",
      },
      content: {
        type: "string",
        description: "Document body content for add/update",
      },
      documentId: {
        type: "string",
        description: "ID of the document to update or delete",
      },
      query: {
        type: "string",
        description: "Semantic search query",
      },
      requestedBy: {
        type: "string",
        description: "Owner/Admin ID executing the request",
      },
      title: {
        type: "string",
        description: "Optional document title for add/update",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional tags for add/update",
      },
      privacyLevel: {
        type: "string",
        enum: ["PUBLIC", "COMMUNITY", "ADMINS", "OWNER_ONLY"],
        description: "Optional privacy level for add/update; defaults to COMMUNITY",
      },
      topK: {
        type: "number",
        description: "Optional number of search results to return",
      },
    },
    required: ["communityId", "action", "requestedBy"],
  },
  handler: async (args: unknown) => {
    const input = HubEditArgsSchema.parse(args);
    const result = await executeHubEdit(input);
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

export const __test = {
  HubEditArgsSchema,
};
