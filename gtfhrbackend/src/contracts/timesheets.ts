import { z } from "zod";
import { personRefSchema } from "./common.js";

/*
 * Timesheets contract. Hours are exchanged as integer quarter-hours
 * (1 = 15 minutes) so totals never drift through floating point.
 */

export const QUARTERS_PER_HOUR = 4;
export const MAX_DAY_QUARTERS = 16 * QUARTERS_PER_HOUR;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const quarters = z.number().int().nonnegative();

/** Integer quarter-hours → exact decimal hours, e.g. 30 → "7.50". */
export function quarterHours(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(value));
  const whole = Math.floor(abs / QUARTERS_PER_HOUR);
  const hundredths = (abs % QUARTERS_PER_HOUR) * 25;
  return `${sign}${whole}.${String(hundredths).padStart(2, "0")}`;
}
/** Compact label: 30 → "7.5h", 32 → "8h". */
export function hoursLabel(value: number): string {
  return `${quarterHours(value).replace(/\.?0+$/, "")}h`;
}
/** "7.5" / "7.50" / "7" → 30 quarter-hours; null if not a whole quarter. */
export function parseQuarterHours(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (hundredths % 25 !== 0) return null;
  return hundredths / 25;
}

/* Read models --------------------------------------------------------------- */

export const timesheetStatusSchema = z.enum(["not_started", "draft", "submitted", "approved", "rejected"]);
export const projectStatusSchema = z.enum(["active", "on_hold", "closed"]);

export const tsAuditEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.string(),
  event: z.string(),
});

export const timesheetDaySchema = z.object({
  date: isoDate,
  weekend: z.boolean(),
  holiday: z.string().nullable(),
  /** Leave label, e.g. "Casual leave" or "Sick leave (first half)". */
  leave: z.string().nullable(),
  leaveFull: z.boolean(),
  leavePending: z.boolean(),
  future: z.boolean(),
});

export const timesheetRowSchema = z.object({
  projectId: z.string(),
  projectCode: z.string(),
  projectName: z.string(),
  billable: z.boolean(),
  task: z.string(),
  note: z.string(),
  quarters: z.array(quarters).length(7),
});

export const timesheetWeekSchema = z.object({
  id: z.string().nullable(),
  weekStart: isoDate,
  weekEnd: isoDate,
  status: timesheetStatusSchema,
  version: z.number().int().nonnegative(),
  editable: z.boolean(),
  canSubmit: z.boolean(),
  rows: z.array(timesheetRowSchema),
  days: z.array(timesheetDaySchema).length(7),
  dayTotals: z.array(quarters).length(7),
  totalQuarters: quarters,
  billableQuarters: quarters,
  submittedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decidedBy: personRefSchema.nullable(),
  decisionComment: z.string().nullable(),
  warnings: z.array(z.string()),
  audit: z.array(tsAuditEntrySchema),
});

export const assignableProjectSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  billable: z.boolean(),
  tasks: z.array(z.string()),
});

export const timesheetSummarySchema = z.object({
  id: z.string(),
  weekStart: isoDate,
  status: timesheetStatusSchema,
  totalQuarters: quarters,
  decisionComment: z.string().nullable(),
});

export const myTimesheetViewSchema = z.object({
  today: isoDate,
  thisWeek: isoDate,
  prevWeek: isoDate.nullable(),
  nextWeek: isoDate.nullable(),
  week: timesheetWeekSchema,
  assignable: z.array(assignableProjectSchema),
  previousWeekHasRows: z.boolean(),
  recent: z.array(timesheetSummarySchema),
});

export const projectBreakdownSchema = z.object({
  projectCode: z.string(),
  projectName: z.string(),
  task: z.string(),
  billable: z.boolean(),
  note: z.string(),
  quarters: z.array(quarters).length(7),
  totalQuarters: quarters,
});

export const teamTimesheetSchema = z.object({
  id: z.string(),
  employee: personRefSchema,
  employeeCode: z.string(),
  weekStart: isoDate,
  weekEnd: isoDate,
  status: timesheetStatusSchema,
  version: z.number().int().positive(),
  totalQuarters: quarters,
  billableQuarters: quarters,
  dayTotals: z.array(quarters).length(7),
  breakdown: z.array(projectBreakdownSchema),
  submittedAt: z.string().nullable(),
  resubmission: z.boolean(),
  previousComment: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionComment: z.string().nullable(),
});

export const missingTimesheetSchema = z.object({
  employee: personRefSchema,
  weekStart: isoDate,
  weekEnd: isoDate,
  state: timesheetStatusSchema,
  remindedAt: z.string().nullable(),
});

export const teamTimesheetsViewSchema = z.object({
  today: isoDate,
  reportCount: z.number().int().nonnegative(),
  pending: z.array(teamTimesheetSchema),
  missing: z.array(missingTimesheetSchema),
  recentDecisions: z.array(teamTimesheetSchema),
  exportFrom: isoDate,
  exportTo: isoDate,
});

export const projectSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  client: z.string().nullable(),
  billable: z.boolean(),
  budgetQuarters: quarters,
  startDate: isoDate,
  endDate: isoDate,
  status: projectStatusSchema,
  members: z.array(personRefSchema),
  memberIds: z.array(z.string()),
  tasks: z.array(z.string()),
  version: z.number().int().positive(),
  /** Submitted + approved hours. */
  loggedQuarters: quarters,
  approvedQuarters: quarters,
  billableQuarters: quarters,
  hasLoggedTasks: z.array(z.string()),
  audit: z.array(tsAuditEntrySchema),
});

export const projectMemberOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  designation: z.string(),
  department: z.string(),
});

export const projectsViewSchema = z.object({
  today: isoDate,
  projects: z.array(projectSchema),
  people: z.array(projectMemberOptionSchema),
  exportFrom: isoDate,
  exportTo: isoDate,
});

export type TimesheetStatus = z.infer<typeof timesheetStatusSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type TsAuditEntry = z.infer<typeof tsAuditEntrySchema>;
export type TimesheetDay = z.infer<typeof timesheetDaySchema>;
export type TimesheetRow = z.infer<typeof timesheetRowSchema>;
export type TimesheetWeek = z.infer<typeof timesheetWeekSchema>;
export type AssignableProject = z.infer<typeof assignableProjectSchema>;
export type TimesheetSummary = z.infer<typeof timesheetSummarySchema>;
export type MyTimesheetView = z.infer<typeof myTimesheetViewSchema>;
export type ProjectBreakdown = z.infer<typeof projectBreakdownSchema>;
export type TeamTimesheet = z.infer<typeof teamTimesheetSchema>;
export type MissingTimesheet = z.infer<typeof missingTimesheetSchema>;
export type TeamTimesheetsView = z.infer<typeof teamTimesheetsViewSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectMemberOption = z.infer<typeof projectMemberOptionSchema>;
export type ProjectsView = z.infer<typeof projectsViewSchema>;

/* Inputs -------------------------------------------------------------------- */

const hoursText = z
  .string()
  .max(6)
  .refine((value) => parseQuarterHours(value) !== null, "Use hours in steps of 0.25 (e.g. 7.5).")
  .transform((value) => parseQuarterHours(value) ?? 0)
  .refine((value) => value <= MAX_DAY_QUARTERS, "At most 16 hours.");

export const timesheetRowInputSchema = z.object({
  projectId: z.string().min(1, "Choose a project."),
  task: z.string().trim().min(1, "Choose a task.").max(60),
  note: z.string().trim().max(200, "Keep the note under 200 characters.").default(""),
  hours: z.array(hoursText).length(7),
});

export const saveTimesheetInputSchema = z.object({
  weekStart: isoDate,
  version: z.coerce.number().int().nonnegative(),
  intent: z.enum(["save", "submit"]),
  rows: z.array(timesheetRowInputSchema).max(25, "At most 25 rows per week."),
});

export const copyPreviousWeekInputSchema = z.object({
  weekStart: isoDate,
  version: z.coerce.number().int().nonnegative(),
});

export const timesheetDecisionInputSchema = z
  .object({
    timesheetId: z.string().min(1),
    version: z.coerce.number().int().positive(),
    decision: z.enum(["approve", "reject"]),
    comment: z.string().trim().max(500, "Keep the comment under 500 characters.").default(""),
  })
  .superRefine((value, context) => {
    if (value.decision === "reject" && value.comment.length < 5)
      context.addIssue({ code: "custom", path: ["comment"], message: "Tell the employee what to fix (at least 5 characters)." });
  });

export const timesheetReminderInputSchema = z.object({
  employeeId: z.string().min(1),
  weekStart: isoDate,
});

export const projectInputSchema = z
  .object({
    id: z.string().optional(),
    version: z.coerce.number().int().positive().optional(),
    code: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z][A-Z0-9]{1,9}(-[A-Z0-9]{1,10}){1,3}$/, "Use an uppercase code like GTF-WEB-01.").max(24)),
    name: z.string().trim().min(3, "Enter a project name.").max(80),
    client: z.string().trim().max(80).default(""),
    billable: z.enum(["yes", "no"]),
    budgetHours: z.coerce
      .number({ message: "Enter budget hours." })
      .int("Use whole hours.")
      .min(1, "Budget must be at least 1 hour.")
      .max(100_000, "Budget looks too large."),
    startDate: isoDate,
    endDate: isoDate,
    status: projectStatusSchema,
    memberIds: z.array(z.string()).min(1, "Add at least one member.").max(60),
    tasks: z
      .string()
      .transform((value) => [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))])
      .pipe(
        z
          .array(z.string().max(60, "Keep each task under 60 characters."))
          .min(1, "Add at least one task.")
          .max(20, "At most 20 tasks per project."),
      ),
  })
  .superRefine((value, context) => {
    if (value.endDate < value.startDate)
      context.addIssue({ code: "custom", path: ["endDate"], message: "End date can't be before the start date." });
    if (value.billable === "yes" && value.client.length === 0)
      context.addIssue({ code: "custom", path: ["client"], message: "Billable projects need a client." });
  });

export type TimesheetRowInput = z.infer<typeof timesheetRowInputSchema>;
export type SaveTimesheetInput = z.infer<typeof saveTimesheetInputSchema>;
export type CopyPreviousWeekInput = z.infer<typeof copyPreviousWeekInputSchema>;
export type TimesheetDecisionInput = z.infer<typeof timesheetDecisionInputSchema>;
export type TimesheetReminderInput = z.infer<typeof timesheetReminderInputSchema>;
export type ProjectInput = z.infer<typeof projectInputSchema>;
