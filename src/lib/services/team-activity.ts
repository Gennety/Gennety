import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";
import { createInboxEvent, type InboxEventType } from "@/lib/services/inbox";
import { signalAgentWork, type AgentWorkKind } from "@/lib/services/agent-delivery";
import { ensureCommunityChatUnlocked } from "@/lib/services/community-chat";
import { sanitizeConnectorContent } from "@/lib/services/community-knowledge";
import {
  escapeTelegramHtml,
  sendTelegramNotification,
} from "@/lib/services/telegram";

export const TEAM_ACTIVITY_CATEGORIES = [
  "code",
  "deploy",
  "meeting",
  "decision",
  "blocker",
  "task",
] as const;

export type TeamActivityCategory = (typeof TEAM_ACTIVITY_CATEGORIES)[number];
export type TeamActorType = "AGENT" | "OWNER" | "SYSTEM";

const MAX_ACTIVITY_CONTENT_CHARS = 10_000;

export class TeamActivityError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export interface ResolvedTeamActor {
  actorId: string;
  actorType: TeamActorType;
  ownerId?: string | null;
  agentId?: string | null;
}

export interface LogTeamActivityInput {
  communityId: string;
  category: TeamActivityCategory;
  content: string;
  actorId: string;
  actorType?: TeamActorType;
}

function normalizeContent(value: string, maxChars: number) {
  const raw = value.trim();
  if (!raw) throw new TeamActivityError("content is required", 400);
  if (raw.length > maxChars) {
    throw new TeamActivityError(`content exceeds ${maxChars} characters`, 400);
  }

  const sanitized = sanitizeConnectorContent(raw);
  const content = sanitized.content.trim();
  if (!content) {
    throw new TeamActivityError("content was rejected after safety sanitization", 400);
  }

  return {
    content,
    redactions: Array.from(new Set(sanitized.redactions)),
  };
}

async function assertActiveCommunity(communityId: string) {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { id: true, name: true, status: true },
  });

  if (!community || community.status !== "ACTIVE") {
    throw new TeamActivityError("Community not found", 404);
  }

  return community;
}

async function assertActiveCommunityMembership(communityId: string, ownerId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId, ownerId } },
    select: {
      id: true,
      role: true,
      status: true,
      agentParticipationEnabled: true,
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new TeamActivityError("Only active community members can record team activity", 403);
  }

  return membership;
}

export async function resolveTeamActor(
  communityId: string,
  actorId: string,
  expectedType?: TeamActorType
): Promise<ResolvedTeamActor> {
  const id = actorId.trim();
  if (!id) throw new TeamActivityError("actorId is required", 400);

  if (expectedType === "SYSTEM") {
    return { actorId: id === "system" ? "system" : id, actorType: "SYSTEM" };
  }

  if (!expectedType || expectedType === "OWNER") {
    const owner = await prisma.owner.findUnique({
      where: { id },
      select: { id: true },
    });

    if (owner) {
      await assertActiveCommunityMembership(communityId, owner.id);
      return { actorId: owner.id, actorType: "OWNER", ownerId: owner.id, agentId: null };
    }
  }

  if (!expectedType || expectedType === "AGENT") {
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [{ id }, { agentId: id }],
      },
      select: {
        id: true,
        agentId: true,
        ownerId: true,
      },
    });

    if (agent) {
      const membership = await assertActiveCommunityMembership(communityId, agent.ownerId);
      if (!membership.agentParticipationEnabled) {
        throw new TeamActivityError("Agent participation is disabled for this community member", 403);
      }
      return {
        actorId: agent.agentId,
        actorType: "AGENT",
        ownerId: agent.ownerId,
        agentId: agent.id,
      };
    }
  }

  throw new TeamActivityError("Actor is not an active member of this community", 403);
}

function serializeActivityLog(log: {
  id: string;
  communityId: string;
  actorId: string;
  actorType: string;
  category: string;
  content: string;
  createdAt: Date;
}) {
  return {
    id: log.id,
    communityId: log.communityId,
    actorId: log.actorId,
    actorType: log.actorType,
    category: log.category,
    content: log.content,
    createdAt: log.createdAt,
  };
}

export async function postTeamSystemMessage(args: {
  communityId: string;
  content: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const chat = await ensureCommunityChatUnlocked(args.communityId);
  if (!chat || chat.status !== "OPEN") return null;

  return prisma.communityChatMessage.create({
    data: {
      chatId: chat.id,
      communityId: args.communityId,
      kind: "SYSTEM",
      content: args.content,
      metadata: args.metadata,
    },
  });
}

export async function notifyCommunityManagers(args: {
  communityId: string;
  eventType: InboxEventType;
  referenceId: string;
  payload: Prisma.InputJsonValue;
  signalKind?: AgentWorkKind;
  signalReason: string;
  urgency?: "normal" | "high";
  telegramText?: string;
}) {
  const managers = await prisma.communityMember.findMany({
    where: {
      communityId: args.communityId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
    include: {
      owner: { include: { agent: true } },
    },
  });

  await Promise.all(
    managers
      .map((member) => member.owner.agent)
      .filter((agent): agent is NonNullable<typeof agent> => !!agent)
      .map(async (agent) => {
        await createInboxEvent({
          ownerId: agent.ownerId,
          agentId: agent.id,
          type: args.eventType,
          referenceId: args.referenceId,
          payload: args.payload,
        });
        await signalAgentWork({
          agentId: agent.id,
          kind: args.signalKind ?? "TEAM_ACTIVITY",
          reason: args.signalReason,
          referenceId: args.referenceId,
          urgency: args.urgency ?? "normal",
        });
      })
  );

  if (args.telegramText) {
    sendTelegramNotification(args.telegramText).catch((error) =>
      console.error("[team-activity] Telegram notification failed:", error)
    );
  }
}

export async function logTeamActivity(input: LogTeamActivityInput) {
  if (!TEAM_ACTIVITY_CATEGORIES.includes(input.category)) {
    throw new TeamActivityError("Unsupported activity category", 400);
  }

  const community = await assertActiveCommunity(input.communityId);
  const actor = await resolveTeamActor(input.communityId, input.actorId, input.actorType);
  const prepared = normalizeContent(input.content, MAX_ACTIVITY_CONTENT_CHARS);

  const log = await prisma.teamActivityLog.create({
    data: {
      communityId: input.communityId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      category: input.category,
      content: prepared.content,
    },
  });

  await recordAnalyticsEvent({
    type: "TEAM_ACTIVITY_LOGGED",
    ownerId: actor.ownerId ?? null,
    agentId: actor.agentId ?? null,
    communityId: input.communityId,
    metadata: {
      category: input.category,
      actor_type: actor.actorType,
      redactions: prepared.redactions,
    },
  });

  if (input.category === "blocker") {
    const preview =
      prepared.content.length > 500 ? `${prepared.content.slice(0, 500)}...` : prepared.content;
    const payload = {
      community_id: input.communityId,
      community_name: community.name,
      activity_log_id: log.id,
      actor_id: actor.actorId,
      actor_type: actor.actorType,
      category: input.category,
      content_preview: preview,
      created_at: log.createdAt.toISOString(),
    };

    await notifyCommunityManagers({
      communityId: input.communityId,
      eventType: "TEAM_BLOCKER_LOGGED",
      referenceId: log.id,
      payload,
      signalKind: "TEAM_BLOCKER_LOGGED",
      signalReason: "A blocker was logged in the community activity ledger",
      urgency: "high",
      telegramText:
        `<b>Gennety blocker</b>\n` +
        `Community: ${escapeTelegramHtml(community.name)}\n` +
        `Actor: ${escapeTelegramHtml(actor.actorId)}\n` +
        `${escapeTelegramHtml(preview)}`,
    }).catch((error) => console.error("[team-activity] Manager notification failed:", error));

    await postTeamSystemMessage({
      communityId: input.communityId,
      content: `Blocker logged by ${actor.actorId}: ${preview}`,
      metadata: {
        kind: "team_blocker_logged",
        activity_log_id: log.id,
      },
    }).catch((error) => console.error("[team-activity] Chat notification failed:", error));
  }

  return {
    activity: serializeActivityLog(log),
    redactions: prepared.redactions,
  };
}

export const __test = {
  normalizeContent,
};
