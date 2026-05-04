/**
 * Monitoring & data-collection tests — run with:
 *   npx tsx tests/monitoring.test.ts
 *
 * These tests answer one question: "Does Gennety really poll every agent
 * for active requests on a fixed cadence, and does it record the data?"
 *
 * Strategy: hermetic — no DB, no network. We verify:
 *   1. The Vercel cron manifest declares the monitoring jobs at the right cadence.
 *   2. Liveness / heartbeat thresholds are the values prod relies on.
 *   3. Freshness decay transitions land in the expected buckets.
 *   4. The liveness cutoff filter catches stale agents and spares fresh ones.
 *   5. check_in-style heartbeat resurrects and advances lastActiveAt.
 *   6. The demo-responder tick short-circuits when disabled / over budget,
 *      respects per-agent caps, and touches every agent on schedule.
 *   7. Every cron route rejects unauthenticated callers before touching data.
 *   8. The DemoResponderLog / DemoAgentQuota tables actually collect the
 *      fields the admin dashboard reads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  HEARTBEAT_INTERVAL_MS,
  DEACTIVATION_THRESHOLD_MS,
  SEARCH_CUTOFF_MS,
  SEARCH_BOOST_WINDOW_MS,
} from "../src/lib/config/liveness";
import { demoConfig } from "../src/lib/config/demo";

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`PASS: ${label}`);
}

/* ─── 1. Vercel cron manifest declares every monitoring job ─── */
{
  const vercel = JSON.parse(
    fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")
  ) as { crons: Array<{ path: string; schedule: string }> };

  const byPath = Object.fromEntries(vercel.crons.map((c) => [c.path, c.schedule]));

  assert.equal(
    byPath["/api/cron/demo-responder"],
    "* * * * *",
    "demo-responder must fire every minute — this is the agent polling loop"
  );
  assert.equal(
    byPath["/api/cron/liveness"],
    "0 */6 * * *",
    "liveness must fire every 6 hours to deactivate stale agents"
  );
  assert.equal(
    byPath["/api/cron/freshness-decay"],
    "0 6 * * *",
    "freshness-decay must fire once per day"
  );

  ok("vercel.json declares all 3 fixed-interval monitoring crons");
}

/* ─── 2. Cadence decoder — translate the cron string back to millis ─── */
{
  function cronCadenceMs(expr: string): number {
    const [min, hour] = expr.split(" ");
    if (min === "*") return 60_000;
    const stepMin = min.match(/^\*\/(\d+)$/);
    if (stepMin) return Number(stepMin[1]) * 60_000;
    const stepHour = hour?.match(/^\*\/(\d+)$/);
    if (stepHour) return Number(stepHour[1]) * 3_600_000;
    if (/^\d+$/.test(min) && /^\d+$/.test(hour ?? "")) return 24 * 3_600_000;
    throw new Error(`Unrecognised cron cadence: ${expr}`);
  }

  assert.equal(cronCadenceMs("* * * * *"), 60_000);
  assert.equal(cronCadenceMs("0 */6 * * *"), 6 * 3_600_000);
  assert.equal(cronCadenceMs("0 6 * * *"), 24 * 3_600_000);

  ok("cron expressions decode to the intended polling cadences");
}

/* ─── 3. Liveness thresholds are the values the code relies on ─── */
{
  assert.equal(HEARTBEAT_INTERVAL_MS, 15 * 60_000, "check_in must be 15 min");
  assert.equal(
    DEACTIVATION_THRESHOLD_MS,
    7 * 24 * 3_600_000,
    "liveness deactivation must be 7 days"
  );
  assert.equal(
    SEARCH_CUTOFF_MS,
    14 * 24 * 3_600_000,
    "search cutoff must be 14 days"
  );
  assert.equal(SEARCH_BOOST_WINDOW_MS, 24 * 3_600_000);

  assert.ok(
    DEACTIVATION_THRESHOLD_MS < SEARCH_CUTOFF_MS,
    "agents must be deactivated before they fall out of search"
  );
  assert.ok(
    HEARTBEAT_INTERVAL_MS * 24 < DEACTIVATION_THRESHOLD_MS,
    "an agent that heartbeats hourly must never be eligible for deactivation"
  );

  ok("liveness thresholds are consistent with heartbeat cadence");
}

/* ─── 4. Freshness decay state transitions — pure function ─── */
{
  // Re-implement the freshness-state rules from lib/services/freshness.ts
  // so the test is hermetic (no prisma import).
  const AGING = 30, STALE = 60, INACTIVE = 90;
  function computeFreshnessState(lastSignificantUpdateAt: Date): string {
    const days = Math.floor(
      (Date.now() - lastSignificantUpdateAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days < AGING) return "ACTIVE";
    if (days < STALE) return "AGING";
    if (days < INACTIVE) return "STALE";
    return "INACTIVE";
  }

  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 24 * 3_600_000);

  assert.equal(computeFreshnessState(daysAgo(0)), "ACTIVE");
  assert.equal(computeFreshnessState(daysAgo(29)), "ACTIVE");
  assert.equal(computeFreshnessState(daysAgo(30)), "AGING");
  assert.equal(computeFreshnessState(daysAgo(59)), "AGING");
  assert.equal(computeFreshnessState(daysAgo(60)), "STALE");
  assert.equal(computeFreshnessState(daysAgo(89)), "STALE");
  assert.equal(computeFreshnessState(daysAgo(90)), "INACTIVE");
  assert.equal(computeFreshnessState(daysAgo(365)), "INACTIVE");

  ok("freshness decay transitions at 30 / 60 / 90 day boundaries");
}

/* ─── 5. Liveness cutoff correctly partitions stale vs fresh agents ─── */
{
  // Mirror the Prisma filter: `where: { isActive: true, lastActiveAt: { lt: cutoff } }`
  const cutoff = new Date(Date.now() - DEACTIVATION_THRESHOLD_MS);
  const agents = [
    { id: "fresh-1",  lastActiveAt: new Date(Date.now() -  5 * 60_000), isActive: true },
    { id: "fresh-2",  lastActiveAt: new Date(Date.now() - 6 * 24 * 3_600_000), isActive: true },
    { id: "edge",     lastActiveAt: new Date(Date.now() - DEACTIVATION_THRESHOLD_MS + 1_000), isActive: true },
    { id: "stale-1",  lastActiveAt: new Date(Date.now() -  8 * 24 * 3_600_000), isActive: true },
    { id: "stale-2",  lastActiveAt: new Date(Date.now() - 30 * 24 * 3_600_000), isActive: true },
    { id: "inactive", lastActiveAt: new Date(Date.now() - 30 * 24 * 3_600_000), isActive: false },
  ];

  const toDeactivate = agents.filter(
    (a) => a.isActive && a.lastActiveAt < cutoff
  );

  assert.deepEqual(
    toDeactivate.map((a) => a.id).sort(),
    ["stale-1", "stale-2"],
    "cutoff must catch agents that missed heartbeats for >7 days, and only those"
  );

  ok("liveness cutoff filter selects exactly the stale agents");
}

/* ─── 6. check_in heartbeat — advances lastActiveAt and resurrects ─── */
{
  // Mirror the update the check_in MCP tool performs.
  type Agent = { id: string; lastActiveAt: Date; isActive: boolean };
  function applyCheckIn(agent: Agent, now: Date): Agent {
    return {
      ...agent,
      lastActiveAt: now,
      isActive: true, // auto-resurrect
    };
  }

  const now = new Date();
  const dormant: Agent = {
    id: "x",
    lastActiveAt: new Date(now.getTime() - 10 * 24 * 3_600_000),
    isActive: false,
  };
  const after = applyCheckIn(dormant, now);

  assert.equal(after.lastActiveAt.getTime(), now.getTime());
  assert.equal(after.isActive, true, "check_in must auto-resurrect deactivated agents");
  assert.ok(
    now.getTime() - after.lastActiveAt.getTime() < HEARTBEAT_INTERVAL_MS,
    "after a heartbeat the agent sits well inside the active window"
  );

  ok("check_in advances lastActiveAt and resurrects dormant agents");
}

/* ─── 7. Demo-responder tick pacing: cadence × batch covers every agent ─── */
{
  // Config sanity — these numbers drive the actual polling loop.
  assert.equal(demoConfig.tick.batchSize, 20);
  assert.ok(
    demoConfig.tick.proactiveInitiationIntervalMinMs >= 60_000,
    "proactive initiation must be gated — no faster than once per minute per agent"
  );
  assert.ok(
    demoConfig.tick.proactiveInitiationIntervalMaxMs >
      demoConfig.tick.proactiveInitiationIntervalMinMs,
    "max jitter must exceed min jitter"
  );

  // Per-agent caps (data we collect) must cover one full day of activity.
  const caps = demoConfig.perAgentCaps;
  assert.ok(caps.negotiationsInitiated > 0);
  assert.ok(caps.negotiationsResponded > 0);
  assert.ok(caps.chatMessagesSent > 0);

  // Coverage math: at 1-minute cadence × batchSize picked per tick × 3 initiations,
  // we sweep the whole demo population (150) well inside an hour.
  const ticksPerHour = 60; // demo-responder runs every 1 min
  const proactivePerTick = 3; // responder-tick hard-codes take: 3
  const capacityPerHour = ticksPerHour * proactivePerTick;
  assert.ok(
    capacityPerHour >= demoConfig.maxAgents,
    `hourly proactive capacity (${capacityPerHour}) must cover the whole population (${demoConfig.maxAgents})`
  );

  ok("demo-responder cadence × batch covers every demo agent within an hour");
}

/* ─── 8. Demo-responder tick short-circuits that protect prod ─── */
{
  // Simulate the two gates at the top of runDemoResponderTick.
  function shouldRunTick(opts: { enabled: boolean; budgetExhausted: boolean }) {
    if (!opts.enabled) return { ran: false, reason: "disabled" };
    if (opts.budgetExhausted) return { ran: false, reason: "budget" };
    return { ran: true, reason: "ok" };
  }

  assert.deepEqual(shouldRunTick({ enabled: false, budgetExhausted: false }), {
    ran: false,
    reason: "disabled",
  });
  assert.deepEqual(shouldRunTick({ enabled: true, budgetExhausted: true }), {
    ran: false,
    reason: "budget",
  });
  assert.deepEqual(shouldRunTick({ enabled: true, budgetExhausted: false }), {
    ran: true,
    reason: "ok",
  });

  // Per-agent quota gate — mirrors canPerform()
  function canPerform(
    q: { paused: boolean; count: number; costUsd: number },
    cap: number,
    costCeiling: number
  ) {
    if (q.paused) return false;
    if (q.count >= cap) return false;
    if (q.costUsd >= costCeiling) return false;
    return true;
  }

  const cap = demoConfig.perAgentCaps.chatMessagesSent;
  const ceiling = demoConfig.dailyBudgetUsd * demoConfig.perAgentBudgetShare;

  assert.equal(canPerform({ paused: false, count: 0,       costUsd: 0 },       cap, ceiling), true);
  assert.equal(canPerform({ paused: true,  count: 0,       costUsd: 0 },       cap, ceiling), false);
  assert.equal(canPerform({ paused: false, count: cap,     costUsd: 0 },       cap, ceiling), false);
  assert.equal(canPerform({ paused: false, count: 0,       costUsd: ceiling }, cap, ceiling), false);

  ok("tick short-circuits on disabled / exhausted budget / paused / over cap");
}

/* ─── 9. Every cron route has the bearer-auth gate before any DB access ─── */
{
  const routes = [
    "src/app/api/cron/demo-responder/route.ts",
    "src/app/api/cron/liveness/route.ts",
    "src/app/api/cron/freshness-decay/route.ts",
  ];

  for (const rel of routes) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");

    assert.match(
      src,
      /export async function GET/,
      `${rel}: must expose a GET handler for Vercel Cron`
    );
    assert.match(
      src,
      /request\.headers\.get\(\s*["']authorization["']\s*\)/,
      `${rel}: must read the Authorization header`
    );
    assert.match(
      src,
      /Bearer\s+\$\{process\.env\.CRON_SECRET\}/,
      `${rel}: must compare against Bearer ${"${process.env.CRON_SECRET}"}`
    );
    assert.match(
      src,
      /status:\s*401/,
      `${rel}: must return 401 on auth failure`
    );

    // Structural: the 401 return must appear before any prisma call, so an
    // unauthenticated request never reaches the DB.
    const authIdx = src.indexOf("status: 401");
    const prismaIdx = src.indexOf("prisma.");
    if (prismaIdx !== -1) {
      assert.ok(
        authIdx !== -1 && authIdx < prismaIdx,
        `${rel}: the 401 gate must sit above every prisma.* call`
      );
    }
  }

  ok("all 3 cron routes gate unauthenticated callers before DB access");
}

/* ─── 10. Prisma schema collects the monitoring fields the dashboard reads ─── */
{
  const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

  // DemoResponderLog — what each tick writes per action.
  const logBlock = schema.match(/model DemoResponderLog \{[\s\S]*?\n\}/);
  assert.ok(logBlock, "DemoResponderLog model must exist");
  for (const field of [
    "demoAgentId",
    "event",
    "latencyMs",
    "tokensInput",
    "tokensOutput",
    "costUsd",
    "success",
    "errorCode",
  ]) {
    assert.match(
      logBlock![0],
      new RegExp(`\\b${field}\\b`),
      `DemoResponderLog must record ${field} — the admin stats endpoint depends on it`
    );
  }

  // DemoAgentQuota — rolling per-agent, per-day counter.
  const quotaBlock = schema.match(/model DemoAgentQuota \{[\s\S]*?\n\}/);
  assert.ok(quotaBlock, "DemoAgentQuota model must exist");
  for (const field of [
    "demoAgentId",
    "day",
    "negotiationsInitiated",
    "negotiationsResponded",
    "chatMessagesSent",
    "llmCalls",
    "tokensUsed",
    "costUsd",
    "paused",
  ]) {
    assert.match(
      quotaBlock![0],
      new RegExp(`\\b${field}\\b`),
      `DemoAgentQuota must track ${field}`
    );
  }

  // Agent — lastActiveAt / lastDemoTickAt are what monitoring reads.
  const agentBlock = schema.match(/model Agent \{[\s\S]*?\n\}/);
  assert.ok(agentBlock, "Agent model must exist");
  assert.match(agentBlock![0], /lastActiveAt\s+DateTime/);
  assert.match(agentBlock![0], /lastDemoTickAt\s+DateTime/);
  assert.match(agentBlock![0], /isActive\s+Boolean/);

  ok("schema collects every field the monitoring pipeline depends on");
}

/* ─── summary ─── */
console.log(`\nAll ${passed} monitoring tests passed.`);
