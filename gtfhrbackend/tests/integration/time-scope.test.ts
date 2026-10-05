/**
 * Department-wise permissions (BE-003) for time, attendance, attendance import, leave and timesheets.
 * `scopedHr` (emp_0013) is an HR operator limited to Engineering (and an Engineering manager); `hr` is
 * organization-wide; `superAdmin` holds every capability organization-wide.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { useTestApi, dataOf, expectProblem, newKey, personas } from "../helpers/api.js";
import { addDays, todayInOrgZone } from "../../src/utils/date.js";
import { monday } from "../../src/modules/time/time.service.js";

const api = useTestApi();
const today = todayInOrgZone();
let engineer: { id: string; code: string };
let designer: { id: string; code: string };

before(async () => {
  const pick = (departmentId: string, not: string[]) =>
    api.prisma.employee.findFirstOrThrow({
      where: { departmentId, status: { not: "exited" }, id: { notIn: not } },
      orderBy: { id: "asc" },
      select: { id: true, code: true },
    });
  engineer = await pick("dep_engineering", [personas.scopedHr]);
  designer = await pick("dep_design", [personas.employee, personas.manager]);
  const scoped = await api.prisma.employee.findUniqueOrThrow({ where: { id: personas.scopedHr } });
  assert.equal(scoped.departmentId, "dep_engineering");
  const aanya = await api.prisma.employee.findUniqueOrThrow({ where: { id: personas.employee } });
  assert.equal(aanya.departmentId, "dep_design");
});

const departmentsOf = async (ids: string[]) =>
  new Set(
    (await api.prisma.employee.findMany({ where: { id: { in: ids } }, select: { departmentId: true } })).map(
      (e) => e.departmentId,
    ),
  );

test("leave admin people list is limited to the operator's departments", async () => {
  const scoped = dataOf<{ id: string }[]>(await api.as("scopedHr", "GET", "/leave/admin/people"));
  assert.ok(scoped.length > 0);
  assert.deepEqual([...(await departmentsOf(scoped.map((p) => p.id)))], ["dep_engineering"]);
  assert.ok(scoped.some((p) => p.id === engineer.id));
  for (const persona of ["hr", "superAdmin"] as const) {
    const all = dataOf<{ id: string }[]>(await api.as(persona, "GET", "/leave/admin/people"));
    assert.ok(all.some((p) => p.id === personas.employee));
    assert.ok(all.some((p) => p.id === engineer.id));
  }
  expectProblem(await api.as("employee", "GET", "/leave/admin/people"), 403);
});

test("leave eligibility answers 404 outside scope and works inside it", async () => {
  expectProblem(await api.as("scopedHr", "GET", `/employees/${personas.employee}/leave-eligibility`), 404);
  expectProblem(await api.as("scopedHr", "GET", `/employees/${designer.id}/leave-eligibility`), 404);
  expectProblem(
    await api.as("scopedHr", "PATCH", `/employees/${designer.id}/leave-eligibility`, {
      body: { gender: "female", note: "Out of scope attempt", version: 0 },
      idempotencyKey: newKey(),
    }),
    404,
  );
  assert.equal(await api.prisma.timeDocument.count({ where: { id: `time_profile:${designer.id}` } }), 0);
  const inScope = dataOf<{ version: number }>(
    await api.as("scopedHr", "GET", `/employees/${engineer.id}/leave-eligibility`),
  );
  const saved = dataOf<{ gender: string }>(
    await api.as("scopedHr", "PATCH", `/employees/${engineer.id}/leave-eligibility`, {
      body: { gender: "male", note: "Verified with employee", version: inScope.version },
      idempotencyKey: newKey(),
    }),
  );
  assert.equal(saved.gender, "male");
  dataOf(await api.as("hr", "GET", `/employees/${designer.id}/leave-eligibility`));
  dataOf(await api.as("superAdmin", "GET", `/employees/${designer.id}/leave-eligibility`));
  expectProblem(await api.as("employee", "GET", `/employees/${engineer.id}/leave-eligibility`), 403);
});

test("another employee's leave ledger and balance adjustments respect the scope", async () => {
  expectProblem(await api.as("scopedHr", "GET", `/leave/ledger/${personas.employee}`), 404);
  dataOf(await api.as("scopedHr", "GET", `/leave/ledger/${engineer.id}`));
  dataOf(await api.as("hr", "GET", `/leave/ledger/${personas.employee}`));
  dataOf(await api.as("superAdmin", "GET", `/leave/ledger/${personas.employee}`));
  expectProblem(await api.as("employee", "GET", `/leave/ledger/${engineer.id}`), 403);
  // Self-service ledger still works.
  dataOf(await api.as("employee", "GET", "/leave/ledger"));

  const adjust = (persona: "scopedHr" | "hr", employeeId: string, reason: string) =>
    api.as(persona, "POST", "/leave/admin/adjustments", {
      body: { employeeId, leaveTypeId: "lt_el", direction: "credit", days: "1", reason },
      idempotencyKey: newKey(),
    });
  expectProblem(await adjust("scopedHr", designer.id, "Scope test out of department"), 404);
  assert.equal(
    await api.prisma.timeLeaveLedger.count({
      where: { employeeId: designer.id, note: "Scope test out of department" },
    }),
    0,
  );
  dataOf(await adjust("scopedHr", engineer.id, "Scope test in department"));
  assert.equal(
    await api.prisma.timeLeaveLedger.count({ where: { employeeId: engineer.id, note: "Scope test in department" } }),
    1,
  );
});

test("leave year-end and time configuration are organization-level", async () => {
  expectProblem(await api.as("scopedHr", "GET", "/leave/admin/year-end"), 403, "ORG_WIDE_ACCESS_REQUIRED");
  expectProblem(
    await api.as("scopedHr", "POST", `/leave/admin/year-end/${today.slice(0, 4)}/commit`, {
      body: {},
      idempotencyKey: newKey(),
    }),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  for (const path of ["/config/holidays", "/config/leave-types", "/config/attendance"])
    expectProblem(await api.as("scopedHr", "GET", path), 403, "ORG_WIDE_ACCESS_REQUIRED");
  expectProblem(
    await api.as("scopedHr", "POST", "/config/holidays", {
      body: { name: "Scoped holiday", date: addDays(today, 40), kind: "optional", locations: [] },
    }),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  expectProblem(
    await api.as("scopedHr", "PATCH", "/config/weekly-offs/Engineering", {
      body: { department: "Engineering", offWeekdays: [0, 6], alternateSaturdays: false },
    }),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  expectProblem(
    await api.as("scopedHr", "POST", "/config/shifts/sh_general/default", { body: {} }),
    403,
    "ORG_WIDE_ACCESS_REQUIRED",
  );
  for (const persona of ["hr", "superAdmin"] as const) {
    dataOf(await api.as(persona, "GET", "/config/attendance"));
    dataOf(await api.as(persona, "GET", "/config/holidays"));
  }
  expectProblem(await api.as("employee", "GET", "/config/holidays"), 403);
  expectProblem(await api.as("employee", "GET", "/leave/admin/year-end"), 403);
  // The policy version stays readable to everyone signed in (self-service leave forms use it).
  dataOf(await api.as("scopedHr", "GET", "/config/leave-types/version"));
});

test("encashment queue and decisions stay within the operator's departments", async () => {
  const id = `enc_scope_${Date.now()}`;
  await api.prisma.timeWorkflow.create({
    data: {
      id,
      reference: `EN-SCOPE-${Date.now()}`,
      kind: "encashment",
      employeeId: designer.id,
      state: "pending",
      payload: {
        leaveTypeId: "lt_el",
        days: 1,
        reason: "Scope test",
        amount: "1000.00",
        perDay: "1000.00",
        payrollMonth: today.slice(0, 7),
        source: "request",
      },
    },
  });
  try {
    const scoped = dataOf<{ encashQueue: { id: string }[] | null }>(await api.as("scopedHr", "GET", "/leave/comp-off"));
    assert.ok(scoped.encashQueue);
    assert.ok(!scoped.encashQueue.some((e) => e.id === id));
    const hr = dataOf<{ encashQueue: { id: string; canDecide: boolean }[] | null }>(
      await api.as("hr", "GET", "/leave/comp-off"),
    );
    assert.ok(hr.encashQueue?.some((e) => e.id === id && e.canDecide));
    expectProblem(
      await api.as("scopedHr", "POST", `/leave/encashments/${id}/decision`, {
        body: { decision: "reject", note: "Out of scope" },
        ifMatch: 1,
        idempotencyKey: newKey(),
      }),
      404,
    );
    assert.equal((await api.prisma.timeWorkflow.findUniqueOrThrow({ where: { id } })).state, "pending");
    const employeeView = dataOf<{ encashQueue: unknown }>(await api.as("employee", "GET", "/leave/comp-off"));
    assert.equal(employeeView.encashQueue, null);
  } finally {
    await api.prisma.timeWorkflow.delete({ where: { id } });
  }
});

test("attendance import previews, lists and commits only in-scope employees", async () => {
  const date = addDays(today, -61);
  const hrBatch = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/imports/attendance", {
      body: {
        fileName: "design.csv",
        format: "daily",
        records: [{ employeeCode: designer.code, date, firstIn: "09:30", lastOut: "18:30" }],
      },
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(await api.as("scopedHr", "GET", `/imports/attendance/${hrBatch.id}`), 404);
  expectProblem(
    await api.as("scopedHr", "POST", `/imports/attendance/${hrBatch.id}/commit`, {
      body: {},
      idempotencyKey: newKey(),
    }),
    404,
  );
  expectProblem(await api.as("scopedHr", "POST", `/imports/attendance/${hrBatch.id}/discard`, { body: {} }), 404);
  const scopedList = dataOf<{ id: string }[]>(await api.as("scopedHr", "GET", "/imports/attendance"));
  assert.ok(!scopedList.some((b) => b.id === hrBatch.id));
  const hrList = dataOf<{ id: string }[]>(await api.as("hr", "GET", "/imports/attendance"));
  assert.ok(hrList.some((b) => b.id === hrBatch.id));
  dataOf(await api.as("superAdmin", "GET", `/imports/attendance/${hrBatch.id}`));

  const mixed = dataOf<{
    id: string;
    rows: { employeeCode: string; status: string; employeeName: string | null }[];
  }>(
    await api.as("scopedHr", "POST", "/imports/attendance", {
      body: {
        fileName: "mixed.csv",
        format: "daily",
        records: [
          { employeeCode: designer.code, date, firstIn: "09:30", lastOut: "18:30" },
          { employeeCode: engineer.code, date, firstIn: "09:30", lastOut: "18:30" },
        ],
      },
      idempotencyKey: newKey(),
    }),
  );
  assert.notEqual(mixed.id, hrBatch.id);
  const designRow = mixed.rows.find((r) => r.employeeCode === designer.code);
  assert.equal(designRow?.status, "error");
  assert.equal(designRow.employeeName, null);
  assert.equal(mixed.rows.find((r) => r.employeeCode === engineer.code)?.status, "ok");

  const engineering = dataOf<{ id: string }>(
    await api.as("scopedHr", "POST", "/imports/attendance", {
      body: {
        fileName: "engineering.csv",
        format: "daily",
        records: [{ employeeCode: engineer.code, date, firstIn: "09:30", lastOut: "18:30" }],
      },
      idempotencyKey: newKey(),
    }),
  );
  assert.ok(
    dataOf<{ id: string }[]>(await api.as("scopedHr", "GET", "/imports/attendance")).some(
      (b) => b.id === engineering.id,
    ),
  );
  const result = dataOf<{ applied: number }>(
    await api.as("scopedHr", "POST", `/imports/attendance/${engineering.id}/commit`, {
      body: {},
      idempotencyKey: newKey(),
    }),
  );
  assert.equal(result.applied, 1);
  assert.equal(await api.prisma.timeAttendance.count({ where: { employeeId: designer.id, date } }), 0);
  dataOf(await api.as("hr", "POST", `/imports/attendance/${hrBatch.id}/discard`, { body: {} }));
  expectProblem(await api.as("employee", "GET", "/imports/attendance"), 403);
});

test("team views, who-is-out and calendars for a scoped operator exclude other departments", async () => {
  const team = dataOf<{ person: { id: string } }[]>(await api.as("scopedHr", "GET", "/attendance/team/today"));
  const teamDepartments = await departmentsOf(team.map((t) => t.person.id));
  assert.ok(!teamDepartments.has("dep_design"));
  assert.ok(team.some((t) => t.person.id === engineer.id));
  const all = dataOf<{ person: { id: string } }[]>(await api.as("superAdmin", "GET", "/attendance/team/today"));
  assert.ok(all.some((t) => t.person.id === personas.employee));

  const planner = dataOf<{ departments: string[] }>(await api.as("scopedHr", "GET", "/attendance/roster/planner"));
  assert.ok(planner.departments.includes("Engineering"));
  assert.ok(!planner.departments.includes("Design"));
  expectProblem(
    await api.as("scopedHr", "GET", "/attendance/roster/planner", { query: { department: "Design" } }),
    403,
  );

  const out = dataOf<{ scope: string }>(await api.as("scopedHr", "GET", "/me/home/who-is-out"));
  assert.equal(out.scope, "department");
  assert.equal(dataOf<{ scope: string }>(await api.as("hr", "GET", "/me/home/who-is-out")).scope, "organization");

  const projects = dataOf<{ people: { id: string; department: string }[] }>(
    await api.as("scopedHr", "GET", "/projects"),
  );
  assert.ok(!projects.people.some((p) => p.department === "Design"));

  const sheets = dataOf<{ missing: { employee: { id: string } }[] }>(
    await api.as("scopedHr", "GET", "/timesheets/team"),
  );
  assert.ok(!(await departmentsOf(sheets.missing.map((m) => m.employee.id))).has("dep_design"));
  expectProblem(
    await api.as("scopedHr", "POST", "/timesheets/reminders", {
      body: { employeeId: personas.employee, weekStart: addDays(monday(today), -7) },
      idempotencyKey: newKey(),
    }),
    403,
  );
});

test("self-service paths keep working for the employee", async () => {
  dataOf(await api.as("employee", "GET", "/attendance/today"));
  dataOf(await api.as("employee", "GET", "/leave/overview"));
  dataOf(await api.as("employee", "GET", "/timesheets/weeks/me"));
  dataOf(await api.as("employee", "GET", `/leave/calendar`, { query: { month: today.slice(0, 7) } }));
  dataOf(await api.as("scopedHr", "GET", "/leave/overview"));
  expectProblem(await api.as("employee", "GET", "/attendance/team/today"), 403);
});
