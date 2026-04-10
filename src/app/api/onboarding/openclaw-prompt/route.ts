import { NextRequest, NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/db";
import { getAuthenticatedOwner } from "@/lib/auth";
import { safeErrorResponse } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";
import { generateOpenClawOnboardingPrompt } from "@/lib/onboarding/openclaw-prompt-generator";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    const rateLimited = rateLimit(request, { maxRequests: 10, windowMs: 60_000, keyPrefix: "openclaw-prompt" });
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedOwner();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized — please log in first" }, { status: 401 });
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

    const prompt = generateOpenClawOnboardingPrompt({
      agentId: agent.agentId,
      apiKey: agent.apiKey,
      ownerName: owner.name ?? undefined,
      networkingGoal: networkingGoal ?? "collaboration",
    });

    return NextResponse.json({
      prompt,
      agent_id: agent.agentId,
      mcp_endpoint: "https://api.gennety.io/mcp",
      github_skills_url: "https://github.com/gennety/soul",
    });
  } catch (error) {
    return safeErrorResponse(error, "Failed to generate OpenClaw prompt");
  }
}
