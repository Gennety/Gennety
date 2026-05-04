/**
 * Model advice tests — run with:
 *   npx tsx tests/model-advice.test.ts
 *
 * These tests stay hermetic: no DB, no network.
 * They verify fallback generation, report formatting, and the concurrency
 * guards that protect the advice-session state machine.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { __test as modelAdviceTest } from "../src/lib/services/model-advice";

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`PASS: ${label}`);
}

function sampleArgs(humanMessageCount: number) {
  const transcriptMessages = Array.from({ length: humanMessageCount }, (_, index) => ({
    fromOwner: index % 2 === 0 ? "owner-a" : "owner-b",
    content: `Human message ${index + 1}`,
    kind: "HUMAN",
    createdAt: new Date(`2026-04-28T12:${String(index).padStart(2, "0")}:00.000Z`),
  }));

  return {
    promptText: "Do we actually fit, and what should we do next?",
    overlapSummary: "Both are exploring GTM experiments for early-stage B2B products.",
    ownerAId: "owner-a",
    ownerBId: "owner-b",
    ownerAName: "Alice",
    ownerBName: "Bob",
    ownerAContext: {
      currentWork: "Building B2B onboarding tooling",
      expertise: ["product", "growth"],
      lookingFor: "A distribution-minded collaborator",
      recentProblems: "Low activation after signup",
    },
    ownerBContext: {
      currentWork: "Running GTM experiments for SaaS teams",
      expertise: ["sales", "distribution"],
      lookingFor: "Founders with product signal",
      recentProblems: "Weak handoff from product to sales",
    },
    transcriptMessages,
  };
}

async function main() {
  /* ─── 1. Fallback advice marks short chats as too early ─── */
  {
    const advice = modelAdviceTest.buildFallbackAdvice(sampleArgs(2));
    assert.equal(advice.report.verdict, "too_early");
    assert.equal(advice.turns.length, 4);
    assert.ok(
      advice.report.summary.includes("too short"),
      "fallback summary should explain that the chat is still too short"
    );

    ok("fallback advice treats very short chats as too early");
  }

  /* ─── 2. Anthropic failure degrades to fallback instead of failing the session ─── */
  {
    const previousApiKey = process.env.ANTHROPIC_API_KEY;
    const previousWarn = console.warn;
    process.env.ANTHROPIC_API_KEY = "test-key";

    try {
      let warned = false;
      console.warn = () => {
        warned = true;
      };

      modelAdviceTest.setAnthropicForTests({
        messages: {
          create: async () => {
            throw new Error("synthetic upstream failure");
          },
        },
      } as never);

      const advice = await modelAdviceTest.generateAdviceContent(sampleArgs(4));

      assert.equal(advice.report.verdict, "strong_fit");
      assert.equal(advice.turns.length, 4);
      assert.equal(warned, true, "service should log the degraded generation path");
    } finally {
      modelAdviceTest.setAnthropicForTests(null);
      console.warn = previousWarn;
      if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousApiKey;
    }

    ok("Anthropic generation failures fall back instead of failing advice");
  }

  /* ─── 3. Report formatter keeps the final advice readable in chat ─── */
  {
    const advice = modelAdviceTest.buildFallbackAdvice(sampleArgs(4));
    const report = modelAdviceTest.formatReportMessage(advice.report);

    assert.ok(report.startsWith("Model advice report"));
    assert.ok(report.includes("Verdict: Strong fit"));
    assert.ok(report.includes("What to do next:"));
    assert.ok(report.includes("How to talk better:"));

    ok("report formatter produces the expected structured chat summary");
  }

  /* ─── 4. Migration enforces one live advice session per chat ─── */
  {
    const migration = fs.readFileSync(
      path.join(ROOT, "prisma/migrations/20260428_add_model_advice_sessions/migration.sql"),
      "utf8"
    );

    assert.match(
      migration,
      /CREATE UNIQUE INDEX "advice_sessions_one_live_per_chat_idx"/,
      "migration must create a unique live-session index"
    );
    assert.match(
      migration,
      /WHERE "status" IN \('PENDING', 'ACTIVE'\)/,
      "only pending/active sessions should be mutually exclusive"
    );

    ok("migration protects against duplicate live advice sessions");
  }

  /* ─── 5. Approval path uses an atomic pending-only transition ─── */
  {
    const source = fs.readFileSync(
      path.join(ROOT, "src/lib/services/model-advice.ts"),
      "utf8"
    );

    assert.match(source, /updateMany\(\{/);
    assert.match(source, /status:\s*"PENDING"/);
    assert.match(source, /responderOwnerId:\s*null/);

    ok("approval transition is guarded atomically against double approval");
  }

  console.log(`\nAll ${passed} model-advice tests passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
