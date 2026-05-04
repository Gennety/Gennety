import { NextRequest, NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { safeErrorResponse } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import { OnboardingSchema, PLATFORM_FILE_NAMES, type AgentPlatform } from "@/types/onboarding";
import { getConnectionInstructions, buildSetupPrompt } from "@/lib/onboarding/connection-instructions";
import { loadMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/config";
import { getCountryName } from "@/lib/countries";
import { ZodError } from "zod";
import crypto from "crypto";
import { sendTelegramNotification } from "@/lib/services/telegram";

export async function POST(request: NextRequest) {
  try {
    const locale = resolveLocale({
      cookie: request.headers.get("cookie"),
      acceptLanguage: request.headers.get("accept-language"),
    });
    const messages = await loadMessages(locale);

    const rateLimited = rateLimit(request, { maxRequests: 5, windowMs: 60_000, keyPrefix: "onboarding" });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: messages.onboarding.errors.unauthorized }, { status: 401 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: messages.onboarding.errors.invalidBody }, { status: 400 });
    }

    let validated;
    try {
      validated = OnboardingSchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) {
        return NextResponse.json({ error: messages.onboarding.errors.invalidInput }, { status: 400 });
      }
      return NextResponse.json({ error: messages.onboarding.errors.invalidInput }, { status: 400 });
    }

    const { agentPlatform, networkingGoal, countryCode, privacyConsent, researchConsent, excludedTopics } = validated;
    const countryName = getCountryName(countryCode, locale) ?? countryCode;

    // Update existing owner with onboarding data (retry on transient DB drops)
    const { owner, agent } = await withDbRetry(async () => {
      const o = await prisma.owner.update({
        where: { id: auth.ownerId },
        data: {
          agentPlatform,
          networkingGoal,
          countryCode,
          privacyConsent,
          researchConsent: researchConsent ?? false,
          excludedTopics: excludedTopics ?? [],
          onboarded: true,
        },
      });

      // Immutable consent log — Purpose A (networking)
      await prisma.consentLog.create({
        data: { ownerId: o.id, purpose: "A" },
      });

      // Purpose B (research) — only if consented
      if (researchConsent) {
        await prisma.consentLog.create({
          data: { ownerId: o.id, purpose: "B" },
        });
      }

      // Generate agent credentials
      const nameSlug = (o.name ?? o.email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      const agentId = `agent_${nameSlug}_${Date.now().toString(36)}`;
      const apiKey = `gny_${crypto.randomBytes(32).toString("hex")}`;

      // Create agent if not exists
      let a = await prisma.agent.findUnique({
        where: { ownerId: o.id },
      });

      if (!a) {
        a = await prisma.agent.create({
          data: {
            agentId,
            ownerId: o.id,
            apiKey,
            isActive: true,
            agentType: "OPENCLAW",
            integrationMethod: "MCP",
          },
        });
      }

      return { owner: o, agent: a };
    });

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
      `<b>Onboarding Completed</b>`,
      ``,
      `Name: ${owner.name ?? "—"}`,
      `Email: <code>${owner.email}</code>`,
      ``,
      `<b>Choices</b>`,
      `Platform: ${agentPlatform}`,
      `Goal: ${networkingGoal}`,
      `Country: ${countryName} (${countryCode})`,
      `Privacy consent: ${privacyConsent ? "Yes" : "No"}`,
      `Research consent: ${researchConsent ? "Yes" : "No"}`,
      `Excluded topics: ${excludedTopics?.length ? excludedTopics.join(", ") : "none"}`,
      ``,
      `<b>Agent</b>`,
      `Agent ID: <code>${agent.agentId}</code>`,
      `Agent type: OPENCLAW`,
      ``,
      `IP: <code>${ip}</code>`,
      geo ? `Location: ${geo}` : null,
    ].filter((l): l is string => l !== null);

    sendTelegramNotification(tgLines.join("\n")).catch(() => {});

    const fileName = PLATFORM_FILE_NAMES[agentPlatform as AgentPlatform] ?? PLATFORM_FILE_NAMES.open_claw;

    // Generate connection instructions + one-line setup prompt
    const connectionInstructions = getConnectionInstructions(
      agent.agentId,
      agent.apiKey,
      agentPlatform as AgentPlatform,
      locale
    );
    const baseUrl = request.headers.get("x-forwarded-proto") && request.headers.get("host")
      ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("host")}`
      : process.env.NEXTAUTH_URL ?? "https://gennety.com";
    const setupPrompt = buildSetupPrompt(agent.agentId, agent.apiKey, baseUrl, locale);

    return NextResponse.json({
      owner: {
        id: owner.id,
        email: owner.email,
        name: owner.name,
        networkingGoal: owner.networkingGoal,
        countryCode: owner.countryCode,
        agentPlatform,
      },
      agent: {
        agentId: agent.agentId,
        apiKey: agent.apiKey,
      },
      agentType: "OPENCLAW",
      fileName,
      soulMdEndpoint: `/api/soul/${agent.agentId}`,
      setupPrompt,
      connectionInstructions,
    });
  } catch (error) {
    const locale = resolveLocale({
      cookie: request.headers.get("cookie"),
      acceptLanguage: request.headers.get("accept-language"),
    });
    const messages = await loadMessages(locale);
    return safeErrorResponse(error, messages.onboarding.errors.completeFailed);
  }
}
