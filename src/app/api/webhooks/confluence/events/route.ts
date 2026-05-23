import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  CorporateConnectorError,
  findCorporateConnector,
  verifyCorporateWebhookSecret,
} from "@/lib/services/corporate-connectors";
import { syncConfluenceWebhookToHub } from "@/lib/connectors/corporate/confluence";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bearerSecret(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-gennety-webhook-secret");
}

function errorResponse(error: unknown) {
  if (error instanceof CorporateConnectorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[webhooks:confluence:events]", error);
  return NextResponse.json({ error: "Failed to process Confluence webhook" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, {
      maxRequests: 120,
      windowMs: 60_000,
      keyPrefix: "webhooks:confluence:events",
    });
    if (limited) return limited;

    const url = new URL(request.url);
    const payload = (await request.json().catch(() => ({}))) as unknown;
    const body = asObject(payload);
    const connector = await findCorporateConnector({
      platform: "JIRA",
      connectorId: url.searchParams.get("connector_id") ?? request.headers.get("x-gennety-connector-id"),
      externalSpaceId:
        url.searchParams.get("cloud_id") ??
        request.headers.get("x-atlassian-cloud-id") ??
        asString(body.cloudId),
      communityId: url.searchParams.get("community_id") ?? undefined,
    });
    if (!connector) return NextResponse.json({ error: "Atlassian connector not found" }, { status: 404 });
    if (!verifyCorporateWebhookSecret(bearerSecret(request), connector)) {
      return NextResponse.json({ error: "Invalid Confluence webhook secret" }, { status: 401 });
    }

    const result = await syncConfluenceWebhookToHub({ connector, payload });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
