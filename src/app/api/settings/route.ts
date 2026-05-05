import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { safeErrorResponse } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import { getPrivacySyncStatus, syncPrivacyTopicsForAgent } from "@/lib/services/privacy-sync";
import { syncNetworkingGoalForAgent } from "@/lib/services/networking-goal-sync";
import { setAgentSearchPaused } from "@/lib/services/agent-search";
import { SettingsUpdateSchema } from "@/types/settings";
import { getWakeWebhookUrlError } from "@/lib/wake-webhook";
import { getWakeStreamConnectionCount, hasLiveWakeStream } from "@/lib/services/agent-wake-stream";
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

    const privacySync = owner.agent ? await getPrivacySyncStatus(owner.agent.id) : null;
    const wakeStreamConnected = owner.agent ? hasLiveWakeStream(owner.agent.id) : false;
    const wakeStreamConnectionCount = owner.agent ? getWakeStreamConnectionCount(owner.agent.id) : 0;
    const wakeDeliveryMode = wakeStreamConnected
      ? "stream"
      : owner.agent?.wakeWebhookEnabled
      ? "webhook"
      : "polling";

    return NextResponse.json({
      // P0
      agentActive: owner.agent ? owner.agent.isActive && !owner.agent.searchPaused : false,
      excludedTopics: owner.excludedTopics,
      researchConsent: owner.researchConsent,
      hasPassword: !!owner.passwordHash,
      hasGoogleAccount: owner.accounts.some((a) => a.provider === "google"),

      // P1
      networkingGoal: owner.networkingGoal,
      agentId: owner.agent?.agentId ?? null,
      agentPlatform: owner.agentPlatform,
      wakeWebhookEnabled: owner.agent?.wakeWebhookEnabled ?? false,
      webhookUrl: owner.agent?.webhookUrl ?? "",
      webhookTokenSet: !!owner.agent?.webhookToken,
      wakeWebhookLastPingAt: owner.agent?.wakeWebhookLastPingAt ?? null,
      wakeWebhookLastPingOk: owner.agent?.wakeWebhookLastPingOk ?? null,
      wakeWebhookLastPingError: owner.agent?.wakeWebhookLastPingError ?? null,
      wakeStreamConnected,
      wakeStreamConnectionCount,
      wakeStreamLastConnectedAt: owner.agent?.wakeStreamLastConnectedAt ?? null,
      wakeStreamLastSeenAt: owner.agent?.wakeStreamLastSeenAt ?? null,
      wakeStreamLastDisconnectedAt: owner.agent?.wakeStreamLastDisconnectedAt ?? null,
      wakeStreamLastError: owner.agent?.wakeStreamLastError ?? null,
      wakeDeliveryMode,
      privacySync,
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

    const previousOwner =
      validated.excludedTopics !== undefined || validated.networkingGoal !== undefined
        ? await prisma.owner.findUnique({
            where: { id: auth.ownerId },
            select: { excludedTopics: true, networkingGoal: true },
          })
        : null;

    // Build Owner update
    const ownerUpdate: Record<string, unknown> = {};
    if (validated.excludedTopics !== undefined) ownerUpdate.excludedTopics = validated.excludedTopics;
    if (validated.networkingGoal !== undefined) ownerUpdate.networkingGoal = validated.networkingGoal;

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

    if (validated.excludedTopics !== undefined && previousOwner) {
      await syncPrivacyTopicsForAgent({
        ownerId: auth.ownerId,
        previousExcludedTopics: previousOwner.excludedTopics ?? [],
        nextExcludedTopics: validated.excludedTopics,
      });
    }

    if (
      validated.networkingGoal !== undefined &&
      previousOwner &&
      previousOwner.networkingGoal !== validated.networkingGoal
    ) {
      await syncNetworkingGoalForAgent({
        ownerId: auth.ownerId,
        previousGoal: (previousOwner.networkingGoal as "partnership" | "collaboration" | "mentor" | "peer" | null) ?? null,
        nextGoal: validated.networkingGoal,
      });
    }

    // Agent-scoped updates (active toggle, webhook)
    const wantsAgentUpdate =
      validated.agentActive !== undefined ||
      validated.wakeWebhookEnabled !== undefined ||
      validated.webhookUrl !== undefined ||
      validated.webhookToken !== undefined;

    if (wantsAgentUpdate) {
      const agent = await prisma.agent.findUnique({
        where: { ownerId: auth.ownerId },
      });

      if (agent) {
        if (validated.webhookUrl && validated.webhookUrl !== "") {
          const webhookUrlError = getWakeWebhookUrlError(validated.webhookUrl);
          if (webhookUrlError) {
            return NextResponse.json({ error: webhookUrlError }, { status: 400 });
          }
        }

        const nextWebhookUrl =
          validated.webhookUrl !== undefined
            ? validated.webhookUrl || null
            : agent.webhookUrl;
        const nextWebhookToken =
          validated.webhookToken !== undefined
            ? validated.webhookToken || null
            : agent.webhookToken;
        const nextWakeWebhookEnabled =
          validated.wakeWebhookEnabled !== undefined
            ? validated.wakeWebhookEnabled
            : agent.wakeWebhookEnabled;

        if (nextWakeWebhookEnabled && (!nextWebhookUrl || !nextWebhookToken)) {
          return NextResponse.json(
            { error: "Save both the base URL and bearer token before enabling instant wake" },
            { status: 400 }
          );
        }

        const agentUpdate: Record<string, unknown> = {};
        if (validated.wakeWebhookEnabled !== undefined) {
          agentUpdate.wakeWebhookEnabled = validated.wakeWebhookEnabled;
        }
        if (validated.webhookUrl !== undefined) {
          agentUpdate.webhookUrl = validated.webhookUrl === "" ? null : validated.webhookUrl;
          agentUpdate.wakeWebhookLastPingAt = null;
          agentUpdate.wakeWebhookLastPingOk = null;
          agentUpdate.wakeWebhookLastPingError = null;
        }
        if (validated.webhookToken !== undefined) {
          agentUpdate.webhookToken = validated.webhookToken === "" ? null : validated.webhookToken;
          agentUpdate.wakeWebhookLastPingAt = null;
          agentUpdate.wakeWebhookLastPingOk = null;
          agentUpdate.wakeWebhookLastPingError = null;
        }
        if (validated.webhookUrl === "" || validated.webhookToken === "") {
          agentUpdate.wakeWebhookEnabled = false;
        }

        if (Object.keys(agentUpdate).length > 0) {
          await prisma.agent.update({
            where: { id: agent.id },
            data: agentUpdate,
          });
        }

        if (validated.agentActive !== undefined) {
          await setAgentSearchPaused({
            agentInternalId: agent.id,
            paused: !validated.agentActive,
            source: "settings",
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return safeErrorResponse(error, "Failed to update settings");
  }
}
