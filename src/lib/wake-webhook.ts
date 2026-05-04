import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::",
  "::1",
]);

function stripIpv6Brackets(hostname: string) {
  return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

export function getWakeWebhookUrlError(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "Must be a valid URL";
  }

  if (url.protocol !== "https:") {
    return "Wake webhook must use HTTPS";
  }

  if (url.username || url.password) {
    return "Wake webhook URL must not include embedded credentials";
  }

  const hostname = url.hostname.toLowerCase();
  const normalizedHost = stripIpv6Brackets(hostname);

  if (!normalizedHost) {
    return "Wake webhook host is required";
  }

  if (
    BLOCKED_HOSTNAMES.has(normalizedHost) ||
    normalizedHost.endsWith(".local") ||
    normalizedHost.endsWith(".localhost") ||
    normalizedHost.endsWith(".localdomain") ||
    normalizedHost.endsWith(".internal") ||
    normalizedHost.endsWith(".home.arpa")
  ) {
    return "Wake webhook must use a public host";
  }

  const ipVersion = isIP(normalizedHost);
  if (ipVersion === 4 && isPrivateIpv4(normalizedHost)) {
    return "Wake webhook must use a public IPv4 address";
  }

  if (ipVersion === 6 && isPrivateIpv6(normalizedHost)) {
    return "Wake webhook must use a public IPv6 address";
  }

  return null;
}

export function assertWakeWebhookUrl(rawUrl: string) {
  const error = getWakeWebhookUrlError(rawUrl);
  if (error) {
    throw new Error(error);
  }
}
