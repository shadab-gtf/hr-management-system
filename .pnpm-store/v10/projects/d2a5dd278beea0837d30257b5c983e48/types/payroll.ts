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

export const payrollInputKindSchema = z.enum(["bonus", "incentive", "arrears", "other_deduction", "lop_override"]);

export const payrollInputSchema = z.object({
  id: z.string(),
  employee: personRefSchema,
  employeeCode: z.string(),
  kind: payrollInputKindSchema,
  label: z.string(),
  amount: moneySchema.nullable(),
  lopDays: z.string().nullable(),
  arrearsFrom: z.string().nullable(),
  arrearsMonths: z.number().int().nullable(),
  note: z.string(),
  addedBy: z.string(),
  addedAt: instantSchema,
});

export const payrollHoldSchema = z.object({
  id: z.string(),
  employee: personRefSchema,
  reason: z.string(),
  heldBy: z.string(),
  heldAt: instantSchema,
  releasedBy: z.string().nullable(),
  releasedAt: instantSchema.nullable(),
  releaseNote: z.string().nullable(),
  net: moneySchema,
});

export const registerRowSchema = z.object({
  employee: personRefSchema,
  code: z.string(),
  entity: z.string(),
  state: z.string(),
  payableDays: z.string(),
  lopDays: z.string(),
  gross: moneySchema,
  pf: moneySchema,
  esi: moneySchema,
  pt: moneySchema,
  tds: moneySchema,
  deductions: moneySchema,
  net: moneySchema,
  held: z.boolean(),
  bankStatus: z.enum(["verified", "pending", "failed"]),
});

export const bankAdviceSchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
  canExport: z.boolean(),
  batchReference: z.string(),
  payableCount: z.number().int(),
  payableAmount: moneySchema,
  excluded: z.array(z.object({ employee: personRefSchema, reason: z.string(), net: moneySchema })),
  exports: z.array(z.object({ at: instantSchema, by: z.string(), count: z.number().int(), amount: moneySchema })),
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
  inputs: z.array(payrollInputSchema),
  holds: z.array(payrollHoldSchema),
  register: z.array(registerRowSchema),
  bankAdvice: bankAdviceSchema,
  inputEmployees: z.array(z.object({ id: z.string(), label: z.string() })),
  statutory: z.object({
    pfEmployee: moneySchema,
    pfEmployer: moneySchema,
    esi: moneySchema,
    pt: moneySchema,
    lwf: moneySchema,
    tds: moneySchema,
  }),
  commands: z.object({
    canEditInputs: z.boolean(),
    canHold: z.boolean(),
    inputsLockedReason: z.string().nullable(),
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
  statutory: z.object({
    entity: z.string(),
    uan: z.string().nullable(),
    pfNumber: z.string().nullable(),
    esiNumber: z.string().nullable(),
    workState: z.string(),
    ptNote: z.string().nullable(),
    regime: z.enum(["new", "old"]),
    pfWage: moneySchema,
  }),
  tax: z.object({
    financialYear: z.string(),
    projectedTaxable: moneySchema,
    annualTax: moneySchema,
    deductedBefore: moneySchema,
    thisMonth: moneySchema,
    remainingMonths: z.number().int(),
  }),
  held: z.boolean(),
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
export type PayrollInputKind = z.infer<typeof payrollInputKindSchema>;
export type PayrollInput = z.infer<typeof payrollInputSchema>;
export type PayrollHold = z.infer<typeof payrollHoldSchema>;
export type RegisterRow = z.infer<typeof registerRowSchema>;
export type BankAdvice = z.infer<typeof bankAdviceSchema>;

const amountField = z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount like 15000.");

export const payrollInputFormSchema = z
  .object({
    runId: z.string().min(1),
    employeeId: z.string().min(1, "Choose an employee."),
    kind: payrollInputKindSchema,
    amount: z.string().trim().default(""),
    lopDays: z.string().trim().default(""),
    arrearsFrom: z.string().trim().default(""),
    arrearsMonths: z.string().trim().default(""),
    note: z.string().trim().min(5, "Add a reason employees and reviewers can understand.").max(200),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "lop_override") {
      if (!/^\d{1,2}(\.5|\.0)?$/.test(value.lopDays)) ctx.addIssue({ code: "custom", path: ["lopDays"], message: "Enter days in half-day steps, e.g. 1.5." });
      return;
    }
    if (!amountField.safeParse(value.amount).success || Number(value.amount) <= 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount above zero." });
    else if (Number(value.amount) > 1_000_000) ctx.addIssue({ code: "custom", path: ["amount"], message: "A single input can't exceed ₹10,00,000." });
    if (value.kind === "arrears") {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.arrearsFrom)) ctx.addIssue({ code: "custom", path: ["arrearsFrom"], message: "Choose the first arrears month." });
      const months = Number(value.arrearsMonths);
      if (!Number.isInteger(months) || months < 1 || months > 12) ctx.addIssue({ code: "custom", path: ["arrearsMonths"], message: "Arrears cover 1 to 12 months." });
    }
  });
export type PayrollInputForm = z.infer<typeof payrollInputFormSchema>;

export const payrollHoldFormSchema = z.object({
  runId: z.string().min(1),
  employeeId: z.string().min(1, "Choose an employee."),
  reason: z.string().trim().min(10, "Explain why the salary is held (at least 10 characters).").max(300),
});
export const payrollReleaseFormSchema = z.object({
  runId: z.string().min(1),
  holdId: z.string().min(1),
  note: z.string().trim().min(5, "Add a release note.").max(300),
});

export const payrollCommandSchema = z.enum([
  "submit",
  "approve",
  "reject",
  "publish",
]);
export type PayrollCommand = z.infer<typeof payrollCommandSchema>;
