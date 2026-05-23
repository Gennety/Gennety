import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { assertCommunityManager, CommunityPermissionError } from "@/lib/services/community-permissions";
import {
  CorporateConnectorError,
  listCorporateConnectors,
  upsertCorporateConnector,
} from "@/lib/services/corporate-connectors";

function errorResponse(error: unknown) {
  if (error instanceof CommunityPermissionError || error instanceof CorporateConnectorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  console.error("[communities:corporate-connectors]", error);
  return NextResponse.json({ error: "Failed to manage corporate connectors" }, { status: 500 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const limited = rateLimit(request, {
      maxRequests: 60,
      windowMs: 60_000,
      keyPrefix: "communities:corporate-connectors:get",
    });
    if (limited) return limited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await assertCommunityManager(auth.ownerId, id);

    const connectors = await listCorporateConnectors(id);
    return NextResponse.json({ connectors });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const limited = rateLimit(request, {
      maxRequests: 20,
      windowMs: 60_000,
      keyPrefix: "communities:corporate-connectors:post",
    });
    if (limited) return limited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await assertCommunityManager(auth.ownerId, id);

    const body = await request.json().catch(() => ({}));
    const connector = await upsertCorporateConnector({ ...body, communityId: id });
    return NextResponse.json({
      connector: {
        id: connector.id,
        communityId: connector.communityId,
        platform: connector.platform,
        enabled: connector.enabled,
        externalSpaceId: connector.externalSpaceId,
        config: connector.config,
        hasWebhookSecret: Boolean(connector.webhookSecret),
        createdAt: connector.createdAt,
        updatedAt: connector.updatedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
