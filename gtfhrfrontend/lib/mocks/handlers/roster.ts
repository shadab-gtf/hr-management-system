import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant } from "@/lib/mocks/store";
import { holidayName, isHoliday, leaveTypes, shiftFor } from "@/lib/mocks/handlers/config";
import { can, directReports, idempotent, me, ref, requireCapability, versionCheck, type MockActor } from "@/lib/mocks/handlers/shared";
import { mondayOf, type MockRosterWeek, type MockShiftSwap, type MockWeeklyOff, type RosterCells } from "@/lib/mocks/seed/time";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import type { ShiftConfig } from "@/types/hr-config";
import { addDays, daysInMonth, diffDays, weekday } from "@/lib/utils/date";
import { formatDate } from "@/lib/utils/format";
import type {
  MyRoster,
  RosterDay,
  RosterPatternInput,
  RosterPlanner,
  RosterShiftOption,
  ShiftSwap,
  ShiftSwapInput,
  WeeklyOffInput,
  WeeklyOffRule,
} from "@/types/attendance";
import type { DecisionInput } from "@/types/leave";

/*
 * Shift roster engine. Resolution order for a day: published roster cell →
 * department weekly-off rule + department shift → default shift. Drafts are
 * never visible to employees and never affect attendance.
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_OFF: MockWeeklyOff = { offWeekdays: [0, 6], alternateSaturdays: false };

export function weeklyOffFor(department: string): MockWeeklyOff {
  return db().rosterWeeklyOffs[department] ?? DEFAULT_OFF;
}
function describeWeeklyOff(rule: MockWeeklyOff): string {
  const days = [...rule.offWeekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((day) => DAY_NAMES[day]);
  const text = days.length ? days.join(" & ") : "No fixed day";
  return rule.alternateSaturdays && !rule.offWeekdays.includes(6) ? `${text} + 2nd & 4th Saturday` : text;
}
export function weeklyOffRule(department: string): WeeklyOffRule {
  const rule = weeklyOffFor(department);
  return { department, offWeekdays: [...rule.offWeekdays], alternateSaturdays: rule.alternateSaturdays, label: describeWeeklyOff(rule) };
}

/** Department rule only (no roster). */
export function isDepartmentWeekOff(department: string, date: string): boolean {
  const rule = weeklyOffFor(department);
  const day = weekday(date);
  if (rule.offWeekdays.includes(day)) return true;
  if (day === 6 && rule.alternateSaturdays) {
    const nth = Math.ceil(Number(date.slice(8)) / 7);
    return nth === 2 || nth === 4;
  }
  return false;
}

function weekRecord(department: string, weekStart: string): MockRosterWeek | undefined {
  return db().rosterWeeks.find((week) => week.department === department && week.weekStart === weekStart);
}
function publishedCell(employee: SeedEmployee, date: string): string | null {
  const week = weekRecord(employee.department, mondayOf(date));
  return week?.published?.[employee.id]?.[diffDays(week.weekStart, date)] ?? null;
}

export interface DayPlan {
  shift: ShiftConfig | null;
  weekOff: boolean;
  source: "roster" | "department" | "default";
}

/** The employee's plan for a date, as the attendance engine sees it. */
export function dayPlan(employee: SeedEmployee, date: string): DayPlan {
  const store = db();
  const cell = publishedCell(employee, date);
  if (cell === "off") return { shift: null, weekOff: true, source: "roster" };
  const rostered = cell ? store.config.shifts.find((item) => item.id === cell) : undefined;
  if (rostered) return { shift: rostered, weekOff: false, source: "roster" };
  const source = store.config.departmentShifts[employee.department] ? "department" : "default";
  if (isDepartmentWeekOff(employee.department, date)) return { shift: null, weekOff: true, source };
  return { shift: shiftFor(employee), weekOff: false, source };
}
/** Shift used for timing checks; week-off days fall back to the department shift. */
export function shiftOn(employee: SeedEmployee, date: string): ShiftConfig {
  return dayPlan(employee, date).shift ?? shiftFor(employee);
}
export function isWeekOff(employee: SeedEmployee, date: string): boolean {
  return dayPlan(employee, date).weekOff;
}
/** Week-off or paid holiday for the employee. */
export function isOffDay(employee: SeedEmployee, date: string): boolean {
  return isWeekOff(employee, date) || isHoliday(date, employee.location);
}

const shortName = (name: string) => name.replace(/shift/i, "").trim().slice(0, 3).toUpperCase() || "SH";
function shiftOptions(): RosterShiftOption[] {
  return db().config.shifts.map((item) => ({ id: item.id, name: item.name, start: item.start, end: item.end, short: shortName(item.name) }));
}
function shiftLabel(id: string | null, employee: SeedEmployee, date: string): string {
  if (id === "off") return "Week off";
  const shift = id ? db().config.shifts.find((item) => item.id === id) : null;
  if (shift) return shift.name;
  return isDepartmentWeekOff(employee.department, date) ? "Week off" : shiftFor(employee).name;
}
function leaveOn(employeeId: string, date: string): string | null {
  const request = db().leaveRequests.find((item) => item.employeeId === employeeId && item.state === "approved" && item.startDate <= date && item.endDate >= date);
  return request ? (leaveTypes().find((type) => type.id === request.leaveTypeId)?.name ?? "Leave") : null;
}

function rosterDay(employee: SeedEmployee, date: string): RosterDay {
  const plan = dayPlan(employee, date);
  const holiday = isHoliday(date, employee.location) ? (holidayName(date, employee.location) ?? "Holiday") : null;
  return {
    date,
    shift: plan.shift && !plan.weekOff ? { id: plan.shift.id, name: plan.shift.name, start: plan.shift.start, end: plan.shift.end, short: shortName(plan.shift.name) } : null,
    weekOff: plan.weekOff,
    holiday,
    onLeave: leaveOn(employee.id, date),
    source: plan.source,
  };
}

/* Swaps -------------------------------------------------------------------- */

function canDecideSwap(actor: MockActor, requester: SeedEmployee | undefined) {
  return Boolean(requester && requester.id !== actor.employeeId && (requester.managerId === actor.employeeId || can(actor, "employee.update")));
}
function toSwap(actor: MockActor, swap: MockShiftSwap): ShiftSwap | null {
  const requester = employeeById(swap.requesterId);
  const colleague = employeeById(swap.colleagueId);
  if (!requester || !colleague) return null;
  return {
    id: swap.id,
    reference: swap.reference,
    requester: ref(requester),
    colleague: ref(colleague),
    date: swap.date,
    requesterShift: swap.requesterShift,
    colleagueShift: swap.colleagueShift,
    reason: swap.reason,
    state: swap.state,
    submittedAt: swap.submittedAt,
    decisionNote: swap.decisionNote,
    canDecide: swap.state === "pending" && canDecideSwap(actor, requester),
    version: swap.version,
  };
}

/* Employee view ------------------------------------------------------------ */

export function myRoster(actor: MockActor, view: "week" | "month", anchor: string): MyRoster {
  requireCapability(actor, "attendance.read.self");
  const store = db();
  const employee = me(actor);
  const dates = view === "week" ? Array.from({ length: 7 }, (_, index) => addDays(mondayOf(anchor), index)) : daysInMonth(anchor.slice(0, 7));
  const label = view === "week" ? `${formatDate(dates[0] ?? anchor, "short")} – ${formatDate(dates[6] ?? anchor, "medium")}` : formatDate(anchor.slice(0, 7), "month");
  const colleagues = store.employees.filter((person) => person.department === employee.department && person.id !== employee.id && person.status !== "exited");
  // Swap options: the next 14 days that have a published roster week.
  const swapOptions = Array.from({ length: 14 }, (_, index) => addDays(store.today, index + 1))
    .filter((date) => weekRecord(employee.department, mondayOf(date))?.published)
    .map((date) => {
      const mine = shiftLabel(publishedCell(employee, date), employee, date);
      return {
        date,
        mine,
        colleagues: colleagues
          .map((person) => ({ id: person.id, name: person.name, shift: shiftLabel(publishedCell(person, date), person, date) }))
          .filter((person) => person.shift !== mine),
      };
    })
    .filter((option) => option.colleagues.length > 0);
  return {
    view,
    anchor: dates[0] ?? anchor,
    label,
    department: employee.department,
    days: dates.map((date) => rosterDay(employee, date)),
    weeklyOff: weeklyOffRule(employee.department),
    swaps: store.rosterSwaps
      .filter((swap) => swap.requesterId === employee.id || swap.colleagueId === employee.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((swap) => toSwap(actor, swap))
      .filter((swap): swap is ShiftSwap => swap !== null),
    swapOptions,
  };
}

/* Planner ------------------------------------------------------------------ */

function plannerScope(actor: MockActor) {
  requireCapability(actor, "roster.manage");
  const store = db();
  const everyone = can(actor, "policy.publish") || can(actor, "employee.update");
  const reports = directReports(actor.employeeId);
  const departments = everyone ? store.config.departments.map((item) => item.name) : [...new Set(reports.map((person) => person.department))];
  const members = (department: string) =>
    (everyone ? store.employees.filter((person) => person.department === department && person.status !== "exited") : reports.filter((person) => person.department === department)).sort((a, b) => a.name.localeCompare(b.name));
  return { everyone, departments, members };
}

function effectiveCells(cells: RosterCells | null | undefined, employee: SeedEmployee, dates: string[]) {
  return dates.map((date, index) => shiftLabel(cells?.[employee.id]?.[index] ?? null, employee, date));
}

export function rosterPlanner(actor: MockActor, department: string | undefined, weekStart: string | undefined): RosterPlanner {
  const scope = plannerScope(actor);
  const store = db();
  const chosen = department && scope.departments.includes(department) ? department : (scope.departments.includes("Design") ? "Design" : scope.departments[0]);
  if (!chosen) throw problem(404, "NO_TEAM", "You don't manage anyone with a roster yet.");
  const start = mondayOf(weekStart ?? store.today);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const week = weekRecord(chosen, start);
  const people = scope.members(chosen);
  const status: RosterPlanner["status"] = !week ? "none" : !week.published ? "draft" : JSON.stringify(week.published) === JSON.stringify(week.draft) ? "published" : "changes";
  const sample = people[0];
  const inScopeIds = new Set(people.map((person) => person.id));
  return {
    department: chosen,
    departments: scope.departments,
    weekStart: start,
    dates,
    status,
    publishedAt: week?.publishedAt ?? null,
    publishedBy: week?.publishedBy ?? null,
    version: week?.version ?? 0,
    shifts: shiftOptions(),
    departmentShift: sample ? shiftFor(sample).name : shiftFor({ department: chosen }).name,
    rows: people.map((person) => ({
      person: ref(person),
      cells: dates.map((_, index) => week?.draft[person.id]?.[index] ?? null),
      effective: effectiveCells(week?.published, person, dates),
      leave: dates.map((date) => leaveOn(person.id, date)),
    })),
    holidays: dates.map((date) => (isHoliday(date) ? (holidayName(date) ?? "Holiday") : null)),
    weeklyOff: weeklyOffRule(chosen),
    swapQueue: store.rosterSwaps
      .filter((swap) => swap.state === "pending" && inScopeIds.has(swap.requesterId))
      .map((swap) => toSwap(actor, swap))
      .filter((swap): swap is ShiftSwap => swap !== null),
    canEditWeeklyOff: can(actor, "policy.publish"),
  };
}

function ensureWeek(department: string, weekStart: string): MockRosterWeek {
  const store = db();
  let week = weekRecord(department, weekStart);
  if (!week) {
    week = { department, weekStart, draft: {}, published: null, publishedAt: null, publishedBy: null, updatedAt: nowInstant(), version: 0 };
    store.rosterWeeks.push(week);
  }
  return week;
}

function notify(employeeIds: string[], title: string, body: string, href: string) {
  const store = db();
  for (const employeeId of employeeIds)
    store.notifications.unshift({ id: `nt_${(store.counter += 1)}`, employeeId, title, body, href, createdAt: nowInstant(), read: false, kind: "system" });
}

function audit(actor: MockActor, action: string, detail: string) {
  const store = db();
  store.timeAudit.unshift({ id: `ta_${(store.counter += 1)}`, at: nowInstant(), actor: me(actor).name, action, detail });
}

/** Every employee needs at least one weekly off in a published week. */
function assertWeeklyRest(week: MockRosterWeek, people: SeedEmployee[], dates: string[]) {
  for (const person of people) {
    const offs = dates.filter((date, index) => {
      const cell = week.draft[person.id]?.[index] ?? null;
      return cell === "off" || (cell === null && isDepartmentWeekOff(person.department, date));
    }).length;
    if (offs === 0) throw problem(422, "NO_WEEKLY_OFF", `${person.name} has no weekly off in this week. Every employee needs at least one day of rest.`);
  }
}

export function saveRoster(actor: MockActor, input: { department: string; weekStart: string; intent: "save" | "publish"; version: number }, cells: Record<string, (string | null)[]>, key: string | undefined) {
  const scope = plannerScope(actor);
  return idempotent(key, () => {
    const store = db();
    if (!scope.departments.includes(input.department)) throw problem(403, "FORBIDDEN", "You can't plan this department's roster.");
    const start = mondayOf(input.weekStart);
    const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    if (dates[6] && dates[6] < store.today) throw problem(409, "PAST_WEEK", "This week is over; past rosters are locked.");
    const existing = weekRecord(input.department, start);
    versionCheck(existing?.version ?? 0, input.version);
    const week = ensureWeek(input.department, start);
    const people = scope.members(input.department);
    const valid = new Set(["off", ...store.config.shifts.map((item) => item.id)]);
    for (const person of people) {
      const incoming = cells[person.id];
      if (!incoming) continue;
      const current = week.draft[person.id] ?? [null, null, null, null, null, null, null];
      week.draft[person.id] = dates.map((date, index) => {
        if (date < store.today) return current[index] ?? null; // past days are locked
        const value = incoming[index] ?? null;
        if (value !== null && !valid.has(value)) throw problem(422, "UNKNOWN_SHIFT", "Choose a configured shift or week off.");
        return value;
      });
    }
    week.updatedAt = nowInstant();
    week.version += 1;
    if (input.intent === "publish") {
      assertWeeklyRest(week, people, dates);
      const before = week.published;
      week.published = structuredClone(week.draft);
      week.publishedAt = nowInstant();
      week.publishedBy = me(actor).name;
      const changed = people.filter((person) => JSON.stringify(before?.[person.id] ?? null) !== JSON.stringify(week.draft[person.id] ?? null)).map((person) => person.id);
      notify(changed, "Your shift roster is published", `${input.department} roster for the week of ${formatDate(start, "short")} is live.`, `/attendance/roster?week=${start}`);
      audit(actor, "Roster published", `${input.department} · week of ${formatDate(start, "medium")} · ${people.length} people`);
      return { status: "published" as const, version: week.version };
    }
    return { status: "draft" as const, version: week.version };
  });
}

export function applyRosterPattern(actor: MockActor, input: RosterPatternInput) {
  const scope = plannerScope(actor);
  const store = db();
  if (!scope.departments.includes(input.department)) throw problem(403, "FORBIDDEN", "You can't plan this department's roster.");
  const start = mondayOf(input.weekStart);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  if (dates[6] && dates[6] < store.today) throw problem(409, "PAST_WEEK", "This week is over; past rosters are locked.");
  const week = ensureWeek(input.department, start);
  const people = scope.members(input.department);
  const shiftIds = new Set(store.config.shifts.map((item) => item.id));
  let build: (person: SeedEmployee, index: number) => (string | null)[];
  if (input.pattern === "rotate") {
    if (!shiftIds.has(input.first) || !shiftIds.has(input.second) || input.first === input.second)
      throw problem(422, "PATTERN_SHIFTS", "Pick two different shifts to rotate.", { fieldErrors: { second: "Pick a different second shift." } });
    const flip = Math.floor(diffDays("2024-01-01", start) / 7) % 2;
    build = (person, index) => {
      const shift = (index + flip) % 2 === 0 ? input.first : input.second;
      return dates.map((date) => (isDepartmentWeekOff(person.department, date) ? "off" : shift));
    };
  } else if (input.pattern === "copy_previous") {
    const previous = weekRecord(input.department, addDays(start, -7));
    const source = previous?.draft ?? previous?.published;
    if (!source) throw problem(404, "NO_PREVIOUS", "There is no roster for the previous week to copy.");
    build = (person) => [...(source[person.id] ?? [null, null, null, null, null, null, null])];
  } else {
    build = () => [null, null, null, null, null, null, null];
  }
  people.forEach((person, index) => {
    const current = week.draft[person.id] ?? [null, null, null, null, null, null, null];
    const next = build(person, index);
    week.draft[person.id] = dates.map((date, day) => (date < store.today ? (current[day] ?? null) : (next[day] ?? null)));
  });
  week.updatedAt = nowInstant();
  week.version += 1;
  return { ok: true, version: week.version };
}

export function saveWeeklyOff(actor: MockActor, input: WeeklyOffInput) {
  requireCapability(actor, "policy.publish");
  const store = db();
  if (!store.config.departments.some((item) => item.name === input.department)) throw problem(404, "NOT_FOUND", "That department no longer exists.");
  const offWeekdays = [...new Set(input.offWeekdays)];
  if (offWeekdays.length === 0 && !input.alternateSaturdays)
    throw problem(422, "NO_WEEKLY_OFF", "Keep at least one weekly off (or use the roster to plan rotating offs).", { fieldErrors: { offWeekdays: "Pick at least one day." } });
  store.rosterWeeklyOffs[input.department] = { offWeekdays, alternateSaturdays: input.alternateSaturdays && !offWeekdays.includes(6) };
  audit(actor, "Weekly off changed", `${input.department}: ${describeWeeklyOff(store.rosterWeeklyOffs[input.department] ?? DEFAULT_OFF)}`);
  return { ok: true };
}

export function requestShiftSwap(actor: MockActor, input: ShiftSwapInput, key: string | undefined) {
  requireCapability(actor, "attendance.read.self");
  return idempotent(key, () => {
    const store = db();
    const employee = me(actor);
    const colleague = employeeById(input.colleagueId);
    if (!colleague || colleague.status === "exited" || colleague.id === employee.id) throw problem(422, "INVALID_COLLEAGUE", "Choose an active colleague.", { fieldErrors: { colleagueId: "Choose a colleague." } });
    if (colleague.department !== employee.department) throw problem(422, "OTHER_DEPARTMENT", "Swaps are only within your department's roster.", { fieldErrors: { colleagueId: "Same department only." } });
    if (input.date <= store.today) throw problem(422, "PAST_DATE", "Swaps are for upcoming days.", { fieldErrors: { date: "Choose a future date." } });
    if (!weekRecord(employee.department, mondayOf(input.date))?.published) throw problem(409, "NOT_ROSTERED", "That week's roster isn't published yet.", { fieldErrors: { date: "Pick a day in a published week." } });
    const mine = shiftLabel(publishedCell(employee, input.date), employee, input.date);
    const theirs = shiftLabel(publishedCell(colleague, input.date), colleague, input.date);
    if (mine === theirs) throw problem(422, "SAME_SHIFT", `You're both on ${mine} that day — nothing to swap.`, { fieldErrors: { colleagueId: "Pick someone on a different shift." } });
    if (store.rosterSwaps.some((swap) => swap.state === "pending" && swap.date === input.date && [swap.requesterId, swap.colleagueId].some((id) => id === employee.id || id === colleague.id)))
      throw problem(409, "SWAP_PENDING", "A swap for that day is already awaiting approval.");
    const reference = nextReference("SW");
    store.rosterSwaps.unshift({ id: `sw_${store.counter}`, reference, requesterId: employee.id, colleagueId: colleague.id, date: input.date, requesterShift: mine, colleagueShift: theirs, reason: input.reason, state: "pending", submittedAt: nowInstant(), decidedBy: null, decisionNote: null, version: 1 });
    if (employee.managerId) notify([employee.managerId], "Shift swap to review", `${employee.name} ↔ ${colleague.name} on ${formatDate(input.date, "short")}.`, "/attendance/roster?view=plan");
    return { reference, state: "pending" };
  });
}

export function decideShiftSwap(actor: MockActor, input: DecisionInput) {
  requireCapability(actor, "roster.manage");
  const store = db();
  const swap = store.rosterSwaps.find((item) => item.id === input.id);
  if (!swap) throw problem(404, "NOT_FOUND", "That swap request no longer exists.");
  const requester = employeeById(swap.requesterId);
  const colleague = employeeById(swap.colleagueId);
  if (!requester || !colleague || !canDecideSwap(actor, requester)) throw problem(404, "NOT_FOUND", "This swap isn't assigned to you.");
  if (swap.state !== "pending") throw problem(409, "ALREADY_DECIDED", "Someone already decided this swap.");
  versionCheck(swap.version, input.version);
  if (input.decision === "approve") {
    if (swap.date <= store.today) throw problem(409, "PAST_DATE", "That day has passed; reject the swap instead.");
    const week = ensureWeek(requester.department, mondayOf(swap.date));
    const index = diffDays(week.weekStart, swap.date);
    const cellFor = (person: SeedEmployee) => {
      const plan = dayPlan(person, swap.date);
      return plan.weekOff ? "off" : (plan.shift?.id ?? null);
    };
    const a = cellFor(requester);
    const b = cellFor(colleague);
    for (const cells of [week.draft, week.published ?? (week.published = structuredClone(week.draft))]) {
      for (const [person, value] of [[requester, b], [colleague, a]] as const) {
        const row = cells[person.id] ?? [null, null, null, null, null, null, null];
        row[index] = value;
        cells[person.id] = row;
      }
    }
    week.version += 1;
    week.updatedAt = nowInstant();
    notify([requester.id, colleague.id], "Shift swap approved", `${formatDate(swap.date, "short")}: ${requester.name} ↔ ${colleague.name}.`, `/attendance/roster?week=${week.weekStart}`);
  }
  swap.state = input.decision === "approve" ? "approved" : "rejected";
  swap.decidedBy = me(actor).name;
  swap.decisionNote = input.note || null;
  swap.version += 1;
  return { reference: swap.reference, state: swap.state };
}

export function cancelShiftSwap(actor: MockActor, id: string) {
  requireCapability(actor, "attendance.read.self");
  const swap = db().rosterSwaps.find((item) => item.id === id && item.requesterId === actor.employeeId);
  if (!swap) throw problem(404, "NOT_FOUND", "That swap request no longer exists.");
  if (swap.state !== "pending") throw problem(409, "ALREADY_DECIDED", "This swap was already decided.");
  swap.state = "cancelled";
  swap.version += 1;
  return { reference: swap.reference, state: swap.state };
}
