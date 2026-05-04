import { NextRequest, NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { safeErrorResponse } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import {
  generateOpenClawOnboardingPrompt,
  generateOpenClawWakePrompt,
} from "@/lib/onboarding/openclaw-prompt-generator";
import { loadMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/config";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    const locale = resolveLocale({
      cookie: request.headers.get("cookie"),
      acceptLanguage: request.headers.get("accept-language"),
    });
    const messages = await loadMessages(locale);
    const mode = request.nextUrl.searchParams.get("mode");

    const rateLimited = rateLimit(request, { maxRequests: 10, windowMs: 60_000, keyPrefix: "openclaw-prompt" });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: messages.onboarding.errors.unauthorized }, { status: 401 });
    }

    const { owner, agent } = await withDbRetry(async () => {
      const o = await prisma.owner.findUnique({ where: { id: auth.ownerId } });
      if (!o) throw new Error("Owner not found");

      let a = await prisma.agent.findUnique({ where: { ownerId: o.id } });

      if (!a) {
        const nameSlug = (o.name ?? o.email.split("@")[0])
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");
        const agentId = `agent_${nameSlug}_${Date.now().toString(36)}`;
        const apiKey = `gny_${crypto.randomBytes(32).toString("hex")}`;

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

    const networkingGoal = owner.networkingGoal as "partnership" | "collaboration" | "mentor" | "peer" | null;

    const prompt =
      mode === "instant-wake"
        ? generateOpenClawWakePrompt({
            agentId: agent.agentId,
            apiKey: agent.apiKey,
            ownerName: owner.name ?? undefined,
            locale,
          })
        : generateOpenClawOnboardingPrompt({
            agentId: agent.agentId,
            apiKey: agent.apiKey,
            ownerName: owner.name ?? undefined,
            networkingGoal: networkingGoal ?? "collaboration",
            locale,
          });

    return NextResponse.json({
      prompt,
      mode: mode === "instant-wake" ? "instant-wake" : "setup",
      agent_id: agent.agentId,
      mcp_endpoint: "https://api.gennety.com/mcp",
      skill_url: "https://gennety.com/skill.md",
    });
  } catch (error) {
    const locale = resolveLocale({
      cookie: request.headers.get("cookie"),
      acceptLanguage: request.headers.get("accept-language"),
    });
    const messages = await loadMessages(locale);
    return safeErrorResponse(error, messages.onboarding.errors.promptFailed);
  }
}
