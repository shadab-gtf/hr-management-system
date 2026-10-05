import { z } from "zod";
import type { TimeWorkflow } from "@prisma/client";
import { AppError } from "../../core/errors/AppError.js";
import { personRef } from "../../core/people/person-ref.js";
import { can, type AuthenticatedActor } from "../../core/security/actor.js";
import { addDays, daysBetween, todayInOrgZone, weekdayOf, toIsoDate } from "../../utils/date.js";
import { newId } from "../../core/database/ids.js";
import { attendanceRulesSchema, holidayRecordSchema, leaveTypeConfigSchema } from "../../contracts/hr-config.js";
import { weeklyOffRuleSchema } from "../../contracts/attendance.js";
import { delegationInputSchema } from "../../contracts/requests.js";
import { leavePayload, encashPayload, rosterPayload } from "./time.schema.js";
import type { TimeRepository } from "./time.repository.js";

export function fail(code: string, message: string, status = 422): never {
  throw new AppError(status, code, message);
}
export function required<T>(value: T | null | undefined): T {
  return value ?? fail("DATA_INTEGRITY", "Required business configuration is unavailable.", 503);
}
export const decimal = (n: number): string => n.toFixed(2);
export const money = (amount: string | number) => ({
  amount: typeof amount === "number" ? decimal(amount) : amount,
  currency: "INR" as const,
});
export const monday = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));
export function datesBetween(from: string, to: string): string[] {
  const count = daysBetween(from, to);
  if (count < 0 || count > 370) return fail("INVALID_RANGE", "Choose a range within one year.");
  return Array.from({ length: count + 1 }, (_, i) => addDays(from, i));
}
export const monthDates = (month: string) =>
  datesBetween(
    `${month}-01`,
    addDays(
      `${Number(month.slice(0, 4)) + (month.endsWith("12") ? 1 : 0)}-${String((Number(month.slice(5, 7)) % 12) + 1).padStart(2, "0")}-01`,
      -1,
    ),
  );
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const clockTime = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(date)
    : null;

export async function employeeOf(repo: TimeRepository, id: string) {
  return (await repo.employee(id)) ?? fail("EMPLOYEE_NOT_FOUND", "Employee was not found.", 404);
}
export async function workflowOf(repo: TimeRepository, id: string, kind?: string) {
  const row = await repo.workflow(id);
  if (!row || (kind && row.kind !== kind)) return fail("REQUEST_NOT_FOUND", "Request was not found.", 404);
  return row;
}
export async function policyTypes(repo: TimeRepository) {
  return (await repo.documents("leave_type")).map((d) => leaveTypeConfigSchema.parse(d.payload));
}
export async function attendanceRules(repo: TimeRepository) {
  const d = await repo.document("attendance_rules");
  if (!d) return fail("CONFIGURATION_UNAVAILABLE", "Configure attendance rules first.", 503);
  return attendanceRulesSchema.parse(d.payload);
}
export async function holidaysFor(repo: TimeRepository, employeeId?: string) {
  const e = employeeId ? await employeeOf(repo, employeeId) : null;
  return (await repo.documents("holiday"))
    .map((d) => holidayRecordSchema.parse(d.payload))
    .filter((h) => !e || !h.locations.length || h.locations.includes(e.location.name));
}
export async function weeklyOff(repo: TimeRepository, department: string) {
  const d = await repo.document(`weekly_off:${department}`);
  return d
    ? weeklyOffRuleSchema.parse(d.payload)
    : { department, offWeekdays: [0, 6], alternateSaturdays: false, label: "Saturday and Sunday" };
}
export function isOff(date: string, rule: Awaited<ReturnType<typeof weeklyOff>>) {
  return (
    rule.offWeekdays.includes(weekdayOf(date)) ||
    (rule.alternateSaturdays && weekdayOf(date) === 6 && Math.ceil(Number(date.slice(8)) / 7) % 2 === 0)
  );
}
export async function calendarDay(repo: TimeRepository, employeeId: string, date: string) {
  return required((await employeeCalendar(repo, employeeId, date, date)).get(date));
}
/** Load each policy/roster/leave source once for a requested range; no per-day database round trips. */
export async function employeeCalendar(repo: TimeRepository, employeeId: string, from: string, to: string) {
  const e = await employeeOf(repo, employeeId);
  const [rules, off, holidays, rosters, leaves, types] = await Promise.all([
    attendanceRules(repo),
    weeklyOff(repo, e.department.name),
    holidaysFor(repo, employeeId),
    repo.documents("roster", e.department.name),
    repo.workflows({
      kind: "leave",
      employeeId,
      state: { in: ["pending", "approved"] },
      startDate: { lte: to },
      endDate: { gte: from },
    }),
    policyTypes(repo),
  ]);
  const rosterByWeek = new Map(rosters.map((r) => [r.id, rosterPayload.parse(r.payload)]));
  return new Map(
    datesBetween(from, to).map((date) => {
      const r = rosterByWeek.get(`roster:${e.department.name}:${monday(date)}`);
      const cell = r?.publishedCells[employeeId]?.[daysBetween(monday(date), date)];
      const assigned = rules.departmentShifts.find((v) => v.department === e.department.name)?.shiftId;
      const shift =
        rules.shifts.find((s) => s.id === (cell && cell !== "off" ? cell : (assigned ?? rules.defaultShiftId))) ??
        rules.shifts[0];
      if (!shift) return fail("CONFIGURATION_UNAVAILABLE", "No shift is configured.", 503);
      const leave = leaves.find((l) => required(l.startDate) <= date && required(l.endDate) >= date);
      const leaveData = leave ? leavePayload.parse(leave.payload) : null;
      const type = leaveData ? types.find((t) => t.id === leaveData.leaveTypeId) : null;
      return [
        date,
        {
          shift,
          off: cell === "off" || (!cell && isOff(date, off)),
          holiday: holidays.find((h) => h.date === date)?.name ?? null,
          leave,
          leaveData,
          type,
          source:
            cell !== null && cell !== undefined
              ? ("roster" as const)
              : assigned
                ? ("department" as const)
                : ("default" as const),
        },
      ] as const;
    }),
  );
}

export async function scopedPeople(repo: TimeRepository, actor: AuthenticatedActor, departmentForEmployee = false) {
  if (can(actor, "employee.read")) return repo.people();
  if (can(actor, "attendance.read.team") || can(actor, "approval.decide") || can(actor, "timesheet.approve"))
    return repo.people({ OR: [{ managerId: actor.employeeId }, { id: actor.employeeId }] });
  const e = await employeeOf(repo, actor.employeeId);
  return repo.people(departmentForEmployee ? { departmentId: e.departmentId } : { id: actor.employeeId });
}
export async function canDecide(repo: TimeRepository, actor: AuthenticatedActor, row: TimeWorkflow): Promise<boolean> {
  if (row.employeeId === actor.employeeId) return false;
  if (row.kind === "timesheet" && !can(actor, "timesheet.approve")) return false;
  if (row.kind !== "timesheet" && !can(actor, "approval.decide")) return false;
  if (row.kind === "encashment") return can(actor, "employee.update");
  if (can(actor, "employee.update") || row.approverId === actor.employeeId) return true;
  const today = todayInOrgZone();
  const delegations = await repo.workflows({
    kind: "delegation",
    state: "active",
    approverId: actor.employeeId,
    startDate: { lte: today },
    endDate: { gte: today },
    employeeId: row.approverId ?? "",
  });
  return delegations.some((d) => delegationInputSchema.parse(d.payload).workflows.some((kind) => kind === row.kind));
}
export async function requireDecision(repo: TimeRepository, actor: AuthenticatedActor, row: TimeWorkflow) {
  if (!(await canDecide(repo, actor, row))) fail("FORBIDDEN", "You cannot decide this request.", 403);
}
export function requireOwner(actor: AuthenticatedActor, row: TimeWorkflow) {
  if (row.employeeId !== actor.employeeId) fail("NOT_FOUND", "Request was not found.", 404);
}
export function requirePending(row: TimeWorkflow) {
  if (!["pending", "submitted"].includes(row.state)) fail("ALREADY_DECIDED", "This request is no longer pending.", 409);
}

/** Balance at a date, with FIFO consumption of expiring credits and pending reservations. */
export async function leaveBalance(
  repo: TimeRepository,
  employeeId: string,
  leaveTypeId: string,
  asOf = todayInOrgZone(),
) {
  const type =
    (await policyTypes(repo)).find((t) => t.id === leaveTypeId) ??
    fail("INVALID_LEAVE_TYPE", "Choose a valid leave type.");
  const entries = (await repo.ledger(employeeId, leaveTypeId)).filter(
    (v) => v.date <= asOf && (type.code === "CO" || v.date.startsWith(asOf.slice(0, 4))),
  );
  let ordinary = 0;
  const credits: { units: number; expiresOn: string | null }[] = [];
  for (const entry of entries) {
    const units = Number(entry.units);
    if (units > 0) {
      if (entry.expiresOn) credits.push({ units, expiresOn: entry.expiresOn });
      else ordinary += units;
    } else {
      let remaining = -units;
      for (const credit of credits) {
        if (credit.expiresOn && credit.expiresOn < entry.date) continue;
        const used = Math.min(remaining, credit.units);
        credit.units -= used;
        remaining -= used;
      }
      ordinary -= remaining;
    }
  }
  const live = credits.filter((c) => !c.expiresOn || c.expiresOn >= asOf);
  const accrued = ordinary + live.reduce((sum, c) => sum + c.units, 0);
  const pending = await repo.workflows({ employeeId, state: "pending", kind: { in: ["leave", "encashment"] } });
  const reserved = pending.reduce((sum, r) => {
    if (r.kind === "leave") {
      const p = leavePayload.parse(r.payload);
      return sum + (p.leaveTypeId === leaveTypeId && p.startDate.startsWith(asOf.slice(0, 4)) ? p.units : 0);
    }
    const p = encashPayload.parse(r.payload);
    return sum + (p.leaveTypeId === leaveTypeId && p.payrollMonth.startsWith(asOf.slice(0, 4)) ? p.days : 0);
  }, 0);
  const next = live.find((c) => c.units > 0 && c.expiresOn);
  return {
    leaveTypeId,
    name: type.name,
    code: type.code,
    entitled: type.entitledDays ?? "0.00",
    available: decimal(accrued - reserved),
    reserved: decimal(reserved),
    used: decimal(
      entries.filter((e) => ["availed", "encashed"].includes(e.kind)).reduce((sum, e) => sum - Number(e.units), 0),
    ),
    policyYear: asOf.slice(0, 4),
    asOf,
    nextExpiry: next?.expiresOn ? { date: next.expiresOn, units: decimal(next.units) } : null,
  };
}
export async function policyVersion(repo: TimeRepository) {
  const d = await repo.document("leave_policy_version");
  return d ? z.string().parse(d.payload) : "1";
}
/** Idempotent policy-year postings, usable inside employee creation and policy transactions. */
export async function provisionLeaveEntitlements(
  repo: TimeRepository,
  employeeId: string,
  year: string | number,
): Promise<void> {
  const policyYear = String(year);
  const employee = await employeeOf(repo, employeeId),
    joined = toIsoDate(employee.joinedOn);
  for (const type of await policyTypes(repo)) {
    if (
      !type.active ||
      type.accrual === "none" ||
      type.entitledDays === null ||
      !type.employmentTypes.includes(employee.employmentType)
    )
      continue;
    const totalHalves = Math.round(Number(type.entitledDays) * 2),
      monthly = type.accrual === "monthly";
    for (let month = 1; month <= (monthly ? 12 : 1); month++) {
      const date: string = `${policyYear}-${String(month).padStart(2, "0")}-01`;
      const effective: string = monthly ? date : joined > date ? joined : date;
      if (effective.slice(0, 4) !== policyYear || (monthly && date < joined)) continue;
      const units = monthly
        ? (Math.floor((totalHalves * month) / 12) - Math.floor((totalHalves * (month - 1)) / 12)) / 2
        : totalHalves / 2;
      if (units <= 0) continue;
      await repo.ensureLedger({
        id: newId("lg"),
        employeeId,
        leaveTypeId: type.id,
        date: effective,
        kind: monthly ? "accrual" : "opening",
        units,
        reference: `OPEN-${policyYear}-${month}`,
        note: "Configured policy entitlement",
      });
    }
  }
}
export { personRef };
