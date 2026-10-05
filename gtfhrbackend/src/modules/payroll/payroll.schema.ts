import { z } from "zod";
import { payrollInputFormSchema, payslipDetailSchema } from "../../contracts/payroll.js";

export const idParams = z.object({ id: z.string().min(1).max(100) });
export const monthQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export const createRunSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
export const runInputSchema = z.preprocess(
  (value) => (typeof value === "object" && value !== null ? { ...value, runId: "validated-route" } : value),
  payrollInputFormSchema,
);
export const inputParams = z.object({ id: z.string().min(1).max(60), inputId: z.string().min(1).max(40) });
export const holdParams = z.object({ id: z.string().min(1).max(60), holdId: z.string().min(1).max(40) });
export const noteSchema = z.object({ note: z.string().trim().max(300).default("") });
export const releaseSchema = z.object({ note: z.string().trim().min(5).max(300) });
export const holdSchema = z.object({
  employeeId: z.string().min(1).max(32),
  reason: z.string().trim().min(10).max(300),
});
export const templateTermsSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  basicPctOfCtc: z.number().min(0).max(100),
  hraPctOfBasic: z.number().min(0).max(100),
  conveyancePaise: z.number().int().nonnegative(),
  ltaPaise: z.number().int().nonnegative(),
  pf: z.boolean(),
  gratuity: z.boolean(),
  esi: z.boolean(),
  stipend: z.boolean(),
});
const slab = z.object({
  fromPaise: z.number().int().nonnegative(),
  toPaise: z.number().int().nonnegative().nullable(),
  monthlyPaise: z.number().int().nonnegative(),
  februaryPaise: z.number().int().nonnegative(),
});
const due = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("next_month_day"), day: z.number().int().min(1).max(28) }),
  z.object({ kind: z.literal("same_month_end") }),
  z.object({ kind: z.literal("none") }),
]);
const taxRegime = z.object({
  standardDeductionPaise: z.number().int().nonnegative(),
  slabs: z
    .array(
      z.object({ upToPaise: z.number().int().nonnegative().nullable(), rateBps: z.number().int().min(0).max(10000) }),
    )
    .min(1),
  rebateLimitPaise: z.number().int().nonnegative(),
  rebateMaxPaise: z.number().int().nonnegative(),
});
export const policySchema = z.object({
  financialYears: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1),
  policyLabel: z.string(),
  approvedForProduction: z.boolean(),
  pfWageBasis: z.enum(["ceiling", "actual"]),
  pfCeilingPaise: z.number().int().positive(),
  esiCeilingPaise: z.number().int().positive(),
  rates: z.object({
    pfEmployeeBps: z.number().int().min(0).max(10000),
    pfEmployerBps: z.number().int().min(0).max(10000),
    epsBps: z.number().int().min(0).max(10000),
    edliBps: z.number().int().min(0).max(10000),
    pfAdminBps: z.number().int().min(0).max(10000),
    esiEmployeeBps: z.number().int().min(0).max(10000),
    esiEmployerBps: z.number().int().min(0).max(10000),
    gratuityBps: z.number().int().min(0).max(10000),
    cessBps: z.number().int().min(0).max(10000),
    panMissingBps: z.number().int().min(0).max(10000),
  }),
  hra: z.object({
    rentBaseBps: z.number().int().min(0).max(10000),
    metroLimitBps: z.number().int().min(0).max(10000),
    nonMetroLimitBps: z.number().int().min(0).max(10000),
  }),
  tax: z.object({ new: taxRegime, old: taxRegime }),
  declarationSections: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      limitPaise: z.number().int().nonnegative(),
      oldRegimeOnly: z.boolean(),
      items: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
  declarationWindow: z.object({
    opensOn: z.iso.date(),
    closesOn: z.iso.date(),
    proofOpensOn: z.iso.date(),
    proofClosesOn: z.iso.date(),
  }),
  ptSlabs: z.record(z.string(), z.array(slab)),
  ptDue: z.record(z.string(), due),
  lwf: z.record(
    z.string(),
    z.object({
      months: z.array(z.number().int().min(1).max(12)),
      employeeFixedPaise: z.number().int().nullable(),
      employeeRateBp: z.number().int().nullable(),
      employeeCapPaise: z.number().int().nullable(),
      employerFixedPaise: z.number().int().nullable(),
      employerMultiplier: z.number().nullable(),
      due,
    }),
  ),
  dueDays: z.object({
    epf: z.number().int().min(1).max(28),
    esi: z.number().int().min(1).max(28),
    tds: z.number().int().min(1).max(28),
    tdsReturn: z.number().int().min(1).max(28),
  }),
  entities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      address: z.string(),
      pan: z.string(),
      tan: z.string(),
      epfCode: z.string(),
      esicCode: z.string(),
      debitBank: z.string(),
      ptRegistrations: z.record(z.string(), z.string()),
      lwfRegistrations: z.record(z.string(), z.string()),
    }),
  ),
  locations: z.record(z.string(), z.object({ entityId: z.string(), state: z.string().nullable() })),
  states: z.record(z.string(), z.string()),
  assignments: z.record(z.string(), z.string()),
});
export type PayPolicy = z.infer<typeof policySchema>;
export type TemplateTerms = z.infer<typeof templateTermsSchema>;
export const resultSnapshotSchema = z.object({
  payslip: payslipDetailSchema,
  person: z.object({
    id: z.string(),
    name: z.string(),
    initials: z.string(),
    designation: z.string(),
    photoUrl: z.string().nullable(),
  }),
  entityId: z.string(),
  workState: z.string(),
  bankStatus: z.enum(["verified", "pending", "failed"]),
  overflow: z.boolean(),
  pfApplicable: z.boolean(),
  panPresent: z.boolean(),
  contributions: z.object({
    pfEmployee: z.number().int(),
    pfEmployer: z.number().int(),
    eps: z.number().int(),
    edliAdmin: z.number().int(),
    esiEmployee: z.number().int(),
    esiEmployer: z.number().int(),
    pt: z.number().int(),
    lwfEmployee: z.number().int(),
    lwfEmployer: z.number().int(),
    tds: z.number().int(),
  }),
  loanRecoveries: z.array(z.object({ id: z.string(), paise: z.number().int() })),
});
export type ResultSnapshot = z.infer<typeof resultSnapshotSchema>;
