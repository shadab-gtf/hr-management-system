/**
 * One-time local setup: creates the application role and database named in DATABASE_URL on the local PostgreSQL
 * server. psql asks for the `postgres` superuser password in your terminal; nothing secret is printed.
 *
 *   pnpm db:setup-local                (uses PSQL_PATH or the newest C:\Program Files\PostgreSQL\<v>\bin\psql.exe)
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const url = new URL(process.env.DATABASE_URL ?? "");
const role = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const database = url.pathname.slice(1);
const identifier = /^[a-z_][a-z0-9_]{0,62}$/;

if (!identifier.test(role) || !identifier.test(database) || !/^[A-Za-z0-9]{16,}$/.test(password))
  throw new Error("DATABASE_URL must name a simple role/database and use an alphanumeric password (16+ chars).");

function findPsql(): string {
  if (process.env.PSQL_PATH) return process.env.PSQL_PATH;
  const root = "C:\\Program Files\\PostgreSQL";
  if (existsSync(root)) {
    const versions = readdirSync(root)
      .filter((name) => /^\d+$/.test(name))
      .sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const candidate = join(root, version, "bin", "psql.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  return "psql";
}

// CREATEDB lets `prisma migrate dev` create its temporary shadow database.
const sql = `
SELECT format('CREATE ROLE %I LOGIN CREATEDB PASSWORD %L', '${role}', '${password}')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') \\gexec
SELECT format('ALTER ROLE %I LOGIN CREATEDB PASSWORD %L', '${role}', '${password}') \\gexec
SELECT format('CREATE DATABASE %I OWNER %I', '${database}', '${role}')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${database}') \\gexec
\\echo Role and database are ready.
`;

const psql = spawn(
  findPsql(),
  [
    "-h",
    url.hostname,
    "-p",
    url.port || "5432",
    "-U",
    process.env.PG_SUPERUSER ?? "postgres",
    "-d",
    "postgres",
    "-q",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
psql.stdin.end(sql);
psql.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
