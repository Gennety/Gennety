import { prisma } from "@/lib/db";
import { createInboxEvent } from "@/lib/services/inbox";
import { signalAgentWork } from "@/lib/services/agent-delivery";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";

const HANDSHAKE_TTL_MS = 48 * 60 * 60 * 1000;

export class CommunityHandshakeError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export interface ShareableAgentContext {
  ownerProfession?: string | null;
  ownerDomain?: string | null;
  agentSpecialization?: string | null;
  agentDomains?: string[] | null;
  currentWork?: string | null;
  expertise?: string[] | null;
  lookingFor?: string | null;
  collaborationStyle?: string | null;
  networkingGoal?: string | null;
}

export interface RoleMappingResult {
  recommendedRole: "MEMBER";
  recommendedTitle: string | null;
  recommendedSpecialization: string | null;
  recommendedSkillTags: string[];
  confidence: number;
  candidateSummary: string;
  judgeSummary: string;
}

function uniqueNormalized(items: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function mapCommunityRoleFromContext(context: ShareableAgentContext | null): RoleMappingResult {
  if (!context) {
    return {
      recommendedRole: "MEMBER",
      recommendedTitle: null,
      recommendedSpecialization: null,
      recommendedSkillTags: [],
      confidence: 0.15,
      candidateSummary: "Candidate has no published Gennety context available for pre-vetting.",
      judgeSummary: "Needs human review because role mapping has no shareable context.",
    };
  }

  const skillTags = uniqueNormalized([
    ...(context.expertise ?? []),
    ...(context.agentDomains ?? []),
    context.ownerDomain,
    context.networkingGoal,
  ]).slice(0, 12);

  const recommendedSpecialization =
    context.agentSpecialization ??
    context.ownerDomain ??
    context.expertise?.[0] ??
    context.ownerProfession ??
    null;

  const recommendedTitle =
    context.ownerProfession ??
    context.agentSpecialization ??
    (recommendedSpecialization ? `${recommendedSpecialization} contributor` : null);

  const summaryParts = [
    context.ownerProfession ? `Role: ${context.ownerProfession}` : null,
    context.currentWork ? `Current work: ${context.currentWork}` : null,
    context.lookingFor ? `Looking for: ${context.lookingFor}` : null,
    context.collaborationStyle ? `Collaboration style: ${context.collaborationStyle}` : null,
  ].filter(Boolean);

  const confidenceSignals = [
    context.currentWork,
    context.lookingFor,
    context.expertise?.length ? "expertise" : null,
    recommendedSpecialization,
    context.networkingGoal,
  ].filter(Boolean).length;
  const confidence = Math.min(0.9, 0.25 + confidenceSignals * 0.13);

  return {
    recommendedRole: "MEMBER",
    recommendedTitle,
    recommendedSpecialization,
    recommendedSkillTags: skillTags,
    confidence,
    candidateSummary:
      summaryParts.length > 0
        ? summaryParts.join("\n")
        : "Candidate has sparse shareable context but enough profile metadata for basic membership.",
    judgeSummary:
      "Server-side gatekeeper mapped only operational specialization. Authority role remains MEMBER unless a human admin approves a separate role proposal.",
  };
}

function serializeHandshake(handshake: {
  id: string;
  inviteId: string;
  communityId: string;
  status: string;
  recommendedRole: string | null;
  recommendedTitle: string | null;
  recommendedSpecialization: string | null;
  recommendedSkillTags: string[];
  confidence: number | null;
  candidateSummary: string | null;
  judgeSummary: string | null;
  expiresAt: Date;
}) {
  return {
    id: handshake.id,
    inviteId: handshake.inviteId,
    communityId: handshake.communityId,
    status: handshake.status,
    recommendedRole: handshake.recommendedRole,
    recommendedTitle: handshake.recommendedTitle,
    recommendedSpecialization: handshake.recommendedSpecialization,
    recommendedSkillTags: handshake.recommendedSkillTags,
    confidence: handshake.confidence,
    candidateSummary: handshake.candidateSummary,
    judgeSummary: handshake.judgeSummary,
    expiresAt: handshake.expiresAt,
  };
}

export async function startCommunityInviteHandshake(args: {
  inviteId: string;
  inviteeOwnerId: string;
}) {
  const invite = await prisma.communityInvite.findUnique({
    where: { id: args.inviteId },
    include: {
      handshake: true,
      community: {
        include: {
          owner: {
            include: {
              agent: true,
            },
          },
        },
      },
    },
  });

  if (!invite) throw new CommunityHandshakeError("Invite not found", 404);
  if (invite.status !== "PENDING") {
    throw new CommunityHandshakeError("Invite is not pending", 409);
  }

  if (invite.handshake && invite.handshake.expiresAt.getTime() > Date.now()) {
    return serializeHandshake(invite.handshake);
  }

  const invitee = await prisma.owner.findUnique({
    where: { id: args.inviteeOwnerId },
    include: {
      agent: {
        include: { context: true },
      },
    },
  });

  if (!invitee) throw new CommunityHandshakeError("Invitee account not found", 404);

  const roleMapping = mapCommunityRoleFromContext(invitee.agent?.context ?? null);
  const ownerAgent = invite.community.owner.agent;
  const inviteeAgent = invitee.agent;
  const ownerAgentUnavailable = !ownerAgent || !ownerAgent.isActive || ownerAgent.searchPaused;
  const status = !inviteeAgent?.context
    ? "NEEDS_HUMAN_REVIEW"
    : ownerAgentUnavailable
    ? "WAITING_OWNER_AGENT"
    : roleMapping.confidence >= 0.55
    ? "APPROVED"
    : "NEEDS_HUMAN_REVIEW";

  const handshake = await prisma.communityInviteHandshake.upsert({
    where: { inviteId: invite.id },
    create: {
      inviteId: invite.id,
      communityId: invite.communityId,
      inviteeOwnerId: args.inviteeOwnerId,
      inviteeAgentId: inviteeAgent?.id ?? null,
      ownerAgentId: ownerAgent?.id ?? null,
      status,
      recommendedRole: roleMapping.recommendedRole,
      recommendedTitle: roleMapping.recommendedTitle,
      recommendedSpecialization: roleMapping.recommendedSpecialization,
      recommendedSkillTags: roleMapping.recommendedSkillTags,
      confidence: roleMapping.confidence,
      candidateSummary: roleMapping.candidateSummary,
      judgeSummary: roleMapping.judgeSummary,
      startedAt: new Date(),
      completedAt: status === "APPROVED" || status === "NEEDS_HUMAN_REVIEW" ? new Date() : null,
      expiresAt: new Date(Date.now() + HANDSHAKE_TTL_MS),
    },
    update: {
      inviteeAgentId: inviteeAgent?.id ?? null,
      ownerAgentId: ownerAgent?.id ?? null,
      status,
      recommendedRole: roleMapping.recommendedRole,
      recommendedTitle: roleMapping.recommendedTitle,
      recommendedSpecialization: roleMapping.recommendedSpecialization,
      recommendedSkillTags: roleMapping.recommendedSkillTags,
      confidence: roleMapping.confidence,
      candidateSummary: roleMapping.candidateSummary,
      judgeSummary: roleMapping.judgeSummary,
      startedAt: new Date(),
      completedAt: status === "APPROVED" || status === "NEEDS_HUMAN_REVIEW" ? new Date() : null,
      expiresAt: new Date(Date.now() + HANDSHAKE_TTL_MS),
      failureReason: null,
    },
  });

  await recordAnalyticsEvent({
    type: "COMMUNITY_HANDSHAKE_STARTED",
    ownerId: args.inviteeOwnerId,
    agentId: inviteeAgent?.id ?? null,
    communityId: invite.communityId,
    metadata: {
      invite_id: invite.id,
      handshake_id: handshake.id,
      status,
      confidence: roleMapping.confidence,
    },
  });

  if (ownerAgent) {
    await createInboxEvent({
      ownerId: invite.community.ownerId,
      agentId: ownerAgent.id,
      type: "COMMUNITY_HANDSHAKE_REQUESTED",
      referenceId: handshake.id,
      payload: {
        community_id: invite.communityId,
        community_name: invite.community.name,
        invite_id: invite.id,
        handshake_id: handshake.id,
        status,
        candidate_summary: roleMapping.candidateSummary,
        recommended_role: roleMapping.recommendedRole,
        recommended_title: roleMapping.recommendedTitle,
        recommended_specialization: roleMapping.recommendedSpecialization,
        recommended_skill_tags: roleMapping.recommendedSkillTags,
        confidence: roleMapping.confidence,
      },
    }).catch((error) => console.error("[community-handshake] Owner inbox failed:", error));

    signalAgentWork({
      agentId: ownerAgent.id,
      kind: "COMMUNITY_HANDSHAKE_REQUESTED",
      reason: "Community invite needs gatekeeper review",
      referenceId: handshake.id,
      urgency: status === "APPROVED" ? "normal" : "high",
    }).catch((error) => console.error("[community-handshake] Owner signal failed:", error));
  }

  if (inviteeAgent) {
    await createInboxEvent({
      ownerId: args.inviteeOwnerId,
      agentId: inviteeAgent.id,
      type: "COMMUNITY_HANDSHAKE_STARTED",
      referenceId: handshake.id,
      payload: {
        community_id: invite.communityId,
        community_name: invite.community.name,
        handshake_id: handshake.id,
        status,
        recommended_role: roleMapping.recommendedRole,
        recommended_title: roleMapping.recommendedTitle,
        recommended_specialization: roleMapping.recommendedSpecialization,
      },
    }).catch((error) => console.error("[community-handshake] Invitee inbox failed:", error));
  }

  return serializeHandshake(handshake);
}

export async function finalizeApprovedCommunityInviteHandshake(handshakeId: string) {
  return prisma.$transaction(async (tx) => {
    const handshake = await tx.communityInviteHandshake.findUnique({
      where: { id: handshakeId },
      include: {
        invite: {
          include: {
            community: true,
          },
        },
      },
    });

    if (!handshake) throw new CommunityHandshakeError("Handshake not found", 404);
    if (handshake.status !== "APPROVED") {
      throw new CommunityHandshakeError("Handshake is not approved", 409);
    }
    if (handshake.expiresAt.getTime() < Date.now()) {
      await tx.communityInviteHandshake.update({
        where: { id: handshake.id },
        data: { status: "EXPIRED" },
      });
      throw new CommunityHandshakeError("Handshake expired", 410);
    }

    await tx.communityMember.upsert({
      where: {
        communityId_ownerId: {
          communityId: handshake.communityId,
          ownerId: handshake.inviteeOwnerId,
        },
      },
      create: {
        communityId: handshake.communityId,
        ownerId: handshake.inviteeOwnerId,
        role: handshake.recommendedRole ?? "MEMBER",
        status: "ACTIVE",
        showOnProfile: true,
        hubTitle: handshake.recommendedTitle,
        hubSpecialization: handshake.recommendedSpecialization,
        skillTags: handshake.recommendedSkillTags,
        roleMappingConfidence: handshake.confidence,
        lastRoleMappedAt: new Date(),
      },
      update: {
        status: "ACTIVE",
        hubTitle: handshake.recommendedTitle,
        hubSpecialization: handshake.recommendedSpecialization,
        skillTags: handshake.recommendedSkillTags,
        roleMappingConfidence: handshake.confidence,
        lastRoleMappedAt: new Date(),
      },
    });

    await tx.communityInvite.update({
      where: { id: handshake.inviteId },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        inviteeOwnerId: handshake.inviteeOwnerId,
      },
    });

    await tx.communityInviteHandshake.update({
      where: { id: handshake.id },
      data: {
        completedAt: new Date(),
      },
    });

    return {
      communityId: handshake.communityId,
      communitySlug: handshake.invite.community.slug,
      communityName: handshake.invite.community.name,
      handshakeId: handshake.id,
    };
  });
}

async function assertCommunityManager(ownerId: string, communityId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId, ownerId } },
    select: { role: true, status: true },
  });

  if (!membership || membership.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(membership.role)) {
    throw new CommunityHandshakeError("Only community owners and admins can do this", 403);
  }
}

export async function approveCommunityInviteHandshake(handshakeId: string, approverOwnerId: string) {
  const handshake = await prisma.communityInviteHandshake.findUnique({
    where: { id: handshakeId },
    select: {
      id: true,
      communityId: true,
      status: true,
      inviteeOwnerId: true,
      inviteeAgentId: true,
    },
  });
  if (!handshake) throw new CommunityHandshakeError("Handshake not found", 404);
  await assertCommunityManager(approverOwnerId, handshake.communityId);

  if (handshake.status !== "APPROVED") {
    await prisma.communityInviteHandshake.update({
      where: { id: handshake.id },
      data: {
        status: "APPROVED",
        completedAt: new Date(),
      },
    });
  }

  const result = await finalizeApprovedCommunityInviteHandshake(handshake.id);

  if (handshake.inviteeAgentId) {
    await createInboxEvent({
      ownerId: handshake.inviteeOwnerId,
      agentId: handshake.inviteeAgentId,
      type: "COMMUNITY_HANDSHAKE_COMPLETED",
      referenceId: handshake.id,
      payload: {
        community_id: result.communityId,
        community_name: result.communityName,
        handshake_id: handshake.id,
        status: "APPROVED",
      },
    }).catch((error) => console.error("[community-handshake] Invitee approval inbox failed:", error));
  }

  await recordAnalyticsEvent({
    type: "COMMUNITY_HANDSHAKE_APPROVED",
    ownerId: approverOwnerId,
    communityId: result.communityId,
    metadata: {
      handshake_id: handshake.id,
    },
  });
  return result;
}

export async function rejectCommunityInviteHandshake(
  handshakeId: string,
  rejectorOwnerId: string,
  reason?: string | null
) {
  const handshake = await prisma.communityInviteHandshake.findUnique({
    where: { id: handshakeId },
    select: {
      id: true,
      inviteId: true,
      communityId: true,
      status: true,
      inviteeOwnerId: true,
      inviteeAgentId: true,
      community: { select: { name: true } },
    },
  });
  if (!handshake) throw new CommunityHandshakeError("Handshake not found", 404);
  await assertCommunityManager(rejectorOwnerId, handshake.communityId);

  if (handshake.status === "APPROVED") {
    throw new CommunityHandshakeError("Approved handshakes cannot be rejected", 409);
  }
  if (handshake.status === "REJECTED") {
    return { handshakeId: handshake.id, communityId: handshake.communityId, status: "REJECTED" as const };
  }

  await prisma.$transaction(async (tx) => {
    await tx.communityInviteHandshake.update({
      where: { id: handshake.id },
      data: {
        status: "REJECTED",
        completedAt: new Date(),
        failureReason: reason ?? "Rejected by community manager",
      },
    });

    await tx.communityInvite.update({
      where: { id: handshake.inviteId },
      data: { status: "REVOKED" },
    });
  });

  if (handshake.inviteeAgentId) {
    await createInboxEvent({
      ownerId: handshake.inviteeOwnerId,
      agentId: handshake.inviteeAgentId,
      type: "COMMUNITY_HANDSHAKE_COMPLETED",
      referenceId: handshake.id,
      payload: {
        community_id: handshake.communityId,
        community_name: handshake.community.name,
        handshake_id: handshake.id,
        status: "REJECTED",
        reason: reason ?? null,
      },
    }).catch((error) => console.error("[community-handshake] Invitee rejection inbox failed:", error));
  }

  await recordAnalyticsEvent({
    type: "COMMUNITY_HANDSHAKE_REJECTED",
    ownerId: rejectorOwnerId,
    communityId: handshake.communityId,
    metadata: {
      handshake_id: handshake.id,
      reason: reason ?? null,
    },
  });

  return { handshakeId: handshake.id, communityId: handshake.communityId, status: "REJECTED" as const };
}
