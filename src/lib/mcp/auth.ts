import { prisma } from "@/lib/db";

export async function authenticateAgent(apiKey: string | null) {
  if (!apiKey) return null;

  const agent = await prisma.agent.findUnique({
    where: { apiKey },
    include: { owner: true },
  });

  if (!agent || !agent.isActive) return null;

  // Update last active timestamp
  await prisma.agent.update({
    where: { id: agent.id },
    data: { lastActiveAt: new Date() },
  });

  return agent;
}
