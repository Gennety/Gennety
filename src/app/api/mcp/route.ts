import { NextRequest, NextResponse } from "next/server";
import { publishContextTool } from "@/lib/mcp/tools/publish-context";
import { findMatchesTool } from "@/lib/mcp/tools/find-matches";
import { setBeaconTool } from "@/lib/mcp/tools/set-beacon";
import { initiateNegotiationTool } from "@/lib/mcp/tools/initiate-negotiation";
import { negotiateTool } from "@/lib/mcp/tools/negotiate";
import { proposeMatchTool } from "@/lib/mcp/tools/propose-match";
import { confirmMatchTool } from "@/lib/mcp/tools/confirm-match";
import { markDormantTool } from "@/lib/mcp/tools/mark-dormant";
import { getMatchesTool } from "@/lib/mcp/tools/get-matches";
import { authenticateAgent } from "@/lib/mcp/auth";

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
];

// JSON-RPC 2.0 handler for MCP protocol
export async function POST(request: NextRequest) {
  try {
    // Authenticate via API key in Authorization header
    const authHeader = request.headers.get("authorization");
    const apiKey = authHeader?.replace("Bearer ", "") ?? null;
    const agent = await authenticateAgent(apiKey);

    if (!agent) {
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: invalid API key" }, id: null },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { method, params, id } = body;

    // Handle MCP protocol methods
    switch (method) {
      case "initialize": {
        return NextResponse.json({
          jsonrpc: "2.0",
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "gennety", version: "1.0.0" },
          },
          id,
        });
      }

      case "tools/list": {
        return NextResponse.json({
          jsonrpc: "2.0",
          result: {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
          id,
        });
      }

      case "tools/call": {
        const { name, arguments: args } = params;
        const tool = tools.find((t) => t.name === name);

        if (!tool) {
          return NextResponse.json({
            jsonrpc: "2.0",
            error: { code: -32602, message: `Unknown tool: ${name}` },
            id,
          });
        }

        try {
          // Enforce agent identity — if tool args contain agent_id, it must match authenticated agent
          if (args?.agent_id && args.agent_id !== agent.agentId) {
            return NextResponse.json({
              jsonrpc: "2.0",
              result: {
                content: [{ type: "text", text: JSON.stringify({ error: `Identity mismatch: authenticated as ${agent.agentId} but tool called with ${args.agent_id}` }) }],
                isError: true,
              },
              id,
            });
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await tool.handler(args as any);
          return NextResponse.json({ jsonrpc: "2.0", result, id });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return NextResponse.json({
            jsonrpc: "2.0",
            result: {
              content: [{ type: "text", text: JSON.stringify({ error: message }) }],
              isError: true,
            },
            id,
          });
        }
      }

      default: {
        return NextResponse.json({
          jsonrpc: "2.0",
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message }, id: null },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    name: "gennety-mcp",
    version: "1.0.0",
    tools: tools.map((t) => t.name),
    status: "ok",
  });
}
