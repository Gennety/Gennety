function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeLinearPersonalWebhook(payload: unknown, deliveryId?: string | null) {
  const value = asObject(payload);
  const data = asObject(value.data);
  const issue = asObject(value.issue);
  const issueId = asString(data.id) ?? asString(issue.id) ?? asString(value.issueId);
  const updated = asString(data.updatedAt) ?? asString(issue.updatedAt) ?? asString(value.updatedAt);
  const action = asString(value.action) ?? asString(value.type);
  const title = asString(data.title) ?? asString(issue.title) ?? "Linear issue update";

  return {
    externalId: deliveryId ?? ["linear", issueId, action, updated, Date.now().toString(36)].filter(Boolean).join(":"),
    title,
    rawPayload: value,
  };
}
