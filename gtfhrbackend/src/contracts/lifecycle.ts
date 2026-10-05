import { z } from "zod";
import { decimalSchema, instantSchema, isoDateSchema, moneySchema, personRefSchema } from "./common.js";
import { offboardingCaseSchema } from "./hr-config.js";

/*
 * Employee lifecycle contract: resignation, offboarding clearances and exit
 * interview, full & final settlement, assets, letter templates and policy
 * acknowledgements.
 */

const checkbox = z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean());
const text = (label: string, min: number, max: number) =>
  z.string().trim().min(min, min <= 1 ? `Add ${label}.` : `${label} needs at least ${min} characters.`).max(max, `Keep ${label.toLowerCase()} under ${max} characters.`);
const eventSchema = z.object({ id: z.string(), at: instantSchema, actor: z.string(), event: z.string(), note: z.string().nullable() });

/* Resignation -------------------------------------------------------------- */

export const resignationReasonSchema = z.enum([
  "better_opportunity",
  "higher_studies",
  "relocation",
  "personal",
  "health",
  "compensation",
  "career_change",
  "work_environment",
  "other",
]);
export const resignationStateSchema = z.enum(["pending_manager", "pending_hr", "on_hold", "accepted", "rejected", "withdrawn"]);

export const resignationSchema = z.object({
  id: z.string(),
  reference: z.string(),
  person: personRefSchema,
  department: z.string(),
  reason: resignationReasonSchema,
  note: z.string(),
  submittedAt: instantSchema,
  noticeDays: z.number().int(),
  noticeBasis: z.string(),
  policyLastWorkingDay: isoDateSchema,
  requestedLastWorkingDay: isoDateSchema,
  earlyRelease: z.boolean(),
  earlyReleaseReason: z.string(),
  agreedLastWorkingDay: isoDateSchema.nullable(),
  managerRecommendation: z.string().nullable(),
  state: resignationStateSchema,
  history: z.array(eventSchema),
  version: z.number().int(),
  permissions: z.object({ canWithdraw: z.boolean(), canDecideAsManager: z.boolean(), canDecideAsHr: z.boolean() }),
});

export const resignationInputSchema = z.object({
  reason: resignationReasonSchema,
  note: text("A note", 10, 1000),
  lastWorkingDay: isoDateSchema,
  earlyReleaseReason: z.string().trim().max(300).default(""),
});

export const resignationDecisionSchema = z
  .object({
    resignationId: z.string().min(1),
    decision: z.enum(["accept", "reject", "hold"]),
    lastWorkingDay: z.union([isoDateSchema, z.literal("")]).default(""),
    note: z.string().trim().max(500).default(""),
    expectedVersion: z.coerce.number().int(),
  })
  .refine((value) => value.decision === "accept" || value.note.length >= 3, { path: ["note"], message: "Add a short note for the employee." });

export const clearanceDepartmentSchema = z.enum(["manager", "it", "admin", "finance"]);
export const clearanceSchema = z.object({
  department: clearanceDepartmentSchema,
  label: z.string(),
  scope: z.string(),
  status: z.enum(["pending", "cleared"]),
  note: z.string().nullable(),
  clearedBy: z.string().nullable(),
  clearedAt: instantSchema.nullable(),
  blockers: z.array(z.string()),
});

export const exitLetterLinkSchema = z.object({ id: z.string(), title: z.string(), href: z.string(), issuedAt: instantSchema });

export const myExitSchema = z.object({
  lastWorkingDay: isoDateSchema,
  status: z.enum(["notice", "exited"]),
  clearances: z.array(clearanceSchema.pick({ department: true, label: true, status: true })),
  assetsToReturn: z.number().int(),
  settlement: z.object({ reference: z.string(), state: z.string(), net: moneySchema.nullable(), paidAt: instantSchema.nullable() }).nullable(),
  letters: z.array(exitLetterLinkSchema),
});

export const resignationViewSchema = z.object({
  today: isoDateSchema,
  policy: z.object({ noticeDays: z.number().int(), basis: z.string(), defaultLastWorkingDay: isoDateSchema }),
  current: resignationSchema.nullable(),
  past: z.array(resignationSchema),
  exit: myExitSchema.nullable(),
  team: z.array(resignationSchema),
  canResign: z.boolean(),
  blockedReason: z.string().nullable(),
});

/* Offboarding -------------------------------------------------------------- */

export const exitRatingKeys = ["role", "manager", "growth", "compensation", "culture", "workLife"] as const;
const rating = z.coerce.number().int().min(1, "Rate 1–5.").max(5, "Rate 1–5.");
export const exitInterviewSchema = z.object({
  primaryReason: resignationReasonSchema,
  ratings: z.object({ role: z.number().int(), manager: z.number().int(), growth: z.number().int(), compensation: z.number().int(), culture: z.number().int(), workLife: z.number().int() }),
  wouldRejoin: z.enum(["yes", "maybe", "no"]),
  wouldRecommend: z.boolean(),
  comments: z.string(),
  conductedBy: z.string(),
  conductedAt: instantSchema,
});
export const exitInterviewInputSchema = z.object({
  employeeId: z.string().min(1),
  primaryReason: resignationReasonSchema,
  role: rating,
  manager: rating,
  growth: rating,
  compensation: rating,
  culture: rating,
  workLife: rating,
  wouldRejoin: z.enum(["yes", "maybe", "no"]),
  wouldRecommend: checkbox.default(false),
  comments: z.string().trim().max(2000).default(""),
});
export const clearanceInputSchema = z.object({
  employeeId: z.string().min(1),
  department: clearanceDepartmentSchema,
  status: z.enum(["pending", "cleared"]),
  note: z.string().trim().max(300).default(""),
});

export const assetCategorySchema = z.enum(["laptop", "phone", "monitor", "id_card", "sim", "other"]);
export const assetStatusSchema = z.enum(["in_stock", "assigned", "in_repair", "retired"]);
export const assetConditionSchema = z.enum(["new", "good", "fair", "damaged"]);

export const assetSchema = z.object({
  id: z.string(),
  tag: z.string(),
  category: assetCategorySchema,
  make: z.string(),
  model: z.string(),
  serial: z.string(),
  purchasedOn: isoDateSchema,
  cost: moneySchema,
  bookValue: moneySchema,
  condition: assetConditionSchema,
  status: assetStatusSchema,
  assignee: personRefSchema.nullable(),
  assignedAt: instantSchema.nullable(),
  acknowledgedAt: instantSchema.nullable(),
  notes: z.string(),
  version: z.number().int(),
});
export const assetDetailSchema = assetSchema.extend({ history: z.array(eventSchema) });

export const offboardingDetailSchema = offboardingCaseSchema.extend({
  reasonNote: z.string(),
  startedAt: instantSchema,
  noticeShortfallDays: z.number().int(),
  resignationReference: z.string().nullable(),
  clearances: z.array(clearanceSchema),
  assets: z.array(assetSchema),
  interview: exitInterviewSchema.nullable(),
  settlement: z.object({ id: z.string(), reference: z.string(), state: z.string(), net: moneySchema }).nullable(),
  letters: z.array(exitLetterLinkSchema),
  completeBlockers: z.array(z.string()),
});

export const offboardingBoardSchema = z.object({
  today: isoDateSchema,
  cases: z.array(offboardingDetailSchema),
  resignations: z.array(resignationSchema),
  exitReasons: z.array(z.object({ reason: resignationReasonSchema, count: z.number().int() })),
  averageRatings: z.array(z.object({ key: z.enum(exitRatingKeys), average: decimalSchema })),
  canDecide: z.boolean(),
});

/* Full & final settlement -------------------------------------------------- */

export const settlementStateSchema = z.enum(["draft", "submitted", "approved", "rejected", "paid"]);
export const settlementLineSchema = z.object({
  id: z.string(),
  code: z.string(),
  kind: z.enum(["earning", "deduction"]),
  label: z.string(),
  detail: z.string(),
  amount: moneySchema,
  manual: z.boolean(),
  reason: z.string().nullable(),
});
export const settlementSummarySchema = z.object({
  id: z.string(),
  reference: z.string(),
  person: personRefSchema,
  department: z.string(),
  lastWorkingDay: isoDateSchema,
  state: settlementStateSchema,
  net: moneySchema,
  preparedBy: z.string(),
  updatedAt: instantSchema,
});
export const settlementDetailSchema = settlementSummarySchema.extend({
  code: z.string(),
  designation: z.string(),
  joinedOn: isoDateSchema,
  service: z.string(),
  employmentType: z.string(),
  noticeDays: z.number().int(),
  noticeShortfallDays: z.number().int(),
  noticeWaived: z.boolean(),
  waiverReason: z.string().nullable(),
  monthlyGross: moneySchema,
  monthlyBasic: moneySchema,
  lines: z.array(settlementLineSchema),
  earnings: moneySchema,
  deductions: moneySchema,
  preparedAt: instantSchema,
  submittedAt: instantSchema.nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: instantSchema.nullable(),
  rejectionNote: z.string().nullable(),
  paidAt: instantSchema.nullable(),
  paidOn: isoDateSchema.nullable(),
  utr: z.string().nullable(),
  stale: z.boolean(),
  warnings: z.array(z.string()),
  audit: z.array(eventSchema),
  version: z.number().int(),
  permissions: z.object({
    canEdit: z.boolean(),
    canSubmit: z.boolean(),
    canApprove: z.boolean(),
    approveBlockedReason: z.string().nullable(),
    canPay: z.boolean(),
  }),
});
export const settlementBoardSchema = z.object({
  settlements: z.array(settlementSummarySchema),
  eligible: z.array(z.object({ person: personRefSchema, department: z.string(), lastWorkingDay: isoDateSchema })),
  canPrepare: z.boolean(),
  canApprove: z.boolean(),
});

const amountInput = z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount like 15000 or 15000.50.");
export const settlementLineInputSchema = z.object({
  settlementId: z.string().min(1),
  kind: z.enum(["earning", "deduction"]),
  label: text("A label", 3, 80),
  amount: amountInput,
  reason: text("A reason", 5, 300),
  expectedVersion: z.coerce.number().int(),
});
export const settlementWaiverInputSchema = z
  .object({ settlementId: z.string().min(1), waive: checkbox.default(false), reason: z.string().trim().max(300).default(""), expectedVersion: z.coerce.number().int() })
  .refine((value) => !value.waive || value.reason.length >= 5, { path: ["reason"], message: "Say why the recovery is waived (at least 5 characters)." });
export const settlementDecisionInputSchema = z
  .object({ settlementId: z.string().min(1), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).default(""), expectedVersion: z.coerce.number().int() })
  .refine((value) => value.decision === "approve" || value.note.length >= 5, { path: ["note"], message: "Tell the preparer what to fix (at least 5 characters)." });
export const settlementPaymentInputSchema = z.object({
  settlementId: z.string().min(1),
  utr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{12,22}$/, "UTR is 12–22 letters or digits."),
  paidOn: isoDateSchema,
  expectedVersion: z.coerce.number().int(),
});

/* Assets ------------------------------------------------------------------- */

export const assetRequestSchema = z.object({
  id: z.string(),
  reference: z.string(),
  requester: personRefSchema,
  category: assetCategorySchema,
  reason: z.string(),
  state: z.enum(["pending", "fulfilled", "rejected"]),
  requestedAt: instantSchema,
  decidedAt: instantSchema.nullable(),
  assetTag: z.string().nullable(),
  note: z.string().nullable(),
});
export const assetInventorySchema = z.object({
  assets: z.array(assetDetailSchema),
  requests: z.array(assetRequestSchema),
  people: z.array(personRefSchema),
  totals: z.object({ count: z.number().int(), assigned: z.number().int(), inStock: z.number().int(), inRepair: z.number().int(), retired: z.number().int(), unacknowledged: z.number().int(), bookValue: moneySchema }),
});
export const myAssetsSchema = z.object({
  assigned: z.array(assetSchema),
  returned: z.array(z.object({ id: z.string(), tag: z.string(), label: z.string(), returnedAt: instantSchema, condition: z.string() })),
  requests: z.array(assetRequestSchema),
});

export const assetInputSchema = z.object({
  id: z.string().optional(),
  tag: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}-\d{3,5}$/, "Use a tag like LAP-0142."),
  category: assetCategorySchema,
  make: text("Make", 2, 40),
  model: text("Model", 1, 60),
  serial: z.string().trim().min(3, "Add the serial number.").max(40),
  purchasedOn: isoDateSchema,
  cost: amountInput,
  condition: assetConditionSchema,
  notes: z.string().trim().max(300).default(""),
});
export const assetAssignInputSchema = z.object({
  assetId: z.string().min(1, "Choose an asset."),
  employeeId: z.string().min(1, "Choose an employee."),
  requestId: z.string().default(""),
  note: z.string().trim().max(300).default(""),
});
export const assetReturnInputSchema = z.object({
  assetId: z.string().min(1),
  condition: assetConditionSchema,
  note: z.string().trim().max(300).default(""),
  expectedVersion: z.coerce.number().int(),
});
export const assetStatusInputSchema = z.object({
  assetId: z.string().min(1),
  status: z.enum(["in_stock", "in_repair", "retired"]),
  note: text("A note", 3, 300),
});
export const assetRequestInputSchema = z.object({
  category: assetCategorySchema,
  reason: text("A reason", 10, 300),
});
export const assetRequestRejectSchema = z.object({ requestId: z.string().min(1), note: text("A reason", 5, 300) });

/* Letter templates --------------------------------------------------------- */

export const letterKindSchema = z.enum([
  "offer",
  "appointment",
  "confirmation",
  "increment",
  "experience",
  "relieving",
  "address_proof",
  "employment_verification",
  "salary_certificate",
  "visa_letter",
]);
export const letterTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: letterKindSchema,
  subject: z.string(),
  body: z.string(),
  active: z.boolean(),
  updatedAt: instantSchema,
  updatedBy: z.string(),
  version: z.number().int(),
  issuedCount: z.number().int(),
});
export const letterTemplateInputSchema = z.object({
  id: z.string().optional(),
  name: text("A name", 3, 80),
  kind: letterKindSchema,
  subject: text("A subject", 3, 140),
  body: text("The letter body", 40, 8000),
  active: checkbox.default(false),
});
export const issuedLetterSchema = z.object({
  id: z.string(),
  reference: z.string(),
  kind: letterKindSchema,
  title: z.string(),
  subject: z.string(),
  body: z.string(),
  person: personRefSchema,
  employeeCode: z.string(),
  issuedAt: instantSchema,
  issuedBy: z.string(),
  templateName: z.string().nullable(),
  href: z.string(),
});
export const letterStudioSchema = z.object({
  templates: z.array(letterTemplateSchema),
  placeholders: z.array(z.object({ key: z.string(), label: z.string() })),
  people: z.array(personRefSchema.extend({ code: z.string(), status: z.string() })),
  preview: z.object({ templateId: z.string(), employeeId: z.string(), subject: z.string(), body: z.string(), missing: z.array(z.string()) }).nullable(),
  issued: z.array(issuedLetterSchema),
});
export const generateLetterInputSchema = z.object({ templateId: z.string().min(1, "Choose a template."), employeeId: z.string().min(1, "Choose an employee.") });

/* Policy acknowledgements -------------------------------------------------- */

export const policyAckSchema = z.object({
  id: z.string(),
  title: z.string(),
  version: z.string(),
  summary: z.string(),
  body: z.string(),
  audience: z.string(),
  publishedAt: instantSchema,
  publishedBy: z.string(),
  dueOn: isoDateSchema,
  total: z.number().int(),
  acknowledged: z.number().int(),
  pending: z.array(personRefSchema.extend({ department: z.string() })),
  recent: z.array(z.object({ person: personRefSchema, at: instantSchema })),
  reminders: z.array(z.object({ at: instantSchema, by: z.string(), count: z.number().int() })),
});
export const myPolicySchema = z.object({
  id: z.string(),
  title: z.string(),
  version: z.string(),
  summary: z.string(),
  body: z.string(),
  dueOn: isoDateSchema,
  publishedAt: instantSchema,
  acknowledgedAt: instantSchema.nullable(),
  overdue: z.boolean(),
});
export const policyPublishInputSchema = z.object({
  title: text("A title", 5, 120),
  version: z.string().trim().regex(/^v?\d+(\.\d+){0,2}$/, "Use a version like v2.1."),
  summary: text("A summary", 10, 400),
  body: text("The policy text", 40, 8000),
  audience: z.string().trim().min(1).max(60).default("Everyone"),
  dueOn: isoDateSchema,
});

export type ResignationReason = z.infer<typeof resignationReasonSchema>;
export type ResignationState = z.infer<typeof resignationStateSchema>;
export type Resignation = z.infer<typeof resignationSchema>;
export type ResignationInput = z.infer<typeof resignationInputSchema>;
export type ResignationDecision = z.infer<typeof resignationDecisionSchema>;
export type ResignationView = z.infer<typeof resignationViewSchema>;
export type ClearanceDepartment = z.infer<typeof clearanceDepartmentSchema>;
export type Clearance = z.infer<typeof clearanceSchema>;
export type ExitInterview = z.infer<typeof exitInterviewSchema>;
export type ExitInterviewInput = z.infer<typeof exitInterviewInputSchema>;
export type ClearanceInput = z.infer<typeof clearanceInputSchema>;
export type OffboardingDetail = z.infer<typeof offboardingDetailSchema>;
export type OffboardingBoard = z.infer<typeof offboardingBoardSchema>;
export type ExitLetterLink = z.infer<typeof exitLetterLinkSchema>;
export type SettlementState = z.infer<typeof settlementStateSchema>;
export type SettlementLine = z.infer<typeof settlementLineSchema>;
export type SettlementSummary = z.infer<typeof settlementSummarySchema>;
export type SettlementDetail = z.infer<typeof settlementDetailSchema>;
export type SettlementBoard = z.infer<typeof settlementBoardSchema>;
export type SettlementLineInput = z.infer<typeof settlementLineInputSchema>;
export type SettlementWaiverInput = z.infer<typeof settlementWaiverInputSchema>;
export type SettlementDecisionInput = z.infer<typeof settlementDecisionInputSchema>;
export type SettlementPaymentInput = z.infer<typeof settlementPaymentInputSchema>;
export type AssetCategory = z.infer<typeof assetCategorySchema>;
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export type AssetCondition = z.infer<typeof assetConditionSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type AssetDetail = z.infer<typeof assetDetailSchema>;
export type AssetRequest = z.infer<typeof assetRequestSchema>;
export type AssetInventory = z.infer<typeof assetInventorySchema>;
export type MyAssets = z.infer<typeof myAssetsSchema>;
export type AssetInput = z.infer<typeof assetInputSchema>;
export type AssetAssignInput = z.infer<typeof assetAssignInputSchema>;
export type AssetReturnInput = z.infer<typeof assetReturnInputSchema>;
export type AssetStatusInput = z.infer<typeof assetStatusInputSchema>;
export type AssetRequestInput = z.infer<typeof assetRequestInputSchema>;
export type LetterKind = z.infer<typeof letterKindSchema>;
export type LetterTemplate = z.infer<typeof letterTemplateSchema>;
export type LetterTemplateInput = z.infer<typeof letterTemplateInputSchema>;
export type IssuedLetter = z.infer<typeof issuedLetterSchema>;
export type LetterStudio = z.infer<typeof letterStudioSchema>;
export type PolicyAck = z.infer<typeof policyAckSchema>;
export type MyPolicy = z.infer<typeof myPolicySchema>;
export type PolicyPublishInput = z.infer<typeof policyPublishInputSchema>;
