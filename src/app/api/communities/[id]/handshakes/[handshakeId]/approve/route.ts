import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  approveCommunityInviteHandshake,
  CommunityHandshakeError,
} from "@/lib/services/community-handshake";

function errorResponse(error: unknown) {
  if (error instanceof CommunityHandshakeError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[community:handshake:approve]", error);
  return NextResponse.json({ error: "Failed to approve community handshake" }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handshakeId: string }> }
) {
  try {
    const { handshakeId } = await params;
    const rateLimited = rateLimit(request, {
      maxRequests: 20,
      windowMs: 60_000,
      keyPrefix: "communities:handshake:approve",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await approveCommunityInviteHandshake(handshakeId, auth.ownerId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
