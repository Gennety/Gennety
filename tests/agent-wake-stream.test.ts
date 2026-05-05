import assert from "node:assert/strict";

import {
  createAgentWakeStream,
  emitWakeStreamEvent,
  getWakeStreamConnectionCount,
  hasLiveWakeStream,
} from "../src/lib/services/agent-wake-stream";

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`PASS: ${label}`);
}

async function readSome(reader: ReadableStreamDefaultReader<Uint8Array>, maxReads = 6) {
  const decoder = new TextDecoder();
  let text = "";
  for (let i = 0; i < maxReads; i++) {
    const result = await reader.read();
    if (result.done) break;
    text += decoder.decode(result.value);
    if (text.includes("event: wake")) break;
  }
  return text;
}

async function main() {
  const agentInternalId = "agent_internal_stream_test";
  const { stream } = createAgentWakeStream({
    agentInternalId,
    agentExternalId: "agent_stream_test",
  });
  const reader = stream.getReader();

  const startup = await readSome(reader, 3);
  assert.equal(hasLiveWakeStream(agentInternalId), true);
  assert.equal(getWakeStreamConnectionCount(agentInternalId), 1);
  assert.match(startup, /event: connected/);
  assert.match(startup, /event: resync/);
  ok("wake stream registers connection and sends startup events");

  const delivery = emitWakeStreamEvent(agentInternalId, {
    kind: "NEW_MESSAGE",
    reason: "New chat message",
    urgency: "high",
    referenceId: "chat_123",
  });
  assert.equal(delivery.delivered, true);
  assert.equal(delivery.connectionCount, 1);

  const wake = await readSome(reader);
  assert.match(wake, /event: wake/);
  assert.match(wake, /"kind":"NEW_MESSAGE"/);
  assert.match(wake, /"should_check_in":true/);
  ok("wake stream emits wake events to connected agents");

  await reader.cancel();
  assert.equal(hasLiveWakeStream(agentInternalId), false);
  assert.equal(getWakeStreamConnectionCount(agentInternalId), 0);
  ok("wake stream unregisters on client cancel");

  const fallbackDelivery = emitWakeStreamEvent("missing_agent", {
    kind: "GENERAL",
    reason: "No connection",
  });
  assert.equal(fallbackDelivery.delivered, false);
  assert.equal(fallbackDelivery.connectionCount, 0);
  ok("wake stream reports polling fallback when no connection is live");

  console.log(`\nAll ${passed} agent-wake-stream tests passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
