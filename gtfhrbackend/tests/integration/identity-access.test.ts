/**
 * Deny-by-default access, super admin and department-wise grants (docs/decisions BE-003), end to end through HTTP.
 * Every request re-reads grants from the database, so each assertion below runs against a fresh token.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadActor } from "../../src/core/middleware/auth.middleware.js";
import { CAPABILITIES } from "../../src/core/security/capabilities.js";
import { createIdentityService } from "../../src/modules/identity/identity.service.js";
import { dataOf, expectProblem, newKey, personas, useTestApi, type ApiResult } from "../helpers/api.js";
import { expectContract, frontendContract } from "../helpers/contract.js";

const api = useTestApi();

const ENG = "dep_engineering";
const DESIGN = "dep_design";
/** Engineering people with only employee access (Farhan Qureshi, emp_0013, is their manager and the scoped HR). */
const sneha = "emp_0014";
const aditya = "emp_0015";
const riya = "emp_0016";
/** Design: outside the scoped HR operator's departments. */
const ishita = "emp_0009";

interface AccessOverview {
  accounts: {
    employeeId: string;
    department: string;
    roles: { role: string; departments: { id: string; name: string }[] }[];
  }[];
  outbox: { to: string }[];
  viewer: { employeeId: string; isSuperAdmin: boolean; grantable: { role: string; scope: "all" | string[] }[] };
  departments: { id: string; name: string }[];
}
interface SessionBody {
  employeeId: string;
  roles: string[];
  capabilities: string[];
}

/** Request as any seeded employee (not only the named personas). */
async function asEmployee(employeeId: string, method: string, path: string, body?: unknown): Promise<ApiResult> {
  return api.as(null, method, path, {
    headers: { Authorization: `Bearer ${await api.token(employeeId)}` },
    ...(body === undefined ? {} : { body }),
    ...(method === "POST" ? { idempotencyKey: newKey() } : {}),
  });
}

function change(
  persona: keyof typeof personas,
  op: "grant" | "revoke",
  employeeId: string,
  role: string,
  departmentIds: string[] = [],
): Promise<ApiResult> {
  return api.as(persona, "POST", `/identity/accounts/${employeeId}/roles/${op}`, {
    body: { role, reason: `Integration test ${op} of ${role}`, departmentIds },
    idempotencyKey: newKey(),
  });
}

const accountCommand = (
  persona: keyof typeof personas,
  employeeId: string,
  action: "invite" | "invite-link" | "disable" | "enable",
) =>
  api.as(persona, "POST", `/identity/accounts/${employeeId}/${action}`, {
    body: action === "disable" || action === "enable" ? { reason: "Integration test account change" } : {},
    idempotencyKey: newKey(),
  });

async function latestNotification(employeeId: string) {
  return api.prisma.notification.findFirst({ where: { employeeId }, orderBy: { createdAt: "desc" } });
}

test("super admin grants HR scoped to Engineering: the grantee's next request has exactly that reach", async () => {
  expectProblem(await asEmployee(sneha, "GET", "/identity/access"), 403);

  dataOf(await change("superAdmin", "grant", sneha, "hr_operator", [ENG]));

  const session = dataOf<SessionBody>(await asEmployee(sneha, "GET", "/me"));
  assert.ok(session.roles.includes("hr_operator"));
  assert.ok(session.capabilities.includes("access.manage"));
  assert.ok(session.capabilities.includes("employee.update"));

  const overview = dataOf<AccessOverview>(await asEmployee(sneha, "GET", "/identity/access"));
  assert.ok(overview.accounts.length > 1);
  assert.ok(overview.accounts.every((account) => account.department === "Engineering"));
  assert.ok(overview.accounts.some((account) => account.employeeId === aditya));
  assert.deepEqual(
    overview.viewer.grantable.find((grantable) => grantable.role === "hr_operator"),
    { role: "hr_operator", scope: [ENG] },
  );
  // The new HR partner can act inside Engineering and gets 404 for other departments.
  expectProblem(await asEmployee(sneha, "POST", `/identity/accounts/${ishita}/invite`, {}), 404);

  // The administrator's listing shows the grant with its scope.
  const admin = dataOf<AccessOverview>(await api.as("superAdmin", "GET", "/identity/access"));
  const grant = admin.accounts
    .find((account) => account.employeeId === sneha)
    ?.roles.find((role) => role.role === "hr_operator");
  assert.deepEqual(grant?.departments, [{ id: ENG, name: "Engineering" }]);

  // Audited with the scope, and the grantee is notified.
  const audit = await api.prisma.auditLog.findFirst({
    where: { action: "identity.role.grant.details", entityId: sneha },
    orderBy: { at: "desc" },
  });
  assert.ok(audit, "the grant is audited");
  assert.equal(audit.actorEmployeeId, personas.superAdmin);
  const details = audit.details as { departmentIds: string[]; role: string };
  assert.deepEqual(details.departmentIds, [ENG]);
  assert.equal(details.role, "hr_operator");
  assert.equal((await latestNotification(sneha))?.title, "You have new access");
});

test("a revoke takes effect on the very next request", async () => {
  dataOf(await change("superAdmin", "revoke", sneha, "hr_operator"));
  expectProblem(await asEmployee(sneha, "GET", "/identity/access"), 403);
  const session = dataOf<SessionBody>(await asEmployee(sneha, "GET", "/me"));
  assert.ok(!session.roles.includes("hr_operator"));
  assert.ok(!session.capabilities.includes("access.manage"));
  assert.ok(session.capabilities.includes("leave.request.self"), "the employee role stays");
  assert.equal((await latestNotification(sneha))?.title, "Your access changed");
  assert.ok(
    await api.prisma.auditLog.findFirst({ where: { action: "identity.role.revoke.details", entityId: sneha } }),
  );
});

test("a department-scoped HR operator grants only inside their departments and never wider than they hold", async () => {
  // Organization-wide, other departments, or a mix: all too wide.
  expectProblem(await change("scopedHr", "grant", aditya, "hr_operator"), 403, "SCOPE_TOO_WIDE");
  expectProblem(await change("scopedHr", "grant", aditya, "hr_operator", [DESIGN]), 403, "SCOPE_TOO_WIDE");
  expectProblem(await change("scopedHr", "grant", aditya, "hr_operator", [ENG, DESIGN]), 403, "SCOPE_TOO_WIDE");
  // Roles they do not hold.
  expectProblem(await change("scopedHr", "grant", aditya, "payroll_operator", [ENG]), 403, "ROLE_NOT_GRANTABLE");
  expectProblem(await change("scopedHr", "grant", aditya, "payroll_approver", [ENG]), 403, "ROLE_NOT_GRANTABLE");
  expectProblem(await change("scopedHr", "grant", aditya, "super_admin"), 403, "ROLE_NOT_GRANTABLE");
  // Their own access.
  expectProblem(await change("scopedHr", "grant", personas.scopedHr, "hr_operator", [ENG]), 403, "SELF_ACCESS_CHANGE");
  expectProblem(await change("scopedHr", "revoke", personas.scopedHr, "manager"), 403, "SELF_ACCESS_CHANGE");
  expectProblem(await accountCommand("scopedHr", personas.scopedHr, "disable"), 403, "SELF_ACCESS_CHANGE");
  // Only HR and payroll roles can be limited to departments.
  expectProblem(await change("scopedHr", "grant", aditya, "manager", [ENG]), 400, "ROLE_NOT_SCOPABLE");
  // Nothing above changed anything.
  assert.deepEqual(
    (await api.prisma.roleAssignment.findMany({ where: { employeeId: aditya } })).map(({ role }) => role),
    ["employee"],
  );

  // Inside Engineering, scoped to Engineering: allowed, audited and notified.
  dataOf(await change("scopedHr", "grant", aditya, "hr_operator", [ENG]));
  assert.ok((await asEmployee(aditya, "GET", "/me").then((r) => dataOf<SessionBody>(r))).roles.includes("hr_operator"));
  assert.ok(
    await api.prisma.auditLog.findFirst({
      where: { action: "identity.role.grant.details", entityId: aditya, actorEmployeeId: personas.scopedHr },
    }),
  );
  assert.equal((await latestNotification(aditya))?.title, "You have new access");
  dataOf(await change("scopedHr", "revoke", aditya, "hr_operator"));
  expectProblem(await asEmployee(aditya, "GET", "/identity/access"), 403);

  // Re-granting replaces a grant, so a scoped operator cannot narrow someone's organization-wide access either.
  const karan = "emp_0017";
  dataOf(await change("superAdmin", "grant", karan, "hr_operator"));
  expectProblem(await change("scopedHr", "grant", karan, "hr_operator", [ENG]), 403, "SCOPE_TOO_WIDE");
  expectProblem(await change("scopedHr", "revoke", karan, "hr_operator"), 403, "SCOPE_TOO_WIDE");
  expectProblem(await accountCommand("scopedHr", karan, "disable"), 403, "SCOPE_TOO_WIDE");
  assert.equal(
    await api.prisma.roleScope.count({ where: { employeeId: karan, role: "hr_operator" } }),
    0,
    "still organization-wide",
  );
  dataOf(await change("superAdmin", "revoke", karan, "hr_operator"));
});

test("a scoped HR operator gets 404 for every account action outside their departments", async () => {
  expectProblem(await change("scopedHr", "grant", ishita, "employee"), 404);
  expectProblem(await change("scopedHr", "grant", ishita, "hr_operator", [ENG]), 404);
  expectProblem(await change("scopedHr", "revoke", ishita, "employee"), 404);
  for (const action of ["invite", "invite-link", "disable", "enable"] as const)
    expectProblem(await accountCommand("scopedHr", ishita, action), 404);
  // Unknown ids look the same, so other departments cannot be probed.
  expectProblem(await change("scopedHr", "grant", "emp_9999", "employee"), 404);
  assert.equal(await api.prisma.userAccount.count({ where: { employeeId: ishita, disabledAt: { not: null } } }), 0);
});

test("the access listing for a scoped HR operator contains only their departments' accounts and mail", async () => {
  const { accessOverviewSchema } = await frontendContract("identity");
  const scoped = dataOf<AccessOverview>(await api.as("scopedHr", "GET", "/identity/access"));
  expectContract(accessOverviewSchema, scoped);
  assert.ok(scoped.accounts.length > 0);
  assert.ok(scoped.accounts.every((account) => account.department === "Engineering"));
  assert.ok(!scoped.accounts.some((account) => account.employeeId === ishita));
  const engineeringEmails = new Set(
    (await api.prisma.employee.findMany({ where: { departmentId: ENG }, select: { workEmail: true } })).map(
      ({ workEmail }) => workEmail,
    ),
  );
  assert.ok(scoped.outbox.every((message) => engineeringEmails.has(message.to)));
  assert.equal(scoped.viewer.isSuperAdmin, false);
  assert.ok(!scoped.viewer.grantable.some((grantable) => grantable.role === "super_admin"));
  assert.ok(!scoped.viewer.grantable.some((grantable) => grantable.role.startsWith("payroll_")));

  const all = dataOf<AccessOverview>(await api.as("superAdmin", "GET", "/identity/access"));
  expectContract(accessOverviewSchema, all);
  assert.ok(all.accounts.some((account) => account.department === "Design"));
  assert.equal(all.viewer.isSuperAdmin, true);
  assert.equal(all.viewer.grantable.length, 6);
  assert.ok(all.viewer.grantable.every((grantable) => grantable.scope === "all"));
  assert.ok(all.departments.some((department) => department.id === ENG));
});

test("only a super admin changes super admin access, nobody changes their own, and one always remains", async () => {
  // Organization-wide HR cannot grant, revoke or lock out a super admin.
  expectProblem(await change("hr", "grant", sneha, "super_admin"), 403, "ROLE_NOT_GRANTABLE");
  expectProblem(await change("hr", "revoke", personas.superAdmin, "super_admin"), 403, "ROLE_NOT_GRANTABLE");
  expectProblem(await accountCommand("hr", personas.superAdmin, "disable"), 403, "ROLE_NOT_GRANTABLE");
  // Disabling someone needs the right to revoke every role they hold.
  expectProblem(await accountCommand("hr", personas.payroll, "disable"), 403, "ROLE_NOT_GRANTABLE");
  // The super admin cannot remove or disable themselves.
  expectProblem(await change("superAdmin", "revoke", personas.superAdmin, "super_admin"), 403, "SELF_ACCESS_CHANGE");
  expectProblem(await accountCommand("superAdmin", personas.superAdmin, "disable"), 403, "SELF_ACCESS_CHANGE");

  // Two super admins revoking each other at once: the second request was authorized before the first committed.
  dataOf(await change("superAdmin", "grant", personas.hr, "super_admin"));
  const staleSecondAdmin = await loadActor(api.prisma, personas.hr, { issuedAt: Date.now(), mfaVerified: true });
  assert.ok(staleSecondAdmin.roles.includes("super_admin"));
  dataOf(await change("superAdmin", "revoke", personas.hr, "super_admin"));
  const service = createIdentityService(api.prisma);
  const context = () => ({ requestId: `test-${crypto.randomUUID()}`, key: newKey(), version: undefined });
  await assert.rejects(
    service.role(
      staleSecondAdmin,
      personas.superAdmin,
      "revoke",
      { role: "super_admin", reason: "Concurrent revoke", departmentIds: [] },
      context(),
    ),
    (error: { code?: string }) => error.code === "LAST_SUPER_ADMIN",
  );
  await assert.rejects(
    service.disable(staleSecondAdmin, personas.superAdmin, true, "Concurrent disable", context()),
    (error: { code?: string }) => error.code === "LAST_SUPER_ADMIN",
  );
  const superAdmins = await api.prisma.roleAssignment.findMany({ where: { role: "super_admin" } });
  assert.deepEqual(
    superAdmins.map(({ employeeId }) => employeeId),
    [personas.superAdmin],
  );
  assert.equal(
    (await api.prisma.userAccount.findUnique({ where: { employeeId: personas.superAdmin } }))?.disabledAt,
    null,
  );
});

test("an account with every role revoked is denied everywhere but still has a session with no capabilities", async () => {
  const { sessionSchema } = await frontendContract("session");
  dataOf(await change("superAdmin", "revoke", riya, "employee"));

  const session = dataOf<SessionBody>(await asEmployee(riya, "GET", "/me"));
  expectContract(sessionSchema, session);
  assert.equal(session.employeeId, riya);
  assert.deepEqual(session.roles, []);
  assert.deepEqual(session.capabilities, []);
  const account = dataOf<{ roles: string[]; capabilities: string[] }>(await asEmployee(riya, "GET", "/auth/me"));
  assert.deepEqual(account.roles, []);
  assert.deepEqual(account.capabilities, []);

  expectProblem(await asEmployee(riya, "GET", "/leave/overview"), 403);
  expectProblem(await asEmployee(riya, "GET", "/leave/comp-off"), 403);
  expectProblem(await asEmployee(riya, "GET", "/identity/access"), 403);
  expectProblem(await asEmployee(riya, "GET", "/audit"), 403);

  // Granting the employee role again restores self-service on the next request.
  dataOf(await change("superAdmin", "grant", riya, "employee"));
  dataOf(await asEmployee(riya, "GET", "/leave/overview"));
});

test("GET /me matches the session contract; a super admin holds every capability", async () => {
  const { sessionSchema } = await frontendContract("session");
  for (const persona of ["superAdmin", "scopedHr", "employee"] as const)
    expectContract(sessionSchema, dataOf(await api.as(persona, "GET", "/me")));
  const admin = dataOf<SessionBody>(await api.as("superAdmin", "GET", "/me"));
  assert.ok(admin.roles.includes("super_admin"));
  assert.deepEqual([...admin.capabilities].sort(), [...CAPABILITIES].sort());
});

test("the audit trail needs organization-wide audit access", async () => {
  const { auditPageSchema } = await frontendContract("identity");
  expectProblem(await api.as("scopedHr", "GET", "/audit"), 403, "ORG_WIDE_ACCESS_REQUIRED");
  expectProblem(await api.as("employee", "GET", "/audit"), 403);
  expectProblem(await api.as("payroll", "GET", "/audit"), 403);
  for (const persona of ["hr", "superAdmin"] as const)
    expectContract(auditPageSchema, dataOf(await api.as(persona, "GET", "/audit", { query: { entity: "employee" } })));
  const page = dataOf<{ items: { action: string }[] }>(
    await api.as("superAdmin", "GET", "/audit", { query: { entity: "employee" } }),
  );
  assert.ok(page.items.some((item) => item.action === "identity.role.grant.details"));
});
