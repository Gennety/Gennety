export interface NotionConnectorItem {
  id: string;
  title: string;
  text: string;
  url?: string;
  lastEditedTime?: string;
  tags?: string[];
}

export function normalizeNotionConnectorItems(config: Record<string, unknown> | null | undefined) {
  const items = Array.isArray(config?.items) ? config.items : [];
  return items.flatMap((item): NotionConnectorItem[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id : null;
    const title = typeof value.title === "string" ? value.title : null;
    const text = typeof value.text === "string" ? value.text : "";
    if (!id || !title || !text.trim()) return [];
    const tags = Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [];
    return [{
      id,
      title,
      text,
      url: typeof value.url === "string" ? value.url : undefined,
      lastEditedTime: typeof value.lastEditedTime === "string" ? value.lastEditedTime : undefined,
      tags,
    }];
  });
}

function readString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTitleFromNotionPage(page: Record<string, unknown>) {
  const properties = page.properties;
  if (!properties || typeof properties !== "object") return null;

  for (const value of Object.values(properties as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const property = value as Record<string, unknown>;
    if (property.type !== "title" || !Array.isArray(property.title)) continue;
    const title = property.title
      .map((item) =>
        item && typeof item === "object"
          ? ((item as Record<string, unknown>).plain_text as string | undefined)
          : undefined
      )
      .filter(Boolean)
      .join("");
    if (title) return title;
  }

  return null;
}

async function fetchNotionJson(url: string, config: Record<string, unknown>, init?: RequestInit) {
  const tokenEnv = readString(config, "tokenEnv");
  const token = tokenEnv ? process.env[tokenEnv] : process.env.NOTION_TOKEN;
  if (!token) return null;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Notion connector fetch failed: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

export async function fetchNotionConnectorItems(
  config: Record<string, unknown> | null | undefined
): Promise<NotionConnectorItem[]> {
  const configured = normalizeNotionConnectorItems(config);
  if (configured.length > 0) return configured;

  const safeConfig = config ?? {};
  const databaseId = readString(safeConfig, "databaseId");
  if (!databaseId) return [];

  const pageSize = Math.min(Number(safeConfig.pageSize ?? 20) || 20, 50);
  const raw = await fetchNotionJson(
    `https://api.notion.com/v1/databases/${encodeURIComponent(databaseId)}/query`,
    safeConfig,
    {
      method: "POST",
      body: JSON.stringify({ page_size: pageSize }),
    }
  );

  if (!raw || typeof raw !== "object" || !Array.isArray((raw as Record<string, unknown>).results)) {
    return [];
  }

  return ((raw as Record<string, unknown>).results as unknown[]).flatMap((page): NotionConnectorItem[] => {
    if (!page || typeof page !== "object") return [];
    const value = page as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id : null;
    const title = readTitleFromNotionPage(value) ?? "Untitled Notion page";
    if (!id) return [];
    return [{
      id,
      title,
      text: `Notion page: ${title}`,
      url: typeof value.url === "string" ? value.url : undefined,
      lastEditedTime: typeof value.last_edited_time === "string" ? value.last_edited_time : undefined,
      tags: ["notion"],
    }];
  });
}
