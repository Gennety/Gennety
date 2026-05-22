import { createHash } from "crypto";
import type { PersonalConnectorItem } from "@/lib/connectors/personal/obsidian";

const CALENDAR_WINDOW_DAYS = 7;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashEvent(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex").slice(0, 20);
}

function isPrivateOrBusyEvent(event: Record<string, unknown>) {
  const summary = (asString(event.summary) ?? asString(event.title) ?? "").toLowerCase();
  const visibility = (asString(event.visibility) ?? asString(event.class) ?? "").toLowerCase();
  const status = (asString(event.status) ?? "").toLowerCase();
  return (
    status === "cancelled" ||
    visibility === "private" ||
    summary === "busy" ||
    summary === "private" ||
    summary.includes("[private]")
  );
}

function normalizeCalendarEvent(event: Record<string, unknown>): PersonalConnectorItem | null {
  if (isPrivateOrBusyEvent(event)) return null;

  const startValue = asObject(event.start);
  const endValue = asObject(event.end);
  const start = asString(startValue.dateTime) ?? asString(startValue.date) ?? asString(event.start);
  const end = asString(endValue.dateTime) ?? asString(endValue.date) ?? asString(event.end);
  const summary = asString(event.summary) ?? asString(event.title);
  if (!summary || !start) return null;

  const id = asString(event.id) ?? asString(event.uid) ?? `${summary}:${start}`;
  const updated = asString(event.updated) ?? asString(event.lastModified) ?? "";

  return {
    externalId: `calendar:${id}:${updated || hashEvent(event)}`,
    title: summary,
    rawPayload: {
      id,
      summary,
      description: asString(event.description),
      location: asString(event.location),
      start,
      end,
      updated,
      source: asString(event.source) ?? "calendar",
    },
  };
}

function normalizeConfiguredCalendarItems(config: Record<string, unknown>) {
  const events = Array.isArray(config.events) ? config.events : [];
  return events.flatMap((event): PersonalConnectorItem[] => {
    const normalized = normalizeCalendarEvent(asObject(event));
    return normalized ? [normalized] : [];
  });
}

function unfoldIcsLines(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .reduce<string[]>((lines, line) => {
      if (/^[ \t]/.test(line) && lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      } else {
        lines.push(line);
      }
      return lines;
    }, []);
}

function parseIcsDate(value: string | null) {
  if (!value) return null;
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
  }
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

function parseIcsEvents(raw: string) {
  const lines = unfoldIcsLines(raw);
  const events: Array<Record<string, unknown>> = [];
  let current: Record<string, unknown> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const rawKey = line.slice(0, separator).split(";")[0].toUpperCase();
    const value = line.slice(separator + 1).replace(/\\n/g, "\n").replace(/\\,/g, ",");

    if (rawKey === "UID") current.uid = value;
    if (rawKey === "SUMMARY") current.summary = value;
    if (rawKey === "DESCRIPTION") current.description = value;
    if (rawKey === "LOCATION") current.location = value;
    if (rawKey === "DTSTART") current.start = parseIcsDate(value);
    if (rawKey === "DTEND") current.end = parseIcsDate(value);
    if (rawKey === "LAST-MODIFIED") current.lastModified = parseIcsDate(value);
    if (rawKey === "CLASS") current.class = value;
    if (rawKey === "STATUS") current.status = value;
  }

  return events.flatMap((event): PersonalConnectorItem[] => {
    const normalized = normalizeCalendarEvent({ ...event, source: "ics" });
    return normalized ? [normalized] : [];
  });
}

async function fetchGoogleCalendarItems(config: Record<string, unknown>, token: string) {
  const calendarId = encodeURIComponent(asString(config.calendarId) ?? "primary");
  const timeMin = new Date();
  const timeMax = new Date(timeMin.getTime() + CALENDAR_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
    `?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin.toISOString())}` +
    `&timeMax=${encodeURIComponent(timeMax.toISOString())}&maxResults=50`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Google Calendar connector fetch failed: ${response.status}`);

  const raw = (await response.json()) as unknown;
  const items = Array.isArray(asObject(raw).items) ? (asObject(raw).items as unknown[]) : [];
  return items.flatMap((event): PersonalConnectorItem[] => {
    const normalized = normalizeCalendarEvent({ ...asObject(event), source: "google" });
    return normalized ? [normalized] : [];
  });
}

export async function fetchCalendarPersonalItems(config: Record<string, unknown>, token?: string | null) {
  const configured = normalizeConfiguredCalendarItems(config);
  if (configured.length > 0) return configured;

  const provider = (asString(config.provider) ?? "").toLowerCase();
  if (provider === "google" && token) {
    return fetchGoogleCalendarItems(config, token);
  }

  const icsUrl = asString(config.icsUrl);
  if (icsUrl) {
    const response = await fetch(icsUrl, { headers: { Accept: "text/calendar,*/*" } });
    if (!response.ok) throw new Error(`Calendar ICS fetch failed: ${response.status}`);
    return parseIcsEvents(await response.text());
  }

  return [];
}

export const __test = {
  parseIcsEvents,
  normalizeCalendarEvent,
  isPrivateOrBusyEvent,
};
