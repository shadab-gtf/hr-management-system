import { z } from "zod";
import {
  decimalSchema,
  instantSchema,
  isoDateSchema,
  moneySchema,
  personRefSchema,
} from "./common.js";

export const leaveStateSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export const dayPortionSchema = z.enum(["full", "first_half", "second_half"]);

export const leaveTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  allowHalfDay: z.boolean(),
  requiresAttachment: z.boolean(),
  /** Employee-facing summary of the policy rules enforced by the server. */
  minNoticeDays: z.number().int(),
  backdateDays: z.number().int(),
  maxConsecutiveDays: z.number().int().nullable(),
  sandwich: z.boolean(),
  documentAfterDays: z.number().int().nullable(),
  negativeDays: decimalSchema,
  rules: z.array(z.string()),
});

/** Ledger-derived balance: available and reserved are never merged. */
export const leaveBalanceSchema = z.object({
  leaveTypeId: z.string(),
  name: z.string(),
  code: z.string(),
  entitled: decimalSchema,
  available: decimalSchema,
  reserved: decimalSchema,
  used: decimalSchema,
  policyYear: z.string(),
  asOf: isoDateSchema,
  /** Earliest expiry among live credits (comp-off). */
  nextExpiry: z.object({ date: isoDateSchema, units: decimalSchema }).nullable(),
});

export const leaveRequestSchema = z.object({
  id: z.string(),
  reference: z.string(),
  leaveType: z.string(),
  leaveTypeCode: z.string(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  units: decimalSchema,
  reason: z.string(),
  state: leaveStateSchema,
  submittedAt: instantSchema,
  approver: personRefSchema.nullable(),
  decisionNote: z.string().nullable(),
  canCancel: z.boolean(),
  version: z.number().int(),
});

export const holidaySchema = z.object({
  date: isoDateSchema,
  name: z.string(),
  kind: z.enum(["national", "festival", "optional"]),
});

export const leaveOverviewSchema = z.object({
  balances: z.array(leaveBalanceSchema),
  types: z.array(leaveTypeSchema),
  requests: z.array(leaveRequestSchema),
  holidays: z.array(holidaySchema),
  approverPath: z.array(personRefSchema),
});

export const leaveCalendarSchema = z.object({
  month: z.string(),
  scope: z.enum(["team", "reports"]),
  days: z.array(
    z.object({
      date: isoDateSchema,
      away: z.array(z.object({ person: personRefSchema, leaveType: z.string(), state: z.enum(["approved", "pending"]), half: z.boolean() })),
      holiday: z.string().nullable(),
    }),
  ),
});

/* Ledger ------------------------------------------------------------------- */

export const ledgerKindSchema = z.enum(["opening", "credit", "accrual", "availed", "encashed", "lapsed", "carry_forward", "adjustment"]);
export const ledgerEntrySchema = z.object({
  id: z.string(),
  date: isoDateSchema,
  kind: ledgerKindSchema,
  /** Signed days (credits positive, debits negative). */
  units: decimalSchema,
  balance: decimalSchema,
  note: z.string(),
  by: z.string().nullable(),
  reference: z.string().nullable(),
  /** Effective in the future (e.g. year-end entries); not in the balance yet. */
  scheduled: z.boolean(),
});
export const leaveLedgerSchema = z.object({
  employee: personRefSchema,
  year: z.string(),
  types: z.array(z.object({ leaveTypeId: z.string(), name: z.string(), code: z.string(), balance: decimalSchema, entries: z.array(ledgerEntrySchema) })),
});

/* Comp-off ----------------------------------------------------------------- */

export const compOffStateSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);
export const compOffClaimSchema = z.object({
  id: z.string(),
  reference: z.string(),
  person: personRefSchema,
  workedDate: isoDateSchema,
  dayKind: z.string(),
  portion: z.enum(["full", "half"]),
  units: decimalSchema,
  workedMinutes: z.number().int(),
  punches: z.string(),
  reason: z.string(),
  state: compOffStateSchema,
  submittedAt: instantSchema,
  approver: personRefSchema.nullable(),
  decisionNote: z.string().nullable(),
  expiresOn: isoDateSchema.nullable(),
  /** Credit status once approved. */
  credit: z.enum(["active", "used", "lapsed", "partly_used"]).nullable(),
  canDecide: z.boolean(),
  canCancel: z.boolean(),
  version: z.number().int(),
});
export const compOffEligibleDaySchema = z.object({
  date: isoDateSchema,
  dayKind: z.string(),
  workedMinutes: z.number().int(),
  punches: z.string(),
  maxPortion: z.enum(["full", "half"]),
});

/* Encashment --------------------------------------------------------------- */

export const encashmentSchema = z.object({
  id: z.string(),
  reference: z.string(),
  person: personRefSchema,
  leaveType: z.string(),
  units: decimalSchema,
  perDay: moneySchema,
  amount: moneySchema,
  payrollMonth: z.string(),
  source: z.enum(["request", "year_end"]),
  reason: z.string(),
  state: compOffStateSchema,
  submittedAt: instantSchema,
  decidedBy: z.string().nullable(),
  decisionNote: z.string().nullable(),
  canDecide: z.boolean(),
  canCancel: z.boolean(),
  version: z.number().int(),
});
export const encashOptionSchema = z.object({
  leaveTypeId: z.string(),
  name: z.string(),
  available: decimalSchema,
  retain: decimalSchema,
  remainingThisYear: decimalSchema,
  maxNow: decimalSchema,
  perDay: moneySchema,
});

export const compOffPageSchema = z.object({
  today: isoDateSchema,
  expiryDays: z.number().int(),
  claimWindowDays: z.number().int(),
  balance: decimalSchema,
  nextExpiry: z.object({ date: isoDateSchema, units: decimalSchema }).nullable(),
  eligibleDays: z.array(compOffEligibleDaySchema),
  mine: z.array(compOffClaimSchema),
  team: z.array(compOffClaimSchema),
  encashOptions: z.array(encashOptionSchema),
  encashments: z.array(encashmentSchema),
  /** HR queue (employee.update). */
  encashQueue: z.array(encashmentSchema).nullable(),
  payrollMonth: z.string(),
});

/* Year-end ----------------------------------------------------------------- */

export const yearEndRowSchema = z.object({
  person: personRefSchema,
  department: z.string(),
  leaveType: z.string(),
  closing: decimalSchema,
  carryForward: decimalSchema,
  encash: decimalSchema,
  encashAmount: moneySchema,
  lapse: decimalSchema,
});
export const yearEndSchema = z.object({
  year: z.string(),
  asOf: isoDateSchema,
  state: z.enum(["preview", "committed"]),
  rows: z.array(yearEndRowSchema),
  totals: z.object({ carryForward: decimalSchema, encash: decimalSchema, encashAmount: moneySchema, lapse: decimalSchema, employees: z.number().int() }),
  lastRun: z.object({ year: z.string(), at: instantSchema, by: z.string(), rows: z.number().int(), carryForward: decimalSchema, encash: decimalSchema, lapse: decimalSchema }).nullable(),
  audit: z.array(z.object({ id: z.string(), at: instantSchema, actor: z.string(), action: z.string(), detail: z.string() })),
});

export const compOffClaimInputSchema = z.object({
  workedDate: isoDateSchema,
  portion: z.enum(["full", "half"]),
  reason: z.string().trim().min(5, "Say what you worked on (at least 5 characters).").max(300, "Keep it under 300 characters."),
});
export const encashInputSchema = z.object({
  leaveTypeId: z.string().min(1, "Choose a leave type."),
  days: z.coerce.number().int("Whole days only.").min(1, "At least 1 day.").max(60, "At most 60 days."),
  reason: z.string().trim().max(300).default(""),
});
export const decisionInputSchema = z
  .object({
    id: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(300).default(""),
    version: z.coerce.number().int(),
  })
  .refine((value) => value.decision !== "reject" || value.note.length >= 3, { path: ["note"], message: "Give a reason when rejecting." });
export const balanceAdjustmentInputSchema = z.object({
  employeeId: z.string().min(1, "Choose an employee."),
  leaveTypeId: z.string().min(1, "Choose a leave type."),
  direction: z.enum(["credit", "debit"]),
  days: z.string().trim().regex(/^\d{1,3}(\.5)?$/, "Use whole or half days, e.g. 1 or 1.5.").refine((value) => Number(value) > 0, "More than 0 days."),
  reason: z.string().trim().min(5, "Explain the adjustment (at least 5 characters).").max(300),
});

export const leaveRequestInputSchema = z
  .object({
    leaveTypeId: z.string().min(1, "Choose a leave type."),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    portion: dayPortionSchema.default("full"),
    reason: z
      .string()
      .trim()
      .min(3, "Add a short reason (at least 3 characters).")
      .max(500, "Keep the reason under 500 characters."),
  })
  .refine((value) => value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date.",
  });

export type LeaveState = z.infer<typeof leaveStateSchema>;
export type DayPortion = z.infer<typeof dayPortionSchema>;
export type LeaveType = z.infer<typeof leaveTypeSchema>;
export type LeaveBalance = z.infer<typeof leaveBalanceSchema>;
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;
export type Holiday = z.infer<typeof holidaySchema>;
export type LeaveOverview = z.infer<typeof leaveOverviewSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestInputSchema>;
export type LeaveCalendar = z.infer<typeof leaveCalendarSchema>;
export type LedgerKind = z.infer<typeof ledgerKindSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type LeaveLedger = z.infer<typeof leaveLedgerSchema>;
export type CompOffClaim = z.infer<typeof compOffClaimSchema>;
export type CompOffEligibleDay = z.infer<typeof compOffEligibleDaySchema>;
export type Encashment = z.infer<typeof encashmentSchema>;
export type EncashOption = z.infer<typeof encashOptionSchema>;
export type CompOffPage = z.infer<typeof compOffPageSchema>;
export type YearEnd = z.infer<typeof yearEndSchema>;
export type YearEndRow = z.infer<typeof yearEndRowSchema>;
export type CompOffClaimInput = z.infer<typeof compOffClaimInputSchema>;
export type EncashInput = z.infer<typeof encashInputSchema>;
export type DecisionInput = z.infer<typeof decisionInputSchema>;
export type BalanceAdjustmentInput = z.infer<typeof balanceAdjustmentInputSchema>;
