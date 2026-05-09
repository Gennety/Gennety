import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { assertCommunityManager, CommunityPermissionError } from "@/lib/services/community-permissions";
import { runCommunityStrategySession } from "@/lib/services/community-strategy";

function errorResponse(error: unknown) {
  if (error instanceof CommunityPermissionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[community:strategy:run]", error);
  return NextResponse.json({ error: "Failed to run strategy session" }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rateLimited = rateLimit(request, {
      maxRequests: 5,
      windowMs: 60_000,
      keyPrefix: "communities:strategy:run",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await assertCommunityManager(auth.ownerId, id);
    const result = await runCommunityStrategySession(id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

