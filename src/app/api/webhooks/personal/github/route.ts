import { NextRequest, NextResponse } from "next/server";
import {
  decryptPersonalConnectorToken,
  findPersonalConnectorForWebhook,
  logPersonalConnectorEvent,
} from "@/lib/services/personal-connectors";
import { verifySha256WebhookSignature } from "@/lib/connectors/personal/crypto";
import {
  normalizeGitHubPersonalWebhook,
  repositoryFullNameFromGitHubPayload,
} from "@/lib/connectors/personal/github";

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
    const repositoryFullName = repositoryFullNameFromGitHubPayload(payload);
    const connector = await findPersonalConnectorForWebhook({
      type: "GITHUB",
      connectorId: lookup.connectorId,
      ownerId: lookup.ownerId,
      repositoryFullName,
    });

    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const secret = decryptPersonalConnectorToken(connector);
    const verified = verifySha256WebhookSignature({
      secret,
      body: bodyText,
      signature: request.headers.get("x-hub-signature-256"),
      prefix: "sha256=",
    });
    if (!verified) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const normalized = normalizeGitHubPersonalWebhook({
      payload,
      eventName: request.headers.get("x-github-event"),
      deliveryId: request.headers.get("x-github-delivery"),
    });
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
    console.error("[webhooks:personal:github]", message);
    return NextResponse.json({ error: "Failed to process GitHub webhook" }, { status: 500 });
  }
}
