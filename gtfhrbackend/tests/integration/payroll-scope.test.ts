/**
 * Department-wise permissions (BE-003) for payroll and statutory. The scoped persona (emp_0013, HR operator for
 * Engineering) is additionally granted payroll operator + approver limited to Engineering for the duration of this
 * file, so it exercises department-scoped payroll reach; the grants are removed afterwards.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { dataOf, expectProblem, newKey, personas, useTestApi } from "../helpers/api.js";
import { todayInOrgZone } from "../../src/utils/date.js";
import { editableStates, fiscalYear } from "../../src/modules/payroll/payroll.rules.js";

const api = useTestApi();
const scoped = personas.scopedHr;
const designEmployee = personas.employee; // emp_0007, Design
const scopedRoles = ["payroll_operator", "payroll_approver"] as const;
let engineeringId = "";
let engineeringIds = new Set<string>();
let runId = "";
let runState = "";
let fullRunSize = 0;
let engineeringInRun = "";

before(async () => {
  const department = await api.prisma.department.findFirstOrThrow({ where: { name: "Engineering" } });
  engineeringId = department.id;
  engineeringIds = new Set(
    (await api.prisma.employee.findMany({ where: { departmentId: engineeringId }, select: { id: true } })).map(
      ({ id }) => id,
    ),
  );
  const run = await api.prisma.payRun.findUniqueOrThrow({
    where: { month: todayInOrgZone().slice(0, 7) },
    include: { results: true },
  });
  runId = run.id;
  runState = run.state;
  fullRunSize = run.results.length;
  const candidate = run.results.find((row) => engineeringIds.has(row.employeeId) && row.employeeId !== scoped);
  assert.ok(candidate, "the seeded current run has an Engineering employee");
  engineeringInRun = candidate.employeeId;
  assert.ok(run.results.some((row) => row.employeeId === designEmployee));
});

after(async () => {
  await api.prisma.roleAssignment.deleteMany({ where: { employeeId: scoped, role: { in: [...scopedRoles] } } });
});

async function grantScopedPayroll() {
  for (const role of scopedRoles) {
    await api.prisma.roleAssignment.upsert({
      where: { employeeId_role: { employeeId: scoped, role } },
      update: {},
      create: { employeeId: scoped, role, reason: "payroll-scope test" },
    });
    await api.prisma.roleScope.upsert({
      where: { employeeId_role_departmentId: { employeeId: scoped, role, departmentId: engineeringId } },
      update: {},
      create: { employeeId: scoped, role, departmentId: engineeringId },
    });
  }
}

test("without a payroll grant: scoped HR and employees are denied, self-service still works", async () => {
  for (const persona of ["scopedHr", "employee", "hr"] as const) {
    expectProblem(await api.as(persona, "GET", "/payroll/overview"), 403);
    expectProblem(await api.as(persona, "GET", "/payroll/statutory/employees"), 403);
    expectProblem(await api.as(persona, "GET", `/payroll/runs/${runId}`), 403);
  }
  expectProblem(
    await api.as("employee", "PATCH", `/payroll/statutory/employees/${designEmployee}`, {
      body: { employeeId: designEmployee, uan: "", esiIp: "", vpfPercent: "0", pfOptOut: "no" },
    }),
    403,
  );
  expectProblem(await api.as("employee", "GET", "/payroll/form-16/emp_0006"), 403);
  expectProblem(
    await api.as("employee", "POST", `/payroll/runs/${runId}/holds`, {
      body: { employeeId: designEmployee, reason: "Employee cannot hold salary" },
    }),
    403,
  );
  assert.ok(Array.isArray(dataOf(await api.as("employee", "GET", "/me/payslips"))));
  dataOf(await api.as("employee", "GET", "/me/tax/form-16"));
});

test("department-scoped payroll reads cover only the granted departments", async () => {
  await grantScopedPayroll();

  // Overview and run detail: only Engineering rows; org-wide personas still see every row.
  const overview = dataOf<{ current: { id: string; employeeCount: number } }>(
    await api.as("scopedHr", "GET", "/payroll/overview"),
  );
  const engineeringCount = (
    await api.prisma.payResult.findMany({ where: { runId }, select: { employeeId: true } })
  ).filter((row) => engineeringIds.has(row.employeeId)).length;
  assert.equal(overview.current.id, runId);
  assert.equal(overview.current.employeeCount, engineeringCount);
  assert.ok(engineeringCount < fullRunSize);

  type Detail = {
    register: { employee: { id: string } }[];
    employeeCount: number;
    commands: { canSubmit: boolean; canPublish: boolean; canApprove: boolean; canEditInputs: boolean };
    bankAdvice: { canExport: boolean; exports: unknown[] };
  };
  const detail = dataOf<Detail>(await api.as("scopedHr", "GET", `/payroll/runs/${runId}`));
  assert.ok(detail.register.length > 0);
  assert.ok(detail.register.every((row) => engineeringIds.has(row.employee.id)));
  assert.ok(!detail.register.some((row) => row.employee.id === designEmployee));
  assert.equal(detail.commands.canSubmit, false);
  assert.equal(detail.commands.canPublish, false);
  assert.equal(detail.commands.canApprove, false);
  assert.equal(detail.bankAdvice.canExport, false);
  assert.deepEqual(detail.bankAdvice.exports, []);

  for (const persona of ["payroll", "superAdmin", "finance"] as const) {
    const full = dataOf<Detail>(await api.as(persona, "GET", `/payroll/runs/${runId}`));
    assert.equal(full.register.length, fullRunSize, persona);
    assert.equal(
      dataOf<{ current: { employeeCount: number } }>(await api.as(persona, "GET", "/payroll/overview")).current
        .employeeCount,
      fullRunSize,
    );
  }

  // Statutory employee records.
  type Rows = { rows: { employee: { id: string } }[]; canEdit: boolean };
  const statutory = dataOf<Rows>(await api.as("scopedHr", "GET", "/payroll/statutory/employees"));
  assert.ok(statutory.rows.length > 0);
  assert.ok(statutory.rows.every((row) => engineeringIds.has(row.employee.id)));
  for (const persona of ["payroll", "superAdmin"] as const) {
    const all = dataOf<Rows>(await api.as(persona, "GET", "/payroll/statutory/employees"));
    assert.ok(
      all.rows.some((row) => row.employee.id === designEmployee),
      persona,
    );
    assert.ok(all.rows.length > statutory.rows.length);
  }

  // Form 16 status list and another employee's certificate.
  const fy = fiscalYear(todayInOrgZone().slice(0, 7)).key;
  const status = dataOf<{ rows: { employee: { id: string } }[]; canGenerate: boolean }>(
    await api.as("scopedHr", "GET", "/payroll/form-16", { query: { fy } }),
  );
  assert.ok(status.rows.every((row) => engineeringIds.has(row.employee.id)));
  assert.equal(status.canGenerate, false);
  expectProblem(await api.as("scopedHr", "GET", `/payroll/form-16/${designEmployee}`, { query: { fy } }), 404);
  dataOf(await api.as("scopedHr", "GET", `/payroll/form-16/${engineeringInRun}`, { query: { fy } }));
  dataOf(await api.as("superAdmin", "GET", `/payroll/form-16/${designEmployee}`, { query: { fy } }));
  dataOf(await api.as("payroll", "GET", `/payroll/form-16/${designEmployee}`, { query: { fy } }));
});

test("department-scoped payroll commands on a person are limited to the granted departments", async () => {
  await grantScopedPayroll();
  const profileBody = (employeeId: string) => ({ employeeId, uan: "", esiIp: "", vpfPercent: "0", pfOptOut: "no" });

  // Statutory profile and bank verification of a Design employee: 404 (cannot be probed); Engineering works.
  expectProblem(
    await api.as("scopedHr", "PATCH", `/payroll/statutory/employees/${designEmployee}`, {
      body: profileBody(designEmployee),
    }),
    404,
  );
  const engineeringProfile = await api.prisma.payProfile.findUniqueOrThrow({ where: { employeeId: engineeringInRun } });
  dataOf(
    await api.as("scopedHr", "PATCH", `/payroll/statutory/employees/${engineeringInRun}`, {
      body: {
        ...profileBody(engineeringInRun),
        uan: engineeringProfile.uan ?? "",
        esiIp: engineeringProfile.esiIp ?? "",
        vpfPercent: String(engineeringProfile.vpfPercent),
        pfOptOut: engineeringProfile.pfOptOut ? "yes" : "no",
      },
    }),
  );
  expectProblem(
    await api.as("scopedHr", "POST", `/payroll/statutory/employees/${designEmployee}/bank-verification`, {
      body: { decision: "verified" },
    }),
    404,
  );
  // Organization-wide approvers keep the verify-bank command for every department.
  assert.equal(
    dataOf<{ canVerifyBank: boolean }>(await api.as("finance", "GET", "/payroll/statutory/employees")).canVerifyBank,
    true,
  );

  // Salary holds: Design employee 404; Engineering hold + release works; super admin works on anyone.
  expectProblem(
    await api.as("scopedHr", "POST", `/payroll/runs/${runId}/holds`, {
      body: { employeeId: designEmployee, reason: "Scoped operator outside their department" },
      idempotencyKey: newKey(),
    }),
    404,
  );
  assert.ok(editableStates.includes(runState), `seeded current run is editable (${runState})`);
  const hold = dataOf<{ id: string }>(
    await api.as("scopedHr", "POST", `/payroll/runs/${runId}/holds`, {
      body: { employeeId: engineeringInRun, reason: "Scoped operator inside their department" },
      idempotencyKey: newKey(),
    }),
  );
  dataOf(
    await api.as("scopedHr", "POST", `/payroll/runs/${runId}/holds/${hold.id}/release`, {
      body: { note: "Released after review" },
    }),
  );
  const adminHold = dataOf<{ id: string }>(
    await api.as("superAdmin", "POST", `/payroll/runs/${runId}/holds`, {
      body: { employeeId: designEmployee, reason: "Super admin holds any department" },
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(
    await api.as("scopedHr", "POST", `/payroll/runs/${runId}/holds/${adminHold.id}/release`, {
      body: { note: "Outside my department" },
    }),
    404,
  );
  dataOf(
    await api.as("superAdmin", "POST", `/payroll/runs/${runId}/holds/${adminHold.id}/release`, {
      body: { note: "Released by super admin" },
    }),
  );

  // Payroll inputs: Design employee 404; Engineering add + remove works.
  expectProblem(
    await api.as("scopedHr", "POST", `/payroll/runs/${runId}/inputs`, {
      body: { employeeId: designEmployee, kind: "bonus", amount: "100", note: "Outside my department" },
      idempotencyKey: newKey(),
    }),
    404,
  );
  const input = dataOf<{ id: string }>(
    await api.as("scopedHr", "POST", `/payroll/runs/${runId}/inputs`, {
      body: { employeeId: engineeringInRun, kind: "bonus", amount: "100", note: "Engineering spot bonus" },
      idempotencyKey: newKey(),
    }),
  );
  dataOf(await api.as("scopedHr", "POST", `/payroll/runs/${runId}/inputs/${input.id}/remove`));
});

test("organization-level payroll and statutory actions need an organization-wide grant", async () => {
  await grantScopedPayroll();
  const month = todayInOrgZone().slice(0, 7);
  const fy = fiscalYear(month).key;
  const orgWide = async (method: string, path: string, options: Parameters<typeof api.as>[3] = {}) =>
    expectProblem(await api.as("scopedHr", method, path, options), 403, "ORG_WIDE_ACCESS_REQUIRED");

  await orgWide("GET", "/payroll/statutory", { query: { month } });
  await orgWide("GET", "/payroll/statutory/setup");
  await orgWide("PATCH", "/payroll/statutory/settings", {
    body: { wageBasis: "ceiling", esiCeiling: "21000", expectedVersion: 1 },
  });
  await orgWide("PATCH", "/payroll/statutory/pt/UP", {
    body: { state: "UP", expectedVersion: 1, rows: [] },
  });
  await orgWide("POST", "/payroll/statutory/challans", {
    body: {
      obligationKey: `epf|ent|${month}`,
      amount: "100",
      paidOn: todayInOrgZone(),
      challanNo: "TEST12345",
      bsrCode: "",
      idempotencyKey: newKey(),
    },
    idempotencyKey: newKey(),
  });
  await orgWide("GET", "/payroll/statutory/files/ecr", { query: { month } });
  await orgWide("POST", `/payroll/form-16/${fy}/generate`, { body: {} });
  await orgWide("POST", "/payroll/runs", { body: { month: "2099-01" }, idempotencyKey: newKey() });
  for (const command of ["submit-review", "approve", "reject", "publish", "calculate", "mark-paid"])
    await orgWide("POST", `/payroll/runs/${runId}/${command}`, { body: { note: "scoped" } });
  await orgWide("GET", `/payroll/runs/${runId}/register/export`);
  await orgWide("GET", `/payroll/runs/${runId}/bank-advice/export`);

  // Organization-wide personas still reach the organization-level reads.
  for (const persona of ["payroll", "superAdmin"] as const) {
    dataOf(await api.as(persona, "GET", "/payroll/statutory", { query: { month } }));
    dataOf(await api.as(persona, "GET", "/payroll/statutory/setup"));
    dataOf(await api.as(persona, "GET", `/payroll/runs/${runId}/register/export`));
  }

  // Revocation applies to the next request.
  await api.prisma.roleAssignment.deleteMany({ where: { employeeId: scoped, role: { in: [...scopedRoles] } } });
  expectProblem(await api.as("scopedHr", "GET", "/payroll/overview"), 403);
});
