import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAnalyticsEvent, recordComputeUsage } from "@/lib/analytics-tracking";
import { inferModelProvider, resolveModel, type ModelTask } from "@/lib/model-router";
import { assertCommunityBudgetAvailable } from "@/lib/services/community-budget";
import {
  CommunityKnowledgeError,
  containsRawMemoryMarkers,
  createCommunityKnowledgeSource,
  estimateTokenCount,
  hashCommunityText,
  ingestCommunityKnowledgeDocument,
  sanitizeConnectorContent,
  searchCommunityKnowledge,
} from "@/lib/services/community-knowledge";
import { assertCommunityManager } from "@/lib/services/community-permissions";

export type HubEditAction = "add" | "update" | "delete" | "search";
export type HubEditPrivacyLevel = "PUBLIC" | "COMMUNITY" | "ADMINS" | "OWNER_ONLY";

export interface HubEditInput {
  communityId: string;
  action: HubEditAction;
  requestedBy: string;
  content?: string;
  documentId?: string;
  query?: string;
  title?: string;
  tags?: string[];
  privacyLevel?: HubEditPrivacyLevel;
  topK?: number;
}

const MAX_HUB_EDIT_CONTENT_CHARS = 20_000;

export function prepareHubEditContent(rawContent: string) {
  const sanitized = sanitizeConnectorContent(rawContent);
  const rawMemoryDetected = containsRawMemoryMarkers(rawContent);
  const redactions = [...sanitized.redactions];

  if (rawMemoryDetected) {
    redactions.push("Detected raw MEMORY-like markers; indexing will store only distilled hub-safe content");
  }

  return {
    content: sanitized.content,
    rejected: sanitized.content.length === 0,
    rawMemoryDetected,
    redactions: Array.from(new Set(redactions)),
  };
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function titleFromContent(content: string) {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return `Manual hub edit ${new Date().toISOString()}`;
  return firstLine.slice(0, 120);
}

async function getOrCreateManualHubSource(communityId: string, requestedBy: string) {
  const existing = await prisma.communityKnowledgeSource.findFirst({
    where: {
      communityId,
      type: "MANUAL",
      name: "Manual hub context",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (existing) return existing;

  return createCommunityKnowledgeSource(
    communityId,
    {
      type: "MANUAL",
      name: "Manual hub context",
      config: { created_by: "hub_edit" },
    },
    requestedBy
  );
}

async function resolveModelWithBudget(args: {
  communityId: string;
  task: ModelTask;
  text: string;
}) {
  const model = await resolveModel(args.task, { communityId: args.communityId });
  await assertCommunityBudgetAvailable({
    communityId: args.communityId,
    requestedTokens: estimateTokenCount(args.text),
  });
  return model;
}

async function recordHubEditCompute(args: {
  action: HubEditAction;
  communityId: string;
  requestedBy: string;
  model: string;
  operation: string;
  inputText: string;
  outputText?: string | null;
  knowledgeSourceId?: string | null;
  documentId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await recordComputeUsage({
    category: "COMMUNITY_KNOWLEDGE",
    provider: inferModelProvider(args.model),
    model: args.model,
    operation: args.operation,
    ownerId: args.requestedBy,
    communityId: args.communityId,
    knowledgeSourceId: args.knowledgeSourceId,
    tokensInput: estimateTokenCount(args.inputText),
    tokensOutput: args.outputText ? estimateTokenCount(args.outputText) : 0,
    costUsd: 0,
    metadata: {
      action: args.action,
      document_id: args.documentId ?? null,
      ...(args.metadata && typeof args.metadata === "object" && !Array.isArray(args.metadata)
        ? args.metadata
        : {}),
    },
  });
}

async function recordHubEditAnalytics(args: {
  action: HubEditAction;
  type: string;
  communityId: string;
  requestedBy: string;
  knowledgeSourceId?: string | null;
  documentId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await recordAnalyticsEvent({
    type: args.type,
    ownerId: args.requestedBy,
    communityId: args.communityId,
    knowledgeSourceId: args.knowledgeSourceId,
    metadata: {
      action: args.action,
      document_id: args.documentId ?? null,
      ...(args.metadata && typeof args.metadata === "object" && !Array.isArray(args.metadata)
        ? args.metadata
        : {}),
    },
  });
}

async function loadHubDocument(communityId: string, documentId: string) {
  const document = await prisma.communityKnowledgeDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      communityId: true,
      sourceId: true,
      title: true,
      privacyLevel: true,
      status: true,
      metadata: true,
    },
  });

  if (!document || document.communityId !== communityId) {
    throw new CommunityKnowledgeError("Knowledge document not found", 404);
  }
  return document;
}

async function addHubDocument(input: HubEditInput) {
  if (!input.content) throw new CommunityKnowledgeError("content is required for add", 400);
  if (input.content.length > MAX_HUB_EDIT_CONTENT_CHARS) {
    throw new CommunityKnowledgeError("content is too large for a manual hub edit", 400);
  }

  await assertCommunityManager(input.requestedBy, input.communityId);
  const prepared = prepareHubEditContent(input.content);
  if (prepared.rejected) {
    throw new CommunityKnowledgeError("content was rejected after safety sanitization", 400);
  }

  const model = await resolveModelWithBudget({
    communityId: input.communityId,
    task: "distillation",
    text: input.content,
  });
  const source = await getOrCreateManualHubSource(input.communityId, input.requestedBy);
  const result = await ingestCommunityKnowledgeDocument(
    input.communityId,
    {
      sourceId: source.id,
      title: input.title ?? titleFromContent(prepared.content),
      rawContent: input.content,
      tags: input.tags ?? [],
      privacyLevel: input.privacyLevel ?? "COMMUNITY",
      metadata: {
        created_by: "hub_edit",
        requested_by: input.requestedBy,
        distillation_model: model,
        raw_memory_detected: prepared.rawMemoryDetected,
        safety_redactions: prepared.redactions,
      },
    },
    { embed: !!process.env.OPENAI_API_KEY }
  );

  await recordHubEditCompute({
    action: "add",
    communityId: input.communityId,
    requestedBy: input.requestedBy,
    model,
    operation: "hub_edit_add_distillation",
    inputText: input.content,
    outputText: result.rejected ? null : prepared.content,
    knowledgeSourceId: source.id,
    documentId: result.documentId,
    metadata: { skipped: result.skipped, rejected: result.rejected ?? false },
  });
  await recordHubEditAnalytics({
    action: "add",
    type: "HUB_EDIT_DOCUMENT_ADDED",
    communityId: input.communityId,
    requestedBy: input.requestedBy,
    knowledgeSourceId: source.id,
    documentId: result.documentId,
    metadata: {
      chunks: result.chunks,
      skipped: result.skipped,
      rejected: result.rejected ?? false,
      redactions: result.redactionSummary ?? prepared.redactions,
    },
  });

  return {
    action: "add" as const,
    documentId: result.documentId,
    skipped: result.skipped,
    chunks: result.chunks,
    rejected: result.rejected ?? false,
    redactionSummary: result.redactionSummary ?? prepared.redactions,
    distillationModel: model,
  };
}

async function updateHubDocument(input: HubEditInput) {
  if (!input.documentId) throw new CommunityKnowledgeError("documentId is required for update", 400);
  if (!input.content) throw new CommunityKnowledgeError("content is required for update", 400);
  if (input.content.length > MAX_HUB_EDIT_CONTENT_CHARS) {
    throw new CommunityKnowledgeError("content is too large for a manual hub edit", 400);
  }

  await assertCommunityManager(input.requestedBy, input.communityId);
  const existing = await loadHubDocument(input.communityId, input.documentId);
  if (existing.status !== "ACTIVE") {
    throw new CommunityKnowledgeError("Only active knowledge documents can be updated", 400);
  }

  const prepared = prepareHubEditContent(input.content);
  if (prepared.rejected) {
    throw new CommunityKnowledgeError("content was rejected after safety sanitization", 400);
  }

  const model = await resolveModelWithBudget({
    communityId: input.communityId,
    task: "hub_edit_chat",
    text: input.content,
  });
  const source = await getOrCreateManualHubSource(input.communityId, input.requestedBy);
  const newExternalId = `manual:update:${existing.id}:${hashCommunityText(input.content).slice(0, 16)}:${Date.now()}`;
  const result = await ingestCommunityKnowledgeDocument(
    input.communityId,
    {
      sourceId: source.id,
      externalId: newExternalId,
      title: input.title ?? existing.title,
      rawContent: input.content,
      tags: input.tags ?? [],
      privacyLevel: input.privacyLevel ?? existing.privacyLevel,
      metadata: {
        created_by: "hub_edit",
        requested_by: input.requestedBy,
        supersedes_document_id: existing.id,
        distillation_model: model,
        raw_memory_detected: prepared.rawMemoryDetected,
        safety_redactions: prepared.redactions,
      },
    },
    { embed: !!process.env.OPENAI_API_KEY }
  );

  await prisma.communityKnowledgeDocument.update({
    where: { id: existing.id },
    data: {
      status: "SUPERSEDED",
      supersededAt: new Date(),
      metadata: {
        ...jsonObject(existing.metadata),
        superseded_by_document_id: result.documentId,
        superseded_by_owner_id: input.requestedBy,
      } as Prisma.InputJsonValue,
    },
  });

  await recordHubEditCompute({
    action: "update",
    communityId: input.communityId,
    requestedBy: input.requestedBy,
    model,
    operation: "hub_edit_update_distillation",
    inputText: input.content,
    outputText: result.rejected ? null : prepared.content,
    knowledgeSourceId: source.id,
    documentId: result.documentId,
    metadata: { supersedes_document_id: existing.id, rejected: result.rejected ?? false },
  });
  await recordHubEditAnalytics({
    action: "update",
    type: "HUB_EDIT_DOCUMENT_UPDATED",
    communityId: input.communityId,
    requestedBy: input.requestedBy,
    knowledgeSourceId: source.id,
    documentId: result.documentId,
    metadata: {
      superseded_document_id: existing.id,
      chunks: result.chunks,
      rejected: result.rejected ?? false,
      redactions: result.redactionSummary ?? prepared.redactions,
    },
  });

  return {
    action: "update" as const,
    documentId: result.documentId,
    supersededDocumentId: existing.id,
    chunks: result.chunks,
    rejected: result.rejected ?? false,
    redactionSummary: result.redactionSummary ?? prepared.redactions,
    distillationModel: model,
  };
}

async function deleteHubDocument(input: HubEditInput) {
  if (!input.documentId) throw new CommunityKnowledgeError("documentId is required for delete", 400);

  await assertCommunityManager(input.requestedBy, input.communityId);
  const existing = await loadHubDocument(input.communityId, input.documentId);
  if (existing.status === "DELETED") {
    return {
      action: "delete" as const,
      documentId: existing.id,
      deleted: true,
      alreadyDeleted: true,
    };
  }

  await prisma.communityKnowledgeDocument.update({
    where: { id: existing.id },
    data: {
      status: "DELETED",
      metadata: {
        ...jsonObject(existing.metadata),
        deleted_by_owner_id: input.requestedBy,
        deleted_at: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
  await recordHubEditAnalytics({
    action: "delete",
    type: "HUB_EDIT_DOCUMENT_DELETED",
    communityId: input.communityId,
    requestedBy: input.requestedBy,
    knowledgeSourceId: existing.sourceId,
    documentId: existing.id,
    metadata: { previous_status: existing.status },
  });

  return {
    action: "delete" as const,
    documentId: existing.id,
    deleted: true,
    excludedFromSearch: true,
  };
}

async function searchHubDocuments(input: HubEditInput) {
  if (!input.query) throw new CommunityKnowledgeError("query is required for search", 400);

  const model = await resolveModelWithBudget({
    communityId: input.communityId,
    task: "hub_search_answer",
    text: input.query,
  });
  const results = await searchCommunityKnowledge({
    communityId: input.communityId,
    requesterOwnerId: input.requestedBy,
    query: input.query,
    topK: input.topK,
  });

  await recordHubEditCompute({
    action: "search",
    communityId: input.communityId,
    requestedBy: input.requestedBy,
    model,
    operation: "hub_edit_search_answer",
    inputText: input.query,
    outputText: results.map((result) => result.content).join("\n\n"),
    metadata: { result_count: results.length },
  });

  return {
    action: "search" as const,
    query: input.query,
    count: results.length,
    answerModel: model,
    matches: results,
  };
}

export async function executeHubEdit(input: HubEditInput) {
  switch (input.action) {
    case "add":
      return addHubDocument(input);
    case "update":
      return updateHubDocument(input);
    case "delete":
      return deleteHubDocument(input);
    case "search":
      return searchHubDocuments(input);
    default:
      throw new CommunityKnowledgeError("Unsupported hub_edit action", 400);
  }
}
