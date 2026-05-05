import { prisma } from "@/lib/db";
import { buildPrivacyChangePayload } from "@/lib/privacy-change";
import { signalAgentWork } from "@/lib/services/agent-delivery";
import { createInboxEvent } from "@/lib/services/inbox";
import type { Prisma } from "@prisma/client";

const ALL_SENSITIVE_TOPICS = [
  "Health & personal issues",
  "Finances & debts",
  "Personal relationships",
  "Psychological topics",
] as const;

export interface PrivacySyncStatus {
  pending: boolean;
  searchPaused: boolean;
  changedAt: string;
  lastPublishedAt: string | null;
  summary: string | null;
  action: string | null;
  newlyExcluded: string[];
  newlyAllowed: string[];
  excludedNow: string[];
  sharedNow: string[];
  reviewFields: string[];
  recommendedAdditions: string[];
  recommendedRemovals: string[];
}

function asObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getPrivacySyncStatus(agentInternalId: string): Promise<PrivacySyncStatus | null> {
  const [latestEvent, context] = await Promise.all([
    prisma.inboxEvent.findFirst({
      where: {
        agentId: agentInternalId,
        type: "PRIVACY_SETTINGS_CHANGED",
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentContext.findUnique({
      where: { agentId: agentInternalId },
      select: { updatedAt: true, lastSignificantUpdateAt: true },
    }),
  ]);

  if (!latestEvent) return null;

  const payload = asObject(latestEvent.payload);
  const lastPublishedAt = context?.updatedAt ?? null;
  const lastSignificantUpdateAt = context?.lastSignificantUpdateAt ?? null;
  const pending =
    !lastSignificantUpdateAt ||
    lastSignificantUpdateAt.getTime() < latestEvent.createdAt.getTime();

  return {
    pending,
    searchPaused: readBoolean(payload.suppress_search_until_republish),
    changedAt: latestEvent.createdAt.toISOString(),
    lastPublishedAt: lastPublishedAt ? lastPublishedAt.toISOString() : null,
    summary: readString(payload.summary),
    action: readString(payload.action),
    newlyExcluded: readStringArray(payload.newly_excluded),
    newlyAllowed: readStringArray(payload.newly_allowed),
    excludedNow: readStringArray(payload.excluded_now),
    sharedNow: readStringArray(payload.shared_now),
    reviewFields: readStringArray(payload.review_fields),
    recommendedAdditions: readStringArray(payload.recommended_additions),
    recommendedRemovals: readStringArray(payload.recommended_removals),
  };
}

export async function syncPrivacyTopicsForAgent(args: {
  ownerId: string;
  previousExcludedTopics: string[];
  nextExcludedTopics: string[];
}) {
  const payload = buildPrivacyChangePayload({
    previousExcludedTopics: args.previousExcludedTopics,
    nextExcludedTopics: args.nextExcludedTopics,
    allTopics: [...ALL_SENSITIVE_TOPICS],
  });

  if (!payload) {
    return { changed: false, notified: false, suppressedSearch: false };
  }

  const agent = await prisma.agent.findUnique({
    where: { ownerId: args.ownerId },
    include: {
      context: {
        select: {
          ownerProfession: true,
          ownerDomain: true,
          ownerGoals: true,
          currentWork: true,
          expertise: true,
          lookingFor: true,
          notLookingFor: true,
          recentProblems: true,
          recentWins: true,
          networkingGoal: true,
          freshnessState: true,
        },
      },
    },
  });

  if (!agent) {
    return { changed: true, notified: false, suppressedSearch: false };
  }

  if (payload.suppress_search_until_republish && agent.context) {
    await prisma.$executeRaw`
      UPDATE agent_contexts
      SET embedding = NULL,
          previous_hash = NULL,
          freshness_state = 'STALE',
          updated_at = NOW()
      WHERE agent_id = ${agent.id}
    `;

    await prisma.beacon.updateMany({
      where: { agentId: agent.id, isActive: true },
      data: { isActive: false, preservable: true },
    });
  }

  await prisma.inboxEvent.updateMany({
    where: {
      agentId: agent.id,
      type: "PRIVACY_SETTINGS_CHANGED",
      dismissedAt: null,
    },
    data: { dismissedAt: new Date() },
  });

  await createInboxEvent({
    ownerId: args.ownerId,
    agentId: agent.id,
    type: "PRIVACY_SETTINGS_CHANGED",
    referenceId: agent.id,
    payload: {
      ...payload,
      current_published_context: agent.context
        ? {
            owner_profession: agent.context.ownerProfession,
            owner_domain: agent.context.ownerDomain,
            owner_goals: agent.context.ownerGoals,
            current_work: agent.context.currentWork,
            expertise: agent.context.expertise,
            looking_for: agent.context.lookingFor,
            not_looking_for: agent.context.notLookingFor,
            recent_problems: agent.context.recentProblems,
            recent_wins: agent.context.recentWins,
            networking_goal: agent.context.networkingGoal,
            freshness_state_before_change: agent.context.freshnessState,
          }
        : null,
    },
  });

  const wakeReason = payload.suppress_search_until_republish
    ? "Privacy settings tightened — refresh shared context now"
    : "Privacy settings changed — refresh shared context now";

  signalAgentWork({
    agentId: agent.id,
    kind: "PRIVACY_SETTINGS_CHANGED",
    reason: wakeReason,
    referenceId: agent.id,
    urgency: "high",
  }).catch((error) => {
    console.error("[privacy-sync] Failed to signal agent:", error);
  });

  return {
    changed: true,
    notified: true,
    suppressedSearch: payload.suppress_search_until_republish,
  };
}
