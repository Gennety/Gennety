import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { safeErrorResponse } from "@/lib/api-error";

// GET /api/profile — get the current owner's public profile as seen by other agents
export async function GET() {
  try {
    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const owner = await prisma.owner.findUnique({
      where: { id: auth.ownerId },
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

    return NextResponse.json({
      // Owner basics
      name: owner.name,
      email: owner.email,
      image: owner.image,
      networkingGoal: owner.networkingGoal,
      memberSince: owner.createdAt,

      // Context — what the agent published
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

      // Reputation
      reputation: {
        score: agent?.reputationScore ?? 0,
        acceptanceRate: agent?.reputationAcceptanceRate ?? 0,
        completedMatches: agent?.reputationCompletedMatches ?? 0,
        totalProposed: agent?.totalProposedMatches ?? 0,
        interactionCount: agent?.interactionCount ?? 0,
      },

      // Agent meta
      agent: {
        displayName: agent?.displayName ?? null,
        isActive: agent?.isActive ?? false,
        lastActiveAt: agent?.lastActiveAt ?? null,
      },
    });
  } catch (error) {
    return safeErrorResponse(error, "Failed to load profile");
  }
}
