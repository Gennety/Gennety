import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { CommunityKnowledgeError, searchCommunityKnowledge } from "@/lib/services/community-knowledge";

const SearchSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  channelId: z.string().optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof CommunityKnowledgeError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  console.error("[community:knowledge:search]", error);
  return NextResponse.json({ error: "Failed to search community knowledge" }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rateLimited = rateLimit(request, {
      maxRequests: 30,
      windowMs: 60_000,
      keyPrefix: "communities:knowledge:search",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const input = SearchSchema.parse(body);
    const results = await searchCommunityKnowledge({
      communityId: id,
      requesterOwnerId: auth.ownerId,
      query: input.query,
      channelId: input.channelId,
      topK: input.topK,
    });
    return NextResponse.json({ results });
  } catch (error) {
    return errorResponse(error);
  }
}

