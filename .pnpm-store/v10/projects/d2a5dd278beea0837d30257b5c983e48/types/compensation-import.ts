import { z } from "zod";
import { instantSchema, isoDateSchema, moneySchema } from "@/types/common";

/*
 * Compensation (salary) import — payroll-restricted data.
 * Flow: Payroll operator uploads → dry run → submits → an independent
 * Payroll approver approves → effective-dated revisions apply. HR never sees it.
 */

export const compensationRowSchema = z.object({
  line: z.number().int(),
  employeeCode: z.string(),
  employeeName: z.string().nullable(),
  effectiveFrom: isoDateSchema.nullable(),
  currentCtc: moneySchema.nullable(),
  newCtc: moneySchema.nullable(),
  changePercent: z.string().nullable(),
  basic: moneySchema.nullable(),
  hra: moneySchema.nullable(),
  special: moneySchema.nullable(),
  reason: z.string().nullable(),
  status: z.enum(["ok", "warning", "duplicate", "error"]),
  message: z.string().nullable(),
});

export const compensationBatchStateSchema = z.enum(["previewed", "submitted", "approved", "rejected", "discarded"]);

export const compensationBatchSchema = z.object({
  id: z.string(),
  reference: z.string(),
  fileName: z.string(),
  state: compensationBatchStateSchema,
  uploadedAt: instantSchema,
  uploadedBy: z.string(),
  submittedAt: instantSchema.nullable(),
  decidedAt: instantSchema.nullable(),
  decidedBy: z.string().nullable(),
  decisionNote: z.string().nullable(),
  columns: z.array(z.object({ field: z.string(), header: z.string() })),
  totals: z.object({
    rows: z.number().int(),
    ok: z.number().int(),
    warnings: z.number().int(),
    duplicates: z.number().int(),
    errors: z.number().int(),
    /** Annual CTC delta across importable rows. */
    annualImpact: moneySchema,
    scheduled: z.number().int(),
    retroactive: z.number().int(),
  }),
  rows: z.array(compensationRowSchema),
  /** What the viewer may do next (server-decided; segregation of duties). */
  can: z.object({ submit: z.boolean(), approve: z.boolean(), discard: z.boolean() }),
  selfPrepared: z.boolean(),
});

export const compensationBatchSummarySchema = compensationBatchSchema.omit({ rows: true, columns: true, can: true, selfPrepared: true });

export const compensationDecisionInputSchema = z
  .object({
    batchId: z.string().min(1),
    decision: z.enum(["submit", "approve", "reject"]),
    note: z.string().trim().max(300).default(""),
  })
  .refine((value) => value.decision !== "reject" || value.note.length >= 3, { path: ["note"], message: "A reason is required when rejecting." });

export type CompensationRow = z.infer<typeof compensationRowSchema>;
export type CompensationBatch = z.infer<typeof compensationBatchSchema>;
export type CompensationBatchSummary = z.infer<typeof compensationBatchSummarySchema>;
export type CompensationDecisionInput = z.infer<typeof compensationDecisionInputSchema>;
