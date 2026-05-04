export function getPublicBaseUrl(origin?: string) {
  const base = process.env.NEXT_PUBLIC_LANDING_URL?.trim() || origin || "";
  return base.replace(/\/$/, "");
}

export function getPublicMatchUrl(matchId: string, origin?: string) {
  const base = getPublicBaseUrl(origin);
  const path = `/feed/${encodeURIComponent(matchId)}`;
  return base ? `${base}${path}` : path;
}
