import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById } from "@/lib/mocks/store";
import { checklist, departmentNames, leaveTypes, locationNames } from "@/lib/mocks/handlers/config";
import { halves } from "@/lib/mocks/seed/random";
import { addDays, daysInMonth, diffDays, monthOf } from "@/lib/utils/date";
import { attendanceDay, teamAttendanceFor } from "@/lib/mocks/handlers/attendance";
import { directReports, ref, refById, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import { exitCompletionBlockers, issueExitLetters, recordExitCompleted } from "@/lib/mocks/handlers/lifecycle";
import type { OnboardingCase, WorkforceReport } from "@/types/admin";
import type { OffboardingCase } from "@/types/hr-config";

/* Onboarding --------------------------------------------------------------- */

export function onboardingCases(actor: MockActor): OnboardingCase[] {
  requireCapability(actor, "onboarding.manage");
  const store = db();
  return store.employees
    .filter((employee) => employee.status === "onboarding" || diffDays(employee.joinedOn, store.today) <= 30 && diffDays(employee.joinedOn, store.today) >= -30)
    .filter((employee) => employee.status !== "exited")
    .map((employee) => {
      const done = store.onboarding.get(employee.id) ?? {};
      return {
        id: `ob_${employee.id}`,
        person: ref(employee),
        department: employee.department,
        joinedOn: employee.joinedOn,
        manager: refById(employee.managerId),
        tasks: checklist("onboarding").map((task) => ({
          id: task.id,
          title: task.title,
          owner: task.owner,
          blocking: task.blocking,
          done: Boolean(done[task.id]),
          due: addDays(employee.joinedOn, task.offsetDays),
        })),
      };
    })
    .sort((a, b) => b.joinedOn.localeCompare(a.joinedOn));
}

export function setOnboardingTask(actor: MockActor, employeeId: string, taskId: string, done: boolean) {
  requireCapability(actor, "onboarding.manage");
  if (!employeeById(employeeId) || !checklist("onboarding").some((task) => task.id === taskId))
    throw problem(404, "NOT_FOUND", "That onboarding task no longer exists.");
  const store = db();
  const record = store.onboarding.get(employeeId) ?? {};
  record[taskId] = done;
  store.onboarding.set(employeeId, record);
  return { ok: true };
}

/* Offboarding -------------------------------------------------------------- */

export function offboardingCases(actor: MockActor): OffboardingCase[] {
  requireCapability(actor, "onboarding.manage");
  const store = db();
  return [...store.exits.values()]
    .flatMap((exit) => {
      const employee = employeeById(exit.employeeId);
      if (!employee) return [];
      return [{
        id: `off_${employee.id}`,
        person: ref(employee),
        department: employee.department,
        lastWorkingDay: exit.lastWorkingDay,
        reason: exit.reason,
        status: employee.status === "exited" ? ("exited" as const) : ("notice" as const),
        accessRevoked: Boolean(exit.tasks.access),
        tasks: checklist("offboarding").map((task) => ({
          id: task.id,
          title: task.title,
          owner: task.owner,
          blocking: task.blocking,
          done: Boolean(exit.tasks[task.id]),
          due: addDays(exit.lastWorkingDay, -task.offsetDays),
        })),
      }];
    })
    .sort((a, b) => a.lastWorkingDay.localeCompare(b.lastWorkingDay));
}

export function setOffboardingTask(actor: MockActor, employeeId: string, taskId: string, done: boolean) {
  requireCapability(actor, "onboarding.manage");
  const exit = db().exits.get(employeeId);
  if (!exit || !checklist("offboarding").some((task) => task.id === taskId))
    throw problem(404, "NOT_FOUND", "That exit task no longer exists.");
  exit.tasks[taskId] = done;
  return { ok: true };
}

/** Closes the exit once blocking tasks are done; history is retained. */
export function completeExit(actor: MockActor, employeeId: string) {
  requireCapability(actor, "employee.update");
  const store = db();
  const exit = store.exits.get(employeeId);
  const employee = employeeById(employeeId);
  if (!exit || !employee) throw problem(404, "NOT_FOUND", "That exit no longer exists.");
  if (employee.status === "exited") throw problem(409, "ALREADY_EXITED", "This exit is already closed.");
  if (exit.lastWorkingDay > store.today) throw problem(409, "BEFORE_LAST_DAY", "The exit can close on or after the last working day.");
  if (directReports(employee.id).length) throw problem(409, "HAS_REPORTS", "Reassign this person's direct reports first (Edit job details on each).");
  const blockers = exitCompletionBlockers(employee.id);
  if (blockers.length) throw problem(409, "BLOCKING_TASKS_OPEN", `Finish first: ${blockers.join("; ")}.`);
  employee.status = "exited";
  // Relieving and experience letters are generated from the active templates on completion.
  issueExitLetters(actor, employee.id);
  recordExitCompleted(employee.id, exit.lastWorkingDay);
  return { ok: true };
}

/* Reports ------------------------------------------------------------------ */

export function workforceReport(actor: MockActor): WorkforceReport {
  requireCapability(actor, "report.read");
  const store = db();
  const activeStaff = store.employees.filter((employee) => employee.status !== "exited");
  const month = monthOf(store.today);
  const today = teamAttendanceFor(activeStaff.map((employee) => employee.id));
  const bands = [["< 1 year", 0, 1], ["1–3 years", 1, 3], ["3–5 years", 3, 5], ["5+ years", 5, 99]] as const;
  const years = (joined: string) => diffDays(joined, store.today) / 365.25;
  const leaveTotals = new Map<string, { used: number; entitled: number }>();
  const counted = leaveTypes().filter((type) => type.entitledHalves !== null && type.code !== "CO");
  const entitlement: Record<string, number> = Object.fromEntries(counted.map((type) => [type.id, type.entitledHalves ?? 0]));
  for (const request of store.leaveRequests) {
    if (!(request.leaveTypeId in entitlement) || request.state !== "approved") continue;
    const entry = leaveTotals.get(request.leaveTypeId) ?? { used: 0, entitled: 0 };
    entry.used += request.halves;
    leaveTotals.set(request.leaveTypeId, entry);
  }
  const names: Record<string, string> = Object.fromEntries(counted.map((type) => [type.id, type.name]));
  return {
    generatedAt: new Date().toISOString(),
    headcount: activeStaff.length,
    byDepartment: departmentNames().map((name) => ({
      name,
      count: activeStaff.filter((e) => e.department === name).length,
      joiners: activeStaff.filter((e) => e.department === name && monthOf(e.joinedOn) === month).length,
    })),
    byLocation: locationNames().map((name) => ({ name, count: activeStaff.filter((e) => e.location === name).length })),
    byType: (["full_time", "contract", "intern"] as const).map((type) => ({
      name: type === "full_time" ? "Full-time" : type === "contract" ? "Contract" : "Intern",
      count: activeStaff.filter((e) => e.type === type).length,
    })),
    attendanceToday: today,
    leaveUtilization: Object.keys(entitlement).map((id) => ({
      type: names[id] ?? id,
      usedDays: halves(leaveTotals.get(id)?.used ?? 0),
      entitledDays: halves((entitlement[id] ?? 0) * activeStaff.length),
    })),
    tenure: bands.map(([band, min, max]) => ({ band, count: activeStaff.filter((e) => years(e.joinedOn) >= min && years(e.joinedOn) < max).length })),
  };
}

/** Formula-safe CSV of the directory-safe employee fields (report.read scope). */
export function employeeCsv(actor: MockActor): string {
  requireCapability(actor, "report.read");
  const safe = (value: string) => {
    const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = db().employees.map((e) => [e.code, e.name, e.designation, e.department, e.location, e.status, e.joinedOn, e.type].map(safe).join(","));
  return ["Code,Name,Designation,Department,Location,Status,Joined,Type", ...rows].join("\r\n");
}

/* Monthly attendance report ------------------------------------------------ */

/** One row per active employee for a month: day counts, hours and overtime. */
export function attendanceMonthCsv(actor: MockActor, month: string): { fileName: string; csv: string } {
  requireCapability(actor, "report.read");
  const store = db();
  if (!/^\d{4}-\d{2}$/.test(month) || month > monthOf(store.today)) throw problem(422, "INVALID_MONTH", "Choose this month or an earlier one.");
  const safe = (value: string | number) => {
    const text = String(value);
    return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
  };
  const header = ["Employee code", "Name", "Department", "Location", "Present", "Late", "Half day", "Leave", "Needs review", "Holidays", "Weekly off", "Worked hours", "Overtime hours"];
  const rows = store.employees
    .filter((employee) => employee.status !== "exited" && employee.joinedOn <= `${month}-31`)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((employee) => {
      const days = daysInMonth(month).filter((date) => date < store.today).map((date) => attendanceDay(employee, date)).filter((day) => day !== null);
      const count = (...states: string[]) => days.filter((day) => states.includes(day.state)).length;
      const worked = days.reduce((sum, day) => sum + day.workedMinutes, 0);
      const overtime = days.reduce((sum, day) => sum + day.overtimeMinutes, 0);
      return [employee.code, employee.name, employee.department, employee.location, count("present"), count("late"), count("half_day"), count("leave"), count("needs_review"), count("holiday"), count("weekly_off"), (worked / 60).toFixed(1), (overtime / 60).toFixed(1)];
    });
  const csv = [[`GTF HR attendance report`, `Month ${month}`, `Generated ${store.today}`, "Days up to yesterday"].map(safe).join(","), "", header.map(safe).join(","), ...rows.map((row) => row.map(safe).join(","))].join("\r\n");
  return { fileName: `gtf-attendance-${month}.csv`, csv };
}
