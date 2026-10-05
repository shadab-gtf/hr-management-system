import "server-only";
import { addDays, diffDays, isWeekend, weekday } from "@/lib/utils/date";
import { isSeedHoliday } from "@/lib/mocks/seed/calendar";
import { seeded, seededInt } from "@/lib/mocks/seed/random";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import type { ProjectStatus } from "@/types/timesheets";

/* Synthetic projects, timesheet weeks and entries. Relative to the business date. */

export interface MockTsAudit {
  id: string;
  at: string;
  /** Employee id, or null for the system. */
  actorId: string | null;
  event: string;
}

export interface MockTsProject {
  id: string;
  code: string;
  name: string;
  client: string | null;
  billable: boolean;
  budgetQuarters: number;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  memberIds: string[];
  tasks: string[];
  version: number;
  audit: MockTsAudit[];
}

export interface MockTsRow {
  projectId: string;
  task: string;
  note: string;
  /** Integer quarter-hours, Monday → Sunday. */
  quarters: number[];
}

export interface MockTsWeek {
  id: string;
  employeeId: string;
  /** Monday. */
  weekStart: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  rows: MockTsRow[];
  version: number;
  submittedAt: string | null;
  decidedAt: string | null;
  deciderId: string | null;
  decisionComment: string | null;
  /** Comment from an earlier rejection that this submission answers. */
  previousComment: string | null;
  audit: MockTsAudit[];
}

export interface MockTsReminder {
  employeeId: string;
  weekStart: string;
  at: string;
  byId: string;
}

export interface TimesheetsState {
  tsProjects: MockTsProject[];
  tsWeeks: MockTsWeek[];
  tsReminders: MockTsReminder[];
}

const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;
export const mondayOf = (date: string) => addDays(date, -((weekday(date) + 6) % 7));

/* Mirrors the approved leave fixtures in lib/mocks/store.ts (seed-time only). */
function workday(today: string, offset: number): string {
  let date = addDays(today, offset);
  const step = offset < 0 ? -1 : 1;
  while (isWeekend(date) || isSeedHoliday(date)) date = addDays(date, step);
  return date;
}
function seedLeave(today: string): Map<string, Map<string, number>> {
  // employee → date → quarters unavailable (32 = full day, 16 = half)
  const map = new Map<string, Map<string, number>>();
  const add = (n: number, from: number, to: number, quarters = 32) => {
    const start = workday(today, from);
    const end = workday(today, to);
    const days = map.get(e(n)) ?? new Map<string, number>();
    for (let date = start; date <= end; date = addDays(date, 1)) days.set(date, quarters);
    map.set(e(n), days);
  };
  add(7, -24, -24);
  add(7, -12, -12, 16);
  add(11, -6, 8);
  add(12, -3, -3);
  add(14, -30, -28);
  add(37, -1, -1);
  return map;
}

type Assignment = [projectId: string, task: string, weight: number, note?: string];

export function createTimesheetsState(today: string, ago: (days: number, time?: string) => string, employees: SeedEmployee[]): TimesheetsState {
  const monday = mondayOf(today);
  const at = (date: string, time: string) => ago(diffDays(date, today), time);
  let counter = 0;
  const audit = (date: string, time: string, actorId: string | null, event: string): MockTsAudit => {
    counter += 1;
    return { id: `tsa_${counter}`, at: at(date, time), actorId, event };
  };

  const project = (
    id: string,
    code: string,
    name: string,
    client: string | null,
    billable: boolean,
    budgetHours: number,
    startOffset: number,
    endOffset: number,
    status: ProjectStatus,
    members: number[],
    tasks: string[],
    createdBy: number,
  ): MockTsProject => {
    const startDate = addDays(monday, startOffset);
    const trail = [audit(addDays(startDate, -5), "11:20", e(createdBy), `Created ${code} with ${members.length} members and ${tasks.length} tasks`)];
    if (status === "on_hold") trail.push(audit(addDays(monday, -9), "15:05", e(createdBy), "Status: Active → On hold (client paused the brief)"));
    if (status === "closed") trail.push(audit(addDays(monday, -27), "18:10", e(createdBy), "Status: Active → Closed (campaign delivered)"));
    return {
      id,
      code,
      name,
      client,
      billable,
      budgetQuarters: budgetHours * 4,
      startDate,
      endDate: addDays(monday, endOffset),
      status,
      memberIds: members.map(e),
      tasks,
      version: trail.length,
      audit: trail,
    };
  };

  const tsProjects: MockTsProject[] = [
    project("prj_tca", "GTF-TCA-01", "Tata Capital app redesign", "Tata Capital", true, 1200, -84, 120, "active", [6, 7, 9, 10, 11, 14, 15, 16, 19], ["Discovery & research", "UX flows", "Visual design", "Prototyping", "Frontend build", "QA & accessibility"], 6),
    project("prj_gpl", "GTF-GPL-02", "Godrej Properties launch site", "Godrej Properties", true, 640, -56, 45, "active", [9, 10, 12, 17, 39], ["Art direction", "Motion assets", "Web build", "Content integration", "Launch support"], 6),
    project("prj_ds2", "GTF-DS-20", "Design system 2.0", null, false, 400, -120, 180, "active", [7, 11, 12, 14, 19], ["Tokens & theming", "Component audit", "Figma library", "Documentation"], 6),
    project("prj_plat", "GTF-PLAT-04", "Platform reliability", null, false, 1400, -200, 160, "active", [13, 15, 17, 18, 40, 42], ["On-call & incidents", "Observability", "CI/CD pipeline", "Cost optimisation"], 13),
    project("prj_ch26", "GTF-CH-26", "Campus hiring 2026", null, false, 800, -70, 60, "active", [5, 35, 36, 37], ["Sourcing & outreach", "Campus drives", "Interview coordination", "Offer rollout", "Logistics"], 5),
    project("prj_hdfc", "GTF-HDL-03", "HDFC Life brand refresh", "HDFC Life", true, 350, -40, 90, "on_hold", [9, 12, 10], ["Brand audit", "Identity concepts", "Guidelines"], 6),
    project("prj_zom", "GTF-ZOM-01", "Zomato festive campaign", "Zomato", true, 160, -90, -29, "closed", [9, 10], ["Campaign concepts", "Motion assets", "Delivery"], 6),
  ];

  const assignments: Record<number, Assignment[]> = {
    7: [["prj_tca", "UX flows", 5, "Loan journey flows"], ["prj_tca", "Visual design", 3], ["prj_ds2", "Tokens & theming", 2]],
    9: [["prj_tca", "Visual design", 5], ["prj_gpl", "Art direction", 4]],
    10: [["prj_gpl", "Motion assets", 6], ["prj_tca", "Prototyping", 3]],
    11: [["prj_ds2", "Component audit", 5], ["prj_tca", "Discovery & research", 4]],
    12: [["prj_gpl", "Art direction", 5], ["prj_ds2", "Figma library", 3]],
    14: [["prj_tca", "Frontend build", 7], ["prj_ds2", "Documentation", 2]],
    15: [["prj_tca", "Frontend build", 5], ["prj_plat", "Observability", 4]],
    16: [["prj_tca", "QA & accessibility", 9]],
    17: [["prj_plat", "CI/CD pipeline", 6], ["prj_gpl", "Launch support", 2]],
    18: [["prj_plat", "On-call & incidents", 8, "Knowledge transfer before notice ends"]],
    19: [["prj_tca", "Frontend build", 6], ["prj_ds2", "Tokens & theming", 3]],
    39: [["prj_gpl", "Web build", 8]],
    40: [["prj_plat", "Cost optimisation", 7]],
    42: [["prj_plat", "On-call & incidents", 6]],
    35: [["prj_ch26", "Sourcing & outreach", 5], ["prj_ch26", "Campus drives", 4]],
    36: [["prj_ch26", "Interview coordination", 5], ["prj_ch26", "Offer rollout", 3]],
    37: [["prj_ch26", "Logistics", 6]],
  };
  const leave = seedLeave(today);
  const byId = new Map(employees.map((employee) => [employee.id, employee]));

  /** Hours for one employee-week, only on working days that have passed. */
  const rowsFor = (n: number, weekStart: string, lastDay: string): MockTsRow[] => {
    const plan = [...(assignments[n] ?? [])];
    // Kabir wrapped the Zomato campaign in the oldest week.
    if (n === 10 && weekStart === addDays(monday, -35)) plan.unshift(["prj_zom", "Delivery", 4, "Final festive cut-downs"]);
    const totalWeight = plan.reduce((sum, item) => sum + item[2], 0);
    const rows = plan.map(([projectId, task, , note]) => ({ projectId, task, note: note ?? "", quarters: [0, 0, 0, 0, 0, 0, 0] }));
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(weekStart, day);
      if (date > lastDay || isWeekend(date) || isSeedHoliday(date)) continue;
      const away = leave.get(e(n))?.get(date) ?? 0;
      const target = Math.max(0, seededInt(30, 38, n, date) - away);
      let left = target;
      plan.forEach(([, , weight], index) => {
        const share = index === plan.length - 1 ? left : Math.min(left, Math.round((target * weight) / totalWeight + (seeded(n, date, index) - 0.5) * 4));
        const row = rows[index];
        if (row) row.quarters[day] = Math.max(0, share);
        left -= Math.max(0, share);
      });
    }
    return rows.filter((row) => row.quarters.some((value) => value > 0));
  };

  const tsWeeks: MockTsWeek[] = [];
  const week = (n: number, offsetWeeks: number, status: MockTsWeek["status"], options: { comment?: string; rejectedFirst?: string; lastDay?: string } = {}) => {
    const employee = byId.get(e(n));
    if (!employee) return;
    const weekStart = addDays(monday, offsetWeeks * 7);
    const weekEnd = addDays(weekStart, 6);
    if (employee.joinedOn > weekEnd) return;
    const rows = rowsFor(n, weekStart, options.lastDay ?? weekEnd);
    if (rows.length === 0) return;
    const manager = employee.managerId;
    const submitted = addDays(weekStart, 4);
    const trail: MockTsAudit[] = [audit(weekStart, "18:30", e(n), "Draft saved")];
    let version = 1;
    let previousComment: string | null = null;
    if (options.rejectedFirst && manager) {
      trail.push(audit(submitted, "18:45", e(n), "Submitted for approval"));
      trail.push(audit(addDays(submitted, 3), "10:20", manager, `Rejected: ${options.rejectedFirst}`));
      trail.push(audit(addDays(submitted, 3), "16:05", e(n), "Resubmitted after changes"));
      previousComment = options.rejectedFirst;
      version += 3;
    } else if (status !== "draft") {
      trail.push(audit(submitted, "18:45", e(n), "Submitted for approval"));
      version += 1;
    }
    const decided = status === "approved" || status === "rejected";
    const decidedOn = addDays(weekEnd, options.rejectedFirst ? 4 : 2);
    if (decided && manager) {
      trail.push(audit(decidedOn, "11:40", manager, status === "approved" ? "Approved" : `Rejected: ${options.comment ?? ""}`));
      version += 1;
    }
    tsWeeks.push({
      id: `tsw_${n}_${weekStart.replace(/-/g, "")}`,
      employeeId: e(n),
      weekStart,
      status,
      rows,
      version,
      submittedAt: status === "draft" ? null : at(options.rejectedFirst ? addDays(submitted, 3) : submitted, options.rejectedFirst ? "16:05" : "18:45"),
      decidedAt: decided ? at(decidedOn, "11:40") : null,
      deciderId: decided ? manager : null,
      decisionComment: status === "rejected" ? (options.comment ?? null) : null,
      previousComment,
      audit: trail,
    });
  };

  const everyone = [7, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 39, 40, 42, 35, 36, 37];
  for (const n of everyone) for (let offset = -5; offset <= -3; offset += 1) {
    if (n === 7 && offset === -3) week(n, offset, "approved", { rejectedFirst: "UX flows hours look high for Thursday — please split out the Tata Capital review call." });
    else week(n, offset, "approved");
  }
  // Two weeks ago: approved, with a live rejection and a draft that never went in.
  for (const n of everyone) {
    if (n === 19) week(n, -2, "rejected", { comment: "Please log the design-system pairing under Tokens & theming, not Frontend build." });
    else if (n === 37) week(n, -2, "draft");
    else if (n === 36) week(n, -2, "approved", { rejectedFirst: "Offer rollout hours are missing for Friday's campus offers." });
    else week(n, -2, "approved");
  }
  // Last completed week: waiting on managers (37 hasn't submitted).
  for (const n of everyone) {
    if (n === 37) continue;
    if ([14, 15, 16].includes(n)) week(n, -1, "approved");
    else week(n, -1, "submitted");
  }
  // Current week drafts up to yesterday / today.
  week(7, 0, "draft", { lastDay: today });
  week(14, 0, "draft", { lastDay: addDays(today, -1) });
  week(35, 0, "draft", { lastDay: addDays(today, -1) });

  // Aanya's current draft is partial: keep only the first project on today.
  const aanya = tsWeeks.find((item) => item.employeeId === e(7) && item.weekStart === monday);
  if (aanya) {
    const index = (weekday(today) + 6) % 7;
    aanya.rows.forEach((row, rowIndex) => {
      if (rowIndex > 0) row.quarters[index] = 0;
      else row.quarters[index] = Math.min(row.quarters[index] ?? 0, 16);
    });
    aanya.rows = aanya.rows.filter((row) => row.quarters.some((value) => value > 0));
  }

  const tsReminders: MockTsReminder[] = [];
  return { tsProjects, tsWeeks, tsReminders };
}
