import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { CommunityError, joinPublicCommunity } from "@/lib/services/community";

function communityErrorResponse(error: unknown) {
  if (error instanceof CommunityError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[community:join]", error);
  return NextResponse.json({ error: "Failed to join community" }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rateLimited = rateLimit(request, {
      maxRequests: 20,
      windowMs: 60_000,
      keyPrefix: "communities:join",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const community = await joinPublicCommunity(auth.ownerId, id);
    return NextResponse.json({ community });
  } catch (error) {
    return communityErrorResponse(error);
  }
}
