import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { dataOf, expectProblem, useTestApi } from "../helpers/api.js";

const require = createRequire(import.meta.url);
const api = useTestApi();
const password = "Bootstrap-test-operator-2026";
function command(
  script: string,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [require.resolve("tsx/cli"), script, ...args], {
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

test("clean deployment bootstraps organization and exactly one enabled HR account", async () => {
  assert.equal(await api.prisma.employee.count(), 0, "Run this suite in an unseeded migrated sandbox.");
  const organization = await command("scripts/bootstrap-organization.ts", ["config-examples/organization.json"]);
  assert.equal(organization.code, 0, organization.output);
  assert.equal(await api.prisma.employee.count(), 0);
  const env = {
    HR_BOOTSTRAP_CONFIRM: "true",
    HR_BOOTSTRAP_NAME: "Initial HR",
    HR_BOOTSTRAP_EMAIL: "hr@your-company.example",
    HR_BOOTSTRAP_PASSWORD: password,
    HR_BOOTSTRAP_DEPARTMENT_ID: "people",
    HR_BOOTSTRAP_LOCATION_ID: "head-office",
  };
  const results = await Promise.all([
    command("scripts/bootstrap-hr.ts", [], env),
    command("scripts/bootstrap-hr.ts", [], env),
  ]);
  assert.equal(
    results.filter((result) => result.code === 0).length,
    1,
    results.map((result) => result.output).join("\n"),
  );
  assert.equal(await api.prisma.employee.count(), 1);
  assert.equal(await api.prisma.userAccount.count({ where: { disabledAt: null } }), 1);
  assert.equal(await api.prisma.roleAssignment.count({ where: { role: "hr_operator" } }), 1);
  const login = dataOf<{ accessToken: string; employee: { id: string } }>(
    await api.as(null, "POST", "/auth/login", { body: { email: env.HR_BOOTSTRAP_EMAIL, password } }),
  );
  assert.equal(login.employee.id, "emp_0001");
  const headers = { Authorization: `Bearer ${login.accessToken}` };
  dataOf(await api.as(null, "GET", "/me", { headers }));
  expectProblem(await api.as(null, "GET", "/identity/access", { headers }), 403);
  assert.notEqual((await command("scripts/bootstrap-organization.ts", ["config-examples/organization.json"])).code, 0);
  assert.equal(await api.prisma.auditLog.count({ where: { action: "identity.hr_bootstrapped" } }), 1);
});

test("migration enforces employee references and append-only audit records", async () => {
  await assert.rejects(
    api.prisma.workspaceRecord.create({
      data: { id: "invalid-owner", kind: "ticket", ownerId: "missing-employee", data: {} },
    }),
    { code: "P2003" },
  );
  const audit = await api.prisma.auditLog.findFirstOrThrow();
  await assert.rejects(api.prisma.auditLog.update({ where: { id: audit.id }, data: { action: "tampered" } }));
  await assert.rejects(api.prisma.auditLog.delete({ where: { id: audit.id } }));
  assert.equal((await api.prisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } })).action, audit.action);
});
