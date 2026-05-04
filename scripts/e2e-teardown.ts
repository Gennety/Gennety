/**
 * E2E Teardown Script
 * Removes all test data created during E2E verification.
 * Pattern: emails matching *@gennety.dev with "e2e_test_" prefix
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function teardown() {
  console.log("=== E2E TEARDOWN ===\n");

  // Find all E2E test owners
  const testOwners = await prisma.owner.findMany({
    where: {
      email: { startsWith: "e2e_test_", endsWith: "@gennety.dev" },
    },
    include: {
      agent: { select: { id: true } },
    },
  });

  console.log(`Found ${testOwners.length} E2E test accounts to clean up:`);
  testOwners.forEach((o) =>
    console.log(`  - ${o.email} (id: ${o.id}, agents: ${o.agent ? 1 : 0})`)
  );

  if (testOwners.length === 0) {
    console.log("Nothing to clean up.");
    await prisma.$disconnect();
    return;
  }

  const ownerIds = testOwners.map((o) => o.id);
  const agentIds = testOwners.map((o) => o.agent?.id).filter((id): id is string => !!id);

  // Also find XSS test account
  const xssOwner = await prisma.owner.findUnique({
    where: { email: "xss_test@gennety.dev" },
    include: { agent: { select: { id: true } } },
  });
  if (xssOwner) {
    console.log(`  - ${xssOwner.email} (XSS test account)`);
    ownerIds.push(xssOwner.id);
    if (xssOwner.agent) agentIds.push(xssOwner.agent.id);
  }

  console.log(`\nCleaning up ${ownerIds.length} owners, ${agentIds.length} agents...\n`);

  await prisma.$transaction(async (tx) => {
    // Delete match-related data for test agents
    if (agentIds.length > 0) {
      const matches = await tx.match.findMany({
        where: { OR: [{ agentAId: { in: agentIds } }, { agentBId: { in: agentIds } }] },
        select: { id: true },
      });
      const matchIds = matches.map((m) => m.id);

      if (matchIds.length > 0) {
        const chats = await tx.chat.findMany({
          where: { matchId: { in: matchIds } },
          select: { id: true },
        });
        const chatIds = chats.map((c) => c.id);

        if (chatIds.length > 0) {
          const msgDel = await tx.message.deleteMany({ where: { chatId: { in: chatIds } } });
          console.log(`  Deleted ${msgDel.count} messages`);
          const repDel = await tx.report.deleteMany({ where: { chatId: { in: chatIds } } });
          console.log(`  Deleted ${repDel.count} reports`);
          const chatDel = await tx.chat.deleteMany({ where: { id: { in: chatIds } } });
          console.log(`  Deleted ${chatDel.count} chats`);
        }

        const reactDel = await tx.matchReaction.deleteMany({ where: { matchId: { in: matchIds } } });
        console.log(`  Deleted ${reactDel.count} reactions`);
        const commentDel = await tx.matchComment.deleteMany({ where: { matchId: { in: matchIds } } });
        console.log(`  Deleted ${commentDel.count} comments`);
        const negDel = await tx.negotiationLog.deleteMany({ where: { matchId: { in: matchIds } } });
        console.log(`  Deleted ${negDel.count} negotiation logs`);
        const matchDel = await tx.match.deleteMany({ where: { id: { in: matchIds } } });
        console.log(`  Deleted ${matchDel.count} matches`);
      }

      const beaconDel = await tx.beacon.deleteMany({ where: { agentId: { in: agentIds } } });
      console.log(`  Deleted ${beaconDel.count} beacons`);
      const ctxDel = await tx.agentContext.deleteMany({ where: { agentId: { in: agentIds } } });
      console.log(`  Deleted ${ctxDel.count} agent contexts`);
      const negLogDel = await tx.negotiationLog.deleteMany({ where: { agentId: { in: agentIds } } });
      console.log(`  Deleted ${negLogDel.count} orphan negotiation logs`);
      const agentDel = await tx.agent.deleteMany({ where: { id: { in: agentIds } } });
      console.log(`  Deleted ${agentDel.count} agents`);
    }

    // Delete reactions/comments by test owners on OTHER matches
    const rxDel = await tx.matchReaction.deleteMany({ where: { ownerId: { in: ownerIds } } });
    console.log(`  Deleted ${rxDel.count} owner reactions`);
    const cmtDel = await tx.matchComment.deleteMany({ where: { ownerId: { in: ownerIds } } });
    console.log(`  Deleted ${cmtDel.count} owner comments`);

    // Delete consent, blocks, reports, accounts, owners
    const conDel = await tx.consentLog.deleteMany({ where: { ownerId: { in: ownerIds } } });
    console.log(`  Deleted ${conDel.count} consent logs`);
    const blkDel = await tx.block.deleteMany({
      where: { OR: [{ blockerId: { in: ownerIds } }, { blockedId: { in: ownerIds } }] },
    });
    console.log(`  Deleted ${blkDel.count} blocks`);
    const repDel2 = await tx.report.deleteMany({ where: { reporterId: { in: ownerIds } } });
    console.log(`  Deleted ${repDel2.count} personal reports`);
    const accDel = await tx.account.deleteMany({ where: { userId: { in: ownerIds } } });
    console.log(`  Deleted ${accDel.count} OAuth accounts`);
    const ownDel = await tx.owner.deleteMany({ where: { id: { in: ownerIds } } });
    console.log(`  Deleted ${ownDel.count} owners`);
  });

  console.log("\n=== TEARDOWN COMPLETE ===");

  // Verify clean state
  const remaining = await prisma.owner.count({
    where: {
      OR: [
        { email: { startsWith: "e2e_test_", endsWith: "@gennety.dev" } },
        { email: "xss_test@gennety.dev" },
      ],
    },
  });
  console.log(`\nVerification: ${remaining} test accounts remaining (expected: 0)`);

  await prisma.$disconnect();
}

teardown().catch((err) => {
  console.error("Teardown failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
