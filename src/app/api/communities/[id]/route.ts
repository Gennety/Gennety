import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  CommunityError,
  getCommunityBySlug,
  updateCommunity,
} from "@/lib/services/community";
import { UpdateCommunitySchema } from "@/types/community";

function communityErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CommunityError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  console.error("[community]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const community = await getCommunityBySlug(id, auth.ownerId);
    return NextResponse.json({ community });
  } catch (error) {
    return communityErrorResponse(error, "Failed to load community");
  }
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
      keyPrefix: "communities:update",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const input = UpdateCommunitySchema.parse(body);
    const community = await updateCommunity(auth.ownerId, id, input);

    return NextResponse.json({ community });
  } catch (error) {
    return communityErrorResponse(error, "Failed to update community");
  }
}
