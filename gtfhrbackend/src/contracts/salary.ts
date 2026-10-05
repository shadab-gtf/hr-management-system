import { z } from "zod";
import { instantSchema, isoDateSchema, moneySchema } from "./common.js";

/* Year-to-date ------------------------------------------------------------- */

export const ytdSchema = z.object({
  financialYear: z.string(),
  months: z.array(z.string()),
  rows: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      kind: z.enum(["earning", "deduction"]),
      amounts: z.array(moneySchema.nullable()),
      total: moneySchema,
    }),
  ),
  gross: moneySchema,
  deductions: moneySchema,
  net: moneySchema,
});

/* Income-tax declaration & statement -------------------------------------- */

export const taxRegimeSchema = z.enum(["new", "old"]);
export const proofStateSchema = z.enum(["not_required", "pending", "submitted", "verified", "rejected"]);

export const declarationItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  declared: moneySchema,
  proof: proofStateSchema,
});
export const declarationSectionSchema = z.object({
  code: z.string(),
  name: z.string(),
  limit: moneySchema.nullable(),
  oldRegimeOnly: z.boolean(),
  items: z.array(declarationItemSchema),
});

export const taxDeclarationSchema = z.object({
  financialYear: z.string(),
  regime: taxRegimeSchema,
  status: z.enum(["draft", "submitted", "locked"]),
  window: z.object({ opensOn: isoDateSchema, closesOn: isoDateSchema, open: z.boolean() }),
  proofWindow: z.object({ opensOn: isoDateSchema, closesOn: isoDateSchema, open: z.boolean() }),
  submittedAt: instantSchema.nullable(),
  sections: z.array(declarationSectionSchema),
  monthlyRent: moneySchema,
  rentCity: z.enum(["metro", "non_metro"]),
});

export const declarationInputSchema = z.object({
  regime: taxRegimeSchema,
  monthlyRent: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 25000.").default("0"),
  rentCity: z.enum(["metro", "non_metro"]).default("metro"),
  /** Item id → declared amount (exact decimal strings). */
  items: z.record(z.string(), z.string().trim().regex(/^\d{0,8}(\.\d{1,2})?$/, "Enter a valid amount.")),
  submit: z.boolean().default(false),
});

export const taxStatementSchema = z.object({
  financialYear: z.string(),
  regime: taxRegimeSchema,
  lines: z.array(z.object({ label: z.string(), amount: moneySchema, emphasis: z.boolean() })),
  taxPayable: moneySchema,
  taxDeducted: moneySchema,
  balance: moneySchema,
  monthlyTds: z.array(z.object({ month: z.string(), amount: moneySchema, projected: z.boolean() })),
  disclaimer: z.string(),
});

/* Loans & advances --------------------------------------------------------- */

export const loanSchema = z.object({
  id: z.string(),
  reference: z.string(),
  type: z.enum(["salary_advance", "personal_loan", "laptop_loan", "emergency"]),
  principal: moneySchema,
  outstanding: moneySchema,
  emi: moneySchema,
  tenureMonths: z.number().int(),
  paidInstallments: z.number().int(),
  startMonth: z.string(),
  state: z.enum(["requested", "approved", "active", "closed", "rejected"]),
  requestedAt: instantSchema,
});
export const loanInputSchema = z.object({
  type: loanSchema.shape.type,
  amount: z.string().trim().regex(/^\d{1,7}$/, "Enter a whole-rupee amount."),
  tenureMonths: z.coerce.number().int().min(1).max(24),
  reason: z.string().trim().min(5, "Add a short reason.").max(300),
});

/* Salary revision ---------------------------------------------------------- */

export const salaryRevisionSchema = z.object({
  id: z.string(),
  effectiveFrom: isoDateSchema,
  previousCtc: moneySchema,
  newCtc: moneySchema,
  changePercent: z.string(),
  reason: z.string(),
  letterReference: z.string(),
});

export const compensationSchema = z.object({
  annualCtc: moneySchema,
  monthlyGross: moneySchema,
  components: z.array(z.object({ name: z.string(), monthly: moneySchema, annual: moneySchema })),
  revisions: z.array(salaryRevisionSchema),
});

export type Ytd = z.infer<typeof ytdSchema>;
export type TaxRegime = z.infer<typeof taxRegimeSchema>;
export type ProofState = z.infer<typeof proofStateSchema>;
export type TaxDeclaration = z.infer<typeof taxDeclarationSchema>;
export type DeclarationInput = z.infer<typeof declarationInputSchema>;
export type TaxStatement = z.infer<typeof taxStatementSchema>;
export type Loan = z.infer<typeof loanSchema>;
export type LoanInput = z.infer<typeof loanInputSchema>;
export type SalaryRevision = z.infer<typeof salaryRevisionSchema>;
export type Compensation = z.infer<typeof compensationSchema>;
