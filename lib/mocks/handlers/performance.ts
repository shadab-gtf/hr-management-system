import "server-only";
import { problem } from "@/lib/api/core/problem";
import { departmentNames } from "@/lib/mocks/handlers/config";
import { notify } from "@/lib/mocks/handlers/notifications";
import { directReports, idempotent, me, ref, refById, requireCapability, versionCheck, type MockActor } from "@/lib/mocks/handlers/shared";
import { db, employeeById, nextId, nowInstant } from "@/lib/mocks/store";
import type { MockPerfCycle, MockPerfFeedback, MockPerfFeedbackRequest, MockPerfGoal, MockPerfManagerPart, MockPerfPart, MockPerfRating, MockPerfReview, MockPerfSheet } from "@/lib/mocks/seed/performance";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { addDays } from "@/lib/utils/date";
import {
  perfPhaseLabels,
  perfPhaseOrder,
  scoreText,
  weightedScore,
  type AcknowledgeInput,
  type AdminPerformance,
  type CalibrateInput,
  type CheckInInput,
  type CompetencyInput,
  type CycleInput,
  type FeedbackHub,
  type FeedbackInput,
  type FeedbackRequestInput,
  type GoalDecisionInput,
  type GoalInput,
  type ManagerReviewInput,
  type MyPerformance,
  type OneOnOneInput,
  type PerfCompetency,
  type PerfCycle,
  type PerfFeedback,
  type PerfFeedbackRequest,
  type PerfGoal,
  type PerfManagerPart,
  type PerfPhase,
  type PerfReviewDetail,
  type PerfSelfPart,
  type PerfSheet,
  type ReassignInput,
  type ReviewInput,
  type TeamPerformance,
} from "@/types/performance";

/*
 * Performance management on the mock backend (HR-11). Every read is scoped:
 * employees see their own records, reviewers see only the people assigned to
 * them, HR sees cycles and calibration. Final ratings and manager comments stay
 * hidden from employees until the cycle is released. Increment figures are
 * recommendations only — salary changes need a separate compensation approval.
 */

const phaseIndex = (phase: PerfPhase) => perfPhaseOrder.indexOf(phase);
const MAX_GOALS = 8;

function cycleById(id: string): MockPerfCycle {
  const cycle = db().perfCycles.find((c) => c.id === id);
  if (!cycle) throw problem(404, "CYCLE_NOT_FOUND", "That review cycle doesn't exist.");
  return cycle;
}
function eligibleFor(cycle: Pick<MockPerfCycle, "eligibilityCutoff" | "departments">): SeedEmployee[] {
  return db().employees.filter((e) => e.status !== "exited" && e.joinedOn <= cycle.eligibilityCutoff && (cycle.departments.length === 0 || cycle.departments.includes(e.department)));
}
const reviewsOf = (cycleId: string) => db().perfReviews.filter((r) => r.cycleId === cycleId);
const reviewFor = (cycleId: string, employeeId: string) => db().perfReviews.find((r) => r.cycleId === cycleId && r.employeeId === employeeId);
const sheetFor = (cycleId: string, employeeId: string) => db().perfSheets.find((s) => s.cycleId === cycleId && s.employeeId === employeeId);
const goalsFor = (cycleId: string, employeeId: string) => db().perfGoals.filter((g) => g.cycleId === cycleId && g.employeeId === employeeId);
const nameOf = (id: string | null) => (id ? (employeeById(id)?.name ?? "Former employee") : "System");

function audit(actor: MockActor | null, cycleId: string | null, event: string) {
  db().perfAudit.push({ id: nextId("pa"), at: nowInstant(), actorId: actor?.employeeId ?? null, cycleId, event });
}

function personRef(id: string) {
  const person = refById(id);
  if (!person) throw problem(404, "EMPLOYEE_NOT_FOUND", "That person isn't in the directory.");
  return person;
}

/* Mapping ----------------------------------------------------------------- */

function toCycle(cycle: MockPerfCycle): PerfCycle {
  return {
    id: cycle.id,
    name: cycle.name,
    kind: cycle.kind,
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    eligibilityCutoff: cycle.eligibilityCutoff,
    departments: [...cycle.departments],
    goalWeight: cycle.goalWeight,
    competencyWeight: 100 - cycle.goalWeight,
    scale: cycle.scale.map((level) => ({ ...level })),
    guideline: [...cycle.guideline],
    phase: cycle.phase,
    phaseDates: structuredClone(cycle.phaseDates),
    releaseOn: cycle.releaseOn,
    calibrationLocked: cycle.calibrationLocked,
    releasedAt: cycle.releasedAt,
    participantCount: cycle.phase === "draft" ? eligibleFor(cycle).length : reviewsOf(cycle.id).length,
    version: cycle.version,
  };
}

function toGoal(goal: MockPerfGoal): PerfGoal {
  const objective = goal.objectiveId ? db().perfObjectives.find((o) => o.id === goal.objectiveId) : undefined;
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    target: goal.target,
    weight: goal.weight,
    dueDate: goal.dueDate,
    objective: objective ? { ...objective } : null,
    progress: goal.progress,
    health: goal.health,
    checkIns: [...goal.checkIns].reverse().map((c) => ({ id: c.id, at: c.at, progress: c.progress, health: c.health, comment: c.comment, author: nameOf(c.authorId) })),
  };
}

function toSheet(sheet: MockPerfSheet): PerfSheet {
  const total = goalsFor(sheet.cycleId, sheet.employeeId).reduce((sum, g) => sum + g.weight, 0);
  return { id: sheet.id, status: sheet.status, totalWeight: total, submittedAt: sheet.submittedAt, decidedAt: sheet.decidedAt, decidedBy: sheet.decidedById ? nameOf(sheet.decidedById) : null, comment: sheet.comment, version: sheet.version };
}

function competencies(): PerfCompetency[] {
  return db().perfCompetencies.map((c) => ({ ...c, behaviours: [...c.behaviours] }));
}

/** Aligns stored ratings with the current goals and competencies. */
function aligned(entries: MockPerfRating[], ids: string[]): MockPerfRating[] {
  return ids.map((id) => entries.find((e) => e.targetId === id) ?? { targetId: id, rating: null, comment: "" });
}

/** Weighted score in hundredths from whatever has been rated so far. */
function scoreOf(part: MockPerfPart, goals: MockPerfGoal[], cycle: MockPerfCycle): number | null {
  return weightedScore(
    goals.map((g) => ({ weight: g.weight, rating: part.goals.find((e) => e.targetId === g.id)?.rating ?? null })),
    part.competencies.map((c) => c.rating),
    cycle.goalWeight,
  );
}

function toSelf(part: MockPerfPart, goals: MockPerfGoal[], cycle: MockPerfCycle): PerfSelfPart {
  const score = scoreOf(part, goals, cycle);
  return {
    status: part.status,
    goals: aligned(part.goals, goals.map((g) => g.id)).map((e) => ({ ...e })),
    competencies: aligned(part.competencies, db().perfCompetencies.map((c) => c.id)).map((e) => ({ ...e })),
    strengths: part.strengths,
    improvements: part.improvements,
    submittedAt: part.submittedAt,
    score: score === null ? null : scoreText(score),
  };
}
function toManager(part: MockPerfManagerPart, goals: MockPerfGoal[], cycle: MockPerfCycle): PerfManagerPart {
  return {
    ...toSelf(part, goals, cycle),
    overallRating: part.overallRating,
    summary: part.summary,
    promotion: part.promotion,
    incrementPercent: part.incrementBps === null ? null : scoreText(part.incrementBps),
  };
}

const ratingLabel = (cycle: MockPerfCycle, rating: number | null) => (rating ? (cycle.scale.find((s) => s.rating === rating)?.label ?? `Rating ${rating}`) : null);

/* Employee: my goals and reviews ------------------------------------------ */

function pickDefaultCycle(cycles: MockPerfCycle[]): MockPerfCycle | undefined {
  const reviewing = cycles.find((c) => ["self_review", "manager_review", "calibration"].includes(c.phase));
  return reviewing ?? cycles.find((c) => c.phase === "goal_setting") ?? cycles.find((c) => c.phase === "released");
}

export function getMyPerformance(actor: MockActor, cycleId: string | undefined): MyPerformance {
  requireCapability(actor, "performance.self");
  const store = db();
  const mine = store.perfCycles
    .filter((c) => c.phase !== "draft" && reviewFor(c.id, actor.employeeId))
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const cycle = (cycleId ? mine.find((c) => c.id === cycleId) : undefined) ?? pickDefaultCycle(mine);
  const history = mine
    .filter((c) => c.phase === "released")
    .map((c) => {
      const review = reviewFor(c.id, actor.employeeId);
      return { cycleId: c.id, cycleName: c.name, finalRating: review?.finalRating ?? null, finalLabel: ratingLabel(c, review?.finalRating ?? null), releasedAt: c.releasedAt, acknowledged: Boolean(review?.acknowledgedAt) };
    });
  const empty: MyPerformance = { cycles: mine.map(toCycle), cycle: null, reviewId: null, reviewVersion: 0, reviewer: null, sheet: null, goals: [], competencies: competencies(), objectives: store.perfObjectives.map((o) => ({ ...o })), self: null, outcome: null, can: { editGoals: false, checkIn: false, selfReview: false, acknowledge: false }, history };
  if (!cycle) return empty;
  const review = reviewFor(cycle.id, actor.employeeId);
  const sheet = sheetFor(cycle.id, actor.employeeId);
  if (!review) return empty;
  const goals = goalsFor(cycle.id, actor.employeeId);
  const released = cycle.phase === "released";
  let outcome: MyPerformance["outcome"] = null;
  if (released) {
    outcome =
      review.finalRating && cycle.releasedAt
        ? {
            state: "released",
            finalRating: review.finalRating,
            finalLabel: ratingLabel(cycle, review.finalRating) ?? "",
            managerScore: review.manager.status === "submitted" ? (() => { const s = scoreOf(review.manager, goals, cycle); return s === null ? null : scoreText(s); })() : null,
            manager: review.manager.status === "submitted" ? toManager(review.manager, goals, cycle) : null,
            reviewer: refById(review.reviewerId),
            releasedAt: cycle.releasedAt,
            acknowledgedAt: review.acknowledgedAt,
            acknowledgementComment: review.acknowledgementComment,
          }
        : { state: "not_rated", reason: "Your review wasn't completed in this cycle, so no final rating was released. Talk to HR if this looks wrong." };
  } else if (review.self.status === "submitted" || phaseIndex(cycle.phase) >= phaseIndex("manager_review")) {
    outcome = { state: "under_review", releaseOn: cycle.releaseOn };
  }
  const selfOpen = ["self_review", "manager_review"].includes(cycle.phase) && sheet?.status === "approved" && review.self.status !== "submitted" && review.manager.status !== "submitted";
  return {
    ...empty,
    cycle: toCycle(cycle),
    reviewId: review.id,
    reviewVersion: review.version,
    reviewer: refById(review.reviewerId),
    sheet: sheet ? toSheet(sheet) : null,
    goals: goals.map(toGoal),
    self: toSelf(review.self, goals, cycle),
    outcome,
    can: {
      editGoals: cycle.phase === "goal_setting" && (sheet?.status === "draft" || sheet?.status === "sent_back"),
      checkIn: sheet?.status === "approved" && !released,
      selfReview: selfOpen,
      acknowledge: released && review.finalRating !== null && !review.acknowledgedAt,
    },
  };
}

function ownEditableSheet(actor: MockActor, cycleId: string) {
  const cycle = cycleById(cycleId);
  const sheet = sheetFor(cycle.id, actor.employeeId);
  if (!sheet) throw problem(403, "NOT_A_PARTICIPANT", "You aren't part of this review cycle.");
  if (cycle.phase !== "goal_setting") throw problem(409, "GOALS_LOCKED", `Goals can only change during goal setting. This cycle is in ${perfPhaseLabels[cycle.phase]}.`);
  if (sheet.status === "submitted") throw problem(409, "GOALS_SUBMITTED", "Your goals are with your manager. Wait for approval or a send-back to edit.");
  if (sheet.status === "approved") throw problem(409, "GOALS_APPROVED", "These goals are approved and locked for the cycle.");
  return { cycle, sheet };
}

export function saveGoal(actor: MockActor, input: GoalInput, key: string | undefined) {
  requireCapability(actor, "performance.self");
  return idempotent(key, () => {
    const { cycle, sheet } = ownEditableSheet(actor, input.cycleId);
    const store = db();
    const existing = input.id ? store.perfGoals.find((g) => g.id === input.id) : undefined;
    if (input.id && (!existing || existing.employeeId !== actor.employeeId || existing.cycleId !== cycle.id)) throw problem(404, "GOAL_NOT_FOUND", "That goal doesn't exist.");
    const others = goalsFor(cycle.id, actor.employeeId).filter((g) => g.id !== input.id);
    if (!existing && others.length >= MAX_GOALS) throw problem(422, "TOO_MANY_GOALS", `Keep your goal sheet focused — up to ${MAX_GOALS} goals.`);
    const total = others.reduce((sum, g) => sum + g.weight, 0) + input.weight;
    if (total > 100) throw problem(422, "WEIGHT_OVER", "Weights can't exceed 100%.", { fieldErrors: { weight: `Total would be ${total}%. Reduce this or another goal (${100 - (total - input.weight)}% left).` } });
    if (input.dueDate < cycle.periodStart || input.dueDate > addDays(cycle.periodEnd, 0)) throw problem(422, "DUE_OUTSIDE_PERIOD", "Due date must fall in the review period.", { fieldErrors: { dueDate: `Choose a date between ${cycle.periodStart} and ${cycle.periodEnd}.` } });
    if (input.objectiveId && !store.perfObjectives.some((o) => o.id === input.objectiveId)) throw problem(422, "UNKNOWN_OBJECTIVE", "Choose a listed company objective.", { fieldErrors: { objectiveId: "Choose a listed objective." } });
    if (others.some((g) => g.title.toLowerCase() === input.title.toLowerCase())) throw problem(422, "DUPLICATE_GOAL", "You already have a goal with that title.", { fieldErrors: { title: "You already have a goal with this title." } });
    if (existing) {
      Object.assign(existing, { title: input.title, description: input.description, target: input.target, weight: input.weight, dueDate: input.dueDate, objectiveId: input.objectiveId });
    } else {
      store.perfGoals.push({ id: nextId("pg"), cycleId: cycle.id, employeeId: actor.employeeId, title: input.title, description: input.description, target: input.target, weight: input.weight, dueDate: input.dueDate, objectiveId: input.objectiveId, progress: 0, health: "on_track", checkIns: [], createdAt: nowInstant() });
      const review = reviewFor(cycle.id, actor.employeeId);
      if (review) review.version += 1;
    }
    sheet.version += 1;
    return { id: input.id ?? "new", totalWeight: total };
  });
}

export function deleteGoal(actor: MockActor, goalId: string) {
  requireCapability(actor, "performance.self");
  const store = db();
  const goal = store.perfGoals.find((g) => g.id === goalId && g.employeeId === actor.employeeId);
  if (!goal) throw problem(404, "GOAL_NOT_FOUND", "That goal doesn't exist.");
  const { sheet } = ownEditableSheet(actor, goal.cycleId);
  store.perfGoals = store.perfGoals.filter((g) => g.id !== goalId);
  sheet.version += 1;
  return { ok: true };
}

export function submitGoals(actor: MockActor, cycleId: string) {
  requireCapability(actor, "performance.self");
  const { cycle, sheet } = ownEditableSheet(actor, cycleId);
  const goals = goalsFor(cycle.id, actor.employeeId);
  const total = goals.reduce((sum, g) => sum + g.weight, 0);
  if (goals.length < 2) throw problem(422, "TOO_FEW_GOALS", "Add at least two goals before submitting.");
  if (total !== 100) throw problem(422, "WEIGHT_NOT_100", `Goal weights must total exactly 100% (now ${total}%).`);
  const review = reviewFor(cycle.id, actor.employeeId);
  sheet.status = "submitted";
  sheet.submittedAt = nowInstant();
  sheet.comment = null;
  sheet.version += 1;
  const employee = me(actor);
  if (review?.reviewerId) notify(review.reviewerId, "approval", "Goals to approve", `${employee.name} submitted ${goals.length} goals for ${cycle.name}.`, "/performance/team");
  return { ok: true };
}

export function checkInGoal(actor: MockActor, input: CheckInInput, key: string | undefined) {
  requireCapability(actor, "performance.self");
  return idempotent(key, () => {
    const goal = db().perfGoals.find((g) => g.id === input.goalId && g.employeeId === actor.employeeId);
    if (!goal) throw problem(404, "GOAL_NOT_FOUND", "That goal doesn't exist.");
    const cycle = cycleById(goal.cycleId);
    if (cycle.phase === "released") throw problem(409, "CYCLE_RELEASED", "This cycle is closed; check-ins are read-only.");
    if (sheetFor(cycle.id, actor.employeeId)?.status !== "approved") throw problem(409, "GOALS_NOT_APPROVED", "Check-ins start once your manager approves the goals.");
    goal.checkIns.push({ id: nextId("pci"), at: nowInstant(), progress: input.progress, health: input.health, comment: input.comment, authorId: actor.employeeId });
    goal.progress = input.progress;
    goal.health = input.health;
    return { progress: goal.progress };
  });
}

function mergeRatings(part: MockPerfPart, input: ReviewInput, goals: MockPerfGoal[]) {
  const goalIds = new Set(goals.map((g) => g.id));
  const compIds = new Set(db().perfCompetencies.map((c) => c.id));
  part.goals = aligned(part.goals, [...goalIds]).map((entry) => {
    const next = input.goals.find((g) => g.targetId === entry.targetId);
    return next ? { targetId: entry.targetId, rating: next.rating, comment: next.comment } : entry;
  });
  part.competencies = aligned(part.competencies, [...compIds]).map((entry) => {
    const next = input.competencies.find((c) => c.targetId === entry.targetId);
    return next ? { targetId: entry.targetId, rating: next.rating, comment: next.comment } : entry;
  });
  part.strengths = input.strengths;
  part.improvements = input.improvements;
}

function completenessErrors(part: MockPerfPart, goals: MockPerfGoal[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const entry of part.goals) {
    if (entry.rating === null) errors[`goalRating.${entry.targetId}`] = "Rate this goal.";
    if (entry.comment.length < 10 && goals.some((g) => g.id === entry.targetId)) errors[`goalComment.${entry.targetId}`] = "Add evidence (at least 10 characters).";
  }
  for (const entry of part.competencies) if (entry.rating === null) errors[`compRating.${entry.targetId}`] = "Rate this competency.";
  if (part.strengths.length < 10) errors.strengths = "Describe strengths (at least 10 characters).";
  if (part.improvements.length < 10) errors.improvements = "Describe areas to improve (at least 10 characters).";
  return errors;
}

export function saveSelfReview(actor: MockActor, input: ReviewInput) {
  requireCapability(actor, "performance.self");
  const review = db().perfReviews.find((r) => r.id === input.reviewId && r.employeeId === actor.employeeId);
  if (!review) throw problem(404, "REVIEW_NOT_FOUND", "That review doesn't exist.");
  const cycle = cycleById(review.cycleId);
  if (!["self_review", "manager_review"].includes(cycle.phase)) throw problem(409, "SELF_REVIEW_CLOSED", `Self review isn't open. This cycle is in ${perfPhaseLabels[cycle.phase]}.`);
  if (review.self.status === "submitted") throw problem(409, "ALREADY_SUBMITTED", "You've already submitted your self review.");
  if (review.manager.status === "submitted") throw problem(409, "MANAGER_SUBMITTED", "Your manager has already completed the review.");
  if (sheetFor(cycle.id, actor.employeeId)?.status !== "approved") throw problem(409, "GOALS_NOT_APPROVED", "Your goals need manager approval before the self review.");
  versionCheck(review.version, input.version);
  const goals = goalsFor(cycle.id, actor.employeeId);
  const draft = structuredClone(review.self);
  mergeRatings(draft, input, goals);
  if (input.intent === "submit") {
    const errors = completenessErrors(draft, goals);
    if (Object.keys(errors).length) throw problem(422, "SELF_REVIEW_INCOMPLETE", "Complete every rating and comment before submitting.", { fieldErrors: errors });
    draft.status = "submitted";
    draft.submittedAt = nowInstant();
  } else draft.status = "draft";
  review.self = draft;
  review.version += 1;
  if (draft.status === "submitted" && review.reviewerId) notify(review.reviewerId, "approval", "Self review submitted", `${me(actor).name} submitted a self review for ${cycle.name}.`, `/performance/team?cycle=${cycle.id}&review=${review.id}`);
  return { status: draft.status };
}

export function acknowledgeReview(actor: MockActor, input: AcknowledgeInput) {
  requireCapability(actor, "performance.self");
  const review = db().perfReviews.find((r) => r.id === input.reviewId && r.employeeId === actor.employeeId);
  if (!review) throw problem(404, "REVIEW_NOT_FOUND", "That review doesn't exist.");
  const cycle = cycleById(review.cycleId);
  if (cycle.phase !== "released" || review.finalRating === null) throw problem(409, "NOT_RELEASED", "There's nothing to acknowledge until results are released.");
  if (review.acknowledgedAt) throw problem(409, "ALREADY_ACKNOWLEDGED", "You've already acknowledged this review.");
  review.acknowledgedAt = nowInstant();
  review.acknowledgementComment = input.comment || null;
  review.version += 1;
  audit(actor, cycle.id, `${me(actor).name} acknowledged the review${input.comment ? " with a comment" : ""}`);
  return { ok: true };
}

/* Manager: team reviews and goal approvals -------------------------------- */

function detailFor(review: MockPerfReview, actorId: string): PerfReviewDetail {
  const cycle = cycleById(review.cycleId);
  const goals = goalsFor(cycle.id, review.employeeId);
  const sheet = sheetFor(cycle.id, review.employeeId);
  const selfVisible = review.self.status === "submitted";
  let lockReason: string | null = null;
  if (review.manager.status === "submitted") lockReason = "Submitted. Changes now go through HR calibration.";
  else if (phaseIndex(cycle.phase) >= phaseIndex("calibration")) lockReason = "Reviews are locked for calibration.";
  else if (phaseIndex(cycle.phase) < phaseIndex("self_review")) lockReason = "Reviews open after goal setting.";
  else if (cycle.phase === "self_review" && !selfVisible) lockReason = "Waiting for the self review. You can review once it's submitted or when the manager review phase opens.";
  else if (sheet?.status !== "approved") lockReason = "Approve the goal sheet first.";
  return {
    reviewId: review.id,
    version: review.version,
    person: personRef(review.employeeId),
    cycle: toCycle(cycle),
    sheet: sheet ? toSheet(sheet) : null,
    goals: goals.map(toGoal),
    competencies: competencies(),
    self: selfVisible ? toSelf(review.self, goals, cycle) : null,
    selfStatus: review.self.status,
    manager: toManager(review.manager, goals, cycle),
    canEdit: lockReason === null && review.reviewerId === actorId,
    lockReason,
    finalRating: cycle.phase === "released" ? review.finalRating : null,
    acknowledgedAt: cycle.phase === "released" ? review.acknowledgedAt : null,
    acknowledgementComment: cycle.phase === "released" ? review.acknowledgementComment : null,
  };
}

export function getTeamPerformance(actor: MockActor, cycleId: string | undefined, reviewId: string | undefined): TeamPerformance {
  requireCapability(actor, "performance.review");
  const store = db();
  const assigned = store.perfReviews.filter((r) => r.reviewerId === actor.employeeId && r.employeeId !== actor.employeeId);
  const cycles = store.perfCycles.filter((c) => c.phase !== "draft" && assigned.some((r) => r.cycleId === c.id)).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const cycle = (cycleId ? cycles.find((c) => c.id === cycleId) : undefined) ?? pickDefaultCycle(cycles);
  const approvals = assigned
    .map((r) => ({ review: r, sheet: sheetFor(r.cycleId, r.employeeId) }))
    .filter((x): x is { review: MockPerfReview; sheet: MockPerfSheet } => x.sheet?.status === "submitted")
    .map(({ review, sheet }) => ({ person: personRef(review.employeeId), cycleId: review.cycleId, cycleName: cycleById(review.cycleId).name, sheet: toSheet(sheet), goals: goalsFor(review.cycleId, review.employeeId).map(toGoal) }));
  const reviewees = cycle
    ? assigned
        .filter((r) => r.cycleId === cycle.id)
        .map((r) => {
          const employee = employeeById(r.employeeId);
          const sheet = sheetFor(r.cycleId, r.employeeId);
          return {
            reviewId: r.id,
            person: personRef(r.employeeId),
            department: employee?.department ?? "",
            sheet: sheet ? toSheet(sheet) : null,
            goalCount: goalsFor(r.cycleId, r.employeeId).length,
            selfStatus: r.self.status,
            managerStatus: r.manager.status,
            managerRating: r.manager.overallRating,
            finalRating: cycle.phase === "released" ? r.finalRating : null,
            reassigned: employee?.managerId !== actor.employeeId,
          };
        })
        .sort((a, b) => a.person.name.localeCompare(b.person.name))
    : [];
  let detail: PerfReviewDetail | null = null;
  if (reviewId) {
    const review = assigned.find((r) => r.id === reviewId);
    if (!review) throw problem(404, "REVIEW_NOT_FOUND", "That review isn't assigned to you.");
    detail = detailFor(review, actor.employeeId);
  }
  return { cycles: cycles.map(toCycle), cycle: cycle ? toCycle(cycle) : null, reviewees, approvals, detail };
}

export function decideGoals(actor: MockActor, input: GoalDecisionInput) {
  requireCapability(actor, "performance.review");
  const sheet = db().perfSheets.find((s) => s.id === input.sheetId);
  if (!sheet) throw problem(404, "SHEET_NOT_FOUND", "That goal sheet doesn't exist.");
  const review = reviewFor(sheet.cycleId, sheet.employeeId);
  if (!review || review.reviewerId !== actor.employeeId) throw problem(403, "FORBIDDEN", "Only the assigned reviewer can decide these goals.");
  if (sheet.status !== "submitted") throw problem(409, "NOT_PENDING", "These goals aren't waiting for approval any more.");
  versionCheck(sheet.version, input.version);
  const cycle = cycleById(sheet.cycleId);
  if (cycle.phase === "released") throw problem(409, "CYCLE_RELEASED", "This cycle is closed.");
  sheet.status = input.decision === "approve" ? "approved" : "sent_back";
  sheet.decidedAt = nowInstant();
  sheet.decidedById = actor.employeeId;
  sheet.comment = input.comment || null;
  sheet.version += 1;
  const who = nameOf(sheet.employeeId);
  audit(actor, cycle.id, input.decision === "approve" ? `Goals approved for ${who}` : `Goals sent back to ${who}: ${input.comment}`);
  notify(sheet.employeeId, "approval", input.decision === "approve" ? "Goals approved" : "Goals sent back", input.decision === "approve" ? `Your goals for ${cycle.name} are approved.` : `Your manager asked for changes: ${input.comment}`, `/performance?cycle=${cycle.id}`);
  return { status: sheet.status };
}

export function saveManagerReview(actor: MockActor, input: ManagerReviewInput) {
  requireCapability(actor, "performance.review");
  const review = db().perfReviews.find((r) => r.id === input.reviewId);
  if (!review || review.reviewerId !== actor.employeeId) throw problem(404, "REVIEW_NOT_FOUND", "That review isn't assigned to you.");
  if (review.employeeId === actor.employeeId) throw problem(403, "SELF_REVIEWER", "You can't be the reviewer of your own review.");
  const detail = detailFor(review, actor.employeeId);
  if (!detail.canEdit) throw problem(409, "REVIEW_LOCKED", detail.lockReason ?? "This review can't be edited.");
  versionCheck(review.version, input.version);
  const cycle = cycleById(review.cycleId);
  const goals = goalsFor(cycle.id, review.employeeId);
  const draft = structuredClone(review.manager);
  mergeRatings(draft, input, goals);
  draft.overallRating = input.overallRating;
  draft.summary = input.summary;
  draft.promotion = input.promotion;
  let bps: number | null = null;
  if (input.incrementPercent) {
    const [whole = "0", fraction = ""] = input.incrementPercent.split(".");
    bps = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  }
  if (bps !== null && bps > 3000) throw problem(422, "INCREMENT_TOO_HIGH", "Recommendations above 30% need a separate exception.", { fieldErrors: { incrementPercent: "Recommend 0–30%." } });
  draft.incrementBps = bps;
  if (input.intent === "submit") {
    const errors = completenessErrors(draft, goals);
    if (draft.overallRating === null) errors.overallRating = "Choose an overall rating.";
    if (draft.summary.length < 20) errors.summary = "Write a summary the employee will see (at least 20 characters).";
    if (draft.incrementBps === null) errors.incrementPercent = "Enter a recommendation (0 if none).";
    if (Object.keys(errors).length) throw problem(422, "REVIEW_INCOMPLETE", "Complete every rating and comment before submitting.", { fieldErrors: errors });
    draft.status = "submitted";
    draft.submittedAt = nowInstant();
  } else draft.status = "draft";
  review.manager = draft;
  review.version += 1;
  if (draft.status === "submitted") audit(actor, cycle.id, `Manager review submitted for ${nameOf(review.employeeId)}`);
  return { status: draft.status };
}

/* HR: cycles, progress, calibration --------------------------------------- */

function nextPhase(phase: PerfPhase): PerfPhase | null {
  return perfPhaseOrder[phaseIndex(phase) + 1] ?? null;
}

function advanceInfo(cycle: MockPerfCycle) {
  const next = nextPhase(cycle.phase);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const reviews = reviewsOf(cycle.id);
  if (next === "goal_setting" && eligibleFor(cycle).length === 0) blockers.push("No employees match the eligibility rules.");
  if (next === "self_review") {
    const pending = db().perfSheets.filter((s) => s.cycleId === cycle.id && s.status !== "approved").length;
    if (pending) warnings.push(`${pending} goal sheets aren't approved yet; those people can't self-review until they are.`);
  }
  if (next === "manager_review") {
    const pending = reviews.filter((r) => r.self.status !== "submitted").length;
    if (pending) warnings.push(`${pending} self reviews aren't submitted. Managers can still review them.`);
  }
  if (next === "calibration") {
    const pending = reviews.filter((r) => r.manager.status !== "submitted").length;
    if (pending) warnings.push(`${pending} manager reviews aren't submitted. They're locked and won't get a rating unless reopened.`);
  }
  if (next === "released") {
    if (!cycle.calibrationLocked) blockers.push("Lock calibration before releasing results.");
    const unrated = reviews.filter((r) => r.finalRating === null).length;
    if (unrated) warnings.push(`${unrated} people have no final rating and will see "not rated".`);
  }
  return { next, blockers, warnings };
}

export function getAdminPerformance(actor: MockActor, cycleId: string | undefined): AdminPerformance {
  requireCapability(actor, "performance.manage");
  const store = db();
  const cycles = [...store.perfCycles].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cycle = (cycleId ? cycles.find((c) => c.id === cycleId) : undefined) ?? cycles.find((c) => ["self_review", "manager_review", "calibration"].includes(c.phase)) ?? cycles[0];
  const reviewers = store.employees.filter((e) => e.status !== "exited").map(ref).sort((a, b) => a.name.localeCompare(b.name));
  const base = { cycles: cycles.map(toCycle), competencies: competencies(), departments: departmentNames(), reviewers };
  if (!cycle) return { ...base, cycle: null, progress: [], participants: [], distribution: [], advance: { next: null, blockers: [], warnings: [] }, audit: [] };
  const reviews = reviewsOf(cycle.id);
  const participants = reviews
    .map((r) => {
      const employee = employeeById(r.employeeId);
      const goals = goalsFor(cycle.id, r.employeeId);
      const score = r.manager.status === "submitted" ? scoreOf(r.manager, goals, cycle) : null;
      return {
        reviewId: r.id,
        person: personRef(r.employeeId),
        department: employee?.department ?? "",
        reviewer: refById(r.reviewerId),
        sheetStatus: sheetFor(cycle.id, r.employeeId)?.status ?? null,
        selfStatus: r.self.status,
        managerStatus: r.manager.status,
        managerRating: r.manager.status === "submitted" ? r.manager.overallRating : null,
        managerScore: score === null ? null : scoreText(score),
        promotion: r.manager.status === "submitted" ? r.manager.promotion : null,
        incrementPercent: r.manager.status === "submitted" && r.manager.incrementBps !== null ? scoreText(r.manager.incrementBps) : null,
        finalRating: r.finalRating,
        finalReason: r.finalReason,
        version: r.version,
      };
    })
    .sort((a, b) => a.department.localeCompare(b.department) || a.person.name.localeCompare(b.person.name));
  const departments = [...new Set(participants.map((p) => p.department))].sort();
  const progress = departments.map((department) => {
    const rows = participants.filter((p) => p.department === department);
    return {
      department,
      participants: rows.length,
      goalsApproved: rows.filter((p) => p.sheetStatus === "approved").length,
      selfSubmitted: rows.filter((p) => p.selfStatus === "submitted").length,
      managerSubmitted: rows.filter((p) => p.managerStatus === "submitted").length,
      finalised: rows.filter((p) => p.finalRating !== null).length,
    };
  });
  const effective = participants.map((p) => p.finalRating ?? p.managerRating).filter((r): r is number => r !== null);
  const distribution = cycle.scale.map((level, index) => {
    const count = effective.filter((r) => r === level.rating).length;
    return { rating: level.rating, label: level.label, guideline: cycle.guideline[index] ?? 0, count, percent: effective.length ? Math.round((count * 100) / effective.length) : 0 };
  });
  const auditTrail = store.perfAudit
    .filter((a) => a.cycleId === cycle.id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40)
    .map((a) => ({ id: a.id, at: a.at, actor: nameOf(a.actorId), event: a.event }));
  return { ...base, cycle: toCycle(cycle), progress, participants, distribution, advance: advanceInfo(cycle), audit: auditTrail };
}

function validateCycle(input: CycleInput, id: string | undefined) {
  const known = departmentNames();
  const unknown = input.departments.filter((d) => !known.includes(d));
  if (unknown.length) throw problem(422, "UNKNOWN_DEPARTMENT", "Choose listed departments.", { fieldErrors: { departments: `Unknown: ${unknown.join(", ")}` } });
  if (input.eligibilityCutoff > input.periodEnd) throw problem(422, "CUTOFF_AFTER_PERIOD", "Eligibility cut-off must be within the period.", { fieldErrors: { eligibilityCutoff: "Choose a date on or before the period end." } });
  if (db().perfCycles.some((c) => c.id !== id && c.name.toLowerCase() === input.name.toLowerCase())) throw problem(422, "DUPLICATE_CYCLE", "Another cycle has this name.", { fieldErrors: { name: "Another cycle already uses this name." } });
}

export function saveCycle(actor: MockActor, input: CycleInput, key: string | undefined) {
  requireCapability(actor, "performance.manage");
  return idempotent(key, () => {
    const store = db();
    validateCycle(input, input.id);
    const scale = input.scale.map((level, index) => ({ rating: index + 1, label: level.label, description: level.description }));
    if (input.id) {
      const cycle = cycleById(input.id);
      versionCheck(cycle.version, input.version);
      if (cycle.phase === "released") throw problem(409, "CYCLE_RELEASED", "Released cycles are read-only.");
      const launched = cycle.phase !== "draft";
      if (launched) {
        const changedLocked =
          cycle.kind !== input.kind || cycle.periodStart !== input.periodStart || cycle.periodEnd !== input.periodEnd || cycle.eligibilityCutoff !== input.eligibilityCutoff || cycle.goalWeight !== input.goalWeight || cycle.departments.join("|") !== [...input.departments].sort().join("|");
        if (changedLocked) throw problem(409, "CONFIG_LOCKED", "Period, eligibility, departments and weightage are locked once a cycle is launched. Only the name, labels, guideline and dates can change.");
      }
      Object.assign(cycle, { name: input.name, kind: input.kind, periodStart: input.periodStart, periodEnd: input.periodEnd, eligibilityCutoff: input.eligibilityCutoff, departments: [...input.departments].sort(), goalWeight: input.goalWeight, scale, guideline: [...input.guideline], phaseDates: structuredClone(input.phaseDates), releaseOn: input.releaseOn });
      cycle.version += 1;
      audit(actor, cycle.id, launched ? "Cycle dates or labels updated" : "Cycle configuration updated");
      return { id: cycle.id };
    }
    const id = nextId("pc");
    store.perfCycles.push({ id, name: input.name, kind: input.kind, periodStart: input.periodStart, periodEnd: input.periodEnd, eligibilityCutoff: input.eligibilityCutoff, departments: [...input.departments].sort(), scale, guideline: [...input.guideline], goalWeight: input.goalWeight, phase: "draft", phaseDates: structuredClone(input.phaseDates), releaseOn: input.releaseOn, calibrationLocked: false, releasedAt: null, createdAt: nowInstant(), version: 1 });
    audit(actor, id, "Cycle created as draft");
    return { id };
  });
}

function emptyPart(goalIds: string[]): MockPerfPart {
  return { status: "not_started", goals: goalIds.map((id) => ({ targetId: id, rating: null, comment: "" })), competencies: db().perfCompetencies.map((c) => ({ targetId: c.id, rating: null, comment: "" })), strengths: "", improvements: "", submittedAt: null };
}
const emptyManager = (): MockPerfManagerPart => ({ ...emptyPart([]), overallRating: null, summary: "", promotion: "not_now", incrementBps: null });

export function advancePhase(actor: MockActor, cycleId: string, expectedPhase: PerfPhase) {
  requireCapability(actor, "performance.manage");
  const store = db();
  const cycle = cycleById(cycleId);
  if (cycle.phase !== expectedPhase) throw problem(412, "STALE_VERSION", "This cycle moved on since you opened it. Review the latest state.");
  const { next, blockers } = advanceInfo(cycle);
  if (!next) throw problem(409, "FINAL_PHASE", "Results are already released.");
  if (blockers.length) throw problem(409, "PHASE_BLOCKED", blockers.join(" "));
  if (next === "goal_setting") {
    for (const employee of eligibleFor(cycle)) {
      if (reviewFor(cycle.id, employee.id)) continue;
      store.perfSheets.push({ id: nextId("ps"), cycleId: cycle.id, employeeId: employee.id, status: "draft", submittedAt: null, decidedAt: null, decidedById: null, comment: null, version: 1 });
      store.perfReviews.push({ id: nextId("pr"), cycleId: cycle.id, employeeId: employee.id, reviewerId: employee.managerId, self: emptyPart([]), manager: emptyManager(), finalRating: null, finalReason: null, calibratedById: null, calibratedAt: null, acknowledgedAt: null, acknowledgementComment: null, version: 1 });
      notify(employee.id, "system", "Goal setting is open", `Set your goals for ${cycle.name} by ${cycle.phaseDates.goal_setting.end}.`, `/performance?cycle=${cycle.id}`);
    }
  }
  if (next === "released") {
    cycle.releasedAt = nowInstant();
    for (const review of reviewsOf(cycle.id)) if (review.finalRating !== null) notify(review.employeeId, "system", "Review results released", `Your ${cycle.name} rating is ready to view.`, `/performance?cycle=${cycle.id}`);
  }
  cycle.phase = next;
  cycle.version += 1;
  audit(actor, cycle.id, next === "goal_setting" ? `Launched · phase Goal setting · ${reviewsOf(cycle.id).length} participants` : next === "released" ? "Phase advanced to Released · results visible to employees" : `Phase advanced to ${perfPhaseLabels[next]}`);
  return { phase: next };
}

export function setCalibrationLock(actor: MockActor, cycleId: string, lock: boolean) {
  requireCapability(actor, "performance.manage");
  const cycle = cycleById(cycleId);
  if (cycle.phase !== "calibration") throw problem(409, "NOT_CALIBRATING", "Calibration isn't the current phase.");
  if (cycle.calibrationLocked === lock) throw problem(409, "NO_CHANGE", lock ? "Calibration is already locked." : "Calibration is already open.");
  let carried = 0;
  if (lock)
    for (const review of reviewsOf(cycle.id))
      if (review.finalRating === null && review.manager.status === "submitted" && review.manager.overallRating !== null) {
        review.finalRating = review.manager.overallRating;
        review.version += 1;
        carried += 1;
      }
  cycle.calibrationLocked = lock;
  cycle.version += 1;
  audit(actor, cycle.id, lock ? `Calibration locked · ${carried} manager ratings carried as final` : "Calibration reopened");
  return { locked: lock };
}

export function calibrateRating(actor: MockActor, input: CalibrateInput) {
  requireCapability(actor, "performance.manage");
  const review = db().perfReviews.find((r) => r.id === input.reviewId);
  if (!review) throw problem(404, "REVIEW_NOT_FOUND", "That review doesn't exist.");
  const cycle = cycleById(review.cycleId);
  if (cycle.phase !== "calibration") throw problem(409, "NOT_CALIBRATING", "Final ratings can only be set during calibration.");
  if (cycle.calibrationLocked) throw problem(409, "CALIBRATION_LOCKED", "Calibration is locked. Reopen it to change ratings.");
  if (review.manager.status !== "submitted") throw problem(409, "MANAGER_PENDING", "The manager review isn't submitted, so there's nothing to calibrate.");
  if (review.employeeId === actor.employeeId) throw problem(403, "OWN_RATING", "You can't calibrate your own rating. Ask another HR admin.");
  versionCheck(review.version, input.version);
  const before = review.finalRating ?? review.manager.overallRating;
  review.finalRating = input.finalRating;
  review.finalReason = input.reason;
  review.calibratedById = actor.employeeId;
  review.calibratedAt = nowInstant();
  review.version += 1;
  audit(actor, cycle.id, `Final rating for ${nameOf(review.employeeId)} set to ${input.finalRating} (was ${before ?? "—"}): ${input.reason}`);
  return { finalRating: input.finalRating };
}

export function reassignReviewer(actor: MockActor, input: ReassignInput) {
  requireCapability(actor, "performance.manage");
  const review = db().perfReviews.find((r) => r.id === input.reviewId);
  if (!review) throw problem(404, "REVIEW_NOT_FOUND", "That review doesn't exist.");
  const cycle = cycleById(review.cycleId);
  if (phaseIndex(cycle.phase) >= phaseIndex("calibration")) throw problem(409, "REVIEW_LOCKED", "Reviewers can't change once calibration starts.");
  if (review.manager.status === "submitted") throw problem(409, "ALREADY_REVIEWED", "The manager review is already submitted.");
  const reviewer = employeeById(input.reviewerId);
  if (!reviewer || reviewer.status === "exited") throw problem(422, "UNKNOWN_REVIEWER", "Choose an active employee.", { fieldErrors: { reviewerId: "Choose an active employee." } });
  if (reviewer.id === review.employeeId) throw problem(422, "SELF_REVIEWER", "People can't review themselves.", { fieldErrors: { reviewerId: "Choose someone other than the employee." } });
  if (reviewer.id === review.reviewerId) throw problem(422, "SAME_REVIEWER", "That's already the reviewer.", { fieldErrors: { reviewerId: "Choose a different reviewer." } });
  const from = nameOf(review.reviewerId);
  review.reviewerId = reviewer.id;
  // A draft belongs to the previous reviewer; never hand it to someone else.
  review.manager = { ...emptyManager(), goals: review.manager.goals.map((g) => ({ ...g, rating: null, comment: "" })) };
  review.version += 1;
  audit(actor, cycle.id, `Reviewer for ${nameOf(review.employeeId)} changed from ${from} to ${reviewer.name}: ${input.reason}`);
  notify(reviewer.id, "approval", "Review assigned to you", `HR assigned you ${nameOf(review.employeeId)}'s ${cycle.name} review.`, `/performance/team?cycle=${cycle.id}&review=${review.id}`);
  return { ok: true };
}

export function saveCompetency(actor: MockActor, input: CompetencyInput) {
  requireCapability(actor, "performance.manage");
  const store = db();
  if (store.perfCompetencies.some((c) => c.id !== input.id && c.name.toLowerCase() === input.name.toLowerCase())) throw problem(422, "DUPLICATE_COMPETENCY", "A competency with this name exists.", { fieldErrors: { name: "Already in the framework." } });
  if (input.id) {
    const existing = store.perfCompetencies.find((c) => c.id === input.id);
    if (!existing) throw problem(404, "COMPETENCY_NOT_FOUND", "That competency doesn't exist.");
    Object.assign(existing, { name: input.name, description: input.description, behaviours: input.behaviours });
    audit(actor, null, `Competency ${input.name} updated`);
    return { id: existing.id };
  }
  if (store.perfCompetencies.length >= 8) throw problem(422, "TOO_MANY_COMPETENCIES", "Keep the framework to 8 competencies or fewer.");
  const id = nextId("comp");
  store.perfCompetencies.push({ id, name: input.name, description: input.description, behaviours: input.behaviours });
  audit(actor, null, `Competency ${input.name} added`);
  return { id };
}

/* Continuous feedback ------------------------------------------------------ */

function toFeedback(item: MockPerfFeedback): PerfFeedback {
  const store = db();
  return {
    id: item.id,
    from: personRef(item.fromId),
    to: personRef(item.toId),
    visibility: item.visibility,
    kind: item.kind,
    competency: item.competencyId ? (store.perfCompetencies.find((c) => c.id === item.competencyId)?.name ?? null) : null,
    goal: item.goalId ? (store.perfGoals.find((g) => g.id === item.goalId)?.title ?? null) : null,
    message: item.message,
    createdAt: item.createdAt,
    inResponseToRequest: item.requestId !== null,
  };
}
function toRequest(item: MockPerfFeedbackRequest): PerfFeedbackRequest {
  return {
    id: item.id,
    requester: personRef(item.requesterId),
    asked: personRef(item.askedId),
    goal: item.goalId ? (db().perfGoals.find((g) => g.id === item.goalId)?.title ?? null) : null,
    question: item.question,
    status: item.status,
    createdAt: item.createdAt,
    respondedAt: item.respondedAt,
  };
}
const newestFirst = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

export function getFeedbackHub(actor: MockActor): FeedbackHub {
  requireCapability(actor, "performance.self");
  const store = db();
  const self = me(actor);
  const reports = directReports(self.id).map((e) => e.id);
  const manager = self.managerId ? employeeById(self.managerId) : undefined;
  const feedback = [...store.perfFeedback].sort(newestFirst);
  const openCycles = new Set(store.perfCycles.filter((c) => c.phase !== "released" && c.phase !== "draft").map((c) => c.id));
  return {
    received: feedback.filter((f) => f.toId === self.id).map(toFeedback),
    given: feedback.filter((f) => f.fromId === self.id).map(toFeedback),
    wall: feedback.filter((f) => f.visibility === "public").slice(0, 30).map(toFeedback),
    // Private feedback is visible to the recipient's manager, never to peers or HR at large.
    teamPrivate: feedback.filter((f) => f.visibility === "private" && reports.includes(f.toId) && f.fromId !== self.id).map(toFeedback),
    requestsToMe: store.perfFeedbackRequests.filter((r) => r.askedId === self.id).sort(newestFirst).map(toRequest),
    myRequests: store.perfFeedbackRequests.filter((r) => r.requesterId === self.id).sort(newestFirst).map(toRequest),
    oneOnOnes: store.perfOneOnOnes
      .filter((n) => (n.reportId === self.id && n.managerId === self.managerId) || (n.managerId === self.id && reports.includes(n.reportId)))
      .sort((a, b) => b.meetingOn.localeCompare(a.meetingOn) || newestFirst(a, b))
      .map((n) => ({ id: n.id, manager: personRef(n.managerId), report: personRef(n.reportId), author: nameOf(n.authorId), meetingOn: n.meetingOn, note: n.note, actionItems: n.actionItems, createdAt: n.createdAt })),
    counterparts: [...(manager ? [{ ...ref(manager), relation: "manager" as const }] : []), ...directReports(self.id).map((e) => ({ ...ref(e), relation: "report" as const }))],
    colleagues: store.employees.filter((e) => e.id !== self.id && e.status !== "exited").map(ref).sort((a, b) => a.name.localeCompare(b.name)),
    competencies: store.perfCompetencies.map((c) => ({ id: c.id, name: c.name })),
    myGoals: store.perfGoals.filter((g) => g.employeeId === self.id && openCycles.has(g.cycleId)).map((g) => ({ id: g.id, title: g.title })),
  };
}

export function giveFeedback(actor: MockActor, input: FeedbackInput, key: string | undefined) {
  requireCapability(actor, "performance.self");
  return idempotent(key, () => {
    const store = db();
    const to = employeeById(input.toId);
    if (!to || to.status === "exited") throw problem(422, "UNKNOWN_COLLEAGUE", "Choose an active colleague.", { fieldErrors: { toId: "Choose an active colleague." } });
    if (to.id === actor.employeeId) throw problem(422, "SELF_FEEDBACK", "Feedback goes to someone else.", { fieldErrors: { toId: "Choose a colleague, not yourself." } });
    if (input.competencyId && !store.perfCompetencies.some((c) => c.id === input.competencyId)) throw problem(422, "UNKNOWN_COMPETENCY", "Choose a listed competency.", { fieldErrors: { competencyId: "Choose a listed competency." } });
    let goalId: string | null = null;
    if (input.requestId) {
      const request = store.perfFeedbackRequests.find((r) => r.id === input.requestId);
      if (!request || request.askedId !== actor.employeeId) throw problem(404, "REQUEST_NOT_FOUND", "That feedback request isn't addressed to you.");
      if (request.status !== "pending") throw problem(409, "REQUEST_CLOSED", "You've already responded to this request.");
      if (request.requesterId !== to.id) throw problem(422, "WRONG_RECIPIENT", "Responses go to the person who asked.");
      request.status = "answered";
      request.respondedAt = nowInstant();
      goalId = request.goalId;
    }
    const id = nextId("pf");
    store.perfFeedback.push({ id, fromId: actor.employeeId, toId: to.id, visibility: input.visibility, kind: input.kind, competencyId: input.competencyId, goalId, message: input.message, createdAt: nowInstant(), requestId: input.requestId });
    notify(to.id, "system", input.kind === "praise" ? "You received praise" : "You received feedback", `${me(actor).name} shared ${input.visibility === "public" ? "public praise" : "private feedback"} with you.`, "/performance/feedback");
    return { id };
  });
}

export function requestFeedback(actor: MockActor, input: FeedbackRequestInput, key: string | undefined) {
  requireCapability(actor, "performance.self");
  return idempotent(key, () => {
    const store = db();
    const asked = employeeById(input.askedId);
    if (!asked || asked.status === "exited") throw problem(422, "UNKNOWN_COLLEAGUE", "Choose an active colleague.", { fieldErrors: { askedId: "Choose an active colleague." } });
    if (asked.id === actor.employeeId) throw problem(422, "SELF_REQUEST", "Ask someone other than yourself.", { fieldErrors: { askedId: "Choose a colleague, not yourself." } });
    if (input.goalId && !store.perfGoals.some((g) => g.id === input.goalId && g.employeeId === actor.employeeId)) throw problem(422, "UNKNOWN_GOAL", "Choose one of your goals.", { fieldErrors: { goalId: "Choose one of your goals." } });
    if (store.perfFeedbackRequests.some((r) => r.requesterId === actor.employeeId && r.askedId === asked.id && r.goalId === input.goalId && r.status === "pending"))
      throw problem(409, "ALREADY_REQUESTED", `You already have a pending request with ${asked.name} on this.`, { fieldErrors: { askedId: "Already asked — wait for their response." } });
    const id = nextId("pfr");
    store.perfFeedbackRequests.push({ id, requesterId: actor.employeeId, askedId: asked.id, goalId: input.goalId, question: input.question, status: "pending", createdAt: nowInstant(), respondedAt: null });
    notify(asked.id, "approval", "Feedback requested", `${me(actor).name} asked for your feedback.`, "/performance/feedback?tab=requests");
    return { id };
  });
}

export function declineFeedbackRequest(actor: MockActor, requestId: string) {
  requireCapability(actor, "performance.self");
  const request = db().perfFeedbackRequests.find((r) => r.id === requestId && r.askedId === actor.employeeId);
  if (!request) throw problem(404, "REQUEST_NOT_FOUND", "That request isn't addressed to you.");
  if (request.status !== "pending") throw problem(409, "REQUEST_CLOSED", "This request is already closed.");
  request.status = "declined";
  request.respondedAt = nowInstant();
  return { ok: true };
}

export function addOneOnOne(actor: MockActor, input: OneOnOneInput, key: string | undefined) {
  requireCapability(actor, "performance.self");
  return idempotent(key, () => {
    const store = db();
    const self = me(actor);
    const isManager = self.managerId === input.counterpartId;
    const isReport = directReports(self.id).some((e) => e.id === input.counterpartId);
    if (!isManager && !isReport) throw problem(422, "NOT_A_COUNTERPART", "1:1 notes are shared only between a manager and their direct report.", { fieldErrors: { counterpartId: "Choose your manager or a direct report." } });
    if (input.meetingOn > store.today) throw problem(422, "FUTURE_MEETING", "Log a meeting that has happened.", { fieldErrors: { meetingOn: "Choose today or an earlier date." } });
    if (input.meetingOn < addDays(store.today, -365)) throw problem(422, "TOO_OLD", "Notes older than a year aren't accepted.", { fieldErrors: { meetingOn: "Choose a date within the last year." } });
    const id = nextId("p11");
    store.perfOneOnOnes.push({ id, managerId: isManager ? input.counterpartId : self.id, reportId: isManager ? self.id : input.counterpartId, authorId: self.id, meetingOn: input.meetingOn, note: input.note, actionItems: input.actionItems, createdAt: nowInstant() });
    return { id };
  });
}
