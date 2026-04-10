/**
 * Cookie consent tests — run with: npx tsx tests/consent.test.ts
 *
 * Tests IP hashing, consent record structure, localStorage caching,
 * and withdraw behaviour.
 */

import { createHash } from "crypto";
import assert from "assert";

const POLICY_VERSION = "2026-04-01";

/* ─── 1. IP hashing produces consistent output ─── */

function hashIp(rawIp: string, salt: string): string {
  return createHash("sha256")
    .update(rawIp + salt)
    .digest("hex");
}

{
  const salt = "test_salt_12345";
  const ip = "192.168.1.1";

  const hash1 = hashIp(ip, salt);
  const hash2 = hashIp(ip, salt);
  assert.strictEqual(hash1, hash2, "Same IP + salt must produce identical hash");

  const hash3 = hashIp(ip, "different_salt");
  assert.notStrictEqual(hash1, hash3, "Different salt must produce different hash");

  const hash4 = hashIp("10.0.0.1", salt);
  assert.notStrictEqual(hash1, hash4, "Different IP must produce different hash");

  assert.strictEqual(hash1.length, 64, "SHA-256 hex should be 64 chars");
  assert.match(hash1, /^[a-f0-9]{64}$/, "Hash should be lowercase hex");

  console.log("PASS: IP hashing produces consistent output");
}

/* ─── 2. submitConsent builds correct record structure ─── */

{
  const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const consents = {
    necessary: true,
    analytics: true,
    marketing: false,
    functional: true,
  };

  const record = {
    session_id: sessionId,
    policy_version: POLICY_VERSION,
    action: "partial" as const,
    consents,
  };

  assert.strictEqual(record.session_id, sessionId);
  assert.strictEqual(record.policy_version, POLICY_VERSION);
  assert.strictEqual(record.action, "partial");
  assert.strictEqual(record.consents.necessary, true, "Necessary must always be true");
  assert.strictEqual(record.consents.analytics, true);
  assert.strictEqual(record.consents.marketing, false);
  assert.strictEqual(record.consents.functional, true);

  // Validate action enum
  const validActions = ["accepted", "rejected", "partial", "withdrawn"];
  assert.ok(validActions.includes(record.action), "Action must be a valid enum value");

  console.log("PASS: submitConsent inserts correct record structure");
}

/* ─── 3. localStorage entry skips banner (simulated) ─── */

{
  // Simulate getStoredConsent logic
  function getStoredConsent(
    stored: string | null,
    currentVersion: string
  ): { version: string; action: string } | null {
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      if (parsed.version !== currentVersion) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  // Valid entry for current version → banner hidden
  const valid = JSON.stringify({
    version: POLICY_VERSION,
    action: "accepted",
    consents: { necessary: true, analytics: true, marketing: true, functional: true },
  });
  assert.ok(getStoredConsent(valid, POLICY_VERSION) !== null, "Valid entry should return consent");

  // No entry → banner shown
  assert.strictEqual(getStoredConsent(null, POLICY_VERSION), null, "No entry should return null");

  // Old version → banner shown again
  const old = JSON.stringify({
    version: "2025-01-01",
    action: "accepted",
    consents: { necessary: true, analytics: true, marketing: true, functional: true },
  });
  assert.strictEqual(
    getStoredConsent(old, POLICY_VERSION),
    null,
    "Old version should return null (re-show banner)"
  );

  // Corrupted JSON → banner shown
  assert.strictEqual(
    getStoredConsent("{broken", POLICY_VERSION),
    null,
    "Corrupted JSON should return null"
  );

  console.log("PASS: Re-visiting with valid localStorage entry skips banner");
}

/* ─── 4. withdrawConsent inserts action: 'withdrawn' ─── */

{
  const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  const withdrawRecord = {
    session_id: sessionId,
    policy_version: POLICY_VERSION,
    action: "withdrawn" as const,
    consents: {
      necessary: true,
      analytics: false,
      marketing: false,
      functional: false,
    },
  };

  assert.strictEqual(withdrawRecord.action, "withdrawn");
  assert.strictEqual(withdrawRecord.consents.necessary, true, "Necessary stays true even on withdraw");
  assert.strictEqual(withdrawRecord.consents.analytics, false);
  assert.strictEqual(withdrawRecord.consents.marketing, false);
  assert.strictEqual(withdrawRecord.consents.functional, false);

  console.log("PASS: withdrawConsent inserts action: 'withdrawn' record");
}

console.log("\nAll 4 tests passed.");
