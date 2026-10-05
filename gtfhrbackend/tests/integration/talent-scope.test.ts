/**
 * BE-003 department-wise permissions for the talent modules (lifecycle, recruitment, performance).
 * scopedHr (emp_0013) is an HR operator for Engineering only; hr (emp_0005) is organization-wide; superAdmin
 * (emp_0001) holds every capability organization-wide. Design employees: emp_0007 (employee persona), emp_0008
 * (onboarding), emp_0009. Engineering: emp_0014 (active), emp_0018 (serving notice).
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { useTestApi, dataOf, expectProblem, newKey, personas } from "../helpers/api.js";
import { todayInOrgZone, addDays } from "../../src/utils/date.js";

const api = useTestApi();
const ORG_WIDE = "ORG_WIDE_ACCESS_REQUIRED";
const design = { onboarding: "emp_0008", active: "emp_0009", exited: "emp_0043" } as const;
const engineering = { active: "emp_0014", notice: "emp_0018" } as const;
let engineeringIds = new Set<string>();

interface PersonCase {
  person: { id: string };
}

before(async () => {
  const rows = await api.prisma.employee.findMany({ where: { departmentId: "dep_engineering" }, select: { id: true } });
  engineeringIds = new Set(rows.map(({ id }) => id));
});

function onlyEngineering(ids: readonly string[], label: string) {
  for (const id of ids) assert.ok(engineeringIds.has(id), `${label}: ${id} is outside Engineering`);
}

test("onboarding and offboarding are limited to the scoped HR operator's departments", async () => {
  const scopedOnboarding = dataOf<PersonCase[]>(await api.as("scopedHr", "GET", "/lifecycle/onboarding"));
  onlyEngineering(
    scopedOnboarding.map((c) => c.person.id),
    "onboarding",
  );
  for (const persona of ["hr", "superAdmin"] as const)
    assert.ok(
      dataOf<PersonCase[]>(await api.as(persona, "GET", "/lifecycle/onboarding")).some(
        (c) => c.person.id === design.onboarding,
      ),
    );

  const scopedExits = dataOf<PersonCase[]>(await api.as("scopedHr", "GET", "/lifecycle/offboarding"));
  onlyEngineering(
    scopedExits.map((c) => c.person.id),
    "offboarding",
  );
  assert.ok(scopedExits.some((c) => c.person.id === engineering.notice));
  const board = dataOf<{ cases: PersonCase[]; resignations: PersonCase[] }>(
    await api.as("scopedHr", "GET", "/lifecycle/offboarding/board"),
  );
  onlyEngineering(
    [...board.cases, ...board.resignations].map((c) => c.person.id),
    "offboarding board",
  );
  assert.ok(
    dataOf<PersonCase[]>(await api.as("hr", "GET", "/lifecycle/offboarding")).some(
      (c) => c.person.id === design.exited,
    ),
  );

  // Commands on another department's employee answer 404; in-scope commands work.
  expectProblem(
    await api.as("scopedHr", "PATCH", `/lifecycle/onboarding/${design.onboarding}/tasks/on_identity`, {
      body: { done: true },
    }),
    404,
  );
  dataOf(
    await api.as("hr", "PATCH", `/lifecycle/onboarding/${design.onboarding}/tasks/on_identity`, {
      body: { done: true },
    }),
  );
  expectProblem(
    await api.as("scopedHr", "PATCH", `/lifecycle/offboarding/${design.exited}/tasks/off_handover`, {
      body: { done: true },
    }),
    404,
  );
  dataOf(
    await api.as("scopedHr", "PATCH", `/lifecycle/offboarding/${engineering.notice}/tasks/off_handover`, {
      body: { done: true },
    }),
  );
  expectProblem(
    await api.as("scopedHr", "POST", `/employees/${design.active}/exit`, {
      body: { lastWorkingDay: addDays(todayInOrgZone(), 30), reason: "other", note: "Out of scope" },
      idempotencyKey: newKey(),
    }),
    404,
  );

  // Checklist templates are organization-level configuration.
  expectProblem(await api.as("scopedHr", "GET", "/config/checklists"), 403, ORG_WIDE);
  expectProblem(
    await api.as("scopedHr", "POST", "/config/checklists/onboarding", {
      body: { list: "onboarding", title: "Scoped task", owner: "HR", offsetDays: 1, blocking: false },
    }),
    403,
    ORG_WIDE,
  );
  dataOf(await api.as("hr", "GET", "/config/checklists"));
  dataOf(await api.as("superAdmin", "GET", "/config/checklists"));

  expectProblem(await api.as("employee", "GET", "/lifecycle/onboarding"), 403);
  expectProblem(await api.as("employee", "GET", "/lifecycle/offboarding/board"), 403);
});

test("assets, letters and policies respect department scope and organization-level ownership", async () => {
  const asset = (tag: string) => ({
    tag,
    category: "laptop",
    make: "Lenovo",
    model: "ThinkPad",
    serial: `SERIAL-SCOPE-${tag}`,
    purchasedOn: todayInOrgZone(),
    cost: "50000.00",
    condition: "new",
    notes: "Scope test",
  });
  expectProblem(
    await api.as("scopedHr", "POST", "/assets", { body: asset("LAP-70001"), idempotencyKey: newKey() }),
    403,
    ORG_WIDE,
  );
  const designAsset = dataOf<{ id: string }>(
    await api.as("superAdmin", "POST", "/assets", { body: asset("LAP-70002"), idempotencyKey: newKey() }),
  );
  const spare = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/assets", { body: asset("LAP-70003"), idempotencyKey: newKey() }),
  );
  dataOf(
    await api.as("hr", "POST", `/assets/${designAsset.id}/assignments`, {
      body: { employeeId: design.active, note: "Design issue" },
    }),
  );
  expectProblem(
    await api.as("scopedHr", "POST", `/assets/${spare.id}/assignments`, {
      body: { employeeId: design.active, note: "Out of scope" },
    }),
    404,
  );
  dataOf(
    await api.as("scopedHr", "POST", `/assets/${spare.id}/assignments`, {
      body: { employeeId: engineering.active, note: "Engineering issue" },
    }),
  );
  expectProblem(
    await api.as("scopedHr", "POST", `/assets/${designAsset.id}/return`, { body: { condition: "good", note: "" } }),
    404,
  );
  expectProblem(
    await api.as("scopedHr", "PATCH", `/assets/${spare.id}/status`, {
      body: { status: "retired", note: "Retire spare" },
    }),
    403,
    ORG_WIDE,
  );
  const inventory = dataOf<{
    assets: { id: string; assignee: { id: string } | null }[];
    people: { id: string }[];
  }>(await api.as("scopedHr", "GET", "/assets"));
  assert.ok(!inventory.assets.some((a) => a.id === designAsset.id));
  assert.ok(inventory.assets.some((a) => a.id === spare.id));
  onlyEngineering(
    inventory.assets.flatMap((a) => (a.assignee ? [a.assignee.id] : [])),
    "asset assignees",
  );
  onlyEngineering(
    inventory.people.map((p) => p.id),
    "asset people",
  );
  assert.ok(
    dataOf<{ assets: { id: string }[] }>(await api.as("hr", "GET", "/assets")).assets.some(
      (a) => a.id === designAsset.id,
    ),
  );
  expectProblem(await api.as("employee", "GET", "/assets"), 403);
  dataOf(await api.as("employee", "GET", "/me/assets"));

  // Letters: issue only inside scope; reading another department's letter is 404 for scoped HR.
  const letter = (employeeId: string) => ({
    templateId: "tpl_employment",
    employeeId,
    purpose: "Bank verification",
    addressedTo: "Bank",
  });
  expectProblem(
    await api.as("scopedHr", "POST", "/letters", { body: letter(design.active), idempotencyKey: newKey() }),
    404,
  );
  const designLetter = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/letters", { body: letter(design.active), idempotencyKey: newKey() }),
  );
  const engineeringLetter = dataOf<{ id: string }>(
    await api.as("scopedHr", "POST", "/letters", { body: letter(engineering.active), idempotencyKey: newKey() }),
  );
  expectProblem(await api.as("scopedHr", "GET", `/letters/${designLetter.id}`), 404);
  dataOf(await api.as("scopedHr", "GET", `/letters/${engineeringLetter.id}`));
  dataOf(await api.as("hr", "GET", `/letters/${designLetter.id}`));
  dataOf(await api.as("superAdmin", "GET", `/letters/${engineeringLetter.id}`));
  expectProblem(await api.as("employee", "GET", `/letters/${designLetter.id}`), 403);
  dataOf(await api.as("employee", "GET", "/me/letters"));
  const studio = dataOf<{ people: { id: string }[]; issued: { id: string; person: { id: string } }[] }>(
    await api.as("scopedHr", "GET", "/letter-templates/studio"),
  );
  onlyEngineering(
    studio.people.map((p) => p.id),
    "studio people",
  );
  assert.ok(!studio.issued.some((i) => i.id === designLetter.id));
  expectProblem(
    await api.as("scopedHr", "GET", "/letter-templates/studio", {
      query: { templateId: "tpl_employment", employeeId: design.active },
    }),
    404,
  );
  expectProblem(
    await api.as("scopedHr", "PATCH", "/letter-templates/tpl_employment", {
      body: {
        name: "Employment verification",
        kind: "employment_verification",
        subject: "Employment verification for {{name}}",
        body: "This is to confirm that {{name}} is employed by {{company}}. Issued for {{purpose}}.",
        active: true,
      },
    }),
    403,
    ORG_WIDE,
  );

  // Policies: publishing and reminders are organization-level; scoped HR sees only its departments' progress.
  const policy = {
    title: "Scope policy",
    version: "v1.0",
    summary: "Department scope integration policy.",
    body: "Employees must protect sensitive customer information and follow approved access and retention procedures.",
    audience: "Everyone",
    dueOn: addDays(todayInOrgZone(), 5),
  };
  expectProblem(
    await api.as("scopedHr", "POST", "/policies", { body: policy, idempotencyKey: newKey() }),
    403,
    ORG_WIDE,
  );
  const published = dataOf<{ id: string; audience: number }>(
    await api.as("hr", "POST", "/policies", { body: policy, idempotencyKey: newKey() }),
  );
  expectProblem(await api.as("scopedHr", "POST", `/policies/${published.id}/reminders`, { body: {} }), 403, ORG_WIDE);
  const scopedPolicy = dataOf<{ id: string; total: number; pending: { id: string }[] }[]>(
    await api.as("scopedHr", "GET", "/policies"),
  ).find((p) => p.id === published.id);
  assert.ok(scopedPolicy);
  onlyEngineering(
    scopedPolicy.pending.map((p) => p.id),
    "policy audience",
  );
  assert.ok(scopedPolicy.total > 0 && scopedPolicy.total < published.audience);
  const orgPolicy = dataOf<{ id: string; total: number }[]>(await api.as("hr", "GET", "/policies")).find(
    (p) => p.id === published.id,
  );
  assert.equal(orgPolicy?.total, published.audience);
  dataOf(await api.as("employee", "GET", "/me/policies"));
});

test("settlements are scoped by settlement capability and the settlement policy is organization-level", async () => {
  expectProblem(await api.as("scopedHr", "GET", "/config/settlement-policy"), 403, ORG_WIDE);
  for (const persona of ["hr", "payroll", "superAdmin"] as const)
    dataOf(await api.as(persona, "GET", "/config/settlement-policy"));
  const policy = dataOf<Record<string, unknown>>(await api.as("hr", "GET", "/config/settlement-policy"));
  expectProblem(await api.as("scopedHr", "PATCH", "/config/settlement-policy", { body: policy }), 403, ORG_WIDE);

  const board = dataOf<{ eligible: { person: { id: string } }[]; canPrepare: boolean }>(
    await api.as("scopedHr", "GET", "/settlements"),
  );
  assert.equal(board.canPrepare, true);
  onlyEngineering(
    board.eligible.map((e) => e.person.id),
    "settlement eligibility",
  );
  assert.ok(board.eligible.some((e) => e.person.id === engineering.notice));
  assert.ok(
    dataOf<{ eligible: { person: { id: string } }[] }>(await api.as("payroll", "GET", "/settlements")).eligible.some(
      (e) => e.person.id === design.exited,
    ),
  );
  expectProblem(
    await api.as("scopedHr", "POST", "/settlements", {
      body: { employeeId: design.exited },
      idempotencyKey: newKey(),
    }),
    404,
  );
  const prepared = dataOf<{ id: string }>(
    await api.as("payroll", "POST", "/settlements", { body: { employeeId: design.exited }, idempotencyKey: newKey() }),
  );
  expectProblem(await api.as("scopedHr", "GET", `/settlements/${prepared.id}`), 404);
  expectProblem(await api.as("scopedHr", "POST", `/settlements/${prepared.id}/recalculate`, { body: {} }), 404);
  dataOf(await api.as("payroll", "GET", `/settlements/${prepared.id}`));
  dataOf(await api.as("finance", "GET", `/settlements/${prepared.id}`));
  dataOf(await api.as("superAdmin", "GET", `/settlements/${prepared.id}`));
  assert.ok(
    !dataOf<{ settlements: { id: string }[] }>(await api.as("scopedHr", "GET", "/settlements")).settlements.some(
      (s) => s.id === prepared.id,
    ),
  );
  expectProblem(await api.as("employee", "GET", "/settlements"), 403);
});

test("HR resignation decisions stay inside the operator's departments; self-service is unchanged", async () => {
  dataOf(
    await api.as("employee", "POST", "/me/resignation", {
      body: {
        reason: "personal",
        note: "Leaving to relocate with my family.",
        lastWorkingDay: addDays(todayInOrgZone(), 60),
        earlyReleaseReason: "",
      },
      idempotencyKey: newKey(),
    }),
  );
  let current = dataOf<{ current: { id: string; version: number; state: string } }>(
    await api.as("employee", "GET", "/me/resignation"),
  ).current;
  dataOf(
    await api.as("manager", "POST", `/resignations/${current.id}/decisions`, {
      body: { decision: "accept", note: "Handover planned" },
      ifMatch: current.version,
    }),
  );
  current = dataOf<{ current: { id: string; version: number; state: string } }>(
    await api.as("employee", "GET", "/me/resignation"),
  ).current;
  assert.equal(current.state, "pending_hr");
  expectProblem(
    await api.as("scopedHr", "POST", `/resignations/${current.id}/decisions`, {
      body: { decision: "hold", note: "Out of scope" },
      ifMatch: current.version,
    }),
    404,
  );
  const scopedBoard = dataOf<{ resignations: { id: string }[] }>(
    await api.as("scopedHr", "GET", "/lifecycle/offboarding/board"),
  );
  assert.ok(!scopedBoard.resignations.some((r) => r.id === current.id));
  const hrBoard = dataOf<{ resignations: { id: string; permissions: { canDecideAsHr: boolean } }[] }>(
    await api.as("hr", "GET", "/lifecycle/offboarding/board"),
  );
  assert.equal(hrBoard.resignations.find((r) => r.id === current.id)?.permissions.canDecideAsHr, true);
  dataOf(
    await api.as("hr", "POST", `/resignations/${current.id}/decisions`, {
      body: { decision: "hold", note: "Discussing retention" },
      ifMatch: current.version,
    }),
  );
});

test("recruitment jobs, candidates and requisitions are scoped by department", async () => {
  const job = (title: string, department: string) => ({
    title,
    department,
    location: "Noida HQ",
    employmentType: "full_time",
    openings: 1,
    hiringManagerId: personas.manager,
    description:
      "Build and maintain reliable services and collaborate with the team to deliver secure production systems.",
    skills: ["TypeScript"],
    experienceMin: 1,
    experienceMax: 10,
    ctcMin: "500000",
    ctcMax: "2000000",
    publishToCareers: false,
  });
  expectProblem(
    await api.as("scopedHr", "POST", "/recruitment/jobs", {
      body: job("Scoped Product Designer", "Design"),
      idempotencyKey: newKey(),
    }),
    403,
    "DEPARTMENT_OUT_OF_SCOPE",
  );
  const engineeringJob = dataOf<{ id: string }>(
    await api.as("scopedHr", "POST", "/recruitment/jobs", {
      body: job("Scoped Backend Engineer", "Engineering"),
      idempotencyKey: newKey(),
    }),
  );
  const designJob = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/recruitment/jobs", {
      body: job("Senior Product Designer", "Design"),
      idempotencyKey: newKey(),
    }),
  );
  dataOf(await api.as("hr", "POST", `/recruitment/jobs/${designJob.id}/state`, { body: { to: "published" } }));
  const jobs = dataOf<{ id: string; department: string }[]>(await api.as("scopedHr", "GET", "/recruitment/jobs"));
  assert.ok(jobs.some((j) => j.id === engineeringJob.id));
  assert.ok(jobs.every((j) => j.department === "Engineering"));
  expectProblem(await api.as("scopedHr", "GET", `/recruitment/jobs/${designJob.id}`), 404);
  dataOf(await api.as("hr", "GET", `/recruitment/jobs/${designJob.id}`));
  dataOf(await api.as("superAdmin", "GET", `/recruitment/jobs/${engineeringJob.id}`));
  expectProblem(
    await api.as("scopedHr", "POST", `/recruitment/jobs/${designJob.id}/state`, { body: { to: "on_hold" } }),
    404,
  );

  const candidateInput = {
    jobId: designJob.id,
    name: "Scope Candidate",
    email: "scope.candidate@example.com",
    phone: "9811122233",
    currentCompany: "Example",
    experienceYears: "3",
    noticePeriodDays: 30,
    source: "linkedin",
    consent: "on",
  };
  expectProblem(
    await api.as("scopedHr", "POST", "/recruitment/candidates", { body: candidateInput, idempotencyKey: newKey() }),
    404,
  );
  const candidate = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/recruitment/candidates", { body: candidateInput, idempotencyKey: newKey() }),
  );
  expectProblem(await api.as("scopedHr", "GET", `/recruitment/candidates/${candidate.id}`), 404);
  expectProblem(await api.as("scopedHr", "GET", `/recruitment/candidates/${candidate.id}/resume`), 404);
  expectProblem(
    await api.as("scopedHr", "POST", `/recruitment/candidates/${candidate.id}/stage`, {
      body: { to: "screening", reason: "" },
    }),
    404,
  );
  assert.ok(
    !dataOf<{ id: string }[]>(await api.as("scopedHr", "GET", "/recruitment/candidates")).some(
      (c) => c.id === candidate.id,
    ),
  );
  dataOf(await api.as("hr", "GET", `/recruitment/candidates/${candidate.id}`));
  dataOf(await api.as("superAdmin", "GET", `/recruitment/candidates/${candidate.id}`));
  const scopedStats = dataOf<{ activeJobs: number }>(await api.as("scopedHr", "GET", "/recruitment/stats"));
  const orgStats = dataOf<{ activeJobs: number }>(await api.as("hr", "GET", "/recruitment/stats"));
  assert.ok(scopedStats.activeJobs < orgStats.activeJobs);

  // A Design manager's requisition is decided by Design-capable recruiters only.
  dataOf(
    await api.as("manager", "POST", "/recruitment/requisitions", {
      body: {
        title: "Visual Designer",
        department: "Design",
        location: "Noida HQ",
        openings: 1,
        employmentType: "full_time",
        budgetMin: "600000",
        budgetMax: "900000",
        justification: "new_role",
        reason: "Growing design demand across client programmes.",
      },
      idempotencyKey: newKey(),
    }),
  );
  const requisition = dataOf<{ id: string; department: string; canDecide: boolean }[]>(
    await api.as("hr", "GET", "/recruitment/requisitions"),
  ).find((q) => q.department === "Design");
  assert.ok(requisition?.canDecide);
  assert.ok(
    !dataOf<{ id: string }[]>(await api.as("scopedHr", "GET", "/recruitment/requisitions")).some(
      (q) => q.id === requisition.id,
    ),
  );
  expectProblem(
    await api.as("scopedHr", "POST", `/recruitment/requisitions/${requisition.id}/decision`, {
      body: { decision: "approve", note: "" },
    }),
    404,
  );

  expectProblem(await api.as("employee", "GET", "/recruitment/jobs"), 403);
  expectProblem(await api.as("employee", "GET", "/recruitment/candidates"), 403);
  dataOf(await api.as("employee", "GET", "/recruitment/me/referrals"));
  dataOf(await api.as("employee", "GET", "/recruitment/options"));
});

test("performance cycles are organization-level; calibration commands are scoped by department", async () => {
  const today = todayInOrgZone();
  const cycleInput = {
    name: "Scope Review Cycle",
    kind: "annual",
    periodStart: addDays(today, -30),
    periodEnd: addDays(today, 60),
    eligibilityCutoff: today,
    departments: [],
    goalWeight: 70,
    scale: [1, 2, 3, 4, 5].map((i) => ({ label: `Rating ${i}`, description: `Performance rating level ${i}` })),
    guideline: [5, 15, 60, 15, 5],
    phaseDates: {
      goal_setting: { start: addDays(today, -20), end: today },
      self_review: { start: today, end: addDays(today, 10) },
      manager_review: { start: addDays(today, 10), end: addDays(today, 20) },
      calibration: { start: addDays(today, 20), end: addDays(today, 30) },
    },
    releaseOn: addDays(today, 30),
  };
  expectProblem(
    await api.as("scopedHr", "POST", "/performance/cycles", { body: cycleInput, idempotencyKey: newKey() }),
    403,
    ORG_WIDE,
  );
  const cycle = dataOf<{ id: string }>(
    await api.as("hr", "POST", "/performance/cycles", { body: cycleInput, idempotencyKey: newKey() }),
  );
  expectProblem(
    await api.as("scopedHr", "POST", `/performance/cycles/${cycle.id}/advance`, { body: { expectedPhase: "draft" } }),
    403,
    ORG_WIDE,
  );
  dataOf(
    await api.as("superAdmin", "POST", `/performance/cycles/${cycle.id}/advance`, { body: { expectedPhase: "draft" } }),
  );
  expectProblem(
    await api.as("scopedHr", "POST", "/performance/competencies", {
      body: { name: "Scoped", description: "Scoped competency description.", behaviours: ["One"] },
    }),
    403,
    ORG_WIDE,
  );

  interface Overview {
    participants: { reviewId: string; person: { id: string }; version: number }[];
    departments: string[];
    audit: unknown[];
  }
  const scoped = dataOf<Overview>(
    await api.as("scopedHr", "GET", "/performance/cycles/overview", { query: { cycle: cycle.id } }),
  );
  assert.ok(scoped.participants.length > 0);
  onlyEngineering(
    scoped.participants.map((p) => p.person.id),
    "performance participants",
  );
  assert.deepEqual(scoped.departments, ["Engineering"]);
  assert.deepEqual(scoped.audit, []);
  const org = dataOf<Overview>(
    await api.as("hr", "GET", "/performance/cycles/overview", { query: { cycle: cycle.id } }),
  );
  assert.ok(org.participants.length > scoped.participants.length);
  assert.ok(org.audit.length > 0);
  dataOf(await api.as("superAdmin", "GET", "/performance/cycles/overview", { query: { cycle: cycle.id } }));

  const designReview = org.participants.find((p) => p.person.id === design.active);
  const engineeringReview = org.participants.find((p) => p.person.id === engineering.active);
  assert.ok(designReview && engineeringReview);
  expectProblem(
    await api.as("scopedHr", "PATCH", `/performance/reviews/${designReview.reviewId}/reviewer`, {
      body: { reviewId: designReview.reviewId, reviewerId: "emp_0002", reason: "Out of scope reassignment" },
    }),
    404,
  );
  dataOf(
    await api.as("scopedHr", "PATCH", `/performance/reviews/${engineeringReview.reviewId}/reviewer`, {
      body: { reviewId: engineeringReview.reviewId, reviewerId: "emp_0002", reason: "Independent reviewer" },
    }),
  );
  dataOf(
    await api.as("hr", "PATCH", `/performance/reviews/${designReview.reviewId}/reviewer`, {
      body: { reviewId: designReview.reviewId, reviewerId: "emp_0002", reason: "Independent reviewer" },
    }),
  );

  expectProblem(await api.as("employee", "GET", "/performance/cycles/overview"), 403);
  dataOf(await api.as("employee", "GET", "/performance/me", { query: { cycle: cycle.id } }));
  dataOf(await api.as("employee", "GET", "/performance/feedback"));
});
