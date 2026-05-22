function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function issueOrPullNumber(payload: Record<string, unknown>) {
  const issue = asObject(payload.issue);
  const pull = asObject(payload.pull_request);
  const number = issue.number ?? pull.number;
  return typeof number === "number" ? String(number) : null;
}

export function repositoryFullNameFromGitHubPayload(payload: unknown) {
  return asString(asObject(asObject(payload).repository).full_name);
}

export function normalizeGitHubPersonalWebhook(args: {
  payload: unknown;
  eventName?: string | null;
  deliveryId?: string | null;
}) {
  const payload = asObject(args.payload);
  const repository = repositoryFullNameFromGitHubPayload(payload);
  const issue = asObject(payload.issue);
  const pull = asObject(payload.pull_request);
  const headCommit = asObject(payload.head_commit);
  const action = asString(payload.action);
  const eventName = args.eventName ?? "github";
  const title =
    asString(pull.title) ??
    asString(issue.title) ??
    asString(headCommit.message)?.split("\n")[0] ??
    `${eventName}${repository ? ` in ${repository}` : ""}`;
  const fallbackId = [
    eventName,
    repository,
    action,
    issueOrPullNumber(payload),
    asString(headCommit.id) ?? asString(headCommit.sha),
    Date.now().toString(36),
  ]
    .filter(Boolean)
    .join(":");

  return {
    externalId: args.deliveryId ?? fallbackId,
    title,
    repositoryFullName: repository,
    rawPayload: {
      ...payload,
      event: eventName,
    },
  };
}
