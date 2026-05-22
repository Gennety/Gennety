import { NextRequest, NextResponse } from "next/server";
import {
  decryptPersonalConnectorToken,
  findPersonalConnectorForWebhook,
  logPersonalConnectorEvent,
} from "@/lib/services/personal-connectors";
import { verifySha256WebhookSignature } from "@/lib/connectors/personal/crypto";
import { normalizeLinearPersonalWebhook } from "@/lib/connectors/personal/linear";

function readWebhookLookup(request: NextRequest) {
  const url = new URL(request.url);
  return {
    connectorId: url.searchParams.get("connector_id") ?? request.headers.get("x-gennety-connector-id"),
    ownerId: url.searchParams.get("owner_id") ?? request.headers.get("x-gennety-owner-id"),
  };
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const payload = JSON.parse(bodyText) as unknown;
    const lookup = readWebhookLookup(request);
    const connector = await findPersonalConnectorForWebhook({
      type: "LINEAR",
      connectorId: lookup.connectorId,
      ownerId: lookup.ownerId,
    });

    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const secret = decryptPersonalConnectorToken(connector);
    const signature = request.headers.get("linear-signature") ?? request.headers.get("x-linear-signature");
    const verified = verifySha256WebhookSignature({
      secret,
      body: bodyText,
      signature,
      prefix: "",
    });
    if (!verified) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const normalized = normalizeLinearPersonalWebhook(
      payload,
      request.headers.get("linear-delivery") ?? request.headers.get("x-request-id")
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
    console.error("[webhooks:personal:linear]", message);
    return NextResponse.json({ error: "Failed to process Linear webhook" }, { status: 500 });
  }
}
