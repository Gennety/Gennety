import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { resolveModel } from "@/lib/model-router";
import { searchCommunityKnowledge } from "@/lib/services/community-knowledge";
import {
  CorporateConnectorError,
  findCorporateConnector,
  resolveOwnerIdFromCorporateUser,
  verifyCorporateWebhookSecret,
} from "@/lib/services/corporate-connectors";
import { JiraIssueContextSchema } from "@/types/corporate-connectors";

function bearerSecret(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-gennety-webhook-secret");
}

function errorResponse(error: unknown) {
  if (error instanceof CorporateConnectorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  console.error("[jira:issue-context]", error);
  return NextResponse.json({ error: "Failed to resolve Jira issue context" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, {
      maxRequests: 120,
      windowMs: 60_000,
      keyPrefix: "jira:issue-context",
    });
    if (limited) return limited;

    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const input = JiraIssueContextSchema.parse({
      ...body,
      connectorId: body.connectorId ?? url.searchParams.get("connector_id") ?? undefined,
      cloudId: body.cloudId ?? url.searchParams.get("cloud_id") ?? undefined,
      communityId: body.communityId ?? url.searchParams.get("community_id") ?? undefined,
    });

    const connector = await findCorporateConnector({
      platform: "JIRA",
      connectorId: input.connectorId,
      externalSpaceId: input.cloudId,
      communityId: input.communityId,
    });
    if (!connector) return NextResponse.json({ error: "Jira connector not found" }, { status: 404 });
    if (!verifyCorporateWebhookSecret(bearerSecret(request), connector)) {
      return NextResponse.json({ error: "Invalid Jira context secret" }, { status: 401 });
    }

    const requesterOwnerId = resolveOwnerIdFromCorporateUser({
      connector,
      externalUserId: input.requesterExternalUserId,
    });
    const query = [input.issueKey, input.title, input.description].filter(Boolean).join("\n\n");
    if (!query.trim()) return NextResponse.json({ error: "Issue title or description is required" }, { status: 400 });

    const model = await resolveModel("hub_search_answer", { communityId: connector.communityId });
    const results = await searchCommunityKnowledge({
      communityId: connector.communityId,
      requesterOwnerId,
      query,
      topK: input.topK ?? 5,
    });

    return NextResponse.json({
      issue: {
        key: input.issueKey ?? null,
        title: input.title ?? null,
      },
      model,
      results,
      suggestions: results.map((result) => ({
        title: result.title,
        url: result.url,
        similarity: result.similarity,
        excerpt: result.content.slice(0, 700),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
