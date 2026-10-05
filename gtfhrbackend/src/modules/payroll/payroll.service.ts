import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { idempotent } from "../../core/database/idempotency.js";
import { newId } from "../../core/database/ids.js";
import { AppError } from "../../core/errors/AppError.js";
import { assertVersion } from "../../core/http/request-context.js";
import { can, requireCapability, type AuthenticatedActor } from "../../core/security/actor.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import { notify } from "../../core/notifications/notify.js";
import { personRef } from "../../core/people/person-ref.js";
import { todayInOrgZone, toIsoDate } from "../../utils/date.js";
import { inr, paiseFromAmount } from "../../utils/money.js";
import type {
  PayrollInputForm,
  PayrollRunDetail,
  PayrollRunSummary,
  PayrollOverview,
} from "../../contracts/payroll.js";
import { createPayrollRepository, type FullRun, type PayrollRepository } from "./payroll.repository.js";
import {
  calculateRun,
  currentCtc,
  digest,
  editableStates,
  finalStates,
  fiscalYear,
  inputLabels,
  loadPolicy,
  addMonths,
  monthEnd,
  monthLabel,
  type CalculationData,
} from "./payroll.rules.js";
import { resultSnapshotSchema } from "./payroll.schema.js";
import { encashPayload, leavePayload } from "../time/time.schema.js";
import { employeeCalendar, datesBetween } from "../time/time.service.js";
import { leaveTypeConfigSchema } from "../../contracts/hr-config.js";
import { config } from "../../config/index.js";

export function requirePayroll(actor: AuthenticatedActor) {
  if (!can(actor, "payroll.prepare") && !can(actor, "payroll.approve"))
    throw new AppError(403, "FORBIDDEN", "Payroll is limited to assigned payroll and finance roles.");
}
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const snapshotsOf = (run: FullRun) => run.results.map((result) => resultSnapshotSchema.parse(result.snapshot));
export function runSummary(run: FullRun, payGroup: string): PayrollRunSummary {
  const results = snapshotsOf(run);
  const totals = (key: "grossPaise" | "deductionsPaise" | "employerPaise" | "netPaise") =>
    inr(run.results.reduce((sum, row) => sum + row[key], 0n));
  return {
    id: run.id,
    payGroup,
    periodLabel: monthLabel(run.month),
    periodStart: `${run.month}-01`,
    periodEnd: monthEnd(run.month),
    paymentDate: monthEnd(run.month),
    revision: run.revision,
    state: run.state as PayrollRunSummary["state"],
    employeeCount: run.results.length,
    totals: {
      gross: totals("grossPaise"),
      employeeDeductions: totals("deductionsPaise"),
      employerContributions: totals("employerPaise"),
      net: totals("netPaise"),
    },
    blockers: results.filter((row) => row.overflow || paiseFromAmount(row.payslip.net.amount) < 0 || !row.entityId)
      .length,
    warnings: results.filter(
      (row) => row.bankStatus !== "verified" || !row.panPresent || (row.pfApplicable && !row.payslip.statutory.uan),
    ).length,
    updatedAt: run.updatedAt.toISOString(),
  };
}

export async function loadCalculationData(repo: PayrollRepository, month: string): Promise<CalculationData> {
  const [config, employees, profiles, templates, compensation, declarations, loans, runs] = await Promise.all([
    repo.configuration(),
    repo.employees(),
    repo.profiles(),
    repo.templates(),
    repo.compensations(),
    repo.declarations(fiscalYear(month).key),
    repo.loans(),
    repo.runs(),
  ]);
  const policy = loadPolicy(config?.settings);
  const prior = runs
    .filter((run) => run.month >= fiscalYear(month).firstMonth && run.month < month && finalStates.includes(run.state))
    .flatMap((run) =>
      snapshotsOf(run).map((snapshot) => ({
        employeeId: snapshot.person.id,
        gross: paiseFromAmount(snapshot.payslip.gross.amount),
        tds: snapshot.contributions.tds,
      })),
    );
  const [encashments, leaves, types, settlements] = await Promise.all([
    repo.encashments(),
    repo.unpaidLeaves(),
    repo.leaveTypes(),
    repo.paidSettlements(),
  ]);
  const unpaidTypes = types.map((row) => leaveTypeConfigSchema.parse(row.payload)).filter((row) => row.code === "LOP");
  const lopByEmployee: Record<string, number> = {};
  for (const leave of leaves) {
    const payload = leavePayload.parse(leave.payload);
    if (
      unpaidTypes.some((type) => type.id === payload.leaveTypeId) &&
      payload.startDate <= monthEnd(month) &&
      payload.endDate >= `${month}-01`
    ) {
      const stored = z.object({ chargeDates: z.array(z.iso.date()).optional() }).parse(leave.payload);
      const calendar = !stored.chargeDates
        ? await employeeCalendar(repo.time, leave.employeeId, payload.startDate, payload.endDate)
        : null;
      const sandwich = unpaidTypes.find((type) => type.id === payload.leaveTypeId)?.sandwich ?? false;
      const chargeDates =
        stored.chargeDates ??
        datesBetween(payload.startDate, payload.endDate).filter(
          (date) => sandwich || (!calendar?.get(date)?.off && !calendar?.get(date)?.holiday),
        );
      const overlap = chargeDates.filter((date) => date.slice(0, 7) === month).length;
      lopByEmployee[leave.employeeId] =
        (lopByEmployee[leave.employeeId] ?? 0) +
        (chargeDates.length ? Math.round((payload.units * 2 * overlap) / chargeDates.length) : 0);
    }
  }
  const encashmentByEmployee: Record<string, number> = {};
  for (const row of encashments) {
    const payload = encashPayload.parse(row.payload);
    if (payload.payrollMonth === month)
      encashmentByEmployee[row.employeeId] =
        (encashmentByEmployee[row.employeeId] ?? 0) + paiseFromAmount(payload.amount);
  }
  const settled = new Set(
    settlements
      .filter((row) => {
        const parsed = z.object({ lastWorkingDay: z.iso.date() }).safeParse(row.data);
        return parsed.success && parsed.data.lastWorkingDay.slice(0, 7) <= month;
      })
      .map((row) => row.ownerId),
  );
  return {
    policy,
    employees: employees.filter((row) => !settled.has(row.id)),
    profiles,
    templates,
    compensation,
    declarations,
    loans,
    prior,
    attendanceLop: lopByEmployee,
    encashments: encashmentByEmployee,
  };
}

/** Used by seed and the calculate command; the caller owns the transaction. */
export async function persistCalculation(repo: PayrollRepository, run: FullRun) {
  const data = await loadCalculationData(repo, run.month);
  if (config.nodeEnv === "production" && !data.policy.approvedForProduction)
    throw new AppError(
      409,
      "PAYROLL_POLICY_NOT_APPROVED",
      "Finance must approve the configured policy before production payroll calculations.",
    );
  const missingCompensation = data.employees.filter(
    (employee) =>
      employee.status !== "onboarding" &&
      toIsoDate(employee.joinedOn) <= monthEnd(run.month) &&
      (!employee.exitedOn || toIsoDate(employee.exitedOn) >= `${run.month}-01`) &&
      currentCtc(data.compensation, employee.id, monthEnd(run.month)) === 0n,
  );
  if (missingCompensation.length)
    throw new AppError(
      409,
      "COMPENSATION_MISSING",
      `Configure effective compensation for ${missingCompensation.map((employee) => employee.code).join(", ")} before calculation.`,
    );
  const results = calculateRun(run, data);
  if (!results.length)
    throw new AppError(409, "NO_COMPENSATION", "No effective compensation is configured for this period.");
  const snapshotInput = {
    policy: data.policy,
    templates: data.templates.map((row) => ({ id: row.id, version: row.version, terms: row.terms })),
    compensation: data.compensation.map((row) => ({
      employeeId: row.employeeId,
      effectiveFrom: row.effectiveFrom,
      annualPaise: row.annualPaise.toString(),
    })),
    inputs: run.inputs.map((row) => ({ ...row, amountPaise: row.amountPaise.toString() })),
    employees: data.employees.map((row) => ({
      id: row.id,
      joinedOn: row.joinedOn,
      exitedOn: row.exitedOn,
      type: row.employmentType,
      status: row.status,
    })),
    profiles: data.profiles.map((row) => ({
      employeeId: row.employeeId,
      entityId: row.entityId,
      state: row.state,
      pfOptOut: row.pfOptOut,
      vpfPercent: row.vpfPercent,
      panPresent: Boolean(row.pan),
    })),
    declarations: data.declarations.map((row) => ({ ...row, monthlyRentPaise: row.monthlyRentPaise.toString() })),
    loans: data.loans.map((row) => ({
      ...row,
      principalPaise: row.principalPaise.toString(),
      recoveredPaise: row.recoveredPaise.toString(),
    })),
    attendanceLop: data.attendanceLop,
    encashments: data.encashments,
    prior: data.prior,
  };
  await repo.replaceResults(
    run.id,
    results.map((snapshot) => ({
      id: snapshot.payslip.id,
      runId: run.id,
      employeeId: snapshot.person.id,
      grossPaise: BigInt(paiseFromAmount(snapshot.payslip.gross.amount)),
      deductionsPaise: BigInt(paiseFromAmount(snapshot.payslip.totalDeductions.amount)),
      employerPaise: BigInt(
        snapshot.payslip.employerContributions.reduce((sum, line) => sum + paiseFromAmount(line.amount.amount), 0),
      ),
      netPaise: BigInt(paiseFromAmount(snapshot.payslip.net.amount)),
      snapshot: json(snapshot),
    })),
  );
  await repo.updateRun(run.id, {
    inputDigest: digest(snapshotInput),
    calculationInputs: json(snapshotInput),
    state: "calculated",
  });
  return results;
}

export function createPayrollService(prisma: PrismaClient) {
  const repository = createPayrollRepository(prisma);
  const loadRun = async (repo: PayrollRepository, id: string) => {
    const run = await repo.run(id);
    if (!run) throw new AppError(404, "NOT_FOUND", "We couldn't find that payroll run.");
    return run;
  };
  const audit = (
    tx: Parameters<typeof recordAuditEvent>[0],
    actor: AuthenticatedActor,
    id: string,
    action: string,
    requestId: string,
    details: Prisma.InputJsonValue = {},
  ) =>
    recordAuditEvent(tx, {
      actorEmployeeId: actor.employeeId,
      action,
      entity: "payroll_run",
      entityId: id,
      requestId,
      details,
    });
  return {
    async overview(actor: AuthenticatedActor): Promise<PayrollOverview> {
      requirePayroll(actor);
      const runs = await repository.runs();
      const payGroup = "India · Monthly · INR";
      const current = runs.find((run) => run.month === todayInOrgZone().slice(0, 7));
      const results = current ? snapshotsOf(current) : [];
      return {
        payGroup,
        current: current ? runSummary(current, payGroup) : null,
        history: runs.filter((run) => run.id !== current?.id).map((run) => runSummary(run, payGroup)),
        readiness: [
          {
            label: "Salary structures valid",
            done: results.filter((row) => !row.overflow).length,
            total: results.length,
            tone: results.some((row) => row.overflow) ? "danger" : "success",
          },
          {
            label: "Bank accounts verified",
            done: results.filter((row) => row.bankStatus === "verified").length,
            total: results.length,
            tone: results.some((row) => row.bankStatus !== "verified") ? "warning" : "success",
          },
        ],
      };
    },
    async detail(actor: AuthenticatedActor, id: string): Promise<PayrollRunDetail> {
      requirePayroll(actor);
      const run = await loadRun(repository, id);
      const [employees, events, previousRun, profiles] = await Promise.all([
        repository.employees(),
        repository.audit("payroll_run", id),
        repository.runByMonth(addMonths(run.month, -1)),
        repository.profiles(),
      ]);
      const people = new Map(employees.map((employee) => [employee.id, employee]));
      const preparer = people.get(run.preparedBy);
      if (!preparer) throw new AppError(409, "PREPARER_MISSING", "The payroll preparer record is unavailable.");
      const snapshots = snapshotsOf(run).map((row) => {
        const status = profiles.find((profile) => profile.employeeId === row.person.id)?.bankStatus;
        return {
          ...row,
          bankStatus:
            status === "verified"
              ? ("verified" as const)
              : status === "failed"
                ? ("failed" as const)
                : ("pending" as const),
        };
      });
      const summary = runSummary(run, "India · Monthly · INR");
      const editable = editableStates.includes(run.state);
      const activeHoldIds = new Set(run.holds.filter((hold) => !hold.releasedAt).map((hold) => hold.employeeId));
      const actorPrepared =
        run.preparedBy === actor.employeeId ||
        events.some(
          (event) =>
            event.actorEmployeeId === actor.employeeId &&
            ["Payroll calculated", "Payroll calculate", "Payroll input added", "Payroll input removed"].includes(
              event.action,
            ),
        );
      const canApprove =
        can(actor, "payroll.approve") && !actorPrepared && run.state === "in_review" && summary.blockers === 0;
      const components = new Map<
        string,
        { code: string; name: string; kind: "earning" | "deduction" | "employer"; paise: number }
      >();
      for (const snapshot of snapshots)
        for (const [kind, lines] of [
          ["earning", snapshot.payslip.earnings],
          ["deduction", snapshot.payslip.deductions],
          ["employer", snapshot.payslip.employerContributions],
        ] as const)
          for (const line of lines) {
            const key = `${kind}:${line.code}`;
            const old = components.get(key);
            components.set(key, {
              code: line.code,
              name: line.name,
              kind,
              paise: (old?.paise ?? 0) + paiseFromAmount(line.amount.amount),
            });
          }
      const sum = (key: keyof (typeof snapshots)[number]["contributions"]) =>
        inr(snapshots.reduce((total, row) => total + row.contributions[key], 0));
      const payable = snapshots.filter(
        (row) =>
          !activeHoldIds.has(row.person.id) &&
          row.bankStatus === "verified" &&
          paiseFromAmount(row.payslip.net.amount) > 0,
      );
      const preparerIsViewer = run.preparedBy === actor.employeeId;
      const approver = run.approvedBy ? people.get(run.approvedBy) : null;
      return {
        ...summary,
        inputDigest: run.inputDigest,
        preparedBy: personRef(preparer),
        approvedBy: approver ? personRef(approver) : null,
        publishedAt: run.publishedAt?.toISOString() ?? null,
        issues: snapshots.flatMap((row) => [
          ...(row.overflow
            ? [
                {
                  id: `${row.person.id}:structure`,
                  severity: "blocker" as const,
                  employee: row.person,
                  message: "Salary components exceed CTC.",
                  resolution: "Correct the assigned salary structure.",
                },
              ]
            : []),
          ...(paiseFromAmount(row.payslip.net.amount) < 0
            ? [
                {
                  id: `${row.person.id}:net`,
                  severity: "blocker" as const,
                  employee: row.person,
                  message: "Net salary is negative.",
                  resolution: "Review deductions before submission.",
                },
              ]
            : []),
          ...(row.bankStatus !== "verified"
            ? [
                {
                  id: `${row.person.id}:bank`,
                  severity: "warning" as const,
                  employee: row.person,
                  message: "Bank account is not verified.",
                  resolution: "Verify bank details before exporting payments.",
                },
              ]
            : []),
        ]),
        variances: snapshots.flatMap((row) => {
          const previous = previousRun
            ? snapshotsOf(previousRun).find((item) => item.person.id === row.person.id)
            : null;
          const before = previous ? paiseFromAmount(previous.payslip.gross.amount) : 0;
          const current = paiseFromAmount(row.payslip.gross.amount);
          return before === current
            ? []
            : [
                {
                  employee: row.person,
                  component: "Gross salary",
                  previous: inr(before),
                  current: inr(current),
                  change: inr(current - before),
                  changePercent: before ? (((current - before) / before) * 100).toFixed(1) : "100.0",
                  explanation: previous ? null : "First payroll period",
                },
              ];
        }),
        components: [...components.values()].map((row) => ({
          code: row.code,
          name: row.name,
          kind: row.kind,
          amount: inr(row.paise),
        })),
        audit: events.map((event) => ({
          at: event.at.toISOString(),
          actor: people.get(event.actorEmployeeId ?? "")?.name ?? "System",
          event: event.action,
        })),
        inputs: run.inputs.flatMap((input) => {
          const employee = people.get(input.employeeId);
          return employee
            ? [
                {
                  id: input.id,
                  employee: personRef(employee),
                  employeeCode: employee.code,
                  kind: input.kind as PayrollInputForm["kind"],
                  label: inputLabels[input.kind] ?? input.kind,
                  amount: input.kind === "lop_override" ? null : inr(input.amountPaise),
                  lopDays: input.kind === "lop_override" ? (input.lopHalves / 2).toFixed(1) : null,
                  arrearsFrom: input.arrearsFrom,
                  arrearsMonths: input.arrearsMonths || null,
                  note: input.note,
                  addedBy: people.get(input.addedBy)?.name ?? input.addedBy,
                  addedAt: input.addedAt.toISOString(),
                },
              ]
            : [];
        }),
        holds: run.holds.flatMap((hold) => {
          const employee = people.get(hold.employeeId);
          return employee
            ? [
                {
                  id: hold.id,
                  employee: personRef(employee),
                  reason: hold.reason,
                  heldBy: people.get(hold.heldBy)?.name ?? hold.heldBy,
                  heldAt: hold.heldAt.toISOString(),
                  releasedBy: hold.releasedBy ? (people.get(hold.releasedBy)?.name ?? hold.releasedBy) : null,
                  releasedAt: hold.releasedAt?.toISOString() ?? null,
                  releaseNote: hold.releaseNote,
                  net: snapshots.find((row) => row.person.id === hold.employeeId)?.payslip.net ?? inr(0),
                },
              ]
            : [];
        }),
        register: snapshots.map((row) => ({
          employee: row.person,
          code: row.payslip.employee.code,
          entity: row.payslip.statutory.entity,
          state: row.workState,
          payableDays: row.payslip.payableDays,
          lopDays: row.payslip.lopDays,
          gross: row.payslip.gross,
          pf: inr(row.contributions.pfEmployee),
          esi: inr(row.contributions.esiEmployee),
          pt: inr(row.contributions.pt),
          tds: inr(row.contributions.tds),
          deductions: row.payslip.totalDeductions,
          net: row.payslip.net,
          held: activeHoldIds.has(row.person.id),
          bankStatus: row.bankStatus,
        })),
        bankAdvice: {
          available: finalStates.includes(run.state),
          reason: finalStates.includes(run.state) ? null : "Finance must approve the run before payment export.",
          canExport: finalStates.includes(run.state) && can(actor, "payment.export"),
          batchReference: `BANK-${run.month}-R${run.revision}`,
          payableCount: payable.length,
          payableAmount: inr(payable.reduce((total, row) => total + paiseFromAmount(row.payslip.net.amount), 0)),
          excluded: snapshots
            .filter((row) => !payable.includes(row))
            .map((row) => ({
              employee: row.person,
              reason: activeHoldIds.has(row.person.id)
                ? "Salary on hold"
                : row.bankStatus !== "verified"
                  ? "Bank account not verified"
                  : "No payable salary",
              net: row.payslip.net,
            })),
          exports: events
            .filter((event) => event.action === "Bank advice exported")
            .map((event) => {
              const details = z
                .object({ count: z.number().int(), amountPaise: z.string().default("0") })
                .parse(event.details);
              return {
                at: event.at.toISOString(),
                by: people.get(event.actorEmployeeId ?? "")?.name ?? "System",
                count: details.count,
                amount: inr(BigInt(details.amountPaise)),
              };
            }),
        },
        inputEmployees: snapshots.map((row) => ({
          id: row.person.id,
          label: `${row.payslip.employee.code} · ${row.person.name}`,
        })),
        statutory: {
          pfEmployee: sum("pfEmployee"),
          pfEmployer: sum("pfEmployer"),
          esi: inr(
            snapshots.reduce((total, row) => total + row.contributions.esiEmployee + row.contributions.esiEmployer, 0),
          ),
          pt: sum("pt"),
          lwf: sum("lwfEmployee"),
          tds: sum("tds"),
        },
        commands: {
          canEditInputs: editable && can(actor, "payroll.prepare"),
          canHold: run.state !== "paid" && can(actor, "payroll.prepare"),
          inputsLockedReason: editable ? null : "Inputs are frozen once submitted for review.",
          canSubmit:
            ["calculated", "rejected"].includes(run.state) && can(actor, "payroll.submit") && summary.blockers === 0,
          canApprove,
          canReject: canApprove,
          canPublish: can(actor, "payroll.publish") && run.state === "approved",
          blockedReason:
            preparerIsViewer && run.state === "in_review"
              ? "A different payroll approver must review this run."
              : summary.blockers
                ? "Resolve blockers before continuing."
                : null,
        },
      };
    },
    create(actor: AuthenticatedActor, month: string, key: string | undefined, requestId: string) {
      requireCapability(actor, "payroll.prepare");
      return idempotent(prisma, { actorId: actor.employeeId, key, command: `payroll.create:${month}` }, async (tx) => {
        const repo = createPayrollRepository(tx);
        await repo.lock(month);
        if (await repo.runByMonth(month))
          throw new AppError(409, "RUN_EXISTS", "A payroll run already exists for this month.");
        const id = newId("run");
        await repo.createRun({ id, month, preparedBy: actor.employeeId });
        await persistCalculation(repo, await loadRun(repo, id));
        await audit(tx, actor, id, "Payroll calculated", requestId);
        return { id };
      });
    },
    command(
      actor: AuthenticatedActor,
      id: string,
      command: "submit" | "approve" | "reject" | "publish" | "calculate" | "mark_paid",
      note: string,
      expected: number | undefined,
      key: string | undefined,
      requestId: string,
    ) {
      const capabilities = {
        submit: "payroll.submit",
        approve: "payroll.approve",
        reject: "payroll.approve",
        publish: "payroll.publish",
        calculate: "payroll.prepare",
        mark_paid: "payment.export",
      } as const;
      requireCapability(actor, capabilities[command]);
      return idempotent(prisma, { actorId: actor.employeeId, key, command: `payroll.${command}:${id}` }, async (tx) => {
        const repo = createPayrollRepository(tx);
        await repo.lock(id);
        const run = await loadRun(repo, id);
        assertVersion(run.revision, expected);
        const transitions = {
          submit: { from: ["calculated", "rejected"], to: "in_review" },
          approve: { from: ["in_review"], to: "approved" },
          reject: { from: ["in_review"], to: "rejected" },
          publish: { from: ["approved"], to: "published" },
          calculate: { from: editableStates, to: "calculated" },
          mark_paid: { from: ["published"], to: "paid" },
        };
        if (!transitions[command].from.includes(run.state))
          throw new AppError(409, "INVALID_STATE", "This action isn't available for the run's current state.");
        if (["approve", "reject"].includes(command)) {
          const makers = await repo.audit("payroll_run", id);
          if (
            run.preparedBy === actor.employeeId ||
            makers.some(
              (event) =>
                event.actorEmployeeId === actor.employeeId &&
                ["Payroll calculated", "Payroll calculate", "Payroll input added", "Payroll input removed"].includes(
                  event.action,
                ),
            )
          )
            throw new AppError(
              403,
              "SELF_APPROVAL",
              "An approver who did not prepare or edit this run must review it.",
            );
        }
        if (command === "reject" && note.trim().length < 3)
          throw new AppError(400, "VALIDATION_ERROR", "Add a rejection reason.", {
            fieldErrors: { note: "At least 3 characters." },
          });
        if (["submit", "approve"].includes(command) && runSummary(run, "").blockers)
          throw new AppError(409, "PAYROLL_BLOCKERS", "Resolve the payroll blockers before continuing.");
        if (command === "mark_paid") {
          await repo.lockProfiles(run.results.map((row) => row.employeeId));
          const profiles = await repo.profiles();
          if (run.holds.some((hold) => !hold.releasedAt))
            throw new AppError(
              409,
              "PAYMENTS_ON_HOLD",
              "Release all payment holds before recording the run as fully paid.",
            );
          if (
            snapshotsOf(run).some(
              (row) =>
                paiseFromAmount(row.payslip.net.amount) > 0 &&
                profiles.find((profile) => profile.employeeId === row.person.id)?.bankStatus !== "verified",
            )
          )
            throw new AppError(
              409,
              "BANK_VERIFICATION_PENDING",
              "Verify every payable employee's bank account before recording the run as fully paid.",
            );
        }
        if (command === "calculate") await persistCalculation(repo, run);
        const at = new Date();
        await repo.updateRun(id, {
          state: transitions[command].to,
          revision: { increment: 1 },
          ...(command === "approve" ? { approvedBy: actor.employeeId } : {}),
          ...(command === "publish" ? { publishedAt: at } : {}),
        });
        if (command === "publish")
          for (const result of run.results)
            await notify(tx, {
              employeeId: result.employeeId,
              kind: "payroll",
              title: "Your payslip is available",
              body: `${monthLabel(run.month)} payslip has been published.`,
              href: `/me/payslips/${result.id}`,
            });
        if (command === "mark_paid")
          for (const snapshot of snapshotsOf(run).filter(
            (row) => !run.holds.some((hold) => hold.employeeId === row.person.id && !hold.releasedAt),
          ))
            for (const recovery of snapshot.loanRecoveries) {
              await repo.lock(`employee:${snapshot.person.id}`);
              const loan = await repo.loan(recovery.id);
              if (loan) {
                const recovered = loan.recoveredPaise + BigInt(recovery.paise);
                if (recovered > loan.principalPaise)
                  throw new AppError(
                    409,
                    "LOAN_RECOVERY_CHANGED",
                    "A loan was settled after calculation. Reconcile the loan recovery before marking payment.",
                  );
                await repo.updateLoan(loan.id, {
                  recoveredPaise: recovered,
                  paidInstallments: { increment: 1 },
                  state: recovered >= loan.principalPaise ? "closed" : "active",
                });
              }
            }
        await audit(tx, actor, id, `Payroll ${command}`, requestId, { note });
        return { state: transitions[command].to, at: at.toISOString() };
      });
    },
    addInput(
      actor: AuthenticatedActor,
      id: string,
      input: PayrollInputForm,
      key: string | undefined,
      requestId: string,
    ) {
      requireCapability(actor, "payroll.prepare");
      return idempotent(prisma, { actorId: actor.employeeId, key, command: `payroll.input:${id}` }, async (tx) => {
        const repo = createPayrollRepository(tx);
        await repo.lock(id);
        const run = await loadRun(repo, id);
        if (!editableStates.includes(run.state))
          throw new AppError(409, "RUN_LOCKED", "Inputs are frozen once submitted for review.");
        if (!run.results.some((row) => row.employeeId === input.employeeId))
          throw new AppError(404, "NOT_FOUND", "Employee is not in this payroll run.");
        if (input.kind === "lop_override" && Number(input.lopDays) > Number(monthEnd(run.month).slice(8)))
          throw new AppError(400, "INVALID_LOP", "LOP exceeds the number of days in this month.");
        const inputId = newId("pi");
        await repo.addInput({
          id: inputId,
          runId: id,
          employeeId: input.employeeId,
          kind: input.kind,
          amountPaise: input.kind === "lop_override" ? 0n : BigInt(paiseFromAmount(input.amount)),
          lopHalves: input.kind === "lop_override" ? Number(input.lopDays) * 2 : 0,
          arrearsFrom: input.arrearsFrom || null,
          arrearsMonths: Number(input.arrearsMonths || 0),
          note: input.note,
          addedBy: actor.employeeId,
        });
        await repo.updateRun(id, { revision: { increment: 1 } });
        const results = await persistCalculation(repo, await loadRun(repo, id));
        await audit(tx, actor, id, "Payroll input added", requestId, { inputId });
        return { id: inputId, net: results.find((row) => row.person.id === input.employeeId)?.payslip.net ?? inr(0) };
      });
    },
    removeInput(actor: AuthenticatedActor, id: string, inputId: string, requestId: string) {
      requireCapability(actor, "payroll.prepare");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: "payroll.input.remove" },
        async (tx) => {
          const repo = createPayrollRepository(tx);
          await repo.lock(id);
          const run = await loadRun(repo, id);
          if (!editableStates.includes(run.state))
            throw new AppError(409, "RUN_LOCKED", "Inputs are frozen once submitted for review.");
          if (!run.inputs.some((input) => input.id === inputId))
            throw new AppError(404, "NOT_FOUND", "Payroll input not found.");
          await repo.removeInput(inputId);
          await repo.updateRun(id, { revision: { increment: 1 } });
          await persistCalculation(repo, await loadRun(repo, id));
          await audit(tx, actor, id, "Payroll input removed", requestId, { inputId });
          return { removed: inputId };
        },
      );
    },
    hold(
      actor: AuthenticatedActor,
      id: string,
      employeeId: string,
      reason: string,
      key: string | undefined,
      requestId: string,
    ) {
      requireCapability(actor, "payroll.prepare");
      return idempotent(prisma, { actorId: actor.employeeId, key, command: `payroll.hold:${id}` }, async (tx) => {
        const repo = createPayrollRepository(tx);
        await repo.lock(id);
        const run = await loadRun(repo, id);
        if (run.state === "paid") throw new AppError(409, "RUN_PAID", "A paid run cannot be changed.");
        if (!run.results.some((row) => row.employeeId === employeeId))
          throw new AppError(404, "NOT_FOUND", "Employee is not in this payroll run.");
        if (run.holds.some((hold) => hold.employeeId === employeeId && !hold.releasedAt))
          throw new AppError(409, "ALREADY_HELD", "Salary is already held.");
        const holdId = newId("ph");
        await repo.addHold({ id: holdId, runId: id, employeeId, reason, heldBy: actor.employeeId });
        await audit(tx, actor, id, "Salary held", requestId, { holdId });
        return { id: holdId };
      });
    },
    release(actor: AuthenticatedActor, id: string, holdId: string, note: string, requestId: string) {
      requireCapability(actor, "payroll.prepare");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: "payroll.hold.release" },
        async (tx) => {
          const repo = createPayrollRepository(tx);
          await repo.lock(id);
          const run = await loadRun(repo, id);
          const hold = run.holds.find((row) => row.id === holdId);
          if (!hold) throw new AppError(404, "NOT_FOUND", "Salary hold not found.");
          if (hold.releasedAt || run.state === "paid")
            throw new AppError(409, "INVALID_STATE", "This salary hold cannot be released.");
          await repo.releaseHold(holdId, actor.employeeId, note);
          await audit(tx, actor, id, "Salary hold released", requestId, { holdId });
          return { id: holdId };
        },
      );
    },
    async payslips(actor: AuthenticatedActor) {
      requireCapability(actor, "payslip.read.self");
      const rows = await repository.ownResults(actor.employeeId);
      return rows.map((row) => ({
        ...resultSnapshotSchema.parse(row.snapshot).payslip,
        publishedAt: row.run.publishedAt?.toISOString() ?? resultSnapshotSchema.parse(row.snapshot).payslip.publishedAt,
        paymentStatus: row.run.state === "paid" ? "paid" : "published",
      }));
    },
    async payslip(actor: AuthenticatedActor, id: string) {
      requireCapability(actor, "payslip.read.self");
      const row = await repository.result(id);
      if (!row || row.employeeId !== actor.employeeId || !["published", "paid"].includes(row.run.state))
        throw new AppError(404, "NOT_FOUND", "Payslip not found.");
      return {
        ...resultSnapshotSchema.parse(row.snapshot).payslip,
        publishedAt: row.run.publishedAt?.toISOString() ?? resultSnapshotSchema.parse(row.snapshot).payslip.publishedAt,
        paymentStatus: row.run.state === "paid" ? "paid" : "published",
      };
    },
  };
}
export type PayrollService = ReturnType<typeof createPayrollService>;
