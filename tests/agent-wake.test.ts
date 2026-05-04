/**
 * Wake webhook security tests — run with:
 *   node --import tsx tests/agent-wake.test.ts
 *
 * Verifies that server-side wake webhook validation rejects local/private
 * targets before Gennety tries to POST to them.
 */

import assert from "node:assert/strict";

import { getWakeWebhookUrlError } from "../src/lib/wake-webhook";

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`PASS: ${label}`);
}

{
  assert.equal(getWakeWebhookUrlError("https://agent.example.com/hooks/wake"), null);
  ok("public HTTPS wake URLs remain allowed");
}

{
  assert.equal(
    getWakeWebhookUrlError("http://agent.example.com/hooks/wake"),
    "Wake webhook must use HTTPS"
  );
  ok("non-HTTPS wake URLs are rejected");
}

{
  assert.equal(
    getWakeWebhookUrlError("https://localhost/hooks/wake"),
    "Wake webhook must use a public host"
  );
  assert.match(
    getWakeWebhookUrlError("https://127.0.0.1/hooks/wake") ?? "",
    /Wake webhook must use a public (host|IPv4 address)/
  );
  assert.equal(
    getWakeWebhookUrlError("https://[::1]/hooks/wake"),
    "Wake webhook must use a public host"
  );
  ok("loopback wake targets are rejected");
}

{
  assert.match(
    getWakeWebhookUrlError("https://192.168.1.20/hooks/wake") ?? "",
    /Wake webhook must use a public (host|IPv4 address)/
  );
  assert.equal(
    getWakeWebhookUrlError("https://agent.internal/hooks/wake"),
    "Wake webhook must use a public host"
  );
  ok("private-network wake targets are rejected");
}

{
  assert.equal(
    getWakeWebhookUrlError("https://user:secret@agent.example.com/hooks/wake"),
    "Wake webhook URL must not include embedded credentials"
  );
  ok("embedded URL credentials are rejected");
}

console.log(`\nAll ${passed} agent-wake tests passed.`);
