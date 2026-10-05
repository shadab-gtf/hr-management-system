import "server-only";
import type { LocationCheck } from "@/types/location";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant, type MockDb } from "@/lib/mocks/store";
import { organization } from "@/lib/mocks/seed/organization";
import { holidayName, isHoliday, lateEarlyPolicy, leaveTypes, overtimeMinutes, overtimePolicy } from "@/lib/mocks/handlers/config";
import { dayPlan, shiftOn } from "@/lib/mocks/handlers/roster";
import { seeded, seededInt } from "@/lib/mocks/seed/random";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { addDays, daysInMonth, zonedInstant } from "@/lib/utils/date";

/** Synthetic policy value; HR owns the real correction window. */
export const CORRECTION_WINDOW_DAYS = 45;
import {
  directReports,
  idempotent,
  me,
  ref,
  requireCapability,
  type MockActor,
} from "@/lib/mocks/handlers/shared";
import type {
  AttendanceDay,
  AttendanceMonth,
  AttendanceToday,
  TeamAttendanceRow,
  TodayState,
} from "@/types/attendance";

const time = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const minutesOf = (value: string) => {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + m;
};

function approvedLeave(store: MockDb, employeeId: string, date: string) {
  return store.leaveRequests.find(
    (request) => request.employeeId === employeeId && request.state === "approved" && request.startDate <= date && request.endDate >= date,
  );
}
function onLeave(store: MockDb, employeeId: string, date: string) {
  const request = approvedLeave(store, employeeId, date);
  if (!request) return null;
  const type = leaveTypes().find((item) => item.id === request.leaveTypeId);
  return type && !type.countsAsPresent ? type : null;
}
function onWfh(store: MockDb, employeeId: string, date: string) {
  const request = approvedLeave(store, employeeId, date);
  return Boolean(request && leaveTypes().find((item) => item.id === request.leaveTypeId)?.countsAsPresent);
}

/** Punches recorded on a week-off/holiday (device import or face-device seed). */
function offDayPunch(store: MockDb, employeeId: string, date: string) {
  const device = store.devicePunches.get(`${employeeId}|${date}`);
  if (device?.in && device.out) return { in: device.in, out: device.out };
  return store.timeOffDayPunches.get(`${employeeId}|${date}`) ?? null;
}

type Timing = Pick<AttendanceDay, "state" | "firstIn" | "lastOut" | "workedMinutes" | "overtimeMinutes" | "exception" | "lateMinutes" | "earlyMinutes">;

/** Late/early/half-day classification of a punched working day against the rostered shift. */
function classify(employee: SeedEmployee, shift: { start: string; end: string; graceMinutes: number; breakMinutes: number }, firstIn: string | null, lastOut: string, suffix = ""): Timing {
  const policy = lateEarlyPolicy();
  const inMin = firstIn ? minutesOf(firstIn) : minutesOf(shift.start);
  const outMin = minutesOf(lastOut);
  const worked = Math.max(0, outMin - inMin - shift.breakMinutes);
  const half = worked < 270;
  const lateBy = inMin - minutesOf(shift.start);
  const earlyBy = minutesOf(shift.end) - outMin;
  const late = !half && lateBy > shift.graceMinutes;
  const early = !half && policy.enabled && earlyBy > policy.earlyGraceMinutes;
  const notes = [late ? `Checked in ${lateBy} min after shift start${suffix}` : null, early ? `Left ${earlyBy} min before shift end${suffix}` : null, !firstIn ? `Missing check-in${suffix}` : null].filter(Boolean);
  return {
    state: half ? "half_day" : late ? "late" : "present",
    firstIn,
    lastOut,
    workedMinutes: half ? Math.max(0, outMin - inMin) : worked,
    overtimeMinutes: half ? 0 : overtimeMinutes(employee, lastOut, shift.end),
    exception: notes.length ? notes.join(" · ") : null,
    lateMinutes: late ? lateBy : 0,
    earlyMinutes: early ? earlyBy : 0,
  };
}

/** Derived attendance projection for one employee/day (raw events stay implicit). */
export function attendanceDay(employee: SeedEmployee, date: string): AttendanceDay | null {
  const store = db();
  if (date < employee.joinedOn) return null;
  const plan = dayPlan(employee, date);
  const shift = plan.shift ?? shiftOn(employee, date);
  const base = {
    id: `ad_${employee.id}_${date}`,
    date,
    firstIn: null,
    lastOut: null,
    workedMinutes: 0,
    overtimeMinutes: 0,
    exception: null,
    regularization: null,
    shiftName: plan.weekOff ? null : shift.name,
    lateMinutes: 0,
    earlyMinutes: 0,
    deduction: null,
    wfh: false,
    leaveCode: null,
  };
  if (date > store.today) return { ...base, state: "upcoming" };
  const holiday = isHoliday(date, employee.location);
  if (plan.weekOff || holiday) {
    const punch = date === store.today ? null : offDayPunch(store, employee.id, date);
    const off = { ...base, shiftName: null, state: holiday ? ("holiday" as const) : ("weekly_off" as const), exception: holiday ? holidayName(date, employee.location) : null };
    if (!punch) return off;
    const worked = Math.max(0, minutesOf(punch.out) - minutesOf(punch.in));
    return { ...off, firstIn: punch.in, lastOut: punch.out, workedMinutes: worked, exception: `${holiday ? `${holidayName(date, employee.location) ?? "Holiday"} · ` : ""}Worked ${Math.floor(worked / 60)}h ${worked % 60}m — eligible for comp-off` };
  }
  const leave = onLeave(store, employee.id, date);
  if (leave) return { ...base, state: "leave", leaveCode: leave.code, exception: leave.name };
  const wfh = onWfh(store, employee.id, date);

  const regularization = store.regularizations.find(
    (item) => item.employeeId === employee.id && item.date === date,
  );
  if (regularization?.state === "approved") {
    const worked = minutesOf(regularization.proposedOut) - minutesOf(regularization.proposedIn) - shift.breakMinutes;
    return {
      ...base,
      wfh,
      state: "present",
      firstIn: regularization.proposedIn,
      lastOut: regularization.proposedOut,
      workedMinutes: Math.max(worked, 0),
      regularization: "approved",
    };
  }

  const device = store.devicePunches.get(`${employee.id}|${date}`);
  if (device && date !== store.today) {
    if (!device.out)
      return { ...base, wfh, state: "needs_review", firstIn: device.in, exception: "Missing check-out (device)", regularization: regularization ? regularization.state : null };
    return { ...base, wfh, ...classify(employee, shift, device.in, device.out, " (device)"), regularization: regularization ? regularization.state : null };
  }

  const forced = store.forcedExceptions.get(employee.id)?.includes(date);
  if (date === store.today) return null; // today is served by the live capture view
  const roll = seeded(employee.id, date);
  const start = minutesOf(shift.start);
  const end = minutesOf(shift.end);
  if (forced || roll < 0.04) {
    const firstIn = time(seededInt(start - 20, start + 10, employee.id, date, "in"));
    return {
      ...base,
      wfh,
      state: "needs_review",
      firstIn,
      exception: "Missing check-out",
      regularization: regularization ? regularization.state : null,
    };
  }
  const grace = shift.graceMinutes;
  const early = lateEarlyPolicy().earlyGraceMinutes;
  let inMin: number;
  let outMin: number;
  if (roll < 0.14) {
    inMin = seededInt(start + grace + 1, start + grace + 40, employee.id, date, "in");
    outMin = seededInt(end, end + 45, employee.id, date, "out");
  } else if (roll < 0.17) {
    inMin = seededInt(start - 10, start + 10, employee.id, date, "in");
    outMin = inMin + 270;
  } else if (roll < 0.2) {
    inMin = seededInt(start - 15, start + Math.max(grace - 1, 0), employee.id, date, "in");
    outMin = seededInt(end - early - 60, end - early - 5, employee.id, date, "out");
  } else {
    inMin = seededInt(start - 20, start + Math.max(grace - 1, 0), employee.id, date, "in");
    outMin = seededInt(end, end + 50, employee.id, date, "out");
  }
  return { ...base, wfh, ...classify(employee, shift, time(inMin), time(outMin)) };
}

function todayFor(employee: SeedEmployee): Omit<AttendanceToday, "shift" | "timezone" | "lastUpdatedAt"> {
  const store = db();
  const date = store.today;
  const base = { businessDate: date, checkedInAt: null, checkedOutAt: null, workedMinutes: 0, checkInLocation: null, checkInEvidence: null, checkOutEvidence: null };
  if (dayPlan(employee, date).weekOff || isHoliday(date, employee.location) || onLeave(store, employee.id, date) || date < employee.joinedOn)
    return { ...base, state: "unavailable", nextAction: null };
  const device = store.devicePunches.get(`${employee.id}|${date}`);
  const capture = store.captures.get(employee.id) ?? (device?.in ? { in: zonedInstant(date, device.in), out: device.out ? zonedInstant(date, device.out) : null, inLocation: "Face device" } : undefined);
  if (!capture) return { ...base, state: "not_recorded", nextAction: "check_in" };
  const worked = capture.in
    ? Math.max(
        0,
        Math.round(((capture.out ? new Date(capture.out) : new Date()).getTime() - new Date(capture.in).getTime()) / 60_000),
      )
    : 0;
  return {
    ...base,
    checkInLocation: capture.inLocation ?? null,
    checkInEvidence: capture.inEvidence ?? null,
    checkOutEvidence: capture.outEvidence ?? null,
    checkedInAt: capture.in,
    checkedOutAt: capture.out,
    workedMinutes: worked,
    state: capture.out ? "checked_out" : "checked_in",
    nextAction: capture.out ? null : "check_out",
  };
}

export function attendanceToday(actor: MockActor): AttendanceToday {
  requireCapability(actor, "attendance.read.self");
  const employee = me(actor);
  return {
    ...todayFor(employee),
    timezone: organization.timezone,
    shift: (({ name, start, end, graceMinutes }) => ({ name, start, end, graceMinutes }))(shiftOn(employee, db().today)),
    lastUpdatedAt: nowInstant(),
  };
}

export function attendanceMonth(actor: MockActor, month: string): AttendanceMonth {
  requireCapability(actor, "attendance.read.self");
  return attendanceMonthFor(me(actor), month);
}

/** Month view with the late/early policy applied (every Nth mark = half-day deduction). */
export function attendanceMonthFor(employee: SeedEmployee, month: string): AttendanceMonth {
  const store = db();
  const policy = lateEarlyPolicy();
  const days = daysInMonth(month)
    .map((date): AttendanceDay | null => {
      if (date === store.today) {
        const today = todayFor(employee);
        const plan = dayPlan(employee, date);
        const shift = shiftOn(employee, date);
        const firstIn = today.checkedInAt ? formatClock(today.checkedInAt) : null;
        const lateBy = firstIn ? minutesOf(firstIn) - minutesOf(shift.start) : 0;
        const leave = onLeave(store, employee.id, date);
        return {
          id: `ad_${employee.id}_${date}`,
          date,
          state: today.state === "unavailable" ? (leave ? "leave" : plan.weekOff ? "weekly_off" : isHoliday(date, employee.location) ? "holiday" : "upcoming") : today.checkedInAt ? (lateBy > shift.graceMinutes ? "late" : "present") : "upcoming",
          firstIn,
          lastOut: today.checkedOutAt ? formatClock(today.checkedOutAt) : null,
          workedMinutes: today.workedMinutes,
          overtimeMinutes: today.checkedOutAt ? overtimeMinutes(employee, formatClock(today.checkedOutAt), shift.end) : 0,
          exception: leave ? leave.name : null,
          regularization: null,
          shiftName: plan.weekOff ? null : shift.name,
          lateMinutes: firstIn && lateBy > shift.graceMinutes ? lateBy : 0,
          earlyMinutes: 0,
          deduction: null,
          wfh: onWfh(store, employee.id, date),
          leaveCode: leave?.code ?? null,
        };
      }
      return attendanceDay(employee, date);
    })
    .filter((day): day is AttendanceDay => day !== null);
  // Late/early policy: count marks in date order; every Nth mark deducts half a day.
  let marks = 0;
  if (policy.enabled)
    for (const day of days) {
      const marked = day.lateMinutes > 0 || (policy.countEarlyGoing && day.earlyMinutes > 0);
      if (!marked) continue;
      marks += 1;
      if (marks % policy.marksPerHalfDay === 0) day.deduction = "half_day";
    }
  const worked = days.filter((day) => day.workedMinutes > 0 && day.state !== "weekly_off" && day.state !== "holiday");
  const count = (...states: AttendanceDay["state"][]) =>
    days.filter((day) => states.includes(day.state)).length;
  return {
    month,
    days,
    summary: {
      present: count("present", "half_day", "late"),
      late: days.filter((day) => day.lateMinutes > 0).length,
      absent: count("absent"),
      leave: days.filter((day) => day.state === "leave" && day.leaveCode !== "LOP").length,
      needsReview: count("needs_review"),
      averageWorkedMinutes: worked.length
        ? Math.round(worked.reduce((sum, day) => sum + day.workedMinutes, 0) / worked.length)
        : 0,
      overtimeMinutes: days.reduce((sum, day) => sum + day.overtimeMinutes, 0),
      overtimeCompensation: overtimePolicy().enabled ? overtimePolicy().compensation : null,
      wfh: days.filter((day) => day.wfh && day.state !== "leave").length,
      lop: days.filter((day) => day.leaveCode === "LOP").length + count("absent"),
      earlyGoing: days.filter((day) => day.earlyMinutes > 0).length,
      lateDeductions: days.filter((day) => day.deduction === "half_day").length,
      weeklyOffs: count("weekly_off"),
      holidays: count("holiday"),
      marksPerHalfDay: policy.enabled ? policy.marksPerHalfDay : null,
      workedOnOffDays: days.filter((day) => (day.state === "weekly_off" || day.state === "holiday") && day.workedMinutes > 0).length,
    },
  };
}

function formatClock(instant: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: organization.timezone,
  }).format(new Date(instant));
}

export function teamAttendance(actor: MockActor): TeamAttendanceRow[] {
  requireCapability(actor, "attendance.read.team");
  const store = db();
  return directReports(actor.employeeId).map((employee) => {
    const today = todayFor(employee);
    // Teammates' day is simulated from the seed; only personas capture live.
    let state: TodayState = today.state;
    let checkedInAt = today.checkedInAt;
    if (!store.captures.has(employee.id) && state === "not_recorded") {
      const roll = seeded(employee.id, store.today, "team");
      if (roll < 0.75) {
        state = "checked_in";
        checkedInAt = zonedInstant(store.today, time(seededInt(545, 620, employee.id, store.today)));
      }
    }
    const lastException = [...Array(7).keys()]
      .map((back) => attendanceDay(employee, addDays(store.today, -(back + 1))))
      .find((day) => day?.state === "needs_review");
    return {
      person: ref(employee),
      state: today.state === "unavailable" ? "unavailable" : state,
      checkedInAt,
      exception: lastException ? `${lastException.exception} on ${lastException.date}` : null,
    };
  });
}

export function captureAttendance(
  actor: MockActor,
  direction: "check_in" | "check_out",
  key: string | undefined,
  location: LocationCheck | null = null,
) {
  requireCapability(actor, "attendance.capture.self");
  return idempotent(key, () => {
    const employee = me(actor);
    const today = todayFor(employee);
    if (today.state === "unavailable")
      throw problem(409, "CAPTURE_UNAVAILABLE", "Attendance capture isn't available today.");
    if (today.nextAction !== direction)
      throw problem(409, "INVALID_DIRECTION", direction === "check_in" ? "You're already checked in." : "Check in first.");
    const store = db();
    const at = nowInstant();
    const current = store.captures.get(employee.id) ?? { in: null, out: null };
    store.captures.set(
      employee.id,
      direction === "check_in" ? { in: at, out: null, inLocation: location?.label ?? null, inEvidence: location } : { ...current, out: at, outLocation: location?.label ?? null, outEvidence: location },
    );
    return { reference: nextReference("AT"), recordedAt: at, direction };
  });
}

export function requestRegularization(
  actor: MockActor,
  input: { date: string; proposedIn: string; proposedOut: string; reason: string },
  key: string | undefined,
) {
  requireCapability(actor, "attendance.regularize.request");
  return idempotent(key, () => {
    const employee = me(actor);
    const store = db();
    if (input.date >= store.today)
      throw problem(422, "OUTSIDE_WINDOW", "Only past days can be corrected.", {
        fieldErrors: { date: "Choose a past working day." },
      });
    if (input.date < addDays(store.today, -CORRECTION_WINDOW_DAYS))
      throw problem(422, "OUTSIDE_WINDOW", "The correction window for that date has closed.");
    if (minutesOf(input.proposedOut) <= minutesOf(input.proposedIn))
      throw problem(422, "INVALID_TIMES", "Check-out must be after check-in.", {
        fieldErrors: { proposedOut: "Check-out must be after check-in." },
      });
    if (store.regularizations.some((item) => item.employeeId === employee.id && item.date === input.date && item.state === "pending"))
      throw problem(409, "DUPLICATE_REQUEST", "A correction for this day is already awaiting review.");
    const reference = nextReference("RG");
    store.regularizations.push({
      id: `rg_${store.counter}`,
      reference,
      employeeId: employee.id,
      date: input.date,
      proposedIn: input.proposedIn,
      proposedOut: input.proposedOut,
      reason: input.reason,
      state: "pending",
      approverId: employee.managerId,
      submittedAt: nowInstant(),
      decisionNote: null,
      version: 1,
    });
    return { reference, state: "pending", approver: employeeById(employee.managerId ?? "")?.name ?? "HR" };
  });
}

/** Organization-wide snapshot for reports (counts only). */
export function teamAttendanceFor(employeeIds: string[]) {
  const store = db();
  let present = 0;
  let onLeave = 0;
  let notRecorded = 0;
  for (const id of employeeIds) {
    const employee = employeeById(id);
    if (!employee) continue;
    const today = todayFor(employee);
    if (today.state === "unavailable") onLeave += 1;
    else if (store.captures.has(id) || seeded(id, store.today, "team") < 0.75) present += 1;
    else notRecorded += 1;
  }
  return { present, onLeave, notRecorded };
}
