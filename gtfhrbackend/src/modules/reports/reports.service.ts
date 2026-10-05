import { z } from "zod";
import type { PrismaClient, ReportSaved } from "@prisma/client";
import { idempotent } from "../../core/database/idempotency.js";
import { newId } from "../../core/database/ids.js";
import { AppError } from "../../core/errors/AppError.js";
import { assertVersion } from "../../core/http/request-context.js";
import { can, requireCapability, type AuthenticatedActor } from "../../core/security/actor.js";
import { capabilitiesFor } from "../../core/security/capabilities.js";
import { personRef } from "../../core/people/person-ref.js";
import { notify } from "../../core/notifications/notify.js";
import { queueEmail } from "../../core/mail/outbox.js";
import { todayInOrgZone, toIsoDate, daysBetween } from "../../utils/date.js";
import { inr } from "../../utils/money.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import { createPayrollRepository, type PayDb } from "../payroll/payroll.repository.js";
import { currentCtc, maskAccount, maskPan, monthEnd } from "../payroll/payroll.rules.js";
import { json, snapshotsOf } from "../payroll/payroll.service.js";
import { createReportsRepository, type ReportsRepository } from "./reports.repository.js";
import { scheduleStoredSchema } from "./reports.schema.js";
import {
  reportSpecSchema,
  savedReportSchema,
  type ReportSpec,
  type ReportFilters,
  type SaveReportInput,
  type ScheduleInput,
  type StandardReportKey,
  type SavedReport,
  type ReportAnalytics,
  type ExportFormat,
  type ReportTable,
} from "../../contracts/reports.js";
import {
  datasets,
  standardReports,
  roleLabels,
  hasSalaryAccess,
  savedVisible,
  hiddenSalaryColumns,
  shareError,
  datasetOf,
  applySpec,
  describeFilters,
  exportFile,
  nextRun,
  monthlyMovement,
  monthlyAttrition,
  type Row,
  type Member,
  table,
  col,
} from "./reports.rules.js";
import { leavePayload } from "../time/time.schema.js";
import { employeeAttendanceMonth } from "../attendance/attendance.service.js";
import { probationDefaultsSchema } from "../../contracts/hr-config.js";
import { addMonthsToDate } from "./reports.rules.js";

export async function datasetRows(db: PayDb, actor: AuthenticatedActor, spec: ReportSpec): Promise<Row[]> {
  const pay = createPayrollRepository(db);
  const reports = createReportsRepository(db);
  const salary = hasSalaryAccess(actor.capabilities);
  const all = await pay.employees();
  const month = spec.filters.month || todayInOrgZone().slice(0, 7);
  const f = spec.filters;
  const employees = all.filter(
    (employee) =>
      (!f.department || employee.department.name === f.department) &&
      (!f.location || employee.location.name === f.location) &&
      (f.status ? employee.status === f.status : employee.status !== "exited"),
  );
  const ids = new Set(employees.map((row) => row.id));
  const basic = (id: string) => {
    const employee = employees.find((row) => row.id === id);
    return {
      code: employee?.code ?? "",
      name: employee?.name ?? "",
      department: employee?.department.name ?? "",
      location: employee?.location.name ?? "",
    };
  };
  if (spec.dataset === "employees") {
    const [profiles, compensation] = salary ? await Promise.all([pay.profiles(), pay.compensations()]) : [[], []];
    return employees.map((employee) => {
      const profile = profiles.find((row) => row.employeeId === employee.id);
      const annual = currentCtc(compensation, employee.id, todayInOrgZone());
      return {
        ...basic(employee.id),
        designation: employee.designation,
        manager: all.find((row) => row.id === employee.managerId)?.name ?? "",
        status: employee.status,
        type: employee.employmentType,
        joinedOn: toIsoDate(employee.joinedOn),
        tenureYears: Math.round((daysBetween(toIsoDate(employee.joinedOn), todayInOrgZone()) / 365.25) * 10) / 10,
        gender: null,
        pan: maskPan(profile?.pan ?? null),
        bank: profile ? maskAccount(profile.accountNumber) : null,
        annualCtc: salary ? inr(annual).amount : null,
        monthlyCtc: salary ? inr(annual / 12n).amount : null,
      };
    });
  }
  if (spec.dataset === "payroll_register") {
    if (!salary) throw new AppError(403, "SALARY_RESTRICTED", "Payroll reporting requires salary access.");
    const run = await pay.runByMonth(month);
    if (!run) return [];
    return snapshotsOf(run)
      .filter((row) => ids.has(row.person.id))
      .map((row) => ({
        ...basic(row.person.id),
        payableDays: Number(row.payslip.payableDays),
        lopDays: Number(row.payslip.lopDays),
        basic: row.payslip.earnings.find((line) => line.code === "BASIC")?.amount.amount ?? "0.00",
        hra: row.payslip.earnings.find((line) => line.code === "HRA")?.amount.amount ?? "0.00",
        special: row.payslip.earnings.find((line) => line.code === "SPECIAL")?.amount.amount ?? "0.00",
        gross: row.payslip.gross.amount,
        pf: inr(row.contributions.pfEmployee).amount,
        pt: inr(row.contributions.pt).amount,
        tds: inr(row.contributions.tds).amount,
        deductions: row.payslip.totalDeductions.amount,
        net: row.payslip.net.amount,
        employerPf: inr(row.contributions.pfEmployer).amount,
      }));
  }
  const leaves = (await reports.workflows("leave")).map((row) => ({ ...row, leave: leavePayload.parse(row.payload) }));
  if (spec.dataset === "leave_requests")
    return leaves
      .filter(
        (row) =>
          ids.has(row.employeeId) &&
          (!f.leaveState || row.state === f.leaveState) &&
          (!f.from || row.leave.endDate >= f.from) &&
          (!f.to || row.leave.startDate <= f.to),
      )
      .map((row) => ({
        reference: row.reference,
        ...basic(row.employeeId),
        leaveType: row.leave.leaveTypeId,
        from: row.leave.startDate,
        to: row.leave.endDate,
        days: row.leave.units,
        state: row.state,
        submittedOn: toIsoDate(row.createdAt),
        approver: all.find((person) => person.id === row.approverId)?.name ?? "",
      }));
  if (spec.dataset === "leave_balances") {
    const ledger = (await reports.ledger()).filter(
      (row) =>
        ids.has(row.employeeId) &&
        row.date <= todayInOrgZone() &&
        (!row.expiresOn || row.expiresOn >= todayInOrgZone()),
    );
    const keys = [...new Set(ledger.map((row) => `${row.employeeId}|${row.leaveTypeId}`))];
    return keys.map((key) => {
      const [employeeId = "", type = ""] = key.split("|");
      const rows = ledger.filter((row) => row.employeeId === employeeId && row.leaveTypeId === type);
      const entitled = rows.reduce((sum, row) => sum + Math.max(0, Number(row.units)), 0);
      const used = -rows.reduce((sum, row) => sum + Math.min(0, Number(row.units)), 0);
      const pending = leaves
        .filter((row) => row.employeeId === employeeId && row.leave.leaveTypeId === type && row.state === "pending")
        .reduce((sum, row) => sum + row.leave.units, 0);
      return { ...basic(employeeId), leaveType: type, entitled, used, pending, available: entitled - used - pending };
    });
  }
  return Promise.all(
    employees.map(async (employee) => {
      const classified = await employeeAttendanceMonth(
        db,
        { actor, requestId: "report-attendance" },
        employee.id,
        month,
      );
      const summary = classified.summary;
      return {
        ...basic(employee.id),
        present: summary.present,
        late: summary.late,
        halfDay: classified.days.filter((day) => day.state === "half_day").length,
        leave: summary.leave,
        absent: summary.absent,
        needsReview: summary.needsReview,
        holidays: summary.holidays,
        weeklyOff: summary.weeklyOffs,
        workedHours: Math.round(classified.days.reduce((sum, day) => sum + day.workedMinutes, 0) / 6) / 10,
        overtimeHours: Math.round(summary.overtimeMinutes / 6) / 10,
      };
    }),
  );
}

export function createReportsService(prisma: PrismaClient) {
  const repository = createReportsRepository(prisma);
  const people = createPayrollRepository(prisma);
  const visible = (actor: AuthenticatedActor, row: ReportSaved) =>
    savedVisible(
      {
        ownerId: row.ownerId,
        visibility: row.visibility as "private" | "shared",
        sharedRoles: row.sharedRoles,
        dataset: reportSpecSchema.parse(row.spec).dataset,
      },
      { id: actor.employeeId, roles: actor.roles, salary: hasSalaryAccess(actor.capabilities) },
    );
  const loadSaved = async (
    actor: AuthenticatedActor,
    id: string,
    repo: ReportsRepository = repository,
    edit = false,
  ) => {
    const row = await repo.savedById(id);
    if (!row || !visible(actor, row)) throw new AppError(404, "NOT_FOUND", "Saved report not found.");
    if (edit && row.ownerId !== actor.employeeId)
      throw new AppError(403, "NOT_OWNER", "Only the owner can edit this report.");
    return row;
  };
  const dto = async (actor: AuthenticatedActor, row: ReportSaved): Promise<SavedReport> => {
    const employees = await people.employees();
    const owner = employees.find((person) => person.id === row.ownerId);
    if (!owner) throw new AppError(409, "OWNER_MISSING", "Report owner is unavailable.");
    const spec = reportSpecSchema.parse(row.spec);
    const schedule = row.schedule ? scheduleStoredSchema.parse(row.schedule) : null;
    return savedReportSchema.parse({
      ...row,
      spec,
      owner: personRef(owner),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      canEdit: row.ownerId === actor.employeeId,
      hiddenColumns: hiddenSalaryColumns(spec, hasSalaryAccess(actor.capabilities)),
      schedule: schedule
        ? {
            ...schedule,
            recipients: employees.filter((person) => schedule.recipients.includes(person.id)).map(personRef),
            nextRunAt: row.nextRunAt?.toISOString() ?? null,
          }
        : null,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
    });
  };
  const runSpec = async (
    actor: AuthenticatedActor,
    spec: ReportSpec,
    limit?: number,
    title?: string,
    db: PayDb = prisma,
  ): Promise<ReportTable> => {
    requireCapability(actor, "report.read");
    const dataset = datasetOf(spec.dataset);
    if (!dataset) throw new AppError(400, "INVALID_DATASET", "Unknown dataset.");
    if (dataset.salary && !hasSalaryAccess(actor.capabilities))
      throw new AppError(403, "SALARY_RESTRICTED", "Payroll reporting requires salary access.");
    const rows = await datasetRows(db, actor, spec);
    const result = applySpec(dataset, spec, rows, {
      salary: hasSalaryAccess(actor.capabilities),
      note: spec.dataset === "employees" ? "Uncollected personal fields are blank." : null,
      ...(limit === undefined ? {} : { limit }),
      ...(title === undefined ? {} : { title }),
    });
    if ("status" in result) throw new AppError(result.status, result.code, result.message);
    return result;
  };
  const recordExport = async (
    actor: AuthenticatedActor,
    report: string,
    source: "standard" | "custom" | "saved" | "schedule",
    format: ExportFormat,
    rowCount: number,
    filters: string,
    requestId: string,
  ) =>
    idempotent(prisma, { actorId: actor.employeeId, key: undefined, command: "report.export" }, async (tx) => {
      const id = newId("re");
      await createReportsRepository(tx).export({
        id,
        actorId: actor.employeeId,
        report,
        source,
        format,
        rowCount,
        filters,
      });
      await recordAuditEvent(tx, {
        actorEmployeeId: actor.employeeId,
        action: "Report exported",
        entity: "report_export",
        entityId: id,
        requestId,
        details: { report, rowCount, source },
      });
      return { ok: true };
    });
  const service = {
    async library(actor: AuthenticatedActor) {
      requireCapability(actor, "report.read");
      const employees = await people.employees();
      const salaryAccess = hasSalaryAccess(actor.capabilities);
      return {
        reports: standardReports.filter((report) => !report.salary || salaryAccess),
        salaryAccess,
        statutoryAccess: can(actor, "statutory.manage"),
        departments: [...new Set(employees.map((row) => row.department.name))].sort(),
        locations: [...new Set(employees.map((row) => row.location.name))].sort(),
        today: todayInOrgZone(),
        currentMonth: todayInOrgZone().slice(0, 7),
      };
    },
    async builder(actor: AuthenticatedActor) {
      requireCapability(actor, "report.build");
      const [library, employees] = await Promise.all([service.library(actor), people.employees()]);
      return {
        datasets: datasets
          .filter((dataset) => !dataset.salary || library.salaryAccess)
          .map((dataset) => ({
            ...dataset,
            columns: dataset.columns.filter((column) => !column.salary || library.salaryAccess),
          })),
        departments: library.departments,
        locations: library.locations,
        currentMonth: library.currentMonth,
        salaryAccess: library.salaryAccess,
        roles: roleLabels,
        recipients: employees.filter((row) => row.status !== "exited").map(personRef),
      };
    },
    async analytics(actor: AuthenticatedActor): Promise<ReportAnalytics> {
      requireCapability(actor, "report.read");
      const employees = await people.employees();
      const today = todayInOrgZone();
      const active = employees.filter((row) => row.status !== "exited");
      const members: Member[] = employees.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        designation: row.designation,
        department: row.department.name,
        location: row.location.name,
        joinedOn: toIsoDate(row.joinedOn),
        exitedOn: row.exitedOn ? toIsoDate(row.exitedOn) : null,
        reason: null,
        status: row.status,
        type: row.employmentType,
        gender: "Not collected",
      }));
      const movement = monthlyMovement(members, today.slice(0, 7), today);
      const count = (field: (row: (typeof active)[number]) => string) =>
        [...new Set(active.map(field))].map((name) => ({
          name,
          count: active.filter((row) => field(row) === name).length,
        }));
      const leavers = movement.reduce((sum, row) => sum + row.leavers, 0);
      const average =
        movement.reduce((sum, row) => sum + (row.opening + row.closing) / 2, 0) / Math.max(1, movement.length);
      return {
        asOf: today,
        headcount: active.length,
        trend: movement.map((row) => ({
          month: row.month,
          label: row.month,
          headcount: row.closing,
          joiners: row.joiners,
          leavers: row.leavers,
          attritionPct: monthlyAttrition(row).toFixed(1),
        })),
        attrition: {
          leavers,
          averageHeadcount: average.toFixed(1),
          annualizedPct: average ? ((leavers / average) * 100).toFixed(1) : "0.0",
          voluntary: 0,
        },
        byDepartment: count((row) => row.department.name),
        byLocation: count((row) => row.location.name),
        byGender: [{ name: "Not collected", count: active.length }],
        tenure: count((row) => {
          const years = daysBetween(toIsoDate(row.joinedOn), today) / 365.25;
          return years < 1 ? "Under 1 year" : years < 3 ? "1–3 years" : years < 5 ? "3–5 years" : "5+ years";
        }),
        byType: count((row) => row.employmentType),
      };
    },
    async workforce(actor: AuthenticatedActor) {
      requireCapability(actor, "report.read");
      const employees = await people.employees();
      const [analytics, days, leaves, ledger] = await Promise.all([
        service.analytics(actor),
        repository.attendance(todayInOrgZone(), todayInOrgZone()),
        repository.workflows("leave"),
        repository.ledger(),
      ]);
      const onLeave = new Set(
        leaves
          .filter(
            (row) =>
              row.state === "approved" &&
              (row.startDate ?? "") <= todayInOrgZone() &&
              (row.endDate ?? "") >= todayInOrgZone(),
          )
          .map((row) => row.employeeId),
      ).size;
      return {
        generatedAt: new Date().toISOString(),
        headcount: analytics.headcount,
        byDepartment: analytics.byDepartment.map((row) => ({
          ...row,
          joiners: employees.filter(
            (employee) =>
              employee.department.name === row.name &&
              toIsoDate(employee.joinedOn).slice(0, 7) === todayInOrgZone().slice(0, 7),
          ).length,
        })),
        byLocation: analytics.byLocation,
        byType: analytics.byType,
        attendanceToday: {
          present: days.length,
          onLeave,
          notRecorded: Math.max(0, analytics.headcount - days.length - onLeave),
        },
        leaveUtilization: [...new Set(ledger.map((row) => row.leaveTypeId))].map((type) => ({
          type,
          usedDays: (-ledger
            .filter((row) => row.leaveTypeId === type)
            .reduce((sum, row) => sum + Math.min(0, Number(row.units)), 0)).toFixed(1),
          entitledDays: ledger
            .filter((row) => row.leaveTypeId === type)
            .reduce((sum, row) => sum + Math.max(0, Number(row.units)), 0)
            .toFixed(1),
        })),
        tenure: analytics.tenure.map((row) => ({ band: row.name, count: row.count })),
      };
    },
    preview: (actor: AuthenticatedActor, spec: ReportSpec) => runSpec(actor, spec, 50),
    async list(actor: AuthenticatedActor) {
      requireCapability(actor, "report.read");
      return Promise.all((await repository.saved()).filter((row) => visible(actor, row)).map((row) => dto(actor, row)));
    },
    async saved(actor: AuthenticatedActor, id: string) {
      requireCapability(actor, "report.read");
      return dto(actor, await loadSaved(actor, id));
    },
    save(
      actor: AuthenticatedActor,
      input: SaveReportInput,
      id: string | undefined,
      expected: number | undefined,
      key: string | undefined,
      requestId: string,
    ) {
      requireCapability(actor, "report.build");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key, command: `report.save:${id ?? "new"}` },
        async (tx) => {
          const repo = createReportsRepository(tx);
          if (shareError(input.spec, input.visibility, input.sharedRoles))
            throw new AppError(
              403,
              "SALARY_SHARE",
              "Select appropriate roles; salary reports can only be shared with payroll roles.",
            );
          await runSpec(actor, input.spec, 1, undefined, tx);
          if (id) {
            const row = await loadSaved(actor, id, repo, true);
            assertVersion(row.version, expected ?? input.version);
            await repo.update(id, {
              name: input.name,
              description: input.description,
              spec: json(input.spec),
              visibility: input.visibility,
              sharedRoles: input.sharedRoles,
            });
          } else {
            id = newId("rpt");
            await repo.create({
              id,
              name: input.name,
              description: input.description,
              spec: json(input.spec),
              visibility: input.visibility,
              sharedRoles: input.sharedRoles,
              ownerId: actor.employeeId,
            });
          }
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "Report saved",
            entity: "report_saved",
            entityId: id,
            requestId,
            details: {},
          });
          return { id, reference: id };
        },
      );
    },
    remove(actor: AuthenticatedActor, id: string, requestId: string) {
      requireCapability(actor, "report.build");
      return idempotent(prisma, { actorId: actor.employeeId, key: undefined, command: "report.delete" }, async (tx) => {
        const repo = createReportsRepository(tx);
        await loadSaved(actor, id, repo, true);
        await repo.remove(id);
        await recordAuditEvent(tx, {
          actorEmployeeId: actor.employeeId,
          action: "Report deleted",
          entity: "report_saved",
          entityId: id,
          requestId,
          details: {},
        });
        return { ok: true };
      });
    },
    schedule(actor: AuthenticatedActor, id: string, input: ScheduleInput | null, requestId: string) {
      requireCapability(actor, "report.build");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: "report.schedule" },
        async (tx) => {
          const repo = createReportsRepository(tx);
          const row = await loadSaved(actor, id, repo, true);
          let at: string | null = null;
          if (input) {
            if (input.reportId !== id || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))
              throw new AppError(400, "INVALID_SCHEDULE", "Check report and delivery time.");
            const employees = await createPayrollRepository(tx).employees();
            for (const recipient of input.recipients) {
              const employee = employees.find((person) => person.id === recipient && person.status !== "exited");
              if (!employee) throw new AppError(422, "INVALID_RECIPIENT", "Select active recipients.");
              const roles = (await repo.roles(recipient)).map((role) => role.role);
              const capabilities = capabilitiesFor(roles);
              if (
                !capabilities.includes("report.read") ||
                (datasetOf(reportSpecSchema.parse(row.spec).dataset)?.salary && !hasSalaryAccess(capabilities)) ||
                (reportSpecSchema
                  .parse(row.spec)
                  .columns.some((key) =>
                    datasetOf(reportSpecSchema.parse(row.spec).dataset)?.columns.some(
                      (column) => column.key === key && column.salary,
                    ),
                  ) &&
                  !hasSalaryAccess(capabilities))
              )
                throw new AppError(403, "RECIPIENT_RESTRICTED", "A recipient cannot access this report's data.");
            }
            at = nextRun(input, todayInOrgZone(), Date.now());
          }
          await repo.update(id, {
            schedule: input ? json(input) : (await import("@prisma/client")).Prisma.DbNull,
            nextRunAt: at ? new Date(at) : null,
          });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: input ? "Report scheduled" : "Report schedule removed",
            entity: "report_saved",
            entityId: id,
            requestId,
            details: {},
          });
          return { ok: true, nextRunAt: at };
        },
      );
    },
    async runSchedule(
      actor: AuthenticatedActor,
      id: string,
      requestId: string,
      trigger: "manual" | "schedule" = "manual",
    ) {
      requireCapability(actor, "report.build");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: "report.schedule.run" },
        async (tx) => {
          const repo = createReportsRepository(tx);
          const pay = createPayrollRepository(tx);
          await pay.lock(`report:${id}`);
          const row = await loadSaved(actor, id, repo, true);
          if (trigger === "schedule" && (!row.nextRunAt || row.nextRunAt.getTime() > Date.now()))
            return { ok: true, rowCount: 0 };
          if (!row.schedule) throw new AppError(409, "NO_SCHEDULE", "Configure report recipients first.");
          const schedule = scheduleStoredSchema.parse(row.schedule);
          const result = await runSpec(actor, reportSpecSchema.parse(row.spec), undefined, row.name, tx);
          const employees = await pay.employees();
          for (const recipient of schedule.recipients) {
            const roles = (await repo.roles(recipient)).map((role) => role.role);
            const recipientActor = { employeeId: recipient, roles, capabilities: capabilitiesFor(roles) };
            await runSpec(recipientActor, reportSpecSchema.parse(row.spec), 1, undefined, tx);
            if (
              hiddenSalaryColumns(reportSpecSchema.parse(row.spec), hasSalaryAccess(recipientActor.capabilities)).length
            )
              throw new AppError(403, "RECIPIENT_RESTRICTED", "A scheduled recipient no longer has salary access.");
          }
          const artifact = exportFile(
            result,
            schedule.format,
            row.name,
            describeFilters(reportSpecSchema.parse(row.spec).filters),
            todayInOrgZone(),
          );
          const deliveryId = newId("rd");
          await repo.delivery({
            id: deliveryId,
            savedReportId: id,
            reportName: row.name,
            ownerId: actor.employeeId,
            recipientIds: schedule.recipients,
            rowCount: result.rows.length,
            format: schedule.format,
            trigger,
            artifact: json({
              ...artifact,
              requiresSalary: Boolean(
                datasetOf(reportSpecSchema.parse(row.spec).dataset)?.salary ||
                hiddenSalaryColumns(reportSpecSchema.parse(row.spec), false).length,
              ),
            }),
          });
          for (const recipient of schedule.recipients) {
            await notify(tx, {
              employeeId: recipient,
              kind: "system",
              title: "Your scheduled report is ready",
              body: row.name,
              href: `/api/reports/saved/${id}?delivery=${deliveryId}`,
            });
            const employee = employees.find((person) => person.id === recipient);
            if (employee)
              await queueEmail(tx, {
                to: employee.workEmail,
                template: "report.ready",
                subject: "Your report is ready",
                text: `Sign in to HR and open Reports to download ${row.name}.`,
              });
          }
          const next = nextRun(schedule, todayInOrgZone(), Date.now());
          await repo.update(id, { lastRunAt: new Date(), nextRunAt: next ? new Date(next) : null });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "Report delivery created",
            entity: "report_delivery",
            entityId: deliveryId,
            requestId,
            details: { recipients: schedule.recipients.length, rowCount: result.rows.length },
          });
          return { ok: true, rowCount: result.rows.length };
        },
      );
    },
    async deliveries(actor: AuthenticatedActor) {
      requireCapability(actor, "report.read");
      const employees = await people.employees();
      return (await repository.deliveries())
        .filter((row) => row.ownerId === actor.employeeId || row.recipientIds.includes(actor.employeeId))
        .map((row) => ({
          id: row.id,
          savedReportId: row.savedReportId,
          reportName: row.reportName,
          at: row.at.toISOString(),
          recipients: row.recipientIds.map((id) => employees.find((person) => person.id === id)?.name ?? id),
          rowCount: row.rowCount,
          format: row.format,
          trigger: row.trigger,
        }));
    },
    async download(actor: AuthenticatedActor, id: string) {
      requireCapability(actor, "report.read");
      const row = await repository.download(id);
      if (!row || (row.ownerId !== actor.employeeId && !row.recipientIds.includes(actor.employeeId)))
        throw new AppError(404, "NOT_FOUND", "Report artifact not found.");
      if (
        z.object({ requiresSalary: z.boolean().default(true) }).parse(row.artifact).requiresSalary &&
        !hasSalaryAccess(actor.capabilities)
      )
        throw new AppError(403, "SALARY_RESTRICTED", "Your current role cannot access this salary artifact.");
      const saved = await repository.savedById(row.savedReportId);
      if (!saved) throw new AppError(404, "NOT_FOUND", "The source report was removed.");
      const spec = reportSpecSchema.parse(saved.spec);
      if (
        (datasetOf(spec.dataset)?.salary || hiddenSalaryColumns(spec, false).length) &&
        !hasSalaryAccess(actor.capabilities)
      )
        throw new AppError(403, "SALARY_RESTRICTED", "Your current role cannot access this report artifact.");
      return row.artifact;
    },
    async exports(actor: AuthenticatedActor) {
      requireCapability(actor, "report.read");
      const employees = await people.employees();
      return (await repository.exports())
        .filter((row) => row.actorId === actor.employeeId)
        .flatMap((row) => {
          const employee = employees.find((person) => person.id === row.actorId);
          return employee ? [{ ...row, at: row.at.toISOString(), actor: personRef(employee) }] : [];
        });
    },
    auditExport(actor: AuthenticatedActor, report: string, rowCount: number, filters: string, requestId: string) {
      requireCapability(actor, "report.read");
      return recordExport(actor, report, "custom", "csv", rowCount, filters, requestId);
    },
    async exportCustom(actor: AuthenticatedActor, spec: ReportSpec, format: ExportFormat, requestId: string) {
      const result = await runSpec(actor, spec);
      await recordExport(
        actor,
        result.title,
        "custom",
        format,
        result.rows.length,
        describeFilters(spec.filters),
        requestId,
      );
      return exportFile(result, format, result.title, describeFilters(spec.filters), todayInOrgZone());
    },
    async exportSaved(actor: AuthenticatedActor, id: string, format: ExportFormat, requestId: string) {
      requireCapability(actor, "report.read");
      const row = await loadSaved(actor, id);
      const spec = reportSpecSchema.parse(row.spec);
      const result = await runSpec(actor, spec, undefined, row.name);
      await recordExport(
        actor,
        row.name,
        "saved",
        format,
        result.rows.length,
        describeFilters(spec.filters),
        requestId,
      );
      return exportFile(result, format, row.name, describeFilters(spec.filters), todayInOrgZone());
    },
    async exportStandard(
      actor: AuthenticatedActor,
      key: StandardReportKey,
      filters: ReportFilters,
      format: ExportFormat,
      requestId: string,
    ) {
      requireCapability(actor, "report.read");
      const definition = standardReports.find((row) => row.key === key);
      if (!definition) throw new AppError(404, "NOT_FOUND", "Report not found.");
      if (definition.salary && !hasSalaryAccess(actor.capabilities))
        throw new AppError(403, "SALARY_RESTRICTED", "Salary reporting requires payroll access.");
      const mapping = {
        headcount: "employees",
        joiners_leavers: "employees",
        attrition: "employees",
        probation_due: "employees",
        celebrations: "employees",
        attendance_summary: "attendance",
        late_coming: "attendance",
        leave_balances: "leave_balances",
        leave_availed: "leave_requests",
        salary_register: "payroll_register",
        ctc_by_department: "employees",
      } as const;
      const dataset = datasetOf(mapping[key]);
      if (!dataset) throw new AppError(404, "NOT_FOUND", "Report data source not found.");
      const spec: ReportSpec = {
        dataset: dataset.id,
        columns: dataset.defaultColumns,
        filters,
        sort: null,
        groupBy: null,
        aggregate: null,
      };
      if (key === "ctc_by_department") {
        spec.columns = ["department", "annualCtc"];
        spec.groupBy = "department";
        spec.aggregate = { fn: "sum", column: "annualCtc" };
      }
      let result = await runSpec(actor, spec, undefined, definition.title);
      if (key === "attrition") {
        const analytics = await service.analytics(actor);
        result = table(
          definition.title,
          [
            col("month", "Month"),
            col("headcount", "Headcount", "number"),
            col("joiners", "Joiners", "number"),
            col("leavers", "Leavers", "number"),
            col("attritionPct", "Annualized attrition"),
          ],
          analytics.trend.map((row) => ({
            month: row.month,
            headcount: row.headcount,
            joiners: row.joiners,
            leavers: row.leavers,
            attritionPct: row.attritionPct,
          })),
        );
      }
      if (["joiners_leavers", "probation_due", "celebrations", "late_coming"].includes(key)) {
        const employees = (await people.employees()).filter(
          (employee) =>
            (!filters.department || employee.department.name === filters.department) &&
            (!filters.location || employee.location.name === filters.location),
        );
        const from = filters.from || `${filters.month || todayInOrgZone().slice(0, 7)}-01`;
        const to = filters.to || monthEnd(filters.month || todayInOrgZone().slice(0, 7));
        if (key === "joiners_leavers")
          result = table(
            definition.title,
            [col("code", "Employee code"), col("name", "Name"), col("event", "Event"), col("date", "Date", "date")],
            employees.flatMap((employee) => [
              ...(toIsoDate(employee.joinedOn) >= from && toIsoDate(employee.joinedOn) <= to
                ? [{ code: employee.code, name: employee.name, event: "Joined", date: toIsoDate(employee.joinedOn) }]
                : []),
              ...(employee.exitedOn && toIsoDate(employee.exitedOn) >= from && toIsoDate(employee.exitedOn) <= to
                ? [{ code: employee.code, name: employee.name, event: "Exited", date: toIsoDate(employee.exitedOn) }]
                : []),
            ]),
          );
        else if (key === "celebrations")
          result = table(
            definition.title,
            [col("code", "Employee code"), col("name", "Name"), col("joinedOn", "Work anniversary", "date")],
            employees
              .filter(
                (employee) =>
                  toIsoDate(employee.joinedOn).slice(5, 7) === (filters.month || todayInOrgZone().slice(0, 7)).slice(5),
              )
              .map((employee) => ({
                code: employee.code,
                name: employee.name,
                joinedOn: toIsoDate(employee.joinedOn),
              })),
            ["Birthdays are omitted because dates of birth are not collected."],
          );
        else if (key === "probation_due") {
          const defaults = probationDefaultsSchema.parse((await repository.setting("probation_defaults"))?.value);
          result = table(
            definition.title,
            [
              col("code", "Employee code"),
              col("name", "Name"),
              col("department", "Department"),
              col("reviewOn", "Probation review date", "date"),
            ],
            employees
              .filter((employee) => employee.status !== "exited")
              .map((employee) => ({
                code: employee.code,
                name: employee.name,
                department: employee.department.name,
                reviewOn: addMonthsToDate(toIsoDate(employee.joinedOn), defaults[employee.employmentType]),
              }))
              .filter((row) => row.reviewOn >= from && row.reviewOn <= to),
            ["Review dates follow the configured employment-type probation duration."],
          );
        } else {
          result.rows = result.rows.filter((row) => Number(row.late ?? 0) > 0);
          result.totalRows = result.rows.length;
        }
      }
      await recordExport(
        actor,
        definition.title,
        "standard",
        format,
        result.rows.length,
        describeFilters(filters),
        requestId,
      );
      return exportFile(result, format, definition.title, describeFilters(filters), todayInOrgZone());
    },
    async processDue() {
      const due = await repository.due(new Date());
      for (const row of due) {
        const roles = (await repository.roles(row.ownerId)).map((role) => role.role);
        const actor = { employeeId: row.ownerId, roles, capabilities: capabilitiesFor(roles) };
        try {
          await service.runSchedule(actor, row.id, `schedule:${row.id}`, "schedule");
        } catch (error) {
          await idempotent(
            prisma,
            { actorId: row.ownerId, key: undefined, command: "report.schedule.pause" },
            async (tx) => {
              const repo = createReportsRepository(tx);
              const fresh = await repo.savedById(row.id);
              if (!fresh || !fresh.nextRunAt || fresh.nextRunAt.getTime() > Date.now()) return;
              const schedule = scheduleStoredSchema.parse(fresh.schedule);
              await repo.update(row.id, { nextRunAt: null, schedule: json({ ...schedule, active: false }) });
              await notify(tx, {
                employeeId: row.ownerId,
                kind: "system",
                title: "Report schedule needs attention",
                body: "Review the report configuration and recipient permissions, then enable its schedule again.",
                href: "/admin/reports",
              });
              await recordAuditEvent(tx, {
                actorEmployeeId: row.ownerId,
                action: "Report schedule paused after failure",
                entity: "report_saved",
                entityId: row.id,
                details: { code: error instanceof AppError ? error.code : "REPORT_DELIVERY_FAILED" },
              });
            },
          );
        }
      }
      return due.length;
    },
  };
  return service;
}
export type ReportsService = ReturnType<typeof createReportsService>;
