/** Each suite receives a fresh migrated database, so security revocation and year-end tests remain isolated. */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const suites = readdirSync(new URL("../tests/integration/", import.meta.url), { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => `tests/integration/${file.replaceAll("\\", "/")}`);
if (suites.length === 0) throw new Error("No integration suites found.");
// Password exists only for synthetic fixture accounts in the private test databases.
const env = {
  ...process.env,
  BACKGROUND_JOBS_ENABLED: "false",
  DEV_SEED_PASSWORD: process.env.DEV_SEED_PASSWORD ?? `Test-${randomBytes(24).toString("hex")}`,
};
const failed: string[] = [];
for (const suite of suites) {
  const name = `test_${createHash("sha256").update(suite).digest("hex").slice(0, 12)}`;
  console.info(`\nIntegration suite: ${suite}`);
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("tsx/cli"),
      "scripts/db-sandbox.ts",
      name,
      "--reset",
      "--migrate",
      ...(suite.endsWith("/bootstrap.test.ts") ? [] : ["--seed"]),
      "--",
      "tsx",
      "--test",
      suite,
    ],
    { cwd: root, env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) failed.push(suite);
}
if (failed.length) {
  console.error(`${failed.length} of ${suites.length} integration suites failed: ${failed.join(", ")}`);
  process.exitCode = 1;
} else console.info(`All ${suites.length} integration suites passed.`);
