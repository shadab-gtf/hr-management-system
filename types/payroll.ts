import { z } from "zod";
import {
  instantSchema,
  isoDateSchema,
  moneySchema,
  personRefSchema,
} from "@/types/common";

/** Authoritative run states from system/brain/payroll-rules.md. */
export const payrollRunStateSchema = z.enum([
  "draft",
  "calculating",
  "calculated",
  "in_review",
  "approved",
  "published",
  "paid",
  "rejected",
]);

export const payrollTotalsSchema = z.object({
  gross: moneySchema,
  employeeDeductions: moneySchema,
  employerContributions: moneySchema,
  net: moneySchema,
});

export const payrollRunSummarySchema = z.object({
  id: z.string(),
  payGroup: z.string(),
  periodLabel: z.string(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  paymentDate: isoDateSchema,
  revision: z.number().int(),
  state: payrollRunStateSchema,
  employeeCount: z.number().int(),
  totals: payrollTotalsSchema,
  blockers: z.number().int(),
  warnings: z.number().int(),
  updatedAt: instantSchema,
});

export const validationIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(["blocker", "warning"]),
  employee: personRefSchema.nullable(),
  message: z.string(),
  resolution: z.string(),
});

export const varianceRowSchema = z.object({
  employee: personRefSchema,
  component: z.string(),
  previous: moneySchema,
  current: moneySchema,
  change: moneySchema,
  changePercent: z.string(),
  explanation: z.string().nullable(),
});

export const componentTotalSchema = z.object({
  code: z.string(),
  name: z.string(),
  kind: z.enum(["earning", "deduction", "employer"]),
  amount: moneySchema,
});

export const payrollRunDetailSchema = payrollRunSummarySchema.extend({
  inputDigest: z.string(),
  preparedBy: personRefSchema,
  approvedBy: personRefSchema.nullable(),
  publishedAt: instantSchema.nullable(),
  issues: z.array(validationIssueSchema),
  variances: z.array(varianceRowSchema),
  components: z.array(componentTotalSchema),
  audit: z.array(
    z.object({ at: instantSchema, actor: z.string(), event: z.string() }),
  ),
  commands: z.object({
    canSubmit: z.boolean(),
    canApprove: z.boolean(),
    canReject: z.boolean(),
    canPublish: z.boolean(),
    blockedReason: z.string().nullable(),
  }),
});

export const payrollOverviewSchema = z.object({
  payGroup: z.string(),
  current: payrollRunSummarySchema.nullable(),
  history: z.array(payrollRunSummarySchema),
  readiness: z.array(
    z.object({
      label: z.string(),
      done: z.number().int(),
      total: z.number().int(),
      tone: z.enum(["success", "warning", "danger"]),
    }),
  ),
});

export const payslipLineSchema = z.object({
  code: z.string(),
  name: z.string(),
  amount: moneySchema,
});

export const payslipSummarySchema = z.object({
  id: z.string(),
  periodLabel: z.string(),
  periodStart: isoDateSchema,
  paymentDate: isoDateSchema,
  publishedAt: instantSchema,
  paymentStatus: z.enum(["published", "paid"]),
  net: moneySchema,
});

export const payslipDetailSchema = payslipSummarySchema.extend({
  employee: z.object({
    name: z.string(),
    code: z.string(),
    designation: z.string(),
    department: z.string(),
    bankAccountMasked: z.string(),
    panMasked: z.string(),
  }),
  payableDays: z.string(),
  lopDays: z.string(),
  earnings: z.array(payslipLineSchema),
  deductions: z.array(payslipLineSchema),
  employerContributions: z.array(payslipLineSchema),
  gross: moneySchema,
  totalDeductions: moneySchema,
  artifactVersion: z.number().int(),
});

export type PayrollRunState = z.infer<typeof payrollRunStateSchema>;
export type PayrollTotals = z.infer<typeof payrollTotalsSchema>;
export type PayrollRunSummary = z.infer<typeof payrollRunSummarySchema>;
export type PayrollRunDetail = z.infer<typeof payrollRunDetailSchema>;
export type PayrollOverview = z.infer<typeof payrollOverviewSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type VarianceRow = z.infer<typeof varianceRowSchema>;
export type ComponentTotal = z.infer<typeof componentTotalSchema>;
export type PayslipSummary = z.infer<typeof payslipSummarySchema>;
export type PayslipDetail = z.infer<typeof payslipDetailSchema>;
export type PayslipLine = z.infer<typeof payslipLineSchema>;

export const payrollCommandSchema = z.enum([
  "submit",
  "approve",
  "reject",
  "publish",
]);
export type PayrollCommand = z.infer<typeof payrollCommandSchema>;
