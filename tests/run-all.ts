import { spawnSync } from "node:child_process";
import path from "node:path";

const tests = [
  "tests/agent-wake.test.ts",
  "tests/consent.test.ts",
  "tests/match-confirmation.test.ts",
  "tests/model-advice.test.ts",
  "tests/monitoring.test.ts",
  "tests/networking-goal.test.ts",
  "tests/privacy-sync.test.ts",
  "tests/e2e-core.test.ts",
];

for (const testFile of tests) {
  console.log(`\n> ${testFile}`);
  const result = spawnSync(process.execPath, ["--import", "tsx", path.resolve(testFile)], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nAll test files passed.");
