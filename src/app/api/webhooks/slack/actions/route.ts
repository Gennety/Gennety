import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { decideAgentTaskApproval, AgentTaskError } from "@/lib/services/agent-task";
import {
  assertCorporateOwnerMapped,
  CorporateConnectorError,
  findCorporateConnector,
} from "@/lib/services/corporate-connectors";
import { verifySlackRequestSignature } from "@/lib/connectors/corporate/security";
import { postSlackResponseUrl } from "@/lib/connectors/corporate/slack";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTaskId(action: Record<string, unknown>) {
  const value = asString(action.value);
  if (value) {
    try {
      const parsed = JSON.parse(value) as { taskId?: string };
      if (parsed.taskId) return parsed.taskId;
    } catch {
      if (value.startsWith("task_")) return value;
    }
  }

  const actionId = asString(action.action_id) ?? "";
  const legacy = actionId.match(/(?:approve|reject)_task_([A-Za-z0-9_-]+)/);
  return legacy?.[1] ?? null;
}

function errorResponse(error: unknown) {
  if (error instanceof AgentTaskError || error instanceof CorporateConnectorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[webhooks:slack:actions]", error);
  return NextResponse.json({ error: "Failed to process Slack action" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, {
      maxRequests: 60,
      windowMs: 60_000,
      keyPrefix: "webhooks:slack:actions",
    });
    if (limited) return limited;

    const bodyText = await request.text();
    const params = new URLSearchParams(bodyText);
    const payload = JSON.parse(params.get("payload") ?? "{}") as unknown;
    const payloadObject = asObject(payload);
    const team = asObject(payloadObject.team);
    const user = asObject(payloadObject.user);
    const teamId = asString(team.id);

    const connector = await findCorporateConnector({
      platform: "SLACK",
      externalSpaceId: teamId,
      connectorId: new URL(request.url).searchParams.get("connector_id"),
    });
    if (!connector) return NextResponse.json({ error: "Slack connector not found" }, { status: 404 });

    const verified = verifySlackRequestSignature({
      signingSecret: connector.webhookSecret,
      body: bodyText,
      timestamp: request.headers.get("x-slack-request-timestamp"),
      signature: request.headers.get("x-slack-signature"),
    });
    if (!verified) {
      return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
    }

    const actions = Array.isArray(payloadObject.actions) ? payloadObject.actions.map(asObject) : [];
    const action = actions[0];
    const actionId = asString(action?.action_id) ?? "";
    const approved = actionId.includes("approve");
    const rejected = actionId.includes("reject");
    const taskId = action ? parseTaskId(action) : null;
    if (!taskId || (!approved && !rejected)) {
      return NextResponse.json({ error: "Unsupported Slack action" }, { status: 400 });
    }

    const actor = await assertCorporateOwnerMapped({
      connector,
      externalUserId: asString(user.id),
    });
    const result = await decideAgentTaskApproval({
      taskId,
      ownerId: actor.ownerId,
      approved,
      source: "slack",
    });

    const text = approved
      ? `Approved task: ${result.task.title}`
      : `Rejected task: ${result.task.title}`;
    const responseUrl = asString(payloadObject.response_url);
    if (responseUrl) {
      postSlackResponseUrl(responseUrl, {
        response_type: "ephemeral",
        replace_original: false,
        text,
      }).catch((error) => console.error("[webhooks:slack:actions] response_url failed:", error));
    }

    return NextResponse.json({ response_type: "ephemeral", text });
  } catch (error) {
    return errorResponse(error);
  }
}
