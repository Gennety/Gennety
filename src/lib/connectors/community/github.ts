export interface GitHubConnectorItem {
  id: string;
  title: string;
  body: string;
  url?: string;
  updatedAt?: string;
  labels?: string[];
}

export function normalizeGitHubConnectorItems(config: Record<string, unknown> | null | undefined) {
  const items = Array.isArray(config?.items) ? config.items : [];
  return items.flatMap((item): GitHubConnectorItem[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id : null;
    const title = typeof value.title === "string" ? value.title : null;
    const body = typeof value.body === "string" ? value.body : "";
    if (!id || !title || !body.trim()) return [];
    const labels = Array.isArray(value.labels)
      ? value.labels.filter((label): label is string => typeof label === "string")
      : [];
    return [{
      id,
      title,
      body,
      url: typeof value.url === "string" ? value.url : undefined,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
      labels,
    }];
  });
}

function readString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function authHeaders(config: Record<string, unknown>) {
  const tokenEnv = readString(config, "tokenEnv");
  const token = tokenEnv ? process.env[tokenEnv] : process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchGitHubJson(url: string, config: Record<string, unknown>) {
  const response = await fetch(url, { headers: authHeaders(config) });
  if (!response.ok) {
    throw new Error(`GitHub connector fetch failed: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

export async function fetchGitHubConnectorItems(
  config: Record<string, unknown> | null | undefined
): Promise<GitHubConnectorItem[]> {
  const configured = normalizeGitHubConnectorItems(config);
  if (configured.length > 0) return configured;

  const safeConfig = config ?? {};
  const owner = readString(safeConfig, "owner");
  const repo = readString(safeConfig, "repo");
  if (!owner || !repo) return [];

  const perPage = Math.min(Number(safeConfig.perPage ?? 20) || 20, 50);
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [issuesRaw, pullsRaw] = await Promise.all([
    fetchGitHubJson(`${base}/issues?state=open&per_page=${perPage}`, safeConfig),
    fetchGitHubJson(`${base}/pulls?state=open&per_page=${perPage}`, safeConfig),
  ]);

  const issues = Array.isArray(issuesRaw) ? issuesRaw : [];
  const pulls = Array.isArray(pullsRaw) ? pullsRaw : [];

  return [
    ...issues.flatMap((issue): GitHubConnectorItem[] => {
      if (!issue || typeof issue !== "object") return [];
      const value = issue as Record<string, unknown>;
      if (value.pull_request) return [];
      const number = typeof value.number === "number" ? value.number : null;
      const title = typeof value.title === "string" ? value.title : null;
      if (!number || !title) return [];
      return [{
        id: `issue:${number}`,
        title: `Issue #${number}: ${title}`,
        body: typeof value.body === "string" ? value.body : title,
        url: typeof value.html_url === "string" ? value.html_url : undefined,
        updatedAt: typeof value.updated_at === "string" ? value.updated_at : undefined,
        labels: Array.isArray(value.labels)
          ? value.labels.flatMap((label): string[] =>
              label && typeof label === "object" && typeof (label as Record<string, unknown>).name === "string"
                ? [(label as Record<string, string>).name]
                : []
            )
          : [],
      }];
    }),
    ...pulls.flatMap((pull): GitHubConnectorItem[] => {
      if (!pull || typeof pull !== "object") return [];
      const value = pull as Record<string, unknown>;
      const number = typeof value.number === "number" ? value.number : null;
      const title = typeof value.title === "string" ? value.title : null;
      if (!number || !title) return [];
      return [{
        id: `pull:${number}`,
        title: `Pull request #${number}: ${title}`,
        body: typeof value.body === "string" && value.body.trim() ? value.body : title,
        url: typeof value.html_url === "string" ? value.html_url : undefined,
        updatedAt: typeof value.updated_at === "string" ? value.updated_at : undefined,
        labels: ["pull-request"],
      }];
    }),
  ];
}
