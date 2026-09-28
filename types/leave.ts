import { z } from "zod";
import {
  decimalSchema,
  instantSchema,
  isoDateSchema,
  personRefSchema,
} from "@/types/common";

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
