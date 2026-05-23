import type { CorporateConnector } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logTeamActivity } from "@/lib/services/team-activity";
import { redactCorporateWebhookText } from "@/lib/connectors/corporate/security";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractIssue(payload: unknown) {
  const body = asObject(payload);
  const issue = asObject(body.issue);
  const fields = asObject(issue.fields);
  return {
    key: asString(issue.key) ?? asString(body.issueKey) ?? "unknown-issue",
    summary: asString(fields.summary) ?? asString(body.summary) ?? "Untitled Jira issue",
  };
}

function extractStatusChanges(payload: unknown) {
  const changelog = asObject(asObject(payload).changelog);
  const items = Array.isArray(changelog.items) ? changelog.items.map(asObject) : [];
  return items
    .filter((item) => asString(item.field)?.toLowerCase() === "status")
    .map((item) => `${asString(item.fromString) ?? "unknown"} -> ${asString(item.toString) ?? "unknown"}`);
}

function extractComment(payload: unknown) {
  const comment = asObject(asObject(payload).comment);
  const body = comment.body;
  if (typeof body === "string") return body;
  if (body && typeof body === "object") return JSON.stringify(body).slice(0, 800);
  return null;
}

export function normalizeJiraWebhookActivity(args: {
  payload: unknown;
  eventName?: string | null;
  deliveryId?: string | null;
}) {
  const body = asObject(args.payload);
  const issue = extractIssue(args.payload);
  const statusChanges = extractStatusChanges(args.payload);
  const comment = extractComment(args.payload);
  const actor = asObject(body.user);
  const eventName = args.eventName ?? asString(body.webhookEvent) ?? asString(body.eventType) ?? "jira:event";
  const actorName = asString(actor.displayName) ?? asString(actor.accountId) ?? "Jira";
  const details = [
    statusChanges.length ? `status ${statusChanges.join(", ")}` : null,
    comment ? `comment: ${comment}` : null,
  ].filter(Boolean);

  const rawContent =
    `Jira webhook ${args.deliveryId ?? "no-delivery-id"}: ${eventName} on ${issue.key} - ${issue.summary}` +
    (details.length ? ` (${details.join("; ")})` : "") +
    ` by ${actorName}`;
  const sanitized = redactCorporateWebhookText(rawContent);

  return {
    eventName,
    issueKey: issue.key,
    issueSummary: issue.summary,
    actorName,
    content: sanitized.content,
    redactions: sanitized.redactions,
  };
}

export async function logJiraWebhookEvent(args: {
  connector: Pick<CorporateConnector, "communityId">;
  payload: unknown;
  eventName?: string | null;
  deliveryId?: string | null;
}) {
  const normalized = normalizeJiraWebhookActivity(args);

  if (args.deliveryId) {
    const existing = await prisma.teamActivityLog.findFirst({
      where: {
        communityId: args.connector.communityId,
        category: "task",
        content: { startsWith: `Jira webhook ${args.deliveryId}:` },
      },
      select: { id: true },
    });
    if (existing) {
      return { skipped: true as const, activityId: existing.id, normalized };
    }
  }

  const result = await logTeamActivity({
    communityId: args.connector.communityId,
    actorId: "jira",
    actorType: "SYSTEM",
    category: "task",
    content: normalized.content,
  });

  return {
    skipped: false as const,
    activityId: result.activity.id,
    normalized,
  };
}
