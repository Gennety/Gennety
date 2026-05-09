import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { CommunityError, acceptCommunityInvite } from "@/lib/services/community";

function communityErrorResponse(error: unknown) {
  if (error instanceof CommunityError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[community:invite:accept]", error);
  return NextResponse.json({ error: "Failed to accept invite" }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const rateLimited = rateLimit(request, {
      maxRequests: 20,
      windowMs: 60_000,
      keyPrefix: "communities:invite:accept",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await acceptCommunityInvite(auth.ownerId, auth.email, token);
    return NextResponse.json(result);
  } catch (error) {
    return communityErrorResponse(error);
  }
}
