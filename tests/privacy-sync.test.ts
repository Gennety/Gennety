import assert from "assert";
import { buildPrivacyChangePayload } from "../src/lib/privacy-change";

{
  const payload = buildPrivacyChangePayload({
    previousExcludedTopics: [],
    nextExcludedTopics: ["Finances & debts"],
    allTopics: [
      "Health & personal issues",
      "Finances & debts",
      "Personal relationships",
      "Psychological topics",
    ],
  });

  assert.ok(payload, "payload should be created when topics change");
  assert.deepStrictEqual(payload?.newly_excluded, ["Finances & debts"]);
  assert.deepStrictEqual(payload?.newly_allowed, []);
  assert.strictEqual(payload?.suppress_search_until_republish, true);
  assert.ok(
    payload?.recommended_removals.some((item) => item.includes("financial")),
    "stricter privacy should suggest removing financial details"
  );

  console.log("PASS: stricter privacy change builds a suppression payload");
}

{
  const payload = buildPrivacyChangePayload({
    previousExcludedTopics: ["Psychological topics"],
    nextExcludedTopics: [],
    allTopics: [
      "Health & personal issues",
      "Finances & debts",
      "Personal relationships",
      "Psychological topics",
    ],
  });

  assert.ok(payload, "payload should be created when a topic becomes allowed");
  assert.deepStrictEqual(payload?.newly_excluded, []);
  assert.deepStrictEqual(payload?.newly_allowed, ["Psychological topics"]);
  assert.strictEqual(payload?.suppress_search_until_republish, false);
  assert.ok(
    payload?.recommended_additions.some((item) => item.includes("working style")),
    "looser privacy should suggest what can be added back"
  );

  console.log("PASS: looser privacy change builds addition guidance");
}

{
  const payload = buildPrivacyChangePayload({
    previousExcludedTopics: ["Health & personal issues"],
    nextExcludedTopics: ["Health & personal issues"],
    allTopics: [
      "Health & personal issues",
      "Finances & debts",
      "Personal relationships",
      "Psychological topics",
    ],
  });

  assert.strictEqual(payload, null, "unchanged topics should not generate work");

  console.log("PASS: unchanged privacy settings do not create a task");
}

console.log("\nAll privacy sync tests passed.");
