import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { ConnectorCryptoError } from "@/lib/connectors/personal/crypto";
import {
  listPersonalConnectors,
  upsertPersonalConnector,
} from "@/lib/services/personal-connectors";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid connector input" }, { status: 400 });
  }
  if (error instanceof ConnectorCryptoError) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.error("[profile:connectors]", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Failed to process personal connector" }, { status: 500 });
}

export async function GET() {
  try {
    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const connectors = await listPersonalConnectors(auth.ownerId);
    return NextResponse.json({ connectors });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, {
      maxRequests: 12,
      windowMs: 60_000,
      keyPrefix: "profile:connectors",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const connector = await upsertPersonalConnector(auth.ownerId, body);
    return NextResponse.json({
      connector: {
        id: connector.id,
        ownerId: connector.ownerId,
        type: connector.type,
        enabled: connector.enabled,
        config: connector.config,
        hasToken: Boolean(connector.encryptedToken),
        createdAt: connector.createdAt,
        updatedAt: connector.updatedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
