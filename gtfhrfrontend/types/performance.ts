import { z } from "zod";
import { decimalSchema, instantSchema, isoDateSchema, personRefSchema } from "@/types/common";

/*
 * Performance management contract (HR-11): review cycles, goals/KRAs,
 * competencies, self → manager review, calibration, release and continuous
 * feedback. Ratings are integers 1–5; scores are exact decimal strings.
 * Visibility and release dates protect unreleased feedback; increment
 * recommendations never change salary on their own.
 */

export const perfPhaseSchema = z.enum(["draft", "goal_setting", "self_review", "manager_review", "calibration", "released"]);
export type PerfPhase = z.infer<typeof perfPhaseSchema>;
export const perfPhaseOrder: readonly PerfPhase[] = ["draft", "goal_setting", "self_review", "manager_review", "calibration", "released"];
export const perfPhaseLabels: Record<PerfPhase, string> = {
  draft: "Draft",
  goal_setting: "Goal setting",
  self_review: "Self review",
  manager_review: "Manager review",
  calibration: "Calibration",
  released: "Released",
};
/** Phases that carry a date window (draft has none; release is a single date). */
export const perfWindowPhases = ["goal_setting", "self_review", "manager_review", "calibration"] as const;
export type PerfWindowPhase = (typeof perfWindowPhases)[number];

export const perfCycleKindSchema = z.enum(["annual", "half_yearly", "quarterly"]);
export const perfCycleKindLabels: Record<z.infer<typeof perfCycleKindSchema>, string> = {
  annual: "Annual",
  half_yearly: "Half-yearly",
  quarterly: "Quarterly goals",
};

export const perfHealthSchema = z.enum(["on_track", "at_risk", "off_track"]);
export type PerfHealth = z.infer<typeof perfHealthSchema>;
export const perfHealthLabels: Record<PerfHealth, { label: string; tone: "success" | "warning" | "danger" }> = {
  on_track: { label: "On track", tone: "success" },
  at_risk: { label: "At risk", tone: "warning" },
  off_track: { label: "Off track", tone: "danger" },
};

export const perfSheetStatusSchema = z.enum(["draft", "submitted", "approved", "sent_back"]);
export type PerfSheetStatus = z.infer<typeof perfSheetStatusSchema>;
export const perfSheetStatusLabels: Record<PerfSheetStatus, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  sent_back: { label: "Sent back", tone: "danger" },
};

export const perfPartStatusSchema = z.enum(["not_started", "draft", "submitted"]);
export type PerfPartStatus = z.infer<typeof perfPartStatusSchema>;
export const perfPartStatusLabels: Record<PerfPartStatus, { label: string; tone: "neutral" | "warning" | "success" }> = {
  not_started: { label: "Not started", tone: "neutral" },
  draft: { label: "In progress", tone: "warning" },
  submitted: { label: "Submitted", tone: "success" },
};

export const perfPromotionSchema = z.enum(["not_now", "ready_next_cycle", "ready"]);
export type PerfPromotion = z.infer<typeof perfPromotionSchema>;
export const perfPromotionLabels: Record<PerfPromotion, string> = {
  not_now: "Not recommended this cycle",
  ready_next_cycle: "Ready next cycle",
  ready: "Ready now",
};

export const ratingLevelSchema = z.object({
  rating: z.number().int().min(1).max(5),
  label: z.string(),
  description: z.string(),
});
export type RatingLevel = z.infer<typeof ratingLevelSchema>;

export const dateRangeSchema = z.object({ start: isoDateSchema, end: isoDateSchema });

export const perfAuditEntrySchema = z.object({
  id: z.string(),
  at: instantSchema,
  actor: z.string(),
  event: z.string(),
});
export type PerfAuditEntry = z.infer<typeof perfAuditEntrySchema>;

export const perfCycleSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: perfCycleKindSchema,
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  eligibilityCutoff: isoDateSchema,
  /** Empty = every department. */
  departments: z.array(z.string()),
  goalWeight: z.number().int().min(0).max(100),
  competencyWeight: z.number().int().min(0).max(100),
  scale: z.array(ratingLevelSchema).length(5),
  /** Guideline distribution in percent, index 0 = rating 1. */
  guideline: z.array(z.number().int()).length(5),
  phase: perfPhaseSchema,
  phaseDates: z.object({
    goal_setting: dateRangeSchema,
    self_review: dateRangeSchema,
    manager_review: dateRangeSchema,
    calibration: dateRangeSchema,
  }),
  releaseOn: isoDateSchema,
  calibrationLocked: z.boolean(),
  releasedAt: instantSchema.nullable(),
  participantCount: z.number().int().nonnegative(),
  version: z.number().int(),
});
export type PerfCycle = z.infer<typeof perfCycleSchema>;

export const perfCompetencySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  behaviours: z.array(z.string()),
});
export type PerfCompetency = z.infer<typeof perfCompetencySchema>;

export const perfObjectiveSchema = z.object({ id: z.string(), title: z.string() });
export type PerfObjective = z.infer<typeof perfObjectiveSchema>;

export const perfCheckInSchema = z.object({
  id: z.string(),
  at: instantSchema,
  progress: z.number().int().min(0).max(100),
  health: perfHealthSchema,
  comment: z.string(),
  author: z.string(),
});
export type PerfCheckIn = z.infer<typeof perfCheckInSchema>;

export const perfGoalSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  target: z.string(),
  weight: z.number().int(),
  dueDate: isoDateSchema,
  objective: perfObjectiveSchema.nullable(),
  progress: z.number().int(),
  health: perfHealthSchema,
  checkIns: z.array(perfCheckInSchema),
});
export type PerfGoal = z.infer<typeof perfGoalSchema>;

export const perfSheetSchema = z.object({
  id: z.string(),
  status: perfSheetStatusSchema,
  totalWeight: z.number().int(),
  submittedAt: instantSchema.nullable(),
  decidedAt: instantSchema.nullable(),
  decidedBy: z.string().nullable(),
  comment: z.string().nullable(),
  version: z.number().int(),
});
export type PerfSheet = z.infer<typeof perfSheetSchema>;

export const perfRatingEntrySchema = z.object({
  targetId: z.string(),
  rating: z.number().int().min(1).max(5).nullable(),
  comment: z.string(),
});
export type PerfRatingEntry = z.infer<typeof perfRatingEntrySchema>;

export const perfSelfPartSchema = z.object({
  status: perfPartStatusSchema,
  goals: z.array(perfRatingEntrySchema),
  competencies: z.array(perfRatingEntrySchema),
  strengths: z.string(),
  improvements: z.string(),
  submittedAt: instantSchema.nullable(),
  /** Weighted score from the ratings so far, e.g. "3.70". */
  score: decimalSchema.nullable(),
});
export type PerfSelfPart = z.infer<typeof perfSelfPartSchema>;

export const perfManagerPartSchema = perfSelfPartSchema.extend({
  overallRating: z.number().int().min(1).max(5).nullable(),
  summary: z.string(),
  promotion: perfPromotionSchema,
  /** Recommendation only, percent with two decimals. */
  incrementPercent: decimalSchema.nullable(),
});
export type PerfManagerPart = z.infer<typeof perfManagerPartSchema>;

/** The employee's own outcome: withheld until the cycle is released. */
export const perfOutcomeSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("under_review"), releaseOn: isoDateSchema }),
  z.object({ state: z.literal("not_rated"), reason: z.string() }),
  z.object({
    state: z.literal("released"),
    finalRating: z.number().int().min(1).max(5),
    finalLabel: z.string(),
    managerScore: decimalSchema.nullable(),
    manager: perfManagerPartSchema.nullable(),
    reviewer: personRefSchema.nullable(),
    releasedAt: instantSchema,
    acknowledgedAt: instantSchema.nullable(),
    acknowledgementComment: z.string().nullable(),
  }),
]);
export type PerfOutcome = z.infer<typeof perfOutcomeSchema>;

export const myPerformanceSchema = z.object({
  cycles: z.array(perfCycleSchema),
  cycle: perfCycleSchema.nullable(),
  reviewId: z.string().nullable(),
  reviewVersion: z.number().int(),
  reviewer: personRefSchema.nullable(),
  sheet: perfSheetSchema.nullable(),
  goals: z.array(perfGoalSchema),
  competencies: z.array(perfCompetencySchema),
  objectives: z.array(perfObjectiveSchema),
  self: perfSelfPartSchema.nullable(),
  outcome: perfOutcomeSchema.nullable(),
  can: z.object({ editGoals: z.boolean(), checkIn: z.boolean(), selfReview: z.boolean(), acknowledge: z.boolean() }),
  history: z.array(
    z.object({ cycleId: z.string(), cycleName: z.string(), finalRating: z.number().int().nullable(), finalLabel: z.string().nullable(), releasedAt: instantSchema.nullable(), acknowledged: z.boolean() }),
  ),
});
export type MyPerformance = z.infer<typeof myPerformanceSchema>;

export const teamRevieweeSchema = z.object({
  reviewId: z.string(),
  person: personRefSchema,
  department: z.string(),
  sheet: perfSheetSchema.nullable(),
  goalCount: z.number().int(),
  selfStatus: perfPartStatusSchema,
  managerStatus: perfPartStatusSchema,
  managerRating: z.number().int().nullable(),
  finalRating: z.number().int().nullable(),
  reassigned: z.boolean(),
});
export type TeamReviewee = z.infer<typeof teamRevieweeSchema>;

export const perfReviewDetailSchema = z.object({
  reviewId: z.string(),
  version: z.number().int(),
  person: personRefSchema,
  cycle: perfCycleSchema,
  sheet: perfSheetSchema.nullable(),
  goals: z.array(perfGoalSchema),
  competencies: z.array(perfCompetencySchema),
  /** Null until the employee submits (drafts stay private). */
  self: perfSelfPartSchema.nullable(),
  selfStatus: perfPartStatusSchema,
  manager: perfManagerPartSchema,
  canEdit: z.boolean(),
  lockReason: z.string().nullable(),
  finalRating: z.number().int().nullable(),
  acknowledgedAt: instantSchema.nullable(),
  acknowledgementComment: z.string().nullable(),
});
export type PerfReviewDetail = z.infer<typeof perfReviewDetailSchema>;

export const teamPerformanceSchema = z.object({
  cycles: z.array(perfCycleSchema),
  cycle: perfCycleSchema.nullable(),
  reviewees: z.array(teamRevieweeSchema),
  approvals: z.array(z.object({ person: personRefSchema, cycleId: z.string(), cycleName: z.string(), sheet: perfSheetSchema, goals: z.array(perfGoalSchema) })),
  detail: perfReviewDetailSchema.nullable(),
});
export type TeamPerformance = z.infer<typeof teamPerformanceSchema>;

export const perfParticipantSchema = z.object({
  reviewId: z.string(),
  person: personRefSchema,
  department: z.string(),
  reviewer: personRefSchema.nullable(),
  sheetStatus: perfSheetStatusSchema.nullable(),
  selfStatus: perfPartStatusSchema,
  managerStatus: perfPartStatusSchema,
  managerRating: z.number().int().nullable(),
  managerScore: decimalSchema.nullable(),
  promotion: perfPromotionSchema.nullable(),
  incrementPercent: decimalSchema.nullable(),
  finalRating: z.number().int().nullable(),
  finalReason: z.string().nullable(),
  version: z.number().int(),
});
export type PerfParticipant = z.infer<typeof perfParticipantSchema>;

export const perfDepartmentProgressSchema = z.object({
  department: z.string(),
  participants: z.number().int(),
  goalsApproved: z.number().int(),
  selfSubmitted: z.number().int(),
  managerSubmitted: z.number().int(),
  finalised: z.number().int(),
});
export type PerfDepartmentProgress = z.infer<typeof perfDepartmentProgressSchema>;

export const perfDistributionSchema = z.array(
  z.object({ rating: z.number().int(), label: z.string(), guideline: z.number().int(), count: z.number().int(), percent: z.number().int() }),
);
export type PerfDistribution = z.infer<typeof perfDistributionSchema>;

export const perfAdvanceSchema = z.object({
  next: perfPhaseSchema.nullable(),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const adminPerformanceSchema = z.object({
  cycles: z.array(perfCycleSchema),
  cycle: perfCycleSchema.nullable(),
  progress: z.array(perfDepartmentProgressSchema),
  participants: z.array(perfParticipantSchema),
  distribution: perfDistributionSchema,
  advance: perfAdvanceSchema,
  audit: z.array(perfAuditEntrySchema),
  competencies: z.array(perfCompetencySchema),
  departments: z.array(z.string()),
  reviewers: z.array(personRefSchema),
});
export type AdminPerformance = z.infer<typeof adminPerformanceSchema>;

/* Continuous feedback --------------------------------------------------- */

export const perfFeedbackVisibilitySchema = z.enum(["public", "private"]);
export const perfFeedbackKindSchema = z.enum(["praise", "suggestion"]);

export const perfFeedbackSchema = z.object({
  id: z.string(),
  from: personRefSchema,
  to: personRefSchema,
  visibility: perfFeedbackVisibilitySchema,
  kind: perfFeedbackKindSchema,
  competency: z.string().nullable(),
  goal: z.string().nullable(),
  message: z.string(),
  createdAt: instantSchema,
  inResponseToRequest: z.boolean(),
});
export type PerfFeedback = z.infer<typeof perfFeedbackSchema>;

export const perfFeedbackRequestSchema = z.object({
  id: z.string(),
  requester: personRefSchema,
  asked: personRefSchema,
  goal: z.string().nullable(),
  question: z.string(),
  status: z.enum(["pending", "answered", "declined"]),
  createdAt: instantSchema,
  respondedAt: instantSchema.nullable(),
});
export type PerfFeedbackRequest = z.infer<typeof perfFeedbackRequestSchema>;

export const perfOneOnOneSchema = z.object({
  id: z.string(),
  manager: personRefSchema,
  report: personRefSchema,
  author: z.string(),
  meetingOn: isoDateSchema,
  note: z.string(),
  actionItems: z.string(),
  createdAt: instantSchema,
});
export type PerfOneOnOne = z.infer<typeof perfOneOnOneSchema>;

export const feedbackHubSchema = z.object({
  received: z.array(perfFeedbackSchema),
  given: z.array(perfFeedbackSchema),
  wall: z.array(perfFeedbackSchema),
  teamPrivate: z.array(perfFeedbackSchema),
  requestsToMe: z.array(perfFeedbackRequestSchema),
  myRequests: z.array(perfFeedbackRequestSchema),
  oneOnOnes: z.array(perfOneOnOneSchema),
  /** 1:1 counterparts: my manager and my direct reports. */
  counterparts: z.array(personRefSchema.extend({ relation: z.enum(["manager", "report"]) })),
  colleagues: z.array(personRefSchema),
  competencies: z.array(z.object({ id: z.string(), name: z.string() })),
  myGoals: z.array(z.object({ id: z.string(), title: z.string() })),
});
export type FeedbackHub = z.infer<typeof feedbackHubSchema>;

/* Inputs ----------------------------------------------------------------- */

const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, min <= 1 ? `Enter ${label}.` : `${label.charAt(0).toUpperCase()}${label.slice(1)} needs at least ${min} characters.`).max(max, `Keep it under ${max} characters.`);
const optionalId = z.string().trim().max(120).optional().transform((value) => (value ? value : null));
const version = z.coerce.number().int().nonnegative().optional();

export const cycleInputSchema = z
  .object({
    id: z.string().optional(),
    version,
    name: text(3, 80, "a name"),
    kind: perfCycleKindSchema,
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    eligibilityCutoff: isoDateSchema,
    departments: z.array(z.string().min(1)),
    goalWeight: z.coerce.number({ message: "Enter a whole percent." }).int("Enter a whole percent.").min(0).max(100, "0–100%"),
    scale: z.array(z.object({ label: text(2, 40, "a label"), description: text(5, 200, "a description") })).length(5),
    guideline: z.array(z.coerce.number({ message: "Enter a whole percent." }).int("Enter a whole percent.").min(0, "0–100%").max(100, "0–100%")).length(5),
    phaseDates: z.object({
      goal_setting: dateRangeSchema,
      self_review: dateRangeSchema,
      manager_review: dateRangeSchema,
      calibration: dateRangeSchema,
    }),
    releaseOn: isoDateSchema,
  })
  .superRefine((value, ctx) => {
    if (value.periodEnd <= value.periodStart) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "The period must end after it starts." });
    const total = value.guideline.reduce((sum, n) => sum + n, 0);
    if (total !== 100) ctx.addIssue({ code: "custom", path: ["guideline", 0], message: `Guideline must total 100% (now ${total}%).` });
    let previousEnd: string | null = null;
    for (const phase of perfWindowPhases) {
      const range = value.phaseDates[phase];
      if (range.end < range.start) ctx.addIssue({ code: "custom", path: ["phaseDates", phase, "end"], message: "Ends before it starts." });
      if (previousEnd && range.start < previousEnd) ctx.addIssue({ code: "custom", path: ["phaseDates", phase, "start"], message: "Must start after the previous phase ends." });
      previousEnd = range.end;
    }
    if (previousEnd && value.releaseOn < previousEnd) ctx.addIssue({ code: "custom", path: ["releaseOn"], message: "Release comes after calibration ends." });
  });
export type CycleInput = z.infer<typeof cycleInputSchema>;

export const goalInputSchema = z.object({
  id: z.string().optional(),
  cycleId: z.string().min(1),
  title: text(3, 120, "a title"),
  description: z.string().trim().max(600, "Keep it under 600 characters."),
  target: text(3, 200, "a measurable target"),
  weight: z.coerce.number({ message: "Enter a whole percent." }).int("Enter a whole percent.").min(5, "At least 5%.").max(100, "At most 100%."),
  dueDate: isoDateSchema,
  objectiveId: optionalId,
});
export type GoalInput = z.infer<typeof goalInputSchema>;

export const goalDecisionSchema = z
  .object({
    sheetId: z.string().min(1),
    decision: z.enum(["approve", "send_back"]),
    comment: z.string().trim().max(500, "Keep it under 500 characters."),
    version,
  })
  .refine((value) => value.decision === "approve" || value.comment.length >= 5, { path: ["comment"], message: "Say what should change (at least 5 characters)." });
export type GoalDecisionInput = z.infer<typeof goalDecisionSchema>;

export const checkInInputSchema = z.object({
  goalId: z.string().min(1),
  progress: z.coerce.number({ message: "Enter 0–100." }).int("Whole percent only.").min(0, "Enter 0–100.").max(100, "Enter 0–100."),
  health: perfHealthSchema,
  comment: text(3, 500, "a short update"),
});
export type CheckInInput = z.infer<typeof checkInInputSchema>;

const ratingField = z
  .string()
  .optional()
  .transform((value) => (value ? Number(value) : null))
  .pipe(z.number().int().min(1).max(5).nullable());

export const ratingEntryInputSchema = z.object({ targetId: z.string().min(1), rating: ratingField, comment: z.string().trim().max(1000, "Keep it under 1000 characters.") });

export const reviewInputSchema = z.object({
  reviewId: z.string().min(1),
  intent: z.enum(["save", "submit"]),
  version,
  goals: z.array(ratingEntryInputSchema),
  competencies: z.array(ratingEntryInputSchema),
  strengths: z.string().trim().max(2000, "Keep it under 2000 characters."),
  improvements: z.string().trim().max(2000, "Keep it under 2000 characters."),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const managerReviewInputSchema = reviewInputSchema.extend({
  overallRating: ratingField,
  summary: z.string().trim().max(2000, "Keep it under 2000 characters."),
  promotion: perfPromotionSchema,
  incrementPercent: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .pipe(z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter a percent like 8 or 8.5.").nullable()),
});
export type ManagerReviewInput = z.infer<typeof managerReviewInputSchema>;

export const reassignInputSchema = z.object({ reviewId: z.string().min(1), reviewerId: z.string().min(1, "Choose a reviewer."), reason: text(5, 300, "a reason") });
export type ReassignInput = z.infer<typeof reassignInputSchema>;

export const calibrateInputSchema = z.object({
  reviewId: z.string().min(1),
  finalRating: z.coerce.number({ message: "Choose a rating." }).int().min(1, "Choose a rating.").max(5, "Choose a rating."),
  reason: text(10, 500, "a reason"),
  version,
});
export type CalibrateInput = z.infer<typeof calibrateInputSchema>;

export const acknowledgeInputSchema = z.object({ reviewId: z.string().min(1), comment: z.string().trim().max(500, "Keep it under 500 characters.") });
export type AcknowledgeInput = z.infer<typeof acknowledgeInputSchema>;

export const feedbackInputSchema = z.object({
  toId: z.string().min(1, "Choose a colleague."),
  visibility: perfFeedbackVisibilitySchema,
  kind: perfFeedbackKindSchema,
  competencyId: optionalId,
  requestId: optionalId,
  message: text(10, 1000, "your feedback"),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export const feedbackRequestInputSchema = z.object({
  askedId: z.string().min(1, "Choose a colleague."),
  goalId: optionalId,
  question: text(10, 300, "a question"),
});
export type FeedbackRequestInput = z.infer<typeof feedbackRequestInputSchema>;

export const oneOnOneInputSchema = z.object({
  counterpartId: z.string().min(1, "Choose who you met."),
  meetingOn: isoDateSchema,
  note: text(5, 2000, "notes"),
  actionItems: z.string().trim().max(1000, "Keep it under 1000 characters."),
});
export type OneOnOneInput = z.infer<typeof oneOnOneInputSchema>;

export const competencyInputSchema = z.object({
  id: z.string().optional(),
  name: text(2, 40, "a name"),
  description: text(10, 300, "a description"),
  behaviours: z
    .string()
    .transform((value) => value.split("\n").map((line) => line.trim()).filter(Boolean))
    .pipe(z.array(z.string().max(160, "Keep each behaviour under 160 characters.")).min(1, "Add at least one behaviour (one per line).").max(6, "Up to 6 behaviours.")),
});
export type CompetencyInput = z.infer<typeof competencyInputSchema>;

/** Hundredths → "3.70". */
export function scoreText(hundredths: number): string {
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

/**
 * Weighted score in hundredths (370 = 3.70) from the ratings present so far.
 * Goals are weighted by their weight; competencies are averaged; the two are
 * blended by the cycle's goal weightage. Integer maths only.
 */
export function weightedScore(goals: readonly { weight: number; rating: number | null }[], competencyRatings: readonly (number | null)[], goalWeight: number): number | null {
  const rated = goals.filter((g): g is { weight: number; rating: number } => g.rating !== null);
  const totalWeight = rated.reduce((sum, g) => sum + g.weight, 0);
  const goalScore = totalWeight > 0 ? Math.round((rated.reduce((sum, g) => sum + g.weight * g.rating, 0) * 100) / totalWeight) : null;
  const comps = competencyRatings.filter((r): r is number => r !== null);
  const compScore = comps.length > 0 ? Math.round((comps.reduce((sum, r) => sum + r, 0) * 100) / comps.length) : null;
  if (goalScore === null && compScore === null) return null;
  if (goalScore === null || goalWeight === 0) return compScore ?? goalScore;
  if (compScore === null || goalWeight === 100) return goalScore;
  return Math.round((goalScore * goalWeight + compScore * (100 - goalWeight)) / 100);
}
