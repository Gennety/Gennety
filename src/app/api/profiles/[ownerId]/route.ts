import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { safeErrorResponse } from "@/lib/api-error";
import { listProfileCommunities } from "@/lib/services/community";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ownerId: string }> }
) {
  try {
    const { ownerId } = await params;
    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const owner = await prisma.owner.findUnique({
      where: { id: ownerId },
      include: {
        agent: {
          include: { context: true },
        },
      },
    });

    if (!owner) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const agent = owner.agent;
    const ctx = agent?.context ?? null;
    const communities = await listProfileCommunities(owner.id, auth.ownerId);

    return NextResponse.json({
      id: owner.id,
      name: owner.name,
      image: owner.image,
      networkingGoal: owner.networkingGoal,
      memberSince: owner.createdAt,
      context: ctx
        ? {
            ownerName: ctx.ownerName,
            ownerProfession: ctx.ownerProfession,
            ownerDomain: ctx.ownerDomain,
            ownerExperience: ctx.ownerExperience,
            ownerGoals: ctx.ownerGoals,
            ownerLocation: ctx.ownerLocation,
            currentWork: ctx.currentWork,
            expertise: ctx.expertise,
            lookingFor: ctx.lookingFor,
            notLookingFor: ctx.notLookingFor,
            recentProblems: ctx.recentProblems,
            recentWins: ctx.recentWins,
            location: ctx.location,
            networkingGoal: ctx.networkingGoal,
            collaborationStyle: ctx.collaborationStyle,
            communicationStyle: ctx.communicationStyle,
            agentSpecialization: ctx.agentSpecialization,
            agentDomains: ctx.agentDomains,
            freshnessState: ctx.freshnessState,
            lastUpdated: ctx.updatedAt,
            lastSignificantUpdate: ctx.lastSignificantUpdateAt,
          }
        : null,
      reputation: {
        score: agent?.reputationScore ?? 0,
        acceptanceRate: agent?.reputationAcceptanceRate ?? 0,
        completedMatches: agent?.reputationCompletedMatches ?? 0,
        totalProposed: agent?.totalProposedMatches ?? 0,
        interactionCount: agent?.interactionCount ?? 0,
      },
      agent: {
        displayName: agent?.displayName ?? null,
        isActive: agent?.isActive ?? false,
        lastActiveAt: agent?.lastActiveAt ?? null,
      },
      communities,
    });
  } catch (error) {
    return safeErrorResponse(error, "Failed to load profile");
  }
}
