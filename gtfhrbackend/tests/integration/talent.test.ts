import { requireValue } from "../../src/modules/talent/talent.schema.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { useTestApi, dataOf, expectProblem, newKey, personas } from "../helpers/api.js";
import { frontendContract, expectContract, expectListContract } from "../helpers/contract.js";
import { todayInOrgZone, addDays } from "../../src/utils/date.js";
import * as l from "../../src/contracts/lifecycle.js";
import * as p from "../../src/contracts/performance.js";
import * as r from "../../src/contracts/recruitment.js";
import { createDeliveryRepository } from "../../src/modules/delivery/delivery.repository.js";
const api = useTestApi();

test("configuration routes reject malformed identifiers and payloads", async () => {
  expectProblem(await api.as("hr", "POST", "/assets", { body: { tag: "bad" } }), 400);
});
test("talent reads obey frontend schemas and deny unauthenticated/unauthorized access", async () => {
  const lifecycle = await frontendContract("lifecycle");
  const perf = await frontendContract("performance");
  const recruit = await frontendContract("recruitment");
  for (const [persona, path, schema] of [
    ["employee", "/me/resignation", lifecycle.resignationViewSchema],
    ["employee", "/me/assets", lifecycle.myAssetsSchema],
    ["hr", "/assets", lifecycle.assetInventorySchema],
    ["hr", "/lifecycle/offboarding/board", lifecycle.offboardingBoardSchema],
    ["hr", "/letter-templates/studio", lifecycle.letterStudioSchema],
    ["hr", "/settlements", lifecycle.settlementBoardSchema],
    ["employee", "/performance/me", perf.myPerformanceSchema],
    ["manager", "/performance/team", perf.teamPerformanceSchema],
    ["hr", "/performance/cycles/overview", perf.adminPerformanceSchema],
    ["employee", "/performance/feedback", perf.feedbackHubSchema],
    ["hr", "/recruitment/stats", recruit.recruitmentStatsSchema],
    ["employee", "/recruitment/options", recruit.recruitmentOptionsSchema],
    ["manager", "/recruitment/me/interviews", recruit.myInterviewsSchema],
  ] as const)
    expectContract(schema, dataOf(await api.as(persona, "GET", path)));
  expectListContract(lifecycle.myPolicySchema, await api.as("employee", "GET", "/me/policies"));
  expectProblem(await api.as(null, "GET", "/assets"), 401);
  expectProblem(await api.as("employee", "GET", "/assets"), 403);
  expectProblem(await api.as("employee", "GET", "/recruitment/candidates"), 403);
  expectProblem(await api.as("employee", "GET", "/performance/cycles/overview"), 403);
});
test("assets, policies and letters persist with ownership and idempotency", async () => {
  const key = newKey();
  const input = {
    tag: "LAP-99301",
    category: "laptop",
    make: "Lenovo",
    model: "ThinkPad",
    serial: "SERIAL-TALENT-99301",
    purchasedOn: todayInOrgZone(),
    cost: "55000.50",
    condition: "new",
    notes: "Integration workstation",
  };
  const asset = dataOf<{
    id: string;
    tag: string;
  }>(await api.as("hr", "POST", "/assets", { body: input, idempotencyKey: key }));
  assert.deepEqual(dataOf(await api.as("hr", "POST", "/assets", { body: input, idempotencyKey: key })), asset);
  dataOf(
    await api.as("hr", "POST", `/assets/${asset.id}/assignments`, {
      body: { employeeId: personas.employee, note: "First issue" },
    }),
  );
  expectProblem(await api.as("manager", "POST", `/me/assets/${asset.id}/acknowledge`, { body: {} }), 403);
  dataOf(await api.as("employee", "POST", `/me/assets/${asset.id}/acknowledge`, { body: {} }));
  const my = l.myAssetsSchema.parse(dataOf(await api.as("employee", "GET", "/me/assets")));
  assert.ok(my.assigned.find((a) => a.id === asset.id)?.acknowledgedAt);
  expectProblem(
    await api.as("hr", "POST", `/assets/${asset.id}/return`, {
      body: { condition: "good", note: "Returned" },
      ifMatch: 1,
    }),
    412,
  );
  dataOf(
    await api.as("hr", "POST", `/assets/${asset.id}/return`, {
      body: { condition: "good", note: "Returned" },
      ifMatch: requireValue(my.assigned.find((a) => a.id === asset.id)).version,
    }),
  );
  assert.equal(l.myAssetsSchema.parse(dataOf(await api.as("employee", "GET", "/me/assets"))).returned.length, 1);
  const policy = dataOf<{
    id: string;
    audience: number;
  }>(
    await api.as("hr", "POST", "/policies", {
      body: {
        title: "Information handling policy",
        version: "v99.1",
        summary: "Handling information in the integration environment.",
        body: "Employees must protect sensitive customer information and follow approved access and retention procedures.",
        audience: "Everyone",
        dueOn: addDays(todayInOrgZone(), 5),
      },
      idempotencyKey: newKey(),
    }),
  );
  assert.ok(policy.audience > 0);
  dataOf(await api.as("employee", "POST", `/me/policies/${policy.id}/acknowledgements`, { body: {} }));
  const policies = dataOf<unknown[]>(await api.as("employee", "GET", "/me/policies")).map((v) =>
    l.myPolicySchema.parse(v),
  );
  assert.ok(policies.find((p) => p.id === policy.id)?.acknowledgedAt);
  const issued = dataOf<{
    id: string;
  }>(
    await api.as("hr", "POST", "/letters", {
      body: {
        templateId: "tpl_employment",
        employeeId: personas.employee,
        purpose: "Bank verification",
        addressedTo: "Bank",
      },
      idempotencyKey: newKey(),
    }),
  );
  assert.equal(
    l.issuedLetterSchema.parse(dataOf(await api.as("employee", "GET", `/letters/${issued.id}`))).person.id,
    personas.employee,
  );
  expectProblem(await api.as("manager", "GET", `/letters/${issued.id}`), 403);
});
test("recruitment publishes a restricted public projection and persists hiring workflow", async () => {
  const options = r.recruitmentOptionsSchema.parse(dataOf(await api.as("hr", "GET", "/recruitment/options")));
  const input = {
    title: "Integration Platform Engineer",
    department: options.departments[0],
    location: options.locations[0],
    employmentType: "full_time",
    openings: 1,
    hiringManagerId: personas.manager,
    description:
      "Build and maintain reliable services and collaborate with the engineering team to deliver secure production systems.",
    skills: ["TypeScript", "PostgreSQL"],
    experienceMin: 1,
    experienceMax: 10,
    ctcMin: "500000",
    ctcMax: "2000000",
    publishToCareers: true,
  };
  const job = dataOf<{
    id: string;
  }>(await api.as("hr", "POST", "/recruitment/jobs", { body: input, idempotencyKey: newKey() }));
  dataOf(await api.as("hr", "POST", `/recruitment/jobs/${job.id}/state`, { body: { to: "published" }, ifMatch: 1 }));
  const publicResponse = dataOf<Record<string, unknown>>(await api.as(null, "GET", `/public/careers/jobs/${job.id}`));
  r.publicJobSchema.parse(publicResponse);
  assert.equal(publicResponse.ctcMax, undefined);
  assert.equal(publicResponse.hiringManager, undefined);
  const resumeBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
  const application = {
    jobId: job.id,
    name: "Integration Candidate",
    email: "talent.candidate@example.com",
    phone: "9876543210",
    experienceYears: "4.5",
    currentCompany: "Example",
    noticePeriodDays: 30,
    consent: "on",
    resume: {
      name: "resume.pdf",
      sizeBytes: resumeBytes.length,
      mime: "application/pdf",
      contentBase64: resumeBytes.toString("base64"),
    },
  };
  dataOf(
    await api.as(null, "POST", `/public/careers/jobs/${job.id}/applications`, {
      body: application,
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(
    await api.as(null, "POST", `/public/careers/jobs/${job.id}/applications`, {
      body: application,
      idempotencyKey: newKey(),
    }),
    409,
  );
  const candidates = dataOf<unknown[]>(
    await api.as("hr", "GET", "/recruitment/candidates", { query: { jobId: job.id } }),
  ).map((c) => r.candidateDetailSchema.parse(c));
  const candidate = requireValue(candidates[0]);
  assert.equal(candidate.name, application.name);
  expectProblem(await api.as(null, "GET", `/recruitment/candidates/${candidate.id}/resume`), 401);
  expectProblem(await api.as("employee", "GET", `/recruitment/candidates/${candidate.id}/resume`), 403);
  expectProblem(await api.as("hr", "GET", `/recruitment/candidates/${candidate.id}/resume`), 409);
  const resumeRow = requireValue(
    await api.prisma.workspaceRecord.findFirst({ where: { kind: "resume", parentId: candidate.id } }),
  );
  const delivery = createDeliveryRepository(api.prisma);
  assert.ok((await delivery.scanning()).some((row) => row.id === resumeRow.id));
  assert.deepEqual(Buffer.from(requireValue(await delivery.file(resumeRow.id)).bytes), resumeBytes);
  await delivery.completeScan(resumeRow.id, resumeRow.version, true);
  const download = dataOf<{ contentBase64: string; fileName: string }>(
    await api.as("hr", "GET", `/recruitment/candidates/${candidate.id}/resume`),
  );
  assert.deepEqual(Buffer.from(download.contentBase64, "base64"), resumeBytes);
  assert.equal(download.fileName, "resume.pdf");
  assert.ok(await api.prisma.auditLog.count({ where: { action: "recruitment.resume_download" } }));
  dataOf(
    await api.as("hr", "POST", `/recruitment/candidates/${candidate.id}/stage`, {
      body: { to: "interview", reason: "Ready for interview" },
      ifMatch: 1,
    }),
  );
  dataOf(
    await api.as("hr", "POST", `/recruitment/candidates/${candidate.id}/offers`, {
      body: {
        candidateId: candidate.id,
        ctc: { amount: "2400000.00", currency: "INR" },
        joiningDate: addDays(todayInOrgZone(), 20),
        designation: "Platform Engineer",
        department: options.departments[0],
        location: options.locations[0],
        managerId: personas.manager,
      },
      idempotencyKey: newKey(),
    }),
  );
  const offer = r.offerSchema.parse(dataOf(await api.as("hr", "GET", `/recruitment/candidates/${candidate.id}/offer`)));
  assert.equal(offer.state, "pending_approval");
  expectProblem(
    await api.as("hr", "POST", `/recruitment/offers/${offer.id}/approval`, {
      body: { decision: "approve", note: "" },
      ifMatch: 1,
    }),
    403,
  );
  dataOf(
    await api.as("finance", "POST", `/recruitment/offers/${offer.id}/approval`, {
      body: { decision: "approve", note: "Approved budget exception" },
      ifMatch: 1,
    }),
  );
  dataOf(
    await api.as("hr", "POST", `/recruitment/offers/${offer.id}/response`, {
      body: { response: "accepted", note: "Accepted by candidate" },
      ifMatch: 2,
    }),
  );
  const conversion = dataOf<{
    employeeId: string;
    code: string;
  }>(await api.as("hr", "POST", `/recruitment/offers/${offer.id}/convert`, { body: {}, idempotencyKey: newKey() }));
  assert.ok(await api.prisma.employee.findUnique({ where: { id: conversion.employeeId } }));
  expectProblem(
    await api.as("hr", "POST", `/recruitment/offers/${offer.id}/convert`, { body: {}, idempotencyKey: newKey() }),
    409,
  );
  assert.equal((await api.prisma.talentRecord.findFirst({ where: { id: job.id } }))?.state, "filled");
});
test("performance enforces goal ownership, weights, independent approval and private feedback", async () => {
  const today = todayInOrgZone();
  const cycle = dataOf<{
    id: string;
  }>(
    await api.as("hr", "POST", "/performance/cycles", {
      body: {
        name: "Integration Review Cycle",
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
      },
      idempotencyKey: newKey(),
    }),
  );
  dataOf(await api.as("hr", "POST", `/performance/cycles/${cycle.id}/advance`, { body: { expectedPhase: "draft" } }));
  dataOf(
    await api.as("employee", "POST", "/performance/goals", {
      body: {
        cycleId: cycle.id,
        title: "Deliver reliable APIs",
        description: "Ship integrations",
        target: "All endpoints pass contract tests",
        weight: 100,
        dueDate: addDays(today, 30),
        objectiveId: null,
      },
      idempotencyKey: newKey(),
    }),
  );
  const mine = p.myPerformanceSchema.parse(
    dataOf(await api.as("employee", "GET", "/performance/me", { query: { cycle: cycle.id } })),
  );
  assert.equal(mine.goals.length, 1);
  expectProblem(
    await api.as("manager", "POST", `/performance/goals/${requireValue(mine.goals[0]).id}/delete`, { body: {} }),
    403,
  );
  dataOf(await api.as("employee", "POST", `/performance/cycles/${cycle.id}/goal-sheet/submit`, { body: {} }));
  const submitted = p.myPerformanceSchema.parse(
    dataOf(await api.as("employee", "GET", "/performance/me", { query: { cycle: cycle.id } })),
  );
  dataOf(
    await api.as("manager", "POST", `/performance/goal-sheets/${requireValue(submitted.sheet).id}/decision`, {
      body: {
        sheetId: requireValue(submitted.sheet).id,
        decision: "approve",
        comment: "Clear goals",
        version: submitted.reviewVersion,
      },
    }),
  );
  expectProblem(
    await api.as("employee", "PATCH", `/performance/goals/${requireValue(mine.goals[0]).id}`, {
      body: {
        id: requireValue(mine.goals[0]).id,
        cycleId: cycle.id,
        title: "Changed goal",
        description: "Change",
        target: "Change target",
        weight: 100,
        dueDate: addDays(today, 30),
        objectiveId: null,
      },
    }),
    409,
  );
  dataOf(
    await api.as("employee", "POST", "/performance/feedback", {
      body: {
        toId: personas.manager,
        visibility: "private",
        kind: "praise",
        competencyId: null,
        requestId: null,
        message: "Thank you for helping with the delivery and feedback.",
      },
      idempotencyKey: newKey(),
    }),
  );
  const employeeHub = p.feedbackHubSchema.parse(dataOf(await api.as("employee", "GET", "/performance/feedback")));
  const hrHub = p.feedbackHubSchema.parse(dataOf(await api.as("hr", "GET", "/performance/feedback")));
  assert.equal(employeeHub.given.length, 1);
  assert.equal(hrHub.wall.length, 0);
  assert.equal(hrHub.received.length, 0);
});

test("resignation, offboarding and settlement form an audited workflow", async () => {
  const today = todayInOrgZone();
  dataOf(
    await api.as("employee", "POST", "/me/resignation", {
      body: {
        reason: "personal",
        note: "I need to leave for personal commitments.",
        lastWorkingDay: addDays(today, 60),
        earlyReleaseReason: "",
      },
      idempotencyKey: newKey(),
    }),
  );
  let view = l.resignationViewSchema.parse(dataOf(await api.as("employee", "GET", "/me/resignation")));
  let current = requireValue(view.current);
  expectProblem(
    await api.as("employee", "POST", `/resignations/${current.id}/decisions`, {
      body: { decision: "accept", note: "Self approve" },
      ifMatch: current.version,
    }),
    403,
  );
  dataOf(
    await api.as("manager", "POST", `/resignations/${current.id}/decisions`, {
      body: { decision: "accept", note: "Handover can be arranged" },
      ifMatch: current.version,
    }),
  );
  view = l.resignationViewSchema.parse(dataOf(await api.as("employee", "GET", "/me/resignation")));
  current = requireValue(view.current);
  assert.equal(current.state, "pending_hr");
  dataOf(
    await api.as("hr", "POST", `/resignations/${current.id}/decisions`, {
      body: { decision: "accept", lastWorkingDay: today, note: "Approved immediate release for the test" },
      ifMatch: current.version,
    }),
  );
  const board = l.offboardingBoardSchema.parse(dataOf(await api.as("hr", "GET", "/lifecycle/offboarding/board")));
  const exit = requireValue(board.cases.find((e) => e.person.id === personas.employee));
  expectProblem(await api.as("hr", "POST", `/lifecycle/offboarding/${personas.employee}/complete`, { body: {} }), 409);
  for (const task of exit.tasks)
    dataOf(
      await api.as("hr", "PATCH", `/lifecycle/offboarding/${personas.employee}/tasks/${task.id}`, {
        body: { done: true },
      }),
    );
  for (const department of ["manager", "it", "admin", "finance"])
    dataOf(
      await api.as("hr", "PATCH", `/lifecycle/offboarding/${personas.employee}/clearances/${department}`, {
        body: { status: "cleared", note: "All checks complete" },
      }),
    );
  dataOf(
    await api.as("hr", "POST", `/lifecycle/offboarding/${personas.employee}/exit-interview`, {
      body: {
        employeeId: personas.employee,
        primaryReason: "personal",
        role: 4,
        manager: 4,
        growth: 4,
        compensation: 4,
        culture: 4,
        workLife: 4,
        wouldRejoin: "yes",
        wouldRecommend: true,
        comments: "Good employment experience.",
      },
    }),
  );
  const prepared = dataOf<{ id: string }>(
    await api.as("payroll", "POST", "/settlements", {
      body: { employeeId: personas.employee },
      idempotencyKey: newKey(),
    }),
  );
  const detail = async () =>
    l.settlementDetailSchema.parse(dataOf(await api.as("payroll", "GET", `/settlements/${prepared.id}`)));
  let settlement = await detail();
  assert.ok(settlement.lines.length > 0);
  assert.ok(Number(settlement.monthlyGross.amount) > 0);
  dataOf(
    await api.as("payroll", "PATCH", `/settlements/${prepared.id}/notice-waiver`, {
      body: { waive: true, reason: "Approved early release without recovery" },
      ifMatch: settlement.version,
    }),
  );
  settlement = await detail();
  dataOf(
    await api.as("payroll", "POST", `/settlements/${prepared.id}/lines`, {
      body: {
        kind: "earning",
        label: "Approved integration adjustment",
        amount: { amount: "100000.00", currency: "INR" },
        reason: "Approved reconciliation adjustment for integration scenario",
      },
      ifMatch: settlement.version,
    }),
  );
  settlement = await detail();
  expectProblem(
    await api.as("payroll", "POST", `/settlements/${prepared.id}/submit`, { body: {}, ifMatch: settlement.version }),
    409,
  );
  const policy = dataOf<Record<string, unknown>>(await api.as("hr", "GET", "/config/settlement-policy"));
  dataOf(
    await api.as("hr", "PATCH", "/config/settlement-policy", { body: { ...policy, approvedForProduction: true } }),
  );
  dataOf(
    await api.as("payroll", "POST", `/settlements/${prepared.id}/submit`, { body: {}, ifMatch: settlement.version }),
  );
  settlement = await detail();
  dataOf(
    await api.as("finance", "POST", `/settlements/${prepared.id}/decisions`, {
      body: { decision: "approve", reason: "Reviewed calculation and supporting approvals" },
      ifMatch: settlement.version,
    }),
  );
  settlement = await detail();
  dataOf(
    await api.as("finance", "POST", `/settlements/${prepared.id}/payment`, {
      body: { utr: "TALENT2026000001", paidOn: today },
      ifMatch: settlement.version,
    }),
  );
  assert.equal((await detail()).state, "paid");
  dataOf(await api.as("hr", "POST", `/lifecycle/offboarding/${personas.employee}/complete`, { body: {} }));
  assert.equal((await api.prisma.employee.findUnique({ where: { id: personas.employee } }))?.status, "exited");
  assert.ok((await api.prisma.userAccount.findUnique({ where: { employeeId: personas.employee } }))?.disabledAt);
  expectProblem(await api.as("employee", "GET", "/me/assets"), 401);
  assert.ok(await api.prisma.auditLog.count({ where: { action: "lifecycle.settlement_payment" } }));
});
