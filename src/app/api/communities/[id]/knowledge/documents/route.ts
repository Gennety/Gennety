import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { assertCommunityManager, CommunityPermissionError } from "@/lib/services/community-permissions";
import {
  CommunityKnowledgeError,
  ingestCommunityKnowledgeDocument,
} from "@/lib/services/community-knowledge";
import { CommunityKnowledgeDocumentSchema } from "@/types/community-knowledge";

function errorResponse(error: unknown) {
  if (error instanceof CommunityPermissionError || error instanceof CommunityKnowledgeError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  console.error("[community:knowledge:documents]", error);
  return NextResponse.json({ error: "Failed to ingest knowledge document" }, { status: 500 });
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
      keyPrefix: "communities:knowledge:documents",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await assertCommunityManager(auth.ownerId, id);
    const body = await request.json().catch(() => null);
    const input = CommunityKnowledgeDocumentSchema.parse(body);
    const result = await ingestCommunityKnowledgeDocument(id, input, {
      embed: process.env.OPENAI_API_KEY ? true : false,
    });
    return NextResponse.json(result, { status: result.skipped ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

