import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertCommunityManager, CommunityPermissionError } from "@/lib/services/community-permissions";

function errorResponse(error: unknown) {
  if (error instanceof CommunityPermissionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[community:handshakes]", error);
  return NextResponse.json({ error: "Failed to load community handshakes" }, { status: 500 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthenticatedOwner();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await assertCommunityManager(auth.ownerId, id);
    const handshakes = await prisma.communityInviteHandshake.findMany({
      where: { communityId: id },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        inviteId: true,
        inviteeOwnerId: true,
        status: true,
        recommendedRole: true,
        recommendedTitle: true,
        recommendedSpecialization: true,
        recommendedSkillTags: true,
        confidence: true,
        candidateSummary: true,
        judgeSummary: true,
        failureReason: true,
        startedAt: true,
        completedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ handshakes });
  } catch (error) {
    return errorResponse(error);
  }
}
