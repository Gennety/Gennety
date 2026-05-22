import type { PersonalConnector, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAnalyticsEvent, recordComputeUsage } from "@/lib/analytics-tracking";
import { contextToEmbeddingText, generateEmbeddingWithUsage } from "@/lib/embeddings";
import { inferModelProvider, resolveModel } from "@/lib/model-router";
import { sanitizeConnectorContent, estimateTokenCount } from "@/lib/services/community-knowledge";
import { computeContextHash, isSignificantUpdate, updateFreshness } from "@/lib/services/freshness";
import {
  assertConnectorCryptoReady,
  decryptConnectorSecret,
  encryptConnectorSecret,
} from "@/lib/connectors/personal/crypto";
import { fetchCalendarPersonalItems } from "@/lib/connectors/personal/calendar";
import { fetchObsidianPersonalItems } from "@/lib/connectors/personal/obsidian";
import {
  PersonalConnectorType,
  PersonalConnectorUpsertSchema,
  type PersonalConnectorType as PersonalConnectorTypeValue,
} from "@/types/personal-connectors";

const MAX_EVENT_TITLE_CHARS = 300;
const MAX_JSON_STRINGIFY_CHARS = 16_000;
const MIN_DURABLE_CONTENT_CHARS = 40;
const MAX_CURRENT_WORK_CHARS = 3_000;
const MAX_LOOKING_FOR_CHARS = 2_000;

export class PersonalConnectorError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "PersonalConnectorError";
  }
}

export interface PersonalProfilePatch {
  expertise: string[];
  currentWork?: string | null;
  lookingFor?: string | null;
}

export interface ProfileContextSnapshot {
  currentWork: string;
  expertise: string[];
  lookingFor: string;
}

const TECHNOLOGY_KEYWORDS = [
  "AI",
  "API",
  "AES-256-GCM",
  "Anthropic",
  "Calendar",
  "Docker",
  "GitHub",
  "Google Calendar",
  "Linear",
  "Next.js",
  "Notion",
  "OAuth",
  "Obsidian",
  "OpenAI",
  "PostgreSQL",
  "Prisma",
  "React",
  "TypeScript",
  "Webhook",
  "pgvector",
];

const MINOR_CHANGE_PATTERNS = [
  /\b(fix(ed|es)?|correct(ed|s)?)\s+(a\s+)?typos?\b/i,
  /\btypo\b/i,
  /\bformat(ted|ting)?\b/i,
  /\bwhitespace\b/i,
  /\brename(d|s)?\b/i,
  /\bmerge branch\b/i,
  /\bbump(ed|s)?\s+(version|dependency|dependencies)\b/i,
];

const NEED_PATTERNS = [
  /\blooking for\b/i,
  /\bneed(s|ed)?\b/i,
  /\bseeking\b/i,
  /\bblocked by\b/i,
  /\bhelp with\b/i,
  /\bcollaborat(or|ion|e)\b/i,
  /\bpartner(ship)?\b/i,
  /\bmentor(ship)?\b/i,
  /\bhiring\b/i,
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2).slice(0, MAX_JSON_STRINGIFY_CHARS);
  } catch {
    return "";
  }
}

function normalizeSentence(value: string, maxLength = 320) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function splitSentences(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeSentence(sentence))
    .filter(Boolean);
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectTechnologies(text: string, sourceType: PersonalConnectorTypeValue) {
  const found = new Set<string>();
  const haystack = text.toLowerCase();

  for (const keyword of TECHNOLOGY_KEYWORDS) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(keyword.toLowerCase())}([^a-z0-9]|$)`, "i");
    if (pattern.test(text)) found.add(keyword);
  }

  if (sourceType === "GITHUB") found.add("GitHub");
  if (sourceType === "NOTION") found.add("Notion");
  if (sourceType === "LINEAR") found.add("Linear");
  if (sourceType === "OBSIDIAN") found.add("Obsidian");
  if (sourceType === "CALENDAR") found.add("Calendar");
  if (haystack.includes("postgres")) found.add("PostgreSQL");

  return [...found].slice(0, 12);
}

function dedupeCaseInsensitive(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeSentence(value, 80);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function appendConnectorSignal(existing: string, signal: string | null | undefined, maxLength: number) {
  const normalized = signal ? normalizeSentence(signal, 480) : "";
  if (!normalized) return existing;
  if (existing.toLowerCase().includes(normalized.toLowerCase())) return existing;

  const addition = `Connector signal: ${normalized}`;
  if (!existing.trim()) return addition.slice(0, maxLength);
  const candidate = `${existing.trim()}\n\n${addition}`;
  return candidate.length <= maxLength ? candidate : existing;
}

export function reviewPersonalConnectorContent(input: {
  title: string;
  rawText: string;
}): {
  accepted: boolean;
  sanitizedText: string;
  redactions: string[];
  reason: string;
} {
  const sanitized = sanitizeConnectorContent(`${input.title}\n\n${input.rawText}`);
  const text = sanitized.content;
  const lower = text.toLowerCase();
  const minor = MINOR_CHANGE_PATTERNS.some((pattern) => pattern.test(text));
  const durableHints =
    NEED_PATTERNS.some((pattern) => pattern.test(text)) ||
    /\b(build|built|implement|implemented|design|designed|launch|research|integrat|architect)\w*\b/i.test(text) ||
    detectTechnologies(text, "GITHUB").length > 1;

  if (text.length < MIN_DURABLE_CONTENT_CHARS) {
    return {
      accepted: false,
      sanitizedText: text,
      redactions: sanitized.redactions,
      reason: "SKIPPED_SHORT_EVENT",
    };
  }

  if (minor && !durableHints && lower.length < 240) {
    return {
      accepted: false,
      sanitizedText: text,
      redactions: sanitized.redactions,
      reason: "SKIPPED_MINOR_CHANGE",
    };
  }

  return {
    accepted: true,
    sanitizedText: text,
    redactions: sanitized.redactions,
    reason: "ACCEPTED_DURABLE_SIGNAL",
  };
}

export function distillPersonalConnectorContent(input: {
  sourceType: PersonalConnectorTypeValue;
  title: string;
  sanitizedText: string;
}): {
  distilled: string;
  patch: PersonalProfilePatch;
} {
  const sentences = splitSentences(input.sanitizedText);
  const technologies = detectTechnologies(input.sanitizedText, input.sourceType);
  const needSentence = sentences.find((sentence) => NEED_PATTERNS.some((pattern) => pattern.test(sentence)));
  const durableSentences = sentences
    .filter((sentence) => !MINOR_CHANGE_PATTERNS.some((pattern) => pattern.test(sentence)))
    .filter((sentence) => sentence.length > 20)
    .slice(0, 3);
  const workSignal = normalizeSentence(
    durableSentences.find((sentence) => sentence !== needSentence) ?? input.title,
    420
  );

  const patch: PersonalProfilePatch = {
    expertise: technologies,
    currentWork: workSignal,
    lookingFor: needSentence ? normalizeSentence(needSentence, 360) : null,
  };
  const lines = [
    `Source: ${input.sourceType}`,
    `Event: ${input.title}`,
    technologies.length ? `Expertise signals: ${technologies.join(", ")}` : null,
    workSignal ? `Current work signal: ${workSignal}` : null,
    needSentence ? `Looking-for signal: ${normalizeSentence(needSentence, 360)}` : null,
  ].filter(Boolean);

  return {
    distilled: lines.join("\n"),
    patch,
  };
}

export function mergeProfilePatch(context: ProfileContextSnapshot, patch: PersonalProfilePatch) {
  const nextExpertise = dedupeCaseInsensitive([...context.expertise, ...patch.expertise]).slice(0, 40);
  const nextCurrentWork = appendConnectorSignal(context.currentWork, patch.currentWork, MAX_CURRENT_WORK_CHARS);
  const nextLookingFor = appendConnectorSignal(context.lookingFor, patch.lookingFor, MAX_LOOKING_FOR_CHARS);

  const changes: Array<{ fieldPath: string; oldValue: string | null; newValue: string | null }> = [];
  if (JSON.stringify(nextExpertise) !== JSON.stringify(context.expertise)) {
    changes.push({
      fieldPath: "expertise",
      oldValue: JSON.stringify(context.expertise),
      newValue: JSON.stringify(nextExpertise),
    });
  }
  if (nextCurrentWork !== context.currentWork) {
    changes.push({
      fieldPath: "currentWork",
      oldValue: context.currentWork,
      newValue: nextCurrentWork,
    });
  }
  if (nextLookingFor !== context.lookingFor) {
    changes.push({
      fieldPath: "lookingFor",
      oldValue: context.lookingFor,
      newValue: nextLookingFor,
    });
  }

  return {
    next: {
      currentWork: nextCurrentWork,
      expertise: nextExpertise,
      lookingFor: nextLookingFor,
    },
    changes,
  };
}

export function personalConnectorPayloadToText(input: {
  sourceType: PersonalConnectorTypeValue;
  title: string;
  rawPayload: Prisma.JsonValue | Prisma.InputJsonValue | unknown;
}) {
  const payload = asObject(input.rawPayload);

  if (input.sourceType === "GITHUB") {
    const repository = asObject(payload.repository);
    const issue = asObject(payload.issue);
    const pullRequest = asObject(payload.pull_request);
    const headCommit = asObject(payload.head_commit);
    const commits = Array.isArray(payload.commits) ? payload.commits.map(asObject) : [];
    return [
      `Repository: ${asString(repository.full_name) ?? ""}`,
      `Action: ${asString(payload.action) ?? asString(payload.event) ?? ""}`,
      asString(issue.title) ? `Issue: ${issue.title}` : null,
      asString(issue.body),
      asString(pullRequest.title) ? `Pull request: ${pullRequest.title}` : null,
      asString(pullRequest.body),
      asString(headCommit.message) ? `Commit: ${headCommit.message}` : null,
      ...commits.flatMap((commit) => [asString(commit.message)]),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (input.sourceType === "LINEAR") {
    const data = asObject(payload.data);
    const issue = asObject(payload.issue);
    const state = asObject(data.state ?? issue.state);
    return [
      `Action: ${asString(payload.action) ?? asString(payload.type) ?? ""}`,
      asString(data.title) ?? asString(issue.title) ?? input.title,
      asString(data.description) ?? asString(issue.description),
      asString(state.name) ? `State: ${state.name}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (input.sourceType === "NOTION") {
    const page = asObject(payload.page ?? payload.data);
    return [
      asString(payload.title) ?? asString(page.title) ?? input.title,
      asString(payload.text) ?? asString(page.text) ?? asString(payload.content),
      stringifyJson(payload.properties ?? page.properties),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (input.sourceType === "OBSIDIAN") {
    return [
      asString(payload.path) ? `File: ${payload.path}` : input.title,
      asString(payload.content),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (input.sourceType === "CALENDAR") {
    return [
      asString(payload.summary) ?? input.title,
      asString(payload.description),
      asString(payload.location) ? `Location: ${payload.location}` : null,
      asString(payload.start) ? `Starts: ${payload.start}` : null,
      asString(payload.end) ? `Ends: ${payload.end}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return stringifyJson(payload);
}

export async function listPersonalConnectors(ownerId: string) {
  const connectors = await prisma.personalConnector.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ownerId: true,
      type: true,
      enabled: true,
      config: true,
      createdAt: true,
      updatedAt: true,
      encryptedToken: true,
    },
  });

  return connectors.map((connector) => ({
    id: connector.id,
    ownerId: connector.ownerId,
    type: connector.type,
    enabled: connector.enabled,
    config: connector.config,
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
    hasToken: Boolean(connector.encryptedToken),
  }));
}

export async function upsertPersonalConnector(ownerId: string, input: unknown) {
  const parsed = PersonalConnectorUpsertSchema.parse(input);
  assertConnectorCryptoReady();

  const tokenFields =
    parsed.token !== undefined
      ? encryptConnectorSecret(parsed.token)
      : parsed.clearToken
        ? { encryptedToken: null, tokenIv: null }
        : {};

  return prisma.personalConnector.upsert({
    where: {
      ownerId_type: {
        ownerId,
        type: parsed.type,
      },
    },
    create: {
      ownerId,
      type: parsed.type,
      enabled: parsed.enabled,
      config: toInputJson(parsed.config ?? {}),
      ...tokenFields,
    },
    update: {
      enabled: parsed.enabled,
      config: toInputJson(parsed.config ?? {}),
      ...tokenFields,
    },
  });
}

export function decryptPersonalConnectorToken(connector: Pick<PersonalConnector, "encryptedToken" | "tokenIv">) {
  return decryptConnectorSecret(connector);
}

export async function findPersonalConnectorForWebhook(args: {
  type: PersonalConnectorTypeValue;
  connectorId?: string | null;
  ownerId?: string | null;
  repositoryFullName?: string | null;
}) {
  if (args.connectorId) {
    return prisma.personalConnector.findFirst({
      where: { id: args.connectorId, type: args.type, enabled: true },
    });
  }

  if (args.ownerId) {
    return prisma.personalConnector.findFirst({
      where: { ownerId: args.ownerId, type: args.type, enabled: true },
    });
  }

  if (args.type === "GITHUB" && args.repositoryFullName) {
    const connectors = await prisma.personalConnector.findMany({
      where: { type: "GITHUB", enabled: true },
    });
    return (
      connectors.find((connector) => {
        const config = asObject(connector.config);
        const repos = asStringArray(config.repos);
        return repos.includes(args.repositoryFullName ?? "");
      }) ?? null
    );
  }

  return null;
}

export async function logPersonalConnectorEvent(input: {
  connectorId: string;
  externalId: string;
  title: string;
  rawPayload: unknown;
  processNow?: boolean;
}) {
  const connector = await prisma.personalConnector.findUnique({
    where: { id: input.connectorId },
    select: { id: true, ownerId: true, type: true, enabled: true },
  });
  if (!connector || !connector.enabled) {
    throw new PersonalConnectorError("Personal connector not found or disabled", 404);
  }

  const existing = await prisma.personalConnectorEvent.findUnique({
    where: {
      connectorId_externalId: {
        connectorId: input.connectorId,
        externalId: input.externalId,
      },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    return { eventId: existing.id, skipped: true, status: existing.status };
  }

  const event = await prisma.personalConnectorEvent.create({
    data: {
      connectorId: input.connectorId,
      externalId: input.externalId.slice(0, 300),
      title: input.title.slice(0, MAX_EVENT_TITLE_CHARS),
      rawPayload: toInputJson(input.rawPayload),
    },
  });

  await recordAnalyticsEvent({
    type: "PERSONAL_CONNECTOR_EVENT_LOGGED",
    ownerId: connector.ownerId,
    metadata: {
      connector_id: connector.id,
      connector_type: connector.type,
      event_id: event.id,
    },
  });

  if (input.processNow !== false) {
    const result = await processPersonalConnectorEvent(event.id);
    return { eventId: event.id, skipped: false, status: result.status };
  }

  return { eventId: event.id, skipped: false, status: event.status };
}

async function recordPersonalConnectorCompute(args: {
  ownerId: string;
  connectorId: string;
  eventId: string;
  model: string;
  operation: string;
  inputText: string;
  outputText?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await recordComputeUsage({
    category: "PERSONAL_CONNECTOR",
    provider: inferModelProvider(args.model),
    model: args.model,
    operation: args.operation,
    ownerId: args.ownerId,
    tokensInput: estimateTokenCount(args.inputText),
    tokensOutput: args.outputText ? estimateTokenCount(args.outputText) : 0,
    costUsd: 0,
    metadata: {
      connector_id: args.connectorId,
      event_id: args.eventId,
      ...(args.metadata && typeof args.metadata === "object" && !Array.isArray(args.metadata)
        ? args.metadata
        : {}),
    },
  });
}

async function refreshContextEmbedding(context: {
  id: string;
  agentId: string;
  ownerId: string;
  currentWork: string;
  expertise: string[];
  lookingFor: string;
  notLookingFor?: string | null;
  recentProblems?: string | null;
  recentWins?: string | null;
  networkingGoal: string;
  ownerProfession?: string | null;
  ownerDomain?: string | null;
  ownerGoals?: string | null;
  agentSpecialization?: string | null;
  agentDomains?: string[] | null;
  collaborationStyle?: string | null;
}) {
  if (!process.env.OPENAI_API_KEY) return { refreshed: false, reason: "OPENAI_API_KEY_MISSING" };

  const embeddingText = contextToEmbeddingText(context);
  const { embedding } = await generateEmbeddingWithUsage(embeddingText, {
    operation: "personal_connector_profile_patch",
    ownerId: context.ownerId,
    agentId: context.agentId,
    metadata: {
      text_length: embeddingText.length,
    },
  });

  await prisma.$executeRaw`
    UPDATE agent_contexts
    SET embedding = ${embedding}::vector
    WHERE id = ${context.id}
  `;

  return { refreshed: true };
}

async function applyPersonalProfilePatch(args: {
  ownerId: string;
  patch: PersonalProfilePatch;
  connectorId: string;
  eventId: string;
}) {
  const agent = await prisma.agent.findUnique({
    where: { ownerId: args.ownerId },
    include: { context: true },
  });
  const context = agent?.context ?? null;

  if (!agent || !context) {
    return { changed: false, reason: "NO_AGENT_CONTEXT", changes: [] as string[] };
  }

  const merged = mergeProfilePatch(
    {
      currentWork: context.currentWork,
      expertise: context.expertise,
      lookingFor: context.lookingFor,
    },
    args.patch
  );

  if (merged.changes.length === 0) {
    return { changed: false, reason: "NO_ADDITIVE_CHANGES", changes: [] as string[] };
  }

  const nextHash = computeContextHash({
    current_work: merged.next.currentWork,
    looking_for: merged.next.lookingFor,
    networking_goal: context.networkingGoal,
    recent_problems: context.recentProblems,
    owner_profession: context.ownerProfession,
    owner_domain: context.ownerDomain,
    agent_specialization: context.agentSpecialization,
  });
  const significant = isSignificantUpdate(nextHash, context.previousHash);
  const now = new Date();

  await prisma.agentContext.update({
    where: { id: context.id },
    data: {
      currentWork: merged.next.currentWork,
      expertise: merged.next.expertise,
      lookingFor: merged.next.lookingFor,
      previousHash: nextHash,
      freshnessState: "ACTIVE",
      ...(significant ? { lastSignificantUpdateAt: now } : {}),
    },
  });

  if (significant) {
    await prisma.beacon.updateMany({
      where: { agentId: agent.id, isActive: true },
      data: { isActive: false, preservable: false },
    });
    await updateFreshness(agent.id, true);
  }

  await prisma.profileAuditLog.createMany({
    data: merged.changes.map((change) => ({
      ownerId: args.ownerId,
      action: "UPDATE_FIELD",
      fieldPath: change.fieldPath,
      oldValue: change.oldValue,
      newValue: change.newValue,
    })),
  });

  const embeddingResult = await refreshContextEmbedding({
    id: context.id,
    agentId: agent.id,
    ownerId: args.ownerId,
    currentWork: merged.next.currentWork,
    expertise: merged.next.expertise,
    lookingFor: merged.next.lookingFor,
    notLookingFor: context.notLookingFor,
    recentProblems: context.recentProblems,
    recentWins: context.recentWins,
    networkingGoal: context.networkingGoal,
    ownerProfession: context.ownerProfession,
    ownerDomain: context.ownerDomain,
    ownerGoals: context.ownerGoals,
    agentSpecialization: context.agentSpecialization,
    agentDomains: context.agentDomains,
    collaborationStyle: context.collaborationStyle,
  }).catch((error) => {
    console.error("[personal-connectors] Embedding refresh failed:", error);
    return { refreshed: false, reason: "EMBEDDING_REFRESH_FAILED" };
  });

  await recordAnalyticsEvent({
    type: "PERSONAL_CONNECTOR_PROFILE_PATCHED",
    ownerId: args.ownerId,
    agentId: agent.id,
    metadata: {
      connector_id: args.connectorId,
      event_id: args.eventId,
      fields: merged.changes.map((change) => change.fieldPath),
      significant,
      embedding: embeddingResult,
    },
  });

  return {
    changed: true,
    reason: "PROFILE_PATCHED",
    changes: merged.changes.map((change) => change.fieldPath),
  };
}

export async function processPersonalConnectorEvent(eventId: string) {
  const event = await prisma.personalConnectorEvent.findUnique({
    where: { id: eventId },
    include: { connector: true },
  });
  if (!event) throw new PersonalConnectorError("Personal connector event not found", 404);

  const sourceType = PersonalConnectorType.parse(event.connector.type);
  const rawText = personalConnectorPayloadToText({
    sourceType,
    title: event.title,
    rawPayload: event.rawPayload,
  });
  const model = await resolveModel("distillation");
  const review = reviewPersonalConnectorContent({ title: event.title, rawText });

  await recordPersonalConnectorCompute({
    ownerId: event.connector.ownerId,
    connectorId: event.connectorId,
    eventId: event.id,
    model,
    operation: "personal_connector_review",
    inputText: rawText,
    outputText: review.reason,
    metadata: {
      connector_type: sourceType,
      accepted: review.accepted,
      redactions: review.redactions,
    },
  });

  if (!review.accepted) {
    await prisma.personalConnectorEvent.update({
      where: { id: event.id },
      data: {
        status: "SKIPPED",
        distilled: review.reason,
      },
    });
    return { status: "SKIPPED" as const, reason: review.reason };
  }

  const distilled = distillPersonalConnectorContent({
    sourceType,
    title: event.title,
    sanitizedText: review.sanitizedText,
  });

  await recordPersonalConnectorCompute({
    ownerId: event.connector.ownerId,
    connectorId: event.connectorId,
    eventId: event.id,
    model,
    operation: "personal_connector_distillation",
    inputText: review.sanitizedText,
    outputText: distilled.distilled,
    metadata: {
      connector_type: sourceType,
      expertise_count: distilled.patch.expertise.length,
    },
  });

  const patchResult = await applyPersonalProfilePatch({
    ownerId: event.connector.ownerId,
    connectorId: event.connectorId,
    eventId: event.id,
    patch: distilled.patch,
  });
  const status = patchResult.changed ? "PROCESSED" : "DISTILLED";

  await prisma.personalConnectorEvent.update({
    where: { id: event.id },
    data: {
      status,
      distilled: `${distilled.distilled}\n\nPatch result: ${patchResult.reason}`,
    },
  });

  return {
    status,
    reason: patchResult.reason,
    changes: patchResult.changes,
  };
}

export async function processPendingPersonalConnectorEvents(limit = 20) {
  const events = await prisma.personalConnectorEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results = [];
  for (const event of events) {
    results.push(await processPersonalConnectorEvent(event.id));
  }

  return {
    checked: events.length,
    results,
  };
}

export async function syncPersonalConnector(connectorId: string) {
  const connector = await prisma.personalConnector.findUnique({
    where: { id: connectorId },
  });
  if (!connector) throw new PersonalConnectorError("Personal connector not found", 404);
  if (!connector.enabled) return { connectorId, skipped: "disabled" };

  const config = asObject(connector.config);
  const sourceType = PersonalConnectorType.parse(connector.type);
  const token = sourceType === "CALENDAR" ? decryptPersonalConnectorToken(connector) : null;
  const items =
    sourceType === "OBSIDIAN"
      ? await fetchObsidianPersonalItems(config)
      : sourceType === "CALENDAR"
        ? await fetchCalendarPersonalItems(config, token)
        : [];

  let ingested = 0;
  let skipped = 0;
  for (const item of items) {
    const result = await logPersonalConnectorEvent({
      connectorId: connector.id,
      externalId: item.externalId,
      title: item.title,
      rawPayload: item.rawPayload,
      processNow: true,
    });
    if (result.skipped) skipped += 1;
    else ingested += 1;
  }

  return {
    connectorId,
    type: sourceType,
    ingested,
    skipped,
  };
}

export async function syncDuePersonalConnectors(limit = 10) {
  const connectors = await prisma.personalConnector.findMany({
    where: {
      enabled: true,
      type: { in: ["OBSIDIAN", "CALENDAR"] },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results = [];
  for (const connector of connectors) {
    try {
      results.push(await syncPersonalConnector(connector.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ connectorId: connector.id, error: message });
    }
  }

  return {
    checked: connectors.length,
    results,
  };
}
