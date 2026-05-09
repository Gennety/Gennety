import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchGitHubConnectorItems } from "@/lib/connectors/community/github";
import { fetchNotionConnectorItems } from "@/lib/connectors/community/notion";
import { ingestCommunityKnowledgeDocument } from "@/lib/services/community-knowledge";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function syncCommunityKnowledgeSource(sourceId: string) {
  const source = await prisma.communityKnowledgeSource.findUnique({
    where: { id: sourceId },
  });

  if (!source) throw new Error(`Community knowledge source not found: ${sourceId}`);
  if (source.status !== "ACTIVE") return { sourceId, skipped: "inactive" };

  const config = asObject(source.config);
  try {
    const items =
      source.type === "GITHUB"
        ? (await fetchGitHubConnectorItems(config)).map((item) => ({
            externalId: item.id,
            title: item.title,
            rawContent: item.body,
            url: item.url,
            tags: ["github", ...(item.labels ?? [])],
            metadata: { updated_at: item.updatedAt },
          }))
        : source.type === "NOTION"
        ? (await fetchNotionConnectorItems(config)).map((item) => ({
            externalId: item.id,
            title: item.title,
            rawContent: item.text,
            url: item.url,
            tags: ["notion", ...(item.tags ?? [])],
            metadata: { last_edited_time: item.lastEditedTime },
          }))
        : [];

    let ingested = 0;
    let skipped = 0;
    for (const item of items) {
      const result = await ingestCommunityKnowledgeDocument(
        source.communityId,
        {
          sourceId: source.id,
          externalId: item.externalId,
          title: item.title,
          rawContent: item.rawContent,
          url: item.url,
          tags: item.tags,
          privacyLevel: "COMMUNITY",
          metadata: item.metadata,
        },
        { embed: process.env.OPENAI_API_KEY ? true : false }
      );
      if (result.skipped) skipped += 1;
      else ingested += 1;
    }

    await prisma.communityKnowledgeSource.update({
      where: { id: source.id },
      data: {
        lastSyncedAt: new Date(),
        lastSuccessfulSyncAt: new Date(),
        lastError: null,
        syncCursor: new Date().toISOString(),
      },
    });

    await recordAnalyticsEvent({
      type: "COMMUNITY_CONNECTOR_SYNCED",
      communityId: source.communityId,
      knowledgeSourceId: source.id,
      metadata: {
        source_type: source.type,
        ingested,
        skipped,
      },
    });

    return { sourceId, ingested, skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.communityKnowledgeSource.update({
      where: { id: source.id },
      data: {
        status: "DEGRADED",
        lastSyncedAt: new Date(),
        lastError: message,
      },
    });
    await recordAnalyticsEvent({
      type: "COMMUNITY_CONNECTOR_FAILED",
      communityId: source.communityId,
      knowledgeSourceId: source.id,
      metadata: {
        source_type: source.type,
        error: message,
      },
    });
    throw error;
  }
}

export async function syncDueCommunityKnowledgeSources(limit = 10) {
  const sources = await prisma.communityKnowledgeSource.findMany({
    where: {
      status: "ACTIVE",
      type: { in: ["GITHUB", "NOTION"] },
    },
    orderBy: { lastSyncedAt: "asc" },
    take: limit,
  });

  const results = [];
  for (const source of sources) {
    results.push(await syncCommunityKnowledgeSource(source.id));
  }

  return {
    checked: sources.length,
    results,
  };
}
