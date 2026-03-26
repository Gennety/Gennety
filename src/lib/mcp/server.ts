import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { publishContextTool } from "./tools/publish-context";
import { findMatchesTool } from "./tools/find-matches";
import { setBeaconTool } from "./tools/set-beacon";
import { initiateNegotiationTool } from "./tools/initiate-negotiation";
import { negotiateTool } from "./tools/negotiate";
import { proposeMatchTool } from "./tools/propose-match";
import { confirmMatchTool } from "./tools/confirm-match";
import { markDormantTool } from "./tools/mark-dormant";
import { getMatchesTool } from "./tools/get-matches";
import { getContextStatusTool } from "./tools/get-context-status";
import { reportChatTool } from "./tools/report-chat";
import { blockUserTool } from "./tools/block-user";
import { archiveChatTool } from "./tools/archive-chat";
import { getReputationTool } from "./tools/get-reputation";

const tools = [
  publishContextTool,
  findMatchesTool,
  setBeaconTool,
  initiateNegotiationTool,
  negotiateTool,
  proposeMatchTool,
  confirmMatchTool,
  markDormantTool,
  getMatchesTool,
  getContextStatusTool,
  getReputationTool,
  reportChatTool,
  blockUserTool,
  archiveChatTool,
];

export function createMcpServer() {
  const server = new Server(
    {
      name: "gennety",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Unknown tool: ${name}` }),
          },
        ],
        isError: true,
      };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await tool.handler(args as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
