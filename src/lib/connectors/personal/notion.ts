function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeNotionPersonalWebhook(payload: unknown, deliveryId?: string | null) {
  const value = asObject(payload);
  const page = asObject(value.page ?? value.data);
  const pageId = asString(value.page_id) ?? asString(page.id) ?? asString(value.id);
  const updated = asString(value.last_edited_time) ?? asString(page.last_edited_time) ?? asString(value.updated_at);
  const title = asString(value.title) ?? asString(page.title) ?? "Notion page update";

  return {
    externalId: deliveryId ?? ["notion", pageId, updated, Date.now().toString(36)].filter(Boolean).join(":"),
    title,
    rawPayload: value,
  };
}
