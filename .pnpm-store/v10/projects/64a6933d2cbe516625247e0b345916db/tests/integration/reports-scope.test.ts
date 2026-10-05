/**
 * Department-wise permissions (BE-003) for reports: a department-scoped HR operator (emp_0013, Engineering) reports
 * only on Engineering; organization-wide HR and the super admin still see everyone.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { dataOf, expectProblem, newKey, personas, useTestApi, type Persona } from "../helpers/api.js";
import { createReportsService } from "../../src/modules/reports/reports.service.js";

const api = useTestApi();

const blankFilters = { department: "", location: "", status: "", leaveState: "", month: "", from: "", to: "" };
const employeeSpec = {
  dataset: "employees",
  columns: ["code", "name", "department"],
  filters: blankFilters,
  sort: null,
  groupBy: null,
  aggregate: null,
};

async function codeOf(employeeId: string): Promise<string> {
  return (await api.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).code;
}

async function previewDepartments(persona: Persona, query = ""): Promise<string[]> {
  const table = dataOf<{ rows: { department: string }[] }>(
    await api.as(persona, "GET", `/reports/preview?dataset=employees&col=code&col=name&col=department${query}`),
  );
  return [...new Set(table.rows.map((row) => row.department))].sort();
}

test("report rows, library and builder are limited to the scoped HR operator's departments", async () => {
  assert.deepEqual(await previewDepartments("scopedHr"), ["Engineering"]);
  // Filtering another department returns nothing rather than leaking it.
  assert.deepEqual(await previewDepartments("scopedHr", "&department=Design"), []);
  for (const persona of ["hr", "superAdmin"] as const) {
    const departments = await previewDepartments(persona);
    assert.ok(
      departments.includes("Design") && departments.includes("Engineering"),
      `${persona}: ${departments.join(", ")}`,
    );
  }

  const library = dataOf<{ departments: string[] }>(await api.as("scopedHr", "GET", "/reports/library"));
  assert.deepEqual(library.departments, ["Engineering"]);
  const builder = dataOf<{ departments: string[] }>(await api.as("scopedHr", "GET", "/reports/builder"));
  assert.deepEqual(builder.departments, ["Engineering"]);
  assert.ok(dataOf<{ departments: string[] }>(await api.as("hr", "GET", "/reports/library")).departments.length > 1);

  expectProblem(await api.as("employee", "GET", "/reports/library"), 403);
  expectProblem(await api.as("employee", "GET", "/reports/preview?dataset=employees&col=code"), 403);
  expectProblem(await api.as("manager", "GET", "/reports/analytics/workforce"), 403);
});

test("workforce analytics are scoped aggregates", async () => {
  type Analytics = { headcount: number; byDepartment: { name: string; count: number }[] };
  const scoped = dataOf<Analytics>(await api.as("scopedHr", "GET", "/reports/analytics/workforce"));
  const orgWide = dataOf<Analytics>(await api.as("hr", "GET", "/reports/analytics/workforce"));
  const admin = dataOf<Analytics>(await api.as("superAdmin", "GET", "/reports/analytics/workforce"));
  assert.deepEqual(
    scoped.byDepartment.map(({ name }) => name),
    ["Engineering"],
  );
  const engineering = orgWide.byDepartment.find(({ name }) => name === "Engineering");
  assert.ok(engineering);
  assert.equal(scoped.headcount, engineering.count);
  assert.ok(orgWide.headcount > scoped.headcount);
  assert.equal(admin.headcount, orgWide.headcount);

  const workforce = dataOf<{ headcount: number; byDepartment: { name: string }[] }>(
    await api.as("scopedHr", "GET", "/reports/workforce"),
  );
  assert.equal(workforce.headcount, scoped.headcount);
  assert.deepEqual(
    workforce.byDepartment.map(({ name }) => name),
    ["Engineering"],
  );
});

test("custom and standard exports never include another department's employees", async () => {
  const design = await codeOf("emp_0007");
  const designToo = await codeOf("emp_0009");
  const engineer = await codeOf(personas.scopedHr);
  const custom = dataOf<{ content: string; rowCount: number }>(
    await api.as("scopedHr", "POST", "/reports/custom/export", { body: { spec: employeeSpec, format: "csv" } }),
  );
  assert.ok(custom.content.includes(engineer));
  assert.ok(!custom.content.includes(design) && !custom.content.includes(designToo));

  for (const key of ["headcount", "joiners_leavers"] as const) {
    const scoped = dataOf<{ content: string }>(
      await api.as("scopedHr", "POST", `/reports/standard/${key}/export`, {
        body: { filters: { ...blankFilters, from: "2000-01-01", to: "2100-12-31" }, format: "csv" },
      }),
    );
    assert.ok(!scoped.content.includes(design), `${key} leaked a Design employee`);
    const full = dataOf<{ content: string }>(
      await api.as("hr", "POST", `/reports/standard/${key}/export`, {
        body: { filters: { ...blankFilters, from: "2000-01-01", to: "2100-12-31" }, format: "csv" },
      }),
    );
    assert.ok(full.content.includes(design), `${key}: org-wide HR should see Design`);
  }
  const admin = dataOf<{ content: string }>(
    await api.as("superAdmin", "POST", "/reports/custom/export", { body: { spec: employeeSpec, format: "csv" } }),
  );
  assert.ok(admin.content.includes(design));
});

test("scheduled deliveries carry the owner's scope and only reach recipients who cover it", async () => {
  const save = { name: "Org headcount", description: "", visibility: "private", sharedRoles: [], spec: employeeSpec };
  const orgReport = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/reports/saved", { body: save, idempotencyKey: newKey() }),
  ).id;
  const schedule = (reportId: string, recipients: string[]) => ({
    reportId,
    frequency: "daily",
    weekday: 1,
    dayOfMonth: 1,
    time: "10:00",
    format: "csv",
    recipients,
    active: true,
  });
  // An org-wide report cannot be delivered to an Engineering-only operator.
  expectProblem(
    await api.as("hr", "PATCH", `/reports/saved/${orgReport}/schedule`, {
      body: schedule(orgReport, [personas.scopedHr]),
    }),
    403,
    "RECIPIENT_RESTRICTED",
  );
  // The scoped operator cannot open someone else's private report.
  expectProblem(await api.as("scopedHr", "GET", `/reports/saved/${orgReport}`), 404);

  // An Engineering report can be delivered to org-wide HR; its rows are Engineering only, even from the worker.
  const scopedReport = dataOf<{ id: string }>(
    await api.as("scopedHr", "POST", "/reports/saved", {
      body: { ...save, name: "Engineering headcount" },
      idempotencyKey: newKey(),
    }),
  ).id;
  dataOf(
    await api.as("scopedHr", "PATCH", `/reports/saved/${scopedReport}/schedule`, {
      body: schedule(scopedReport, [personas.hr]),
    }),
  );
  await api.prisma.reportSaved.update({
    where: { id: scopedReport },
    data: { nextRunAt: new Date(Date.now() - 60000) },
  });
  await createReportsService(api.prisma).processDue();
  const delivery = await api.prisma.reportDelivery.findFirstOrThrow({
    where: { savedReportId: scopedReport },
    orderBy: { at: "desc" },
  });
  const artifact = delivery.artifact as { content: string; scope: unknown };
  assert.deepEqual(artifact.scope, ["dep_engineering"]);
  assert.ok(!artifact.content.includes(await codeOf("emp_0007")));
  assert.ok(artifact.content.includes(await codeOf(personas.scopedHr)));
  dataOf(await api.as("hr", "GET", `/reports/deliveries/${delivery.id}/download`));
  dataOf(await api.as("scopedHr", "GET", `/reports/deliveries/${delivery.id}/download`));

  // An org-wide artifact cannot be opened by an operator whose scope is narrower, even if listed as a recipient.
  const wide = await api.prisma.reportDelivery.create({
    data: {
      id: `rd_scope_${Date.now()}`,
      savedReportId: scopedReport,
      reportName: "Org headcount",
      ownerId: personas.hr,
      recipientIds: [personas.scopedHr],
      rowCount: 1,
      format: "csv",
      trigger: "manual",
      artifact: { fileName: "x.csv", contentType: "text/csv", content: "x", rowCount: 1, requiresSalary: false },
    },
  });
  expectProblem(await api.as("scopedHr", "GET", `/reports/deliveries/${wide.id}/download`), 404);
  dataOf(await api.as("hr", "GET", `/reports/deliveries/${wide.id}/download`));
});

test("reports shared with a role are visible to the super admin", async () => {
  const id = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/reports/saved", {
      body: {
        name: "Shared with HR",
        description: "",
        visibility: "shared",
        sharedRoles: ["hr_operator"],
        spec: employeeSpec,
      },
      idempotencyKey: newKey(),
    }),
  ).id;
  dataOf(await api.as("superAdmin", "GET", `/reports/saved/${id}`));
  // The scoped HR operator sees the shared definition but runs it inside their own scope.
  dataOf(await api.as("scopedHr", "GET", `/reports/saved/${id}`));
  const exported = dataOf<{ content: string }>(
    await api.as("scopedHr", "POST", `/reports/saved/${id}/export`, { body: { format: "csv" } }),
  );
  assert.ok(!exported.content.includes(await codeOf("emp_0007")));
});
