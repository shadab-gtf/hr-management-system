import { z } from "zod";
import type { SeedContext } from "./context.js";
import { attendanceRulesSchema, holidayRecordSchema, leaveTypeConfigSchema } from "../../src/contracts/hr-config.js";
import { json } from "../../src/modules/time/time.repository.js";
import { todayInOrgZone, zonedInstant } from "../../src/utils/date.js";

const seedType = z
  .object({
    id: z.string(),
    entitledHalves: z.number().nullable(),
    carryForwardHalves: z.number(),
    maxEncashHalves: z.number(),
    minRetainHalves: z.number(),
    negativeHalves: z.number(),
  })
  .loose();
const seedLeave = z.object({
  id: z.string(),
  reference: z.string(),
  employeeId: z.string(),
  approverId: z.string().nullable(),
  leaveTypeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  portion: z.string(),
  halves: z.number(),
  reason: z.string(),
  state: z.string(),
  submittedAt: z.string(),
  version: z.number(),
  decisionNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
});
const seedProject = z
  .object({ id: z.string(), budgetQuarters: z.number(), startDate: z.string(), endDate: z.string() })
  .loose();
export default async function seed(ctx: SeedContext) {
  const { prisma, data } = ctx;
  const shiftDate = (date: string) => ctx.shiftDate(date);
  const shiftInstant = (instant: string) => ctx.shiftInstant(instant);
  const log = (message: string) => {
    ctx.log(message);
  };
  const config = z
    .object({
      leaveTypes: z.array(seedType),
      holidays: z.array(holidayRecordSchema),
      shifts: attendanceRulesSchema.shape.shifts,
      defaultShiftId: z.string(),
      departmentShifts: z.record(z.string(), z.string()),
      overtime: attendanceRulesSchema.shape.overtime,
      lateEarly: attendanceRulesSchema.shape.lateEarly,
      sites: attendanceRulesSchema.shape.sites,
    })
    .parse(data.config);
  const put = async (id: string, kind: string, payload: unknown, scope?: string) =>
    prisma.timeDocument.upsert({
      where: { id },
      create: { id, kind, payload: json(payload), scope: scope ?? null },
      update: {},
    });
  const rules = attendanceRulesSchema.parse({
    ...config,
    departmentShifts: Object.entries(config.departmentShifts).map(([department, shiftId]) => ({ department, shiftId })),
  });
  await put("attendance_rules", "attendance_rules", rules);
  await put("leave_policy_version", "policy_version", "2");
  const today = todayInOrgZone(),
    year = today.slice(0, 4);
  for (const h of config.holidays) await put(h.id, "holiday", h);
  for (const t of config.leaveTypes) {
    const type = leaveTypeConfigSchema.parse({
      ...t,
      entitledDays: t.entitledHalves === null ? null : String(t.entitledHalves / 2),
      carryForwardDays: String(t.carryForwardHalves / 2),
      maxEncashDays: String(t.maxEncashHalves / 2),
      minRetainDays: String(t.minRetainHalves / 2),
      negativeDays: String(t.negativeHalves / 2),
      inUse: false,
    });
    await put(type.id, "leave_type", type);
    for (const employee of data.employees) {
      if (
        type.entitledDays === null ||
        Number(type.entitledDays) === 0 ||
        !type.employmentTypes.includes(employee.type)
      )
        continue;
      // Development opening entitlement; scheduled monthly accruals remain explicit ledger entries.
      const months = type.accrual === "monthly" ? 12 : 1;
      for (let month = 1; month <= months; month++) {
        const units =
          type.accrual === "monthly" ? Math.floor((Number(type.entitledDays) * 2) / 12) / 2 : Number(type.entitledDays);
        const id = `seed_${employee.id}_${type.id}_${year}_${month}`;
        await prisma.timeLeaveLedger.upsert({
          where: { id },
          create: {
            id,
            employeeId: employee.id,
            leaveTypeId: type.id,
            date: `${year}-${String(months === 1 ? 1 : month).padStart(2, "0")}-01`,
            kind: type.accrual === "monthly" ? "accrual" : "opening",
            units,
            reference: `OPEN-${year}-${month}`,
            note: "Configured policy entitlement",
          },
          update: {},
        });
      }
    }
  }
  for (const r of z.array(seedLeave).parse(data.leaveRequests)) {
    const startDate = shiftDate(r.startDate),
      endDate = shiftDate(r.endDate);
    await prisma.timeWorkflow.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        reference: r.reference,
        kind: "leave",
        employeeId: r.employeeId,
        approverId: r.approverId,
        state: r.state,
        startDate,
        endDate,
        version: r.version,
        createdAt: shiftInstant(r.submittedAt),
        decidedAt: r.decidedAt ? shiftInstant(r.decidedAt) : null,
        decisionNote: r.decisionNote,
        payload: json({
          leaveTypeId: r.leaveTypeId,
          startDate,
          endDate,
          portion: r.portion,
          units: r.halves / 2,
          reason: r.reason,
          attachmentName: null,
          policyVersion: "2",
        }),
      },
      update: {},
    });
    if (r.state === "approved")
      await prisma.timeLeaveLedger.upsert({
        where: { id: `debit_${r.id}` },
        create: {
          id: `debit_${r.id}`,
          employeeId: r.employeeId,
          leaveTypeId: r.leaveTypeId,
          date: startDate,
          kind: "availed",
          units: -r.halves / 2,
          reference: r.reference,
          note: r.reason,
        },
        update: {},
      });
  }
  const oldLedger = z
    .array(
      z.object({
        id: z.string(),
        employeeId: z.string(),
        leaveTypeId: z.string(),
        date: z.string(),
        kind: z.string(),
        halves: z.number(),
        note: z.string(),
        reference: z.string().nullable(),
      }),
    )
    .parse(data.leaveLedgerEntries);
  for (const e of oldLedger.filter((e) => e.kind === "carry_forward" || e.kind === "adjustment"))
    await prisma.timeLeaveLedger.upsert({
      where: { id: e.id },
      create: {
        id: e.id,
        employeeId: e.employeeId,
        leaveTypeId: e.leaveTypeId,
        date: shiftDate(e.date),
        kind: e.kind,
        units: e.halves / 2,
        note: e.note,
        reference: e.reference ?? e.id,
      },
      update: {},
    });
  for (const p of z.array(seedProject).parse(data.tsProjects))
    await put(p.id, "project", {
      ...p,
      client: typeof p.client === "string" ? p.client : "",
      budgetQuarterHours: p.budgetQuarters,
      startDate: shiftDate(p.startDate),
      endDate: shiftDate(p.endDate),
    });
  const offDays = z.record(z.string(), z.unknown()).safeParse(data.timeOffDayPunches);
  if (offDays.success)
    for (const [key, value] of Object.entries(offDays.data)) {
      const p = z.object({ in: z.string(), out: z.string() }).safeParse(value);
      const match = /^(emp_\d+)[:|_](\d{4}-\d{2}-\d{2})$/.exec(key);
      if (!p.success || !match?.[1] || !match[2]) continue;
      const date = shiftDate(match[2]),
        firstIn = zonedInstant(date, p.data.in),
        lastOut = zonedInstant(date, p.data.out);
      await prisma.timeAttendance.upsert({
        where: { employeeId_date: { employeeId: match[1], date } },
        create: {
          id: `seed_${match[1]}_${date}`,
          employeeId: match[1],
          date,
          firstIn,
          lastOut,
          workedMinutes: Math.max(0, (lastOut.getTime() - firstIn.getTime()) / 60000 - 60),
          source: "device_import",
        },
        update: {},
      });
    }
  // Salary basis is persisted separately from leave policies and read only when calculating an encashment.
  for (const employee of data.employees)
    await put(`leave_salary:${employee.id}`, "leave_salary", { perDay: (employee.annualCtc / 12 / 26).toFixed(2) });
  log("time policies, leave ledger, requests and projects");
}
