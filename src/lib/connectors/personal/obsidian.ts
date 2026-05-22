import { createHash } from "crypto";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";

export interface PersonalConnectorItem {
  externalId: string;
  title: string;
  rawPayload: Record<string, unknown>;
}

const MAX_OBSIDIAN_FILES = 100;
const MAX_OBSIDIAN_FILE_BYTES = 200_000;
const MAX_OBSIDIAN_CONTENT_CHARS = 20_000;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 20);
}

export function normalizeConfiguredObsidianItems(config: Record<string, unknown>) {
  const items = Array.isArray(config.items) ? config.items : [];
  return items.flatMap((item): PersonalConnectorItem[] => {
    const value = asObject(item);
    const id = asString(value.id) ?? asString(value.path);
    const title = asString(value.title) ?? asString(value.path);
    const content = asString(value.content);
    if (!id || !title || !content || !content.includes("#gennety-sync")) return [];
    return [
      {
        externalId: `obsidian:${id}:${hashText(content)}`,
        title,
        rawPayload: {
          path: asString(value.path) ?? id,
          content: content.slice(0, MAX_OBSIDIAN_CONTENT_CHARS),
          source: "configured",
        },
      },
    ];
  });
}

async function walkMarkdownFiles(dir: string, found: string[]) {
  if (found.length >= MAX_OBSIDIAN_FILES) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (found.length >= MAX_OBSIDIAN_FILES) return;
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownFiles(fullPath, found);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      found.push(fullPath);
    }
  }
}

export async function fetchObsidianPersonalItems(config: Record<string, unknown>) {
  const configured = normalizeConfiguredObsidianItems(config);
  if (configured.length > 0) return configured;

  const directories = [
    ...asStringArray(config.directories),
    ...asStringArray(config.paths),
  ];
  const items: PersonalConnectorItem[] = [];

  for (const directory of directories.slice(0, 5)) {
    const root = path.resolve(directory);
    const files: string[] = [];
    await walkMarkdownFiles(root, files);

    for (const filePath of files) {
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_OBSIDIAN_FILE_BYTES) continue;

      const content = await readFile(filePath, "utf8");
      if (!content.includes("#gennety-sync")) continue;

      const relativePath = path.relative(root, filePath);
      items.push({
        externalId: `obsidian:${relativePath}:${hashText(content)}`,
        title: relativePath,
        rawPayload: {
          path: relativePath,
          content: content.slice(0, MAX_OBSIDIAN_CONTENT_CHARS),
          mtime: fileStat.mtime.toISOString(),
        },
      });
    }
  }

  return items;
}
