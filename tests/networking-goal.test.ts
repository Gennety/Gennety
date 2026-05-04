import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  areNetworkingGoalsCompatible,
  buildNetworkingGoalChangePayload,
  getCompatibleNetworkingGoals,
} from "../src/lib/networking-goal";

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`PASS: ${label}`);
}

{
  assert.deepStrictEqual(getCompatibleNetworkingGoals("partnership"), [
    "partnership",
    "collaboration",
  ]);
  assert.deepStrictEqual(getCompatibleNetworkingGoals("peer"), ["peer"]);
  assert.equal(areNetworkingGoalsCompatible("partnership", "collaboration"), true);
  assert.equal(areNetworkingGoalsCompatible("collaboration", "partnership"), true);
  assert.equal(areNetworkingGoalsCompatible("mentor", "peer"), false);

  ok("networking goal compatibility rules stay explicit and asymmetric-safe");
}

{
  const payload = buildNetworkingGoalChangePayload({
    previousGoal: "collaboration",
    nextGoal: "mentor",
    contextUpdated: true,
    beaconsDeactivated: 3,
    requiresAgentRepublish: true,
    searchRescored: true,
    currentPublishedContext: {
      current_work: "Helping founders sharpen GTM",
      looking_for: "Mentor relationships in B2B SaaS",
      networking_goal: "mentor",
    },
  }) as Record<string, unknown>;

  assert.equal(payload.previous_goal, "collaboration");
  assert.equal(payload.next_goal, "mentor");
  assert.equal(payload.context_updated, true);
  assert.equal(payload.beacons_deactivated, 3);
  assert.equal(payload.requires_republish, true);
  assert.match(String(payload.action), /publish_context/i);

  ok("goal change payload tells the agent to refresh strategy and context");
}

{
  const settingsSource = fs.readFileSync(
    path.join(ROOT, "src/app/api/settings/route.ts"),
    "utf8"
  );
  const syncSource = fs.readFileSync(
    path.join(ROOT, "src/lib/services/networking-goal-sync.ts"),
    "utf8"
  );
  const contextIndexSource = fs.readFileSync(
    path.join(ROOT, "src/lib/services/context-index.ts"),
    "utf8"
  );
  const matchEngineSource = fs.readFileSync(
    path.join(ROOT, "src/lib/services/match-engine.ts"),
    "utf8"
  );

  assert.match(
    settingsSource,
    /syncNetworkingGoalForAgent\(/,
    "settings route should trigger server-side goal sync"
  );
  assert.match(
    syncSource,
    /type: "NETWORKING_GOAL_CHANGED"/,
    "goal sync should notify the agent via inbox"
  );
  assert.match(
    syncSource,
    /reason: "Networking goal changed — refresh strategy and republish context"/,
    "goal sync should wake the agent"
  );
  assert.match(
    contextIndexSource,
    /const effectiveNetworkingGoal = agent\.owner\.networkingGoal \?\? context\.networking_goal;/,
    "publish_context should treat the owner's goal as authoritative"
  );
  assert.match(
    contextIndexSource,
    /data: \{ isActive: false, preservable: false \}/,
    "significant context shifts should permanently retire stale beacons"
  );
  assert.match(
    matchEngineSource,
    /getCompatibleNetworkingGoals/,
    "findMatches should use goal compatibility instead of ignoring the goal"
  );

  ok("source wiring keeps goal changes tied to search, beacons, and agent wake-up");
}

console.log(`\nAll ${passed} networking-goal tests passed.`);
