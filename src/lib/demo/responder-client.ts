import { prisma } from "@/lib/db";
import {
  initiateNegotiation,
  negotiate,
  proposeMatch,
  confirmMatch,
  markDormant,
} from "@/lib/services/negotiation";
import { findMatches } from "@/lib/services/match-engine";
import type { LlmUsage } from "@/lib/demo/responder-brain";

/**
 * Responder client — thin wrapper around the same services that the MCP
 * handler invokes. Demo agents go through identical code paths so any bug
 * a real OpenClaw user would hit will also surface in demo activity.
 *
 * Every wrapper also writes a DemoResponderLog row for observability.
 */

export type ResponderEvent =
  | "NEGOTIATE_INITIATE"
  | "NEGOTIATE_RESPOND"
  | "PROPOSE_MATCH"
  | "CONFIRM_MATCH"
  | "MARK_DORMANT"
  | "CHAT_REPLY";

interface LogArgs {
  demoAgentId: string;
  event: ResponderEvent;
  targetId?: string;
  targetType?: "match" | "chat" | "message";
  mcpTool?: string;
  usage?: LlmUsage;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

async function writeLog(args: LogArgs): Promise<void> {
  await prisma.demoResponderLog.create({
    data: {
      demoAgentId: args.demoAgentId,
      event: args.event,
      targetId: args.targetId,
      targetType: args.targetType,
      mcpTool: args.mcpTool,
      latencyMs: args.usage?.latencyMs,
      tokensInput: args.usage?.tokensInput,
      tokensOutput: args.usage?.tokensOutput,
      costUsd: args.usage?.costUsd,
      success: args.success,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
      llmPrompt: args.usage?.prompt?.slice(0, 8_000),
      llmResponse: args.usage?.response?.slice(0, 4_000),
    },
  });
  // Demo agents don't go through the MCP auth layer, so bump lastActiveAt
  // here — otherwise the liveness cron will deactivate them after 7 days
  // and findMatches will stop returning them.
  await prisma.agent.update({
    where: { id: args.demoAgentId },
    data: { lastActiveAt: new Date() },
  });
}

export async function findCandidatesFor(agentExternalId: string) {
  return findMatches(agentExternalId, { limit: 5, minSimilarity: 0.65 });
}

export async function startNegotiation(args: {
  selfInternalId: string;
  selfExternalId: string;
  targetExternalId: string;
  reasoning: string;
  usage: LlmUsage;
  candidateSimilarity?: number;
}) {
  try {
    const result = await initiateNegotiation(
      args.selfExternalId,
      args.targetExternalId,
      args.reasoning,
      {
        candidateSimilarity: args.candidateSimilarity,
        discoverySource: "SEARCH",
      }
    );
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "NEGOTIATE_INITIATE",
      targetId: result.matchId,
      targetType: "match",
      mcpTool: "initiate_negotiation",
      usage: args.usage,
      success: true,
    });
    return result;
  } catch (e) {
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "NEGOTIATE_INITIATE",
      mcpTool: "initiate_negotiation",
      usage: args.usage,
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function respondToNegotiation(args: {
  selfInternalId: string;
  selfExternalId: string;
  matchId: string;
  decision: "accept" | "decline";
  overlapSummary: string;
  framingForOwner: string;
  evaluation: string;
  usage: LlmUsage;
}) {
  try {
    const result = await negotiate(
      args.matchId,
      args.selfExternalId,
      args.decision,
      args.overlapSummary,
      args.framingForOwner,
      args.evaluation
    );
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "NEGOTIATE_RESPOND",
      targetId: args.matchId,
      targetType: "match",
      mcpTool: "negotiate",
      usage: args.usage,
      success: true,
    });
    return result;
  } catch (e) {
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "NEGOTIATE_RESPOND",
      targetId: args.matchId,
      targetType: "match",
      mcpTool: "negotiate",
      usage: args.usage,
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function propose(args: {
  selfInternalId: string;
  matchId: string;
}) {
  try {
    const result = await proposeMatch(args.matchId);
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "PROPOSE_MATCH",
      targetId: args.matchId,
      targetType: "match",
      mcpTool: "propose_match",
      success: true,
    });
    return result;
  } catch (e) {
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "PROPOSE_MATCH",
      targetId: args.matchId,
      targetType: "match",
      mcpTool: "propose_match",
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function confirm(args: {
  selfInternalId: string;
  matchId: string;
  ownerId: string;
  usage?: LlmUsage;
}) {
  try {
    const result = await confirmMatch(args.matchId, args.ownerId);
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "CONFIRM_MATCH",
      targetId: args.matchId,
      targetType: "match",
      mcpTool: "confirm_match",
      usage: args.usage,
      success: true,
    });
    return result;
  } catch (e) {
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "CONFIRM_MATCH",
      targetId: args.matchId,
      targetType: "match",
      mcpTool: "confirm_match",
      usage: args.usage,
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function dormant(args: {
  selfInternalId: string;
  matchId: string;
  ownerId: string;
  usage?: LlmUsage;
}) {
  try {
    const result = await markDormant(args.matchId, args.ownerId);
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "MARK_DORMANT",
      targetId: args.matchId,
      targetType: "match",
      mcpTool: "mark_dormant",
      usage: args.usage,
      success: true,
    });
    return result;
  } catch (e) {
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "MARK_DORMANT",
      targetId: args.matchId,
      targetType: "match",
      mcpTool: "mark_dormant",
      usage: args.usage,
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/**
 * Posts a chat message on behalf of a demo owner. Runs the same DB write the
 * /api/chat POST handler performs, minus HTTP concerns.
 */
export async function sendChatMessage(args: {
  selfInternalId: string;
  chatId: string;
  ownerId: string;
  content: string;
  isOwnerA: boolean;
  usage: LlmUsage;
}) {
  try {
    const message = await prisma.message.create({
      data: {
        chatId: args.chatId,
        fromOwner: args.ownerId,
        content: args.content,
      },
    });
    const readField = args.isOwnerA ? "lastReadByA" : "lastReadByB";
    await prisma.chat.update({
      where: { id: args.chatId },
      data: { [readField]: new Date() },
    });
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "CHAT_REPLY",
      targetId: args.chatId,
      targetType: "chat",
      mcpTool: "chat_send",
      usage: args.usage,
      success: true,
    });
    return message;
  } catch (e) {
    await writeLog({
      demoAgentId: args.selfInternalId,
      event: "CHAT_REPLY",
      targetId: args.chatId,
      targetType: "chat",
      mcpTool: "chat_send",
      usage: args.usage,
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
