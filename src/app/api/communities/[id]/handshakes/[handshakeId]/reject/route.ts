import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  CommunityHandshakeError,
  rejectCommunityInviteHandshake,
} from "@/lib/services/community-handshake";

const RejectSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof CommunityHandshakeError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  console.error("[community:handshake:reject]", error);
  return NextResponse.json({ error: "Failed to reject community handshake" }, { status: 500 });
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
      keyPrefix: "communities:handshake:reject",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const input = RejectSchema.parse(body ?? {});
    const result = await rejectCommunityInviteHandshake(handshakeId, auth.ownerId, input.reason);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
