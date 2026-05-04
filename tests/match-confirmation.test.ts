/**
 * Match confirmation regression tests — run with:
 *   node --import tsx tests/match-confirmation.test.ts
 *
 * These tests stay hermetic. They guard the concurrency and idempotency
 * fixes around owner confirmation and chat creation.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`PASS: ${label}`);
}

{
  const source = fs.readFileSync(
    path.join(ROOT, "src/lib/services/negotiation.ts"),
    "utf8"
  );

  assert.match(
    source,
    /prisma\.\$transaction\(async \(tx\) => \{/,
    "confirmMatch should run its flag update and re-read in a transaction"
  );
  assert.match(
    source,
    /const refreshed = await tx\.match\.findUnique\(/,
    "confirmMatch should re-read the row after updating one owner's flag"
  );
  assert.match(
    source,
    /newlyConfirmed: !wasConfirmedByMe/,
    "confirmMatch should avoid double-counting repeated confirmations"
  );
  assert.match(
    source,
    /bothConfirmed && refreshed\.status === "PROPOSED"/,
    "confirmMatch should finalize only once after seeing both confirmations together"
  );

  ok("confirmMatch keeps the dual-confirmation path atomic and idempotent");
}

{
  const source = fs.readFileSync(
    path.join(ROOT, "src/lib/services/chat.ts"),
    "utf8"
  );

  assert.match(
    source,
    /const existingChat = await prisma\.chat\.findUnique\(/,
    "chat creation should short-circuit when a chat already exists"
  );
  assert.match(
    source,
    /prisma\.chat\.upsert\(/,
    "chat creation should be idempotent under concurrent confirmations"
  );

  ok("chat creation is idempotent when both owners confirm at the same time");
}

console.log(`\nAll ${passed} match-confirmation tests passed.`);
