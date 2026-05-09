import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  createCommunityAgentCreateToken,
  generateCommunityAgentCreatePrompt,
} from "@/lib/services/community-agent-create";

function appBaseUrl(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin
  );
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, {
      maxRequests: 10,
      windowMs: 60_000,
      keyPrefix: "communities:agent-create:prompt",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ownerName = auth.email ?? null;
    const endpointUrl = `${appBaseUrl(request)}/api/communities/agent-create`;
    const { token, expiresAt } = createCommunityAgentCreateToken(auth.ownerId);
    const prompt = generateCommunityAgentCreatePrompt({
      ownerName,
      endpointUrl,
      token,
      expiresAt,
    });

    return NextResponse.json({
      prompt,
      endpointUrl,
      expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[community:agent-create:prompt]", message);
    return NextResponse.json({ error: "Failed to generate agent setup prompt" }, { status: 500 });
  }
}
