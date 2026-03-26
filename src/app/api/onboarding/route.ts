import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { safeErrorResponse } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import { OnboardingSchema } from "@/types/onboarding";
import { ZodError } from "zod";
import crypto from "crypto";
import { sendTelegramNotification } from "@/lib/services/telegram";

export async function POST(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, { maxRequests: 5, windowMs: 60_000, keyPrefix: "onboarding" });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized — please log in first" }, { status: 401 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    let validated;
    try {
      validated = OnboardingSchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        const firstError = e.issues[0]?.message ?? "Invalid input";
        return NextResponse.json({ error: firstError }, { status: 400 });
      }
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { networkingGoal, privacyConsent, researchConsent, excludedTopics } = validated;

    // Update existing owner with onboarding data
    const owner = await prisma.owner.update({
      where: { id: auth.ownerId },
      data: {
        networkingGoal,
        privacyConsent,
        researchConsent: researchConsent ?? false,
        excludedTopics: excludedTopics ?? [],
        onboarded: true,
      },
    });

    // Immutable consent log — Purpose A (networking)
    await prisma.consentLog.create({
      data: { ownerId: owner.id, purpose: "A" },
    });

    // Purpose B (research) — only if consented
    if (researchConsent) {
      await prisma.consentLog.create({
        data: { ownerId: owner.id, purpose: "B" },
      });
    }

    // Generate agent credentials
    const nameSlug = (owner.name ?? owner.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const agentId = `agent_${nameSlug}_${Date.now().toString(36)}`;
    const apiKey = `gny_${crypto.randomBytes(32).toString("hex")}`;

    // Create agent if not exists
    let agent = await prisma.agent.findUnique({
      where: { ownerId: owner.id },
    });

    if (!agent) {
      agent = await prisma.agent.create({
        data: {
          agentId,
          ownerId: owner.id,
          apiKey,
          isActive: true,
        },
      });
    }

    // Telegram alert — fire-and-forget
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const geo = [
      request.headers.get("x-vercel-ip-city"),
      request.headers.get("x-vercel-ip-country-region"),
      request.headers.get("x-vercel-ip-country"),
    ].filter(Boolean).join(", ");

    const tgLines = [
      `<b>New Onboarding</b>`,
      ``,
      `Name: ${owner.name ?? "—"}`,
      `Email: <code>${owner.email}</code>`,
      `Goal: ${networkingGoal}`,
      `Privacy consent: ${privacyConsent ? "Yes" : "No"}`,
      `Research consent: ${researchConsent ? "Yes" : "No"}`,
      `Excluded topics: ${excludedTopics?.length ? excludedTopics.join(", ") : "none"}`,
      ``,
      `IP: <code>${ip}</code>`,
      geo ? `Location: ${geo}` : null,
      `Agent: <code>${agent.agentId}</code>`,
    ].filter((l): l is string => l !== null);

    sendTelegramNotification(tgLines.join("\n")).catch(() => {});

    return NextResponse.json({
      owner: {
        id: owner.id,
        email: owner.email,
        name: owner.name,
        networkingGoal: owner.networkingGoal,
      },
      agent: {
        agentId: agent.agentId,
        apiKey: agent.apiKey,
      },
      soulMdEndpoint: `/api/soul/${agent.agentId}`,
    });
  } catch (error) {
    return safeErrorResponse(error, "Failed to complete onboarding");
  }
}
