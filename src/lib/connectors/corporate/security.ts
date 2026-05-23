import { createHmac, timingSafeEqual } from "crypto";
import { sanitizeConnectorContent } from "@/lib/services/community-knowledge";

const SLACK_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

function safeEqualStrings(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifySlackRequestSignature(args: {
  signingSecret: string | null | undefined;
  body: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  now?: number;
}) {
  if (!args.signingSecret || !args.timestamp || !args.signature) return false;

  const timestampSeconds = Number(args.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;

  const now = args.now ?? Date.now();
  const ageMs = Math.abs(now - timestampSeconds * 1000);
  if (ageMs > SLACK_SIGNATURE_WINDOW_MS) return false;

  const baseString = `v0:${args.timestamp}:${args.body}`;
  const expected = `v0=${createHmac("sha256", args.signingSecret)
    .update(baseString)
    .digest("hex")}`;
  return safeEqualStrings(args.signature, expected);
}

export function redactCorporateWebhookText(value: string) {
  const sanitized = sanitizeConnectorContent(value);
  const extraRedactions: string[] = [];
  const content = sanitized.content
    .split(/\r?\n/)
    .flatMap((line) => {
      if (/\b(SLACK_BOT_TOKEN|SLACK_SIGNING_SECRET|ATLASSIAN_API_TOKEN|DATABASE_URL|DIRECT_URL)\b/i.test(line)) {
        extraRedactions.push("Removed confidential environment reference");
        return [];
      }
      if (/\b(xox[baprs]-|gh[pousr]_|ACRA[A-Za-z0-9_-]{10,})/i.test(line)) {
        extraRedactions.push("Redacted possible corporate platform token");
        return line.replace(/\b(xox[baprs]-[A-Za-z0-9-]+|gh[pousr]_[A-Za-z0-9_]+|ACRA[A-Za-z0-9_-]{10,})\b/g, "[REDACTED_SECRET]");
      }
      return [line];
    })
    .join("\n")
    .trim();

  return {
    content,
    redactions: Array.from(new Set([...sanitized.redactions, ...extraRedactions])),
  };
}

export const __test = {
  safeEqualStrings,
  SLACK_SIGNATURE_WINDOW_MS,
};
