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
  const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  const agentBlock = schema.match(/model Agent \{[\s\S]*?\n\}/);
  assert.ok(agentBlock, "Agent model must exist");
  assert.match(agentBlock![0], /searchPaused\s+Boolean\s+@default\(false\)\s+@map\("search_paused"\)/);

  ok("agent schema stores owner-controlled match search pause separately from liveness");
}

{
  const settingsSource = fs.readFileSync(
    path.join(ROOT, "src/app/api/settings/route.ts"),
    "utf8"
  );
  const agentSearchSource = fs.readFileSync(
    path.join(ROOT, "src/lib/services/agent-search.ts"),
    "utf8"
  );
  const telegramRouteSource = fs.readFileSync(
    path.join(ROOT, "src/app/api/telegram/route.ts"),
    "utf8"
  );

  assert.match(settingsSource, /setAgentSearchPaused\(/);
  assert.match(agentSearchSource, /type = args\.paused \? "AGENT_SEARCH_PAUSED" : "AGENT_SEARCH_RESUMED"/);
  assert.match(agentSearchSource, /sendTelegramNotification\(/);
  assert.match(telegramRouteSource, /"\/pause_search"/);
  assert.match(telegramRouteSource, /"\/resume_search"/);
  assert.match(telegramRouteSource, /setAgentSearchPausedByExternalId\(/);

  ok("settings and Telegram both drive the same search pause service");
}

{
  const authSource = fs.readFileSync(path.join(ROOT, "src/lib/mcp/auth.ts"), "utf8");
  const checkInSource = fs.readFileSync(
    path.join(ROOT, "src/lib/mcp/tools/check-in.ts"),
    "utf8"
  );
  const matchEngineSource = fs.readFileSync(
    path.join(ROOT, "src/lib/services/match-engine.ts"),
    "utf8"
  );
  const beaconSource = fs.readFileSync(
    path.join(ROOT, "src/lib/services/beacon.ts"),
    "utf8"
  );
  const negotiationSource = fs.readFileSync(
    path.join(ROOT, "src/lib/services/negotiation.ts"),
    "utf8"
  );

  assert.match(authSource, /!agent\.isActive && !agent\.searchPaused/);
  assert.match(checkInSource, /!agent\.isActive && !agent\.searchPaused/);
  assert.match(matchEngineSource, /a\.search_paused = false/);
  assert.match(matchEngineSource, /Match search is paused by the owner/);
  assert.match(beaconSource, /Resume search before setting beacons/);
  assert.match(negotiationSource, /initiator search is paused/);
  assert.match(negotiationSource, /target agent search is paused/);
  assert.match(negotiationSource, /Cannot propose: match search is paused/);

  ok("paused agents cannot be reactivated implicitly or enter new matching paths");
}

console.log(`\nAll ${passed} agent-search-pause tests passed.`);
