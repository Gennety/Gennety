import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import {
  CommunityAgentCreateError,
  createCommunityFromAgent,
  verifyCommunityAgentCreateToken,
} from "@/lib/services/community-agent-create";
import { CommunityError } from "@/lib/services/community";
import { CommunityKnowledgeError } from "@/lib/services/community-knowledge";

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function errorResponse(error: unknown) {
  if (
    error instanceof CommunityAgentCreateError ||
    error instanceof CommunityError ||
    error instanceof CommunityKnowledgeError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Invalid community payload" },
      { status: 400 }
    );
  }
  console.error("[community:agent-create]", error);
  return NextResponse.json({ error: "Failed to create community from agent payload" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, {
      maxRequests: 20,
      windowMs: 60_000,
      keyPrefix: "communities:agent-create",
    });
    if (rateLimited) return rateLimited;

    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Missing agent community token" }, { status: 401 });
    }

    const payload = verifyCommunityAgentCreateToken(token);
    const body = await request.json().catch(() => null);
    const community = await createCommunityFromAgent(payload.ownerId, body);

    return NextResponse.json(
      {
        community,
        url: `/communities/${community.slug}`,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
