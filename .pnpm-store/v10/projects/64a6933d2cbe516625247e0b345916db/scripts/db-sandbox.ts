/**
 * A private database named gtf_hr_sb_<name>. Only this derived database can be reset.
 * pnpm db:sandbox <name> [--reset] [--migrate] [--seed|--seed-only=time] [-- command args...]
 * Package managers sometimes consume the separator; the first non-option after the name starts the command.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const tokens = process.argv.slice(2);
const name = tokens.shift();
if (!name || !/^[a-z0-9_]{1,30}$/.test(name))
  throw new Error("Usage: pnpm db:sandbox <name> [--reset] [--migrate] [--seed] [-- command args...]");
const options: string[] = [];
while (tokens[0]?.startsWith("--") && tokens[0] !== "--") {
  const option = tokens.shift();
  if (!option || !/^(--reset|--migrate|--seed|--seed-only=[a-z0-9,-]+)$/.test(option))
    throw new Error("Unknown sandbox option. Use -- before command arguments.");
  options.push(option);
}
if (tokens[0] === "--") tokens.shift();
if (options.includes("--seed") && options.some((option) => option.startsWith("--seed-only=")))
  throw new Error("Choose --seed or --seed-only, not both.");

const base = new URL(process.env.DATABASE_URL ?? "");
if (!["postgresql:", "postgres:"].includes(base.protocol)) throw new Error("DATABASE_URL must use PostgreSQL.");
const database = `gtf_hr_sb_${name}`;
const sandboxUrl = new URL(base);
sandboxUrl.pathname = `/${database}`;
const env = { ...process.env, DATABASE_URL: sandboxUrl.toString() };

function run(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, { stdio: "inherit", env, cwd: root });
  if (result.error) throw new Error(`Unable to run ${executable}.`, { cause: result.error });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function prisma(args: string[]) {
  run(process.execPath, [require.resolve("prisma/build/index.js"), ...args]);
}
function tsx(args: string[]) {
  run(process.execPath, [require.resolve("tsx/cli"), ...args]);
}

const admin = new pg.Client({ connectionString: base.toString() });
await admin.connect();
try {
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${database}"`);
  console.info(`sandbox ${database}: ${exists.rowCount === 0 ? "created" : "exists"}`);
} finally {
  await admin.end();
}

if (options.includes("--migrate")) {
  if (options.includes("--reset")) {
    const sandbox = new pg.Client({ connectionString: sandboxUrl.toString() });
    await sandbox.connect();
    try {
      const current = await sandbox.query<{ name: string }>("SELECT current_database() AS name");
      if (current.rows[0]?.name !== database || !database.startsWith("gtf_hr_sb_"))
        throw new Error("Sandbox reset target mismatch.");
      await sandbox.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public");
    } finally {
      await sandbox.end();
    }
  }
  prisma(["migrate", "deploy"]);
} else {
  prisma([
    "db",
    "push",
    "--skip-generate",
    "--accept-data-loss",
    ...(options.includes("--reset") ? ["--force-reset"] : []),
  ]);
  const sandbox = new pg.Client({ connectionString: sandboxUrl.toString() });
  await sandbox.connect();
  try {
    for (const file of readdirSync(new URL("../prisma/sql/", import.meta.url))
      .filter((file) => file.endsWith(".sql"))
      .sort())
      await sandbox.query(readFileSync(new URL(`../prisma/sql/${file}`, import.meta.url), "utf8"));
  } finally {
    await sandbox.end();
  }
}

const seedOnly = options.find((option) => option.startsWith("--seed-only="));
if (options.includes("--seed")) tsx(["prisma/seed.ts"]);
else if (seedOnly) tsx(["prisma/seed.ts", ...seedOnly.slice(12).split(",")]);

if (tokens.length > 0) {
  // Resolve local Node CLIs without the Windows .cmd shim (or shell interpolation).
  if (["pnpm", "npm"].includes(tokens[0] ?? "") && tokens[1] === "exec") tokens.splice(0, 2);
  const [executable = "", ...args] = tokens;
  console.info(`sandbox ${database}: running ${executable}`);
  if (executable === "tsx") tsx(args);
  else if (executable === "prisma") prisma(args);
  else run(executable === "node" ? process.execPath : executable, args);
}
