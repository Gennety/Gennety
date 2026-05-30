import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AnalyticsRange } from "@/lib/admin-analytics/range";
import {
  getAdviceAnalytics,
  getAgentAnalytics,
  getAnomalyAnalytics,
  getBeaconAnalytics,
  getCostAnalytics,
  getCountryAnalytics,
  getNetworkAnalytics,
  getOverviewAnalytics,
  getReportAnalytics,
  getTrustAnalytics,
  getUsersAnalytics,
} from "@/lib/admin-analytics/service";
import { estimateAnthropicCostUsd, getAnthropicSonnetModel, aiPricing } from "@/lib/ai-costs";
import { recordAnalyticsEvent, recordComputeUsage } from "@/lib/analytics-tracking";
import {
  escapeTelegramHtml,
  sendTelegramNotification,
} from "@/lib/services/telegram";
import { sendOperatorReportEmail } from "@/lib/services/notification";

const KYIV_TIME_ZONE = "Europe/Kyiv";
const WEEKLY_REPORT_EVENT = "OPENCLAW_WEEKLY_REPORT_SENT";
const MODERATION_REVIEW_EVENT = "OPENCLAW_MODERATION_REVIEWED";
const MODERATION_ACTION_EVENT = "OPENCLAW_MODERATION_ACTION";
const MODERATION_LOOKBACK_DAYS = 14;
const REPEAT_REPORT_LOOKBACK_DAYS = 30;
const MAX_REPORTS_PER_RUN = 50;
const TELEGRAM_CHUNK_LIMIT = 3400;

const SERIOUS_REPORT_CATEGORIES = new Set([
  "SPAM_OR_SCAM",
  "HARASSMENT",
  "PRIVACY_VIOLATION",
  "IMPERSONATION",
  "INAPPROPRIATE_CONTENT",
]);

const LOW_RISK_REPORT_CATEGORIES = new Set([
  "LOW_QUALITY_OR_IRRELEVANT_MATCH",
  "OTHER",
]);

const SEVERE_EVIDENCE_RE =
  /\b(threat|blackmail|doxx?|doxxing|extort|scam|fraud|stalk|harass|abuse|leak|personal data|phone number|address)\b|угроз|шантаж|скам|мошен|домог|преслед|оскорб|персональн|телефон|адрес/i;

const MARKET_COMPETITORS = [
  { name: "Lunchclub", angle: "AI matching for professional 1:1 coffee chats" },
  { name: "MYBZZ", angle: "intent-based networking for founders and business owners" },
  { name: "Series", angle: "AI agents mediating text connections for young professionals" },
  { name: "Gigi", angle: "AI social graph for networking and dating" },
  { name: "Lightfield", angle: "AI-native CRM for professional relationships" },
  { name: "Ladder", angle: "professional community and events platform" },
  { name: "Contra", angle: "indie and freelance professional networking" },
  { name: "AngelList", angle: "startup career, talent, and investor network" },
  { name: "RealRoots", angle: "community-first interest and values-based social network" },
  { name: "Digipals YC", angle: "community-first social network with offline elements" },
];

type JsonRecord = Record<string, unknown>;

type ModerationCategory =
  | "SPAM_OR_SCAM"
  | "HARASSMENT"
  | "PRIVACY_VIOLATION"
  | "IMPERSONATION"
  | "INAPPROPRIATE_CONTENT"
  | "LOW_QUALITY_OR_IRRELEVANT_MATCH"
  | "OTHER"
  | "UNSPECIFIED";

type ModerationDecisionKey =
  | "auto_block_pair"
  | "pause_target_and_block_pair"
  | "manual_review"
  | "no_action";

interface ModerationDecision {
  decision: ModerationDecisionKey;
  severity: "low" | "medium" | "high";
  actions: Array<"block_reporter_from_target" | "pause_target_agent" | "manual_review">;
  rationale: string;
}

interface RepeatReportStats {
  totalReports: number;
  uniqueReporters: number;
  seriousReports: number;
}

interface ModerationReportSummary {
  reportId: string;
  chatId: string;
  reporterId: string;
  targetOwnerId: string | null;
  category: ModerationCategory;
  decision: ModerationDecisionKey;
  severity: "low" | "medium" | "high";
  actionsApplied: string[];
  rationale: string;
  repeatStats: RepeatReportStats;
}

interface MarketSearchResult {
  query: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface MarketResearchResult {
  enabled: boolean;
  provider: string | null;
  generatedAt: string;
  notes: string[];
  competitors: typeof MARKET_COMPETITORS;
  results: MarketSearchResult[];
}

type SearchProviderConfig =
  | { provider: "serper"; apiKey: string }
  | { provider: "tavily"; apiKey: string }
  | { provider: "custom"; apiKey: string; endpoint: string };

interface OperatorAnalyticsPayload {
  overview: Awaited<ReturnType<typeof getOverviewAnalytics>>;
  trust: Awaited<ReturnType<typeof getTrustAnalytics>>;
  network: Awaited<ReturnType<typeof getNetworkAnalytics>>;
  beacons: Awaited<ReturnType<typeof getBeaconAnalytics>>;
  advice: Awaited<ReturnType<typeof getAdviceAnalytics>>;
  agents: Awaited<ReturnType<typeof getAgentAnalytics>>;
  countries: Awaited<ReturnType<typeof getCountryAnalytics>>;
  users: Awaited<ReturnType<typeof getUsersAnalytics>>;
  costs: Awaited<ReturnType<typeof getCostAnalytics>>;
  anomalies: Awaited<ReturnType<typeof getAnomalyAnalytics>>;
  reports: Awaited<ReturnType<typeof getReportAnalytics>>;
}

interface OpenClawDigest {
  generatedAt: string;
  range: {
    key: string;
    label: string;
    from: string | null;
    to: string;
  };
  analytics: OperatorAnalyticsPayload;
  moderation: Awaited<ReturnType<typeof runOpenClawModerationReview>> | null;
  market: MarketResearchResult;
  report: string | null;
}

interface OperatorRunOptions {
  now?: Date;
  forceWeekly?: boolean;
  send?: boolean;
  includeMarket?: boolean;
  generateReport?: boolean;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(value: string, max = 600) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
}

function daysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function buildWeeklyAnalyticsRange(now = new Date()): AnalyticsRange {
  const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);
  return {
    key: "7d",
    label: "Last 7 days",
    from,
    to: now,
  };
}

function kyivParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KYIV_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: byType.weekday,
    year: byType.year,
    month: byType.month,
    day: byType.day,
    hour: byType.hour,
    minute: byType.minute,
    periodKey: `${byType.year}-${byType.month}-${byType.day}`,
  };
}

export function getWeeklyScheduleDecision(now = new Date()) {
  const parts = kyivParts(now);
  return {
    due: parts.weekday === "Sun" && parts.hour === "23",
    periodKey: parts.periodKey,
    localTime: `${parts.periodKey} ${parts.hour}:${parts.minute} ${KYIV_TIME_ZONE}`,
  };
}

function parseReportCategory(reason: string): ModerationCategory {
  const match = reason.match(/Category:\s*([A-Z_]+)/i);
  const raw = match?.[1]?.toUpperCase();
  if (
    raw === "SPAM_OR_SCAM" ||
    raw === "HARASSMENT" ||
    raw === "PRIVACY_VIOLATION" ||
    raw === "IMPERSONATION" ||
    raw === "INAPPROPRIATE_CONTENT" ||
    raw === "LOW_QUALITY_OR_IRRELEVANT_MATCH" ||
    raw === "OTHER"
  ) {
    return raw;
  }
  return "UNSPECIFIED";
}

function parseReportedOwnerId(reason: string, participantIds: string[], reporterId: string) {
  const explicit = reason.match(/Reported owner:\s*.*\(([^)\s]+)\)/i)?.[1];
  if (explicit && participantIds.includes(explicit) && explicit !== reporterId) {
    return explicit;
  }

  const inferred = participantIds.filter((id) => id !== reporterId);
  return inferred.length === 1 ? inferred[0] : null;
}

function hasSevereEvidence(text: string) {
  return SEVERE_EVIDENCE_RE.test(text);
}

function decideReportAction(args: {
  category: ModerationCategory;
  targetOwnerId: string | null;
  evidenceText: string;
  repeatStats: RepeatReportStats;
}): ModerationDecision {
  if (!args.targetOwnerId) {
    return {
      decision: "manual_review",
      severity: "medium",
      actions: ["manual_review"],
      rationale: "The report target could not be identified safely.",
    };
  }

  const severeEvidence = hasSevereEvidence(args.evidenceText);
  const repeatSeriousPattern =
    args.repeatStats.uniqueReporters >= 3 && args.repeatStats.seriousReports >= 3;

  if (repeatSeriousPattern || (severeEvidence && args.repeatStats.uniqueReporters >= 2)) {
    return {
      decision: "pause_target_and_block_pair",
      severity: "high",
      actions: ["block_reporter_from_target", "pause_target_agent", "manual_review"],
      rationale:
        "Repeated serious reports or clear dangerous evidence require protecting the reporter and pausing the reported agent until manual review.",
    };
  }

  if (SERIOUS_REPORT_CATEGORIES.has(args.category) || severeEvidence) {
    return {
      decision: "auto_block_pair",
      severity: "medium",
      actions: ["block_reporter_from_target", "manual_review"],
      rationale:
        "The category is serious enough to protect the reporter immediately, while leaving platform-wide punishment for manual review.",
    };
  }

  if (LOW_RISK_REPORT_CATEGORIES.has(args.category)) {
    return {
      decision: "manual_review",
      severity: "low",
      actions: ["manual_review"],
      rationale:
        "This looks like a quality or fit complaint. It should inform matching quality, not trigger automatic punishment.",
    };
  }

  return {
    decision: "no_action",
    severity: "low",
    actions: [],
    rationale: "No safe automatic action matched the report.",
  };
}

async function loadReviewedReportIds() {
  const events = await prisma.analyticsEvent.findMany({
    where: {
      type: MODERATION_REVIEW_EVENT,
      createdAt: { gte: daysAgo(90) },
    },
    select: { metadata: true },
  });

  const ids = new Set<string>();
  for (const event of events) {
    if (isRecord(event.metadata) && typeof event.metadata.reportId === "string") {
      ids.add(event.metadata.reportId);
    }
  }
  return ids;
}

async function loadRecentReportsForRepeatStats(now: Date) {
  return prisma.report.findMany({
    where: { createdAt: { gte: daysAgo(REPEAT_REPORT_LOOKBACK_DAYS, now), lte: now } },
    select: {
      reporterId: true,
      reason: true,
      chat: {
        select: {
          match: {
            select: {
              agentA: { select: { ownerId: true } },
              agentB: { select: { ownerId: true } },
            },
          },
        },
      },
    },
  });
}

function countRepeatReportsForTarget(
  reports: Awaited<ReturnType<typeof loadRecentReportsForRepeatStats>>,
  targetOwnerId: string | null
): RepeatReportStats {
  if (!targetOwnerId) {
    return { totalReports: 0, uniqueReporters: 0, seriousReports: 0 };
  }

  const reporters = new Set<string>();
  let totalReports = 0;
  let seriousReports = 0;

  for (const report of reports) {
    const participants = [
      report.chat.match.agentA.ownerId,
      report.chat.match.agentB.ownerId,
    ];
    const parsedTarget = parseReportedOwnerId(report.reason, participants, report.reporterId);
    if (parsedTarget !== targetOwnerId) continue;

    totalReports += 1;
    reporters.add(report.reporterId);
    if (SERIOUS_REPORT_CATEGORIES.has(parseReportCategory(report.reason))) {
      seriousReports += 1;
    }
  }

  return {
    totalReports,
    uniqueReporters: reporters.size,
    seriousReports,
  };
}

async function applyOwnerBlock(blockerId: string, blockedId: string) {
  const [blocker, blocked] = await Promise.all([
    prisma.owner.findUnique({ where: { id: blockerId }, include: { agent: true } }),
    prisma.owner.findUnique({ where: { id: blockedId }, include: { agent: true } }),
  ]);

  if (!blocker || !blocked || blockerId === blockedId) {
    return { applied: false, sharedMatchesClosed: 0 };
  }

  await prisma.block.upsert({
    where: {
      blockerId_blockedId: {
        blockerId,
        blockedId,
      },
    },
    create: {
      blockerId,
      blockedId,
    },
    update: {},
  });

  let sharedMatchesClosed = 0;
  if (blocker.agent && blocked.agent) {
    const sharedMatches = await prisma.match.findMany({
      where: {
        OR: [
          { agentAId: blocker.agent.id, agentBId: blocked.agent.id },
          { agentAId: blocked.agent.id, agentBId: blocker.agent.id },
        ],
      },
      select: { id: true, status: true },
    });

    const matchIds = sharedMatches.map((match) => match.id);
    if (matchIds.length > 0) {
      const chatResult = await prisma.chat.updateMany({
        where: { matchId: { in: matchIds } },
        data: { status: "BLOCKED" },
      });
      sharedMatchesClosed = chatResult.count;

      await prisma.match.updateMany({
        where: {
          id: { in: matchIds },
          status: { in: ["NEGOTIATING", "PROPOSED"] },
        },
        data: { status: "DECLINED" },
      });
    }
  }

  return { applied: true, sharedMatchesClosed };
}

async function pauseTargetAgent(targetOwnerId: string) {
  const agent = await prisma.agent.findUnique({
    where: { ownerId: targetOwnerId },
    select: { id: true, agentId: true },
  });

  if (!agent) return { applied: false, agentId: null };

  await prisma.agent.update({
    where: { id: agent.id },
    data: { searchPaused: true, isActive: false },
  });

  await prisma.beacon.updateMany({
    where: { agentId: agent.id, isActive: true },
    data: { isActive: false, preservable: true },
  });

  return { applied: true, agentId: agent.agentId };
}

function summarizeEvidence(report: {
  reason: string;
  chat: {
    messages: Array<{ fromOwner: string; kind: string; content: string; createdAt: Date }>;
    match: {
      negotiationLogs: Array<{ role: string; type: string; content: string; createdAt: Date }>;
    };
  };
}) {
  const messageLines = report.chat.messages
    .filter((message) => message.kind === "HUMAN")
    .slice(-20)
    .map((message) => `[${message.createdAt.toISOString()}] ${message.fromOwner}: ${message.content}`);

  const logLines = report.chat.match.negotiationLogs
    .slice(-10)
    .map((log) => `[${log.createdAt.toISOString()}] ${log.role}/${log.type}: ${log.content}`);

  return [
    "Report reason:",
    report.reason,
    "",
    "Recent human chat:",
    ...messageLines,
    "",
    "Recent negotiation logs:",
    ...logLines,
  ].join("\n");
}

export async function runOpenClawModerationReview(options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const [reviewedReportIds, repeatReports, reports] = await Promise.all([
    loadReviewedReportIds(),
    loadRecentReportsForRepeatStats(now),
    prisma.report.findMany({
      where: { createdAt: { gte: daysAgo(MODERATION_LOOKBACK_DAYS, now), lte: now } },
      orderBy: { createdAt: "asc" },
      take: MAX_REPORTS_PER_RUN * 4,
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        chat: {
          include: {
            messages: { orderBy: { createdAt: "asc" } },
            match: {
              include: {
                agentA: { include: { owner: true } },
                agentB: { include: { owner: true } },
                negotiationLogs: { orderBy: { createdAt: "asc" } },
              },
            },
          },
        },
      },
    }),
  ]);

  const summaries: ModerationReportSummary[] = [];
  let reviewed = 0;
  let skippedAlreadyReviewed = 0;
  let blocksApplied = 0;
  let targetAgentsPaused = 0;
  let manualReviewNeeded = 0;

  for (const report of reports) {
    if (reviewed >= MAX_REPORTS_PER_RUN) break;

    if (reviewedReportIds.has(report.id)) {
      skippedAlreadyReviewed += 1;
      continue;
    }

    const participantIds = [
      report.chat.match.agentA.owner.id,
      report.chat.match.agentB.owner.id,
    ];
    const targetOwnerId = parseReportedOwnerId(report.reason, participantIds, report.reporterId);
    const category = parseReportCategory(report.reason);
    const evidenceText = summarizeEvidence(report);
    const repeatStats = countRepeatReportsForTarget(repeatReports, targetOwnerId);
    const decision = decideReportAction({
      category,
      targetOwnerId,
      evidenceText,
      repeatStats,
    });

    const actionsApplied: string[] = [];

    if (targetOwnerId && decision.actions.includes("block_reporter_from_target")) {
      const block = await applyOwnerBlock(report.reporterId, targetOwnerId);
      if (block.applied) {
        blocksApplied += 1;
        actionsApplied.push(`block_reporter_from_target:${block.sharedMatchesClosed}_shared_chats_closed`);
      }
    }

    if (targetOwnerId && decision.actions.includes("pause_target_agent")) {
      const pause = await pauseTargetAgent(targetOwnerId);
      if (pause.applied) {
        targetAgentsPaused += 1;
        actionsApplied.push(`pause_target_agent:${pause.agentId}`);
      }
    }

    if (decision.actions.includes("manual_review")) {
      manualReviewNeeded += 1;
      actionsApplied.push("manual_review");
    }

    const metadata: Prisma.InputJsonObject = {
      reportId: report.id,
      chatId: report.chatId,
      reporterId: report.reporterId,
      targetOwnerId,
      category,
      decision: decision.decision,
      severity: decision.severity,
      actionsApplied,
      rationale: decision.rationale,
      repeatStats: {
        totalReports: repeatStats.totalReports,
        uniqueReporters: repeatStats.uniqueReporters,
        seriousReports: repeatStats.seriousReports,
      },
    };

    await recordAnalyticsEvent({
      type: MODERATION_REVIEW_EVENT,
      ownerId: report.reporterId,
      chatId: report.chatId,
      matchId: report.chat.matchId,
      metadata,
    });

    if (actionsApplied.some((action) => action !== "manual_review")) {
      await recordAnalyticsEvent({
        type: MODERATION_ACTION_EVENT,
        ownerId: targetOwnerId,
        chatId: report.chatId,
        matchId: report.chat.matchId,
        metadata,
      });
    }

    summaries.push({
      reportId: report.id,
      chatId: report.chatId,
      reporterId: report.reporterId,
      targetOwnerId,
      category,
      decision: decision.decision,
      severity: decision.severity,
      actionsApplied,
      rationale: decision.rationale,
      repeatStats,
    });
    reviewed += 1;
  }

  return {
    generatedAt: now.toISOString(),
    lookbackDays: MODERATION_LOOKBACK_DAYS,
    reviewed,
    skippedAlreadyReviewed,
    blocksApplied,
    targetAgentsPaused,
    manualReviewNeeded,
    decisions: summaries,
    policy: {
      seriousCategories: Array.from(SERIOUS_REPORT_CATEGORIES),
      lowRiskCategories: Array.from(LOW_RISK_REPORT_CATEGORIES),
      repeatPauseThreshold:
        "Pause the reported agent only after 3+ serious reports from 3+ unique reporters in 30 days, or severe evidence plus 2+ unique reporters.",
    },
  };
}

async function loadOperatorAnalytics(range: AnalyticsRange): Promise<OperatorAnalyticsPayload> {
  const [
    overview,
    trust,
    network,
    beacons,
    advice,
    agents,
    countries,
    users,
    costs,
    anomalies,
    reports,
  ] = await Promise.all([
    getOverviewAnalytics(range),
    getTrustAnalytics(range),
    getNetworkAnalytics(range),
    getBeaconAnalytics(range),
    getAdviceAnalytics(range),
    getAgentAnalytics(range),
    getCountryAnalytics(range),
    getUsersAnalytics(range),
    getCostAnalytics(range),
    getAnomalyAnalytics(range),
    getReportAnalytics(range),
  ]);

  return {
    overview,
    trust,
    network,
    beacons,
    advice,
    agents,
    countries,
    users,
    costs,
    anomalies,
    reports,
  };
}

function resolveSearchProvider(): SearchProviderConfig | null {
  const requested = process.env.OPENCLAW_WEB_SEARCH_PROVIDER?.trim().toLowerCase();
  if ((requested === "serper" || !requested) && process.env.SERPER_API_KEY) {
    return { provider: "serper", apiKey: process.env.SERPER_API_KEY };
  }
  if ((requested === "tavily" || !requested) && process.env.TAVILY_API_KEY) {
    return { provider: "tavily", apiKey: process.env.TAVILY_API_KEY };
  }
  if (
    (requested === "custom" || !requested) &&
    process.env.OPENCLAW_WEB_SEARCH_ENDPOINT &&
    process.env.OPENCLAW_WEB_SEARCH_API_KEY
  ) {
    return {
      provider: "custom",
      apiKey: process.env.OPENCLAW_WEB_SEARCH_API_KEY,
      endpoint: process.env.OPENCLAW_WEB_SEARCH_ENDPOINT,
    };
  }
  return null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSearchItems(query: string, source: string, items: unknown[]): MarketSearchResult[] {
  return items
    .map((item) => {
      if (!isRecord(item)) return null;
      const title =
        typeof item.title === "string"
          ? item.title
          : typeof item.name === "string"
            ? item.name
            : null;
      const url =
        typeof item.link === "string"
          ? item.link
          : typeof item.url === "string"
            ? item.url
            : null;
      const snippet =
        typeof item.snippet === "string"
          ? item.snippet
          : typeof item.content === "string"
            ? item.content
            : typeof item.description === "string"
              ? item.description
              : "";

      if (!title || !url) return null;
      return {
        query,
        title: truncate(title, 140),
        url,
        snippet: truncate(snippet, 500),
        source,
      };
    })
    .filter((item): item is MarketSearchResult => Boolean(item));
}

async function searchSerper(apiKey: string, query: string): Promise<MarketSearchResult[]> {
  const res = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, num: 5, gl: "us", hl: "en" }),
  });
  if (!res.ok) throw new Error(`Serper search failed: ${res.status}`);
  const data: unknown = await res.json();
  const organic = isRecord(data) && Array.isArray(data.organic) ? data.organic : [];
  return normalizeSearchItems(query, "serper", organic);
}

async function searchTavily(apiKey: string, query: string): Promise<MarketSearchResult[]> {
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5,
      search_depth: "basic",
      include_answer: true,
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed: ${res.status}`);
  const data: unknown = await res.json();
  const results = isRecord(data) && Array.isArray(data.results) ? data.results : [];
  return normalizeSearchItems(query, "tavily", results);
}

async function searchCustom(endpoint: string, apiKey: string, query: string): Promise<MarketSearchResult[]> {
  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, limit: 5 }),
  });
  if (!res.ok) throw new Error(`Custom web search failed: ${res.status}`);
  const data: unknown = await res.json();
  const results =
    isRecord(data) && Array.isArray(data.results)
      ? data.results
      : isRecord(data) && Array.isArray(data.organic)
        ? data.organic
        : [];
  return normalizeSearchItems(query, "custom", results);
}

function marketQueries() {
  return [
    "AI professional networking market trends 2026",
    "AI social discovery networking dating market research 2026",
    "professional networking app user acquisition Gen Z young professionals 2026",
    "community first social networks offline events trend 2026",
    ...MARKET_COMPETITORS.map((item) => `${item.name} ${item.angle} latest`),
  ];
}

async function collectMarketResearch(includeMarket: boolean): Promise<MarketResearchResult> {
  const provider = includeMarket ? resolveSearchProvider() : null;
  const notes: string[] = [];

  if (!includeMarket) {
    return {
      enabled: false,
      provider: null,
      generatedAt: new Date().toISOString(),
      notes: ["Market scan skipped by request."],
      competitors: MARKET_COMPETITORS,
      results: [],
    };
  }

  if (!provider) {
    return {
      enabled: false,
      provider: null,
      generatedAt: new Date().toISOString(),
      notes: [
        "No web-search key configured. Set SERPER_API_KEY, TAVILY_API_KEY, or OPENCLAW_WEB_SEARCH_ENDPOINT + OPENCLAW_WEB_SEARCH_API_KEY.",
      ],
      competitors: MARKET_COMPETITORS,
      results: [],
    };
  }

  const results: MarketSearchResult[] = [];
  for (const query of marketQueries()) {
    try {
      const found =
        provider.provider === "serper"
          ? await searchSerper(provider.apiKey, query)
          : provider.provider === "tavily"
            ? await searchTavily(provider.apiKey, query)
            : await searchCustom(provider.endpoint, provider.apiKey, query);
      results.push(...found);
    } catch (error) {
      notes.push(`${query}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    enabled: true,
    provider: provider.provider,
    generatedAt: new Date().toISOString(),
    notes,
    competitors: MARKET_COMPETITORS,
    results: results.slice(0, 80),
  };
}

function compactAnalyticsForPrompt(
  analytics: OperatorAnalyticsPayload,
  moderation: Awaited<ReturnType<typeof runOpenClawModerationReview>> | null,
  market: MarketResearchResult
) {
  return {
    overview: {
      summary: analytics.overview.summary,
      ttfv: analytics.overview.ttfv,
      funnel: analytics.overview.funnel,
    },
    trust: {
      trustGap: analytics.trust.trustGap,
      ghosting: analytics.trust.ghosting,
      humanConversion: analytics.trust.humanConversion,
    },
    network: {
      supplyDemand: analytics.network.supplyDemand,
      freshness: analytics.network.freshness,
      contextVolume: analytics.network.contextVolume,
    },
    beacons: analytics.beacons,
    advice: {
      sessions: analytics.advice.sessions,
      conversion: analytics.advice.conversion,
      dissonance: analytics.advice.dissonance,
    },
    agents: analytics.agents,
    countries: analytics.countries,
    costs: {
      tracked: analytics.costs.tracked,
      webhooks: analytics.costs.webhooks,
    },
    anomalies: analytics.anomalies.anomalies,
    reports: {
      summary: analytics.reports.summary,
      topReasons: analytics.reports.topReasons,
      recentReports: analytics.reports.recentReports.slice(0, 12).map((report) => ({
        reportId: report.reportId,
        createdAt: report.createdAt,
        reason: truncate(report.reason, 500),
        chat: report.chat,
        match: report.match,
        participants: report.participants.map((participant) => ({
          side: participant.side,
          ownerId: participant.ownerId,
          ownerName: participant.ownerName,
          agentId: participant.agentId,
          isDemo: participant.isDemo,
        })),
      })),
    },
    moderation,
    market: {
      enabled: market.enabled,
      provider: market.provider,
      notes: market.notes,
      competitors: market.competitors,
      results: market.results.slice(0, 30),
    },
  };
}

function extractTextFromAnthropic(response: unknown) {
  if (!isRecord(response) || !Array.isArray(response.content)) return "";
  return response.content
    .map((block) => (
      isRecord(block) && block.type === "text" && typeof block.text === "string"
        ? block.text
        : ""
    ))
    .join("\n")
    .trim();
}

function fallbackRecommendations(analytics: OperatorAnalyticsPayload) {
  const recommendations: string[] = [];
  const anomalies = analytics.anomalies.anomalies;

  if (analytics.overview.ttfv.firstProposed.waitingOver48h > 0) {
    recommendations.push("Ускорить первый полезный матч: отдельно разобрать людей, которые ждут больше 48 часов.");
  }
  if (analytics.trust.ghosting.ghostedOver24h > 0) {
    recommendations.push("Разморозить зависшие переговоры: отправить агентам короткий wake-up и закрывать слабые пары быстрее.");
  }
  if (analytics.reports.summary.totalReports > 0) {
    recommendations.push("Посмотреть причины жалоб и добавить их как явные анти-сигналы в matching.");
  }
  if ((analytics.costs.webhooks.successRate ?? 1) < 0.8) {
    recommendations.push("Починить доставку wake-событий, иначе люди поздно видят новые сообщения и матчи.");
  }
  if (anomalies.length === 0) {
    recommendations.push("На следующей неделе сфокусироваться на росте: 2-3 коротких кейса пользователей и ручной outreach по узким нишам.");
  }
  recommendations.push("В соцсетях показывать не механику AI, а результат: кто с кем познакомился, зачем, и что сделал после встречи.");
  recommendations.push("Для удовлетворенности добавить быстрый вопрос после матча: полезно / не полезно / почему.");

  return recommendations.slice(0, 7);
}

function buildFallbackWeeklyReport(args: {
  range: AnalyticsRange;
  analytics: OperatorAnalyticsPayload;
  moderation: Awaited<ReturnType<typeof runOpenClawModerationReview>> | null;
  market: MarketResearchResult;
}) {
  const { analytics, moderation, market } = args;
  const owners = analytics.overview.summary.owners;
  const agents = analytics.overview.summary.agents;
  const matches = analytics.overview.summary.matches;
  const reports = analytics.reports.summary;
  const recs = fallbackRecommendations(analytics);

  return [
    `OpenClaw: недельный отчет (${args.range.label})`,
    "",
    "Коротко:",
    `- Пользователи: ${owners.total} всего, ${owners.onboarded} прошли onboarding.`,
    `- Агенты: ${agents.active} активных из ${agents.total}.`,
    `- Матчи: ${matches.matched} успешных, ${matches.proposed} предложенных, ${matches.negotiating} еще обсуждаются.`,
    `- Жалобы: ${reports.totalReports}; автомодерация проверила ${moderation?.reviewed ?? 0}, блокировок пар: ${moderation?.blocksApplied ?? 0}.`,
    "",
    "Что настораживает:",
    ...(analytics.anomalies.anomalies.length > 0
      ? analytics.anomalies.anomalies.slice(0, 5).map((item) => `- ${item.title}: ${item.summary}`)
      : ["- Критичных сигналов за неделю не видно."]),
    "",
    "Рынок:",
    market.enabled
      ? `- Внешний поиск включен через ${market.provider}. Найдено ${market.results.length} заметок по рынку и конкурентам.`
      : `- Внешний поиск не выполнен: ${market.notes.join(" ")}`,
    "",
    "Что делать дальше:",
    ...recs.map((item) => `- ${item}`),
  ].join("\n");
}

async function generateWeeklyReport(args: {
  range: AnalyticsRange;
  analytics: OperatorAnalyticsPayload;
  moderation: Awaited<ReturnType<typeof runOpenClawModerationReview>> | null;
  market: MarketResearchResult;
}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return buildFallbackWeeklyReport(args);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const payload = compactAnalyticsForPrompt(args.analytics, args.moderation, args.market);
  const payloadText = JSON.stringify(payload).slice(0, 55_000);

  try {
    const response = await client.messages.create({
      model: getAnthropicSonnetModel(),
      max_tokens: 1800,
      temperature: 0.35,
      system:
        "You are OpenClaw acting as Gennety's weekly operator analyst and business partner. Write in Russian. Use simple words. Avoid jargon. Be concrete, honest, and short. Do not expose private emails. Focus on what changed, what is risky, and what to do next in product, marketing, content, and user satisfaction.",
      messages: [
        {
          role: "user",
          content: [
            `Period: ${args.range.label}`,
            "",
            "Use this JSON. It contains platform analytics, moderation outcomes, and optional market-search snippets.",
            payloadText,
            "",
            "Return a compact report with these sections:",
            "1. Главное за неделю",
            "2. Пользователи и активность",
            "3. Жалобы и качество",
            "4. Рынок и конкуренты",
            "5. Что делать на следующей неделе",
            "6. Маркетинг: соцсети, контент, продвижение, удовлетворенность",
            "",
            "Rules:",
            "- Keep it under 900 words.",
            "- Give specific recommendations, not generic advice.",
            "- If data is missing, say exactly what key/config is missing.",
            "- Do not use complex analytics terms unless you explain them in plain language.",
          ].join("\n"),
        },
      ],
    });

    const report = extractTextFromAnthropic(response);
    const tokensInput = response.usage?.input_tokens ?? 0;
    const tokensOutput = response.usage?.output_tokens ?? 0;

    await recordComputeUsage({
      category: "OPENCLAW_OPERATOR",
      provider: aiPricing.anthropicSonnet.provider,
      model: getAnthropicSonnetModel(),
      operation: "openclaw_weekly_report",
      tokensInput,
      tokensOutput,
      costUsd: estimateAnthropicCostUsd(tokensInput, tokensOutput),
      metadata: {
        range: args.range.label,
        marketEnabled: args.market.enabled,
      },
    });

    return report || buildFallbackWeeklyReport(args);
  } catch (error) {
    console.warn("[openclaw-operator] Weekly report generation failed, using fallback:", error);
    return buildFallbackWeeklyReport(args);
  }
}

function splitForTelegram(text: string) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > TELEGRAM_CHUNK_LIMIT) {
    const candidate = remaining.slice(0, TELEGRAM_CHUNK_LIMIT);
    const splitAt = Math.max(candidate.lastIndexOf("\n\n"), candidate.lastIndexOf("\n"), candidate.lastIndexOf(". "));
    const index = splitAt > 1000 ? splitAt + 1 : TELEGRAM_CHUNK_LIMIT;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function deliverWeeklyReport(report: string, periodKey: string) {
  const delivery: Array<{ channel: string; sent: boolean; error?: string; reason?: string }> = [];

  const email = process.env.OPENCLAW_REPORT_EMAIL?.trim();
  if (email) {
    const emailResult = await sendOperatorReportEmail(
      email,
      `OpenClaw weekly report — ${periodKey}`,
      report
    );
    delivery.push({ channel: "email", ...emailResult });
  }

  if (process.env.OPENCLAW_REPORT_TELEGRAM_DISABLED !== "1") {
    const chunks = splitForTelegram(report);
    for (let i = 0; i < chunks.length; i += 1) {
      const prefix =
        chunks.length > 1
          ? `<b>OpenClaw weekly report ${periodKey}</b> (${i + 1}/${chunks.length})\n\n`
          : `<b>OpenClaw weekly report ${periodKey}</b>\n\n`;
      const result = await sendTelegramNotification(`${prefix}${escapeTelegramHtml(chunks[i])}`);
      delivery.push({ channel: "telegram", ...result });
      if (!result.sent) break;
    }
  }

  return delivery;
}

async function hasWeeklyReportBeenSent(periodKey: string) {
  const events = await prisma.analyticsEvent.findMany({
    where: {
      type: WEEKLY_REPORT_EVENT,
      createdAt: { gte: daysAgo(14) },
    },
    select: { metadata: true },
  });

  return events.some((event) => isRecord(event.metadata) && event.metadata.periodKey === periodKey);
}

export async function buildOpenClawDigest(options: OperatorRunOptions = {}): Promise<OpenClawDigest> {
  const now = options.now ?? new Date();
  const range = buildWeeklyAnalyticsRange(now);
  const [analytics, market] = await Promise.all([
    loadOperatorAnalytics(range),
    collectMarketResearch(options.includeMarket ?? true),
  ]);

  const moderation = null;
  const report =
    options.generateReport === false
      ? null
      : await generateWeeklyReport({ range, analytics, moderation, market });

  return {
    generatedAt: now.toISOString(),
    range: {
      key: range.key,
      label: range.label,
      from: range.from?.toISOString() ?? null,
      to: range.to.toISOString(),
    },
    analytics,
    moderation,
    market,
    report,
  };
}

export async function runOpenClawOperator(options: OperatorRunOptions = {}) {
  const now = options.now ?? new Date();
  const send = options.send ?? true;
  const includeMarket = options.includeMarket ?? true;
  const schedule = getWeeklyScheduleDecision(now);
  const moderation = await runOpenClawModerationReview({ now });
  const alreadySent = await hasWeeklyReportBeenSent(schedule.periodKey);
  const shouldGenerateWeekly = Boolean(options.forceWeekly || (schedule.due && !alreadySent));

  if (!shouldGenerateWeekly) {
    return {
      success: true,
      generatedWeeklyReport: false,
      schedule,
      alreadySent,
      moderation,
    };
  }

  const range = buildWeeklyAnalyticsRange(now);
  const [analytics, market] = await Promise.all([
    loadOperatorAnalytics(range),
    collectMarketResearch(includeMarket),
  ]);
  const report = await generateWeeklyReport({ range, analytics, moderation, market });
  const delivery = send ? await deliverWeeklyReport(report, schedule.periodKey) : [];

  await recordAnalyticsEvent({
    type: WEEKLY_REPORT_EVENT,
    metadata: {
      periodKey: schedule.periodKey,
      localTime: schedule.localTime,
      forced: Boolean(options.forceWeekly),
      sent: send,
      delivery,
      reportLength: report.length,
      moderation: {
        reviewed: moderation.reviewed,
        blocksApplied: moderation.blocksApplied,
        targetAgentsPaused: moderation.targetAgentsPaused,
        manualReviewNeeded: moderation.manualReviewNeeded,
      },
      market: {
        enabled: market.enabled,
        provider: market.provider,
        resultCount: market.results.length,
      },
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to.toISOString(),
      },
    },
  });

  return {
    success: true,
    generatedWeeklyReport: true,
    schedule,
    alreadySent,
    delivery,
    report,
    moderation,
    market: {
      enabled: market.enabled,
      provider: market.provider,
      resultCount: market.results.length,
      notes: market.notes,
    },
  };
}

export const __test = {
  buildFallbackWeeklyReport,
  buildWeeklyAnalyticsRange,
  decideReportAction,
  getWeeklyScheduleDecision,
  parseReportedOwnerId,
  parseReportCategory,
};
