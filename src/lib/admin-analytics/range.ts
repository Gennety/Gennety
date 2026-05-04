import { NextRequest } from "next/server";

export type AnalyticsRangeKey = "7d" | "30d" | "90d" | "365d" | "all";

export interface AnalyticsRange {
  key: AnalyticsRangeKey;
  label: string;
  from: Date | null;
  to: Date;
}

const RANGE_TO_DAYS: Record<Exclude<AnalyticsRangeKey, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

function startOfDayUtc(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfDayUtc(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999)
  );
}

function parseDateParam(raw: string | null) {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function parseAnalyticsRange(request: NextRequest): AnalyticsRange {
  const now = new Date();
  const { searchParams } = request.nextUrl;
  const keyParam = searchParams.get("range");
  const fromParam = parseDateParam(searchParams.get("from"));
  const toParam = parseDateParam(searchParams.get("to"));

  const to = toParam ? endOfDayUtc(toParam) : now;

  if (fromParam) {
    const from = startOfDayUtc(fromParam);
    return {
      key: "all",
      label: `${from.toISOString().slice(0, 10)}..${to.toISOString().slice(0, 10)}`,
      from,
      to,
    };
  }

  const key: AnalyticsRangeKey =
    keyParam === "7d" ||
    keyParam === "30d" ||
    keyParam === "90d" ||
    keyParam === "365d" ||
    keyParam === "all"
      ? keyParam
      : "30d";

  if (key === "all") {
    return { key, label: "All time", from: null, to };
  }

  const days = RANGE_TO_DAYS[key];
  const from = startOfDayUtc(new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  return { key, label: `Last ${days} days`, from, to };
}

export function isInRange(date: Date | null | undefined, range: AnalyticsRange) {
  if (!date) return false;
  if (!range.from) return date <= range.to;
  return date >= range.from && date <= range.to;
}

export function dateRangeWhere(range: AnalyticsRange, field: string) {
  if (!range.from) {
    return { [field]: { lte: range.to } };
  }
  return { [field]: { gte: range.from, lte: range.to } };
}
