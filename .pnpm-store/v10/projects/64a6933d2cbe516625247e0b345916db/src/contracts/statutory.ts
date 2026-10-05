import { z } from "zod";
import { instantSchema, isoDateSchema, moneySchema, personRefSchema } from "./common.js";

/* Statutory compliance contracts: registrations, returns, challans, salary
 * structures and Form 16. Money is exact decimal strings (moneySchema). */

export const challanTypeSchema = z.enum(["epf", "esi", "pt", "lwf", "tds"]);
export const challanStatusSchema = z.enum(["on_time", "late", "overdue", "due", "short"]);

export const obligationSchema = z.object({
  key: z.string(),
  type: challanTypeSchema,
  typeLabel: z.string(),
  entity: z.string(),
  state: z.string().nullable(),
  period: z.string(),
  periodLabel: z.string(),
  liability: moneySchema,
  dueOn: isoDateSchema,
  status: challanStatusSchema,
  daysLate: z.number().int(),
  challan: z
    .object({
      reference: z.string(),
      amount: moneySchema,
      paidOn: isoDateSchema,
      challanNo: z.string(),
      bsrCode: z.string().nullable(),
      recordedBy: z.string(),
      recordedAt: instantSchema,
    })
    .nullable(),
});

export const statutoryHubSchema = z.object({
  month: z.string(),
  periodLabel: z.string(),
  financialYear: z.string(),
  monthOptions: z.array(z.object({ value: z.string(), label: z.string() })),
  run: z.object({ id: z.string(), state: z.string(), final: z.boolean() }).nullable(),
  totals: z.object({
    epfEmployee: moneySchema,
    epfEmployer: moneySchema,
    eps: moneySchema,
    edliAdmin: moneySchema,
    esi: moneySchema,
    pt: moneySchema,
    lwf: moneySchema,
    tds: moneySchema,
  }),
  entities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      epfCode: z.string(),
      esicCode: z.string(),
      tan: z.string(),
      pfMembers: z.number().int(),
      pfTotal: moneySchema,
      pendingUan: z.number().int(),
      esiMembers: z.number().int(),
      esiTotal: moneySchema,
      tdsDeductees: z.number().int(),
      tdsTotal: moneySchema,
    }),
  ),
  pt: z.array(
    z.object({
      state: z.string(),
      stateName: z.string(),
      entity: z.string(),
      registration: z.string().nullable(),
      employees: z.number().int(),
      grossWages: moneySchema,
      amount: moneySchema,
      dueOn: isoDateSchema.nullable(),
      slabs: z.array(z.object({ label: z.string(), count: z.number().int(), amount: moneySchema })),
    }),
  ),
  lwf: z.array(
    z.object({
      state: z.string(),
      stateName: z.string(),
      entity: z.string(),
      registration: z.string().nullable(),
      employees: z.number().int(),
      employee: moneySchema,
      employer: moneySchema,
      dueOn: isoDateSchema.nullable(),
      schedule: z.string(),
    }),
  ),
  esiNote: z.string(),
  tds: z.object({
    quarter: z.string(),
    returnDueOn: isoDateSchema,
    months: z.array(z.object({ month: z.string(), label: z.string(), deductees: z.number().int(), amount: moneySchema, deposited: moneySchema, final: z.boolean() })),
    total: moneySchema,
    deposited: moneySchema,
  }),
  obligations: z.array(obligationSchema),
  openObligations: z.array(z.object({ key: z.string(), label: z.string(), type: challanTypeSchema, liability: moneySchema })),
  dueSummary: z.object({ overdue: z.number().int(), due: z.number().int(), late: z.number().int(), onTime: z.number().int() }),
  canManage: z.boolean(),
});

export const challanInputSchema = z
  .object({
    obligationKey: z.string().min(1, "Choose what this challan pays."),
    amount: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter the amount paid, e.g. 45210."),
    paidOn: z.iso.date({ message: "Enter the payment date." }),
    challanNo: z.string().trim().regex(/^[A-Za-z0-9/-]{5,24}$/, "Enter the challan / TRRN number (5–24 letters or digits)."),
    bsrCode: z.string().trim().default(""),
    idempotencyKey: z.string().min(8).max(128),
  })
  .superRefine((value, ctx) => {
    if (value.obligationKey.startsWith("tds|") && !/^\d{7}$/.test(value.bsrCode))
      ctx.addIssue({ code: "custom", path: ["bsrCode"], message: "TDS challans need the 7-digit BSR code." });
    if (Number(value.amount) <= 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount above zero." });
  });

/* Setup -------------------------------------------------------------------- */

export const statutorySetupSchema = z.object({
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
      locations: z.array(z.string()),
      pt: z.array(z.object({ state: z.string(), registration: z.string() })),
      lwf: z.array(z.object({ state: z.string(), registration: z.string() })),
    }),
  ),
  locations: z.array(z.object({ location: z.string(), entity: z.string(), state: z.string(), headcount: z.number().int(), mapped: z.boolean() })),
  pf: z.object({ wageBasis: z.enum(["ceiling", "actual"]), ceiling: moneySchema }),
  esi: z.object({ ceiling: moneySchema }),
  pt: z.array(
    z.object({
      state: z.string(),
      stateName: z.string(),
      due: z.string(),
      slabs: z.array(z.object({ from: moneySchema, to: moneySchema.nullable(), monthly: moneySchema, february: moneySchema })),
    }),
  ),
  lwf: z.array(z.object({ state: z.string(), stateName: z.string(), schedule: z.string(), employee: z.string(), employer: z.string(), due: z.string() })),
  audit: z.array(z.object({ at: instantSchema, actor: z.string(), event: z.string() })),
  settingsVersion: z.number().int(),
  canManage: z.boolean(),
});

export const pfSettingsInputSchema = z.object({
  wageBasis: z.enum(["ceiling", "actual"]),
  esiCeiling: z.string().trim().regex(/^\d{4,6}$/, "Enter the ESI wage ceiling in whole rupees."),
  expectedVersion: z.coerce.number().int(),
});

export const ptSlabsInputSchema = z.object({
  state: z.string().min(2),
  expectedVersion: z.coerce.number().int(),
  rows: z.array(
    z.object({
      from: z.string().trim(),
      to: z.string().trim(),
      monthly: z.string().trim(),
      february: z.string().trim(),
    }),
  ),
});

/* Employee statutory profiles ---------------------------------------------- */

export const statutoryEmployeeSchema = z.object({
  employee: personRefSchema,
  code: z.string(),
  location: z.string(),
  entity: z.string(),
  state: z.string(),
  uan: z.string().nullable(),
  pfMemberId: z.string().nullable(),
  esiIp: z.string().nullable(),
  panMasked: z.string().nullable(),
  pfStatus: z.enum(["member", "opted_out", "not_applicable"]),
  vpfPercent: z.number(),
  bank: z.object({ name: z.string(), accountMasked: z.string(), ifsc: z.string(), status: z.enum(["verified", "pending", "failed"]), changedAt: instantSchema.nullable() }),
  issues: z.array(z.string()),
});
export const statutoryEmployeesSchema = z.object({
  rows: z.array(statutoryEmployeeSchema),
  counts: z.object({ total: z.number().int(), uanPending: z.number().int(), panMissing: z.number().int(), bankPending: z.number().int() }),
  canEdit: z.boolean(),
  canVerifyBank: z.boolean(),
});

export const statutoryProfileInputSchema = z.object({
  employeeId: z.string().min(1),
  uan: z.string().trim().refine((value) => value === "" || /^\d{12}$/.test(value), "UAN is 12 digits."),
  esiIp: z.string().trim().refine((value) => value === "" || /^\d{10}$/.test(value), "ESI IP number is 10 digits."),
  vpfPercent: z.string().trim().regex(/^\d{1,2}$/, "Enter a whole percentage from 0 to 88."),
  pfOptOut: z.enum(["yes", "no"]).default("no"),
});

/* Salary structures -------------------------------------------------------- */

export const structureTermsSchema = z.object({
  name: z.string(),
  basicPctOfCtc: z.number(),
  hraPctOfBasic: z.number(),
  conveyance: moneySchema,
  lta: moneySchema,
  pf: z.boolean(),
  gratuity: z.boolean(),
});

export const structureChangeSchema = z.object({
  id: z.string(),
  reference: z.string(),
  kind: z.enum(["template", "assignment"]),
  templateId: z.string(),
  templateName: z.string(),
  summary: z.string(),
  diff: z.array(z.object({ label: z.string(), from: z.string(), to: z.string() })),
  impact: z.object({ employees: z.number().int(), monthlyGrossDelta: moneySchema }),
  reason: z.string(),
  preparedBy: personRefSchema,
  preparedAt: instantSchema,
  state: z.enum(["pending", "approved", "rejected", "withdrawn"]),
  decidedBy: z.string().nullable(),
  decidedAt: instantSchema.nullable(),
  decisionNote: z.string().nullable(),
  canDecide: z.boolean(),
  canWithdraw: z.boolean(),
  blockedReason: z.string().nullable(),
});

export const ctcRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  kind: z.enum(["earning", "employer", "deduction"]),
  monthly: moneySchema,
  annual: moneySchema,
  note: z.string().nullable(),
});
export const ctcBreakupSchema = z.object({
  annualCtc: moneySchema,
  templateId: z.string(),
  templateName: z.string(),
  stateName: z.string(),
  regime: z.enum(["new", "old"]),
  rows: z.array(ctcRowSchema),
  gross: z.object({ monthly: moneySchema, annual: moneySchema }),
  employerCost: z.object({ monthly: moneySchema, annual: moneySchema }),
  deductions: z.object({ monthly: moneySchema, annual: moneySchema }),
  takeHome: z.object({ monthly: moneySchema, annual: moneySchema }),
  annualTax: moneySchema,
  warnings: z.array(z.string()),
});

export const structuresSchema = z.object({
  templates: z.array(
    structureTermsSchema.extend({
      id: z.string(),
      description: z.string(),
      version: z.number().int(),
      publishedAt: instantSchema,
      publishedBy: z.string(),
      esi: z.boolean(),
      stipend: z.boolean(),
      groups: z.array(z.string()),
      employees: z.number().int(),
      pending: z.boolean(),
    }),
  ),
  assignments: z.array(z.object({ key: z.string(), label: z.string(), templateId: z.string(), templateName: z.string(), employees: z.number().int(), pending: z.boolean() })),
  changes: z.array(structureChangeSchema),
  calculator: ctcBreakupSchema.nullable(),
  calculatorInput: z.object({ ctc: z.string(), templateId: z.string(), state: z.string(), regime: z.enum(["new", "old"]) }),
  stateOptions: z.array(z.object({ value: z.string(), label: z.string() })),
  canPrepare: z.boolean(),
  canApprove: z.boolean(),
});

export const structureProposalSchema = z.object({
  templateId: z.string().min(1),
  basicPctOfCtc: z.coerce.number({ message: "Enter a percentage." }).min(30, "Basic should be at least 30% of CTC.").max(60, "Basic above 60% of CTC isn't supported."),
  hraPctOfBasic: z.coerce.number({ message: "Enter a percentage." }).min(0).max(50, "HRA can't exceed 50% of basic."),
  conveyance: z.string().trim().regex(/^\d{1,6}$/, "Whole rupees per month."),
  lta: z.string().trim().regex(/^\d{1,6}$/, "Whole rupees per month."),
  pf: z.enum(["yes", "no"]),
  gratuity: z.enum(["yes", "no"]),
  reason: z.string().trim().min(10, "Explain the change for the approver (at least 10 characters).").max(300),
  idempotencyKey: z.string().min(8).max(128),
});

export const assignmentProposalSchema = z.object({
  groupKey: z.string().min(1),
  templateId: z.string().min(1, "Choose a template."),
  reason: z.string().trim().min(10, "Explain the change for the approver (at least 10 characters).").max(300),
  idempotencyKey: z.string().min(8).max(128),
});

/* Form 16 ------------------------------------------------------------------ */

export const form16LineSchema = z.object({ ref: z.string(), label: z.string(), amount: moneySchema, emphasis: z.boolean(), indent: z.boolean() });

export const form16Schema = z.object({
  fy: z.string(),
  fyLabel: z.string(),
  assessmentYear: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  status: z.enum(["issued", "provisional", "not_employed"]),
  generatedAt: instantSchema.nullable(),
  certificateNo: z.string(),
  employer: z.object({ name: z.string(), address: z.string(), pan: z.string(), tan: z.string() }),
  employee: z.object({ id: z.string(), name: z.string(), code: z.string(), designation: z.string(), pan: z.string(), periodFrom: isoDateSchema, periodTo: isoDateSchema, regime: z.enum(["new", "old"]) }),
  partA: z.object({
    quarters: z.array(z.object({ quarter: z.string(), receipt: z.string().nullable(), paid: moneySchema, deducted: moneySchema, deposited: moneySchema })),
    challans: z.array(z.object({ month: z.string(), bsrCode: z.string().nullable(), paidOn: isoDateSchema.nullable(), challanNo: z.string().nullable(), amount: moneySchema, status: z.enum(["deposited", "pending"]) })),
    totalDeducted: moneySchema,
    totalDeposited: moneySchema,
  }),
  partB: z.array(form16LineSchema),
  viewingOther: z.boolean(),
});

export const form16StatusSchema = z.object({
  fy: z.string(),
  fyLabel: z.string(),
  closed: z.boolean(),
  generatedAt: instantSchema.nullable(),
  generatedBy: z.string().nullable(),
  canGenerate: z.boolean(),
  generateBlockedReason: z.string().nullable(),
  counts: z.object({ generated: z.number().int(), noTds: z.number().int(), blocked: z.number().int() }),
  rows: z.array(
    z.object({
      employee: personRefSchema,
      code: z.string(),
      pan: z.boolean(),
      tds: moneySchema,
      deposited: moneySchema,
      status: z.enum(["generated", "no_tds", "pan_missing", "ready", "provisional"]),
    }),
  ),
});

export type ChallanType = z.infer<typeof challanTypeSchema>;
export type ChallanStatus = z.infer<typeof challanStatusSchema>;
export type Obligation = z.infer<typeof obligationSchema>;
export type StatutoryHub = z.infer<typeof statutoryHubSchema>;
export type ChallanInput = z.infer<typeof challanInputSchema>;
export type StatutorySetup = z.infer<typeof statutorySetupSchema>;
export type PfSettingsInput = z.infer<typeof pfSettingsInputSchema>;
export type PtSlabsInput = z.infer<typeof ptSlabsInputSchema>;
export type StatutoryEmployee = z.infer<typeof statutoryEmployeeSchema>;
export type StatutoryEmployees = z.infer<typeof statutoryEmployeesSchema>;
export type StatutoryProfileInput = z.infer<typeof statutoryProfileInputSchema>;
export type StructureChange = z.infer<typeof structureChangeSchema>;
export type CtcBreakup = z.infer<typeof ctcBreakupSchema>;
export type Structures = z.infer<typeof structuresSchema>;
export type StructureProposal = z.infer<typeof structureProposalSchema>;
export type AssignmentProposal = z.infer<typeof assignmentProposalSchema>;
export type Form16 = z.infer<typeof form16Schema>;
export type Form16Status = z.infer<typeof form16StatusSchema>;
