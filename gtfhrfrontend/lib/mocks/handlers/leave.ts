import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant, type MockLeaveRequest } from "@/lib/mocks/store";
import { holidayName, holidaysFor, isHoliday, leaveTypes, policyVersion } from "@/lib/mocks/handlers/config";
import { balanceTypes, chargeableFor, compOffCredits, eligibilityProblem, signedHalves, typeLedger } from "@/lib/mocks/handlers/leave-ledger";
import { isOffDay } from "@/lib/mocks/handlers/roster";
import { halves } from "@/lib/mocks/seed/random";
import type { MockLeaveType } from "@/lib/mocks/seed/config";
import { addDays, daysInMonth, diffDays, isWeekend } from "@/lib/utils/date";
import { formatDate } from "@/lib/utils/format";
import {
  idempotent,
  me,
  refById,
  requireCapability,
  versionCheck,
  type MockActor,
} from "@/lib/mocks/handlers/shared";
import type {
  LeaveCalendar,
  LeaveBalance,
  LeaveOverview,
  LeaveRequest,
  LeaveRequestInput,
  LeaveType,
} from "@/types/leave";

/** Policy version label for approvals; bumps whenever HR edits leave types. */
export const currentPolicyVersion = policyVersion;

/** Legacy helper (Sat/Sun weekends, no roster, no sandwich). Prefer chargeableFor. */
export function chargeableHalves(start: string, end: string, portion: string, location?: string): number {
  const working: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) if (!isWeekend(date) && !isHoliday(date, location)) working.push(date);
  if (working.length === 1 && portion !== "full") return 1;
  return working.length * 2;
}

function balancesFor(employeeId: string, asOf: string): LeaveBalance[] {
  const employee = employeeById(employeeId);
  if (!employee) return [];
  const year = asOf.slice(0, 4);
  return balanceTypes(employee).map((type) => {
    const ledger = typeLedger(employee, type, year);
    let nextExpiry: LeaveBalance["nextExpiry"] = null;
    if (type.expiryDays !== null) {
      const live = compOffCredits(employee.id).credits.find((credit) => credit.remaining > 0 && (credit.claim.expiresOn ?? "") >= asOf);
      if (live?.claim.expiresOn) nextExpiry = { date: live.claim.expiresOn, units: halves(live.remaining) };
    }
    return {
      leaveTypeId: type.id,
      name: type.name,
      code: type.code,
      entitled: halves(Math.max(ledger.credited, 0)),
      available: signedHalves(ledger.available),
      reserved: halves(ledger.reserved),
      used: halves(ledger.used),
      policyYear: year,
      asOf,
      nextExpiry,
    };
  });
}
export function availableHalves(employeeId: string, leaveTypeId: string, asOf: string): number | null {
  const employee = employeeById(employeeId);
  const type = leaveTypes().find((item) => item.id === leaveTypeId);
  if (!employee || !type || type.entitledHalves === null) return null;
  return typeLedger(employee, type, asOf.slice(0, 4)).available;
}

/** Employee-facing rule summary; the server enforces every line. */
export function ruleLines(type: MockLeaveType): string[] {
  const lines: string[] = [];
  if (type.accrual === "monthly" && type.entitledHalves) lines.push(`Credited monthly (${halves(type.entitledHalves)} days a year)`);
  if (type.accrual === "annual_upfront" && type.entitledHalves) lines.push(`${halves(type.entitledHalves)} days credited at the start of the year`);
  if (type.accrual === "none" && type.expiryDays) lines.push(`Earned by working week-offs or holidays; each credit expires after ${type.expiryDays} days`);
  if (type.minNoticeDays > 0) lines.push(`Apply at least ${type.minNoticeDays} day${type.minNoticeDays === 1 ? "" : "s"} in advance`);
  if (type.backdateDays > 0) lines.push(`Can be applied up to ${type.backdateDays} days after the leave`);
  if (type.maxConsecutiveDays) lines.push(`At most ${type.maxConsecutiveDays} consecutive day${type.maxConsecutiveDays === 1 ? "" : "s"}`);
  if (type.sandwich) lines.push("Weekends and holidays between leave days are counted (sandwich rule)");
  if (type.documentAfterDays === 0) lines.push("Supporting document required");
  else if (type.documentAfterDays) lines.push(`Medical certificate required beyond ${type.documentAfterDays} days`);
  if (type.negativeHalves > 0) lines.push(`Balance may go up to ${halves(type.negativeHalves)} days negative`);
  if (type.carryForwardHalves > 0) lines.push(`Up to ${halves(type.carryForwardHalves)} days carry forward to next year`);
  if (type.encashable) lines.push(`Encash up to ${halves(type.maxEncashHalves)} days a year, keeping ${halves(type.minRetainHalves)}`);
  if (type.afterProbationOnly) lines.push("Available after probation");
  if (type.minServiceDays > 0) lines.push(`Needs ${type.minServiceDays} days of service`);
  return lines;
}
function toLeaveType(type: MockLeaveType): LeaveType {
  return {
    id: type.id,
    code: type.code,
    name: type.name,
    description: type.description,
    allowHalfDay: type.allowHalfDay,
    requiresAttachment: type.documentAfterDays === 0,
    minNoticeDays: type.minNoticeDays,
    backdateDays: type.backdateDays,
    maxConsecutiveDays: type.maxConsecutiveDays,
    sandwich: type.sandwich,
    documentAfterDays: type.documentAfterDays,
    negativeDays: halves(type.negativeHalves),
    rules: ruleLines(type),
  };
}

export function toLeaveRequest(request: MockLeaveRequest, actorId: string): LeaveRequest {
  const type = leaveTypes().find((item) => item.id === request.leaveTypeId);
  const today = db().today;
  return {
    id: request.id,
    reference: request.reference,
    leaveType: type?.name ?? "Leave",
    leaveTypeCode: type?.code ?? "",
    startDate: request.startDate,
    endDate: request.endDate,
    units: halves(request.halves),
    reason: request.reason,
    state: request.state,
    submittedAt: request.submittedAt,
    approver: refById(request.approverId),
    decisionNote: request.decisionNote,
    canCancel:
      request.employeeId === actorId &&
      (request.state === "pending" || (request.state === "approved" && request.startDate > today)),
    version: request.version,
  };
}

export function leaveOverview(actor: MockActor): LeaveOverview {
  requireCapability(actor, "leave.request.self");
  const employee = me(actor);
  const store = db();
  const approver = refById(employee.managerId);
  return {
    balances: balancesFor(employee.id, store.today),
    // Only types the person may use (gender / employment type); probation is checked on submit.
    types: leaveTypes()
      .filter((type) => type.active && (type.entitledHalves === null || balanceTypes(employee).some((item) => item.id === type.id)))
      .map(toLeaveType),
    requests: store.leaveRequests
      .filter((request) => request.employeeId === employee.id)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((request) => toLeaveRequest(request, actor.employeeId)),
    holidays: holidaysFor(employee.location).filter((holiday) => holiday.date >= store.today).slice(0, 8),
    approverPath: approver ? [approver] : [],
  };
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function submitLeave(actor: MockActor, input: LeaveRequestInput & { attachmentName?: string | null }, key: string | undefined) {
  requireCapability(actor, "leave.request.self");
  return idempotent(key, () => {
    const employee = me(actor);
    const store = db();
    const type = leaveTypes().find((item) => item.id === input.leaveTypeId && item.active);
    if (!type) throw problem(422, "UNKNOWN_LEAVE_TYPE", "Choose a valid leave type.", { fieldErrors: { leaveTypeId: "Choose a valid leave type." } });
    const ineligible = eligibilityProblem(employee, type, input.startDate);
    if (ineligible) throw problem(422, "NOT_ELIGIBLE", ineligible, { fieldErrors: { leaveTypeId: ineligible } });
    if (input.portion !== "full" && (!type.allowHalfDay || input.startDate !== input.endDate))
      throw problem(422, "HALF_DAY_NOT_ALLOWED", "Half days apply to a single day of a leave type that allows them.", {
        fieldErrors: { portion: "Half days need a single date and a type that allows them." },
      });
    const units = chargeableFor(employee, type, input.startDate, input.endDate, input.portion);
    if (units === 0)
      throw problem(422, "NO_WORKING_DAYS", "Those dates are weekends or holidays — nothing to charge.", {
        fieldErrors: { endDate: "Pick dates that include a working day." },
      });
    const lead = diffDays(store.today, input.startDate);
    if (lead < 0 && -lead > type.backdateDays)
      throw problem(422, "TOO_LATE", type.backdateDays ? `${type.name} can be applied up to ${plural(type.backdateDays, "day")} after the leave.` : `${type.name} can't be applied for past dates.`, {
        fieldErrors: { startDate: type.backdateDays ? `Within the last ${plural(type.backdateDays, "day")}.` : "Choose today or a later date." },
      });
    if (lead >= 0 && lead < type.minNoticeDays)
      throw problem(422, "SHORT_NOTICE", `${type.name} needs ${plural(type.minNoticeDays, "day")} notice — the earliest start is ${formatDate(addDays(store.today, type.minNoticeDays), "medium")}.`, {
        fieldErrors: { startDate: `At least ${plural(type.minNoticeDays, "day")} from today.` },
      });
    if (type.maxConsecutiveDays !== null && units > type.maxConsecutiveDays * 2)
      throw problem(422, "TOO_MANY_DAYS", `${type.name} allows at most ${plural(type.maxConsecutiveDays, "day")} in one request (this is ${halves(units)}${type.sandwich ? ", counting sandwiched off-days" : ""}).`, {
        fieldErrors: { endDate: `At most ${plural(type.maxConsecutiveDays, "consecutive day")}.` },
      });
    const overlapping = store.leaveRequests.find(
      (request) =>
        request.employeeId === employee.id &&
        (request.state === "pending" || request.state === "approved") &&
        request.startDate <= input.endDate &&
        request.endDate >= input.startDate,
    );
    if (overlapping)
      throw problem(409, "LEAVE_OVERLAP", `Overlaps your request ${overlapping.reference}.`, {
        fieldErrors: { startDate: "These dates overlap an existing request." },
      });
    if (type.documentAfterDays !== null && units > type.documentAfterDays * 2 && !input.attachmentName)
      throw problem(422, "DOCUMENT_REQUIRED", type.documentAfterDays === 0 ? `${type.name} needs a supporting document.` : `${type.name} longer than ${plural(type.documentAfterDays, "day")} needs a medical certificate.`, {
        fieldErrors: { attachment: "Attach a PDF or photo of the certificate." },
      });
    if (type.id === "lt_co") {
      const { shortfall } = compOffCredits(employee.id, { startDate: input.startDate, halves: units });
      if (shortfall > 0)
        throw problem(409, "COMP_OFF_INSUFFICIENT", `Not enough comp-off credit valid on ${formatDate(input.startDate, "medium")} (short by ${halves(shortfall)} day${shortfall === 2 ? "" : "s"}). Credits expire ${type.expiryDays ?? 60} days after the day worked.`, {
          fieldErrors: { leaveTypeId: "Not enough live comp-off credit for those dates." },
        });
    } else if (type.entitledHalves !== null) {
      const available = typeLedger(employee, type, input.startDate.slice(0, 4)).available;
      if (units > available + type.negativeHalves)
        throw problem(409, "LEAVE_BALANCE_INSUFFICIENT", type.negativeHalves ? `Leave balance is insufficient, even with the ${halves(type.negativeHalves)}-day negative allowance.` : "Leave balance is insufficient.", {
          fieldErrors: { leaveTypeId: `Only ${signedHalves(available)} days available${type.negativeHalves ? ` (+${halves(type.negativeHalves)} negative allowed)` : ""}.` },
        });
    }
    if (!employee.managerId)
      throw problem(409, "NO_APPROVER", "No approver is configured. HR has been notified.");

    const request: MockLeaveRequest = {
      id: `lr_${store.counter + 1}`,
      reference: nextReference("LV"),
      employeeId: employee.id,
      leaveTypeId: type.id,
      startDate: input.startDate,
      endDate: input.endDate,
      portion: input.portion,
      halves: units,
      reason: input.attachmentName ? `${input.reason} (attached: ${input.attachmentName})` : input.reason,
      state: "pending",
      submittedAt: nowInstant(),
      approverId: employee.managerId,
      decidedAt: null,
      decisionNote: null,
      version: 1,
    };
    store.leaveRequests.push(request);
    return { reference: request.reference, units: halves(units), state: "pending" };
  });
}

export function cancelLeave(actor: MockActor, id: string, expectedVersion: number | undefined) {
  requireCapability(actor, "leave.cancel.self");
  const store = db();
  const request = store.leaveRequests.find((item) => item.id === id && item.employeeId === actor.employeeId);
  if (!request) throw problem(404, "NOT_FOUND", "We couldn't find that request.");
  versionCheck(request.version, expectedVersion);
  if (!toLeaveRequest(request, actor.employeeId).canCancel)
    throw problem(409, "NOT_CANCELLABLE", "This request can no longer be cancelled.");
  request.state = "cancelled";
  request.version += 1;
  return { reference: request.reference, state: "cancelled" };
}

export function leaveTypeName(id: string): string {
  return leaveTypes().find((type) => type.id === id)?.name ?? "Leave";
}

/* Team calendar ------------------------------------------------------------ */

/** Teammates (same manager) plus direct reports. Leave reasons are never exposed. */
export function leaveCalendar(actor: MockActor, month: string): LeaveCalendar {
  requireCapability(actor, "leave.request.self");
  const store = db();
  const employee = me(actor);
  const circle = new Set(
    store.employees
      .filter((person) => person.status !== "exited" && (person.managerId === actor.employeeId || (employee.managerId && person.managerId === employee.managerId) || person.id === actor.employeeId))
      .map((person) => person.id),
  );
  const days = daysInMonth(month).map((date) => ({
    date,
    holiday: isHoliday(date, employee.location) ? (holidayName(date, employee.location) ?? "Holiday") : null,
    away: store.leaveRequests
      .filter((request) => {
        if (!circle.has(request.employeeId) || !(request.state === "approved" || request.state === "pending") || request.startDate > date || request.endDate < date) return false;
        const person = employeeById(request.employeeId);
        return person ? !isOffDay(person, date) : false;
      })
      .flatMap((request) => {
        const person = refById(request.employeeId);
        return person ? [{ person, leaveType: leaveTypeName(request.leaveTypeId), state: request.state === "approved" ? ("approved" as const) : ("pending" as const), half: request.halves === 1 }] : [];
      }),
  }));
  return { month, scope: circle.size > 1 ? "team" : "reports", days };
}

export function allHolidays(actor: MockActor) {
  requireCapability(actor, "leave.request.self");
  return holidaysFor(me(actor).location);
}
