import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextId, nowInstant } from "@/lib/mocks/store";
import { holidayName, isHoliday } from "@/lib/mocks/handlers/config";
import { leaveTypeName } from "@/lib/mocks/handlers/leave";
import { notify } from "@/lib/mocks/handlers/notifications";
import { can, directReports, idempotent, me, ref, refById, requireCapability, versionCheck, type MockActor } from "@/lib/mocks/handlers/shared";
import { mondayOf, type MockTsAudit, type MockTsProject, type MockTsRow, type MockTsWeek } from "@/lib/mocks/seed/timesheets";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { addDays, diffDays, eachDay, isWeekend } from "@/lib/utils/date";
import { formatDate, humanize } from "@/lib/utils/format";
import {
  MAX_DAY_QUARTERS,
  quarterHours,
  hoursLabel,
  type CopyPreviousWeekInput,
  type MissingTimesheet,
  type MyTimesheetView,
  type Project,
  type ProjectInput,
  type ProjectsView,
  type SaveTimesheetInput,
  type TeamTimesheet,
  type TeamTimesheetsView,
  type TimesheetDay,
  type TimesheetDecisionInput,
  type TimesheetReminderInput,
  type TimesheetRow,
  type TimesheetWeek,
  type TsAuditEntry,
} from "@/types/timesheets";

/* Helpers ------------------------------------------------------------------- */

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const weekEndOf = (weekStart: string) => addDays(weekStart, 6);
const isMonday = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && mondayOf(date) === date;
const dayLabel = (date: string) => formatDate(date, "weekday");

function actorName(id: string | null): string {
  if (!id) return "System";
  return employeeById(id)?.name ?? "Former employee";
}
function toAudit(entries: MockTsAudit[]): TsAuditEntry[] {
  return [...entries].sort((a, b) => b.at.localeCompare(a.at)).map((entry) => ({ id: entry.id, at: entry.at, actor: actorName(entry.actorId), event: entry.event }));
}
function log(actor: MockActor, event: string): MockTsAudit {
  return { id: nextId("tsa"), at: nowInstant(), actorId: actor.employeeId, event };
}
function projectById(id: string): MockTsProject | undefined {
  return db().tsProjects.find((item) => item.id === id);
}

/** Column metadata: weekend, holiday for the employee's location, approved/pending leave. */
function daysFor(employee: SeedEmployee, weekStart: string): TimesheetDay[] {
  const today = db().today;
  const leave = db().leaveRequests.filter((request) => request.employeeId === employee.id && (request.state === "approved" || request.state === "pending"));
  return eachDay(weekStart, weekEndOf(weekStart)).map((date) => {
    const weekend = isWeekend(date);
    const holiday = isHoliday(date, employee.location) ? holidayName(date, employee.location) : null;
    const request = weekend || holiday ? undefined : leave.find((item) => item.startDate <= date && item.endDate >= date);
    const half = request ? request.startDate === request.endDate && request.halves === 1 : false;
    return {
      date,
      weekend,
      holiday,
      leave: request ? `${leaveTypeName(request.leaveTypeId)}${half ? " (half day)" : ""}${request.state === "pending" ? " · pending" : ""}` : null,
      leaveFull: Boolean(request && !half && request.state === "approved"),
      leavePending: request?.state === "pending",
      future: date > today,
    };
  });
}

function dayTotalsOf(rows: readonly { quarters: readonly number[] }[]): number[] {
  return Array.from({ length: 7 }, (_, day) => sum(rows.map((row) => row.quarters[day] ?? 0)));
}

function rowView(row: MockTsRow): TimesheetRow {
  const project = projectById(row.projectId);
  return {
    projectId: row.projectId,
    projectCode: project?.code ?? "—",
    projectName: project?.name ?? "Removed project",
    billable: project?.billable ?? false,
    task: row.task,
    note: row.note,
    quarters: [...row.quarters],
  };
}

function billableOf(rows: readonly MockTsRow[]): number {
  return sum(rows.filter((row) => projectById(row.projectId)?.billable).map((row) => sum(row.quarters)));
}

function warningsFor(days: TimesheetDay[], totals: number[]): string[] {
  const warnings: string[] = [];
  days.forEach((day, index) => {
    if ((totals[index] ?? 0) === 0) return;
    if (day.holiday) warnings.push(`${hoursLabel(totals[index] ?? 0)} logged on ${dayLabel(day.date)}, a holiday (${day.holiday}).`);
    else if (day.leaveFull) warnings.push(`${hoursLabel(totals[index] ?? 0)} logged on ${dayLabel(day.date)} while on approved ${day.leave ?? "leave"}.`);
  });
  return warnings;
}

/** Active projects the employee is a member of that run during the week. */
function assignableFor(employeeId: string, weekStart: string): MockTsProject[] {
  const weekEnd = weekEndOf(weekStart);
  return db().tsProjects.filter((project) => project.status === "active" && project.memberIds.includes(employeeId) && project.startDate <= weekEnd && project.endDate >= weekStart);
}

function weekOf(employeeId: string, weekStart: string): MockTsWeek | undefined {
  return db().tsWeeks.find((item) => item.employeeId === employeeId && item.weekStart === weekStart);
}

function weekView(employee: SeedEmployee, weekStart: string, record: MockTsWeek | undefined): TimesheetWeek {
  const days = daysFor(employee, weekStart);
  const rows = record?.rows ?? [];
  const totals = dayTotalsOf(rows);
  const status = record?.status ?? "not_started";
  const editable = status === "not_started" || status === "draft" || status === "rejected";
  return {
    id: record?.id ?? null,
    weekStart,
    weekEnd: weekEndOf(weekStart),
    status,
    version: record?.version ?? 0,
    editable,
    canSubmit: editable && weekStart <= db().today,
    rows: rows.map(rowView),
    days,
    dayTotals: totals,
    totalQuarters: sum(totals),
    billableQuarters: billableOf(rows),
    submittedAt: record?.submittedAt ?? null,
    decidedAt: record?.decidedAt ?? null,
    decidedBy: refById(record?.deciderId ?? null),
    decisionComment: record?.decisionComment ?? record?.previousComment ?? null,
    warnings: warningsFor(days, totals),
    audit: toAudit(record?.audit ?? []),
  };
}

function weekBounds(employee: SeedEmployee) {
  const thisWeek = mondayOf(db().today);
  return { thisWeek, max: addDays(thisWeek, 7), min: mondayOf(employee.joinedOn > addDays(thisWeek, -364) ? employee.joinedOn : addDays(thisWeek, -364)) };
}

/* My timesheet -------------------------------------------------------------- */

export function myTimesheet(actor: MockActor, requested: string | null): MyTimesheetView {
  requireCapability(actor, "timesheet.submit.self");
  const employee = me(actor);
  const { thisWeek, max, min } = weekBounds(employee);
  let weekStart = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(Date.parse(`${requested}T00:00:00Z`)) ? mondayOf(requested) : thisWeek;
  if (weekStart > max) weekStart = max;
  if (weekStart < min) weekStart = min;
  const record = weekOf(employee.id, weekStart);
  const previous = weekOf(employee.id, addDays(weekStart, -7));
  const assignable = assignableFor(employee.id, weekStart);
  return {
    today: db().today,
    thisWeek,
    prevWeek: weekStart > min ? addDays(weekStart, -7) : null,
    nextWeek: weekStart < max ? addDays(weekStart, 7) : null,
    week: weekView(employee, weekStart, record),
    assignable: assignable.map((project) => ({ id: project.id, code: project.code, name: project.name, billable: project.billable, tasks: [...project.tasks] })),
    previousWeekHasRows: Boolean(previous && previous.rows.length > 0),
    recent: db()
      .tsWeeks.filter((item) => item.employeeId === employee.id)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, 8)
      .map((item) => ({ id: item.id, weekStart: item.weekStart, status: item.status, totalQuarters: sum(item.rows.map((row) => sum(row.quarters))), decisionComment: item.decisionComment })),
  };
}

function editableWeek(employee: SeedEmployee, weekStart: string, version: number): MockTsWeek | undefined {
  const { max, min } = weekBounds(employee);
  if (!isMonday(weekStart)) throw problem(422, "INVALID_WEEK", "Timesheet weeks start on a Monday.", { fieldErrors: { weekStart: "Pick a Monday." } });
  if (weekStart > max) throw problem(422, "WEEK_TOO_FAR", "You can plan at most one week ahead.");
  if (weekStart < min) throw problem(422, "WEEK_CLOSED", "This week is outside the timesheet window.");
  const record = weekOf(employee.id, weekStart);
  if (record && (record.status === "submitted" || record.status === "approved"))
    throw problem(409, "TIMESHEET_LOCKED", record.status === "approved" ? "This week is approved and can't be changed." : "This week is waiting for approval. Ask your manager to reject it if you need changes.");
  versionCheck(record?.version ?? 0, version);
  return record;
}

export function saveMyTimesheet(actor: MockActor, input: SaveTimesheetInput, key: string) {
  requireCapability(actor, "timesheet.submit.self");
  return idempotent(key, () => {
    const employee = me(actor);
    const record = editableWeek(employee, input.weekStart, input.version);
    const days = daysFor(employee, input.weekStart);
    const assignable = new Map(assignableFor(employee.id, input.weekStart).map((project) => [project.id, project]));
    const fieldErrors: Record<string, string> = {};
    const seen = new Set<string>();
    input.rows.forEach((row, index) => {
      const project = assignable.get(row.projectId);
      const existing = record?.rows.some((item) => item.projectId === row.projectId && item.task === row.task);
      if (!project && !existing) fieldErrors[`rows.${index}.projectId`] = "You aren't assigned to this project, or it isn't active this week.";
      else if (project && !project.tasks.includes(row.task) && !existing) fieldErrors[`rows.${index}.task`] = "This task isn't part of the project.";
      else if (!project && existing && sum(row.hours) > sum(record?.rows.find((item) => item.projectId === row.projectId && item.task === row.task)?.quarters ?? []))
        fieldErrors[`rows.${index}.projectId`] = "This project is no longer open for new hours.";
      const rowKey = `${row.projectId}|${row.task}`;
      if (seen.has(rowKey)) fieldErrors[`rows.${index}.task`] = "This project and task is already on the sheet.";
      seen.add(rowKey);
      row.hours.forEach((value, day) => {
        const date = days[day]?.date ?? "";
        if (value > 0 && date < employee.joinedOn) fieldErrors[`rows.${index}.hours.${day}`] = "Before your joining date.";
      });
    });
    const totals = dayTotalsOf(input.rows.map((row) => ({ quarters: row.hours })));
    totals.forEach((total, day) => {
      if (total > MAX_DAY_QUARTERS) fieldErrors[`day.${day}`] = `${hoursLabel(total)} on ${dayLabel(days[day]?.date ?? input.weekStart)} — the limit is 16h a day.`;
    });
    const total = sum(totals);
    if (input.intent === "submit") {
      if (input.weekStart > db().today) fieldErrors.rows = "You can submit once the week has started.";
      else if (total === 0) fieldErrors.rows = "Add hours before submitting.";
    }
    if (Object.keys(fieldErrors).length > 0) throw problem(422, "VALIDATION_FAILED", "Check the highlighted hours.", { fieldErrors });

    const rows: MockTsRow[] = input.rows
      .filter((row) => input.intent === "save" || sum(row.hours) > 0)
      .map((row) => ({ projectId: row.projectId, task: row.task, note: row.note, quarters: [...row.hours] }));
    const target: MockTsWeek =
      record ??
      (() => {
        const created: MockTsWeek = { id: nextId("tsw"), employeeId: employee.id, weekStart: input.weekStart, status: "draft", rows: [], version: 0, submittedAt: null, decidedAt: null, deciderId: null, decisionComment: null, previousComment: null, audit: [] };
        db().tsWeeks.push(created);
        return created;
      })();
    const wasRejected = target.status === "rejected";
    target.rows = rows;
    target.version += 1;
    if (input.intent === "submit") {
      if (wasRejected) target.previousComment = target.decisionComment;
      target.status = "submitted";
      target.submittedAt = nowInstant();
      target.decidedAt = null;
      target.deciderId = null;
      target.decisionComment = null;
      target.audit.push(log(actor, `${wasRejected ? "Resubmitted" : "Submitted"} for approval (${hoursLabel(total)})`));
      if (employee.managerId)
        notify(employee.managerId, "approval", "Timesheet to approve", `${employee.name} submitted ${hoursLabel(total)} for the week of ${formatDate(input.weekStart, "short")}.`, "/timesheets/team");
    } else {
      target.audit.push(log(actor, `Draft saved (${hoursLabel(total)})`));
    }
    const warnings = warningsFor(days, totals);
    return { id: target.id, status: target.status, version: target.version, totalQuarters: total, warnings };
  });
}

export function copyPreviousWeek(actor: MockActor, input: CopyPreviousWeekInput, key: string) {
  requireCapability(actor, "timesheet.submit.self");
  return idempotent(key, () => {
    const employee = me(actor);
    const record = editableWeek(employee, input.weekStart, input.version);
    if (record && record.rows.some((row) => sum(row.quarters) > 0)) throw problem(409, "WEEK_NOT_EMPTY", "This week already has hours. Clear them before copying the previous week.");
    const source = weekOf(employee.id, addDays(input.weekStart, -7));
    if (!source || source.rows.length === 0) throw problem(404, "NOTHING_TO_COPY", "There's no timesheet for the previous week.");
    const days = daysFor(employee, input.weekStart);
    const assignable = new Set(assignableFor(employee.id, input.weekStart).map((project) => project.id));
    let skippedRows = 0;
    const rows: MockTsRow[] = [];
    for (const row of source.rows) {
      const project = projectById(row.projectId);
      if (!project || !assignable.has(row.projectId) || !project.tasks.includes(row.task)) {
        skippedRows += 1;
        continue;
      }
      rows.push({
        projectId: row.projectId,
        task: row.task,
        note: row.note,
        quarters: row.quarters.map((value, day) => {
          const info = days[day];
          const working = info && !info.weekend && !info.holiday && !info.leaveFull && info.date >= employee.joinedOn;
          return working ? value : 0;
        }),
      });
    }
    if (rows.length === 0) throw problem(409, "NOTHING_TO_COPY", "None of last week's projects are open to you this week.");
    const target: MockTsWeek =
      record ??
      (() => {
        const created: MockTsWeek = { id: nextId("tsw"), employeeId: employee.id, weekStart: input.weekStart, status: "draft", rows: [], version: 0, submittedAt: null, decidedAt: null, deciderId: null, decisionComment: null, previousComment: null, audit: [] };
        db().tsWeeks.push(created);
        return created;
      })();
    target.rows = rows;
    target.version += 1;
    const total = sum(rows.map((row) => sum(row.quarters)));
    target.audit.push(log(actor, `Copied ${rows.length} rows from the week of ${formatDate(source.weekStart, "short")} (${hoursLabel(total)})`));
    return { id: target.id, version: target.version, copiedRows: rows.length, skippedRows, totalQuarters: total };
  });
}

/* Team ---------------------------------------------------------------------- */

function teamView(record: MockTsWeek): TeamTimesheet {
  const employee = employeeById(record.employeeId);
  if (!employee) throw problem(404, "NOT_FOUND", "Employee not found.");
  const totals = dayTotalsOf(record.rows);
  return {
    id: record.id,
    employee: ref(employee),
    employeeCode: employee.code,
    weekStart: record.weekStart,
    weekEnd: weekEndOf(record.weekStart),
    status: record.status,
    version: record.version,
    totalQuarters: sum(totals),
    billableQuarters: billableOf(record.rows),
    dayTotals: totals,
    breakdown: record.rows.map((row) => {
      const view = rowView(row);
      return { projectCode: view.projectCode, projectName: view.projectName, task: view.task, billable: view.billable, note: view.note, quarters: view.quarters, totalQuarters: sum(view.quarters) };
    }),
    submittedAt: record.submittedAt,
    resubmission: record.previousComment !== null,
    previousComment: record.previousComment,
    decidedAt: record.decidedAt,
    decisionComment: record.decisionComment,
  };
}

function exportWindow() {
  const today = db().today;
  return { exportFrom: addDays(mondayOf(today), -42), exportTo: today };
}

export function teamTimesheets(actor: MockActor): TeamTimesheetsView {
  requireCapability(actor, "timesheet.approve");
  const reports = directReports(actor.employeeId);
  const ids = new Set(reports.map((employee) => employee.id));
  const store = db();
  const weeks = store.tsWeeks.filter((item) => ids.has(item.employeeId));
  const thisWeek = mondayOf(store.today);
  const missing: MissingTimesheet[] = [];
  for (const weekStart of [addDays(thisWeek, -7), addDays(thisWeek, -14)])
    for (const employee of reports) {
      if (employee.joinedOn > weekEndOf(weekStart) || employee.status === "onboarding") continue;
      const record = weeks.find((item) => item.employeeId === employee.id && item.weekStart === weekStart);
      if (record && (record.status === "submitted" || record.status === "approved")) continue;
      const reminder = store.tsReminders.filter((item) => item.employeeId === employee.id && item.weekStart === weekStart).sort((a, b) => b.at.localeCompare(a.at))[0];
      missing.push({ employee: ref(employee), weekStart, weekEnd: weekEndOf(weekStart), state: record?.status ?? "not_started", remindedAt: reminder?.at ?? null });
    }
  return {
    today: store.today,
    reportCount: reports.length,
    pending: weeks.filter((item) => item.status === "submitted").sort((a, b) => a.weekStart.localeCompare(b.weekStart) || (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "")).map(teamView),
    missing,
    recentDecisions: weeks
      .filter((item) => (item.status === "approved" || item.status === "rejected") && item.deciderId === actor.employeeId)
      .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
      .slice(0, 8)
      .map(teamView),
    ...exportWindow(),
  };
}

export function decideTimesheet(actor: MockActor, input: TimesheetDecisionInput) {
  requireCapability(actor, "timesheet.approve");
  const record = db().tsWeeks.find((item) => item.id === input.timesheetId);
  const employee = record ? employeeById(record.employeeId) : undefined;
  // Only the direct manager decides; HR capability does not widen this.
  if (!record || !employee || employee.managerId !== actor.employeeId) throw problem(404, "NOT_FOUND", "This timesheet isn't in your team queue.");
  if (record.employeeId === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't approve your own timesheet.");
  if (record.status !== "submitted") throw problem(409, "ALREADY_DECIDED", `This timesheet is already ${humanize(record.status).toLowerCase()}.`);
  versionCheck(record.version, input.version);
  const total = sum(record.rows.map((row) => sum(row.quarters)));
  const week = formatDate(record.weekStart, "short");
  record.status = input.decision === "approve" ? "approved" : "rejected";
  record.decidedAt = nowInstant();
  record.deciderId = actor.employeeId;
  record.decisionComment = input.comment.length > 0 ? input.comment : null;
  record.version += 1;
  record.audit.push(log(actor, input.decision === "approve" ? `Approved${input.comment ? `: ${input.comment}` : ""}` : `Rejected: ${input.comment}`));
  notify(
    employee.id,
    "approval",
    input.decision === "approve" ? "Timesheet approved" : "Timesheet sent back",
    input.decision === "approve" ? `${hoursLabel(total)} for the week of ${week} were approved.` : `Your week of ${week} needs changes: ${input.comment}`,
    `/timesheets?week=${record.weekStart}`,
  );
  return { reference: record.id, state: record.status, version: record.version };
}

export function remindTimesheet(actor: MockActor, input: TimesheetReminderInput) {
  requireCapability(actor, "timesheet.approve");
  const employee = directReports(actor.employeeId).find((item) => item.id === input.employeeId);
  if (!employee) throw problem(404, "NOT_FOUND", "This person isn't one of your direct reports.");
  const thisWeek = mondayOf(db().today);
  if (input.weekStart !== addDays(thisWeek, -7) && input.weekStart !== addDays(thisWeek, -14)) throw problem(422, "INVALID_WEEK", "Reminders are for the last two completed weeks.");
  const record = weekOf(employee.id, input.weekStart);
  if (record && (record.status === "submitted" || record.status === "approved")) throw problem(409, "ALREADY_SUBMITTED", "This week is already submitted.");
  const store = db();
  const recent = store.tsReminders.find((item) => item.employeeId === employee.id && item.weekStart === input.weekStart && diffDays(item.at.slice(0, 10), store.today) < 1);
  if (recent) return { reference: `${employee.id}:${input.weekStart}`, state: "already_reminded" };
  store.tsReminders.push({ employeeId: employee.id, weekStart: input.weekStart, at: nowInstant(), byId: actor.employeeId });
  notify(employee.id, "system", "Timesheet reminder", `${me(actor).name} asked you to submit your timesheet for the week of ${formatDate(input.weekStart, "short")}.`, `/timesheets?week=${input.weekStart}`);
  return { reference: `${employee.id}:${input.weekStart}`, state: "reminded" };
}

/* Projects ------------------------------------------------------------------ */

function projectView(project: MockTsProject): Project {
  let logged = 0;
  let approved = 0;
  const loggedTasks = new Set<string>();
  for (const week of db().tsWeeks) {
    for (const row of week.rows) {
      if (row.projectId !== project.id) continue;
      const hours = sum(row.quarters);
      if (hours > 0) loggedTasks.add(row.task);
      if (week.status === "submitted" || week.status === "approved") logged += hours;
      if (week.status === "approved") approved += hours;
    }
  }
  const members = project.memberIds.map((id) => employeeById(id)).filter((item): item is SeedEmployee => Boolean(item));
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    client: project.client,
    billable: project.billable,
    budgetQuarters: project.budgetQuarters,
    startDate: project.startDate,
    endDate: project.endDate,
    status: project.status,
    members: members.map(ref),
    memberIds: [...project.memberIds],
    tasks: [...project.tasks],
    version: project.version,
    loggedQuarters: logged,
    approvedQuarters: approved,
    billableQuarters: project.billable ? logged : 0,
    hasLoggedTasks: [...loggedTasks],
    audit: toAudit(project.audit),
  };
}

export function listProjects(actor: MockActor): ProjectsView {
  requireCapability(actor, "project.manage");
  const order = { active: 0, on_hold: 1, closed: 2 } as const;
  return {
    today: db().today,
    projects: [...db().tsProjects].sort((a, b) => order[a.status] - order[b.status] || a.code.localeCompare(b.code)).map(projectView),
    people: db()
      .employees.filter((employee) => employee.status !== "exited")
      .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name))
      .map((employee) => ({ id: employee.id, name: employee.name, designation: employee.designation, department: employee.department })),
    ...exportWindow(),
  };
}

const statusLabel = (status: MockTsProject["status"]) => humanize(status);

export function saveProject(actor: MockActor, input: ProjectInput, key: string) {
  requireCapability(actor, "project.manage");
  return idempotent(input.id ? undefined : key, () => {
    const store = db();
    const fieldErrors: Record<string, string> = {};
    const clash = store.tsProjects.find((item) => item.code === input.code && item.id !== input.id);
    if (clash) fieldErrors.code = `${input.code} is already used by ${clash.name}.`;
    const unknown = input.memberIds.filter((id) => {
      const employee = employeeById(id);
      return !employee || employee.status === "exited";
    });
    if (unknown.length > 0) fieldErrors.memberIds = "Some selected people are no longer active.";
    const existing = input.id ? store.tsProjects.find((item) => item.id === input.id) : undefined;
    if (input.id && !existing) throw problem(404, "NOT_FOUND", "This project no longer exists.");
    if (existing) {
      versionCheck(existing.version, input.version);
      const used = new Set(projectView(existing).hasLoggedTasks);
      const dropped = existing.tasks.filter((task) => used.has(task) && !input.tasks.includes(task));
      if (dropped.length > 0) fieldErrors.tasks = `Hours are logged against ${dropped.join(", ")} — keep ${dropped.length === 1 ? "it" : "them"} or close the project instead.`;
    }
    if (Object.keys(fieldErrors).length > 0) throw problem(422, "VALIDATION_FAILED", "Check the highlighted fields.", { fieldErrors });

    const next = {
      code: input.code,
      name: input.name,
      client: input.client.length > 0 ? input.client : null,
      billable: input.billable === "yes",
      budgetQuarters: input.budgetHours * 4,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      memberIds: [...new Set(input.memberIds)],
      tasks: input.tasks,
    };
    if (!existing) {
      const created: MockTsProject = { id: nextId("prj"), ...next, version: 1, audit: [log(actor, `Created ${next.code} with ${next.memberIds.length} members and ${next.tasks.length} tasks`)] };
      store.tsProjects.push(created);
      return { reference: created.code, state: created.status, version: created.version };
    }
    const changes: string[] = [];
    if (existing.code !== next.code) changes.push(`Code ${existing.code} → ${next.code}`);
    if (existing.name !== next.name) changes.push(`Renamed to “${next.name}”`);
    if (existing.client !== next.client) changes.push(`Client: ${existing.client ?? "Internal"} → ${next.client ?? "Internal"}`);
    if (existing.billable !== next.billable) changes.push(next.billable ? "Marked billable" : "Marked non-billable");
    if (existing.budgetQuarters !== next.budgetQuarters) changes.push(`Budget ${quarterHours(existing.budgetQuarters).replace(".00", "")}h → ${input.budgetHours}h`);
    if (existing.startDate !== next.startDate || existing.endDate !== next.endDate) changes.push(`Dates ${formatDate(next.startDate)} – ${formatDate(next.endDate)}`);
    if (existing.status !== next.status) changes.push(`Status: ${statusLabel(existing.status)} → ${statusLabel(next.status)}`);
    const added = next.memberIds.filter((id) => !existing.memberIds.includes(id)).length;
    const removed = existing.memberIds.filter((id) => !next.memberIds.includes(id)).length;
    if (added || removed) changes.push(`Members ${added ? `+${added}` : ""}${added && removed ? " / " : ""}${removed ? `−${removed}` : ""}`);
    if (existing.tasks.join("\n") !== next.tasks.join("\n")) changes.push(`Tasks updated (${next.tasks.length})`);
    if (changes.length === 0) return { reference: existing.code, state: existing.status, version: existing.version };
    Object.assign(existing, next);
    existing.version += 1;
    existing.audit.push(log(actor, changes.join(" · ")));
    return { reference: existing.code, state: existing.status, version: existing.version };
  });
}

/* Export -------------------------------------------------------------------- */

const csvCell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Approved hours by week/employee/project/task, clipped to [from, to]. */
export function approvedTimesheetsCsv(actor: MockActor, from: string, to: string) {
  if (!can(actor, "timesheet.approve") && !can(actor, "project.manage")) throw problem(403, "FORBIDDEN", "You don't have access to this.");
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (!valid(from) || !valid(to)) throw problem(422, "INVALID_RANGE", "Use from and to dates as YYYY-MM-DD.");
  if (to < from) throw problem(422, "INVALID_RANGE", "The end date can't be before the start date.");
  if (diffDays(from, to) > 186) throw problem(422, "RANGE_TOO_LONG", "Export at most 186 days at a time.");
  // Org-wide scope needs HR employee access; managers get their direct reports only.
  const orgWide = can(actor, "employee.read");
  const scope = orgWide ? null : new Set(directReports(actor.employeeId).map((employee) => employee.id));
  const lines = ["week_start,employee_code,employee_name,department,project_code,project_name,task,billable,hours"];
  const weeks = db()
    .tsWeeks.filter((week) => week.status === "approved" && week.weekStart <= to && weekEndOf(week.weekStart) >= from && (!scope || scope.has(week.employeeId)))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.employeeId.localeCompare(b.employeeId));
  for (const week of weeks) {
    const employee = employeeById(week.employeeId);
    if (!employee) continue;
    for (const row of week.rows) {
      const hours = sum(row.quarters.filter((_, day) => {
        const date = addDays(week.weekStart, day);
        return date >= from && date <= to;
      }));
      if (hours === 0) continue;
      const project = projectById(row.projectId);
      lines.push(
        [week.weekStart, employee.code, employee.name, employee.department, project?.code ?? "", project?.name ?? "", row.task, project?.billable ? "yes" : "no", quarterHours(hours)].map(csvCell).join(","),
      );
    }
  }
  return { csv: `${lines.join("\r\n")}\r\n`, fileName: `timesheets-approved-${from}-to-${to}.csv` };
}
