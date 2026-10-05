import { z } from "zod";
import { instantSchema, isoDateSchema, personRefSchema } from "./common.js";
import { roleSchema } from "./session.js";

/* Report contract: standard library, analytics, custom builder, saved reports,
 * schedules, deliveries and the export audit log. */

const monthValue = z.union([z.literal(""), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a valid month.")]);
const dateValue = z.union([z.literal(""), isoDateSchema]);

export const reportCategorySchema = z.enum(["people", "time", "payroll", "compliance"]);
export const reportFilterKindSchema = z.enum(["month", "range", "department", "location", "status", "leaveState"]);

export const standardReportKeySchema = z.enum([
  "headcount",
  "joiners_leavers",
  "attrition",
  "probation_due",
  "celebrations",
  "attendance_summary",
  "late_coming",
  "leave_balances",
  "leave_availed",
  "salary_register",
  "ctc_by_department",
]);

export const standardReportSchema = z.object({
  key: standardReportKeySchema,
  category: reportCategorySchema,
  title: z.string(),
  description: z.string(),
  filters: z.array(reportFilterKindSchema),
  /** Needs payroll.prepare, payroll.approve or compensation.manage. */
  salary: z.boolean(),
});

export const reportFiltersSchema = z.object({
  department: z.string().max(80).default(""),
  location: z.string().max(80).default(""),
  /** "" = current employees (everyone not exited). */
  status: z.union([z.literal(""), z.enum(["active", "on_leave", "onboarding", "notice", "exited"])]).default(""),
  leaveState: z.union([z.literal(""), z.enum(["pending", "approved", "rejected", "cancelled"])]).default(""),
  month: monthValue.default(""),
  from: dateValue.default(""),
  to: dateValue.default(""),
});

export const reportDatasetSchema = z.enum(["employees", "attendance", "leave_requests", "leave_balances", "payroll_register"]);
export const columnKindSchema = z.enum(["text", "number", "date", "money"]);
export const aggregateFnSchema = z.enum(["count", "sum", "avg"]);

export const reportColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: columnKindSchema,
  /** Salary figure: only for payroll/compensation holders. */
  salary: z.boolean(),
  /** Personal identifier, always exported masked. */
  pii: z.boolean(),
});

export const datasetSchema = z.object({
  id: reportDatasetSchema,
  label: z.string(),
  description: z.string(),
  filters: z.array(reportFilterKindSchema),
  columns: z.array(reportColumnSchema),
  defaultColumns: z.array(z.string()),
  /** Whole dataset needs salary access (payroll register). */
  salary: z.boolean(),
});

export const reportSpecSchema = z
  .object({
    dataset: reportDatasetSchema,
    columns: z.array(z.string().max(40)).min(1, "Choose at least one column.").max(24, "Choose at most 24 columns."),
    filters: reportFiltersSchema,
    sort: z.object({ column: z.string().max(40), direction: z.enum(["asc", "desc"]) }).nullable(),
    groupBy: z.string().max(40).nullable(),
    aggregate: z.object({ fn: aggregateFnSchema, column: z.string().max(40).nullable() }).nullable(),
  })
  .refine((spec) => !spec.filters.from || !spec.filters.to || spec.filters.from <= spec.filters.to, {
    message: "The end date must be on or after the start date.",
    path: ["to"],
  });

export const reportCellSchema = z.union([z.string(), z.number(), z.null()]);
export const reportTableSchema = z.object({
  title: z.string(),
  columns: z.array(reportColumnSchema.pick({ key: true, label: true, kind: true })),
  rows: z.array(z.record(z.string(), reportCellSchema)),
  totalRows: z.number().int().nonnegative(),
  /** Preview holds the first 50 rows only. */
  truncated: z.boolean(),
  notes: z.array(z.string()),
});

export const scheduleFrequencySchema = z.enum(["daily", "weekly", "monthly"]);
export const exportFormatSchema = z.enum(["csv", "xls"]);

export const reportScheduleSchema = z.object({
  frequency: scheduleFrequencySchema,
  /** 1 = Monday … 7 = Sunday (weekly). */
  weekday: z.number().int().min(1).max(7),
  /** 1–28 so every month has the day (monthly). */
  dayOfMonth: z.number().int().min(1).max(28),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  format: exportFormatSchema,
  recipients: z.array(personRefSchema),
  active: z.boolean(),
  nextRunAt: instantSchema.nullable(),
});

export const savedReportSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  spec: reportSpecSchema,
  visibility: z.enum(["private", "shared"]),
  sharedRoles: z.array(roleSchema),
  owner: personRefSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
  version: z.number().int(),
  canEdit: z.boolean(),
  /** Salary columns hidden from this viewer (shared report opened without salary access). */
  hiddenColumns: z.array(z.string()),
  schedule: reportScheduleSchema.nullable(),
  lastRunAt: instantSchema.nullable(),
});

export const deliveryLogEntrySchema = z.object({
  id: z.string(),
  savedReportId: z.string(),
  reportName: z.string(),
  at: instantSchema,
  recipients: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
  format: exportFormatSchema,
  trigger: z.enum(["schedule", "manual"]),
});

export const exportLogEntrySchema = z.object({
  id: z.string(),
  at: instantSchema,
  actor: personRefSchema,
  report: z.string(),
  source: z.enum(["standard", "custom", "saved", "schedule"]),
  format: exportFormatSchema,
  rowCount: z.number().int().nonnegative(),
  filters: z.string(),
});

export const reportLibrarySchema = z.object({
  reports: z.array(standardReportSchema),
  salaryAccess: z.boolean(),
  statutoryAccess: z.boolean(),
  departments: z.array(z.string()),
  locations: z.array(z.string()),
  today: isoDateSchema,
  currentMonth: z.string(),
});

const countRow = z.object({ name: z.string(), count: z.number().int() });
export const reportAnalyticsSchema = z.object({
  asOf: isoDateSchema,
  headcount: z.number().int(),
  trend: z.array(
    z.object({
      month: z.string(),
      label: z.string(),
      headcount: z.number().int(),
      joiners: z.number().int(),
      leavers: z.number().int(),
      /** Monthly attrition annualized (×12), one decimal. */
      attritionPct: z.string(),
    }),
  ),
  attrition: z.object({ leavers: z.number().int(), averageHeadcount: z.string(), annualizedPct: z.string(), voluntary: z.number().int() }),
  byDepartment: z.array(countRow),
  byLocation: z.array(countRow),
  byGender: z.array(countRow),
  tenure: z.array(countRow),
  byType: z.array(countRow),
});

export const builderContextSchema = z.object({
  datasets: z.array(datasetSchema),
  departments: z.array(z.string()),
  locations: z.array(z.string()),
  currentMonth: z.string(),
  salaryAccess: z.boolean(),
  roles: z.array(z.object({ id: roleSchema, label: z.string() })),
  recipients: z.array(personRefSchema),
});

export const exportFileSchema = z.object({ fileName: z.string(), contentType: z.string(), content: z.string(), rowCount: z.number().int() });

export const saveReportInputSchema = z.object({
  id: z.string().max(40).optional(),
  version: z.coerce.number().int().optional(),
  name: z.string().trim().min(3, "Give the report a name of at least 3 characters.").max(80, "Keep the name under 80 characters."),
  description: z.string().trim().max(240, "Keep the description under 240 characters.").default(""),
  visibility: z.enum(["private", "shared"]),
  sharedRoles: z.array(z.enum(["hr_operator", "payroll_operator", "payroll_approver"])),
  spec: reportSpecSchema,
});

export const scheduleInputSchema = z.object({
  reportId: z.string().min(1).max(40),
  frequency: scheduleFrequencySchema,
  weekday: z.coerce.number().int().min(1).max(7),
  dayOfMonth: z.coerce.number().int().min(1, "Pick a day between 1 and 28.").max(28, "Pick a day between 1 and 28."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a delivery time."),
  format: exportFormatSchema,
  recipients: z.array(z.string().max(20)).min(1, "Choose at least one recipient."),
  active: z.boolean(),
});

export type ReportCategory = z.infer<typeof reportCategorySchema>;
export type ReportFilterKind = z.infer<typeof reportFilterKindSchema>;
export type StandardReportKey = z.infer<typeof standardReportKeySchema>;
export type StandardReport = z.infer<typeof standardReportSchema>;
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
export type ReportDataset = z.infer<typeof reportDatasetSchema>;
export type ReportColumn = z.infer<typeof reportColumnSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type ReportSpec = z.infer<typeof reportSpecSchema>;
export type ReportCell = z.infer<typeof reportCellSchema>;
export type ReportTable = z.infer<typeof reportTableSchema>;
export type ReportSchedule = z.infer<typeof reportScheduleSchema>;
export type SavedReport = z.infer<typeof savedReportSchema>;
export type DeliveryLogEntry = z.infer<typeof deliveryLogEntrySchema>;
export type ExportLogEntry = z.infer<typeof exportLogEntrySchema>;
export type ReportLibrary = z.infer<typeof reportLibrarySchema>;
export type ReportAnalytics = z.infer<typeof reportAnalyticsSchema>;
export type BuilderContext = z.infer<typeof builderContextSchema>;
export type ExportFile = z.infer<typeof exportFileSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type SaveReportInput = z.infer<typeof saveReportInputSchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
