import { z } from "zod";
import { instantSchema, isoDateSchema, moneySchema, personRefSchema } from "@/types/common";
import { employmentTypeSchema } from "@/types/employee";

/* Recruitment (HR-12). Candidates are not employees: separate access, consent and retention. */

export const recruitmentStageSchema = z.enum(["applied", "screening", "interview", "offer", "hired", "rejected"]);
export const candidateSourceSchema = z.enum(["careers", "referral", "linkedin", "agency", "walk_in"]);
export const jobStateSchema = z.enum(["draft", "published", "on_hold", "closed", "filled"]);
export const requisitionStateSchema = z.enum(["pending", "approved", "rejected"]);
export const requisitionJustificationSchema = z.enum(["new_role", "backfill"]);
export const interviewTypeSchema = z.enum(["technical", "hr", "culture"]);
export const interviewModeSchema = z.enum(["online", "in_person"]);
export const interviewStateSchema = z.enum(["scheduled", "completed", "cancelled"]);
export const recommendationSchema = z.enum(["strong_yes", "yes", "no", "strong_no"]);
export const offerStateSchema = z.enum(["pending_approval", "extended", "accepted", "declined", "approval_rejected"]);

export type RecruitmentStage = z.infer<typeof recruitmentStageSchema>;
export type CandidateSource = z.infer<typeof candidateSourceSchema>;
export type JobState = z.infer<typeof jobStateSchema>;
export type RequisitionState = z.infer<typeof requisitionStateSchema>;
export type RequisitionJustification = z.infer<typeof requisitionJustificationSchema>;
export type InterviewType = z.infer<typeof interviewTypeSchema>;
export type InterviewMode = z.infer<typeof interviewModeSchema>;
export type InterviewState = z.infer<typeof interviewStateSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type OfferState = z.infer<typeof offerStateSchema>;

/* Shared labels (safe for server and client). */
export const stageOrder: RecruitmentStage[] = ["applied", "screening", "interview", "offer", "hired", "rejected"];
export const stageLabels: Record<RecruitmentStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};
export const sourceLabels: Record<CandidateSource, string> = {
  careers: "Careers page",
  referral: "Employee referral",
  linkedin: "LinkedIn",
  agency: "Agency",
  walk_in: "Walk-in",
};
export const interviewTypeLabels: Record<InterviewType, string> = { technical: "Technical", hr: "HR", culture: "Culture fit" };
export const interviewModeLabels: Record<InterviewMode, string> = { online: "Online", in_person: "In person" };
export const recommendationLabels: Record<Recommendation, string> = { strong_yes: "Strong yes", yes: "Yes", no: "No", strong_no: "Strong no" };
export const employmentTypeLabels: Record<z.infer<typeof employmentTypeSchema>, string> = { full_time: "Full-time", contract: "Contract", intern: "Internship" };
export const scorecardCriteria = [
  { key: "skills", label: "Role skills" },
  { key: "problem_solving", label: "Problem solving" },
  { key: "communication", label: "Communication" },
  { key: "ownership", label: "Ownership" },
  { key: "culture", label: "Culture add" },
] as const;
export type ScorecardCriterion = (typeof scorecardCriteria)[number]["key"];

/* Read models ---------------------------------------------------------------- */

export const requisitionSchema = z.object({
  id: z.string(),
  reference: z.string(),
  title: z.string(),
  department: z.string(),
  location: z.string(),
  openings: z.number().int(),
  employmentType: employmentTypeSchema,
  budgetMin: moneySchema,
  budgetMax: moneySchema,
  justification: requisitionJustificationSchema,
  backfillFor: z.string().nullable(),
  reason: z.string(),
  raisedBy: personRefSchema,
  raisedAt: instantSchema,
  state: requisitionStateSchema,
  decidedBy: personRefSchema.nullable(),
  decidedAt: instantSchema.nullable(),
  decisionNote: z.string().nullable(),
  jobId: z.string().nullable(),
  version: z.number().int(),
  canDecide: z.boolean(),
});

const stageCountsSchema = z.object({
  applied: z.number().int(),
  screening: z.number().int(),
  interview: z.number().int(),
  offer: z.number().int(),
  hired: z.number().int(),
  rejected: z.number().int(),
});

export const jobSummarySchema = z.object({
  id: z.string(),
  reference: z.string(),
  title: z.string(),
  department: z.string(),
  location: z.string(),
  employmentType: employmentTypeSchema,
  openings: z.number().int(),
  hires: z.number().int(),
  hiringManager: personRefSchema,
  state: jobStateSchema,
  publishToCareers: z.boolean(),
  openedOn: isoDateSchema,
  closedOn: isoDateSchema.nullable(),
  daysOpen: z.number().int(),
  stageCounts: stageCountsSchema,
  /** Internal only — never in the public projection. */
  ctcMin: moneySchema,
  ctcMax: moneySchema,
  experienceMin: z.number().int(),
  experienceMax: z.number().int(),
  requisitionReference: z.string().nullable(),
});

export const pipelineCardSchema = z.object({
  id: z.string(),
  reference: z.string(),
  name: z.string(),
  experienceYears: z.string(),
  currentCompany: z.string().nullable(),
  source: candidateSourceSchema,
  stage: recruitmentStageSchema,
  daysInStage: z.number().int(),
  nextInterviewAt: instantSchema.nullable(),
  offerState: offerStateSchema.nullable(),
  rejectionReason: z.string().nullable(),
  erased: z.boolean(),
  version: z.number().int(),
});

export const jobDetailSchema = jobSummarySchema.extend({
  description: z.string(),
  skills: z.array(z.string()),
  hiringManagerId: z.string(),
  version: z.number().int(),
  sourceBreakdown: z.array(z.object({ source: candidateSourceSchema, count: z.number().int() })),
  candidates: z.array(pipelineCardSchema),
});

export const candidateListItemSchema = z.object({
  id: z.string(),
  reference: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  jobId: z.string(),
  jobTitle: z.string(),
  stage: recruitmentStageSchema,
  source: candidateSourceSchema,
  appliedAt: instantSchema,
  experienceYears: z.string(),
  retentionDue: z.boolean(),
  erased: z.boolean(),
  possibleDuplicate: z.boolean(),
});

export const scorecardSchema = z.object({
  panelist: personRefSchema,
  ratings: z.array(z.object({ criterion: z.string(), label: z.string(), rating: z.number().int().min(1).max(5) })),
  average: z.string(),
  recommendation: recommendationSchema,
  comments: z.string(),
  submittedAt: instantSchema,
});

export const interviewSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  candidateName: z.string(),
  candidateReference: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  round: z.number().int(),
  type: interviewTypeSchema,
  scheduledAt: instantSchema,
  durationMinutes: z.number().int(),
  mode: interviewModeSchema,
  locationOrLink: z.string(),
  panel: z.array(z.object({ person: personRefSchema, submitted: z.boolean() })),
  state: interviewStateSchema,
  /** Only the scorecards this viewer may see. */
  scorecards: z.array(scorecardSchema),
  /** Other panelists' feedback exists but stays hidden until the viewer submits. */
  feedbackHidden: z.boolean(),
  isPanelist: z.boolean(),
  myScorecardSubmitted: z.boolean(),
  canSubmit: z.boolean(),
  submitBlockedReason: z.string().nullable(),
  /** Minimal candidate context for panelists (no contact details or pay). */
  candidateSummary: z.object({ experienceYears: z.string(), currentCompany: z.string().nullable(), resumeName: z.string().nullable() }),
});

export const offerSchema = z.object({
  id: z.string(),
  reference: z.string(),
  candidateId: z.string(),
  candidateName: z.string(),
  jobId: z.string(),
  jobTitle: z.string(),
  ctc: moneySchema,
  budgetMax: moneySchema,
  overBudget: z.boolean(),
  joiningDate: isoDateSchema,
  designation: z.string(),
  department: z.string(),
  location: z.string(),
  employmentType: employmentTypeSchema,
  manager: personRefSchema,
  state: offerStateSchema,
  createdBy: personRefSchema,
  createdAt: instantSchema,
  approver: personRefSchema.nullable(),
  approvedAt: instantSchema.nullable(),
  approvalNote: z.string().nullable(),
  respondedAt: instantSchema.nullable(),
  responseNote: z.string().nullable(),
  employeeId: z.string().nullable(),
  version: z.number().int(),
  canApprove: z.boolean(),
});

export const candidateDetailSchema = candidateListItemSchema.extend({
  currentCompany: z.string().nullable(),
  noticePeriodDays: z.number().int().nullable(),
  currentCtc: moneySchema.nullable(),
  expectedCtc: moneySchema.nullable(),
  referrer: personRefSchema.nullable(),
  resume: z.object({ name: z.string(), sizeBytes: z.number().int(), mime: z.string() }).nullable(),
  consentAt: instantSchema.nullable(),
  retainUntil: isoDateSchema,
  erasedAt: instantSchema.nullable(),
  rejectionReason: z.string().nullable(),
  employeeId: z.string().nullable(),
  duplicateOf: z.object({ id: z.string(), reference: z.string(), jobTitle: z.string() }).nullable(),
  jobState: jobStateSchema,
  version: z.number().int(),
  notes: z.array(z.object({ id: z.string(), author: personRefSchema, body: z.string(), at: instantSchema })),
  timeline: z.array(z.object({ id: z.string(), at: instantSchema, actor: z.string(), title: z.string(), detail: z.string().nullable() })),
  interviews: z.array(interviewSchema),
  offer: offerSchema.nullable(),
  permissions: z.object({
    canMove: z.boolean(),
    canSchedule: z.boolean(),
    canOffer: z.boolean(),
    canConvert: z.boolean(),
    canErase: z.boolean(),
    eraseBlockedReason: z.string().nullable(),
  }),
});

export const recruitmentStatsSchema = z.object({
  openPositions: z.number().int(),
  activeJobs: z.number().int(),
  inPipeline: z.number().int(),
  offersAccepted: z.number().int(),
  offersDecided: z.number().int(),
  acceptanceRate: z.number().int().nullable(),
  avgDaysToHire: z.number().int().nullable(),
  hires: z.number().int(),
  pendingRequisitions: z.number().int(),
  pendingOfferApprovals: z.number().int(),
  sources: z.array(
    z.object({ source: candidateSourceSchema, candidates: z.number().int(), interviewed: z.number().int(), hired: z.number().int(), conversion: z.number().int() }),
  ),
});

export const recruitmentOptionsSchema = z.object({
  departments: z.array(z.string()),
  locations: z.array(z.string()),
  people: z.array(personRefSchema),
  jobs: z.array(z.object({ id: z.string(), title: z.string(), state: jobStateSchema })),
  today: isoDateSchema,
});

export const publicJobSchema = z.object({
  id: z.string(),
  reference: z.string(),
  title: z.string(),
  department: z.string(),
  location: z.string(),
  employmentType: employmentTypeSchema,
  experienceMin: z.number().int(),
  experienceMax: z.number().int(),
  description: z.string(),
  skills: z.array(z.string()),
  postedOn: isoDateSchema,
});

export const myReferralSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  name: z.string(),
  jobTitle: z.string(),
  status: z.enum(["in_process", "hired", "not_selected"]),
  referredAt: instantSchema,
});

export const myInterviewsSchema = z.object({
  interviews: z.array(interviewSchema),
  requisitions: z.array(requisitionSchema),
  offerApprovals: z.array(offerSchema),
  canApproveOffers: z.boolean(),
});

export type Requisition = z.infer<typeof requisitionSchema>;
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type PipelineCard = z.infer<typeof pipelineCardSchema>;
export type CandidateListItem = z.infer<typeof candidateListItemSchema>;
export type CandidateDetail = z.infer<typeof candidateDetailSchema>;
export type Interview = z.infer<typeof interviewSchema>;
export type Scorecard = z.infer<typeof scorecardSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type RecruitmentStats = z.infer<typeof recruitmentStatsSchema>;
export type RecruitmentOptions = z.infer<typeof recruitmentOptionsSchema>;
export type PublicJob = z.infer<typeof publicJobSchema>;
export type MyReferral = z.infer<typeof myReferralSchema>;
export type MyInterviews = z.infer<typeof myInterviewsSchema>;

/* Inputs --------------------------------------------------------------------- */

const text = (label: string, min: number, max: number) =>
  z.string().trim().min(min, min <= 1 ? `Enter ${label}.` : `${label} needs at least ${min} characters.`).max(max, `Keep ${label} under ${max} characters.`);
/** Whole rupees; commas allowed. Converted to integer paise by the handler. */
const rupees = (label: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/[,\s₹]/g, ""))
    .pipe(z.string().regex(/^\d{1,9}$/, `Enter ${label} in whole rupees.`));
const optionalRupees = (label: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/[,\s₹]/g, ""))
    .pipe(z.string().regex(/^(\d{1,9})?$/, `Enter ${label} in whole rupees.`))
    .optional();
const personName = z
  .string()
  .trim()
  .min(3, "Enter the full name.")
  .max(80)
  .regex(/^[\p{L} .'-]+$/u, "Letters, spaces, dots and hyphens only.");
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).pipe(z.string().max(120));
const phone = z
  .string()
  .trim()
  .regex(/^(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/, "Enter a 10-digit Indian mobile number.");
const years = z
  .string()
  .trim()
  .regex(/^\d{1,2}(\.\d)?$/, "Years, e.g. 4 or 4.5.")
  .refine((value) => Number(value) <= 45, "Up to 45 years.");
const checkbox = z.literal("on", { error: "Consent is required." });
const intIn = (min: number, max: number, message: string) => z.coerce.number({ error: message }).int(message).min(min, message).max(max, message);

export const requisitionInputSchema = z
  .object({
    title: text("the role", 3, 80),
    department: z.string().min(1, "Choose a department."),
    location: z.string().min(1, "Choose a location."),
    openings: intIn(1, 20, "1 to 20 openings."),
    employmentType: employmentTypeSchema,
    budgetMin: rupees("the minimum"),
    budgetMax: rupees("the maximum"),
    justification: requisitionJustificationSchema,
    backfillFor: z.string().trim().max(80).optional(),
    reason: text("a justification", 10, 600),
  })
  .superRefine((value, ctx) => {
    if (Number(value.budgetMax) < Number(value.budgetMin)) ctx.addIssue({ code: "custom", path: ["budgetMax"], message: "Maximum must be at least the minimum." });
    if (value.justification === "backfill" && !value.backfillFor) ctx.addIssue({ code: "custom", path: ["backfillFor"], message: "Name the person or role being backfilled." });
  });

export const requisitionDecisionSchema = z
  .object({
    requisitionId: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(400).optional(),
    expectedVersion: z.coerce.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "reject" && (!value.note || value.note.length < 5)) ctx.addIssue({ code: "custom", path: ["note"], message: "Explain the rejection (5+ characters)." });
  });

export const jobInputSchema = z
  .object({
    jobId: z.string().optional(),
    title: text("the job title", 3, 80),
    department: z.string().min(1, "Choose a department."),
    location: z.string().min(1, "Choose a location."),
    employmentType: employmentTypeSchema,
    openings: intIn(1, 20, "1 to 20 openings."),
    hiringManagerId: z.string().min(1, "Choose a hiring manager."),
    description: text("the description", 50, 4000),
    skills: z
      .string()
      .trim()
      .transform((value) => [...new Set(value.split(",").map((skill) => skill.trim()).filter(Boolean))])
      .pipe(z.array(z.string().max(40, "Keep each skill under 40 characters.")).min(1, "Add at least one skill.").max(12, "Up to 12 skills.")),
    experienceMin: intIn(0, 30, "0 to 30 years."),
    experienceMax: intIn(0, 40, "0 to 40 years."),
    ctcMin: rupees("the minimum CTC"),
    ctcMax: rupees("the maximum CTC"),
    publishToCareers: z.string().optional().transform((value) => value === "on"),
    expectedVersion: z.coerce.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.experienceMax < value.experienceMin) ctx.addIssue({ code: "custom", path: ["experienceMax"], message: "Maximum must be at least the minimum." });
    if (Number(value.ctcMax) < Number(value.ctcMin)) ctx.addIssue({ code: "custom", path: ["ctcMax"], message: "Maximum must be at least the minimum." });
  });

export const jobStateInputSchema = z.object({
  jobId: z.string().min(1),
  to: z.enum(["published", "on_hold", "closed"]),
  expectedVersion: z.coerce.number().int().optional(),
});

export const candidateInputSchema = z
  .object({
    jobId: z.string().min(1, "Choose a job opening."),
    name: personName,
    email,
    phone,
    currentCompany: z.string().trim().max(80).optional(),
    experienceYears: years,
    noticePeriodDays: intIn(0, 180, "0 to 180 days."),
    currentCtc: optionalRupees("current CTC"),
    expectedCtc: optionalRupees("expected CTC"),
    source: candidateSourceSchema.exclude(["careers"]),
    referrerId: z.string().optional(),
    consent: checkbox,
    allowDuplicate: z.string().optional().transform((value) => value === "on"),
  })
  .superRefine((value, ctx) => {
    if (value.source === "referral" && !value.referrerId) ctx.addIssue({ code: "custom", path: ["referrerId"], message: "Choose the referring employee." });
  });

export const stageMoveInputSchema = z
  .object({
    candidateId: z.string().min(1),
    to: recruitmentStageSchema.exclude(["hired"]),
    reason: z.string().trim().max(400).optional(),
    expectedVersion: z.coerce.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.to === "rejected" && (!value.reason || value.reason.length < 5)) ctx.addIssue({ code: "custom", path: ["reason"], message: "A rejection reason is required (5+ characters)." });
  });

export const candidateNoteInputSchema = z.object({ candidateId: z.string().min(1), body: text("a note", 2, 1000) });

export const interviewInputSchema = z.object({
  candidateId: z.string().min(1),
  type: interviewTypeSchema,
  date: isoDateSchema,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time."),
  durationMinutes: z.coerce.number().pipe(z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)])),
  mode: interviewModeSchema,
  locationOrLink: text("a meeting link or room", 3, 200),
  panelIds: z.array(z.string().min(1)).min(1, "Add at least one panelist.").max(4, "Up to 4 panelists."),
});

const rating = intIn(1, 5, "Rate 1 to 5.");
export const scorecardInputSchema = z.object({
  interviewId: z.string().min(1),
  ratings: z.object({
    skills: rating,
    problem_solving: rating,
    communication: rating,
    ownership: rating,
    culture: rating,
  } satisfies Record<ScorecardCriterion, typeof rating>),
  recommendation: recommendationSchema,
  comments: text("comments", 10, 2000),
});

export const offerInputSchema = z.object({
  candidateId: z.string().min(1),
  ctc: rupees("the annual CTC"),
  joiningDate: isoDateSchema,
  designation: text("the designation", 2, 80),
  department: z.string().min(1, "Choose a department."),
  location: z.string().min(1, "Choose a location."),
  managerId: z.string().min(1, "Choose a reporting manager."),
});

export const offerApprovalInputSchema = z
  .object({
    offerId: z.string().min(1),
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(400).optional(),
    expectedVersion: z.coerce.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "reject" && (!value.note || value.note.length < 5)) ctx.addIssue({ code: "custom", path: ["note"], message: "Explain the rejection (5+ characters)." });
  });

export const offerResponseInputSchema = z
  .object({
    offerId: z.string().min(1),
    response: z.enum(["accepted", "declined"]),
    note: z.string().trim().max(400).optional(),
    expectedVersion: z.coerce.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.response === "declined" && (!value.note || value.note.length < 3)) ctx.addIssue({ code: "custom", path: ["note"], message: "Record why the offer was declined." });
  });

export const convertInputSchema = z.object({ offerId: z.string().min(1), confirm: z.literal("on", { error: "Confirm the details first." }) });
export const eraseInputSchema = z.object({ candidateId: z.string().min(1), confirm: z.literal("on", { error: "Confirm the erasure first." }) });

export const applyInputSchema = z.object({
  jobId: z.string().min(1),
  name: personName,
  email,
  phone,
  experienceYears: years,
  currentCompany: z.string().trim().max(80).optional(),
  noticePeriodDays: z.union([z.literal(""), intIn(0, 180, "0 to 180 days.")]).optional(),
  consent: checkbox,
});

export const referralInputSchema = z.object({
  jobId: z.string().min(1),
  name: personName,
  email,
  phone,
  experienceYears: years,
  relationship: text("how you know them", 3, 300),
  consent: z.literal("on", { error: "Confirm they agreed to be referred." }),
});

/** Resume metadata only; bytes are never stored or served by the mock. */
export const resumeMetaSchema = z.object({
  name: z.string().min(1).max(160),
  sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024, "Resumes must be 5 MB or smaller."),
  mime: z.enum(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], { error: "Upload a PDF or Word document." }),
});

export type RequisitionInput = z.infer<typeof requisitionInputSchema>;
export type RequisitionDecisionInput = z.infer<typeof requisitionDecisionSchema>;
export type JobInput = z.infer<typeof jobInputSchema>;
export type JobStateInput = z.infer<typeof jobStateInputSchema>;
export type CandidateInput = z.infer<typeof candidateInputSchema>;
export type StageMoveInput = z.infer<typeof stageMoveInputSchema>;
export type CandidateNoteInput = z.infer<typeof candidateNoteInputSchema>;
export type InterviewInput = z.infer<typeof interviewInputSchema>;
export type ScorecardInput = z.infer<typeof scorecardInputSchema>;
export type OfferInput = z.infer<typeof offerInputSchema>;
export type OfferApprovalInput = z.infer<typeof offerApprovalInputSchema>;
export type OfferResponseInput = z.infer<typeof offerResponseInputSchema>;
export type ConvertInput = z.infer<typeof convertInputSchema>;
export type EraseInput = z.infer<typeof eraseInputSchema>;
export type ApplyInput = z.infer<typeof applyInputSchema>;
export type ReferralInput = z.infer<typeof referralInputSchema>;
export type ResumeMeta = z.infer<typeof resumeMetaSchema>;
