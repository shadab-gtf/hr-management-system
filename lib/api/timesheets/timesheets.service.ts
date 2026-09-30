import "server-only";
import { cache } from "react";
import { z } from "zod";
import { apiConfig } from "@/lib/api/core/config";
import { problem } from "@/lib/api/core/problem";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  approvedTimesheetsCsv,
  copyPreviousWeek,
  decideTimesheet,
  listProjects,
  myTimesheet,
  remindTimesheet,
  saveMyTimesheet,
  saveProject,
  teamTimesheets,
} from "@/lib/mocks/handlers/timesheets";
import {
  myTimesheetViewSchema,
  projectsViewSchema,
  teamTimesheetsViewSchema,
  timesheetStatusSchema,
  type CopyPreviousWeekInput,
  type ProjectInput,
  type SaveTimesheetInput,
  type TimesheetDecisionInput,
  type TimesheetReminderInput,
} from "@/types/timesheets";

/* Reads --------------------------------------------------------------------- */

export const getMyTimesheet = cache(async (week: string | null) =>
  callApi({
    schema: myTimesheetViewSchema,
    live: { path: "/timesheets/weeks/me", query: { week } },
    mock: async () => myTimesheet(await mockActor(), week),
  }),
);

export const getTeamTimesheets = cache(async () =>
  callApi({
    schema: teamTimesheetsViewSchema,
    live: { path: "/timesheets/team" },
    mock: async () => teamTimesheets(await mockActor()),
  }),
);

export const getProjects = cache(async () =>
  callApi({
    schema: projectsViewSchema,
    live: { path: "/projects" },
    mock: async () => listProjects(await mockActor()),
  }),
);

/* Commands ------------------------------------------------------------------ */

export async function saveTimesheet(input: SaveTimesheetInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), status: timesheetStatusSchema, version: z.number().int(), totalQuarters: z.number().int(), warnings: z.array(z.string()) }),
    live: {
      method: "POST",
      path: `/timesheets/weeks/me/${input.weekStart}`,
      body: { intent: input.intent, rows: input.rows.map((row) => ({ projectId: row.projectId, task: row.task, note: row.note, quarterHours: row.hours })) },
      idempotencyKey,
      ifMatch: input.version,
    },
    mock: async () => saveMyTimesheet(await mockActor(), input, idempotencyKey),
  });
}

export async function copyTimesheetFromPreviousWeek(input: CopyPreviousWeekInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), version: z.number().int(), copiedRows: z.number().int(), skippedRows: z.number().int(), totalQuarters: z.number().int() }),
    live: { method: "POST", path: `/timesheets/weeks/me/${input.weekStart}/copy-previous`, idempotencyKey, ifMatch: input.version },
    mock: async () => copyPreviousWeek(await mockActor(), input, idempotencyKey),
  });
}

export async function decideTeamTimesheet(input: TimesheetDecisionInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string(), version: z.number().int() }),
    live: { method: "POST", path: `/timesheets/weeks/${input.timesheetId}/decision`, body: { decision: input.decision, comment: input.comment }, idempotencyKey, ifMatch: input.version },
    mock: async () => decideTimesheet(await mockActor(), input),
  });
}

export async function remindMissingTimesheet(input: TimesheetReminderInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: { method: "POST", path: "/timesheets/reminders", body: input, idempotencyKey },
    mock: async () => remindTimesheet(await mockActor(), input),
  });
}

export async function upsertProject(input: ProjectInput, idempotencyKey: string) {
  const body = { ...input, budgetQuarterHours: input.budgetHours * 4, billable: input.billable === "yes" };
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string(), version: z.number().int() }),
    live: input.id
      ? { method: "PATCH", path: `/projects/${input.id}`, body, idempotencyKey, ...(input.version !== undefined ? { ifMatch: input.version } : {}) }
      : { method: "POST", path: "/projects", body, idempotencyKey },
    mock: async () => saveProject(await mockActor(), input, idempotencyKey),
  });
}

/* Export -------------------------------------------------------------------- */

export async function exportApprovedTimesheets(from: string, to: string) {
  if (apiConfig.mode === "mock") return approvedTimesheetsCsv(await mockActor(), from, to);
  throw problem(501, "EXPORT_VIA_JOB", "Exports run as report jobs on the live service.");
}
