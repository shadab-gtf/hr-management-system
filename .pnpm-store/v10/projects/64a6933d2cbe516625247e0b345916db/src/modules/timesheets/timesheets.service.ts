import { required } from "../time/time.service.js";
import type { PrismaClient, TimeWorkflow } from "@prisma/client";
import { z } from "zod";
import { newId } from "../../core/database/ids.js";
import { assertVersion } from "../../core/http/request-context.js";
import { can } from "../../core/security/actor.js";
import { addDays, todayInOrgZone, daysBetween } from "../../utils/date.js";
import {
  type TimesheetWeek,
  type TeamTimesheet,
  type Project,
  type MyTimesheetView,
} from "../../contracts/timesheets.js";
import {
  createTimeRepository,
  timeCommand,
  json,
  type CommandContext,
  type TimeRepository,
} from "../time/time.repository.js";
import {
  calendarDay,
  employeeOf,
  fail,
  monday,
  personRef,
  requireDecision,
  scopedPeople,
  workflowOf,
} from "../time/time.service.js";
import { projectBody, sheetBody, sheetPayload, sheetRow } from "../time/time.schema.js";
import { toCsv } from "../../utils/csv.js";
async function projects(repo: TimeRepository) {
  return (await repo.documents("project")).map((doc) => ({
    ...projectBody.parse(doc.payload),
    id: doc.id,
    version: doc.version,
    scope: doc.scope,
  }));
}
async function sheetFor(repo: TimeRepository, employeeId: string, weekStart: string) {
  return (await repo.workflows({ kind: "timesheet", employeeId, startDate: weekStart }))[0] ?? null;
}
const totals = (rows: z.infer<typeof sheetRow>[]) =>
  Array.from({ length: 7 }, (_, i) => rows.reduce((sum, r) => sum + (r.quarterHours[i] ?? 0), 0));
export function createTimesheetsService(prisma: PrismaClient) {
  const repo = createTimeRepository(prisma);
  return {
    exportApproved(ctx: CommandContext, from: string, to: string) {
      return timeCommand(prisma, ctx, "timesheet.export", async (r) => {
        if (daysBetween(from, to) < 0 || daysBetween(from, to) > 186)
          fail("INVALID_RANGE", "Export a range of at most 186 days.");
        const people = await scopedPeople(r, ctx.actor),
          eligible = can(ctx.actor, "employee.read") ? people : people.filter((e) => e.id !== ctx.actor.employeeId),
          all = await projects(r),
          weeks = await r.workflows({
            kind: "timesheet",
            state: "approved",
            employeeId: { in: eligible.map((e) => e.id) },
            startDate: { lte: to },
            endDate: { gte: from },
          }),
          records: (string | number)[][] = [];
        for (const week of weeks) {
          const employee = required(eligible.find((e) => e.id === week.employeeId));
          for (const row of sheetPayload.parse(week.payload).rows) {
            const quarters = row.quarterHours.reduce((sum, q, i) => {
              const date = addDays(required(week.startDate), i);
              return sum + (date >= from && date <= to ? q : 0);
            }, 0);
            if (!quarters) continue;
            const project = all.find((p) => p.id === row.projectId);
            records.push([
              required(week.startDate),
              employee.code,
              employee.name,
              employee.department.name,
              project?.code ?? "",
              project?.name ?? "",
              row.task,
              project?.billable ? "yes" : "no",
              (quarters / 4).toFixed(2),
            ]);
          }
        }
        return {
          csv: toCsv(
            [
              "week_start",
              "employee_code",
              "employee_name",
              "department",
              "project_code",
              "project_name",
              "task",
              "billable",
              "hours",
            ],
            records,
          ),
          fileName: `timesheets-approved-${from}-to-${to}.csv`,
        };
      });
    },
    async mine(ctx: CommandContext, week?: string): Promise<MyTimesheetView> {
      const today = todayInOrgZone(),
        thisWeek = monday(today),
        start = week ?? thisWeek;
      validateWeek(start);
      const all = await projects(repo),
        rows = await repo.workflows({ employeeId: ctx.actor.employeeId, kind: "timesheet" }),
        row = rows.find((r) => r.startDate === start) ?? null,
        previous = rows.find((r) => r.startDate === addDays(start, -7));
      return {
        today,
        thisWeek,
        prevWeek: daysBetween(start, thisWeek) < 365 ? addDays(start, -7) : null,
        nextWeek: start < thisWeek ? addDays(start, 7) : null,
        week: await weekDto(repo, ctx.actor.employeeId, start, row),
        assignable: all
          .filter(
            (p) =>
              p.status === "active" &&
              p.memberIds.includes(ctx.actor.employeeId) &&
              p.startDate <= addDays(start, 6) &&
              p.endDate >= start,
          )
          .map((p) => ({ id: required(p.id), code: p.code, name: p.name, billable: p.billable, tasks: p.tasks })),
        previousWeekHasRows: previous ? sheetPayload.parse(previous.payload).rows.length > 0 : false,
        recent: rows.slice(0, 12).map((row) => ({
          id: row.id,
          weekStart: required(row.startDate),
          status: z.enum(["draft", "submitted", "approved", "rejected"]).parse(row.state),
          totalQuarters: totals(sheetPayload.parse(row.payload).rows).reduce((s, n) => s + n, 0),
          decisionComment: row.decisionNote,
        })),
      };
    },
    save(ctx: CommandContext, weekStart: string, input: z.infer<typeof sheetBody>) {
      return timeCommand(prisma, ctx, `timesheet.${weekStart}.${input.intent}`, async (r) => {
        validateWeek(weekStart);
        const e = await employeeOf(r, ctx.actor.employeeId),
          existing = await sheetFor(r, e.id, weekStart);
        assertVersion(existing?.version ?? 0, ctx.version);
        if (existing && !["draft", "rejected"].includes(existing.state))
          fail("TIMESHEET_LOCKED", "Submitted and approved timesheets cannot be edited.", 409);
        await validateRows(r, e.id, weekStart, input.rows, input.intent === "submit");
        if (input.intent === "submit" && !e.managerId) fail("NO_APPROVER", "A reporting manager is required.");
        const state = input.intent === "submit" ? "submitted" : "draft",
          payload = json({
            rows: input.rows,
            submittedAt: state === "submitted" ? new Date().toISOString() : null,
            resubmission: existing?.state === "rejected",
          }),
          id = existing?.id ?? newId("tsw");
        const row = existing
          ? await r.updateWorkflow(id, { state, payload, version: { increment: 1 }, decidedAt: null, decidedBy: null })
          : await r.createWorkflow({
              id,
              reference: `TS-${e.code}-${weekStart}`,
              kind: "timesheet",
              employeeId: e.id,
              approverId: e.managerId,
              startDate: weekStart,
              endDate: addDays(weekStart, 6),
              state,
              payload,
            });
        if (state === "submitted" && e.managerId)
          await r.notify(
            e.managerId,
            "Timesheet submitted",
            `${e.name} submitted the week of ${weekStart}.`,
            "/timesheets/team",
          );
        return {
          id: row.id,
          status: row.state,
          version: row.version,
          totalQuarters: totals(input.rows).reduce((s, n) => s + n, 0),
          warnings: [],
        };
      });
    },
    copy(ctx: CommandContext, weekStart: string) {
      return timeCommand(prisma, ctx, `timesheet.${weekStart}.copy_previous`, async (r) => {
        validateWeek(weekStart);
        const existing = await sheetFor(r, ctx.actor.employeeId, weekStart);
        assertVersion(existing?.version ?? 0, ctx.version);
        if (existing && !["draft", "rejected"].includes(existing.state))
          fail("TIMESHEET_LOCKED", "This week cannot be changed.", 409);
        if (existing && sheetPayload.parse(existing.payload).rows.length)
          fail("NONEMPTY_WEEK", "Clear the current draft before copying.", 409);
        const previous = await sheetFor(r, ctx.actor.employeeId, addDays(weekStart, -7));
        if (!previous) fail("NO_PREVIOUS_WEEK", "There is no previous timesheet to copy.", 409);
        const all = await projects(r),
          old = sheetPayload.parse(previous.payload).rows,
          rows = old
            .filter((row) =>
              all.some(
                (p) =>
                  p.id === row.projectId &&
                  p.status === "active" &&
                  p.memberIds.includes(ctx.actor.employeeId) &&
                  p.tasks.includes(row.task) &&
                  p.startDate <= weekStart &&
                  p.endDate >= weekStart,
              ),
            )
            .map((row) => ({ ...row, quarterHours: Array<number>(7).fill(0) }));
        const e = await employeeOf(r, ctx.actor.employeeId),
          payload = json({ rows, submittedAt: null, resubmission: false });
        const row = existing
          ? await r.updateWorkflow(existing.id, { payload, state: "draft", version: { increment: 1 } })
          : await r.createWorkflow({
              id: newId("tsw"),
              reference: `TS-${e.code}-${weekStart}`,
              kind: "timesheet",
              employeeId: e.id,
              approverId: e.managerId,
              startDate: weekStart,
              endDate: addDays(weekStart, 6),
              state: "draft",
              payload,
            });
        return {
          id: row.id,
          version: row.version,
          copiedRows: rows.length,
          skippedRows: old.length - rows.length,
          totalQuarters: 0,
        };
      });
    },
    async team(ctx: CommandContext) {
      const today = todayInOrgZone(),
        week = addDays(monday(today), -7),
        people = (await scopedPeople(repo, ctx.actor)).filter((e) => e.id !== ctx.actor.employeeId),
        rows = await repo.workflows({ kind: "timesheet", employeeId: { in: people.map((e) => e.id) } }),
        missing = [];
      for (const e of people) {
        const row = rows.find((r) => r.employeeId === e.id && r.startDate === week);
        if (!row || ["draft", "rejected"].includes(row.state)) {
          const reminders = await repo.workflows({ kind: "timesheet_reminder", employeeId: e.id, startDate: week });
          missing.push({
            employee: personRef(e),
            weekStart: week,
            weekEnd: addDays(week, 6),
            state: row?.state ?? "not_started",
            remindedAt: reminders[0]?.createdAt.toISOString() ?? null,
          });
        }
      }
      return {
        today,
        reportCount: people.length,
        pending: await Promise.all(rows.filter((r) => r.state === "submitted").map((r) => teamDto(repo, r))),
        missing,
        recentDecisions: await Promise.all(
          rows
            .filter((r) => ["approved", "rejected"].includes(r.state))
            .slice(0, 40)
            .map((r) => teamDto(repo, r)),
        ),
        exportFrom: addDays(week, -28),
        exportTo: addDays(week, 6),
      };
    },
    decision(ctx: CommandContext, id: string, decision: "approve" | "reject", comment: string) {
      return timeCommand(prisma, ctx, `timesheet.${id}.${decision}`, async (r) => {
        const row = await workflowOf(r, id, "timesheet");
        await requireDecision(r, ctx.actor, row);
        assertVersion(row.version, ctx.version);
        if (row.state !== "submitted") fail("NOT_SUBMITTED", "Only submitted timesheets can be decided.", 409);
        const state = decision === "approve" ? "approved" : "rejected",
          saved = await r.updateWorkflow(id, {
            state,
            decidedAt: new Date(),
            decidedBy: ctx.actor.employeeId,
            decisionNote: comment,
            version: { increment: 1 },
          });
        await r.notify(row.employeeId, `Timesheet ${state}`, `${row.startDate}: ${comment || state}`, "/timesheets");
        return { reference: row.reference, state, version: saved.version };
      });
    },
    remind(ctx: CommandContext, employeeId: string, weekStart: string) {
      return timeCommand(prisma, ctx, `timesheet.${employeeId}.${weekStart}.remind`, async (r, reference) => {
        validateWeek(weekStart);
        const people = await scopedPeople(r, ctx.actor);
        if (employeeId === ctx.actor.employeeId || !people.some((p) => p.id === employeeId))
          fail("FORBIDDEN", "This employee is outside your team.", 403);
        const sheet = await sheetFor(r, employeeId, weekStart);
        if (sheet && ["submitted", "approved"].includes(sheet.state))
          fail("ALREADY_SUBMITTED", "This timesheet is already submitted.", 409);
        const reminders = await r.workflows({
          kind: "timesheet_reminder",
          employeeId,
          startDate: weekStart,
          createdAt: { gte: new Date(Date.now() - 24 * 3600000) },
        });
        if (reminders.length) fail("REMINDER_ALREADY_SENT", "A reminder was sent within the last 24 hours.", 409);
        const ref = await reference("TR");
        await r.createWorkflow({
          id: newId("tsr"),
          reference: ref,
          kind: "timesheet_reminder",
          employeeId,
          approverId: ctx.actor.employeeId,
          startDate: weekStart,
          state: "sent",
          payload: json({ weekStart }),
        });
        await r.notify(employeeId, "Timesheet reminder", `Submit your timesheet for ${weekStart}.`, "/timesheets");
        return { reference: ref, state: "sent" };
      });
    },
    async listProjects(ctx: CommandContext) {
      const people = await scopedPeople(repo, ctx.actor),
        all = await projects(repo),
        ids = new Set(people.map((p) => p.id)),
        visible = all.filter(
          (p) =>
            can(ctx.actor, "employee.read") ||
            p.scope === ctx.actor.employeeId ||
            p.memberIds.some((id) => ids.has(id)),
        );
      return {
        today: todayInOrgZone(),
        projects: await Promise.all(visible.map((p) => projectDto(repo, required(p.id)))),
        people: people.map((e) => ({
          id: e.id,
          name: e.name,
          designation: e.designation,
          department: e.department.name,
        })),
        exportFrom: addDays(monday(todayInOrgZone()), -28),
        exportTo: todayInOrgZone(),
      };
    },
    saveProject(ctx: CommandContext, input: z.infer<typeof projectBody>, id?: string) {
      return timeCommand(prisma, ctx, `project.${id ?? "create"}.save`, async (r) => {
        const people = await scopedPeople(r, ctx.actor),
          ids = new Set(people.map((p) => p.id));
        if (input.memberIds.some((id) => !ids.has(id)))
          fail("FORBIDDEN", "Project membership must stay within your team.", 403);
        const key = id ?? newId("prj"),
          all = await projects(r),
          old = all.find((p) => p.id === key);
        if (id && !old) fail("NOT_FOUND", "Project was not found.", 404);
        if (
          old &&
          !can(ctx.actor, "employee.read") &&
          old.scope !== ctx.actor.employeeId &&
          !old.memberIds.some((id) => ids.has(id))
        )
          fail("FORBIDDEN", "This project is outside your team.", 403);
        assertVersion(old?.version ?? 0, ctx.version);
        if (all.some((p) => p.id !== key && p.code === input.code))
          fail("DUPLICATE_PROJECT_CODE", "This project code is already in use.", 409);
        const weeks = await r.workflows({ kind: "timesheet" }),
          logged = weeks
            .flatMap((w) => sheetPayload.parse(w.payload).rows)
            .filter((row) => row.projectId === key && row.quarterHours.some((q) => q > 0));
        if (logged.some((row) => !input.tasks.includes(row.task)))
          fail("TASK_IN_USE", "Tasks with logged time cannot be removed.", 409);
        const saved = await r.saveDocument(key, "project", { ...input, id: key }, old?.scope ?? ctx.actor.employeeId);
        return { reference: input.code, state: input.status, version: saved.version };
      });
    },
  };
}
function validateWeek(week: string) {
  if (week !== monday(week)) fail("INVALID_WEEK", "The timesheet week must start on Monday.");
  const delta = daysBetween(week, monday(todayInOrgZone()));
  if (delta < 0 || delta > 365) fail("INVALID_WEEK", "Choose a current or historical week within the last year.");
}
async function validateRows(
  repo: TimeRepository,
  employeeId: string,
  week: string,
  rows: z.infer<typeof sheetRow>[],
  submit: boolean,
) {
  const all = await projects(repo),
    today = todayInOrgZone(),
    dayTotals = totals(rows);
  if (dayTotals.some((v) => v > 64)) fail("DAILY_HOURS_LIMIT", "A day cannot contain more than 16 hours.");
  if (submit && dayTotals.every((v) => v === 0)) fail("EMPTY_TIMESHEET", "Enter time before submitting.");
  const keys = new Set<string>();
  for (const row of rows) {
    const key = `${row.projectId}:${row.task}`;
    if (keys.has(key)) fail("DUPLICATE_ROW", "Combine duplicate project and task rows.");
    keys.add(key);
    const p = all.find((p) => p.id === row.projectId);
    if (!p || p.status !== "active" || !p.memberIds.includes(employeeId) || !p.tasks.includes(row.task))
      fail("INVALID_PROJECT", "Choose an assigned active project and task.");
    for (const [index, hours] of row.quarterHours.entries()) {
      const date = addDays(week, index);
      if (hours > 0 && (date < p.startDate || date > p.endDate))
        fail("PROJECT_DATE_RANGE", "Logged dates must fall within the project dates.");
      if (hours > 0 && date > today) fail("FUTURE_HOURS", "Future work cannot be logged.");
    }
  }
  for (const [index, hours] of dayTotals.entries()) {
    if (!hours) continue;
    const day = await calendarDay(repo, employeeId, addDays(week, index));
    if (day.leave?.state === "approved" && !day.type?.countsAsPresent && day.leaveData?.portion === "full")
      fail("LEAVE_CONFLICT", "Time cannot be logged on approved full-day leave.");
    if (
      day.leave?.state === "approved" &&
      !day.type?.countsAsPresent &&
      day.leaveData?.portion !== "full" &&
      hours > 32
    )
      fail("LEAVE_CONFLICT", "Half-day leave allows at most eight logged hours.");
  }
}
async function weekDto(
  repo: TimeRepository,
  employeeId: string,
  start: string,
  row: TimeWorkflow | null,
): Promise<TimesheetWeek> {
  const payload = row ? sheetPayload.parse(row.payload) : { rows: [], submittedAt: null, resubmission: false },
    all = await projects(repo),
    rows = payload.rows.map((r) => {
      const p = all.find((p) => p.id === r.projectId);
      return {
        projectId: r.projectId,
        projectCode: p?.code ?? r.projectId,
        projectName: p?.name ?? "Archived project",
        billable: p?.billable ?? false,
        task: r.task,
        note: r.note,
        quarters: r.quarterHours,
      };
    }),
    dayTotals = totals(payload.rows),
    days = await Promise.all(
      Array.from({ length: 7 }, async (_, i) => {
        const date = addDays(start, i),
          cal = await calendarDay(repo, employeeId, date);
        return {
          date,
          weekend: cal.off,
          holiday: cal.holiday,
          leave: cal.type?.name ?? null,
          leaveFull: cal.leaveData?.portion === "full",
          leavePending: cal.leave?.state === "pending",
          future: date > todayInOrgZone(),
        };
      }),
    );
  return {
    id: row?.id ?? null,
    weekStart: start,
    weekEnd: addDays(start, 6),
    status: row ? z.enum(["draft", "submitted", "approved", "rejected"]).parse(row.state) : "not_started",
    version: row?.version ?? 0,
    editable: !row || ["draft", "rejected"].includes(row.state),
    canSubmit: (!row || ["draft", "rejected"].includes(row.state)) && dayTotals.some((n) => n > 0),
    rows,
    days,
    dayTotals,
    totalQuarters: dayTotals.reduce((s, n) => s + n, 0),
    billableQuarters: rows.filter((r) => r.billable).reduce((s, r) => s + r.quarters.reduce((a, b) => a + b, 0), 0),
    submittedAt: payload.submittedAt,
    decidedAt: row?.decidedAt?.toISOString() ?? null,
    decidedBy: row?.decidedBy ? personRef(await employeeOf(repo, row.decidedBy)) : null,
    decisionComment: row?.decisionNote ?? null,
    warnings: [],
    audit: row
      ? [
          {
            id: row.id,
            at: row.createdAt.toISOString(),
            actor: (await employeeOf(repo, employeeId)).name,
            event: "Timesheet created",
          },
          ...(row.decidedAt
            ? [
                {
                  id: `${row.id}:decision`,
                  at: row.decidedAt.toISOString(),
                  actor: row.decidedBy ? (await employeeOf(repo, row.decidedBy)).name : "Approver",
                  event: row.state,
                },
              ]
            : []),
        ]
      : [],
  };
}
async function teamDto(repo: TimeRepository, row: TimeWorkflow): Promise<TeamTimesheet> {
  const w = await weekDto(repo, row.employeeId, required(row.startDate), row),
    e = await employeeOf(repo, row.employeeId),
    p = sheetPayload.parse(row.payload);
  return {
    id: row.id,
    employee: personRef(e),
    employeeCode: e.code,
    weekStart: w.weekStart,
    weekEnd: w.weekEnd,
    status: w.status,
    version: row.version,
    totalQuarters: w.totalQuarters,
    billableQuarters: w.billableQuarters,
    dayTotals: w.dayTotals,
    breakdown: w.rows.map((r) => ({ ...r, totalQuarters: r.quarters.reduce((s, n) => s + n, 0) })),
    submittedAt: w.submittedAt,
    resubmission: p.resubmission,
    previousComment: row.decisionNote,
    decidedAt: w.decidedAt,
    decisionComment: w.decisionComment,
  };
}
async function projectDto(repo: TimeRepository, id: string): Promise<Project> {
  const p = required((await projects(repo)).find((p) => p.id === id)),
    people = await repo.people({ id: { in: p.memberIds } }),
    weeks = await repo.workflows({ kind: "timesheet", state: { in: ["submitted", "approved"] } }),
    logged = weeks.flatMap((w) =>
      sheetPayload
        .parse(w.payload)
        .rows.filter((r) => r.projectId === id)
        .map((r) => ({ row: r, state: w.state })),
    ),
    total = logged.reduce((s, r) => s + r.row.quarterHours.reduce((a, b) => a + b, 0), 0),
    approved = logged
      .filter((r) => r.state === "approved")
      .reduce((s, r) => s + r.row.quarterHours.reduce((a, b) => a + b, 0), 0);
  return {
    id,
    code: p.code,
    name: p.name,
    client: p.client || null,
    billable: p.billable,
    budgetQuarters: p.budgetQuarterHours,
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status,
    members: people.map(personRef),
    memberIds: p.memberIds,
    tasks: p.tasks,
    version: p.version,
    loggedQuarters: total,
    approvedQuarters: approved,
    billableQuarters: p.billable ? total : 0,
    hasLoggedTasks: [...new Set(logged.map((r) => r.row.task))],
    audit: [],
  };
}

