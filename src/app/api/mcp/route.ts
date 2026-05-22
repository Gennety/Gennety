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
import { getContextStatusTool } from "@/lib/mcp/tools/get-context-status";
import { reportChatTool } from "@/lib/mcp/tools/report-chat";
import { blockUserTool } from "@/lib/mcp/tools/block-user";
import { archiveChatTool } from "@/lib/mcp/tools/archive-chat";
import { getReputationTool } from "@/lib/mcp/tools/get-reputation";
import { checkInTool } from "@/lib/mcp/tools/check-in";
import { ackInboxTool } from "@/lib/mcp/tools/ack-inbox";
import { sendChatMessageTool } from "@/lib/mcp/tools/send-chat-message";
import { hubEditTool } from "@/lib/mcp/tools/hub-edit";
import { logActivityTool } from "@/lib/mcp/tools/log-activity";
import { proposeTaskTool } from "@/lib/mcp/tools/propose-task";
import { delegateTaskTool } from "@/lib/mcp/tools/delegate-task";
import { requestApprovalTool } from "@/lib/mcp/tools/request-approval";
import { authenticateAgent } from "@/lib/mcp/auth";
import { rateLimit } from "@/lib/rate-limit";

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
  reportChatTool,
  blockUserTool,
  archiveChatTool,
  getReputationTool,
  checkInTool,
  ackInboxTool,
  sendChatMessageTool,
  hubEditTool,
  logActivityTool,
  proposeTaskTool,
  delegateTaskTool,
  requestApprovalTool,
];

const agentRequestedByTools = new Set(["delegate_task", "request_approval"]);
const agentActorTools = new Set(["log_activity", "propose_task"]);

// JSON-RPC 2.0 handler for MCP protocol
export async function POST(request: NextRequest) {
  const rateLimited = rateLimit(request, { maxRequests: 60, windowMs: 60_000, keyPrefix: "mcp" });
  if (rateLimited) return rateLimited;

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

          if (args?.requestedBy) {
            const requestedByMatchesAgent =
              args.requestedBy === agent.id || args.requestedBy === agent.agentId;
            const requestedByMatchesOwner = args.requestedBy === agent.ownerId;

            if (agentRequestedByTools.has(name) && !requestedByMatchesAgent) {
              return NextResponse.json({
                jsonrpc: "2.0",
                result: {
                  content: [{ type: "text", text: JSON.stringify({ error: `Identity mismatch: authenticated as ${agent.agentId} but tool called with requestedBy=${args.requestedBy}` }) }],
                  isError: true,
                },
                id,
              });
            }

            if (!agentRequestedByTools.has(name) && !requestedByMatchesOwner) {
              return NextResponse.json({
                jsonrpc: "2.0",
                result: {
                  content: [{ type: "text", text: JSON.stringify({ error: `Identity mismatch: authenticated owner is ${agent.ownerId} but tool called with requestedBy=${args.requestedBy}` }) }],
                  isError: true,
                },
                id,
              });
            }
          }

          if (agentActorTools.has(name)) {
            const actorId = args?.actorId ?? args?.creatorId;
            if (actorId && ![agent.id, agent.agentId, agent.ownerId].includes(actorId)) {
              return NextResponse.json({
                jsonrpc: "2.0",
                result: {
                  content: [{ type: "text", text: JSON.stringify({ error: `Identity mismatch: authenticated as ${agent.agentId}/${agent.ownerId} but tool called with actor ${actorId}` }) }],
                  isError: true,
                },
                id,
              });
            }
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
    const message =
      process.env.NODE_ENV === "development"
        ? (error instanceof Error ? error.message : String(error))
        : "Internal server error";
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
