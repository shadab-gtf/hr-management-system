import { z } from "zod";
import { locationCheckSchema, locationReadingSchema } from "../../contracts/location.js";
export const date = z.iso.date();
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const idParams = z.object({ id: z.string().min(1).max(180) });
export const empty = z.object({}).default({});
export const monthQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
export const decisionBody = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).default(""),
    reason: z.string().trim().max(500).optional(),
    comment: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.decision !== "reject" || (v.reason ?? v.comment ?? v.note).length >= 3, {
    message: "A rejection reason is required.",
  });
export const captureBody = z.object({
  direction: z.enum(["check_in", "check_out"]),
  source: z.literal("web_self_service").default("web_self_service"),
  location: locationCheckSchema.nullable().default(null),
});
export const locationBody = z.union([locationReadingSchema, z.object({ shared: z.literal(false) })]);
export const regularizationBody = z
  .object({ date, proposedIn: time, proposedOut: time, reason: z.string().trim().min(5).max(500) })
  .refine((v) => v.proposedOut > v.proposedIn, { message: "Out time must follow in time." });
export const approvalQuery = z.object({ state: z.enum(["pending", "decided"]).default("pending") });
export const leavePayload = z.object({
  leaveTypeId: z.string(),
  startDate: date,
  endDate: date,
  portion: z.enum(["full", "first_half", "second_half"]),
  reason: z.string(),
  units: z.number(),
  chargeDates: z.array(date).optional(),
  attachmentName: z.string().nullable().default(null),
  policyVersion: z.string().default("1"),
});
export const leaveEligibilityBody = z.object({
  gender: z.enum(["female", "male", "other", "unspecified"]),
  note: z.string().trim().min(5).max(500),
  version: z.number().int().min(0),
});
export const permissionPayload = z.object({
  date,
  from: time,
  to: time,
  reason: z.string(),
  minutes: z.number().int(),
});
export const expenseBody = z.object({
  title: z.string().trim().min(3).max(120),
  category: z.enum(["travel", "meals", "client_meeting", "internet", "equipment", "other"]),
  amount: z.object({
    amount: z
      .string()
      .regex(/^\d{1,7}(\.\d{1,2})?$/)
      .refine((v) => Number(v) > 0),
    currency: z.literal("INR"),
  }),
  incurredOn: date,
  merchant: z.string().trim().min(2).max(120),
});
export const compOffPayload = z.object({
  workedDate: date,
  portion: z.enum(["full", "half"]),
  reason: z.string(),
  units: z.number(),
  workedMinutes: z.number().int(),
  punches: z.string(),
  dayKind: z.string(),
  expiresOn: date.nullable().default(null),
});
export const encashPayload = z.object({
  leaveTypeId: z.string(),
  days: z.number(),
  reason: z.string(),
  amount: z.string(),
  perDay: z.string(),
  payrollMonth: z.string(),
  source: z.enum(["request", "year_end"]).default("request"),
});
export const rosterPayload = z.object({
  department: z.string(),
  weekStart: date,
  status: z.enum(["draft", "published", "changes"]),
  cells: z.record(z.string(), z.array(z.string().nullable()).length(7)),
  publishedCells: z.record(z.string(), z.array(z.string().nullable()).length(7)).default({}),
  publishedAt: z.string().nullable(),
  publishedBy: z.string().nullable(),
});
export const swapPayload = z.object({
  date,
  colleagueId: z.string(),
  requesterShift: z.string(),
  colleagueShift: z.string(),
  reason: z.string(),
});
export const sheetRow = z.object({
  projectId: z.string().min(1),
  task: z.string().trim().min(1).max(60),
  note: z.string().trim().max(200).default(""),
  quarterHours: z.array(z.number().int().min(0).max(64)).length(7),
});
export const sheetBody = z.object({ intent: z.enum(["save", "submit"]), rows: z.array(sheetRow).max(25) });
export const sheetPayload = z.object({
  rows: z.array(sheetRow),
  submittedAt: z.string().nullable(),
  resubmission: z.boolean().default(false),
});
export const projectBody = z
  .object({
    id: z.string().optional(),
    version: z.number().optional(),
    code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9]{1,9}(-[A-Z0-9]{1,10}){1,3}$/)
      .max(24),
    name: z.string().trim().min(3).max(80),
    client: z.string().trim().max(80).default(""),
    billable: z.boolean(),
    budgetQuarterHours: z.number().int().min(4).max(400000),
    budgetHours: z.number().optional(),
    startDate: date,
    endDate: date,
    status: z.enum(["active", "on_hold", "closed"]),
    memberIds: z.array(z.string()).min(1).max(60),
    tasks: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  })
  .refine((v) => v.endDate >= v.startDate && (!v.billable || v.client.length > 0), {
    message: "Check project dates and client.",
  });
export const importBody = z.object({
  fileName: z.string().min(1).max(200),
  format: z.enum(["daily", "punch_log"]).default("daily"),
  records: z
    .array(
      z.object({
        employeeCode: z.string().max(32),
        date: date.nullable(),
        firstIn: time.nullable(),
        lastOut: time.nullable(),
        sourceLine: z.number().int().positive().optional(),
        problem: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(20000),
});
export const importUploadBody = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentBase64: z
    .string()
    .min(4)
    .max(7 * 1024 * 1024)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
