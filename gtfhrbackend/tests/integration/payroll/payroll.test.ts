import assert from "node:assert/strict";
import { test } from "node:test";
import { dataOf, expectProblem, newKey, useTestApi } from "../../helpers/api.js";
import { expectContract, expectListContract, frontendContract } from "../../helpers/contract.js";
import { todayInOrgZone } from "../../../src/utils/date.js";
import { addMonths } from "../../../src/modules/payroll/payroll.rules.js";
import { encrypt } from "../../../src/core/security/encryption.js";
import { createReportsService } from "../../../src/modules/reports/reports.service.js";
import { createPayrollRepository } from "../../../src/modules/payroll/payroll.repository.js";
import { loadCalculationData } from "../../../src/modules/payroll/payroll.service.js";
import { leaveTypeConfigSchema } from "../../../src/contracts/hr-config.js";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const api = useTestApi();
test("payroll, salary, statutory and report read contracts and access", async () => {
  for (const [persona, path, file, schema] of [
    ["payroll", "/payroll/overview", "payroll", "payrollOverviewSchema"],
    ["payroll", "/payroll/structures", "statutory", "structuresSchema"],
    ["payroll", "/payroll/statutory", "statutory", "statutoryHubSchema"],
    ["payroll", "/payroll/statutory/setup", "statutory", "statutorySetupSchema"],
    ["payroll", "/payroll/statutory/employees", "statutory", "statutoryEmployeesSchema"],
    ["employee", "/me/salary/ytd", "salary", "ytdSchema"],
    ["employee", "/me/tax/declaration", "salary", "taxDeclarationSchema"],
    ["employee", "/me/tax/statement", "salary", "taxStatementSchema"],
    ["employee", "/me/compensation", "salary", "compensationSchema"],
    ["employee", "/me/tax/form-16", "statutory", "form16Schema"],
    ["payroll", "/payroll/form-16", "statutory", "form16StatusSchema"],
    ["hr", "/reports/library", "reports", "reportLibrarySchema"],
    ["hr", "/reports/builder", "reports", "builderContextSchema"],
    ["hr", "/reports/analytics/workforce", "reports", "reportAnalyticsSchema"],
    ["hr", "/reports/workforce", "admin", "workforceReportSchema"],
  ] as const) {
    const contract = await frontendContract(file);
    expectContract(contract[schema], dataOf(await api.as(persona, "GET", path)));
  }
  expectProblem(await api.as("employee", "GET", "/payroll/overview"), 403);
  expectProblem(await api.as("hr", "GET", "/payroll/statutory/employees"), 403);
  expectProblem(await api.as(null, "GET", "/me/payslips"), 401);
  expectProblem(await api.as("payroll", "GET", "/payroll/runs/missing"), 404);
  const loans = await frontendContract("salary");
  expectListContract(loans.loanSchema, await api.as("employee", "GET", "/me/loans"));
  const overview = dataOf<{ current: { id: string } | null }>(await api.as("payroll", "GET", "/payroll/overview"));
  assert.ok(overview.current);
  const contract = await frontendContract("payroll");
  expectContract(
    contract.payrollRunDetailSchema,
    dataOf(await api.as("payroll", "GET", `/payroll/runs/${overview.current.id}`)),
  );
  const payslips = dataOf<{ id: string }[]>(await api.as("employee", "GET", "/me/payslips"));
  assert.ok(payslips.length);
  const slip = payslips[0];
  assert.ok(slip);
  expectContract(
    contract.payslipDetailSchema,
    dataOf(await api.as("employee", "GET", `/me/payslips/${encodeURIComponent(slip.id)}`)),
  );
  expectProblem(await api.as("manager", "GET", `/me/payslips/${encodeURIComponent(slip.id)}`), 404);
});

test("payroll command state machine, paise input, holds, idempotency and immutable publication", async () => {
  const month = addMonths(todayInOrgZone().slice(0, 7), 1);
  const key = newKey();
  const first = await api.as("payroll", "POST", "/payroll/runs", { body: { month }, idempotencyKey: key });
  const id = dataOf<{ id: string }>(first).id;
  assert.deepEqual(
    (await api.as("payroll", "POST", "/payroll/runs", { body: { month }, idempotencyKey: key })).body,
    first.body,
  );
  const input = await api.as("payroll", "POST", `/payroll/runs/${id}/inputs`, {
    body: { employeeId: "emp_0007", kind: "bonus", amount: "1234.56", note: "Contract test bonus" },
    idempotencyKey: newKey(),
  });
  const inputId = dataOf<{ id: string }>(input).id;
  expectProblem(
    await api.as("payroll", "POST", `/payroll/runs/${id}/inputs`, {
      body: { employeeId: "emp_0007", kind: "bonus", amount: "bad", note: "Invalid amount" },
    }),
    400,
  );
  dataOf(await api.as("payroll", "POST", `/payroll/runs/${id}/inputs/${inputId}/remove`));
  const holdId = dataOf<{ id: string }>(
    await api.as("payroll", "POST", `/payroll/runs/${id}/holds`, {
      body: { employeeId: "emp_0007", reason: "Payment review requested" },
      idempotencyKey: newKey(),
    }),
  ).id;
  dataOf(
    await api.as("payroll", "POST", `/payroll/runs/${id}/holds/${holdId}/release`, {
      body: { note: "Review completed" },
    }),
  );
  const run = dataOf<{ revision: number }>(await api.as("payroll", "GET", `/payroll/runs/${id}`));
  expectProblem(
    await api.as("payroll", "POST", `/payroll/runs/${id}/submit-review`, {
      body: {},
      ifMatch: run.revision - 1,
      idempotencyKey: newKey(),
    }),
    412,
  );
  dataOf(
    await api.as("payroll", "POST", `/payroll/runs/${id}/submit-review`, {
      body: {},
      ifMatch: run.revision,
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(await api.as("payroll", "POST", `/payroll/runs/${id}/approve`, { body: {} }), 403);
  const review = dataOf<{ revision: number }>(await api.as("finance", "GET", `/payroll/runs/${id}`));
  dataOf(
    await api.as("finance", "POST", `/payroll/runs/${id}/reject`, {
      body: { note: "Review and resubmit" },
      ifMatch: review.revision,
      idempotencyKey: newKey(),
    }),
  );
  dataOf(await api.as("payroll", "POST", `/payroll/runs/${id}/submit-review`, { body: {}, idempotencyKey: newKey() }));
  dataOf(await api.as("finance", "POST", `/payroll/runs/${id}/approve`, { body: {}, idempotencyKey: newKey() }));
  dataOf(await api.as("finance", "POST", `/payroll/runs/${id}/publish`, { body: {}, idempotencyKey: newKey() }));
  const frozen = await api.prisma.payResult.findFirstOrThrow({ where: { runId: id } });
  await assert.rejects(api.prisma.payResult.update({ where: { id: frozen.id }, data: { netPaise: 1n } }));
  expectProblem(
    await api.as("payroll", "POST", `/payroll/runs/${id}/inputs`, {
      body: { employeeId: "emp_0007", kind: "bonus", amount: "1", note: "Attempt frozen edit" },
    }),
    409,
  );
  dataOf(await api.as("payroll", "GET", `/payroll/runs/${id}/register/export`));
  dataOf(await api.as("finance", "GET", `/payroll/runs/${id}/bank-advice/export`));
});

test("declarations, structure segregation, compensation imports and bank permissions", async () => {
  dataOf(
    await api.as("employee", "PATCH", "/me/tax/declaration", {
      body: { regime: "old", monthlyRent: "10000", rentCity: "metro", items: { "80c_ppf": "1000" }, submit: true },
    }),
  );
  expectProblem(
    await api.as("employee", "PATCH", "/me/tax/declaration", {
      body: { regime: "old", monthlyRent: "bad", items: {} },
    }),
    400,
  );
  const setup = dataOf<{ settingsVersion: number }>(await api.as("payroll", "GET", "/payroll/statutory/setup"));
  dataOf(
    await api.as("payroll", "PATCH", "/payroll/statutory/settings", {
      body: { wageBasis: "ceiling", esiCeiling: "21000", expectedVersion: setup.settingsVersion },
      ifMatch: setup.settingsVersion,
    }),
  );
  expectProblem(
    await api.as("payroll", "PATCH", "/payroll/statutory/settings", {
      body: { wageBasis: "ceiling", esiCeiling: "21000", expectedVersion: setup.settingsVersion },
      ifMatch: setup.settingsVersion,
    }),
    412,
  );
  dataOf(
    await api.as("payroll", "PATCH", "/payroll/statutory/employees/emp_0007", {
      body: { employeeId: "emp_0007", uan: "100000000007", esiIp: "", vpfPercent: "0", pfOptOut: "no" },
    }),
  );
  expectProblem(
    await api.as("payroll", "POST", "/payroll/statutory/employees/emp_0007/bank-verification", {
      body: { decision: "verified" },
    }),
    403,
  );
  dataOf(
    await api.as("finance", "POST", "/payroll/statutory/employees/emp_0007/bank-verification", {
      body: { decision: "verified" },
    }),
  );
  const importMonth = addMonths(todayInOrgZone().slice(0, 7), 2);
  const employee = await api.prisma.employee.findUniqueOrThrow({ where: { id: "emp_0007" } });
  const file = `Employee code,Annual CTC,Effective from,Reason\n${employee.code},1800000,${importMonth}-01,Annual salary review\n`;
  const batch = dataOf<{ id: string }>(
    await api.as("payroll", "POST", "/compensation/imports/upload", {
      body: { fileName: "salary.csv", base64: Buffer.from(file).toString("base64") },
      idempotencyKey: newKey(),
    }),
  );
  expectContract(
    (await frontendContract("compensation-import")).compensationBatchSchema,
    dataOf(await api.as("finance", "GET", `/compensation/imports/${batch.id}`)),
  );
  dataOf(
    await api.as("payroll", "POST", `/compensation/imports/${batch.id}/decisions`, {
      body: { decision: "submit", reason: "" },
      idempotencyKey: newKey(),
    }),
  );
  expectProblem(
    await api.as("payroll", "POST", `/compensation/imports/${batch.id}/decisions`, {
      body: { decision: "approve", reason: "" },
      idempotencyKey: newKey(),
    }),
    403,
  );
  dataOf(
    await api.as("finance", "POST", `/compensation/imports/${batch.id}/decisions`, {
      body: { decision: "approve", reason: "Reviewed" },
      idempotencyKey: newKey(),
    }),
  );
  assert.equal((await api.prisma.payCompensation.findMany({ where: { batchId: batch.id } })).length, 1);
  const contract = await frontendContract("compensation-import");
  expectListContract(contract.compensationBatchSummarySchema, await api.as("payroll", "GET", "/compensation/imports"));
});

test("custom reports, saved report versions, schedules and artifacts", async () => {
  const spec = {
    dataset: "employees",
    columns: ["code", "name", "department"],
    filters: { department: "", location: "", status: "", leaveState: "", month: "", from: "", to: "" },
    sort: null,
    groupBy: null,
    aggregate: null,
  };
  const contracts = await frontendContract("reports");
  expectContract(
    contracts.reportTableSchema,
    dataOf(await api.as("hr", "GET", "/reports/preview?dataset=employees&col=code&col=name")),
  );
  expectProblem(
    await api.as("hr", "POST", "/reports/custom/export", {
      body: { spec: { ...spec, dataset: "payroll_register", columns: ["gross"] }, format: "csv" },
    }),
    403,
  );
  expectContract(
    contracts.exportFileSchema,
    dataOf(await api.as("hr", "POST", "/reports/custom/export", { body: { spec, format: "xls" } })),
  );
  const save = { name: "Contract report", description: "Review test", visibility: "private", sharedRoles: [], spec };
  const key = newKey();
  const created = await api.as("hr", "POST", "/reports/saved", { body: save, idempotencyKey: key });
  const id = dataOf<{ id: string }>(created).id;
  assert.deepEqual(
    (await api.as("hr", "POST", "/reports/saved", { body: save, idempotencyKey: key })).body,
    created.body,
  );
  expectContract(contracts.savedReportSchema, dataOf(await api.as("hr", "GET", `/reports/saved/${id}`)));
  expectProblem(await api.as("payroll", "GET", `/reports/saved/${id}`), 404);
  expectProblem(await api.as("hr", "PATCH", `/reports/saved/${id}`, { body: save, ifMatch: 99 }), 412);
  dataOf(
    await api.as("hr", "PATCH", `/reports/saved/${id}`, {
      body: { ...save, name: "Updated contract report" },
      ifMatch: 1,
    }),
  );
  expectContract(
    contracts.exportFileSchema,
    dataOf(await api.as("hr", "POST", `/reports/saved/${id}/export`, { body: { format: "csv" } })),
  );
  dataOf(
    await api.as("hr", "PATCH", `/reports/saved/${id}/schedule`, {
      body: {
        reportId: id,
        frequency: "daily",
        weekday: 1,
        dayOfMonth: 1,
        time: "10:00",
        format: "csv",
        recipients: ["emp_0005"],
        active: true,
      },
    }),
  );
  dataOf(await api.as("hr", "POST", `/reports/saved/${id}/schedule/run`, { body: {} }));
  const deliveries = dataOf<{ id: string }[]>(await api.as("hr", "GET", "/reports/deliveries"));
  assert.ok(deliveries[0]);
  expectContract(contracts.deliveryLogEntrySchema, deliveries[0]);
  expectContract(
    contracts.exportFileSchema,
    dataOf(await api.as("hr", "GET", `/reports/deliveries/${deliveries[0].id}/download`)),
  );
  expectProblem(await api.as("payroll", "GET", `/reports/deliveries/${deliveries[0].id}/download`), 404);
  const beforeScheduled = await api.prisma.reportDelivery.count({ where: { savedReportId: id } });
  await api.prisma.reportSaved.update({ where: { id }, data: { nextRunAt: new Date(Date.now() - 60000) } });
  const worker = createReportsService(api.prisma);
  await Promise.all([worker.processDue(), worker.processDue()]);
  assert.equal(await api.prisma.reportDelivery.count({ where: { savedReportId: id } }), beforeScheduled + 1);
  await api.prisma.reportSaved.update({
    where: { id },
    data: {
      nextRunAt: new Date(Date.now() - 60000),
      spec: { ...spec, dataset: "payroll_register", columns: ["gross"] },
    },
  });
  await worker.processDue();
  assert.equal((await api.prisma.reportSaved.findUniqueOrThrow({ where: { id } })).nextRunAt, null);
  dataOf(await api.as("hr", "POST", `/reports/saved/${id}/schedule/delete`, { body: {} }));
  dataOf(await api.as("hr", "POST", `/reports/saved/${id}/delete`, { body: {} }));
  const standard = await api.as("hr", "POST", "/reports/standard/headcount/export", {
    body: { filters: {}, format: "csv" },
  });
  expectContract(contracts.exportFileSchema, dataOf(standard));
  const log = dataOf<unknown[]>(await api.as("hr", "GET", "/reports/exports"));
  assert.ok(log.length);
  expectContract(contracts.exportLogEntrySchema, log[0]);
});

test("offline payroll provisioning validates actors, encrypts bank details and refuses to replace compensation", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "gtf-payroll-provision-"));
  const path = join(temporaryDirectory, "reviewed.json");
  try {
    const config = await api.prisma.payConfiguration.findUniqueOrThrow({ where: { id: 1 } });
    const input = {
      preparedBy: "emp_0004",
      approvedBy: "emp_0003",
      reason: "Reviewed statutory master data correction",
      expectedSettingsVersion: config.version,
      profiles: [
        {
          employeeId: "emp_0007",
          entityId: "gtf_pl",
          state: "UP",
          pan: "ABCDE1234F",
          accountNumber: "123456789012",
          bankName: "Test bank",
          ifsc: "HDFC0000001",
        },
      ],
    };
    const profile = await api.prisma.payProfile.findUniqueOrThrow({ where: { employeeId: "emp_0007" } });
    input.profiles[0] = {
      ...input.profiles[0],
      employeeId: "emp_0007",
      entityId: profile.entityId,
      state: profile.state,
      pan: "ABCDE1234F",
      accountNumber: "123456789012",
      bankName: "Test bank",
      ifsc: "HDFC0000001",
    };
    await writeFile(path, JSON.stringify(input));
    const invoke = () =>
      spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/payroll-provision.ts", path], {
        encoding: "utf8",
      });
    const success = invoke();
    assert.equal(success.status, 0, success.stderr);
    const updated = await api.prisma.payProfile.findUniqueOrThrow({ where: { employeeId: "emp_0007" } });
    assert.match(updated.accountNumber, /^v1\./);
    assert.match(updated.pan ?? "", /^v1\./);
    assert.equal(updated.bankStatus, "pending");
    await writeFile(
      path,
      JSON.stringify({
        ...input,
        openingCompensation: [
          {
            employeeId: "emp_0007",
            effectiveFrom: todayInOrgZone(),
            annualCtc: "1200000",
            reference: "SHOULD-NOT-REPLACE",
          },
        ],
      }),
    );
    const denied = invoke();
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /Opening compensation is only allowed/);
  } finally {
    await unlink(path).catch(() => undefined);
    await rmdir(temporaryDirectory);
  }
});

test("remaining payroll administration, closed-year certificates and every standard export", async () => {
  const salaryContract = await frontendContract("salary");
  const loans = dataOf<{ id: string; state: string }[]>(await api.as("employee", "GET", "/me/loans"));
  for (const loan of loans.filter((row) => row.state === "requested"))
    dataOf(
      await api.as("finance", "POST", `/loans/${loan.id}/decisions`, {
        body: { decision: "reject", note: "Reset synthetic request for workflow test" },
      }),
    );
  const loanRequest = dataOf<{ reference: string }>(
    await api.as("employee", "POST", "/me/loans", {
      body: { type: "personal_loan", amount: "5000", tenureMonths: 6, reason: "Personal expense request" },
      idempotencyKey: newKey(),
    }),
  );
  const loan = (await api.prisma.payLoan.findMany({ where: { reference: loanRequest.reference } }))[0];
  assert.ok(loan);
  dataOf(
    await api.as("finance", "POST", `/loans/${loan.id}/decisions`, {
      body: { decision: "approve", note: "Approved after finance review" },
      ifMatch: loan.version,
      idempotencyKey: newKey(),
    }),
  );
  expectListContract(salaryContract.loanSchema, await api.as("employee", "GET", "/me/loans"));
  const templateInput = {
    templateId: "tpl_std",
    basicPctOfCtc: 40,
    hraPctOfBasic: 50,
    conveyance: "1600",
    lta: "2000",
    pf: "yes",
    gratuity: "yes",
    reason: "Annual structure review for test",
    idempotencyKey: newKey(),
  };
  const changeReference = dataOf<{ reference: string }>(
    await api.as("payroll", "POST", "/payroll/structures/tpl_std/changes", {
      body: templateInput,
      idempotencyKey: templateInput.idempotencyKey,
    }),
  ).reference;
  const change = await api.prisma.payStructureChange.findUniqueOrThrow({ where: { reference: changeReference } });
  expectProblem(
    await api.as("payroll", "POST", `/payroll/structures/changes/${change.id}/approve`, {
      body: { note: "Self attempt" },
    }),
    403,
  );
  dataOf(
    await api.as("finance", "POST", `/payroll/structures/changes/${change.id}/approve`, {
      body: { note: "Independently reviewed" },
    }),
  );
  const assignment = dataOf<{ reference: string }>(
    await api.as("payroll", "POST", "/payroll/structures/assignments/changes", {
      body: {
        groupKey: "grade:L3",
        templateId: "tpl_std",
        reason: "Review grade assignment change",
        idempotencyKey: newKey(),
      },
      idempotencyKey: newKey(),
    }),
  );
  const assignmentRow = await api.prisma.payStructureChange.findUniqueOrThrow({
    where: { reference: assignment.reference },
  });
  dataOf(
    await api.as("payroll", "POST", `/payroll/structures/changes/${assignmentRow.id}/withdraw`, {
      body: { note: "Withdraw for later review" },
    }),
  );
  const config = dataOf<{ settingsVersion: number }>(await api.as("payroll", "GET", "/payroll/statutory/setup"));
  dataOf(
    await api.as("payroll", "PATCH", "/payroll/statutory/pt/UP", {
      body: { state: "UP", rows: [], expectedVersion: config.settingsVersion },
      ifMatch: config.settingsVersion,
    }),
  );
  const statutory = await frontendContract("statutory");
  expectContract(
    statutory.structuresSchema,
    dataOf(
      await api.as("finance", "GET", "/payroll/structures", {
        query: { ctc: "1800000", template: "tpl_std", regime: "old", state: "UP" },
      }),
    ),
  );
  const previousYear = Number(todayInOrgZone().slice(0, 4)) - (Number(todayInOrgZone().slice(5, 7)) < 4 ? 1 : 0);
  const month = `${previousYear}-03`;
  const created = dataOf<{ id: string }>(
    await api.as("payroll", "POST", "/payroll/runs", { body: { month }, idempotencyKey: newKey() }),
  );
  for (const kind of ["bonus", "incentive"])
    dataOf(
      await api.as("payroll", "POST", `/payroll/runs/${created.id}/inputs`, {
        body: { employeeId: "emp_0007", kind, amount: "1000000", note: "Closed-year taxable bonus fixture" },
        idempotencyKey: newKey(),
      }),
    );
  dataOf(await api.as("payroll", "POST", `/payroll/runs/${created.id}/calculate`, { body: {} }));
  dataOf(await api.as("payroll", "POST", `/payroll/runs/${created.id}/submit-review`, { body: {} }));
  dataOf(await api.as("finance", "POST", `/payroll/runs/${created.id}/approve`, { body: {} }));
  dataOf(await api.as("finance", "POST", `/payroll/runs/${created.id}/publish`, { body: {} }));
  const hub = dataOf<{ obligations: { key: string; type: string; liability: { amount: string } }[] }>(
    await api.as("payroll", "GET", "/payroll/statutory", { query: { month } }),
  );
  for (const obligation of hub.obligations) {
    const key = newKey();
    const request = {
      obligationKey: obligation.key,
      amount: obligation.liability.amount,
      paidOn: todayInOrgZone(),
      challanNo: `TEST-${crypto.randomUUID().slice(0, 8)}`,
      bsrCode: obligation.type === "tds" ? "1234567" : "",
      idempotencyKey: key,
    };
    const result = await api.as("payroll", "POST", "/payroll/statutory/challans", {
      body: request,
      idempotencyKey: key,
    });
    dataOf(result);
    assert.deepEqual(
      (await api.as("payroll", "POST", "/payroll/statutory/challans", { body: request, idempotencyKey: key })).body,
      result.body,
    );
  }
  for (const file of ["ecr.txt", "esi.csv", "pt.csv", "lwf.csv", "24q.csv"]) {
    const artifact = dataOf<{ body: string }>(
      await api.as("payroll", "GET", `/payroll/statutory/files/${file}`, { query: { month } }),
    );
    assert.ok(artifact.body.length > 0);
  }
  const fy = String(previousYear - 1);
  await api.prisma.payProfile.update({ where: { employeeId: "emp_0007" }, data: { pan: null } });
  const blocked = dataOf<{ canGenerate: boolean; generateBlockedReason: string }>(
    await api.as("payroll", "GET", "/payroll/form-16", { query: { fy } }),
  );
  assert.equal(blocked.canGenerate, false);
  assert.match(blocked.generateBlockedReason, /PAN/);
  await api.prisma.payProfile.updateMany({ where: { pan: null }, data: { pan: encrypt("ABCDE1234F") } });
  const challan = await api.prisma.payChallan.findFirstOrThrow({ where: { period: month, type: "tds" } });
  await api.prisma.payChallan.update({ where: { id: challan.id }, data: { amountPaise: challan.amountPaise / 2n } });
  const short = dataOf<{ canGenerate: boolean; generateBlockedReason: string }>(
    await api.as("payroll", "GET", "/payroll/form-16", { query: { fy } }),
  );
  assert.equal(short.canGenerate, false);
  assert.match(short.generateBlockedReason, /TDS deposits/);
  await api.prisma.payChallan.update({ where: { id: challan.id }, data: { amountPaise: challan.amountPaise } });
  const status = dataOf<{ canGenerate: boolean }>(
    await api.as("payroll", "GET", "/payroll/form-16", { query: { fy } }),
  );
  assert.equal(status.canGenerate, true);
  dataOf(await api.as("payroll", "POST", `/payroll/form-16/${fy}/generate`, { body: {} }));
  expectContract(
    statutory.form16Schema,
    dataOf(await api.as("payroll", "GET", "/payroll/form-16/emp_0007", { query: { fy } })),
  );
  expectProblem(await api.as("finance", "POST", `/payroll/runs/${created.id}/mark-paid`, { body: {} }), 409);
  const profileRows = await api.prisma.payProfile.findMany({ where: { bankStatus: { not: "verified" } } });
  for (const profile of profileRows)
    dataOf(
      await api.as("finance", "POST", `/payroll/statutory/employees/${profile.employeeId}/bank-verification`, {
        body: { decision: "verified" },
      }),
    );
  dataOf(await api.as("finance", "POST", `/payroll/runs/${created.id}/mark-paid`, { body: {} }));
  const reports = await frontendContract("reports");
  for (const key of [
    "headcount",
    "joiners_leavers",
    "attrition",
    "probation_due",
    "celebrations",
    "attendance_summary",
    "late_coming",
    "leave_balances",
    "leave_availed",
    "salary_register",
    "ctc_by_department",
  ])
    expectContract(
      reports.exportFileSchema,
      dataOf(
        await api.as("payroll", "POST", `/reports/standard/${key}/export`, {
          body: { filters: { month: todayInOrgZone().slice(0, 7) }, format: "csv" },
        }),
      ),
    );
});

test("payroll allocates approved cross-month unpaid leave to its charged dates", async () => {
  const repo = createPayrollRepository(api.prisma);
  const type = (await api.prisma.timeDocument.findMany({ where: { kind: "leave_type" } }))
    .map((row) => leaveTypeConfigSchema.parse(row.payload))
    .find((row) => row.code === "LOP");
  assert.ok(type);
  const beforeJuly = await loadCalculationData(repo, "2026-07");
  const beforeAugust = await loadCalculationData(repo, "2026-08");
  const id = `lop_${crypto.randomUUID().slice(0, 16)}`;
  await api.prisma.timeWorkflow.create({
    data: {
      id,
      reference: id,
      kind: "leave",
      employeeId: "emp_0007",
      approverId: "emp_0006",
      state: "approved",
      startDate: "2026-07-31",
      endDate: "2026-08-03",
      payload: {
        leaveTypeId: type.id,
        startDate: "2026-07-31",
        endDate: "2026-08-03",
        portion: "full",
        reason: "Cross-month working-day allocation fixture",
        units: 2,
        chargeDates: ["2026-07-31", "2026-08-03"],
      },
    },
  });
  try {
    assert.equal(
      (await loadCalculationData(repo, "2026-07")).attendanceLop?.emp_0007,
      (beforeJuly.attendanceLop?.emp_0007 ?? 0) + 2,
    );
    assert.equal(
      (await loadCalculationData(repo, "2026-08")).attendanceLop?.emp_0007,
      (beforeAugust.attendanceLop?.emp_0007 ?? 0) + 2,
    );
  } finally {
    await api.prisma.timeWorkflow.delete({ where: { id } });
  }
});
