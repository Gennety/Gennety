import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";
import { authOptions } from "@/lib/auth-options";

/**
 * Validate owner authentication from request headers.
 * Used for agent-to-platform API calls (MCP routes).
 * Headers: x-owner-id, x-api-key
 */
export async function validateOwnerAuth(
  request: NextRequest
): Promise<{ ownerId: string; agentId: string } | null> {
  const ownerId = request.headers.get("x-owner-id");
  const apiKey = request.headers.get("x-api-key");

  if (!ownerId || !apiKey) return null;

  try {
    const agent = await prisma.agent.findFirst({
      where: { ownerId, apiKey, isActive: true },
    });
    if (!agent) return null;
    return { ownerId, agentId: agent.agentId };
  } catch {
    return null;
  }
}

/**
 * Get authenticated owner from NextAuth session.
 * Used for human-facing API routes (matches, chat, onboarding).
 */
export async function getAuthenticatedOwner(): Promise<{ ownerId: string; email: string } | null> {
  const session = await getServerSession(authOptions);
  const sessionOwnerId = session?.user?.id;
  const sessionEmail = session?.user?.email;

  if (!sessionOwnerId && !sessionEmail) return null;

  try {
    if (sessionOwnerId) {
      const owner = await prisma.owner.findUnique({
        where: { id: sessionOwnerId },
        select: { id: true, email: true },
      });

      if (owner) {
        return { ownerId: owner.id, email: owner.email };
      }
    }

    if (sessionEmail) {
      const owner = await prisma.owner.findUnique({
        where: { email: sessionEmail },
        select: { id: true, email: true },
      });

      if (owner) {
        if (sessionOwnerId && owner.id !== sessionOwnerId) {
          console.warn(
            `[auth] Session owner id ${sessionOwnerId} is stale; recovered owner ${owner.id} via email ${sessionEmail}`
          );
        }

        return { ownerId: owner.id, email: owner.email };
      }
    }
  } catch (error) {
    console.error("[auth] Failed to resolve authenticated owner:", error);
  }

  return null;
}
