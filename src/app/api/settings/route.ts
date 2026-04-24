import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { safeErrorResponse } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import { SettingsUpdateSchema } from "@/types/settings";
import { ZodError } from "zod";

// GET /api/settings — load current settings for the authenticated owner
export async function GET() {
  try {
    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const owner = await prisma.owner.findUnique({
      where: { id: auth.ownerId },
      include: {
        agent: true,
        accounts: { select: { provider: true } },
      },
    });

    if (!owner) {
      return NextResponse.json({ error: "Owner not found" }, { status: 404 });
    }

    return NextResponse.json({
      // P0
      agentActive: owner.agent?.isActive ?? false,
      excludedTopics: owner.excludedTopics,
      researchConsent: owner.researchConsent,
      hasPassword: !!owner.passwordHash,
      hasGoogleAccount: owner.accounts.some((a) => a.provider === "google"),

      // P1
      networkingGoal: owner.networkingGoal,
      notifyAllEmails: owner.notifyAllEmails,
      notifyMatchProposals: owner.notifyMatchProposals,
      notifyNewMessages: owner.notifyNewMessages,
      notifyFreshness: owner.notifyFreshness,
      agentId: owner.agent?.agentId ?? null,
      agentPlatform: owner.agentPlatform,
      webhookUrl: owner.agent?.webhookUrl ?? "",
      webhookTokenSet: !!owner.agent?.webhookToken,
    });
  } catch (error) {
    return safeErrorResponse(error, "Failed to load settings");
  }
}

// PATCH /api/settings — update one or more settings
export async function PATCH(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, {
      maxRequests: 10,
      windowMs: 60_000,
      keyPrefix: "settings",
    });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    let validated;
    try {
      validated = SettingsUpdateSchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        const firstError = e.issues[0]?.message ?? "Invalid input";
        return NextResponse.json({ error: firstError }, { status: 400 });
      }
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Build Owner update
    const ownerUpdate: Record<string, unknown> = {};
    if (validated.excludedTopics !== undefined) ownerUpdate.excludedTopics = validated.excludedTopics;
    if (validated.networkingGoal !== undefined) ownerUpdate.networkingGoal = validated.networkingGoal;
    if (validated.notifyAllEmails !== undefined) ownerUpdate.notifyAllEmails = validated.notifyAllEmails;
    if (validated.notifyMatchProposals !== undefined) ownerUpdate.notifyMatchProposals = validated.notifyMatchProposals;
    if (validated.notifyNewMessages !== undefined) ownerUpdate.notifyNewMessages = validated.notifyNewMessages;
    if (validated.notifyFreshness !== undefined) ownerUpdate.notifyFreshness = validated.notifyFreshness;

    // Research consent — also write ConsentLog
    if (validated.researchConsent !== undefined) {
      ownerUpdate.researchConsent = validated.researchConsent;

      if (validated.researchConsent) {
        // Grant consent
        await prisma.consentLog.create({
          data: { ownerId: auth.ownerId, purpose: "B" },
        });
      } else {
        // Withdraw — mark latest active purpose B log as withdrawn
        const latestB = await prisma.consentLog.findFirst({
          where: { ownerId: auth.ownerId, purpose: "B", withdrawnAt: null },
          orderBy: { consentedAt: "desc" },
        });
        if (latestB) {
          await prisma.consentLog.update({
            where: { id: latestB.id },
            data: { withdrawnAt: new Date() },
          });
        }
      }
    }

    // Update Owner fields
    if (Object.keys(ownerUpdate).length > 0) {
      await prisma.owner.update({
        where: { id: auth.ownerId },
        data: ownerUpdate,
      });
    }

    // Agent-scoped updates (active toggle, webhook)
    const wantsAgentUpdate =
      validated.agentActive !== undefined ||
      validated.webhookUrl !== undefined ||
      validated.webhookToken !== undefined;

    if (wantsAgentUpdate) {
      const agent = await prisma.agent.findUnique({
        where: { ownerId: auth.ownerId },
      });

      if (agent) {
        const agentUpdate: Record<string, unknown> = {};
        if (validated.agentActive !== undefined) agentUpdate.isActive = validated.agentActive;
        if (validated.webhookUrl !== undefined) {
          agentUpdate.webhookUrl = validated.webhookUrl === "" ? null : validated.webhookUrl;
        }
        if (validated.webhookToken !== undefined) {
          agentUpdate.webhookToken = validated.webhookToken === "" ? null : validated.webhookToken;
        }

        if (Object.keys(agentUpdate).length > 0) {
          await prisma.agent.update({
            where: { id: agent.id },
            data: agentUpdate,
          });
        }

        // Pause/resume beacons only on active-toggle
        if (validated.agentActive === false) {
          await prisma.beacon.updateMany({
            where: { agentId: agent.id, isActive: true },
            data: { isActive: false, preservable: true },
          });
        } else if (validated.agentActive === true) {
          await prisma.beacon.updateMany({
            where: { agentId: agent.id, isActive: false, preservable: true },
            data: { isActive: true },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return safeErrorResponse(error, "Failed to update settings");
  }
}
