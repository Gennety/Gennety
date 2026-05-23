import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  CorporateConnectorError,
  findCorporateConnector,
} from "@/lib/services/corporate-connectors";
import { verifySlackRequestSignature } from "@/lib/connectors/corporate/security";
import { publishSlackAppHomeDashboard } from "@/lib/connectors/corporate/slack";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function errorResponse(error: unknown) {
  if (error instanceof CorporateConnectorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[webhooks:slack:events]", error);
  return NextResponse.json({ error: "Failed to process Slack event" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, {
      maxRequests: 120,
      windowMs: 60_000,
      keyPrefix: "webhooks:slack:events",
    });
    if (limited) return limited;

    const bodyText = await request.text();
    const payload = JSON.parse(bodyText) as unknown;
    const payloadObject = asObject(payload);
    const teamId = asString(payloadObject.team_id) ?? asString(asObject(payloadObject.team).id);

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
    if (!verified) return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });

    if (payloadObject.type === "url_verification") {
      return NextResponse.json({ challenge: asString(payloadObject.challenge) ?? "" });
    }

    const event = asObject(payloadObject.event);
    if (event.type === "app_home_opened") {
      const slackUserId = asString(event.user);
      if (slackUserId) {
        publishSlackAppHomeDashboard({ connector, slackUserId }).catch((error) =>
          console.error("[webhooks:slack:events] App Home publish failed:", error)
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
