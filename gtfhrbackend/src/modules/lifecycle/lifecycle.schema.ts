import { z } from "zod";
import * as l from "../../contracts/lifecycle.js";
import { letterRequestSchema } from "../../contracts/requests.js";
import { moneySchema, isoDateSchema } from "../../contracts/common.js";
export const decisionInput = z
  .object({
    decision: z.enum(["accept", "reject", "hold"]),
    lastWorkingDay: isoDateSchema.optional(),
    note: z.string().max(500).default(""),
  })
  .refine((v) => v.decision === "accept" || v.note.length >= 3, { message: "Provide a decision reason." });
export const assignInput = z.object({
  employeeId: z.string().min(1),
  requestId: z.string().optional(),
  note: z.string().max(300).default(""),
});
export const returnInput = z.object({ condition: l.assetConditionSchema, note: z.string().max(300).default("") });
export const statusInput = z.object({
  status: l.assetStatusSchema.exclude(["assigned"]),
  note: z.string().min(3).max(300),
});
export const lineInput = z.object({
  kind: z.enum(["earning", "deduction"]),
  label: z.string().min(3).max(80),
  amount: moneySchema.refine((v) => /^\d{1,8}(\.\d{1,2})?$/.test(v.amount), {
    message: "Use a nonnegative amount with at most two decimals.",
  }),
  reason: z.string().min(5).max(300),
});
export const waiverInput = z
  .object({ waive: z.boolean(), reason: z.string().max(300).default("") })
  .refine((v) => !v.waive || v.reason.length >= 5, { message: "Provide a waiver reason." });
export const settlementDecision = z
  .object({ decision: z.enum(["approve", "reject"]), reason: z.string().max(500).default("") })
  .refine((v) => v.decision === "approve" || v.reason.length >= 5, { message: "Provide a rejection reason." });
export const paymentInput = z.object({ utr: z.string().regex(/^[A-Z0-9]{12,22}$/), paidOn: isoDateSchema });
export const issueInput = z.object({
  templateId: z.string().min(1),
  employeeId: z.string().min(1),
  purpose: z.string().max(300).default(""),
  addressedTo: z.string().max(120).default(""),
});
export const settlementRecord = l.settlementDetailSchema.extend({
  preparedById: z.string(),
  approvedById: z.string().nullable(),
  sourceFingerprint: z.string(),
});
export const letterRequestRecord = letterRequestSchema.extend({ employeeId: z.string(), addressedTo: z.string() });
export const returnRecord = z.object({
  id: z.string(),
  tag: z.string(),
  label: z.string(),
  returnedAt: z.string(),
  condition: z.string(),
  employeeId: z.string(),
});
export type SettlementRecord = z.infer<typeof settlementRecord>;
export const settlementPolicySchema = z.object({
  approvedForProduction: z.boolean(),
  noticeDivisor: z.number().int().min(1).max(31),
  leaveDivisor: z.number().int().min(1).max(31),
  leaveBasis: z.enum(["basic", "gross"]),
  gratuityEnabled: z.boolean(),
  gratuityMinimumYears: z.number().int().min(0).max(30),
  gratuityNumerator: z.number().int().min(1).max(365),
  gratuityDivisor: z.number().int().min(1).max(365),
  gratuityCapPaise: z.number().int().nonnegative(),
});
