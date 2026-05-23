import type { CorporateConnector, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";
import {
  asCorporateConfig,
  configString,
  decryptCorporateConnectorToken,
  findCorporateConnector,
} from "@/lib/services/corporate-connectors";
import {
  createCommunityKnowledgeSource,
  ingestCommunityKnowledgeDocument,
} from "@/lib/services/community-knowledge";
import { fetchWithCorporateRateLimit } from "@/lib/connectors/corporate/outbound-queue";
import { redactCorporateWebhookText } from "@/lib/connectors/corporate/security";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function confluenceApiBase(connector: Pick<CorporateConnector, "externalSpaceId" | "config">) {
  const config = asCorporateConfig(connector.config);
  const explicit = configString(config, "confluenceApiBaseUrl");
  if (explicit) return explicit.replace(/\/$/, "");

  const siteUrl = configString(config, "atlassianSiteUrl");
  if (siteUrl) return `${siteUrl.replace(/\/$/, "")}/wiki/api/v2`;

  return `https://api.atlassian.com/ex/confluence/${encodeURIComponent(connector.externalSpaceId)}/wiki/api/v2`;
}

function confluenceToken(connector: Pick<CorporateConnector, "encryptedToken" | "tokenIv">) {
  const token = decryptCorporateConnectorToken(connector);
  if (!token) throw new Error("Confluence connector token is unavailable");
  return token;
}

async function confluenceFetch(
  connector: Pick<CorporateConnector, "externalSpaceId" | "config" | "encryptedToken" | "tokenIv">,
  path: string,
  init: RequestInit
) {
  const response = await fetchWithCorporateRateLimit(
    "atlassian",
    `${confluenceApiBase(connector)}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${confluenceToken(connector)}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    },
    { retries: 3 }
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Confluence API failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function strategyReportStorage(args: {
  communityName: string;
  summary: string;
  judgeVerdict: Prisma.JsonValue | null;
  partnershipCandidates: Prisma.JsonValue | null;
}) {
  const verdict = args.judgeVerdict ? JSON.stringify(args.judgeVerdict, null, 2) : "No judge verdict recorded.";
  const candidates = args.partnershipCandidates
    ? JSON.stringify(args.partnershipCandidates, null, 2)
    : "No partnership candidates recorded.";

  return [
    `<h1>${escapeHtml(args.communityName)} strategy session</h1>`,
    `<h2>Summary</h2><p>${escapeHtml(args.summary)}</p>`,
    `<h2>Judge verdict</h2><pre>${escapeHtml(verdict)}</pre>`,
    `<h2>Partnership candidates</h2><pre>${escapeHtml(candidates)}</pre>`,
  ].join("");
}

export async function exportStrategySessionToConfluence(sessionId: string) {
  const strategySessions = (prisma as unknown as {
    communityStrategySession?: typeof prisma.communityStrategySession;
  }).communityStrategySession;
  if (!strategySessions?.findUnique) return { skipped: "strategy_delegate_unavailable" as const };

  const session = await strategySessions.findUnique({
    where: { id: sessionId },
    include: { community: { select: { id: true, name: true } } },
  });
  if (!session || !session.summary) return { skipped: "session_missing_summary" as const };

  const connector = await findCorporateConnector({
    platform: "JIRA",
    communityId: session.communityId,
  });
  if (!connector) return { skipped: "jira_connector_missing" as const };

  const config = asCorporateConfig(connector.config);
  const spaceId = configString(config, "confluenceSpaceId");
  if (!spaceId) return { skipped: "confluence_space_missing" as const };

  const title = `Gennety strategy session ${session.completedAt?.toISOString() ?? session.id}`;
  const payload = {
    spaceId,
    status: "current",
    title,
    ...(configString(config, "confluenceParentId")
      ? { parentId: configString(config, "confluenceParentId") }
      : {}),
    body: {
      representation: "storage",
      value: strategyReportStorage({
        communityName: session.community.name,
        summary: session.summary,
        judgeVerdict: session.judgeVerdict,
        partnershipCandidates: session.partnershipCandidates,
      }),
    },
  };

  const page = await confluenceFetch(connector, "/pages", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  await recordAnalyticsEvent({
    type: "CONFLUENCE_STRATEGY_EXPORTED",
    communityId: session.communityId,
    strategySessionId: session.id,
    metadata: {
      connector_id: connector.id,
      confluence_page_id: page.id ?? null,
      confluence_space_id: spaceId,
    } as Prisma.InputJsonValue,
  });

  return { exported: true as const, page };
}

async function ensureConfluenceKnowledgeSource(communityId: string, connectorId: string) {
  const existing = await prisma.communityKnowledgeSource.findFirst({
    where: { communityId, type: "CONFLUENCE", name: "Confluence" },
    select: { id: true },
  });
  if (existing) return existing;

  return createCommunityKnowledgeSource(communityId, {
    type: "CONFLUENCE",
    name: "Confluence",
    config: { connector_id: connectorId },
  });
}

async function fetchConfluencePageBody(connector: CorporateConnector, pageId: string) {
  const page = await confluenceFetch(
    connector,
    `/pages/${encodeURIComponent(pageId)}?body-format=storage`,
    { method: "GET" }
  );
  const body = asObject(asObject(page.body).storage);
  return {
    title: asString(page.title) ?? `Confluence page ${pageId}`,
    url: asString(asObject(page._links).webui),
    content: asString(body.value) ?? "",
  };
}

export async function syncConfluenceWebhookToHub(args: {
  connector: CorporateConnector;
  payload: unknown;
}) {
  const body = asObject(args.payload);
  const page = asObject(body.page ?? body.content ?? body);
  const pageId = asString(page.id) ?? asString(body.pageId) ?? asString(body.contentId);
  if (!pageId) throw new Error("Confluence webhook did not include a page id");

  const inlineBody = asObject(asObject(page.body).storage);
  const fetched = asString(inlineBody.value)
    ? {
        title: asString(page.title) ?? `Confluence page ${pageId}`,
        url: asString(page.url),
        content: asString(inlineBody.value) ?? "",
      }
    : await fetchConfluencePageBody(args.connector, pageId);

  const sanitized = redactCorporateWebhookText(fetched.content.replace(/<[^>]+>/g, " "));
  const source = await ensureConfluenceKnowledgeSource(args.connector.communityId, args.connector.id);
  const result = await ingestCommunityKnowledgeDocument(
    args.connector.communityId,
    {
      sourceId: source.id,
      externalId: pageId,
      title: fetched.title,
      rawContent: sanitized.content || fetched.title,
      url: fetched.url ?? undefined,
      tags: ["confluence"],
      privacyLevel: "ADMINS",
      metadata: {
        connector_id: args.connector.id,
        redactions: sanitized.redactions,
      },
    },
    { embed: Boolean(process.env.OPENAI_API_KEY) }
  );

  await recordAnalyticsEvent({
    type: "CONFLUENCE_PAGE_SYNCED",
    communityId: args.connector.communityId,
    knowledgeSourceId: source.id,
    metadata: {
      connector_id: args.connector.id,
      page_id: pageId,
      result,
    } as Prisma.InputJsonValue,
  });

  return result;
}
