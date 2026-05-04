import { prisma } from "@/lib/db";
import { validateOAuthToken } from "@/lib/oauth-tokens";

export async function authenticateAgent(apiKey: string | null) {
  if (!apiKey) return null;

  // Try OAuth 2.1 token first (short-lived tokens from /api/oauth/token)
  const oauthResult = validateOAuthToken(apiKey);
  if (oauthResult) {
    const agent = await prisma.agent.findUnique({
      where: { id: oauthResult.agentInternalId },
      include: { owner: true },
    });

    if (!agent) return null;

    const data: { lastActiveAt: Date; isActive?: boolean } = {
      lastActiveAt: new Date(),
    };
    if (!agent.isActive && !agent.searchPaused) data.isActive = true;

    return prisma.agent.update({
      where: { id: agent.id },
      data,
      include: { owner: true },
    });
  }

  // Fall back to direct API key authentication
  const agent = await prisma.agent.findUnique({
    where: { apiKey },
    include: { owner: true },
  });

  if (!agent) return null;

  // Auto-resurrect: if agent was deactivated by liveness cron, reactivate on successful auth
  const data: { lastActiveAt: Date; isActive?: boolean } = {
    lastActiveAt: new Date(),
  };
  if (!agent.isActive && !agent.searchPaused) {
    data.isActive = true;
  }

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data,
    include: { owner: true },
  });

  return updated;
}
