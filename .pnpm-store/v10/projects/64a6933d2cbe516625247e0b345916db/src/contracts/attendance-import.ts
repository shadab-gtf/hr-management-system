import { z } from "zod";
import { instantSchema, isoDateSchema } from "./common.js";

/*
 * Staged attendance import from the face-recognition device export
 * (data-sources.md: staged import → row validation → dry run → reviewer
 * commit → duplicate-safe re-runs). WFH is requested in the app, not imported.
 */

export const importRowStatusSchema = z.enum(["ok", "warning", "duplicate", "error"]);

export const importRowSchema = z.object({
  line: z.number().int(),
  employeeCode: z.string(),
  employeeName: z.string().nullable(),
  date: isoDateSchema.nullable(),
  firstIn: z.string().nullable(),
  lastOut: z.string().nullable(),
  status: importRowStatusSchema,
  message: z.string().nullable(),
});

export const importBatchSchema = z.object({
  id: z.string(),
  reference: z.string(),
  fileName: z.string(),
  format: z.enum(["daily", "punch_log"]),
  state: z.enum(["previewed", "committed", "discarded"]),
  uploadedAt: instantSchema,
  uploadedBy: z.string(),
  committedAt: instantSchema.nullable(),
  dateRange: z.object({ from: isoDateSchema, to: isoDateSchema }).nullable(),
  columns: z.array(z.object({ field: z.string(), header: z.string() })),
  totals: z.object({
    rows: z.number().int(),
    ok: z.number().int(),
    warnings: z.number().int(),
    duplicates: z.number().int(),
    errors: z.number().int(),
    employees: z.number().int(),
  }),
  /** Error and warning rows first, capped for the preview; totals are exact. */
  rows: z.array(importRowSchema),
});

export const importBatchSummarySchema = importBatchSchema.omit({ rows: true, columns: true });

export type ImportRow = z.infer<typeof importRowSchema>;
export type ImportRowStatus = z.infer<typeof importRowStatusSchema>;
export type ImportBatch = z.infer<typeof importBatchSchema>;
export type ImportBatchSummary = z.infer<typeof importBatchSummarySchema>;
