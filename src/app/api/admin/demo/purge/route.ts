import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Admin-only demo purge. Cascade-deletes all demo data so the network can
 * be rebuilt cleanly.
 *
 *   POST /api/admin/demo/purge          (dry-run by default)
 *   POST /api/admin/demo/purge?apply=1  (actually delete)
 *
 * Auth: `Authorization: Bearer ${DEMO_ADMIN_SECRET}`.
 *
 * Order of deletion matters — children first, parents last. Prisma has no
 * ON DELETE CASCADE for all relations we need, so we do it explicitly.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.DEMO_ADMIN_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "DEMO_ADMIN_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apply = request.nextUrl.searchParams.get("apply") === "1";

  const demoOwners = await prisma.owner.findMany({
    where: { isDemo: true },
    select: { id: true },
  });
  const demoAgents = await prisma.agent.findMany({
    where: { isDemo: true },
    select: { id: true },
  });
  const ownerIds = demoOwners.map((o) => o.id);
  const agentIds = demoAgents.map((a) => a.id);

  // Matches where at least one side is a demo agent — chat/negotiation/reactions follow.
  const affectedMatches = await prisma.match.findMany({
    where: {
      OR: [
        { agentAId: { in: agentIds } },
        { agentBId: { in: agentIds } },
      ],
    },
    select: { id: true },
  });
  const matchIds = affectedMatches.map((m) => m.id);

  const affectedChats = await prisma.chat.findMany({
    where: { matchId: { in: matchIds } },
    select: { id: true },
  });
  const chatIds = affectedChats.map((c) => c.id);

  const counts = {
    owners: ownerIds.length,
    agents: agentIds.length,
    matches: matchIds.length,
    chats: chatIds.length,
  };

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      wouldDelete: counts,
      hint: "Re-POST with ?apply=1 to actually delete.",
    });
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.deleteMany({ where: { chatId: { in: chatIds } } });
    const rep = await tx.report.deleteMany({ where: { chatId: { in: chatIds } } });
    const ch = await tx.chat.deleteMany({ where: { id: { in: chatIds } } });
    const neg = await tx.negotiationLog.deleteMany({ where: { matchId: { in: matchIds } } });
    const rea = await tx.matchReaction.deleteMany({ where: { matchId: { in: matchIds } } });
    const com = await tx.matchComment.deleteMany({ where: { matchId: { in: matchIds } } });
    const ma = await tx.match.deleteMany({ where: { id: { in: matchIds } } });
    const be = await tx.beacon.deleteMany({ where: { agentId: { in: agentIds } } });
    const ctx = await tx.agentContext.deleteMany({ where: { agentId: { in: agentIds } } });
    const qu = await tx.demoAgentQuota.deleteMany({ where: { demoAgentId: { in: agentIds } } });
    const lo = await tx.demoResponderLog.deleteMany({ where: { demoAgentId: { in: agentIds } } });
    const ag = await tx.agent.deleteMany({ where: { id: { in: agentIds } } });
    const bl = await tx.block.deleteMany({
      where: { OR: [{ blockerId: { in: ownerIds } }, { blockedId: { in: ownerIds } }] },
    });
    const cl = await tx.consentLog.deleteMany({ where: { ownerId: { in: ownerIds } } });
    const ac = await tx.account.deleteMany({ where: { userId: { in: ownerIds } } });
    const ow = await tx.owner.deleteMany({ where: { id: { in: ownerIds } } });

    return {
      messages: msg.count,
      reports: rep.count,
      chats: ch.count,
      negotiationLogs: neg.count,
      matchReactions: rea.count,
      matchComments: com.count,
      matches: ma.count,
      beacons: be.count,
      contexts: ctx.count,
      quotas: qu.count,
      responderLogs: lo.count,
      agents: ag.count,
      blocks: bl.count,
      consentLogs: cl.count,
      accounts: ac.count,
      owners: ow.count,
    };
  });

  return NextResponse.json({ dryRun: false, deleted });
}
