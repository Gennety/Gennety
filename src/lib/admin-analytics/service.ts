import { prisma } from "@/lib/db";
import { AnalyticsRange, isInRange } from "@/lib/admin-analytics/range";
import { extractContactSignals, hasContactExchangeSignal } from "@/lib/admin-analytics/contact-signals";

type AdviceStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "DECLINED" | "FAILED" | "CANCELLED";
type FreshnessState = "ACTIVE" | "AGING" | "STALE" | "INACTIVE";

interface JsonResponseMeta {
  generatedAt: string;
  range: {
    key: string;
    label: string;
    from: string | null;
    to: string;
  };
}

function buildMeta(range: AnalyticsRange): JsonResponseMeta {
  return {
    generatedAt: new Date().toISOString(),
    range: {
      key: range.key,
      label: range.label,
      from: range.from?.toISOString() ?? null,
      to: range.to.toISOString(),
    },
  };
}

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildSeriesSeed(range: AnalyticsRange) {
  if (!range.from) return null;
  const current = new Date(range.from);
  const end = new Date(range.to);
  const seed: Record<string, number> = {};
  while (current <= end) {
    seed[toDayKey(current)] = 0;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return seed;
}

function buildTimeSeries(dates: Date[], range: AnalyticsRange) {
  const seed = buildSeriesSeed(range);
  if (!seed) return [];
  for (const date of dates) {
    const key = toDayKey(date);
    if (key in seed) seed[key] += 1;
  }
  return Object.entries(seed).map(([date, value]) => ({ date, value }));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function median(values: number[]) {
  return percentile(values, 0.5);
}

function round(value: number | null, digits = 2) {
  if (value === null) return null;
  return Number(value.toFixed(digits));
}

function rate(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function hoursBetween(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function daysBetween(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function computeWaitStats(startTimes: Date[], endTimes: Date[]) {
  const durations = endTimes.map((endTime, index) => hoursBetween(startTimes[index], endTime));
  return {
    count: durations.length,
    avgHours: round(average(durations)),
    medianHours: round(median(durations)),
    p90Hours: round(percentile(durations, 0.9)),
  };
}

function parseAdviceVerdict(value: string) {
  const match = value.match(/Verdict:\s*(.+)/i);
  return match?.[1]?.trim() ?? null;
}

function sortByCountDesc<T extends { count: number }>(items: T[]) {
  return [...items].sort((a, b) => b.count - a.count);
}

function countBy<T extends string | number>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function getFreshnessBreakdown(states: FreshnessState[]) {
  return {
    ACTIVE: states.filter((state) => state === "ACTIVE").length,
    AGING: states.filter((state) => state === "AGING").length,
    STALE: states.filter((state) => state === "STALE").length,
    INACTIVE: states.filter((state) => state === "INACTIVE").length,
  };
}

async function loadAnalyticsEvents(types: string[], range: AnalyticsRange) {
  return prisma.analyticsEvent.findMany({
    where: {
      type: { in: types },
      ...(range.from
        ? { createdAt: { gte: range.from, lte: range.to } }
        : { createdAt: { lte: range.to } }),
    },
    orderBy: { createdAt: "asc" },
  });
}

async function loadComputeUsage(range: AnalyticsRange) {
  return prisma.computeUsage.findMany({
    where: range.from
      ? { createdAt: { gte: range.from, lte: range.to } }
      : { createdAt: { lte: range.to } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAnalyticsIndex(range: AnalyticsRange) {
  return {
    ...buildMeta(range),
    sections: [
      { key: "overview", title: "Overview", path: "/api/admin/analytics/overview" },
      { key: "trust", title: "Trust", path: "/api/admin/analytics/trust" },
      { key: "network", title: "Supply & Demand", path: "/api/admin/analytics/network" },
      { key: "beacons", title: "Beacons", path: "/api/admin/analytics/beacons" },
      { key: "advice", title: "Model Advice", path: "/api/admin/analytics/advice" },
      { key: "agents", title: "Agent Quality", path: "/api/admin/analytics/agents" },
      { key: "countries", title: "Countries", path: "/api/admin/analytics/countries" },
      { key: "users", title: "Users", path: "/api/admin/analytics/users" },
      { key: "costs", title: "Costs", path: "/api/admin/analytics/costs" },
      { key: "anomalies", title: "Anomalies", path: "/api/admin/analytics/anomalies" },
      { key: "reports", title: "Reports", path: "/api/admin/analytics/reports" },
    ],
    auth: {
      mode: "bearer_secret",
      note: "Use this API server-to-server from the separate dashboard repo. Do not expose the secret to the browser.",
    },
  };
}

export async function getOverviewAnalytics(range: AnalyticsRange) {
  const [owners, agents, contexts, matches, beacons, adviceSessions, consentLogs] = await Promise.all([
    prisma.owner.findMany({
      select: {
        id: true,
        countryCode: true,
        isDemo: true,
        onboarded: true,
        createdAt: true,
      },
    }),
    prisma.agent.findMany({
      select: {
        id: true,
        ownerId: true,
        isDemo: true,
        isActive: true,
        wakeWebhookEnabled: true,
        wakeWebhookLastPingOk: true,
        lastActiveAt: true,
      },
    }),
    prisma.agentContext.findMany({
      select: {
        agentId: true,
        expertise: true,
        freshnessState: true,
        lastSignificantUpdateAt: true,
      },
    }),
    prisma.match.findMany({
      select: {
        id: true,
        status: true,
        createdAt: true,
        proposedAt: true,
        matchedAt: true,
        matchSimilarity: true,
        agentA: { select: { ownerId: true, isDemo: true } },
        agentB: { select: { ownerId: true, isDemo: true } },
        chat: { select: { id: true } },
      },
    }),
    prisma.beacon.findMany({
      select: {
        id: true,
        isActive: true,
        createdAt: true,
        triggeredAt: true,
      },
    }),
    prisma.adviceSession.findMany({
      where: range.from ? { createdAt: { gte: range.from, lte: range.to } } : undefined,
      select: { createdAt: true },
    }),
    prisma.consentLog.findMany({
      where: { purpose: "A" },
      select: { ownerId: true, consentedAt: true },
    }),
  ]);

  const firstConsentByOwner = new Map<string, Date>();
  for (const log of consentLogs) {
    const previous = firstConsentByOwner.get(log.ownerId);
    if (!previous || log.consentedAt < previous) {
      firstConsentByOwner.set(log.ownerId, log.consentedAt);
    }
  }

  const firstProposedByOwner = new Map<string, Date>();
  const firstMatchedByOwner = new Map<string, Date>();
  for (const match of matches) {
    const ownerIds = [match.agentA.ownerId, match.agentB.ownerId];
    for (const ownerId of ownerIds) {
      if (match.proposedAt) {
        const current = firstProposedByOwner.get(ownerId);
        if (!current || match.proposedAt < current) firstProposedByOwner.set(ownerId, match.proposedAt);
      }
      if (match.matchedAt) {
        const current = firstMatchedByOwner.get(ownerId);
        if (!current || match.matchedAt < current) firstMatchedByOwner.set(ownerId, match.matchedAt);
      }
    }
  }

  const consentStartsForProposed: Date[] = [];
  const firstProposalEnds: Date[] = [];
  const consentStartsForMatched: Date[] = [];
  const firstMatchEnds: Date[] = [];
  let waitingForFirstProposed = 0;
  let waitingForFirstProposedOver48h = 0;
  let waitingForFirstMatched = 0;
  let waitingForFirstMatchedOver48h = 0;

  for (const owner of owners.filter((item) => item.onboarded)) {
    const consentAt = firstConsentByOwner.get(owner.id);
    if (!consentAt) continue;

    const firstProposed = firstProposedByOwner.get(owner.id);
    if (firstProposed) {
      consentStartsForProposed.push(consentAt);
      firstProposalEnds.push(firstProposed);
    } else {
      waitingForFirstProposed += 1;
      if (hoursBetween(consentAt, range.to) > 48) waitingForFirstProposedOver48h += 1;
    }

    const firstMatched = firstMatchedByOwner.get(owner.id);
    if (firstMatched) {
      consentStartsForMatched.push(consentAt);
      firstMatchEnds.push(firstMatched);
    } else {
      waitingForFirstMatched += 1;
      if (hoursBetween(consentAt, range.to) > 48) waitingForFirstMatchedOver48h += 1;
    }
  }

  const expertiseTags = contexts.flatMap((context) => context.expertise.map((tag) => normalizeText(tag)));
  const uniqueExpertiseTags = new Set(expertiseTags.filter(Boolean));
  const activeBeacons = beacons.filter((beacon) => beacon.isActive).length;

  const matchedOwners = new Set<string>();
  const proposedOwners = new Set<string>();
  const chatOwners = new Set<string>();
  for (const match of matches) {
    const ownerIds = [match.agentA.ownerId, match.agentB.ownerId];
    if (match.proposedAt) {
      ownerIds.forEach((ownerId) => proposedOwners.add(ownerId));
    }
    if (match.matchedAt) {
      ownerIds.forEach((ownerId) => matchedOwners.add(ownerId));
    }
    if (match.chat?.id) {
      ownerIds.forEach((ownerId) => chatOwners.add(ownerId));
    }
  }

  const wakeEnabledAgents = agents.filter((agent) => agent.wakeWebhookEnabled);
  const wakeHealthy = wakeEnabledAgents.filter((agent) => agent.wakeWebhookLastPingOk === true).length;
  const wakeUnhealthy = wakeEnabledAgents.filter((agent) => agent.wakeWebhookLastPingOk === false).length;
  const wakeUnknown = wakeEnabledAgents.filter((agent) => agent.wakeWebhookLastPingOk === null).length;
  const matchedWithSimilarity = matches.filter(
    (match) => isInRange(match.matchedAt, range) && match.matchSimilarity !== null
  );
  const countriesCaptured = owners.filter((owner) => owner.countryCode).length;

  return {
    ...buildMeta(range),
    summary: {
      owners: {
        total: owners.length,
        onboarded: owners.filter((owner) => owner.onboarded).length,
        demo: owners.filter((owner) => owner.isDemo).length,
        real: owners.filter((owner) => !owner.isDemo).length,
      },
      agents: {
        total: agents.length,
        active: agents.filter((agent) => agent.isActive).length,
        demo: agents.filter((agent) => agent.isDemo).length,
        real: agents.filter((agent) => !agent.isDemo).length,
        wakeWebhooks: {
          enabled: wakeEnabledAgents.length,
          healthy: wakeHealthy,
          unhealthy: wakeUnhealthy,
          unknown: wakeUnknown,
          successRate: round(rate(wakeHealthy, wakeEnabledAgents.length)),
        },
      },
      contexts: {
        published: contexts.length,
        freshness: getFreshnessBreakdown(
          contexts.map((context) => context.freshnessState as FreshnessState)
        ),
      },
      matches: {
        negotiating: matches.filter((match) => match.status === "NEGOTIATING").length,
        proposed: matches.filter((match) => match.status === "PROPOSED").length,
        matched: matches.filter((match) => match.status === "MATCHED").length,
        dormant: matches.filter((match) => match.status === "DORMANT").length,
        declined: matches.filter((match) => match.status === "DECLINED").length,
        matchPrecision: {
          avgSimilarityConfirmed: round(
            average(
              matchedWithSimilarity.map((match) => Number(match.matchSimilarity))
            )
          ),
          coverage: round(rate(matchedWithSimilarity.length, matches.filter((match) => isInRange(match.matchedAt, range)).length)),
        },
      },
      beacons: {
        total: beacons.length,
        active: activeBeacons,
        triggered: beacons.filter((beacon) => beacon.triggeredAt !== null).length,
      },
      networkVitality: {
        activeBeacons,
        uniqueExpertiseTags: uniqueExpertiseTags.size,
        value: round(rate(activeBeacons, Math.max(uniqueExpertiseTags.size, 1))),
      },
      countries: {
        captured: countriesCaptured,
        missing: owners.length - countriesCaptured,
      },
    },
    ttfv: {
      firstProposed: {
        ...computeWaitStats(consentStartsForProposed, firstProposalEnds),
        waitingNow: waitingForFirstProposed,
        waitingOver48h: waitingForFirstProposedOver48h,
      },
      firstMatched: {
        ...computeWaitStats(consentStartsForMatched, firstMatchEnds),
        waitingNow: waitingForFirstMatched,
        waitingOver48h: waitingForFirstMatchedOver48h,
      },
    },
    funnel: {
      onboardedOwners: owners.filter((owner) => owner.onboarded).length,
      withPublishedContext: contexts.length,
      withFirstProposal: proposedOwners.size,
      withFirstMatch: matchedOwners.size,
      withChat: chatOwners.size,
    },
    series: {
      ownersCreated: buildTimeSeries(
        owners.filter((owner) => isInRange(owner.createdAt, range)).map((owner) => owner.createdAt),
        range
      ),
      proposals: buildTimeSeries(
        matches
          .filter((match) => isInRange(match.proposedAt, range))
          .map((match) => match.proposedAt as Date),
        range
      ),
      matched: buildTimeSeries(
        matches
          .filter((match) => isInRange(match.matchedAt, range))
          .map((match) => match.matchedAt as Date),
        range
      ),
      adviceRequested: buildTimeSeries(
        adviceSessions.map((session) => session.createdAt),
        range
      ),
    },
  };
}

export async function getTrustAnalytics(range: AnalyticsRange) {
  const [matches, agents] = await Promise.all([
    prisma.match.findMany({
      select: {
        id: true,
        status: true,
        createdAt: true,
        proposedAt: true,
        matchedAt: true,
        matchSimilarity: true,
        discoverySource: true,
        sourceBeaconId: true,
        agentAAcceptedAt: true,
        agentBAcceptedAt: true,
        confirmedByA: true,
        confirmedByB: true,
        initiatorAgentId: true,
        agentA: { select: { id: true, agentId: true, isDemo: true } },
        agentB: { select: { id: true, agentId: true, isDemo: true } },
      },
    }),
    prisma.agent.findMany({
      select: {
        id: true,
        agentId: true,
        totalInitiatedNegotiations: true,
        totalNegotiationsAgreed: true,
      },
    }),
  ]);

  const mutualAgreementCohort = matches.filter(
    (match) =>
      match.agentAAcceptedAt !== null &&
      match.agentBAcceptedAt !== null &&
      isInRange(match.proposedAt, range)
  );
  const proposedCohort = matches.filter((match) => isInRange(match.proposedAt, range));
  const matchedFromCohort = proposedCohort.filter((match) => match.status === "MATCHED");
  const dormantFromCohort = proposedCohort.filter((match) => match.status === "DORMANT");
  const pendingFromCohort = proposedCohort.filter((match) => match.status === "PROPOSED");
  const declinedFromCohort = proposedCohort.filter((match) => match.status === "DECLINED");
  const ghostedNegotiations = matches.filter((match) => {
    if (match.status !== "NEGOTIATING") return false;
    if (range.from && match.createdAt < range.from) return false;
    return hoursBetween(match.createdAt, range.to) > 24;
  });
  const activeNegotiations = matches.filter((match) => {
    if (match.status !== "NEGOTIATING") return false;
    if (range.from && match.createdAt < range.from) return false;
    return match.createdAt <= range.to;
  });

  const oldestGhosted = ghostedNegotiations
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 10)
    .map((match) => ({
      matchId: match.id,
      ageHours: round(hoursBetween(match.createdAt, range.to)),
      agentA: { agentId: match.agentA.agentId, isDemo: match.agentA.isDemo },
      agentB: { agentId: match.agentB.agentId, isDemo: match.agentB.isDemo },
    }));
  const confirmedWithSimilarity = matchedFromCohort.filter((match) => match.matchSimilarity !== null);

  return {
    ...buildMeta(range),
    trustGap: {
      mutualAgreementCount: mutualAgreementCohort.length,
      dormantAfterAgreement: dormantFromCohort.length,
      dormantRate: round(rate(dormantFromCohort.length, mutualAgreementCohort.length)),
      matchedRate: round(rate(matchedFromCohort.length, mutualAgreementCohort.length)),
      stillPendingRate: round(rate(pendingFromCohort.length, mutualAgreementCohort.length)),
      declinedRate: round(rate(declinedFromCohort.length, mutualAgreementCohort.length)),
      note: "V2 metric now uses exact agent acceptance timestamps on Match instead of inferring agreement only from proposal existence.",
    },
    ghosting: {
      activeNegotiations: activeNegotiations.length,
      ghostedOver24h: ghostedNegotiations.length,
      ghostedRate: round(rate(ghostedNegotiations.length, activeNegotiations.length)),
      oldest: oldestGhosted,
    },
    humanConversion: {
      proposedCohort: proposedCohort.length,
      matched: matchedFromCohort.length,
      dormant: dormantFromCohort.length,
      pending: pendingFromCohort.length,
      declined: declinedFromCohort.length,
      proposedToMatchedRate: round(rate(matchedFromCohort.length, proposedCohort.length)),
    },
    matchPrecision: {
      confirmedMatchesWithSimilarity: confirmedWithSimilarity.length,
      avgSimilarity: round(
        average(confirmedWithSimilarity.map((match) => Number(match.matchSimilarity)))
      ),
      medianSimilarity: round(
        median(confirmedWithSimilarity.map((match) => Number(match.matchSimilarity)))
      ),
      bySource: {
        SEARCH: confirmedWithSimilarity.filter((match) => match.discoverySource === "SEARCH").length,
        BEACON: confirmedWithSimilarity.filter((match) => match.discoverySource === "BEACON").length,
        UNKNOWN: confirmedWithSimilarity.filter((match) => match.discoverySource === "UNKNOWN").length,
      },
    },
    negotiationEfficiency: {
      agentsTracked: agents.length,
      avgNegotiationSuccessRate: round(
        average(
          agents
            .filter((agent) => agent.totalInitiatedNegotiations > 0)
            .map((agent) =>
              rate(agent.totalNegotiationsAgreed, agent.totalInitiatedNegotiations)
            )
        )
      ),
    },
  };
}

export async function getNetworkAnalytics(range: AnalyticsRange) {
  const [contexts, contextEvents] = await Promise.all([
    prisma.agentContext.findMany({
      include: {
        agent: {
          select: {
            agentId: true,
            isDemo: true,
          },
        },
      },
    }),
    loadAnalyticsEvents(["CONTEXT_PUBLISHED"], range),
  ]);

  const expertiseSupply = new Map<string, number>();
  const demandAgainstExpertise = new Map<string, number>();
  const phraseDemand = new Map<string, number>();
  const freshnessDays: number[] = [];

  const allTags = Array.from(
    new Set(
      contexts.flatMap((context) => context.expertise.map((tag) => normalizeText(tag))).filter(Boolean)
    )
  );

  for (const context of contexts) {
    for (const rawTag of context.expertise) {
      const tag = normalizeText(rawTag);
      if (!tag) continue;
      expertiseSupply.set(tag, (expertiseSupply.get(tag) ?? 0) + 1);
    }

    const demandText = normalizeText(context.lookingFor);
    phraseDemand.set(demandText, (phraseDemand.get(demandText) ?? 0) + 1);
    for (const tag of allTags) {
      if (demandText.includes(tag)) {
        demandAgainstExpertise.set(tag, (demandAgainstExpertise.get(tag) ?? 0) + 1);
      }
    }

    freshnessDays.push(daysBetween(context.lastSignificantUpdateAt, range.to));
  }

  const topSupply = sortByCountDesc(
    Array.from(expertiseSupply.entries()).map(([tag, count]) => ({ tag, count }))
  ).slice(0, 20);

  const topDemand = sortByCountDesc(
    Array.from(demandAgainstExpertise.entries()).map(([tag, count]) => ({ tag, count }))
  ).slice(0, 20);

  const gaps = allTags
    .map((tag) => ({
      tag,
      supply: expertiseSupply.get(tag) ?? 0,
      demand: demandAgainstExpertise.get(tag) ?? 0,
      gap: (demandAgainstExpertise.get(tag) ?? 0) - (expertiseSupply.get(tag) ?? 0),
    }))
    .sort((a, b) => b.gap - a.gap);

  const significantContextEvents = contextEvents.filter((event) => {
    const significant = event.metadata && typeof event.metadata === "object" && "significant" in event.metadata
      ? (event.metadata as Record<string, unknown>).significant
      : null;
    return significant === true && event.agentId;
  });
  const eventsByAgent = new Map<string, Date[]>();
  for (const event of significantContextEvents) {
    const list = eventsByAgent.get(event.agentId as string) ?? [];
    list.push(event.createdAt);
    eventsByAgent.set(event.agentId as string, list);
  }
  const driftIntervalsDays: number[] = [];
  for (const list of eventsByAgent.values()) {
    const sorted = [...list].sort((a, b) => a.getTime() - b.getTime());
    for (let index = 1; index < sorted.length; index += 1) {
      driftIntervalsDays.push(daysBetween(sorted[index - 1], sorted[index]));
    }
  }

  return {
    ...buildMeta(range),
    supplyDemand: {
      topSupply,
      topDemand,
      biggestShortages: gaps.filter((item) => item.gap > 0).slice(0, 12),
      biggestOversupply: [...gaps].reverse().filter((item) => item.gap < 0).slice(0, 12),
      methodology:
        "Supply comes from structured expertise tags. Demand is a low-cost heuristic: we count when current looking_for text explicitly mentions the same tag.",
    },
    freshness: {
      avgDaysSinceSignificantUpdate: round(average(freshnessDays)),
      medianDaysSinceSignificantUpdate: round(median(freshnessDays)),
      p90DaysSinceSignificantUpdate: round(percentile(freshnessDays, 0.9)),
      states: getFreshnessBreakdown(
        contexts.map((context) => context.freshnessState as FreshnessState)
      ),
    },
    embeddingDrift: {
      significantPublishesInRange: significantContextEvents.length,
      trackedIntervals: driftIntervalsDays.length,
      avgDaysBetweenSignificantPublishes: round(average(driftIntervalsDays)),
      medianDaysBetweenSignificantPublishes: round(median(driftIntervalsDays)),
      p90DaysBetweenSignificantPublishes: round(percentile(driftIntervalsDays, 0.9)),
      note: "This V2 metric is based on exact CONTEXT_PUBLISHED lifecycle events, not only the latest freshness snapshot.",
    },
    contextVolume: {
      totalPublishedContexts: contexts.length,
      demoContexts: contexts.filter((context) => context.agent.isDemo).length,
      realContexts: contexts.filter((context) => !context.agent.isDemo).length,
      topLookingForPhrases: sortByCountDesc(
        Array.from(phraseDemand.entries()).map(([phrase, count]) => ({ phrase, count }))
      ).slice(0, 10),
    },
  };
}

export async function getBeaconAnalytics(range: AnalyticsRange) {
  const [beacons, beaconEvents] = await Promise.all([
    prisma.beacon.findMany({
      include: {
        agent: {
          select: {
            id: true,
            agentId: true,
            isDemo: true,
          },
        },
      },
    }),
    loadAnalyticsEvents(["BEACON_TRIGGERED", "BEACON_SET"], range),
  ]);

  const triggeredInRange = beacons.filter((beacon) => isInRange(beacon.triggeredAt, range));
  const createdInRange = beacons.filter((beacon) => isInRange(beacon.createdAt, range));
  const triggeredDurations = triggeredInRange
    .filter((beacon) => beacon.triggeredAt)
    .map((beacon) => hoursBetween(beacon.createdAt, beacon.triggeredAt as Date));

  const triggeredAgentIds = Array.from(
    new Set(
      triggeredInRange
        .filter((beacon) => beacon.triggeredAt)
        .map((beacon) => beacon.agent.id)
    )
  );

  const minTriggeredAt =
    triggeredInRange
      .filter((beacon) => beacon.triggeredAt)
      .map((beacon) => (beacon.triggeredAt as Date).getTime())
      .sort((a, b) => a - b)[0] ?? null;
  const maxTriggeredAt =
    triggeredInRange
      .filter((beacon) => beacon.triggeredAt)
      .map((beacon) => (beacon.triggeredAt as Date).getTime())
      .sort((a, b) => b - a)[0] ?? null;

  const followThroughMatches =
    triggeredAgentIds.length > 0 && minTriggeredAt !== null && maxTriggeredAt !== null
      ? await prisma.match.findMany({
          where: {
            OR: [
              { agentAId: { in: triggeredAgentIds } },
              { agentBId: { in: triggeredAgentIds } },
            ],
            createdAt: {
              gte: new Date(minTriggeredAt),
              lte: new Date(maxTriggeredAt + 72 * 60 * 60 * 1000),
            },
          },
          select: {
            id: true,
            createdAt: true,
            agentAId: true,
            agentBId: true,
          },
        })
      : [];

  const noFollowThrough = triggeredInRange.filter((beacon) => {
    if (!beacon.triggeredAt) return false;
    return !followThroughMatches.some((match) => {
      const sameAgent = match.agentAId === beacon.agentId || match.agentBId === beacon.agentId;
      return sameAgent && match.createdAt >= (beacon.triggeredAt as Date) &&
        match.createdAt <= new Date((beacon.triggeredAt as Date).getTime() + 72 * 60 * 60 * 1000);
    });
  });

  const topQueries = sortByCountDesc(
    Array.from(countBy(createdInRange.map((beacon) => beacon.contextQuery)).entries()).map(([query, count]) => ({
      query,
      count,
    }))
  ).slice(0, 12);

  const trackedTriggeredBeaconIds = triggeredInRange.map((beacon) => beacon.id);
  const linkedMatches = trackedTriggeredBeaconIds.length > 0
    ? await prisma.match.findMany({
        where: { sourceBeaconId: { in: trackedTriggeredBeaconIds } },
        select: {
          id: true,
          sourceBeaconId: true,
          status: true,
          createdAt: true,
          proposedAt: true,
        },
      })
    : [];
  const linkedBeaconIds = new Set(
    linkedMatches
      .map((match) => match.sourceBeaconId)
      .filter((value): value is string => Boolean(value))
  );
  const declinedLinkedBeaconIds = new Set(
    linkedMatches
      .filter((match) => match.status === "DECLINED")
      .map((match) => match.sourceBeaconId)
      .filter((value): value is string => Boolean(value))
  );
  const triggeredWithoutNegotiation = triggeredInRange.filter((beacon) => !linkedBeaconIds.has(beacon.id));
  const exactFalsePositiveCount = declinedLinkedBeaconIds.size;
  const trackedRateDenominator = linkedBeaconIds.size;
  const triggerEventCount = beaconEvents.filter((event) => event.type === "BEACON_TRIGGERED").length;

  return {
    ...buildMeta(range),
    liquidity: {
      createdInRange: createdInRange.length,
      activeNow: beacons.filter((beacon) => beacon.isActive).length,
      triggeredInRange: triggeredInRange.length,
      triggerRate: round(rate(triggeredInRange.length, createdInRange.length)),
      timeToTriggerHours: {
        avg: round(average(triggeredDurations)),
        median: round(median(triggeredDurations)),
        p90: round(percentile(triggeredDurations, 0.9)),
      },
      waitingLongerThan14d: beacons.filter(
        (beacon) => beacon.isActive && hoursBetween(beacon.createdAt, range.to) > 14 * 24
      ).length,
    },
    falsePositives: {
      exactLinkedDeclines: exactFalsePositiveCount,
      exactLinkedDeclineRate: round(rate(exactFalsePositiveCount, trackedRateDenominator)),
      triggeredWithoutNegotiation: triggeredWithoutNegotiation.length,
      heuristicTriggeredWithoutFollowThrough72h: noFollowThrough.length,
      trackedLinkedBeacons: trackedRateDenominator,
      triggerEventsInRange: triggerEventCount,
      note: "V2 exact metric uses Match.sourceBeaconId for tracked beacon-origin negotiations. Older or unlinked flows still fall back to the heuristic follow-through proxy.",
    },
    topQueries,
  };
}

export async function getAdviceAnalytics(range: AnalyticsRange) {
  const sessions = await prisma.adviceSession.findMany({
    where: range.from ? { createdAt: { gte: range.from, lte: range.to } } : undefined,
    select: {
      id: true,
      chatId: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      status: true,
      promptTitle: true,
    },
  });

  const sessionIds = sessions.map((session) => session.id);
  const chatIds = Array.from(new Set(sessions.map((session) => session.chatId)));

  const [messages] = await Promise.all([
    sessionIds.length > 0
      ? prisma.message.findMany({
          where: {
            OR: [
              { chatId: { in: chatIds }, kind: "HUMAN" },
              { adviceSessionId: { in: sessionIds }, kind: "MODEL_ADVICE_RESULT" },
            ],
          },
          select: {
            chatId: true,
            adviceSessionId: true,
            kind: true,
            content: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const humanMessagesByChat = new Map<string, Array<{ content: string; createdAt: Date }>>();
  const adviceResultBySession = new Map<string, string>();
  for (const message of messages) {
    if (message.kind === "HUMAN") {
      const group = humanMessagesByChat.get(message.chatId) ?? [];
      group.push({ content: message.content, createdAt: message.createdAt });
      humanMessagesByChat.set(message.chatId, group);
    }
    if (message.kind === "MODEL_ADVICE_RESULT" && message.adviceSessionId) {
      adviceResultBySession.set(message.adviceSessionId, message.content);
    }
  }

  const firstAdviceByChat = new Map<string, Date>();
  for (const session of sessions) {
    const previous = firstAdviceByChat.get(session.chatId);
    if (!previous || session.createdAt < previous) {
      firstAdviceByChat.set(session.chatId, session.createdAt);
    }
  }

  const chatsWithAdvice = Array.from(firstAdviceByChat.entries());
  const chatsWithContactExchange = chatsWithAdvice.filter(([chatId, firstAdviceAt]) => {
    const messagesInChat = humanMessagesByChat.get(chatId) ?? [];
    return messagesInChat.some(
      (message) => message.createdAt >= firstAdviceAt && hasContactExchangeSignal(message.content)
    );
  });

  const verdictCounts = new Map<string, number>();
  let severeDissonance = 0;
  let mildDissonance = 0;
  for (const session of sessions.filter((item) => item.status === "COMPLETED")) {
    const rawVerdict = adviceResultBySession.get(session.id);
    const verdict = rawVerdict ? parseAdviceVerdict(rawVerdict) : null;
    if (!verdict) continue;
    verdictCounts.set(verdict, (verdictCounts.get(verdict) ?? 0) + 1);
    if (/not enough overlap/i.test(verdict)) severeDissonance += 1;
    else if (/reframe/i.test(verdict)) mildDissonance += 1;
  }

  const approvalDurations = sessions
    .filter((session) => session.startedAt)
    .map((session) => hoursBetween(session.createdAt, session.startedAt as Date));
  const completionDurations = sessions
    .filter((session) => session.completedAt)
    .map((session) => hoursBetween(session.createdAt, session.completedAt as Date));

  const contactExamples = chatsWithContactExchange.slice(0, 10).map(([chatId]) => {
    const signals = (humanMessagesByChat.get(chatId) ?? [])
      .flatMap((message) => extractContactSignals(message.content))
      .slice(0, 5);
    return { chatId, signals: Array.from(new Set(signals)) };
  });

  return {
    ...buildMeta(range),
    sessions: {
      total: sessions.length,
      byStatus: {
        PENDING: sessions.filter((session) => session.status === "PENDING").length,
        ACTIVE: sessions.filter((session) => session.status === "ACTIVE").length,
        COMPLETED: sessions.filter((session) => session.status === "COMPLETED").length,
        DECLINED: sessions.filter((session) => session.status === "DECLINED").length,
        FAILED: sessions.filter((session) => session.status === "FAILED").length,
        CANCELLED: sessions.filter((session) => session.status === "CANCELLED").length,
      } satisfies Record<AdviceStatus, number>,
      avgHoursToApproval: round(average(approvalDurations)),
      avgHoursToCompletion: round(average(completionDurations)),
    },
    conversion: {
      chatsWithAdvice: chatsWithAdvice.length,
      chatsWithContactExchange: chatsWithContactExchange.length,
      adviceConversionRate: round(rate(chatsWithContactExchange.length, chatsWithAdvice.length)),
      note: "Real action is approximated with deterministic contact-exchange signals in human messages after the first advice request. No LLM is used here.",
      examples: contactExamples,
    },
    dissonance: {
      completedSessions: sessions.filter((session) => session.status === "COMPLETED").length,
      severe: severeDissonance,
      mild: mildDissonance,
      severeRate: round(
        rate(severeDissonance, sessions.filter((session) => session.status === "COMPLETED").length)
      ),
      verdicts: Array.from(verdictCounts.entries()).map(([verdict, count]) => ({
        verdict,
        count,
      })),
      note: "A severe dissonance means the advice result said there was not enough overlap, despite the original introduction already framing a positive fit.",
    },
  };
}

export async function getAgentAnalytics(range: AnalyticsRange) {
  const [agents, reports, reactions] = await Promise.all([
    prisma.agent.findMany({
      include: {
        owner: { select: { name: true } },
        context: { select: { freshnessState: true } },
      },
    }),
    prisma.report.findMany({
      where: range.from ? { createdAt: { gte: range.from, lte: range.to } } : undefined,
      include: {
        chat: {
          include: {
            match: {
              select: {
                agentAId: true,
                agentBId: true,
              },
            },
          },
        },
      },
    }),
    prisma.matchReaction.findMany({
      where: range.from ? { createdAt: { gte: range.from, lte: range.to } } : undefined,
      include: {
        match: {
          select: {
            agentAId: true,
            agentBId: true,
            isPublic: true,
          },
        },
      },
    }),
  ]);

  const reportCounts = new Map<string, number>();
  for (const report of reports) {
    for (const agentId of [report.chat.match.agentAId, report.chat.match.agentBId]) {
      reportCounts.set(agentId, (reportCounts.get(agentId) ?? 0) + 1);
    }
  }

  const dislikeCounts = new Map<string, number>();
  for (const reaction of reactions) {
    if (reaction.type !== "DISLIKE" || !reaction.match.isPublic) continue;
    for (const agentId of [reaction.match.agentAId, reaction.match.agentBId]) {
      dislikeCounts.set(agentId, (dislikeCounts.get(agentId) ?? 0) + 1);
    }
  }

  const rows = agents.map((agent) => {
    const spammyIndex = agent.reputationCompletedMatches > 0
      ? agent.totalInitiatedNegotiations / agent.reputationCompletedMatches
      : agent.totalInitiatedNegotiations;
    const reportsAgainst = reportCounts.get(agent.id) ?? 0;
    const publicDislikes = dislikeCounts.get(agent.id) ?? 0;

    return {
      internalId: agent.id,
      agentId: agent.agentId,
      ownerName: agent.owner.name,
      isDemo: agent.isDemo,
      reputationScore: round(agent.reputationScore),
      freshnessState: agent.context?.freshnessState ?? null,
      totalInitiatedNegotiations: agent.totalInitiatedNegotiations,
      completedMatches: agent.reputationCompletedMatches,
      totalProposedMatches: agent.totalProposedMatches,
      totalAcceptedByOwner: agent.totalAcceptedByOwner,
      negotiationAcceptanceRate: round(agent.reputationNegotiationRate),
      ownerAcceptanceRate: round(agent.reputationAcceptanceRate),
      spammyIndex: round(spammyIndex),
      reportsAgainst,
      publicDislikes,
      negativeFeedback: reportsAgainst + publicDislikes,
    };
  });

  const topSpammy = [...rows]
    .filter((row) => row.totalInitiatedNegotiations > 0)
    .sort((a, b) => (b.spammyIndex ?? 0) - (a.spammyIndex ?? 0))
    .slice(0, 15);
  const topNegative = [...rows]
    .filter((row) => row.negativeFeedback > 0)
    .sort((a, b) => b.negativeFeedback - a.negativeFeedback)
    .slice(0, 15);

  return {
    ...buildMeta(range),
    integrity: {
      agentsTracked: rows.length,
      agentsWithReports: rows.filter((row) => row.reportsAgainst > 0).length,
      agentsWithPublicDislikes: rows.filter((row) => row.publicDislikes > 0).length,
      note: "Public dislikes are weak, shared match-level sentiment. Chat reports are stronger because they come from actual participants.",
    },
    topSpammy,
    topNegativeFeedback: topNegative,
  };
}

export async function getReportAnalytics(range: AnalyticsRange) {
  const reports = await prisma.report.findMany({
    where: range.from ? { createdAt: { gte: range.from, lte: range.to } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reporter: {
        select: {
          id: true,
          name: true,
          email: true,
          isDemo: true,
        },
      },
      chat: {
        select: {
          id: true,
          status: true,
          match: {
            select: {
              id: true,
              status: true,
              overlapSummary: true,
              agentA: {
                select: {
                  agentId: true,
                  isDemo: true,
                  owner: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
              agentB: {
                select: {
                  agentId: true,
                  isDemo: true,
                  owner: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const reasonCounts = sortByCountDesc(
    Array.from(countBy(reports.map((report) => report.reason.trim())).entries()).map(([reason, count]) => ({
      reason,
      count,
    }))
  );

  return {
    ...buildMeta(range),
    summary: {
      totalReports: reports.length,
      uniqueChatsReported: new Set(reports.map((report) => report.chatId)).size,
      uniqueReporters: new Set(reports.map((report) => report.reporterId)).size,
      note: "Reports are stored for manual review. The current product validates only that the reporter is a participant in the chat; there is no automated moderation state machine yet.",
    },
    topReasons: reasonCounts.slice(0, 12),
    recentReports: reports.map((report) => ({
      reportId: report.id,
      createdAt: report.createdAt.toISOString(),
      reason: report.reason,
      reporter: {
        id: report.reporter.id,
        name: report.reporter.name,
        email: report.reporter.email,
        isDemo: report.reporter.isDemo,
      },
      chat: {
        id: report.chat.id,
        status: report.chat.status,
      },
      match: {
        id: report.chat.match.id,
        status: report.chat.match.status,
        overlapSummary: report.chat.match.overlapSummary,
      },
      participants: [
        {
          side: "A",
          agentId: report.chat.match.agentA.agentId,
          isDemo: report.chat.match.agentA.isDemo,
          ownerId: report.chat.match.agentA.owner.id,
          ownerName: report.chat.match.agentA.owner.name,
          ownerEmail: report.chat.match.agentA.owner.email,
        },
        {
          side: "B",
          agentId: report.chat.match.agentB.agentId,
          isDemo: report.chat.match.agentB.isDemo,
          ownerId: report.chat.match.agentB.owner.id,
          ownerName: report.chat.match.agentB.owner.name,
          ownerEmail: report.chat.match.agentB.owner.email,
        },
      ],
    })),
  };
}

export async function getCountryAnalytics(range: AnalyticsRange) {
  const owners = await prisma.owner.findMany({
    select: {
      id: true,
      countryCode: true,
      onboarded: true,
      isDemo: true,
      createdAt: true,
    },
  });

  const filteredOwners = owners.filter((owner) => isInRange(owner.createdAt, range));
  const buckets = new Map<string, { total: number; onboarded: number; pending: number; demo: number; real: number }>();

  for (const owner of filteredOwners) {
    const key = owner.countryCode ?? "UNSPECIFIED";
    const bucket = buckets.get(key) ?? { total: 0, onboarded: 0, pending: 0, demo: 0, real: 0 };
    bucket.total += 1;
    if (owner.onboarded) bucket.onboarded += 1;
    else bucket.pending += 1;
    if (owner.isDemo) bucket.demo += 1;
    else bucket.real += 1;
    buckets.set(key, bucket);
  }

  const rows = Array.from(buckets.entries())
    .map(([countryCode, value]) => ({
      countryCode,
      ...value,
      onboardingRate: round(rate(value.onboarded, value.total)),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    ...buildMeta(range),
    summary: {
      registeredUsers: filteredOwners.length,
      withCountry: filteredOwners.filter((owner) => owner.countryCode).length,
      withoutCountry: filteredOwners.filter((owner) => !owner.countryCode).length,
    },
    countries: rows,
  };
}

export async function getUsersAnalytics(range: AnalyticsRange) {
  const [owners, matches, chats, reports] = await Promise.all([
    prisma.owner.findMany({
      include: {
        agent: {
          include: {
            context: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.match.findMany({
      select: {
        id: true,
        status: true,
        matchedAt: true,
        proposedAt: true,
        agentA: { select: { ownerId: true } },
        agentB: { select: { ownerId: true } },
        chat: { select: { id: true } },
      },
    }),
    prisma.chat.findMany({
      select: {
        id: true,
        createdAt: true,
        match: {
          select: {
            agentA: { select: { ownerId: true } },
            agentB: { select: { ownerId: true } },
          },
        },
      },
    }),
    prisma.report.findMany({
      select: {
        id: true,
        reporterId: true,
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
    }),
  ]);

  const filteredOwners = owners.filter((owner) => isInRange(owner.createdAt, range));

  const matchCounts = new Map<string, { total: number; matched: number; proposed: number; dormant: number; declined: number }>();
  for (const match of matches) {
    for (const ownerId of [match.agentA.ownerId, match.agentB.ownerId]) {
      const current = matchCounts.get(ownerId) ?? { total: 0, matched: 0, proposed: 0, dormant: 0, declined: 0 };
      current.total += 1;
      if (match.status === "MATCHED") current.matched += 1;
      if (match.status === "PROPOSED") current.proposed += 1;
      if (match.status === "DORMANT") current.dormant += 1;
      if (match.status === "DECLINED") current.declined += 1;
      matchCounts.set(ownerId, current);
    }
  }

  const chatCounts = new Map<string, number>();
  for (const chat of chats) {
    for (const ownerId of [chat.match.agentA.ownerId, chat.match.agentB.ownerId]) {
      chatCounts.set(ownerId, (chatCounts.get(ownerId) ?? 0) + 1);
    }
  }

  const reportCounts = new Map<string, number>();
  for (const report of reports) {
    reportCounts.set(report.reporterId, (reportCounts.get(report.reporterId) ?? 0) + 1);
  }

  return {
    ...buildMeta(range),
    summary: {
      totalUsers: filteredOwners.length,
      onboarded: filteredOwners.filter((owner) => owner.onboarded).length,
      pendingOnboarding: filteredOwners.filter((owner) => !owner.onboarded).length,
    },
    users: filteredOwners.map((owner) => {
      const counts = matchCounts.get(owner.id) ?? { total: 0, matched: 0, proposed: 0, dormant: 0, declined: 0 };
      return {
        ownerId: owner.id,
        email: owner.email,
        name: owner.name,
        createdAt: owner.createdAt.toISOString(),
        onboarded: owner.onboarded,
        countryCode: owner.countryCode,
        networkingGoal: owner.networkingGoal,
        agentPlatform: owner.agentPlatform,
        isDemo: owner.isDemo,
        agent: owner.agent
          ? {
              agentId: owner.agent.agentId,
              isActive: owner.agent.isActive,
              lastActiveAt: owner.agent.lastActiveAt?.toISOString() ?? null,
              reputationScore: round(owner.agent.reputationScore),
              freshnessState: owner.agent.context?.freshnessState ?? null,
              currentWork: owner.agent.context?.currentWork ?? null,
            }
          : null,
        matches: counts,
        chats: chatCounts.get(owner.id) ?? 0,
        reportsSubmitted: reportCounts.get(owner.id) ?? 0,
      };
    }),
  };
}

export async function getUserAnalyticsDetail(ownerId: string) {
  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    include: {
      agent: {
        include: {
          context: true,
        },
      },
    },
  });

  if (!owner) {
    throw new Error(`Owner not found: ${ownerId}`);
  }

  const matches = owner.agent
    ? await prisma.match.findMany({
        where: {
          OR: [
            { agentAId: owner.agent.id },
            { agentBId: owner.agent.id },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          agentA: {
            include: {
              owner: true,
              context: true,
            },
          },
          agentB: {
            include: {
              owner: true,
              context: true,
            },
          },
          chat: {
            include: {
              messages: { orderBy: { createdAt: "asc" } },
              adviceSessions: { orderBy: { createdAt: "desc" } },
            },
          },
          reactions: true,
          comments: true,
        },
      })
    : [];

  return {
    owner: {
      id: owner.id,
      email: owner.email,
      name: owner.name,
      createdAt: owner.createdAt.toISOString(),
      onboarded: owner.onboarded,
      countryCode: owner.countryCode,
      networkingGoal: owner.networkingGoal,
      agentPlatform: owner.agentPlatform,
      privacyConsent: owner.privacyConsent,
      researchConsent: owner.researchConsent,
      excludedTopics: owner.excludedTopics,
      isDemo: owner.isDemo,
    },
    agent: owner.agent
      ? {
          id: owner.agent.id,
          agentId: owner.agent.agentId,
          displayName: owner.agent.displayName,
          isActive: owner.agent.isActive,
          lastActiveAt: owner.agent.lastActiveAt?.toISOString() ?? null,
          wakeWebhookEnabled: owner.agent.wakeWebhookEnabled,
          wakeWebhookLastPingAt: owner.agent.wakeWebhookLastPingAt?.toISOString() ?? null,
          wakeWebhookLastPingOk: owner.agent.wakeWebhookLastPingOk,
          wakeWebhookLastPingError: owner.agent.wakeWebhookLastPingError,
          reputationScore: round(owner.agent.reputationScore),
          context: owner.agent.context
            ? {
                currentWork: owner.agent.context.currentWork,
                expertise: owner.agent.context.expertise,
                lookingFor: owner.agent.context.lookingFor,
                networkingGoal: owner.agent.context.networkingGoal,
                freshnessState: owner.agent.context.freshnessState,
                updatedAt: owner.agent.context.updatedAt.toISOString(),
                lastSignificantUpdateAt: owner.agent.context.lastSignificantUpdateAt.toISOString(),
              }
            : null,
        }
      : null,
    matches: matches.map((match) => {
      const isAgentA = owner.agent?.id === match.agentAId;
      const other = isAgentA ? match.agentB : match.agentA;
      return {
        matchId: match.id,
        status: match.status,
        createdAt: match.createdAt.toISOString(),
        proposedAt: match.proposedAt?.toISOString() ?? null,
        matchedAt: match.matchedAt?.toISOString() ?? null,
        overlapSummary: match.overlapSummary,
        framingForMe: isAgentA ? match.framingForA : match.framingForB,
        matchSimilarity: match.matchSimilarity,
        discoverySource: match.discoverySource,
        otherPerson: {
          ownerId: other.owner.id,
          name: other.owner.name,
          email: other.owner.email,
          currentWork: other.context?.currentWork ?? null,
        },
        reactions: match.reactions,
        comments: match.comments.map((comment) => ({
          id: comment.id,
          ownerId: comment.ownerId,
          content: comment.content,
          createdAt: comment.createdAt.toISOString(),
        })),
        chat: match.chat
          ? {
              chatId: match.chat.id,
              status: match.chat.status,
              createdAt: match.chat.createdAt.toISOString(),
              adviceSessions: match.chat.adviceSessions.map((session) => ({
                id: session.id,
                status: session.status,
                promptTitle: session.promptTitle,
                promptText: session.promptText,
                summary: session.summary,
                recommendation: session.recommendation,
                createdAt: session.createdAt.toISOString(),
                completedAt: session.completedAt?.toISOString() ?? null,
              })),
              messages: match.chat.messages.map((message) => ({
                id: message.id,
                fromOwner: message.fromOwner,
                kind: message.kind,
                adviceSessionId: message.adviceSessionId,
                content: message.content,
                createdAt: message.createdAt.toISOString(),
              })),
            }
          : null,
      };
    }),
  };
}

export async function getCostAnalytics(range: AnalyticsRange) {
  const [demoLogs, computeUsage, sessions, contexts, beacons, matchedCount, agents, webhookEvents] = await Promise.all([
    prisma.demoResponderLog.findMany({
      where: range.from ? { createdAt: { gte: range.from, lte: range.to } } : undefined,
      select: {
        event: true,
        mcpTool: true,
        costUsd: true,
        tokensInput: true,
        tokensOutput: true,
        createdAt: true,
      },
    }),
    loadComputeUsage(range),
    prisma.adviceSession.count({
      where: range.from ? { createdAt: { gte: range.from, lte: range.to } } : undefined,
    }),
    prisma.agentContext.count({
      where: range.from ? { updatedAt: { gte: range.from, lte: range.to } } : undefined,
    }),
    prisma.beacon.count({
      where: range.from ? { createdAt: { gte: range.from, lte: range.to } } : undefined,
    }),
    prisma.match.count({
      where: range.from
        ? { matchedAt: { gte: range.from, lte: range.to }, status: "MATCHED" }
        : { status: "MATCHED" },
    }),
    prisma.agent.findMany({
      select: {
        wakeWebhookEnabled: true,
        wakeWebhookLastPingOk: true,
      },
    }),
    loadAnalyticsEvents(["WAKE_WEBHOOK_PING"], range),
  ]);

  const costByEvent = new Map<string, { usd: number; tokensIn: number; tokensOut: number; count: number }>();
  const costByTool = new Map<string, { usd: number; tokensIn: number; tokensOut: number; count: number }>();
  let totalTrackedUsd = 0;
  let totalTrackedTokens = 0;

  for (const log of demoLogs) {
    const eventEntry = costByEvent.get(log.event) ?? { usd: 0, tokensIn: 0, tokensOut: 0, count: 0 };
    eventEntry.usd += Number(log.costUsd ?? 0);
    eventEntry.tokensIn += Number(log.tokensInput ?? 0);
    eventEntry.tokensOut += Number(log.tokensOutput ?? 0);
    eventEntry.count += 1;
    costByEvent.set(log.event, eventEntry);

    const toolKey = log.mcpTool ?? "unknown";
    const toolEntry = costByTool.get(toolKey) ?? { usd: 0, tokensIn: 0, tokensOut: 0, count: 0 };
    toolEntry.usd += Number(log.costUsd ?? 0);
    toolEntry.tokensIn += Number(log.tokensInput ?? 0);
    toolEntry.tokensOut += Number(log.tokensOutput ?? 0);
    toolEntry.count += 1;
    costByTool.set(toolKey, toolEntry);

    totalTrackedUsd += Number(log.costUsd ?? 0);
    totalTrackedTokens += Number(log.tokensInput ?? 0) + Number(log.tokensOutput ?? 0);
  }

  const costByCategory = new Map<string, { usd: number; tokensIn: number; tokensOut: number; count: number }>();
  const costByOperation = new Map<string, { usd: number; tokensIn: number; tokensOut: number; count: number }>();
  let productionUsd = 0;
  let productionTokens = 0;
  for (const usage of computeUsage) {
    const categoryEntry = costByCategory.get(usage.category) ?? { usd: 0, tokensIn: 0, tokensOut: 0, count: 0 };
    categoryEntry.usd += usage.costUsd;
    categoryEntry.tokensIn += usage.tokensInput;
    categoryEntry.tokensOut += usage.tokensOutput;
    categoryEntry.count += 1;
    costByCategory.set(usage.category, categoryEntry);

    const operationEntry = costByOperation.get(usage.operation) ?? { usd: 0, tokensIn: 0, tokensOut: 0, count: 0 };
    operationEntry.usd += usage.costUsd;
    operationEntry.tokensIn += usage.tokensInput;
    operationEntry.tokensOut += usage.tokensOutput;
    operationEntry.count += 1;
    costByOperation.set(usage.operation, operationEntry);

    productionUsd += usage.costUsd;
    productionTokens += usage.tokensInput + usage.tokensOutput;
  }

  const wakeEnabledAgents = agents.filter((agent) => agent.wakeWebhookEnabled);
  const wakeHealthy = wakeEnabledAgents.filter((agent) => agent.wakeWebhookLastPingOk === true).length;
  const webhookSuccessCount = webhookEvents.filter((event) => {
    const ok = event.metadata && typeof event.metadata === "object" ? (event.metadata as Record<string, unknown>).ok : null;
    return ok === true;
  }).length;
  const webhookFailureCount = webhookEvents.length - webhookSuccessCount;
  const combinedUsd = totalTrackedUsd + productionUsd;
  const combinedTokens = totalTrackedTokens + productionTokens;

  return {
    ...buildMeta(range),
    tracked: {
      totalUsd: round(combinedUsd, 4),
      totalTokens: combinedTokens,
      tokensPerSuccessfulMatch: matchedCount > 0 ? Math.round(combinedTokens / matchedCount) : null,
      usdPerSuccessfulMatch: matchedCount > 0 ? round(combinedUsd / matchedCount, 4) : null,
      production: {
        totalUsd: round(productionUsd, 4),
        totalTokens: productionTokens,
        byCategory: Array.from(costByCategory.entries()).map(([category, value]) => ({
          category,
          count: value.count,
          usd: round(value.usd, 4),
          tokensInput: value.tokensIn,
          tokensOutput: value.tokensOut,
        })),
        byOperation: Array.from(costByOperation.entries()).map(([operation, value]) => ({
          operation,
          count: value.count,
          usd: round(value.usd, 4),
          tokensInput: value.tokensIn,
          tokensOutput: value.tokensOut,
        })),
      },
      demo: {
        totalUsd: round(totalTrackedUsd, 4),
        totalTokens: totalTrackedTokens,
      },
      byEvent: Array.from(costByEvent.entries()).map(([event, value]) => ({
        event,
        count: value.count,
        usd: round(value.usd, 4),
        tokensInput: value.tokensIn,
        tokensOutput: value.tokensOut,
      })),
      byTool: Array.from(costByTool.entries()).map(([tool, value]) => ({
        tool,
        count: value.count,
        usd: round(value.usd, 4),
        tokensInput: value.tokensIn,
        tokensOutput: value.tokensOut,
      })),
      note: "V2 now combines exact production compute ledger rows with demo responder logs.",
    },
    untrackedActivity: {
      modelAdviceSessions: sessions,
      contextPublishes: contexts,
      beaconsCreated: beacons,
      note: "These counts remain useful as activity volume references. Exact production compute is now persisted separately in ComputeUsage.",
    },
    webhooks: {
      enabledAgents: wakeEnabledAgents.length,
      healthy: wakeHealthy,
      unhealthy: wakeEnabledAgents.filter((agent) => agent.wakeWebhookLastPingOk === false).length,
      unknown: wakeEnabledAgents.filter((agent) => agent.wakeWebhookLastPingOk === null).length,
      successRate: round(rate(wakeHealthy, wakeEnabledAgents.length)),
      pingHistory: {
        total: webhookEvents.length,
        success: webhookSuccessCount,
        failure: webhookFailureCount,
        successRate: round(rate(webhookSuccessCount, webhookEvents.length)),
      },
    },
  };
}

export async function getAnomalyAnalytics(range: AnalyticsRange) {
  const [overview, trust, beacons, advice, agents, costs] = await Promise.all([
    getOverviewAnalytics(range),
    getTrustAnalytics(range),
    getBeaconAnalytics(range),
    getAdviceAnalytics(range),
    getAgentAnalytics(range),
    getCostAnalytics(range),
  ]);

  const anomalies: Array<{
    key: string;
    severity: "info" | "warn" | "critical";
    title: string;
    summary: string;
    metric: number | null;
  }> = [];

  if (trust.ghosting.ghostedOver24h > 0) {
    const ghostedRate = trust.ghosting.ghostedRate ?? 0;
    anomalies.push({
      key: "ghosted_negotiations",
      severity: ghostedRate >= 0.2 ? "critical" : "warn",
      title: "Negotiations are getting stuck",
      summary: `${trust.ghosting.ghostedOver24h} negotiations have been sitting in NEGOTIATING for more than 24 hours.`,
      metric: ghostedRate,
    });
  }

  if (overview.ttfv.firstProposed.waitingOver48h > 0) {
    anomalies.push({
      key: "ttfv_waiting",
      severity: "critical",
      title: "People are waiting too long for first value",
      summary: `${overview.ttfv.firstProposed.waitingOver48h} owners have waited more than 48 hours for a first proposed match.`,
      metric: overview.ttfv.firstProposed.waitingOver48h,
    });
  }

  if ((costs.webhooks.successRate ?? 1) < 0.7 && costs.webhooks.enabledAgents > 0) {
    anomalies.push({
      key: "wake_webhooks",
      severity: "warn",
      title: "Wake webhooks are unreliable",
      summary: `Only ${Math.round((costs.webhooks.successRate ?? 0) * 100)}% of enabled wake webhooks were healthy in the latest snapshot.`,
      metric: costs.webhooks.successRate,
    });
  }

  if (beacons.falsePositives.exactLinkedDeclines > 0) {
    const flaggedRate = beacons.falsePositives.exactLinkedDeclineRate ?? 0;
    anomalies.push({
      key: "beacon_noise",
      severity: flaggedRate >= 0.4 ? "warn" : "info",
      title: "Triggered beacons may be noisy",
      summary: `${beacons.falsePositives.exactLinkedDeclines} beacon-origin negotiations ended in a tracked decline.`,
      metric: flaggedRate,
    });
  }

  if ((advice.dissonance.severeRate ?? 0) > 0.2) {
    anomalies.push({
      key: "advice_dissonance",
      severity: "warn",
      title: "Advice is contradicting some introductions",
      summary: `Severe dissonance reached ${Math.round((advice.dissonance.severeRate ?? 0) * 100)}% of completed advice sessions.`,
      metric: advice.dissonance.severeRate,
    });
  }

  const noisyAgents = agents.topSpammy.filter((agent) => (agent.spammyIndex ?? 0) >= 10).slice(0, 5);
  for (const agent of noisyAgents) {
    anomalies.push({
      key: `spammy_${agent.agentId}`,
      severity: "warn",
      title: "Potential spammy agent",
      summary: `${agent.agentId} initiated ${agent.totalInitiatedNegotiations} negotiations but has only ${agent.completedMatches} completed matches.`,
      metric: agent.spammyIndex,
    });
  }

  return {
    ...buildMeta(range),
    anomalies,
  };
}
