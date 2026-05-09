import { prisma } from "@/lib/db";

export class CommunityPermissionError extends Error {
  constructor(
    message: string,
    public readonly status = 403
  ) {
    super(message);
  }
}

export async function assertCommunityManager(ownerId: string, communityId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId, ownerId } },
    select: { role: true, status: true },
  });

  if (!membership || membership.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(membership.role)) {
    throw new CommunityPermissionError("Only community owners and admins can do this", 403);
  }

  return membership;
}

export async function assertCommunityMember(ownerId: string, communityId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_ownerId: { communityId, ownerId } },
    select: { role: true, status: true },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new CommunityPermissionError("Only community members can do this", 403);
  }

  return membership;
}

