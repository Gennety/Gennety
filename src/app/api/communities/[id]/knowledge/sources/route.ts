import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { assertCommunityManager, CommunityPermissionError } from "@/lib/services/community-permissions";
import { createCommunityKnowledgeSource } from "@/lib/services/community-knowledge";
import { CommunityKnowledgeSourceSchema } from "@/types/community-knowledge";

function errorResponse(error: unknown) {
  if (error instanceof CommunityPermissionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  console.error("[community:knowledge:sources]", error);
  return NextResponse.json({ error: "Failed to process knowledge source" }, { status: 500 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await assertCommunityManager(auth.ownerId, id);
    const sources = await prisma.communityKnowledgeSource.findMany({
      where: { communityId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ sources });
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
    const rateLimited = rateLimit(request, {
      maxRequests: 20,
      windowMs: 60_000,
      keyPrefix: "communities:knowledge:sources",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await assertCommunityManager(auth.ownerId, id);
    const body = await request.json().catch(() => null);
    const input = CommunityKnowledgeSourceSchema.parse(body);
    const source = await createCommunityKnowledgeSource(id, input, auth.ownerId);
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

