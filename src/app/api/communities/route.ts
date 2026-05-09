import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  CommunityError,
  createCommunity,
  listPublicCommunities,
} from "@/lib/services/community";
import {
  CommunityCategory,
  CommunitySpecialization,
  CreateCommunitySchema,
} from "@/types/community";

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
  console.error("[communities]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categoryRaw = request.nextUrl.searchParams.get("category");
    const specializationRaw = request.nextUrl.searchParams.get("specialization");
    const category = categoryRaw ? CommunityCategory.parse(categoryRaw) : null;
    const specialization = specializationRaw
      ? CommunitySpecialization.parse(specializationRaw)
      : null;

    const communities = await listPublicCommunities({
      category,
      specialization,
      viewerOwnerId: auth.ownerId,
    });

    return NextResponse.json({ communities });
  } catch (error) {
    return communityErrorResponse(error, "Failed to load communities");
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, {
      maxRequests: 10,
      windowMs: 60_000,
      keyPrefix: "communities:create",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const input = CreateCommunitySchema.parse(body);
    const community = await createCommunity(auth.ownerId, input);

    return NextResponse.json({ community }, { status: 201 });
  } catch (error) {
    return communityErrorResponse(error, "Failed to create community");
  }
}
