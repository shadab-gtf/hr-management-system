import { required } from "../../src/modules/time/time.service.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { useTestApi, dataOf, expectProblem, newKey } from "../helpers/api.js";
import { frontendContract, expectContract, expectListContract } from "../helpers/contract.js";
import { addDays, todayInOrgZone, weekdayOf } from "../../src/utils/date.js";
import { monday } from "../../src/modules/time/time.service.js";
const api = useTestApi();
test("restricted leave eligibility is private, audited and versioned", async () => {
  const path = "/employees/emp_0007/leave-eligibility";
  expectProblem(await api.as("employee", "GET", path), 403);
  const before = dataOf<{ version: number }>(await api.as("hr", "GET", path));
  const key = newKey(),
    body = { gender: "female", note: "Verified eligibility with employee", version: before.version };
  const saved = dataOf<{ version: number; gender: string }>(
    await api.as("hr", "PATCH", path, { body, idempotencyKey: key }),
  );
  assert.equal(saved.gender, "female");
  assert.equal(saved.version, before.version + 1);
  assert.deepEqual(dataOf(await api.as("hr", "PATCH", path, { body, idempotencyKey: key })), saved);
  expectProblem(await api.as("hr", "PATCH", path, { body }), 412);
  assert.equal(await api.prisma.auditLog.count({ where: { action: "leave.eligibility.emp_0007.verify" } }), 1);
});
const today = todayInOrgZone();
test("time APIs enforce authentication and route capabilities", async () => {
  expectProblem(await api.as(null, "GET", "/attendance/today"), 401);
  expectProblem(await api.as("employee", "GET", "/attendance/team/today"), 403);
  expectProblem(await api.as("employee", "GET", "/leave/admin/people"), 403);
  expectProblem(await api.as("employee", "GET", "/imports/attendance"), 403);
  expectProblem(await api.as("employee", "GET", "/attendance/days", { query: { month: "2026-19" } }), 400);
});
test("time read contracts match the frontend", async () => {
  const attendance = await frontendContract("attendance"),
    leave = await frontendContract("leave"),
    ts = await frontendContract("timesheets"),
    config = await frontendContract("hr-config"),
    requests = await frontendContract("requests");
  const checks: [
    "employee" | "manager" | "hr",
    string,
    string,
    Record<
      string,
      {
        safeParse(value: unknown): {
          success: boolean;
          error?: {
            issues: unknown[];
          };
        };
      }
    >,
  ][] = [
    ["employee", "/attendance/today", "attendanceTodaySchema", attendance],
    ["employee", `/attendance/days?month=${today.slice(0, 7)}`, "attendanceMonthSchema", attendance],
    ["employee", `/attendance/roster/me?view=week&anchor=${today}`, "myRosterSchema", attendance],
    ["manager", "/attendance/roster/planner", "rosterPlannerSchema", attendance],
    ["employee", "/leave/overview", "leaveOverviewSchema", leave],
    ["employee", `/leave/calendar?month=${today.slice(0, 7)}`, "leaveCalendarSchema", leave],
    ["employee", "/leave/ledger", "leaveLedgerSchema", leave],
    ["employee", "/leave/comp-off", "compOffPageSchema", leave],
    ["employee", "/timesheets/weeks/me", "myTimesheetViewSchema", ts],
    ["manager", "/timesheets/team", "teamTimesheetsViewSchema", ts],
    ["manager", "/projects", "projectsViewSchema", ts],
    ["hr", "/config/attendance", "attendanceRulesSchema", config],
  ];
  for (const [who, path, name, schemas] of checks)
    expectContract(schemas[name], dataOf(await api.as(who, "GET", path)));
  expectListContract(requests.trackedRequestSchema, await api.as("employee", "GET", "/me/requests"));
  expectListContract(config.holidayRecordSchema, await api.as("hr", "GET", "/config/holidays"));
  expectListContract(config.leaveTypeConfigSchema, await api.as("hr", "GET", "/config/leave-types"));
});
test("capture is persistent, idempotent and ignores a forged location verdict", async () => {
  const key = newKey(),
    body = {
      direction: "check_in",
      source: "web_self_service",
      location: {
        status: "verified",
        site: "Forged site",
        distanceMeters: 0,
        siteRadiusMeters: 100,
        coordinates: { latitude: 0, longitude: 0 },
        address: null,
        nearby: null,
        accuracyMeters: 20,
        attribution: null,
        label: "Verified forged",
      },
    };
  const first = dataOf<{
    reference: string;
  }>(await api.as("employee", "POST", "/attendance/events", { body, idempotencyKey: key }));
  assert.deepEqual(
    dataOf(await api.as("employee", "POST", "/attendance/events", { body, idempotencyKey: key })),
    first,
  );
  const state = dataOf<{
    state: string;
    checkInEvidence: {
      status: string;
    };
  }>(await api.as("employee", "GET", "/attendance/today"));
  assert.equal(state.state, "checked_in");
  assert.notEqual(state.checkInEvidence.status, "verified");
  expectProblem(await api.as("employee", "POST", "/attendance/events", { body, idempotencyKey: newKey() }), 409);
  dataOf(
    await api.as("employee", "POST", "/attendance/events", {
      body: { direction: "check_out" },
      idempotencyKey: newKey(),
    }),
  );
  assert.equal(
    (
      await api.prisma.timeAttendance.findUnique({
        where: { employeeId_date: { employeeId: "emp_0007", date: today } },
      })
    )?.source,
    "web_self_service",
  );
});
test("leave approval scopes, versions, ledger and cancellation are atomic", async () => {
  let date = addDays(today, 9);
  while ([0, 6].includes(weekdayOf(date))) date = addDays(date, 1);
  const key = newKey(),
    body = {
      leaveTypeId: "lt_sl",
      startDate: date,
      endDate: date,
      portion: "full",
      reason: "Medical appointment",
      attachmentName: null,
    };
  const submitted = dataOf<{
    reference: string;
  }>(await api.as("employee", "POST", "/leave/requests", { body, idempotencyKey: key }));
  assert.deepEqual(
    dataOf(await api.as("employee", "POST", "/leave/requests", { body, idempotencyKey: key })),
    submitted,
  );
  const row = await api.prisma.timeWorkflow.findUniqueOrThrow({ where: { reference: submitted.reference } });
  assert.deepEqual((row.payload as { chargeDates: string[] }).chargeDates, [date]);
  expectProblem(
    await api.as("employee", "POST", `/approvals/${row.id}/decisions`, {
      body: { decision: "approve" },
      ifMatch: row.version,
    }),
    403,
  );
  expectProblem(
    await api.as("manager", "POST", `/approvals/${row.id}/decisions`, {
      body: { decision: "approve" },
      ifMatch: row.version + 1,
    }),
    412,
  );
  dataOf(
    await api.as("manager", "POST", `/approvals/${row.id}/decisions`, {
      body: { decision: "approve", reason: "Approved" },
      ifMatch: row.version,
      idempotencyKey: newKey(),
    }),
  );
  assert.equal(
    await api.prisma.timeLeaveLedger.count({ where: { reference: submitted.reference, kind: "availed" } }),
    1,
  );
  dataOf(await api.as("employee", "POST", `/leave/requests/${row.id}/cancel`, { body: {}, ifMatch: row.version + 1 }));
  assert.equal(await api.prisma.timeLeaveLedger.count({ where: { reference: `CANCEL-${submitted.reference}` } }), 1);
  assert.equal(await api.prisma.auditLog.count({ where: { action: `approval.${row.id}.approve` } }), 1);
});
test("permission and expenses flow through manager approvals", async () => {
  const permission = dataOf<{
    reference: string;
  }>(
    await api.as("employee", "POST", "/attendance/permissions", {
      body: { date: addDays(today, 2), from: "14:00", to: "15:00", reason: "Doctor appointment" },
      idempotencyKey: newKey(),
    }),
  );
  const claim = dataOf<{
    reference: string;
  }>(
    await api.as("employee", "POST", "/expenses", {
      body: {
        title: "Client meeting travel",
        category: "travel",
        amount: { amount: "950.00", currency: "INR" },
        incurredOn: today,
        merchant: "Metro transport",
      },
      idempotencyKey: newKey(),
    }),
  );
  const contracts = await frontendContract("approval"),
    queue = dataOf<unknown[]>(await api.as("manager", "GET", "/approvals?state=pending"));
  for (const item of queue) expectContract(contracts.approvalItemSchema, item);
  for (const reference of [permission.reference, claim.reference]) {
    const row = await api.prisma.timeWorkflow.findUniqueOrThrow({ where: { reference } });
    dataOf(
      await api.as("manager", "POST", `/approvals/${row.id}/decisions`, {
        body: { decision: "approve" },
        ifMatch: row.version,
        idempotencyKey: newKey(),
      }),
    );
  }
  assert.equal(
    (await api.prisma.timeWorkflow.findUniqueOrThrow({ where: { reference: claim.reference } })).state,
    "manager_approved",
  );
});
test("timesheet submit rejects excess daily hours and locks approved weeks", async () => {
  const weekStart = addDays(monday(today), -7),
    project = required(
      dataOf<{
        projects: {
          id: string;
          tasks: string[];
        }[];
      }>(await api.as("manager", "GET", "/projects")).projects.find((p) => p.id === "prj_tca"),
    );
  const body = {
    intent: "submit",
    rows: [
      {
        projectId: project.id,
        task: project.tasks[0],
        note: "Reviewed accessibility",
        quarterHours: [4, 0, 0, 0, 0, 0, 0],
      },
    ],
  };
  const saved = dataOf<{
    id: string;
    version: number;
  }>(
    await api.as("employee", "POST", `/timesheets/weeks/me/${weekStart}`, {
      body,
      ifMatch: 0,
      idempotencyKey: newKey(),
    }),
  );
  dataOf(
    await api.as("manager", "POST", `/timesheets/weeks/${saved.id}/decision`, {
      body: { decision: "approve", comment: "Reviewed" },
      ifMatch: saved.version,
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(
    await api.as("employee", "POST", `/timesheets/weeks/me/${weekStart}`, {
      body: { ...body, intent: "save" },
      ifMatch: saved.version + 1,
      idempotencyKey: newKey(),
    }),
    409,
  );
});
test("attendance import preview/commit is durable and duplicate safe", async () => {
  const body = {
    fileName: "attendance.csv",
    format: "daily",
    records: [{ employeeCode: "GTF-1007", date: addDays(today, -5), firstIn: "09:30", lastOut: "18:30" }],
  };
  const batch = dataOf<{
    id: string;
  }>(await api.as("hr", "POST", "/imports/attendance", { body, idempotencyKey: newKey() }));
  const contracts = await frontendContract("attendance-import");
  expectContract(contracts.importBatchSchema, dataOf(await api.as("hr", "GET", `/imports/attendance/${batch.id}`)));
  const key = newKey();
  const result = dataOf<{
    applied: number;
  }>(await api.as("hr", "POST", `/imports/attendance/${batch.id}/commit`, { body: {}, idempotencyKey: key }));
  assert.equal(result.applied, 1);
  assert.deepEqual(
    dataOf(await api.as("hr", "POST", `/imports/attendance/${batch.id}/commit`, { body: {}, idempotencyKey: key })),
    result,
  );
  expectProblem(await api.as("hr", "POST", `/imports/attendance/${batch.id}/discard`, { body: {} }), 409);
});
test("configuration mutations are audited and protect shifts in use", async () => {
  expectProblem(await api.as("hr", "POST", "/config/shifts/sh_general/delete", { body: {} }), 409);
  const holiday = dataOf<{
    id: string;
  }>(
    await api.as("hr", "POST", "/config/holidays", {
      body: { name: "Company foundation day", date: addDays(today, 25), kind: "optional", locations: [] },
    }),
  );
  dataOf(await api.as("hr", "POST", `/config/holidays/${holiday.id}/delete`, { body: {} }));
  assert.equal(await api.prisma.timeDocument.count({ where: { id: holiday.id } }), 0);
});

test("raw attendance CSV upload validates rows and approved export returns a real CSV", async () => {
  const date = addDays(today, -10),
    csv = `Employee code,Date,In time,Out time\r\nGTF-1007,${date},09:30,18:30\r\n`;
  const result = dataOf<{ id: string; totals: { ok: number } }>(
    await api.as("hr", "POST", "/imports/attendance/upload", {
      body: { fileName: "device.csv", contentBase64: Buffer.from(csv).toString("base64") },
      idempotencyKey: newKey(),
    }),
  );
  assert.equal(result.totals.ok, 1);
  assert.equal(await api.prisma.timeDocument.count({ where: { id: `source:${result.id}` } }), 1);
  const exported = dataOf<{ csv: string; fileName: string }>(
    await api.as("manager", "POST", "/timesheets/exports/approved", { body: { from: addDays(today, -20), to: today } }),
  );
  assert.ok(exported.csv.includes("GTF-1007"));
  assert.ok(exported.fileName.endsWith(".csv"));
});

test("published rosters use versions and authorized managers decide shift swaps", async () => {
  const weekStart = addDays(monday(today), 28);
  const planner = dataOf<{
    department: string;
    version: number;
    rows: { person: { id: string }; cells: (string | null)[] }[];
  }>(await api.as("manager", "GET", "/attendance/roster/planner", { query: { department: "Design", weekStart } }));
  const colleague = planner.rows.find((r) => r.person.id !== "emp_0007" && r.person.id !== "emp_0006");
  assert.ok(colleague);
  const cells: Record<string, (string | null)[]> = {};
  for (const row of planner.rows)
    cells[row.person.id] = [
      row.person.id === "emp_0007" ? "sh_general" : "sh_early",
      "sh_general",
      "sh_general",
      "sh_general",
      "sh_general",
      "off",
      "off",
    ];
  const path = `/attendance/roster/${encodeURIComponent(planner.department)}/${weekStart}`;
  dataOf(
    await api.as("manager", "PATCH", path, {
      body: { intent: "publish", cells },
      ifMatch: planner.version,
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(
    await api.as("manager", "PATCH", path, {
      body: { intent: "save", cells },
      ifMatch: planner.version,
      idempotencyKey: newKey(),
    }),
    412,
  );
  const request = dataOf<{ reference: string }>(
    await api.as("employee", "POST", "/attendance/roster/swaps", {
      body: { date: weekStart, colleagueId: colleague.person.id, reason: "Personal appointment requires early shift" },
      idempotencyKey: newKey(),
    }),
  );
  const row = await api.prisma.timeWorkflow.findUniqueOrThrow({ where: { reference: request.reference } });
  dataOf(
    await api.as("manager", "POST", `/attendance/roster/swaps/${row.id}/decision`, {
      body: { decision: "approve", note: "Coverage maintained" },
      ifMatch: row.version,
    }),
  );
  const roster = dataOf<{ days: { date: string; shift: { id: string } | null }[] }>(
    await api.as("employee", "GET", "/attendance/roster/me", { query: { view: "week", anchor: weekStart } }),
  );
  assert.equal(roster.days[0]?.shift?.id, "sh_early");
});

test("comp-off credit and encashment debit post once with independent approval", async () => {
  let offDate = addDays(monday(today), -1);
  while (
    await api.prisma.timeAttendance.findUnique({
      where: { employeeId_date: { employeeId: "emp_0007", date: offDate } },
    })
  )
    offDate = addDays(offDate, -7);
  const batch = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/imports/attendance", {
      body: {
        fileName: "weekend.csv",
        format: "daily",
        records: [{ employeeCode: "GTF-1007", date: offDate, firstIn: "09:30", lastOut: "18:30" }],
      },
      idempotencyKey: newKey(),
    }),
  );
  dataOf(await api.as("hr", "POST", `/imports/attendance/${batch.id}/commit`, { body: {}, idempotencyKey: newKey() }));
  const claim = dataOf<{ reference: string }>(
    await api.as("employee", "POST", "/leave/comp-off/claims", {
      body: { workedDate: offDate, portion: "full", reason: "Weekend client release support" },
      idempotencyKey: newKey(),
    }),
  );
  const co = await api.prisma.timeWorkflow.findUniqueOrThrow({ where: { reference: claim.reference } });
  dataOf(
    await api.as("manager", "POST", `/leave/comp-off/claims/${co.id}/decision`, {
      body: { decision: "approve", note: "Verified worked hours" },
      ifMatch: co.version,
    }),
  );
  assert.equal(await api.prisma.timeLeaveLedger.count({ where: { reference: co.reference, kind: "credit" } }), 1);
  dataOf(
    await api.as("hr", "POST", "/leave/admin/adjustments", {
      body: {
        employeeId: "emp_0007",
        leaveTypeId: "lt_el",
        direction: "credit",
        days: "20",
        reason: "Approved opening balance correction",
      },
      idempotencyKey: newKey(),
    }),
  );
  const encash = dataOf<{ reference: string }>(
    await api.as("employee", "POST", "/leave/encashments", {
      body: { leaveTypeId: "lt_el", days: 2, reason: "Home renovation" },
      idempotencyKey: newKey(),
    }),
  );
  const en = await api.prisma.timeWorkflow.findUniqueOrThrow({ where: { reference: encash.reference } });
  expectProblem(
    await api.as("manager", "POST", `/leave/encashments/${en.id}/decision`, {
      body: { decision: "approve" },
      ifMatch: en.version,
    }),
    403,
  );
  dataOf(
    await api.as("hr", "POST", `/leave/encashments/${en.id}/decision`, {
      body: { decision: "approve", note: "Balance verified" },
      ifMatch: en.version,
    }),
  );
  assert.equal(await api.prisma.timeLeaveLedger.count({ where: { reference: en.reference, kind: "encashed" } }), 1);
});

test("delegated approvals and revocation follow their effective date window", async () => {
  dataOf(
    await api.as("manager", "POST", "/me/delegations", {
      body: {
        delegateId: "emp_0005",
        startsOn: today,
        endsOn: addDays(today, 7),
        workflows: ["leave", "regularization", "expense"],
        reason: "Business travel",
      },
      idempotencyKey: newKey(),
    }),
  );
  const data = dataOf<{ given: { id: string; state: string }[] }>(await api.as("manager", "GET", "/me/delegations"));
  assert.ok(data.given.some((d) => d.state === "active"));
  const item = required(data.given[0]);
  dataOf(await api.as("manager", "POST", `/me/delegations/${item.id}/revoke`, { body: {} }));
  expectProblem(await api.as("manager", "POST", `/me/delegations/${item.id}/revoke`, { body: {} }), 409);
});

test("year-end preview derives encashment, commit prevents repeat posting", async () => {
  const contracts = await frontendContract("leave"),
    preview = dataOf<{ totals: { encash: string } }>(await api.as("hr", "GET", "/leave/admin/year-end"));
  expectContract(contracts.yearEndSchema, preview);
  assert.ok(Number(preview.totals.encash) > 0);
  expectProblem(
    await api.as("hr", "POST", `/leave/admin/year-end/${today.slice(0, 4)}/commit`, {
      body: {},
      idempotencyKey: newKey(),
    }),
    409,
  );
  // Isolated test fixture: unresolved seeded requests are not part of this close-out scenario.
  await api.prisma.timeWorkflow.updateMany({
    where: { kind: { in: ["leave", "comp_off", "encashment"] }, state: "pending" },
    data: { state: "rejected" },
  });
  const key = newKey(),
    path = `/leave/admin/year-end/${today.slice(0, 4)}/commit`;
  const done = dataOf<{ rows: number }>(await api.as("hr", "POST", path, { body: {}, idempotencyKey: key }));
  assert.ok(done.rows > 0);
  assert.deepEqual(dataOf(await api.as("hr", "POST", path, { body: {}, idempotencyKey: key })), done);
  assert.ok(
    (await api.prisma.timeWorkflow.count({
      where: { kind: "encashment", payload: { path: ["source"], equals: "year_end" } },
    })) > 0,
  );
  expectProblem(await api.as("hr", "POST", path, { body: {}, idempotencyKey: newKey() }), 409);
});
