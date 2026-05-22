import { NextRequest, NextResponse } from "next/server";
import {
  decryptPersonalConnectorToken,
  findPersonalConnectorForWebhook,
  logPersonalConnectorEvent,
} from "@/lib/services/personal-connectors";
import {
  verifySha256WebhookSignature,
  verifySharedWebhookSecret,
} from "@/lib/connectors/personal/crypto";
import { normalizeNotionPersonalWebhook } from "@/lib/connectors/personal/notion";

function readWebhookLookup(request: NextRequest) {
  const url = new URL(request.url);
  return {
    connectorId: url.searchParams.get("connector_id") ?? request.headers.get("x-gennety-connector-id"),
    ownerId: url.searchParams.get("owner_id") ?? request.headers.get("x-gennety-owner-id"),
  };
}

function isVerifiedNotionWebhook(request: NextRequest, bodyText: string, secret: string | null) {
  return (
    verifySharedWebhookSecret(request.headers.get("x-gennety-webhook-secret"), secret) ||
    verifySha256WebhookSignature({
      secret,
      body: bodyText,
      signature: request.headers.get("x-notion-signature"),
      prefix: "sha256=",
    })
  );
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const payload = JSON.parse(bodyText) as Record<string, unknown>;
    const lookup = readWebhookLookup(request);
    const connector = await findPersonalConnectorForWebhook({
      type: "NOTION",
      connectorId: lookup.connectorId,
      ownerId: lookup.ownerId,
    });

    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const secret = decryptPersonalConnectorToken(connector);
    if (!isVerifiedNotionWebhook(request, bodyText, secret)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    if (typeof payload.challenge === "string") {
      return NextResponse.json({ challenge: payload.challenge });
    }

    const normalized = normalizeNotionPersonalWebhook(
      payload,
      request.headers.get("x-notion-delivery-id") ?? request.headers.get("x-request-id")
    );
    const result = await logPersonalConnectorEvent({
      connectorId: connector.id,
      externalId: normalized.externalId,
      title: normalized.title,
      rawPayload: normalized.rawPayload,
      processNow: true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[webhooks:personal:notion]", message);
    return NextResponse.json({ error: "Failed to process Notion webhook" }, { status: 500 });
  }
}
