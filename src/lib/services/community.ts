import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type {
  CommunityCategory,
  CommunityInviteInput,
  CommunityProfileVisibilityInput,
  CommunitySpecialization,
  CreateCommunityInput,
  UpdateCommunityInput,
} from "@/types/community";
import { COMMUNITY_SPECIALIZATIONS_BY_CATEGORY } from "@/types/community";
import {
  finalizeApprovedCommunityInviteHandshake,
  startCommunityInviteHandshake,
} from "@/lib/services/community-handshake";

export class CommunityError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

type CommunityWithRelations = Awaited<ReturnType<typeof getCommunityRecord>>;
type ViewerMembership = {
  communityId?: string;
  ownerId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  showOnProfile: boolean;
} | null;

const MAX_OWNED_COMMUNITIES = 3;
const MAX_PENDING_INVITES_PER_COMMUNITY = 50;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildSlugBase(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "community";
}

async function generateUniqueSlug(name: string) {
  const base = buildSlugBase(name);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.community.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
  }

  return `${base}-${randomBytes(3).toString("hex")}`;
}

function assertCategoryPair(input: {
  visibility?: string | null;
  category?: CommunityCategory | null;
  specialization?: CommunitySpecialization | null;
}) {
  if (input.visibility === "PUBLIC" && (!input.category || !input.specialization)) {
    throw new CommunityError("Public communities require category and specialization");
  }

  if (input.category && input.specialization) {
    const allowed = COMMUNITY_SPECIALIZATIONS_BY_CATEGORY[input.category];
    if (!allowed.includes(input.specialization)) {
      throw new CommunityError("Specialization does not belong to the selected category");
    }
  }
}

async function getCommunityRecord(idOrSlug: string) {
  return prisma.community.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      members: {
        where: { status: "ACTIVE" },
        select: {
          ownerId: true,
          role: true,
          showOnProfile: true,
          owner: { select: { id: true, name: true, image: true } },
        },
        orderBy: { joinedAt: "asc" },
        take: 12,
      },
      _count: {
        select: {
          members: { where: { status: "ACTIVE" } },
        },
      },
    },
  });
}

function serializeCommunity(
  community: NonNullable<CommunityWithRelations>,
  viewerOwnerId?: string | null,
  explicitViewerMembership?: ViewerMembership
) {
  const viewerMembership = explicitViewerMembership ?? (viewerOwnerId
    ? community.members.find((member) => member.ownerId === viewerOwnerId)
    : null);
  const canManage = !!viewerMembership && ["OWNER", "ADMIN"].includes(viewerMembership.role);
  const isOwner = community.ownerId === viewerOwnerId;

  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    description: community.description,
    visibility: community.visibility,
    profileVisibility: community.profileVisibility,
    category: community.category,
    specialization: community.specialization,
    status: community.status,
    ssotEnabled: community.ssotEnabled,
    knowledgeSummary: community.knowledgeSummary,
    strategyEnabled: community.strategyEnabled,
    strategyIntervalHours: community.strategyIntervalHours,
    lastStrategySessionAt: community.lastStrategySessionAt,
    nextStrategySessionAt: community.nextStrategySessionAt,
    strategyTokenLimit: community.strategyTokenLimit,
    monthlyTokenLimit: community.monthlyTokenLimit,
    judgeIterationLimit: community.judgeIterationLimit,
    createdAt: community.createdAt,
    updatedAt: community.updatedAt,
    owner: community.owner,
    memberCount: community._count.members,
    members: community.members.map((member) => ({
      ownerId: member.ownerId,
      role: member.role,
      showOnProfile: member.showOnProfile,
      name: member.owner.name,
      image: member.owner.image,
    })),
    viewer: {
      isMember: !!viewerMembership,
      role: viewerMembership?.role ?? null,
      canManage,
      isOwner,
      showOnProfile: viewerMembership?.showOnProfile ?? false,
    },
  };
}

export async function listPublicCommunities(input: {
  category?: CommunityCategory | null;
  specialization?: CommunitySpecialization | null;
  viewerOwnerId?: string | null;
}) {
  const communities = await prisma.community.findMany({
    where: {
      visibility: "PUBLIC",
      status: "ACTIVE",
      ...(input.category ? { category: input.category } : {}),
      ...(input.specialization ? { specialization: input.specialization } : {}),
    },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      members: {
        where: { status: "ACTIVE" },
        select: {
          ownerId: true,
          role: true,
          showOnProfile: true,
          owner: { select: { id: true, name: true, image: true } },
        },
        orderBy: { joinedAt: "asc" },
        take: 12,
      },
      _count: {
        select: {
          members: { where: { status: "ACTIVE" } },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 60,
  });

  const viewerMemberships =
    input.viewerOwnerId && communities.length > 0
      ? await prisma.communityMember.findMany({
          where: {
            ownerId: input.viewerOwnerId,
            status: "ACTIVE",
            communityId: { in: communities.map((community) => community.id) },
          },
          select: {
            communityId: true,
            ownerId: true,
            role: true,
            showOnProfile: true,
          },
        })
      : [];
  const viewerMembershipByCommunityId = new Map(
    viewerMemberships.map((membership) => [membership.communityId, membership])
  );

  return communities.map((community) =>
    serializeCommunity(
      community,
      input.viewerOwnerId,
      viewerMembershipByCommunityId.get(community.id) ?? null
    )
  );
}

export async function listMyCommunities(ownerId: string) {
  const memberships = await prisma.communityMember.findMany({
    where: { ownerId, status: "ACTIVE" },
    include: {
      community: {
        include: {
          owner: { select: { id: true, name: true, image: true } },
          members: {
            where: { status: "ACTIVE" },
            select: {
              ownerId: true,
              role: true,
              showOnProfile: true,
              owner: { select: { id: true, name: true, image: true } },
            },
            orderBy: { joinedAt: "asc" },
            take: 12,
          },
          _count: {
            select: {
              members: { where: { status: "ACTIVE" } },
            },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return memberships.map((membership) =>
    serializeCommunity(membership.community, ownerId, {
      communityId: membership.communityId,
      ownerId: membership.ownerId,
      role: membership.role,
      showOnProfile: membership.showOnProfile,
    })
  );
}

export async function listProfileCommunities(ownerId: string, viewerOwnerId?: string | null) {
  const memberships = await prisma.communityMember.findMany({
    where: {
      ownerId,
      status: "ACTIVE",
      showOnProfile: true,
      community: {
        status: "ACTIVE",
        profileVisibility: "VISIBLE",
      },
    },
    include: {
      community: {
        include: {
          owner: { select: { id: true, name: true, image: true } },
          members: {
            where: { status: "ACTIVE" },
            select: {
              ownerId: true,
              role: true,
              showOnProfile: true,
              owner: { select: { id: true, name: true, image: true } },
            },
            orderBy: { joinedAt: "asc" },
            take: 12,
          },
          _count: {
            select: {
              members: { where: { status: "ACTIVE" } },
            },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const viewerMemberships =
    viewerOwnerId && memberships.length > 0
      ? await prisma.communityMember.findMany({
          where: {
            ownerId: viewerOwnerId,
            status: "ACTIVE",
            communityId: { in: memberships.map((membership) => membership.communityId) },
          },
          select: {
            communityId: true,
            ownerId: true,
            role: true,
            showOnProfile: true,
          },
        })
      : [];
  const viewerMembershipByCommunityId = new Map(
    viewerMemberships.map((membership) => [membership.communityId, membership])
  );

  return memberships.map((membership) =>
    serializeCommunity(
      membership.community,
      viewerOwnerId,
      viewerMembershipByCommunityId.get(membership.communityId) ?? null
    )
  );
}

export async function getCommunityBySlug(slug: string, viewerOwnerId?: string | null) {
  const community = await getCommunityRecord(slug);
  if (!community || community.status !== "ACTIVE") {
    throw new CommunityError("Community not found", 404);
  }

  const viewerMembership = viewerOwnerId
    ? await prisma.communityMember.findUnique({
        where: { communityId_ownerId: { communityId: community.id, ownerId: viewerOwnerId } },
        select: {
          communityId: true,
          ownerId: true,
          role: true,
          status: true,
          showOnProfile: true,
        },
      })
    : null;
  const activeViewerMembership =
    viewerMembership?.status === "ACTIVE"
      ? {
          communityId: viewerMembership.communityId,
          ownerId: viewerMembership.ownerId,
          role: viewerMembership.role,
          showOnProfile: viewerMembership.showOnProfile,
        }
      : null;
  const isMember = !!activeViewerMembership;
  if (community.visibility === "PRIVATE" && !isMember) {
    throw new CommunityError("Community is private", 403);
  }

  return serializeCommunity(community, viewerOwnerId, activeViewerMembership);
}

export async function createCommunity(ownerId: string, input: CreateCommunityInput) {
  assertCategoryPair(input);

  const ownedCount = await prisma.community.count({
    where: { ownerId, status: "ACTIVE" },
  });
  if (ownedCount >= MAX_OWNED_COMMUNITIES) {
    throw new CommunityError(`You can own up to ${MAX_OWNED_COMMUNITIES} active communities`, 403);
  }

  const slug = await generateUniqueSlug(input.name);

  const community = await prisma.$transaction(async (tx) => {
    const created = await tx.community.create({
      data: {
        ownerId,
        slug,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        profileVisibility: input.profileVisibility,
        category: input.category ?? null,
        specialization: input.specialization ?? null,
      },
    });

    await tx.communityMember.create({
      data: {
        communityId: created.id,
        ownerId,
        role: "OWNER",
        status: "ACTIVE",
        showOnProfile: true,
      },
    });

    return created;
  });

  return getCommunityBySlug(community.slug, ownerId);
}

async function assertCommunityManager(ownerId: string, communityId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId, ownerId } },
    select: { role: true, status: true },
  });

  if (!membership || membership.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(membership.role)) {
    throw new CommunityError("Only community owners and admins can do this", 403);
  }
}

export async function updateCommunity(ownerId: string, communityId: string, input: UpdateCommunityInput) {
  const current = await prisma.community.findUnique({ where: { id: communityId } });
  if (!current) throw new CommunityError("Community not found", 404);

  await assertCommunityManager(ownerId, communityId);

  const next = {
    visibility: input.visibility ?? current.visibility,
    category: input.category === undefined ? current.category : input.category,
    specialization: input.specialization === undefined ? current.specialization : input.specialization,
  };
  assertCategoryPair(next);

  const updated = await prisma.community.update({
    where: { id: communityId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.profileVisibility !== undefined ? { profileVisibility: input.profileVisibility } : {}),
      ...(input.category !== undefined ? { category: input.category ?? null } : {}),
      ...(input.specialization !== undefined ? { specialization: input.specialization ?? null } : {}),
      ...(input.ssotEnabled !== undefined ? { ssotEnabled: input.ssotEnabled } : {}),
      ...(input.strategyEnabled !== undefined
        ? {
            strategyEnabled: input.strategyEnabled,
            nextStrategySessionAt:
              input.strategyEnabled && !current.nextStrategySessionAt
                ? new Date()
                : current.nextStrategySessionAt,
          }
        : {}),
      ...(input.strategyIntervalHours !== undefined
        ? { strategyIntervalHours: input.strategyIntervalHours }
        : {}),
      ...(input.strategyTokenLimit !== undefined ? { strategyTokenLimit: input.strategyTokenLimit } : {}),
      ...(input.monthlyTokenLimit !== undefined ? { monthlyTokenLimit: input.monthlyTokenLimit } : {}),
      ...(input.judgeIterationLimit !== undefined ? { judgeIterationLimit: input.judgeIterationLimit } : {}),
    },
  });

  return getCommunityBySlug(updated.slug, ownerId);
}

export async function joinPublicCommunity(ownerId: string, communityId: string) {
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community || community.status !== "ACTIVE") {
    throw new CommunityError("Community not found", 404);
  }
  if (community.visibility !== "PUBLIC") {
    throw new CommunityError("Private communities require a direct invitation", 403);
  }

  const existingMembership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId, ownerId } },
    select: { status: true },
  });
  if (existingMembership?.status === "BANNED") {
    throw new CommunityError("You cannot join this community", 403);
  }

  await prisma.communityMember.upsert({
    where: { communityId_ownerId: { communityId, ownerId } },
    create: { communityId, ownerId, role: "MEMBER", status: "ACTIVE", showOnProfile: true },
    update: { status: "ACTIVE" },
  });

  return getCommunityBySlug(community.slug, ownerId);
}

export async function leaveCommunity(ownerId: string, communityId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId, ownerId } },
    include: { community: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    throw new CommunityError("Membership not found", 404);
  }
  if (membership.role === "OWNER") {
    throw new CommunityError("Community owner cannot leave before transferring ownership", 403);
  }

  await prisma.communityMember.update({
    where: { id: membership.id },
    data: { status: "REMOVED" },
  });

  return { ok: true };
}

export async function createCommunityInvite(
  inviterOwnerId: string,
  communityId: string,
  input: CommunityInviteInput
) {
  await assertCommunityManager(inviterOwnerId, communityId);

  const pendingCount = await prisma.communityInvite.count({
    where: { communityId, status: "PENDING" },
  });
  if (pendingCount >= MAX_PENDING_INVITES_PER_COMMUNITY) {
    throw new CommunityError("This community has too many pending invites", 429);
  }

  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const inviteeEmail = normalizeEmail(input.inviteeEmail);
  let inviteeOwnerId = input.inviteeOwnerId ?? null;

  if (inviteeOwnerId) {
    const invitee = await prisma.owner.findUnique({
      where: { id: inviteeOwnerId },
      select: { id: true },
    });
    if (!invitee) {
      throw new CommunityError("Invitee account not found", 404);
    }
  } else if (inviteeEmail) {
    const invitee = await prisma.owner.findUnique({
      where: { email: inviteeEmail },
      select: { id: true },
    });
    inviteeOwnerId = invitee?.id ?? null;
  }

  if (inviteeOwnerId) {
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_ownerId: { communityId, ownerId: inviteeOwnerId } },
      select: { status: true },
    });
    if (membership?.status === "ACTIVE") {
      throw new CommunityError("Invitee is already a member", 409);
    }
    if (membership?.status === "BANNED") {
      throw new CommunityError("Invitee cannot join this community", 403);
    }
  }

  const duplicateInviteClauses = [
    inviteeOwnerId ? { inviteeOwnerId } : null,
    inviteeEmail ? { inviteeEmail } : null,
  ].filter(Boolean) as Array<{ inviteeOwnerId: string } | { inviteeEmail: string }>;

  if (duplicateInviteClauses.length > 0) {
    const existingInvite = await prisma.communityInvite.findFirst({
      where: {
        communityId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
        OR: duplicateInviteClauses,
      },
      select: { id: true },
    });
    if (existingInvite) {
      throw new CommunityError("A pending invite already exists", 409);
    }
  }

  const invite = await prisma.communityInvite.create({
    data: {
      communityId,
      inviterOwnerId,
      inviteeOwnerId,
      inviteeEmail,
      tokenHash,
      status: "PENDING",
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    include: {
      community: { select: { id: true, slug: true, name: true, visibility: true } },
      inviterOwner: { select: { name: true } },
    },
  });

  return {
    invite: {
      id: invite.id,
      communityId: invite.communityId,
      communityName: invite.community.name,
      inviteeOwnerId: invite.inviteeOwnerId,
      inviteeEmail: invite.inviteeEmail,
      status: invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      inviterName: invite.inviterOwner.name,
    },
    token,
  };
}

export async function acceptCommunityInvite(ownerId: string, ownerEmail: string, token: string) {
  const invite = await prisma.communityInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { community: true },
  });

  if (!invite || invite.status !== "PENDING") {
    throw new CommunityError("Invite not found", 404);
  }

  if (invite.community.status !== "ACTIVE") {
    throw new CommunityError("Community not found", 404);
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.communityInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    throw new CommunityError("Invite expired", 410);
  }

  if (invite.inviteeOwnerId && invite.inviteeOwnerId !== ownerId) {
    throw new CommunityError("This invite belongs to another account", 403);
  }

  const normalizedOwnerEmail = normalizeEmail(ownerEmail);
  if (invite.inviteeEmail && invite.inviteeEmail !== normalizedOwnerEmail) {
    throw new CommunityError("This invite belongs to another email", 403);
  }

  const existingMembership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId: invite.communityId, ownerId } },
    select: { status: true },
  });
  if (existingMembership?.status === "BANNED") {
    throw new CommunityError("You cannot join this community", 403);
  }

  const handshake = await startCommunityInviteHandshake({
    inviteId: invite.id,
    inviteeOwnerId: ownerId,
  });

  if (handshake.status === "APPROVED") {
    const finalized = await finalizeApprovedCommunityInviteHandshake(handshake.id);
    return {
      status: "ACCEPTED" as const,
      community: await getCommunityBySlug(finalized.communitySlug, ownerId),
      handshake,
    };
  }

  return {
    status: "VETTING" as const,
    community: {
      id: invite.community.id,
      slug: invite.community.slug,
      name: invite.community.name,
    },
    handshake,
  };
}

export async function setCommunityProfileVisibility(
  ownerId: string,
  communityId: string,
  input: CommunityProfileVisibilityInput
) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId, ownerId } },
    include: { community: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    throw new CommunityError("Membership not found", 404);
  }

  if (input.profileVisibility !== undefined) {
    if (membership.role !== "OWNER") {
      throw new CommunityError("Only the owner can change community profile visibility", 403);
    }
    await prisma.community.update({
      where: { id: communityId },
      data: { profileVisibility: input.profileVisibility },
    });
  }

  if (input.showOnProfile !== undefined) {
    await prisma.communityMember.update({
      where: { id: membership.id },
      data: { showOnProfile: input.showOnProfile },
    });
  }

  return getCommunityBySlug(membership.community.slug, ownerId);
}
