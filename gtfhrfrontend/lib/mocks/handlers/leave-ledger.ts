import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant, type MockLeaveRequest } from "@/lib/mocks/store";
import { isHoliday, leaveTypes } from "@/lib/mocks/handlers/config";
import { isOffDay, isWeekOff } from "@/lib/mocks/handlers/roster";
import { can, idempotent, me, ref, refById, requireCapability, versionCheck, type MockActor } from "@/lib/mocks/handlers/shared";
import { halves, inr } from "@/lib/mocks/seed/random";
import { encashPerDayPaise, type MockCompOffClaim, type MockEncashment, type MockYearEndRow } from "@/lib/mocks/seed/time";
import type { MockLeaveType } from "@/lib/mocks/seed/config";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { addDays, addMonths, diffDays, eachDay, monthOf, zonedInstant } from "@/lib/utils/date";
import { formatDate, formatDateRange, formatDuration, formatMoney } from "@/lib/utils/format";
import type {
  BalanceAdjustmentInput,
  CompOffClaim,
  CompOffClaimInput,
  CompOffEligibleDay,
  CompOffPage,
  DecisionInput,
  EncashInput,
  EncashOption,
  Encashment,
  LeaveLedger,
  LedgerEntry,
  LedgerKind,
  YearEnd,
} from "@/types/leave";

/*
 * Leave ledger engine (mock). Balances are always the sum of ledger rows:
 * stored rows (carry-forward, adjustments, year-end) plus rows derived from
 * policy (accruals), approved requests (availed), approved comp-off claims
 * (credits and expiry lapses) and approved encashments. Nothing is merged.
 */

export const COMP_OFF_CLAIM_WINDOW_DAYS = 30;
const FULL_DAY_MINUTES = 480;
const HALF_DAY_MINUTES = 240;

const dateOf = (instant: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
const minutesOf = (value: string) => {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + m;
};
const days = (value: number) => `${halves(Math.abs(value))} day${Math.abs(value) === 2 ? "" : "s"}`;

function audit(actorName: string, action: string, detail: string) {
  const store = db();
  store.timeAudit.unshift({ id: `ta_${(store.counter += 1)}`, at: nowInstant(), actor: actorName, action, detail });
}
function notify(employeeId: string, title: string, body: string, href: string) {
  const store = db();
  store.notifications.unshift({ id: `nt_${(store.counter += 1)}`, employeeId, title, body, href, createdAt: nowInstant(), read: false, kind: "leave" });
}

/* Eligibility --------------------------------------------------------------- */

function probationEnd(employee: SeedEmployee): string | null {
  const store = db();
  const months = store.probation.get(employee.id) ?? store.config.probationDefaults[employee.type];
  if (months <= 0) return null;
  const [y = 0, m = 1, d = 1] = employee.joinedOn.split("-").map(Number);
  return store.probationConfirmed.get(employee.id) ?? new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

/** Static applicability (gender, employment type): decides whether the type exists for the person. */
export function appliesTo(employee: SeedEmployee, type: MockLeaveType): boolean {
  const gender = db().timeGender[employee.id] ?? "male";
  return type.employmentTypes.includes(employee.type) && (type.gender === "any" || type.gender === gender);
}

/** Why the employee can't use this type on a date, or null. */
export function eligibilityProblem(employee: SeedEmployee, type: MockLeaveType, onDate: string): string | null {
  if (!type.employmentTypes.includes(employee.type)) return `${type.name} isn't available for ${employee.type === "full_time" ? "full-time" : employee.type} employees.`;
  const gender = db().timeGender[employee.id] ?? "male";
  if (type.gender !== "any" && type.gender !== gender) return `${type.name} applies to ${type.gender} employees only.`;
  const probation = probationEnd(employee);
  if (type.afterProbationOnly && probation && probation > onDate) return `${type.name} can be used after probation ends on ${formatDate(probation, "medium")}.`;
  if (type.minServiceDays > 0 && diffDays(employee.joinedOn, onDate) < type.minServiceDays) return `${type.name} needs ${type.minServiceDays} days of service first.`;
  return null;
}

/* Chargeable units ---------------------------------------------------------- */

/** Half-day units a request costs, using the employee's roster week-offs, holidays and the sandwich rule. */
export function chargeableFor(employee: SeedEmployee, type: MockLeaveType | undefined, start: string, end: string, portion: string): number {
  const range = eachDay(start, end);
  const working = range.filter((date) => !isOffDay(employee, date));
  if (working.length === 0) return 0;
  if (range.length === 1 && portion !== "full") return 1;
  if (type?.sandwich) {
    const first = working[0] ?? start;
    const last = working[working.length - 1] ?? end;
    return (diffDays(first, last) + 1) * 2;
  }
  return working.length * 2;
}

/* Accruals ------------------------------------------------------------------ */

interface Row {
  id: string;
  date: string;
  kind: LedgerKind;
  halves: number;
  note: string;
  by: string | null;
  reference: string | null;
  scheduled: boolean;
}

function accrualRows(employee: SeedEmployee, type: MockLeaveType, year: string, throughMonth: number): Row[] {
  if (type.entitledHalves === null || type.accrual === "none" || !appliesTo(employee, type)) return [];
  const yearStart = `${year}-01-01`;
  if (employee.joinedOn > `${year}-12-31`) return [];
  const joinedThisYear = employee.joinedOn > yearStart;
  const joinMonth = joinedThisYear ? Number(employee.joinedOn.slice(5, 7)) + (Number(employee.joinedOn.slice(8)) > 15 ? 1 : 0) : 1;
  const entitled = type.entitledHalves;
  if (type.accrual === "annual_upfront") {
    const months = 13 - joinMonth;
    if (months <= 0) return [];
    const credit = Math.floor((entitled * months) / 12);
    if (credit <= 0) return [];
    return [{ id: `ac_${type.id}_${year}`, date: joinedThisYear ? employee.joinedOn : yearStart, kind: "accrual", halves: credit, note: joinedThisYear ? `Annual entitlement, prorated for ${months} months` : "Annual entitlement credited", by: "Policy", reference: null, scheduled: false }];
  }
  const rows: Row[] = [];
  for (let month = Math.max(joinMonth, 1); month <= Math.min(throughMonth, 12); month += 1) {
    const credit = Math.floor((entitled * month) / 12) - Math.floor((entitled * (month - 1)) / 12);
    if (credit <= 0) continue;
    const mm = String(month).padStart(2, "0");
    rows.push({ id: `ac_${type.id}_${year}${mm}`, date: `${year}-${mm}-01`, kind: "accrual", halves: credit, note: `Monthly credit for ${formatDate(`${year}-${mm}`, "month")}`, by: "Policy", reference: null, scheduled: false });
  }
  return rows;
}

/* Comp-off credits ---------------------------------------------------------- */

interface CreditState {
  claim: MockCompOffClaim;
  halves: number;
  remaining: number;
  lapsed: number;
}

/** FIFO consumption of comp-off credits by earliest expiry; returns shortfall for `extra`. */
export function compOffCredits(employeeId: string, extra?: { startDate: string; halves: number }) {
  const store = db();
  const credits: CreditState[] = store.compOffClaims
    .filter((claim) => claim.employeeId === employeeId && claim.state === "approved" && claim.expiresOn)
    .sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""))
    .map((claim) => ({ claim, halves: claim.portion === "full" ? 2 : 1, remaining: claim.portion === "full" ? 2 : 1, lapsed: 0 }));
  const consume = (startDate: string, need: number) => {
    let left = need;
    for (const credit of credits) {
      if (left <= 0) break;
      if ((credit.claim.expiresOn ?? "") < startDate || credit.remaining <= 0) continue;
      const take = Math.min(credit.remaining, left);
      credit.remaining -= take;
      left -= take;
    }
    return left;
  };
  const leaves = store.leaveRequests
    .filter((request) => request.employeeId === employeeId && request.leaveTypeId === "lt_co" && (request.state === "approved" || request.state === "pending"))
    .sort((a, b) => (a.state === b.state ? a.startDate.localeCompare(b.startDate) : a.state === "approved" ? -1 : 1));
  for (const request of leaves) consume(request.startDate, request.halves);
  const shortfall = extra ? consume(extra.startDate, extra.halves) : 0;
  for (const credit of credits) if ((credit.claim.expiresOn ?? "") < store.today) credit.lapsed = credit.remaining;
  return { credits, shortfall };
}

function compOffRows(employeeId: string, year: string): Row[] {
  const { credits } = compOffCredits(employeeId);
  const rows: Row[] = [];
  for (const credit of credits) {
    const creditDate = dateOf(credit.claim.decidedAt ?? credit.claim.submittedAt);
    if (creditDate.startsWith(year))
      rows.push({ id: `cc_${credit.claim.id}`, date: creditDate, kind: "credit", halves: credit.halves, note: `Worked ${formatDate(credit.claim.workedDate, "weekday")} · expires ${formatDate(credit.claim.expiresOn ?? creditDate, "medium")}`, by: refById(credit.claim.approverId)?.name ?? null, reference: credit.claim.reference, scheduled: false });
    if (credit.lapsed > 0 && (credit.claim.expiresOn ?? "").startsWith(year))
      rows.push({ id: `cl_${credit.claim.id}`, date: addDays(credit.claim.expiresOn ?? creditDate, 1), kind: "lapsed", halves: -credit.lapsed, note: `Unused comp-off from ${formatDate(credit.claim.workedDate, "medium")} expired`, by: "Policy", reference: credit.claim.reference, scheduled: false });
  }
  return rows;
}

/* Ledger -------------------------------------------------------------------- */

function requestNote(request: MockLeaveRequest) {
  return `${formatDateRange(request.startDate, request.endDate)} · ${request.reason}`;
}

export interface TypeLedger {
  rows: (Row & { balance: number })[];
  balance: number;
  credited: number;
  used: number;
  reserved: number;
  available: number;
  encashedThisYear: number;
}

/** Ledger for one employee × type × policy year. `project` accrues through December (year-end preview). */
export function typeLedger(employee: SeedEmployee, type: MockLeaveType, year: string, project = false): TypeLedger {
  const store = db();
  const today = store.today;
  const currentYear = today.slice(0, 4);
  const throughMonth = project || year < currentYear ? 12 : year > currentYear ? 0 : Number(today.slice(5, 7));
  const rows: Row[] = [...accrualRows(employee, type, year, throughMonth)];
  for (const item of store.leaveLedgerEntries)
    if (item.employeeId === employee.id && item.leaveTypeId === type.id && item.date.startsWith(year))
      rows.push({ id: item.id, date: item.date, kind: item.kind, halves: item.halves, note: item.note, by: item.by, reference: item.reference, scheduled: !project && item.date > today });
  if (type.id === "lt_co") rows.push(...compOffRows(employee.id, year));
  const requests = store.leaveRequests.filter((request) => request.employeeId === employee.id && request.leaveTypeId === type.id && request.startDate.startsWith(year));
  for (const request of requests.filter((item) => item.state === "approved"))
    rows.push({ id: `av_${request.id}`, date: request.startDate, kind: "availed", halves: -request.halves, note: requestNote(request), by: refById(request.approverId)?.name ?? null, reference: request.reference, scheduled: false });
  const encashments = store.leaveEncashments.filter((item) => item.employeeId === employee.id && item.leaveTypeId === type.id);
  let encashedThisYear = 0;
  for (const item of encashments) {
    const date = item.decidedAt ? dateOf(item.decidedAt) : dateOf(item.submittedAt);
    if (!date.startsWith(year) && !item.submittedAt.startsWith(year)) continue;
    if (item.source === "request" && (item.state === "approved" || item.state === "pending") && date.startsWith(year)) encashedThisYear += item.halves;
    if (item.state === "approved" && date.startsWith(year))
      rows.push({ id: `en_${item.id}`, date, kind: "encashed", halves: -item.halves, note: `${item.source === "year_end" ? "Year-end encashment" : "Encashed"} · ${formatMoney(inr(item.amountPaise))} in ${formatDate(item.payrollMonth, "month")} payroll`, by: item.decidedBy, reference: item.reference, scheduled: !project && date > today });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || kindOrder(a.kind) - kindOrder(b.kind));
  let running = 0;
  const withBalance = rows.map((row) => {
    if (!row.scheduled) running += row.halves;
    return { ...row, balance: running };
  });
  const counted = rows.filter((row) => !row.scheduled);
  const reserved =
    requests.filter((request) => request.state === "pending").reduce((sum, request) => sum + request.halves, 0) +
    encashments.filter((item) => item.state === "pending").reduce((sum, item) => sum + item.halves, 0);
  return {
    rows: withBalance,
    balance: running,
    credited: counted.filter((row) => row.halves > 0).reduce((sum, row) => sum + row.halves, 0),
    used: -counted.filter((row) => row.kind === "availed").reduce((sum, row) => sum + row.halves, 0),
    reserved,
    available: running - reserved,
    encashedThisYear,
  };
}
const kindOrder = (kind: LedgerKind) => ["opening", "carry_forward", "accrual", "credit", "adjustment", "availed", "encashed", "lapsed"].indexOf(kind);

export function toLedgerEntries(ledger: TypeLedger): LedgerEntry[] {
  return [...ledger.rows].reverse().map((row) => ({ id: row.id, date: row.date, kind: row.kind, units: row.halves < 0 ? `-${halves(-row.halves)}` : halves(row.halves), balance: row.balance < 0 ? `-${halves(-row.balance)}` : halves(row.balance), note: row.note, by: row.by, reference: row.reference, scheduled: row.scheduled }));
}
export const signedHalves = (value: number) => (value < 0 ? `-${halves(-value)}` : halves(value));

/** Types that carry a balance for the person (limited, applicable, or already used). */
export function balanceTypes(employee: SeedEmployee): MockLeaveType[] {
  const store = db();
  return leaveTypes().filter(
    (type) =>
      type.entitledHalves !== null &&
      appliesTo(employee, type) &&
      (type.active || store.leaveRequests.some((request) => request.employeeId === employee.id && request.leaveTypeId === type.id)),
  );
}

export function leaveLedgerFor(actor: MockActor, employeeId: string | undefined, year: string | undefined): LeaveLedger {
  const store = db();
  const targetId = employeeId ?? actor.employeeId;
  if (targetId === actor.employeeId) requireCapability(actor, "leave.request.self");
  else requireCapability(actor, "policy.publish");
  const employee = employeeById(targetId);
  if (!employee) throw problem(404, "NOT_FOUND", "We couldn't find that employee.");
  const policyYear = year && /^\d{4}$/.test(year) ? year : store.today.slice(0, 4);
  return {
    employee: ref(employee),
    year: policyYear,
    types: balanceTypes(employee).map((type) => {
      const ledger = typeLedger(employee, type, policyYear);
      return { leaveTypeId: type.id, name: type.name, code: type.code, balance: signedHalves(ledger.balance), entries: toLedgerEntries(ledger) };
    }),
  };
}

export function adjustBalance(actor: MockActor, input: BalanceAdjustmentInput, key: string | undefined) {
  requireCapability(actor, "policy.publish");
  return idempotent(key, () => {
    const store = db();
    const employee = employeeById(input.employeeId);
    if (!employee || employee.status === "exited") throw problem(422, "INVALID_EMPLOYEE", "Choose an active employee.", { fieldErrors: { employeeId: "Choose an active employee." } });
    if (employee.id === actor.employeeId) throw problem(403, "SELF_ADJUSTMENT", "You can't adjust your own balance — ask another HR admin.");
    const type = leaveTypes().find((item) => item.id === input.leaveTypeId);
    if (!type || type.entitledHalves === null || !appliesTo(employee, type)) throw problem(422, "INVALID_TYPE", "Choose a leave type with a balance for this employee.", { fieldErrors: { leaveTypeId: "Not applicable to this employee." } });
    const units = Math.round(Number(input.days) * 2) * (input.direction === "debit" ? -1 : 1);
    const ledger = typeLedger(employee, type, store.today.slice(0, 4));
    if (units < 0 && ledger.available + units < -type.negativeHalves)
      throw problem(422, "BALANCE_TOO_LOW", `Only ${halves(Math.max(ledger.available, 0))} days are available; a debit can't take ${type.name} below ${type.negativeHalves ? `−${halves(type.negativeHalves)}` : "0"}.`, { fieldErrors: { days: "More than the available balance." } });
    const reference = nextReference("ADJ");
    const actorName = me(actor).name;
    store.leaveLedgerEntries.push({ id: `lg_${store.counter}`, employeeId: employee.id, leaveTypeId: type.id, date: store.today, kind: "adjustment", halves: units, note: input.reason, by: actorName, reference });
    audit(actorName, "Balance adjusted", `${employee.name} · ${type.name} ${units > 0 ? "+" : "−"}${days(units)} · ${input.reason}`);
    notify(employee.id, "Leave balance adjusted", `${type.name} ${units > 0 ? "+" : "−"}${days(units)} by HR: ${input.reason}`, "/leave");
    return { reference, balance: signedHalves(ledger.balance + units) };
  });
}

/* Comp-off ------------------------------------------------------------------ */

function workedOn(employee: SeedEmployee, date: string): { minutes: number; punches: string } | null {
  const store = db();
  const device = store.devicePunches.get(`${employee.id}|${date}`);
  const punch = device?.in && device.out ? { in: device.in, out: device.out } : store.timeOffDayPunches.get(`${employee.id}|${date}`);
  if (!punch) return null;
  return { minutes: Math.max(0, minutesOf(punch.out) - minutesOf(punch.in)), punches: `${punch.in}–${punch.out} (face device)` };
}
function dayKind(employee: SeedEmployee, date: string) {
  if (isHoliday(date, employee.location)) return "Holiday";
  return isWeekOff(employee, date) ? "Week off" : "Working day";
}

function compOffType() {
  return leaveTypes().find((type) => type.id === "lt_co");
}

function toClaim(actor: MockActor, claim: MockCompOffClaim, creditState: Map<string, CreditState>): CompOffClaim | null {
  const employee = employeeById(claim.employeeId);
  if (!employee) return null;
  const credit = creditState.get(claim.id);
  const today = db().today;
  return {
    id: claim.id,
    reference: claim.reference,
    person: ref(employee),
    workedDate: claim.workedDate,
    dayKind: dayKind(employee, claim.workedDate),
    portion: claim.portion,
    units: claim.portion === "full" ? "1" : "0.5",
    workedMinutes: claim.workedMinutes,
    punches: workedOn(employee, claim.workedDate)?.punches ?? `${formatDuration(claim.workedMinutes)} logged`,
    reason: claim.reason,
    state: claim.state,
    submittedAt: claim.submittedAt,
    approver: refById(claim.approverId),
    decisionNote: claim.decisionNote,
    expiresOn: claim.expiresOn,
    credit: claim.state !== "approved" || !credit ? null : credit.lapsed > 0 ? "lapsed" : credit.remaining === 0 ? "used" : credit.remaining < credit.halves ? "partly_used" : (claim.expiresOn ?? "") < today ? "lapsed" : "active",
    canDecide: claim.state === "pending" && claim.approverId === actor.employeeId && claim.employeeId !== actor.employeeId && can(actor, "approval.decide"),
    canCancel: claim.state === "pending" && claim.employeeId === actor.employeeId,
    version: claim.version,
  };
}

function eligibleDays(employee: SeedEmployee): CompOffEligibleDay[] {
  const store = db();
  const claimed = new Set(store.compOffClaims.filter((claim) => claim.employeeId === employee.id && (claim.state === "pending" || claim.state === "approved")).map((claim) => claim.workedDate));
  const result: CompOffEligibleDay[] = [];
  for (let back = 1; back <= COMP_OFF_CLAIM_WINDOW_DAYS; back += 1) {
    const date = addDays(store.today, -back);
    if (date < employee.joinedOn || claimed.has(date) || !isOffDay(employee, date)) continue;
    const worked = workedOn(employee, date);
    if (!worked || worked.minutes < HALF_DAY_MINUTES) continue;
    result.push({ date, dayKind: dayKind(employee, date), workedMinutes: worked.minutes, punches: worked.punches, maxPortion: worked.minutes >= FULL_DAY_MINUTES ? "full" : "half" });
  }
  return result;
}

/** Payroll month an approval made today lands in (cut-off on the 20th). */
export function payrollTargetMonth(today: string) {
  return Number(today.slice(8)) <= 20 ? monthOf(today) : addMonths(monthOf(today), 1);
}

function encashOptions(employee: SeedEmployee): EncashOption[] {
  const year = db().today.slice(0, 4);
  const perDay = encashPerDayPaise(employee);
  return balanceTypes(employee)
    .filter((type) => type.encashable && type.active && !eligibilityProblem(employee, type, db().today))
    .map((type) => {
      const ledger = typeLedger(employee, type, year);
      const remaining = Math.max(type.maxEncashHalves - ledger.encashedThisYear, 0);
      const byBalance = Math.max(ledger.available - type.minRetainHalves, 0);
      const maxNow = Math.floor(Math.min(remaining, byBalance) / 2) * 2;
      return { leaveTypeId: type.id, name: type.name, available: signedHalves(ledger.available), retain: halves(type.minRetainHalves), remainingThisYear: halves(remaining), maxNow: halves(maxNow), perDay: inr(perDay) };
    });
}

function toEncashment(actor: MockActor, item: MockEncashment): Encashment | null {
  const employee = employeeById(item.employeeId);
  if (!employee) return null;
  return {
    id: item.id,
    reference: item.reference,
    person: ref(employee),
    leaveType: leaveTypes().find((type) => type.id === item.leaveTypeId)?.name ?? "Leave",
    units: halves(item.halves),
    perDay: inr(item.perDayPaise),
    amount: inr(item.amountPaise),
    payrollMonth: item.payrollMonth,
    source: item.source,
    reason: item.reason,
    state: item.state,
    submittedAt: item.submittedAt,
    decidedBy: item.decidedBy,
    decisionNote: item.decisionNote,
    canDecide: item.state === "pending" && can(actor, "employee.update") && item.employeeId !== actor.employeeId,
    canCancel: item.state === "pending" && item.employeeId === actor.employeeId,
    version: item.version,
  };
}

export function compOffPage(actor: MockActor): CompOffPage {
  requireCapability(actor, "leave.request.self");
  const store = db();
  const employee = me(actor);
  const type = compOffType();
  const credits = new Map<string, CreditState>();
  const creditCache = new Map<string, ReturnType<typeof compOffCredits>>();
  const creditsOf = (id: string) => {
    let value = creditCache.get(id);
    if (!value) {
      value = compOffCredits(id);
      creditCache.set(id, value);
      for (const credit of value.credits) credits.set(credit.claim.id, credit);
    }
    return value;
  };
  const mineCredits = creditsOf(employee.id);
  const live = mineCredits.credits.filter((credit) => credit.remaining > 0 && (credit.claim.expiresOn ?? "") >= store.today);
  const team = store.compOffClaims.filter((claim) => claim.approverId === actor.employeeId && claim.employeeId !== actor.employeeId);
  for (const claim of team) creditsOf(claim.employeeId);
  const coLedger = type ? typeLedger(employee, type, store.today.slice(0, 4)) : null;
  const rank = (state: string) => (state === "pending" ? 0 : 1);
  return {
    today: store.today,
    expiryDays: type?.expiryDays ?? 60,
    claimWindowDays: COMP_OFF_CLAIM_WINDOW_DAYS,
    balance: coLedger ? signedHalves(coLedger.available) : "0",
    nextExpiry: live[0] ? { date: live[0].claim.expiresOn ?? store.today, units: halves(live[0].remaining) } : null,
    eligibleDays: eligibleDays(employee),
    mine: store.compOffClaims
      .filter((claim) => claim.employeeId === employee.id)
      .sort((a, b) => b.workedDate.localeCompare(a.workedDate))
      .map((claim) => toClaim(actor, claim, credits))
      .filter((claim): claim is CompOffClaim => claim !== null),
    team: team
      .sort((a, b) => rank(a.state) - rank(b.state) || b.submittedAt.localeCompare(a.submittedAt))
      .map((claim) => toClaim(actor, claim, credits))
      .filter((claim): claim is CompOffClaim => claim !== null),
    encashOptions: encashOptions(employee),
    encashments: store.leaveEncashments
      .filter((item) => item.employeeId === employee.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((item) => toEncashment(actor, item))
      .filter((item): item is Encashment => item !== null),
    encashQueue: can(actor, "employee.update")
      ? store.leaveEncashments
          .filter((item) => item.employeeId !== actor.employeeId && (item.state === "pending" || item.submittedAt >= zonedInstant(addDays(store.today, -60), "00:00")))
          .sort((a, b) => rank(a.state) - rank(b.state) || b.submittedAt.localeCompare(a.submittedAt))
          .map((item) => toEncashment(actor, item))
          .filter((item): item is Encashment => item !== null)
      : null,
    payrollMonth: payrollTargetMonth(store.today),
  };
}

export function claimCompOff(actor: MockActor, input: CompOffClaimInput, key: string | undefined) {
  requireCapability(actor, "leave.request.self");
  return idempotent(key, () => {
    const store = db();
    const employee = me(actor);
    const type = compOffType();
    if (!type?.active) throw problem(409, "COMP_OFF_DISABLED", "Comp-off isn't enabled in the leave policy.");
    const field = (message: string, name = "workedDate") => ({ fieldErrors: { [name]: message } });
    if (input.workedDate >= store.today) throw problem(422, "NOT_YET_WORKED", "Claim comp-off after the day is over.", field("Choose a past date."));
    if (input.workedDate < addDays(store.today, -COMP_OFF_CLAIM_WINDOW_DAYS))
      throw problem(422, "CLAIM_WINDOW_CLOSED", `Comp-off must be claimed within ${COMP_OFF_CLAIM_WINDOW_DAYS} days of the day worked.`, field(`Within the last ${COMP_OFF_CLAIM_WINDOW_DAYS} days.`));
    if (input.workedDate < employee.joinedOn) throw problem(422, "BEFORE_JOINING", "That's before your joining date.", field("After your joining date."));
    if (!isOffDay(employee, input.workedDate))
      throw problem(422, "WORKING_DAY", "That was a working day on your roster. Extra hours on working days count as overtime, not comp-off.", field("Pick a week-off or holiday you worked."));
    const duplicate = store.compOffClaims.find((claim) => claim.employeeId === employee.id && claim.workedDate === input.workedDate && (claim.state === "pending" || claim.state === "approved"));
    if (duplicate) throw problem(409, "ALREADY_CLAIMED", `You've already claimed comp-off for that day (${duplicate.reference}).`, field("Already claimed."));
    const worked = workedOn(employee, input.workedDate);
    if (!worked)
      throw problem(422, "NO_PUNCHES", "No attendance punches were found for that day. Ask HR to import the device log, or raise a regularization first.", field("No punches recorded."));
    if (worked.minutes < HALF_DAY_MINUTES)
      throw problem(422, "NOT_ENOUGH_HOURS", `You worked ${formatDuration(worked.minutes)} — at least 4 h is needed for a half-day comp-off.`, field("Less than 4 hours worked."));
    if (input.portion === "full" && worked.minutes < FULL_DAY_MINUTES)
      throw problem(422, "HALF_DAY_ONLY", `You worked ${formatDuration(worked.minutes)} — a full-day comp-off needs 8 h. Claim a half day instead.`, field("Only a half day is eligible.", "portion"));
    if (!employee.managerId) throw problem(409, "NO_APPROVER", "No approver is configured. HR has been notified.");
    const reference = nextReference("CO");
    store.compOffClaims.unshift({ id: `co_${store.counter}`, reference, employeeId: employee.id, workedDate: input.workedDate, portion: input.portion, workedMinutes: worked.minutes, reason: input.reason, state: "pending", approverId: employee.managerId, submittedAt: nowInstant(), decidedAt: null, decisionNote: null, expiresOn: null, version: 1 });
    notify(employee.managerId, "Comp-off claim to review", `${employee.name} worked ${formatDate(input.workedDate, "weekday")} (${formatDuration(worked.minutes)}).`, "/leave/comp-off");
    return { reference, state: "pending", units: input.portion === "full" ? "1" : "0.5" };
  });
}

export function decideCompOff(actor: MockActor, input: DecisionInput) {
  requireCapability(actor, "approval.decide");
  const store = db();
  const claim = store.compOffClaims.find((item) => item.id === input.id);
  if (!claim || claim.approverId !== actor.employeeId) throw problem(404, "NOT_FOUND", "This claim isn't assigned to you.");
  if (claim.employeeId === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't approve your own claim.");
  if (claim.state !== "pending") throw problem(409, "ALREADY_DECIDED", "This claim was already decided.");
  versionCheck(claim.version, input.version);
  const type = compOffType();
  const approve = input.decision === "approve";
  claim.state = approve ? "approved" : "rejected";
  claim.decidedAt = nowInstant();
  claim.decisionNote = input.note || null;
  claim.expiresOn = approve ? addDays(claim.workedDate, type?.expiryDays ?? 60) : null;
  claim.version += 1;
  const person = employeeById(claim.employeeId);
  const actorName = me(actor).name;
  audit(actorName, approve ? "Comp-off approved" : "Comp-off rejected", `${person?.name ?? claim.employeeId} · ${formatDate(claim.workedDate, "medium")} · ${claim.portion === "full" ? "1 day" : "0.5 day"}`);
  notify(claim.employeeId, approve ? "Comp-off approved" : "Comp-off rejected", approve ? `${claim.portion === "full" ? "1 day" : "Half a day"} credited; use it by ${formatDate(claim.expiresOn ?? store.today, "medium")}.` : (input.note || "Your manager rejected the claim."), "/leave/comp-off");
  return { reference: claim.reference, state: claim.state, expiresOn: claim.expiresOn };
}

export function cancelCompOff(actor: MockActor, id: string) {
  requireCapability(actor, "leave.request.self");
  const claim = db().compOffClaims.find((item) => item.id === id && item.employeeId === actor.employeeId);
  if (!claim) throw problem(404, "NOT_FOUND", "We couldn't find that claim.");
  if (claim.state !== "pending") throw problem(409, "NOT_CANCELLABLE", "Only pending claims can be withdrawn.");
  claim.state = "cancelled";
  claim.version += 1;
  return { reference: claim.reference, state: claim.state };
}

/* Encashment ---------------------------------------------------------------- */

export function requestEncashment(actor: MockActor, input: EncashInput, key: string | undefined) {
  requireCapability(actor, "leave.request.self");
  return idempotent(key, () => {
    const store = db();
    const employee = me(actor);
    const type = leaveTypes().find((item) => item.id === input.leaveTypeId && item.active);
    if (!type || !type.encashable) throw problem(422, "NOT_ENCASHABLE", "That leave type can't be encashed.", { fieldErrors: { leaveTypeId: "Choose an encashable type." } });
    const blocked = eligibilityProblem(employee, type, store.today);
    if (blocked) throw problem(422, "NOT_ELIGIBLE", blocked, { fieldErrors: { leaveTypeId: blocked } });
    if (store.leaveEncashments.some((item) => item.employeeId === employee.id && item.leaveTypeId === type.id && item.state === "pending"))
      throw problem(409, "ENCASH_PENDING", "You already have an encashment request awaiting HR. Withdraw it or wait for the decision.");
    const units = input.days * 2;
    const ledger = typeLedger(employee, type, store.today.slice(0, 4));
    const remaining = Math.max(type.maxEncashHalves - ledger.encashedThisYear, 0);
    if (units > remaining)
      throw problem(422, "ENCASH_LIMIT", `The policy allows ${halves(type.maxEncashHalves)} days a year; you can encash ${halves(remaining)} more.`, { fieldErrors: { days: `At most ${halves(remaining)} days.` } });
    if (ledger.available - units < type.minRetainHalves) {
      const max = Math.max(Math.floor((ledger.available - type.minRetainHalves) / 2), 0);
      throw problem(422, "RETAIN_BALANCE", `You must keep at least ${halves(type.minRetainHalves)} days of ${type.name}. With ${signedHalves(ledger.available)} available you can encash up to ${max} day${max === 1 ? "" : "s"}.`, { fieldErrors: { days: `Up to ${max} days.` } });
    }
    const perDay = encashPerDayPaise(employee);
    if (perDay <= 0) throw problem(409, "NO_SALARY", "No salary is on record yet; Payroll must set your compensation first.");
    const reference = nextReference("EN");
    store.leaveEncashments.unshift({ id: `en_${store.counter}`, reference, employeeId: employee.id, leaveTypeId: type.id, halves: units, perDayPaise: perDay, amountPaise: perDay * input.days, payrollMonth: payrollTargetMonth(store.today), source: "request", reason: input.reason, state: "pending", submittedAt: nowInstant(), decidedBy: null, decidedAt: null, decisionNote: null, version: 1 });
    return { reference, amount: formatMoney(inr(perDay * input.days)) };
  });
}

export function decideEncashment(actor: MockActor, input: DecisionInput) {
  requireCapability(actor, "employee.update");
  const store = db();
  const item = store.leaveEncashments.find((row) => row.id === input.id);
  if (!item) throw problem(404, "NOT_FOUND", "That encashment request no longer exists.");
  if (item.employeeId === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't approve your own encashment.");
  if (item.state !== "pending") throw problem(409, "ALREADY_DECIDED", "This request was already decided.");
  versionCheck(item.version, input.version);
  const employee = employeeById(item.employeeId);
  const type = leaveTypes().find((row) => row.id === item.leaveTypeId);
  if (!employee || !type) throw problem(404, "NOT_FOUND", "That encashment request no longer exists.");
  const approve = input.decision === "approve";
  if (approve) {
    // Re-check at decision time: the pending request is already reserved in `available`.
    const ledger = typeLedger(employee, type, store.today.slice(0, 4));
    if (ledger.available < type.minRetainHalves)
      throw problem(409, "RETAIN_BALANCE", `${employee.name} would keep less than ${halves(type.minRetainHalves)} days after this encashment. Reject it or ask for fewer days.`);
    item.payrollMonth = payrollTargetMonth(store.today);
  }
  const actorName = me(actor).name;
  item.state = approve ? "approved" : "rejected";
  item.decidedAt = nowInstant();
  item.decidedBy = actorName;
  item.decisionNote = input.note || null;
  item.version += 1;
  audit(actorName, approve ? "Encashment approved" : "Encashment rejected", `${employee.name} · ${type.name} ${days(item.halves)} · ${formatMoney(inr(item.amountPaise))}${approve ? ` → ${formatDate(item.payrollMonth, "month")} payroll` : ""}`);
  notify(employee.id, approve ? "Leave encashment approved" : "Leave encashment rejected", approve ? `${formatMoney(inr(item.amountPaise))} will be paid with ${formatDate(item.payrollMonth, "month")} payroll.` : (input.note || "HR rejected the request."), "/leave/comp-off");
  return { reference: item.reference, state: item.state, payrollMonth: item.payrollMonth };
}

export function cancelEncashment(actor: MockActor, id: string) {
  requireCapability(actor, "leave.request.self");
  const item = db().leaveEncashments.find((row) => row.id === id && row.employeeId === actor.employeeId);
  if (!item) throw problem(404, "NOT_FOUND", "We couldn't find that request.");
  if (item.state !== "pending") throw problem(409, "NOT_CANCELLABLE", "Only pending requests can be withdrawn.");
  item.state = "cancelled";
  item.version += 1;
  return { reference: item.reference, state: item.state };
}

/* Year-end processing -------------------------------------------------------- */

function yearEndTypes() {
  return leaveTypes().filter((type) => type.entitledHalves !== null && type.accrual !== "none" && type.gender === "any" && type.expiryDays === null && !type.countsAsPresent);
}

function computeYearEnd(year: string): MockYearEndRow[] {
  const store = db();
  const rows: MockYearEndRow[] = [];
  for (const employee of store.employees) {
    if (employee.status === "exited" || employee.joinedOn > `${year}-12-31`) continue;
    for (const type of yearEndTypes()) {
      if (!appliesTo(employee, type)) continue;
      const ledger = typeLedger(employee, type, year, true);
      const closing = ledger.balance - ledger.reserved;
      if (closing === 0) continue;
      const carry = closing <= 0 ? closing : Math.min(closing, type.carryForwardHalves);
      const rest = Math.max(closing - carry, 0);
      const encashRoom = Math.max(type.maxEncashHalves - ledger.encashedThisYear, 0);
      const encash = type.encashable ? Math.floor(Math.min(rest, encashRoom) / 2) * 2 : 0;
      rows.push({ employeeId: employee.id, leaveTypeId: type.id, closing, carry, encash, encashPaise: (encash / 2) * encashPerDayPaise(employee), lapse: rest - encash });
    }
  }
  return rows;
}

export function yearEnd(actor: MockActor): YearEnd {
  requireCapability(actor, "policy.publish");
  const store = db();
  const year = store.today.slice(0, 4);
  const run = store.leaveYearEndRuns.find((item) => item.year === year);
  const rows = run ? run.rows : computeYearEnd(year);
  const sum = (pick: (row: MockYearEndRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const last = [...store.leaveYearEndRuns].sort((a, b) => b.year.localeCompare(a.year))[0];
  return {
    year,
    asOf: store.today,
    state: run ? "committed" : "preview",
    rows: rows.flatMap((row) => {
      const employee = employeeById(row.employeeId);
      const type = leaveTypes().find((item) => item.id === row.leaveTypeId);
      if (!employee || !type) return [];
      return [{ person: ref(employee), department: employee.department, leaveType: type.name, closing: signedHalves(row.closing), carryForward: signedHalves(row.carry), encash: halves(row.encash), encashAmount: inr(row.encashPaise), lapse: halves(row.lapse) }];
    }),
    totals: { carryForward: signedHalves(sum((row) => row.carry)), encash: halves(sum((row) => row.encash)), encashAmount: inr(sum((row) => row.encashPaise)), lapse: halves(sum((row) => row.lapse)), employees: new Set(rows.map((row) => row.employeeId)).size },
    lastRun: last ? { year: last.year, at: last.at, by: last.by, rows: last.totals.rows, carryForward: halves(last.totals.carry), encash: halves(last.totals.encash), lapse: halves(last.totals.lapse) } : null,
    audit: store.timeAudit.slice(0, 12).map((item) => ({ ...item })),
  };
}

export function commitYearEnd(actor: MockActor, year: string, key: string | undefined) {
  requireCapability(actor, "policy.publish");
  return idempotent(key, () => {
    const store = db();
    if (year !== store.today.slice(0, 4)) throw problem(422, "WRONG_YEAR", `Only the current policy year (${store.today.slice(0, 4)}) can be processed.`);
    const existing = store.leaveYearEndRuns.find((item) => item.year === year);
    if (existing) throw problem(409, "ALREADY_PROCESSED", `Year-end ${year} was already processed by ${existing.by}. It runs once per year.`);
    const rows = computeYearEnd(year);
    const actorName = me(actor).name;
    const yearEndDate = `${year}-12-31`;
    const nextYear = String(Number(year) + 1);
    for (const row of rows) {
      const type = leaveTypes().find((item) => item.id === row.leaveTypeId);
      const employee = employeeById(row.employeeId);
      if (!type || !employee) continue;
      if (row.lapse > 0) store.leaveLedgerEntries.push({ id: `lg_${(store.counter += 1)}`, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, date: yearEndDate, kind: "lapsed", halves: -row.lapse, note: `Year-end ${year}: above carry-forward and encashment limits`, by: actorName, reference: `YE-${year}` });
      if (row.encash > 0)
        store.leaveEncashments.push({ id: `en_${(store.counter += 1)}`, reference: nextReference("EN"), employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, halves: row.encash, perDayPaise: encashPerDayPaise(employee), amountPaise: row.encashPaise, payrollMonth: `${nextYear}-01`, source: "year_end", reason: `Year-end ${year} auto-encashment`, state: "approved", submittedAt: nowInstant(), decidedBy: actorName, decidedAt: zonedInstant(yearEndDate, "23:00"), decisionNote: null, version: 1 });
      if (row.carry !== 0) store.leaveLedgerEntries.push({ id: `lg_${(store.counter += 1)}`, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, date: `${nextYear}-01-01`, kind: "carry_forward", halves: row.carry, note: `Carried forward from ${year}`, by: actorName, reference: `YE-${year}` });
    }
    const totals = { carry: rows.reduce((s, r) => s + r.carry, 0), encash: rows.reduce((s, r) => s + r.encash, 0), lapse: rows.reduce((s, r) => s + r.lapse, 0), rows: rows.length };
    store.leaveYearEndRuns.push({ year, at: nowInstant(), by: actorName, rows, totals });
    audit(actorName, "Year-end processed", `${year}: carry forward ${halves(Math.max(totals.carry, 0))} days, encash ${halves(totals.encash)} days, lapse ${halves(totals.lapse)} days across ${totals.rows} balances`);
    return { year, rows: rows.length };
  });
}

/** Employees HR can pick for ledger review/adjustment. */
export function ledgerPeople() {
  return db()
    .employees.filter((employee) => employee.status !== "exited")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(ref);
}

