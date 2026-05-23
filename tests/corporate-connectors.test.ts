import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  redactCorporateWebhookText,
  verifySlackRequestSignature,
} from "../src/lib/connectors/corporate/security";
import {
  buildSlackAppHomeView,
  buildSlackApprovalBlocks,
} from "../src/lib/connectors/corporate/slack";
import { normalizeJiraWebhookActivity } from "../src/lib/connectors/corporate/jira";

{
  const signingSecret = "test_signing_secret";
  const timestamp = "1710000000";
  const body = "payload=%7B%22type%22%3A%22block_actions%22%7D";
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;

  assert.equal(
    verifySlackRequestSignature({
      signingSecret,
      body,
      timestamp,
      signature,
      now: Number(timestamp) * 1000 + 1000,
    }),
    true
  );
  assert.equal(
    verifySlackRequestSignature({
      signingSecret,
      body,
      timestamp,
      signature,
      now: Number(timestamp) * 1000 + 10 * 60 * 1000,
    }),
    false
  );

  console.log("PASS: Slack request signature verification checks HMAC and timestamp freshness");
}

{
  const redacted = redactCorporateWebhookText(
    "Deploy with SLACK_BOT_TOKEN=xoxb-secret and DATABASE_URL=postgres://secret"
  );

  assert.equal(redacted.content.includes("SLACK_BOT_TOKEN"), false);
  assert.equal(redacted.content.includes("DATABASE_URL"), false);
  assert.ok(redacted.redactions.length >= 1);

  console.log("PASS: corporate webhook redaction removes confidential environment references");
}

{
  const blocks = buildSlackApprovalBlocks({
    taskId: "task_123",
    title: "Publish release notes",
    riskLevel: "HIGH",
    requestedBy: "agent_alpha",
    explanation: "External publication needs owner approval.",
  });
  const actions = blocks[1].elements as Array<Record<string, unknown>>;

  assert.equal(actions[0].action_id, "gennety_task_approve");
  assert.equal(actions[1].action_id, "gennety_task_reject");
  assert.deepEqual(JSON.parse(actions[0].value as string), { taskId: "task_123" });

  console.log("PASS: Slack approval blocks carry deterministic approve/reject task payloads");
}

{
  const view = buildSlackAppHomeView({
    communityName: "Corporate Hub",
    activeMembers: 3,
    monthTokensUsed: 1200,
    monthlySpentPercent: 96.2,
    shouldDegradeQuality: true,
    tasks: [
      {
        id: "task_1",
        title: "Review launch plan",
        status: "APPROVAL_REQUIRED",
        riskLevel: "HIGH",
        assigneeId: null,
      },
    ],
    handshakes: [{ id: "handshake_1", status: "PENDING", summary: "Founder/operator match" }],
  });
  const serialized = JSON.stringify(view);

  assert.equal(view.type, "home");
  assert.equal(serialized.includes("Quality model routing is degraded"), true);
  assert.equal(serialized.includes("Review launch plan"), true);
  assert.equal(serialized.includes("Founder/operator match"), true);

  console.log("PASS: Slack App Home view includes status, budget, tasks, and match feed sections");
}

{
  const normalized = normalizeJiraWebhookActivity({
    deliveryId: "delivery_1",
    eventName: "jira:issue_updated",
    payload: {
      issue: {
        key: "GEN-12",
        fields: { summary: "Add corporate connector" },
      },
      user: { displayName: "Maya" },
      changelog: {
        items: [{ field: "status", fromString: "In Progress", toString: "Done" }],
      },
      comment: { body: "Done without exposing xoxb-secret-token" },
    },
  });

  assert.equal(normalized.issueKey, "GEN-12");
  assert.equal(normalized.content.startsWith("Jira webhook delivery_1:"), true);
  assert.equal(normalized.content.includes("In Progress -> Done"), true);
  assert.equal(normalized.content.includes("xoxb-secret-token"), false);

  console.log("PASS: Jira webhooks normalize status/comment activity with secret redaction");
}

console.log("\nAll corporate connector tests passed.");
