import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  CommunityError,
  setCommunityProfileVisibility,
} from "@/lib/services/community";
import { CommunityProfileVisibilitySchema } from "@/types/community";

function communityErrorResponse(error: unknown) {
  if (error instanceof CommunityError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  console.error("[community:profile-visibility]", error);
  return NextResponse.json({ error: "Failed to update visibility" }, { status: 500 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rateLimited = rateLimit(request, {
      maxRequests: 20,
      windowMs: 60_000,
      keyPrefix: "communities:profile-visibility",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const input = CommunityProfileVisibilitySchema.parse(body);
    const community = await setCommunityProfileVisibility(auth.ownerId, id, input);

    return NextResponse.json({ community });
  } catch (error) {
    return communityErrorResponse(error);
  }
}
