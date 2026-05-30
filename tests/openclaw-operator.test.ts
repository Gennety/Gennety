/**
 * OpenClaw operator tests — run with:
 *   npx tsx tests/openclaw-operator.test.ts
 *
 * Hermetic: no DB, no network. We verify schedule gating, report parsing,
 * moderation decisions, documentation, and cron wiring.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { __test as openClawTest } from "../src/lib/services/openclaw-operator";

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`PASS: ${label}`);
}

/* ─── 1. Weekly report is gated to Sunday 23:00 Europe/Kyiv ─── */
{
  const due = openClawTest.getWeeklyScheduleDecision(new Date("2026-05-24T20:03:00.000Z"));
  assert.equal(due.due, true);
  assert.equal(due.periodKey, "2026-05-24");
  assert.match(due.localTime, /23:03 Europe\/Kyiv/);

  const notDue = openClawTest.getWeeklyScheduleDecision(new Date("2026-05-24T19:59:00.000Z"));
  assert.equal(notDue.due, false);

  ok("weekly report fires during the Sunday 23:00 Kyiv hour only");
}

/* ─── 2. Report parser extracts category and target owner safely ─── */
{
  const reason = [
    "Category: HARASSMENT",
    "Reported owner: Maya (owner-b)",
    "Match: match-1",
    "",
    "They kept sending pressure messages.",
  ].join("\n");

  assert.equal(openClawTest.parseReportCategory(reason), "HARASSMENT");
  assert.equal(
    openClawTest.parseReportedOwnerId(reason, ["owner-a", "owner-b"], "owner-a"),
    "owner-b"
  );
  assert.equal(
    openClawTest.parseReportedOwnerId("No explicit target", ["owner-a", "owner-b"], "owner-a"),
    "owner-b"
  );

  ok("report parser identifies serious category and counterparty target");
}

/* ─── 3. Moderation policy is conservative but protective ─── */
{
  const singleSerious = openClawTest.decideReportAction({
    category: "SPAM_OR_SCAM",
    targetOwnerId: "owner-b",
    evidenceText: "User pushed a suspicious payment link.",
    repeatStats: { totalReports: 1, uniqueReporters: 1, seriousReports: 1 },
  });
  assert.equal(singleSerious.decision, "auto_block_pair");
  assert.deepEqual(singleSerious.actions, ["block_reporter_from_target", "manual_review"]);

  const repeatedSerious = openClawTest.decideReportAction({
    category: "HARASSMENT",
    targetOwnerId: "owner-b",
    evidenceText: "Repeated harassment and threats.",
    repeatStats: { totalReports: 3, uniqueReporters: 3, seriousReports: 3 },
  });
  assert.equal(repeatedSerious.decision, "pause_target_and_block_pair");
  assert.ok(repeatedSerious.actions.includes("pause_target_agent"));

  const lowRisk = openClawTest.decideReportAction({
    category: "LOW_QUALITY_OR_IRRELEVANT_MATCH",
    targetOwnerId: "owner-b",
    evidenceText: "The match was not useful.",
    repeatStats: { totalReports: 1, uniqueReporters: 1, seriousReports: 0 },
  });
  assert.equal(lowRisk.decision, "manual_review");
  assert.deepEqual(lowRisk.actions, ["manual_review"]);

  ok("moderation decisions block serious single reports and pause only repeated serious cases");
}

/* ─── 4. Fallback report stays readable without Anthropic ─── */
{
  const range = openClawTest.buildWeeklyAnalyticsRange(new Date("2026-05-24T20:00:00.000Z"));
  const report = openClawTest.buildFallbackWeeklyReport({
    range,
    analytics: {
      overview: {
        summary: {
          owners: { total: 42, onboarded: 30 },
          agents: { total: 35, active: 25 },
          matches: { matched: 9, proposed: 12, negotiating: 4 },
        },
        ttfv: { firstProposed: { waitingOver48h: 2 } },
      },
      trust: { ghosting: { ghostedOver24h: 1 } },
      reports: { summary: { totalReports: 3 } },
      anomalies: { anomalies: [{ title: "People are waiting too long", summary: "2 owners waited more than 48 hours." }] },
      costs: { webhooks: { successRate: 0.9 } },
    } as unknown as Parameters<typeof openClawTest.buildFallbackWeeklyReport>[0]["analytics"],
    moderation: {
      reviewed: 2,
      blocksApplied: 1,
    } as unknown as Parameters<typeof openClawTest.buildFallbackWeeklyReport>[0]["moderation"],
    market: {
      enabled: false,
      notes: ["No web-search key configured."],
      results: [],
    } as unknown as Parameters<typeof openClawTest.buildFallbackWeeklyReport>[0]["market"],
  });

  assert.match(report, /OpenClaw: недельный отчет/);
  assert.match(report, /Пользователи: 42 всего/);
  assert.match(report, /Что делать дальше:/);

  ok("fallback report gives a compact Russian summary");
}

/* ─── 5. Docs and cron manifest expose the operator ─── */
{
  const docs = fs.readFileSync(path.join(ROOT, "docs/OPENCLAW_ANALYTICS_OPERATOR.md"), "utf8");
  assert.match(docs, /Moderation Regulation/);
  assert.match(docs, /Sunday 23:00/);
  assert.match(docs, /SERPER_API_KEY/);

  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  const cron = vercel.crons.find((item) => item.path === "/api/cron/openclaw-operator");
  assert.equal(cron?.schedule, "0 * * * *");

  ok("operator docs and hourly cron are wired");
}

console.log(`\nAll ${passed} OpenClaw operator tests passed.`);
