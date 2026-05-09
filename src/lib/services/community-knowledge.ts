import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateEmbeddingWithUsage } from "@/lib/embeddings";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";
import {
  CommunityChannelSchema,
  CommunityKnowledgeDocumentSchema,
  CommunityKnowledgeSourceSchema,
  type CommunityChannelInput,
  type CommunityKnowledgeDocumentInput,
  type CommunityKnowledgePrivacy,
  type CommunityKnowledgeSourceInput,
  type CommunityKnowledgeSourceType,
} from "@/types/community-knowledge";

const DEFAULT_CHUNK_MAX_CHARS = 1800;
const COMMUNITY_KNOWLEDGE_MIN_SIMILARITY = 0.6;

const PROMPT_INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions?/i,
  /reveal (the )?(private|secret|system|memory)/i,
  /send (the )?(api key|token|secret)/i,
  /you are now/i,
  /developer message/i,
  /system prompt/i,
];

const MEMORY_SECTION_MARKERS = [
  /^#\s*Memory\b/i,
  /^##\s*Who I Am\b/i,
  /^##\s*Current Work\b/i,
  /^##\s*What I Need\b/i,
  /^##\s*What I'm Stuck On\b/i,
  /^##\s*Not Looking For\b/i,
  /^##\s*Values\b/i,
];

export class CommunityKnowledgeError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export interface DistilledCommunityContent {
  content: string;
  summary: string;
  redactionSummary: string[];
  rejected: boolean;
  tags: string[];
}

export function hashCommunityText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function generateCuidLike(prefix = "c") {
  return `${prefix}${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function sentenceSplit(text: string) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function sanitizeConnectorContent(rawContent: string) {
  const redactions: string[] = [];
  const lines = rawContent.split(/\r?\n/);
  const sanitizedLines = lines.flatMap((line) => {
    if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(line))) {
      redactions.push("Removed prompt-injection-like connector instruction");
      return [];
    }

    if (/([A-Za-z0-9_]{20,}\.[A-Za-z0-9_=-]{20,}|sk-[A-Za-z0-9]{20,})/.test(line)) {
      redactions.push("Redacted possible secret token");
      return line.replace(/[A-Za-z0-9_]{20,}\.[A-Za-z0-9_=-]{20,}|sk-[A-Za-z0-9]{20,}/g, "[REDACTED_SECRET]");
    }

    return [line];
  });

  return {
    content: normalizeWhitespace(sanitizedLines.join("\n")),
    redactions,
  };
}

export function containsRawMemoryMarkers(text: string) {
  return text
    .split(/\r?\n/)
    .some((line) => MEMORY_SECTION_MARKERS.some((pattern) => pattern.test(line.trim())));
}

export function distillCommunityContent(args: {
  rawContent: string;
  sourceType: CommunityKnowledgeSourceType;
  title?: string;
  tags?: string[];
}): DistilledCommunityContent {
  const sanitized = sanitizeConnectorContent(args.rawContent);
  const redactionSummary = [...sanitized.redactions];
  const sentences = sentenceSplit(sanitized.content);
  const isMemberContext = args.sourceType === "MEMBER_CONTEXT";
  const hadMemoryMarkers = containsRawMemoryMarkers(args.rawContent);

  if (hadMemoryMarkers || isMemberContext) {
    redactionSummary.push("Converted member memory into a shareable hub summary");
  }

  const usefulSentences = sentences
    .filter((line) => !MEMORY_SECTION_MARKERS.some((pattern) => pattern.test(line)))
    .filter((line) => !/^[-*]\s*(advisors?|investors?|backend-only|anyone not passionate)/i.test(line))
    .slice(0, 8);

  const sourceLabel = args.title ? `Source: ${args.title}` : "Source: community context";
  const summarySeeds = usefulSentences.slice(0, 3);
  const summary =
    summarySeeds.length > 0
      ? summarySeeds.join(" ")
      : "No durable community-relevant facts survived distillation.";

  const content = [
    sourceLabel,
    `Summary: ${summary}`,
    usefulSentences.length > 3 ? `Signals: ${usefulSentences.slice(3).join(" ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    content,
    summary,
    redactionSummary: Array.from(new Set(redactionSummary)),
    rejected: usefulSentences.length === 0,
    tags: Array.from(new Set(args.tags ?? [])),
  };
}

export function chunkDistilledContent(text: string, maxChars = DEFAULT_CHUNK_MAX_CHARS) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxChars) return [normalized].filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentenceSplit(normalized)) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let offset = 0; offset < sentence.length; offset += maxChars) {
        chunks.push(sentence.slice(offset, offset + maxChars).trim());
      }
      continue;
    }

    if ((current + " " + sentence).trim().length > maxChars && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

export function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function allowedPrivacyLevelsForMembership(input: {
  isMember: boolean;
  role?: "OWNER" | "ADMIN" | "MEMBER" | null;
  isCommunityOwner?: boolean;
}): CommunityKnowledgePrivacy[] {
  if (input.isCommunityOwner || input.role === "OWNER") {
    return ["PUBLIC", "COMMUNITY", "ADMINS", "OWNER_ONLY"];
  }
  if (input.role === "ADMIN") return ["PUBLIC", "COMMUNITY", "ADMINS"];
  if (input.isMember) return ["PUBLIC", "COMMUNITY"];
  return ["PUBLIC"];
}

export async function createCommunityChannel(communityId: string, input: CommunityChannelInput) {
  const parsed = CommunityChannelSchema.parse(input);
  return prisma.communityChannel.upsert({
    where: { communityId_slug: { communityId, slug: parsed.slug } },
    create: {
      communityId,
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description,
      knowledgeFilter: parsed.knowledgeFilter as Prisma.InputJsonValue,
      semanticQuery: parsed.semanticQuery,
    },
    update: {
      name: parsed.name,
      description: parsed.description,
      knowledgeFilter: parsed.knowledgeFilter as Prisma.InputJsonValue,
      semanticQuery: parsed.semanticQuery,
    },
  });
}

export async function createCommunityKnowledgeSource(
  communityId: string,
  input: CommunityKnowledgeSourceInput,
  createdByOwnerId?: string | null
) {
  const parsed = CommunityKnowledgeSourceSchema.parse(input);
  const source = await prisma.communityKnowledgeSource.create({
    data: {
      communityId,
      type: parsed.type,
      name: parsed.name,
      config: parsed.config as Prisma.InputJsonValue,
      createdByOwnerId: createdByOwnerId ?? null,
    },
  });

  await recordAnalyticsEvent({
    type: "COMMUNITY_KNOWLEDGE_SOURCE_CREATED",
    communityId,
    knowledgeSourceId: source.id,
    ownerId: createdByOwnerId,
    metadata: {
      source_type: source.type,
      source_name: source.name,
    },
  });

  return source;
}

export async function ingestCommunityKnowledgeDocument(
  communityId: string,
  input: CommunityKnowledgeDocumentInput,
  options: { embed?: boolean } = {}
) {
  const parsed = CommunityKnowledgeDocumentSchema.parse(input);
  const source = await prisma.communityKnowledgeSource.findUnique({
    where: { id: parsed.sourceId },
    select: { id: true, communityId: true, type: true },
  });

  if (!source || source.communityId !== communityId) {
    throw new CommunityKnowledgeError("Knowledge source not found", 404);
  }

  const sourceHash = hashCommunityText(parsed.rawContent);
  const externalId = parsed.externalId ?? `manual:${sourceHash}`;
  const existing = await prisma.communityKnowledgeDocument.findUnique({
    where: { sourceId_externalId: { sourceId: source.id, externalId } },
    select: { id: true, sourceHash: true, distilledHash: true },
  });

  if (existing?.sourceHash === sourceHash) {
    return { documentId: existing.id, skipped: true, chunks: 0 };
  }

  const distilled = distillCommunityContent({
    rawContent: parsed.rawContent,
    sourceType: source.type,
    title: parsed.title,
    tags: parsed.tags,
  });
  const status = distilled.rejected ? "REJECTED" : "ACTIVE";
  const distilledHash = hashCommunityText(distilled.content);

  const document = await prisma.communityKnowledgeDocument.upsert({
    where: { sourceId_externalId: { sourceId: source.id, externalId } },
    create: {
      communityId,
      sourceId: source.id,
      externalId,
      title: parsed.title,
      url: parsed.url,
      sourceHash,
      distilledHash,
      distilledContent: distilled.content,
      summary: distilled.summary,
      tags: distilled.tags,
      privacyLevel: parsed.privacyLevel,
      status,
      metadata: {
        ...(parsed.metadata ?? {}),
        redaction_summary: distilled.redactionSummary,
      } as Prisma.InputJsonValue,
    },
    update: {
      title: parsed.title,
      url: parsed.url,
      sourceHash,
      distilledHash,
      distilledContent: distilled.content,
      summary: distilled.summary,
      tags: distilled.tags,
      privacyLevel: parsed.privacyLevel,
      status,
      supersededAt: null,
      metadata: {
        ...(parsed.metadata ?? {}),
        redaction_summary: distilled.redactionSummary,
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.communityKnowledgeChunk.deleteMany({ where: { documentId: document.id } });

  const chunks = distilled.rejected ? [] : chunkDistilledContent(distilled.content);
  for (const [index, content] of chunks.entries()) {
    const chunkId = generateCuidLike();
    const metadata = {
      chunk_index: index,
      source_type: source.type,
      document_title: parsed.title,
    } satisfies Prisma.InputJsonValue;

    if (options.embed !== false) {
      try {
        const { embedding } = await generateEmbeddingWithUsage(content, {
          operation: "community_knowledge_embed",
          communityId,
          knowledgeSourceId: source.id,
          metadata: {
            document_id: document.id,
            chunk_index: index,
          },
        });

        await prisma.$executeRaw`
          INSERT INTO community_knowledge_chunks (
            id, community_id, document_id, content, embedding, token_count, tags, privacy_level, metadata, created_at
          )
          VALUES (
            ${chunkId},
            ${communityId},
            ${document.id},
            ${content},
            ${embedding}::vector,
            ${estimateTokenCount(content)},
            ${distilled.tags},
            ${parsed.privacyLevel}::"CommunityKnowledgePrivacy",
            ${JSON.stringify(metadata)}::jsonb,
            NOW()
          )
        `;
        continue;
      } catch (error) {
        console.error("[community-knowledge] Embedding failed, storing text chunk only:", error);
      }
    }

    await prisma.communityKnowledgeChunk.create({
      data: {
        id: chunkId,
        communityId,
        documentId: document.id,
        content,
        tokenCount: estimateTokenCount(content),
        tags: distilled.tags,
        privacyLevel: parsed.privacyLevel,
        metadata,
      },
    });
  }

  await prisma.communityKnowledgeSource.update({
    where: { id: source.id },
    data: {
      lastSyncedAt: new Date(),
      lastSuccessfulSyncAt: new Date(),
      lastError: null,
    },
  });

  await recordAnalyticsEvent({
    type: "COMMUNITY_KNOWLEDGE_DOCUMENT_INGESTED",
    communityId,
    knowledgeSourceId: source.id,
    metadata: {
      document_id: document.id,
      source_type: source.type,
      privacy_level: parsed.privacyLevel,
      chunks: chunks.length,
      rejected: distilled.rejected,
    },
  });

  return {
    documentId: document.id,
    skipped: false,
    chunks: chunks.length,
    rejected: distilled.rejected,
    redactionSummary: distilled.redactionSummary,
  };
}

export async function searchCommunityKnowledge(args: {
  communityId: string;
  requesterOwnerId?: string | null;
  channelId?: string | null;
  query: string;
  topK?: number;
  minSimilarity?: number;
}) {
  const [community, membership, channel] = await Promise.all([
    prisma.community.findUnique({
      where: { id: args.communityId },
      select: { ownerId: true },
    }),
    args.requesterOwnerId
      ? prisma.communityMember.findUnique({
          where: {
            communityId_ownerId: {
              communityId: args.communityId,
              ownerId: args.requesterOwnerId,
            },
          },
          select: { role: true, status: true },
        })
      : null,
    args.channelId
      ? prisma.communityChannel.findUnique({
          where: { id: args.channelId },
          select: { id: true, communityId: true, semanticQuery: true },
        })
      : null,
  ]);

  if (!community) throw new CommunityKnowledgeError("Community not found", 404);
  if (channel && channel.communityId !== args.communityId) {
    throw new CommunityKnowledgeError("Channel not found", 404);
  }

  const privacyLevels = allowedPrivacyLevelsForMembership({
    isMember: membership?.status === "ACTIVE",
    role: membership?.status === "ACTIVE" ? membership.role : null,
    isCommunityOwner: community.ownerId === args.requesterOwnerId,
  });
  const query = [channel?.semanticQuery, args.query].filter(Boolean).join("\n\n");
  const { embedding } = await generateEmbeddingWithUsage(query, {
    operation: "community_knowledge_search",
    ownerId: args.requesterOwnerId,
    communityId: args.communityId,
    metadata: {
      channel_id: args.channelId ?? null,
      top_k: args.topK ?? 8,
    },
  });

  const minSimilarity = args.minSimilarity ?? COMMUNITY_KNOWLEDGE_MIN_SIMILARITY;
  const topK = args.topK ?? 8;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      document_id: string;
      content: string;
      title: string;
      url: string | null;
      privacy_level: string;
      similarity: number;
    }>
  >`
    SELECT
      c.id,
      c.document_id,
      c.content,
      d.title,
      d.url,
      c.privacy_level::text,
      (1 - (c.embedding <=> ${embedding}::vector)) as similarity
    FROM community_knowledge_chunks c
    JOIN community_knowledge_documents d ON d.id = c.document_id
    WHERE c.community_id = ${args.communityId}
      AND c.embedding IS NOT NULL
      AND d.status = 'ACTIVE'
      AND c.privacy_level::text IN (${Prisma.join(privacyLevels)})
      AND (1 - (c.embedding <=> ${embedding}::vector)) > ${minSimilarity}
    ORDER BY similarity DESC
    LIMIT ${topK}
  `;

  return rows.map((row) => ({
    chunkId: row.id,
    documentId: row.document_id,
    title: row.title,
    url: row.url,
    privacyLevel: row.privacy_level,
    similarity: Number(row.similarity),
    content: row.content,
  }));
}
