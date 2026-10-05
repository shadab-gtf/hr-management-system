/**
 * Department-wise permissions (BE-003) for the salary and compensation modules: loan decisions and compensation
 * imports are limited to the operator's departments; salary templates/assignments are organization-wide policy.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { dataOf, expectProblem, newKey, personas, useTestApi } from "../helpers/api.js";
import { todayInOrgZone } from "../../src/utils/date.js";
import { addMonths } from "../../src/modules/payroll/payroll.rules.js";

const api = useTestApi();
const scopedId = personas.scopedHr;
const personaIds: string[] = Object.values(personas);
let engineer: { id: string; code: string };
let designer: { id: string; code: string };

async function pick(departmentId: string) {
  const row = await api.prisma.employee.findFirst({
    where: { departmentId, id: { notIn: personaIds }, status: { not: "exited" } },
    orderBy: { code: "desc" },
    select: { id: true, code: true },
  });
  assert.ok(row, `no employee in ${departmentId}`);
  return row;
}

async function addLoan(employeeId: string) {
  const id = `ln_scope_${crypto.randomUUID().slice(0, 8)}`;
  return api.prisma.payLoan.create({
    data: {
      id,
      reference: `LN-SCOPE-${id.slice(-8)}`,
      employeeId,
      type: "personal_loan",
      principalPaise: 500000n,
      tenureMonths: 6,
      startMonth: addMonths(todayInOrgZone().slice(0, 7), 1),
      reason: "Scope test loan",
    },
  });
}

function importFile(rows: { code: string; ctc: number }[], month: string) {
  const lines = rows.map(({ code, ctc }) => `${code},${ctc},${month}-01,Scope test revision`);
  const csv = `Employee code,Annual CTC,Effective from,Reason\n${lines.join("\n")}\n`;
  return { fileName: "scope.csv", base64: Buffer.from(csv).toString("base64") };
}

type Batch = {
  id: string;
  state: string;
  totals: { errors: number; ok: number };
  rows: { employeeCode: string; status: string }[];
  can: { approve: boolean };
};

async function grantScopedPayroll() {
  // Make the Engineering-scoped HR persona also a payroll operator and approver for Engineering only.
  await api.prisma.roleAssignment.createMany({
    data: [
      { employeeId: scopedId, role: "payroll_operator", reason: "Scope test" },
      { employeeId: scopedId, role: "payroll_approver", reason: "Scope test" },
    ],
    skipDuplicates: true,
  });
  await api.prisma.roleScope.createMany({
    data: [
      { employeeId: scopedId, role: "payroll_operator", departmentId: "dep_engineering" },
      { employeeId: scopedId, role: "payroll_approver", departmentId: "dep_engineering" },
    ],
    skipDuplicates: true,
  });
}

before(async () => {
  engineer = await pick("dep_engineering");
  designer = await pick("dep_design");
});

after(async () => {
  await api.prisma.roleAssignment.deleteMany({
    where: { employeeId: scopedId, role: { in: ["payroll_operator", "payroll_approver"] } },
  });
});

test("employees and HR without payroll grants are denied administrative salary endpoints; self-service works", async () => {
  for (const persona of ["employee", "scopedHr", "hr"] as const) {
    expectProblem(await api.as(persona, "GET", "/compensation/imports"), 403);
    expectProblem(await api.as(persona, "GET", "/payroll/structures"), 403);
    expectProblem(
      await api.as(persona, "POST", "/loans/ln_missing/decisions", { body: { decision: "approve", note: "Okay" } }),
      403,
    );
    expectProblem(
      await api.as(persona, "POST", "/compensation/imports/upload", {
        body: importFile([{ code: engineer.code, ctc: 1000000 }], "2099-01"),
      }),
      403,
    );
  }
  for (const persona of ["employee", "scopedHr"] as const)
    for (const path of ["/me/compensation", "/me/salary/ytd", "/me/tax/declaration", "/me/tax/statement", "/me/loans"])
      assert.equal((await api.as(persona, "GET", path)).status, 200, `${persona} ${path}`);
});

test("department-scoped payroll grants: loans and compensation imports limited to Engineering", async () => {
  await grantScopedPayroll();

  // Salary templates and group assignments are organization-wide policy.
  expectProblem(await api.as("scopedHr", "GET", "/payroll/structures"), 403, "ORG_WIDE_ACCESS_REQUIRED");
  expectProblem(
    await api.as("scopedHr", "POST", "/payroll/structures/tpl_std/changes", {
      body: {
        templateId: "tpl_std",
        basicPctOfCtc: 50,
        hraPctOfBasic: 40,
        conveyance: "1600",
        lta: "0",
        pf: "yes",
        gratuity: "yes",
        reason: "Scope test change",
        idempotencyKey: newKey(),
      },
      idempotencyKey: newKey(),
    }),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  expectProblem(
    await api.as("scopedHr", "POST", "/payroll/structures/changes/sc_missing/approve", { body: { note: "" } }),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  for (const persona of ["payroll", "finance", "superAdmin"] as const)
    dataOf(await api.as(persona, "GET", "/payroll/structures"));

  // Loan decisions: other departments answer 404; own department works; org-wide approvers still decide anyone.
  const designLoan = await addLoan(designer.id);
  const engineeringLoan = await addLoan(engineer.id);
  expectProblem(
    await api.as("scopedHr", "POST", `/loans/${designLoan.id}/decisions`, {
      body: { decision: "approve", note: "Looks fine" },
      idempotencyKey: newKey(),
    }),
    404,
  );
  assert.equal((await api.prisma.payLoan.findUniqueOrThrow({ where: { id: designLoan.id } })).state, "requested");
  assert.deepEqual(
    dataOf(
      await api.as("scopedHr", "POST", `/loans/${engineeringLoan.id}/decisions`, {
        body: { decision: "approve", note: "Engineering approval" },
        idempotencyKey: newKey(),
      }),
    ),
    { state: "approved" },
  );
  assert.deepEqual(
    dataOf(
      await api.as("superAdmin", "POST", `/loans/${designLoan.id}/decisions`, {
        body: { decision: "reject", note: "Org-wide decision" },
        idempotencyKey: newKey(),
      }),
    ),
    { state: "rejected" },
  );

  // Compensation imports prepared org-wide: Design batch is invisible (404) to the Engineering approver.
  const month = addMonths(todayInOrgZone().slice(0, 7), 5);
  const designBatch = dataOf<Batch>(
    await api.as("payroll", "POST", "/compensation/imports/upload", {
      body: importFile([{ code: designer.code, ctc: 1500000 }], month),
      idempotencyKey: newKey(),
    }),
  );
  const engineeringBatch = dataOf<Batch>(
    await api.as("payroll", "POST", "/compensation/imports/upload", {
      body: importFile([{ code: engineer.code, ctc: 1600000 }], month),
      idempotencyKey: newKey(),
    }),
  );
  for (const batch of [designBatch, engineeringBatch])
    dataOf(
      await api.as("payroll", "POST", `/compensation/imports/${batch.id}/decisions`, {
        body: { decision: "submit", reason: "" },
        idempotencyKey: newKey(),
      }),
    );
  const listed = dataOf<Batch[]>(await api.as("scopedHr", "GET", "/compensation/imports")).map((row) => row.id);
  assert.ok(listed.includes(engineeringBatch.id));
  assert.ok(!listed.includes(designBatch.id));
  const orgListed = dataOf<Batch[]>(await api.as("finance", "GET", "/compensation/imports")).map((row) => row.id);
  assert.ok(orgListed.includes(designBatch.id) && orgListed.includes(engineeringBatch.id));
  expectProblem(await api.as("scopedHr", "GET", `/compensation/imports/${designBatch.id}`), 404);
  expectProblem(
    await api.as("scopedHr", "POST", `/compensation/imports/${designBatch.id}/decisions`, {
      body: { decision: "approve", reason: "" },
      idempotencyKey: newKey(),
    }),
    404,
  );
  const engineeringDetail = dataOf<Batch>(
    await api.as("scopedHr", "GET", `/compensation/imports/${engineeringBatch.id}`),
  );
  assert.equal(engineeringDetail.can.approve, true);
  assert.equal(
    dataOf<{ state: string }>(
      await api.as("scopedHr", "POST", `/compensation/imports/${engineeringBatch.id}/decisions`, {
        body: { decision: "approve", reason: "Engineering review" },
        idempotencyKey: newKey(),
      }),
    ).state,
    "approved",
  );
  assert.equal(
    dataOf<{ state: string }>(
      await api.as("superAdmin", "POST", `/compensation/imports/${designBatch.id}/decisions`, {
        body: { decision: "approve", reason: "Org-wide review" },
        idempotencyKey: newKey(),
      }),
    ).state,
    "approved",
  );
  assert.equal((await api.prisma.payCompensation.findMany({ where: { batchId: designBatch.id } })).length, 1);

  // A scoped operator cannot revise other departments: Design rows read as unknown employees.
  const mixed = dataOf<Batch>(
    await api.as("scopedHr", "POST", "/compensation/imports/upload", {
      body: importFile(
        [
          { code: engineer.code, ctc: 1700000 },
          { code: designer.code, ctc: 1700000 },
        ],
        addMonths(month, 1),
      ),
      idempotencyKey: newKey(),
    }),
  );
  assert.equal(mixed.totals.errors, 1);
  assert.equal(mixed.rows.find((row) => row.employeeCode === designer.code)?.status, "error");
  assert.equal(mixed.rows.find((row) => row.employeeCode === engineer.code)?.status, "ok");
  expectProblem(
    await api.as("scopedHr", "POST", `/compensation/imports/${mixed.id}/decisions`, {
      body: { decision: "submit", reason: "" },
      idempotencyKey: newKey(),
    }),
    422,
    "IMPORT_ERRORS",
  );
  dataOf(await api.as("scopedHr", "POST", `/compensation/imports/${mixed.id}/discard`, { idempotencyKey: newKey() }));

  // Revoking the grant applies on the next request.
  await api.prisma.roleAssignment.deleteMany({
    where: { employeeId: scopedId, role: { in: ["payroll_operator", "payroll_approver"] } },
  });
  expectProblem(await api.as("scopedHr", "GET", "/compensation/imports"), 403);
});
