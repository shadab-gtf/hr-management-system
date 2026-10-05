/**
 * Department-wise permissions (BE-003) for employees, workspace, service requests and approvals. `scopedHr`
 * (emp_0013) is an HR operator for Engineering only; `hr` (emp_0005) and `superAdmin` (emp_0001) are org-wide.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { dataOf, expectProblem, newKey, personas, useTestApi, type ApiResult } from "../helpers/api.js";
import { todayInOrgZone } from "../../src/utils/date.js";

const api = useTestApi();
const ORG_WIDE = "ORG_WIDE_ACCESS_REQUIRED";
/** Engineering employee reporting to scopedHr; Design employees outside scopedHr's departments. */
const engineer = "emp_0014";
const designer = "emp_0009";
const exitedClientServices = "emp_0043";

/** Calls the API as any seeded employee (not only the named personas). */
async function asEmployee(
  employeeId: string,
  method: string,
  path: string,
  options: { body?: unknown; idempotencyKey?: string } = {},
): Promise<ApiResult> {
  const headers = new Headers({ Authorization: `Bearer ${await api.token(employeeId)}` });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  const response = await fetch(`${api.baseUrl}/api/v1${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null, headers: response.headers };
}

async function departmentsOf(ids: string[]): Promise<Set<string>> {
  const rows = await api.prisma.employee.findMany({ where: { id: { in: ids } }, select: { departmentId: true } });
  return new Set(rows.map((r) => r.departmentId));
}

interface DirectoryRow {
  id: string;
  department: string;
  status?: string;
}

test("directory: HR fields, exited people and the status filter follow the HR scope", async () => {
  const list = async (persona: "hr" | "scopedHr" | "superAdmin" | "employee", query: Record<string, string>) =>
    dataOf<DirectoryRow[]>(await api.as(persona, "GET", "/employees", { query: { limit: 100, ...query } }));

  assert.ok((await list("hr", { q: "Ritika" })).some((r) => r.id === exitedClientServices));
  assert.ok((await list("superAdmin", { q: "Ritika" })).some((r) => r.id === exitedClientServices));
  assert.equal((await list("scopedHr", { q: "Ritika" })).length, 0, "exited people outside scope stay hidden");

  const scoped = await list("scopedHr", {});
  assert.ok(
    scoped.some((r) => r.department === "Design"),
    "the active directory stays visible to everyone",
  );
  for (const row of scoped)
    assert.equal(row.status !== undefined, row.department === "Engineering", `HR fields only in scope: ${row.id}`);

  const byStatus = await list("scopedHr", { status: "active" });
  assert.ok(byStatus.length > 0);
  assert.ok(
    byStatus.every((r) => r.department === "Engineering"),
    "status filter is limited to Engineering",
  );
  assert.ok((await list("hr", { status: "active" })).some((r) => r.department === "Design"));

  const asEmployeeRows = await list("employee", { status: "exited" });
  assert.ok(asEmployeeRows.every((r) => r.status === undefined && r.id !== exitedClientServices));

  const facets = dataOf<{ statuses: string[] }>(await api.as("scopedHr", "GET", "/employees/facets"));
  assert.ok(facets.statuses.length > 0);
  assert.deepEqual(dataOf<{ statuses: string[] }>(await api.as("employee", "GET", "/employees/facets")).statuses, []);
});

test("creating employees is limited to the operator's departments", async () => {
  const scopedOptions = dataOf<{ departments: string[]; locations: string[] }>(
    await api.as("scopedHr", "GET", "/employees/form-options"),
  );
  assert.deepEqual(scopedOptions.departments, ["Engineering"]);
  const hrOptions = dataOf<{ departments: string[] }>(await api.as("hr", "GET", "/employees/form-options"));
  assert.ok(hrOptions.departments.includes("Design") && hrOptions.departments.includes("Engineering"));
  expectProblem(await api.as("employee", "GET", "/employees/form-options"), 403);

  const suffix = Date.now().toString(36).replace(/\d/g, "");
  const input = (department: string, tag: string) => ({
    name: `Scope Test ${tag}`,
    workEmail: `scope.${tag.toLowerCase()}.${suffix}@example.com`,
    designation: "Engineer",
    department,
    location: scopedOptions.locations[0],
    managerId: personas.scopedHr,
    joinedOn: todayInOrgZone(),
    type: "full_time",
  });
  expectProblem(
    await api.as("scopedHr", "POST", "/employees", { body: input("Design", "Alpha"), idempotencyKey: newKey() }),
    403,
    ORG_WIDE,
  );
  assert.equal(
    (await api.as("scopedHr", "POST", "/employees", { body: input("Engineering", "Beta"), idempotencyKey: newKey() }))
      .status,
    201,
  );
  assert.equal(
    (await api.as("superAdmin", "POST", "/employees", { body: input("Design", "Gamma"), idempotencyKey: newKey() }))
      .status,
    201,
  );
  expectProblem(
    await api.as("employee", "POST", "/employees", { body: input("Design", "Delta"), idempotencyKey: newKey() }),
    403,
  );
});

interface EmployeeDetail {
  version: number;
  department: string;
  location: string;
  designation: string;
  employmentType: string;
  manager: { id: string } | null;
  privateProfile: unknown;
  permissions: { canEdit: boolean; canViewPrivate: boolean };
}

test("employee records: HR view only in scope; assignments outside scope answer 404", async () => {
  const outside = dataOf<EmployeeDetail>(await api.as("scopedHr", "GET", `/employees/${designer}`));
  assert.equal(outside.privateProfile, null);
  assert.equal(outside.permissions.canEdit, false);
  const inside = dataOf<EmployeeDetail>(await api.as("scopedHr", "GET", `/employees/${engineer}`));
  assert.notEqual(inside.privateProfile, null);
  assert.equal(inside.permissions.canEdit, true);
  for (const persona of ["hr", "superAdmin"] as const)
    assert.equal(
      dataOf<EmployeeDetail>(await api.as(persona, "GET", `/employees/${designer}`)).permissions.canEdit,
      true,
    );

  expectProblem(await api.as("scopedHr", "GET", `/directory/${exitedClientServices}`), 404);
  dataOf(await api.as("hr", "GET", `/directory/${exitedClientServices}`));
  dataOf(await api.as("superAdmin", "GET", `/directory/${exitedClientServices}`));

  const assignment = (detail: EmployeeDetail, department: string) => ({
    designation: detail.designation,
    department,
    location: detail.location,
    managerId: detail.manager?.id ?? "",
    type: detail.employmentType,
    probationMonths: 0,
    effectiveOn: todayInOrgZone(),
    reason: "Department scope check",
  });
  const designerDetail = dataOf<EmployeeDetail>(await api.as("hr", "GET", `/employees/${designer}`));
  expectProblem(
    await api.as("scopedHr", "POST", `/employees/${designer}/assignments`, {
      body: assignment(designerDetail, "Design"),
      ifMatch: designerDetail.version,
      idempotencyKey: newKey(),
    }),
    404,
  );
  expectProblem(
    await api.as("scopedHr", "POST", `/employees/${engineer}/assignments`, {
      body: assignment(inside, "Design"),
      ifMatch: inside.version,
      idempotencyKey: newKey(),
    }),
    403,
    ORG_WIDE,
  );
  expectProblem(
    await api.as("employee", "POST", `/employees/${engineer}/assignments`, {
      body: assignment(inside, "Engineering"),
      ifMatch: inside.version,
    }),
    403,
  );
  dataOf(
    await api.as("scopedHr", "POST", `/employees/${engineer}/assignments`, {
      body: { ...assignment(inside, "Engineering"), designation: "Senior Engineer" },
      ifMatch: inside.version,
      idempotencyKey: newKey(),
    }),
  );
  dataOf(
    await api.as("superAdmin", "POST", `/employees/${designer}/assignments`, {
      body: assignment(designerDetail, "Design"),
      ifMatch: designerDetail.version,
      idempotencyKey: newKey(),
    }),
  );
});

test("organization settings need organization-wide access", async () => {
  expectProblem(await api.as("scopedHr", "GET", "/config/organization"), 403, ORG_WIDE);
  expectProblem(
    await api.as("scopedHr", "PATCH", "/config/probation", { body: { full_time: 6, contract: 3, intern: 0 } }),
    403,
    ORG_WIDE,
  );
  expectProblem(
    await api.as("scopedHr", "POST", "/config/locations", { body: { name: "Scoped City" } }),
    403,
    ORG_WIDE,
  );
  expectProblem(
    await api.as("scopedHr", "POST", "/config/departments", {
      body: { name: "Scoped Dept", costCenter: "CC-261 Scoped", headId: "" },
    }),
    403,
    ORG_WIDE,
  );
  expectProblem(await api.as("employee", "GET", "/config/organization"), 403);
  dataOf(await api.as("hr", "GET", "/config/organization"));
  dataOf(await api.as("superAdmin", "GET", "/config/organization"));
});

test("announcements: scoped HR publishes only to its departments", async () => {
  const body = (audience: string) => ({
    title: `Scope notice ${audience}`,
    body: "A notice used by the department scope tests.",
    category: "general",
    audience,
  });
  expectProblem(await api.as("scopedHr", "POST", "/announcements", { body: body("Everyone") }), 403, ORG_WIDE);
  expectProblem(await api.as("scopedHr", "POST", "/announcements", { body: body("Design") }), 403, ORG_WIDE);
  const own = dataOf<{ id: string }>(
    await api.as("scopedHr", "POST", "/announcements", { body: body("Engineering"), idempotencyKey: newKey() }),
  );
  const design = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/announcements", { body: body("Design"), idempotencyKey: newKey() }),
  );
  dataOf(await api.as("superAdmin", "POST", "/announcements", { body: body("Everyone"), idempotencyKey: newKey() }));

  const adminView = dataOf<{ id: string; audience: string }[]>(
    await api.as("scopedHr", "GET", "/announcements", { query: { view: "admin" } }),
  );
  assert.ok(adminView.some((a) => a.id === own.id));
  assert.ok(adminView.every((a) => a.audience === "Engineering"));
  assert.ok(
    dataOf<{ id: string }[]>(await api.as("hr", "GET", "/announcements", { query: { view: "admin" } })).some(
      (a) => a.id === design.id,
    ),
  );
  expectProblem(await api.as("scopedHr", "POST", `/announcements/${design.id}/archive`, { body: {} }), 404);
  expectProblem(await api.as("employee", "GET", "/announcements", { query: { view: "admin" } }), 403);
  dataOf(await api.as("employee", "GET", "/announcements"));
});

test("helpdesk queue and tickets follow the requester's department", async () => {
  const input = (subject: string) => ({
    categoryId: "hr",
    subject,
    description: "Please help with this workplace request for scope tests.",
    priority: "normal",
  });
  const designTicket = dataOf<{ reference: string }>(
    await api.as("employee", "POST", "/tickets", { body: input("Design scope ticket"), idempotencyKey: newKey() }),
  );
  const engTicket = dataOf<{ reference: string }>(
    await asEmployee(engineer, "POST", "/tickets", {
      body: input("Engineering scope ticket"),
      idempotencyKey: newKey(),
    }),
  );
  const scopedQueue = dataOf<{ id: string; reference: string }[]>(
    await api.as("scopedHr", "GET", "/tickets", { query: { scope: "queue" } }),
  );
  assert.ok(scopedQueue.some((t) => t.reference === engTicket.reference));
  assert.ok(!scopedQueue.some((t) => t.reference === designTicket.reference));
  const hrQueue = dataOf<{ id: string; reference: string }[]>(
    await api.as("hr", "GET", "/tickets", { query: { scope: "queue" } }),
  );
  const design = hrQueue.find((t) => t.reference === designTicket.reference);
  assert.ok(design && hrQueue.some((t) => t.reference === engTicket.reference));

  expectProblem(await api.as("scopedHr", "GET", `/tickets/${design.id}`), 404);
  expectProblem(
    await api.as("scopedHr", "POST", `/tickets/${design.id}/messages`, { body: { body: "Out of scope reply" } }),
    404,
  );
  dataOf(await api.as("superAdmin", "GET", `/tickets/${design.id}`));
  const engineering = scopedQueue.find((t) => t.reference === engTicket.reference);
  assert.ok(engineering);
  assert.equal(
    dataOf<{ viewerIsHr: boolean }>(await api.as("scopedHr", "GET", `/tickets/${engineering.id}`)).viewerIsHr,
    true,
  );
  expectProblem(await api.as("employee", "GET", "/tickets", { query: { scope: "queue" } }), 403);
  dataOf(await api.as("employee", "GET", "/tickets"));
});

test("profile change verification is limited to the verifier's departments", async () => {
  const designRequest = dataOf<{ reference: string }>(
    await api.as("employee", "POST", "/me/profile/change-requests", {
      body: { field: "address", value: "12 Design Street, Pune", reason: "Moved to a new home" },
      idempotencyKey: newKey(),
    }),
  );
  const engRequest = dataOf<{ reference: string }>(
    await asEmployee(engineer, "POST", "/me/profile/change-requests", {
      body: { field: "address", value: "34 Engineering Road, Pune", reason: "Moved to a new home" },
      idempotencyKey: newKey(),
    }),
  );
  const scoped = dataOf<{ id: string; reference: string; requester: { id: string } }[]>(
    await api.as("scopedHr", "GET", "/service-requests"),
  );
  assert.ok(scoped.some((r) => r.reference === engRequest.reference));
  assert.ok(!scoped.some((r) => r.reference === designRequest.reference));
  const scopedDepartments = await departmentsOf(scoped.map((r) => r.requester.id));
  assert.ok([...scopedDepartments].every((d) => d === "dep_engineering"));

  const hrQueue = dataOf<{ id: string; reference: string }[]>(await api.as("hr", "GET", "/service-requests"));
  const design = hrQueue.find((r) => r.reference === designRequest.reference);
  assert.ok(design);
  expectProblem(
    await api.as("scopedHr", "POST", `/service-requests/profile_change/${design.id}/decisions`, {
      body: { decision: "approve", reason: "" },
      idempotencyKey: newKey(),
    }),
    404,
  );
  const engineering = scoped.find((r) => r.reference === engRequest.reference);
  assert.ok(engineering);
  dataOf(
    await api.as("scopedHr", "POST", `/service-requests/profile_change/${engineering.id}/decisions`, {
      body: { decision: "approve", reason: "" },
      idempotencyKey: newKey(),
    }),
  );
  dataOf(
    await api.as("superAdmin", "POST", `/service-requests/profile_change/${design.id}/decisions`, {
      body: { decision: "approve", reason: "" },
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(await api.as("employee", "GET", "/service-requests"), 403);
});

test("approvals: HR reach is limited to its departments; the manager path is unchanged", async () => {
  // A Design request whose approver of record is the Design manager (emp_0006).
  const submitted = await asEmployee(designer, "POST", "/expenses", {
    body: {
      title: "Scope test taxi",
      category: "travel",
      amount: { amount: "450.00", currency: "INR" },
      incurredOn: todayInOrgZone(),
      merchant: `Scope Cabs ${Date.now()}`,
    },
    idempotencyKey: newKey(),
  });
  assert.ok(submitted.status < 300, JSON.stringify(submitted.body));
  const pending = (persona: "hr" | "scopedHr" | "manager" | "superAdmin") =>
    api.as(persona, "GET", "/approvals", { query: { state: "pending" } });
  const hrItems = dataOf<{ id: string; requester: { id: string } }[]>(await pending("hr"));
  const scopedItems = dataOf<{ id: string; requester: { id: string } }[]>(await pending("scopedHr"));
  const scopedDepartments = await departmentsOf(scopedItems.map((i) => i.requester.id));
  assert.ok(
    [...scopedDepartments].every((d) => d === "dep_engineering"),
    [...scopedDepartments].join(),
  );
  const outside = hrItems.find((i) => !scopedItems.some((s) => s.id === i.id) && i.requester.id === designer);
  assert.ok(outside, "HR sees the Design request");
  {
    expectProblem(
      await api.as("scopedHr", "POST", `/approvals/${outside.id}/decisions`, {
        body: { decision: "approve", reason: "Out of scope" },
      }),
      404,
    );
    assert.ok(dataOf<{ id: string }[]>(await pending("superAdmin")).some((i) => i.id === outside.id));
    assert.ok(dataOf<{ id: string }[]>(await pending("manager")).some((i) => i.id === outside.id));
  }
  expectProblem(await api.as("employee", "GET", "/approvals"), 403);
  dataOf(await api.as("scopedHr", "GET", "/me/work-queue"));
});

test("home dashboard aggregates only in-scope employees; self-service still works", async () => {
  type Home = { workforce: { headcount: number; byDepartment: { name: string }[] } | null };
  const scoped = dataOf<Home>(await api.as("scopedHr", "GET", "/me/home"));
  assert.ok(scoped.workforce);
  assert.deepEqual(
    scoped.workforce.byDepartment.map((d) => d.name),
    ["Engineering"],
  );
  const engineering = await api.prisma.employee.count({
    where: { departmentId: "dep_engineering", status: { not: "exited" } },
  });
  assert.equal(scoped.workforce.headcount, engineering);
  for (const persona of ["hr", "superAdmin"] as const)
    assert.ok((dataOf<Home>(await api.as(persona, "GET", "/me/home")).workforce?.byDepartment.length ?? 0) > 1);
  assert.equal(dataOf<Home>(await api.as("employee", "GET", "/me/home")).workforce, null);

  for (const path of ["/me", "/me/requests", "/me/notifications", "/me/notifications/unread-count", "/documents"])
    dataOf(await api.as("employee", "GET", path));
  const self = dataOf<EmployeeDetail>(await api.as("employee", "GET", `/employees/${personas.employee}`));
  assert.notEqual(self.privateProfile, null);
});
