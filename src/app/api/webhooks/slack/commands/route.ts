import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { searchCommunityKnowledge } from "@/lib/services/community-knowledge";
import {
  assertCorporateOwnerMapped,
  CorporateConnectorError,
  findCorporateConnector,
} from "@/lib/services/corporate-connectors";
import { verifySlackRequestSignature } from "@/lib/connectors/corporate/security";

function commandResponse(text: string, blocks?: Array<Record<string, unknown>>) {
  return NextResponse.json({
    response_type: "ephemeral",
    text,
    ...(blocks ? { blocks } : {}),
  });
}

function formatSearchResults(
  query: string,
  results: Array<{ title: string; content: string; similarity: number; url: string | null }>
) {
  if (results.length === 0) {
    return [`No Context Hub matches found for "${query}".`];
  }
  return results.map((result) => {
    const score = Math.round(result.similarity * 100);
    const link = result.url ? `<${result.url}|${result.title}>` : result.title;
    return `*${link}* (${score}%)\n${result.content.slice(0, 500)}`;
  });
}

function errorResponse(error: unknown) {
  if (error instanceof CorporateConnectorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[webhooks:slack:commands]", error);
  return commandResponse("Gennety could not process that Slack command right now.");
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, {
      maxRequests: 60,
      windowMs: 60_000,
      keyPrefix: "webhooks:slack:commands",
    });
    if (limited) return limited;

    const bodyText = await request.text();
    const params = new URLSearchParams(bodyText);
    const teamId = params.get("team_id");
    const userId = params.get("user_id");
    const command = params.get("command");
    const text = (params.get("text") ?? "").trim();

    const connector = await findCorporateConnector({
      platform: "SLACK",
      externalSpaceId: teamId,
    });
    if (!connector) return commandResponse("This Slack workspace is not connected to Gennety.");

    const verified = verifySlackRequestSignature({
      signingSecret: connector.webhookSecret,
      body: bodyText,
      timestamp: request.headers.get("x-slack-request-timestamp"),
      signature: request.headers.get("x-slack-signature"),
    });
    if (!verified) {
      return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
    }

    const actor = await assertCorporateOwnerMapped({ connector, externalUserId: userId });

    if (command === "/gennety-search") {
      if (!text) return commandResponse("Usage: /gennety-search product launch checklist");
      const results = await searchCommunityKnowledge({
        communityId: connector.communityId,
        requesterOwnerId: actor.ownerId,
        query: text,
        topK: 5,
      });
      const lines = formatSearchResults(text, results);
      return commandResponse(`Context Hub results for "${text}"`, [
        {
          type: "section",
          text: { type: "mrkdwn", text: lines.join("\n\n") },
        },
      ]);
    }

    if (command === "/gennety-task") {
      const tasks = await prisma.agentTask.findMany({
        where: {
          communityId: connector.communityId,
          status: { in: ["PROPOSED", "APPROVAL_REQUIRED", "ASSIGNED", "RUNNING"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { title: true, status: true, riskLevel: true, assigneeId: true },
      });
      const lines =
        tasks.length > 0
          ? tasks.map((task) => `*${task.title}* - ${task.status}, ${task.riskLevel}${task.assigneeId ? `, ${task.assigneeId}` : ""}`)
          : ["No active Gennety agent tasks."];
      return commandResponse("Active Gennety tasks", [
        {
          type: "section",
          text: { type: "mrkdwn", text: lines.join("\n") },
        },
      ]);
    }

    return commandResponse("Supported commands: /gennety-search [query], /gennety-task");
  } catch (error) {
    return errorResponse(error);
  }
}
