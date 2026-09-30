import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextId, nextReference, nowInstant } from "@/lib/mocks/store";
import { inr } from "@/lib/mocks/seed/random";
import { personas } from "@/lib/mocks/seed/people";
import { departmentNames, locationNames } from "@/lib/mocks/handlers/config";
import { createEmployee } from "@/lib/mocks/handlers/employees";
import { notify } from "@/lib/mocks/handlers/notifications";
import { can, idempotent, me, ref, requireCapability, versionCheck, type MockActor } from "@/lib/mocks/handlers/shared";
import type { MockCandidate, MockInterview, MockJob, MockOffer, MockRequisition } from "@/lib/mocks/seed/recruitment";
import { addDays, diffDays, DEFAULT_TIMEZONE, todayInZone } from "@/lib/utils/date";
import type { PersonRef } from "@/types/common";
import {
  scorecardCriteria,
  stageLabels,
  type ApplyInput,
  type CandidateDetail,
  type CandidateInput,
  type CandidateListItem,
  type CandidateNoteInput,
  type CandidateSource,
  type ConvertInput,
  type EraseInput,
  type Interview,
  type InterviewInput,
  type JobDetail,
  type JobInput,
  type JobStateInput,
  type JobSummary,
  type MyInterviews,
  type MyReferral,
  type Offer,
  type OfferApprovalInput,
  type OfferInput,
  type OfferResponseInput,
  type PipelineCard,
  type PublicJob,
  type RecruitmentOptions,
  type RecruitmentStage,
  type RecruitmentStats,
  type ReferralInput,
  type Requisition,
  type RequisitionDecisionInput,
  type RequisitionInput,
  type ResumeMeta,
  type ScorecardInput,
  type StageMoveInput,
} from "@/types/recruitment";

/* Recruitment mock (HR-12). Candidate PII is visible only with recruitment.manage;
 * panelists get a minimal projection; the public careers page never sees CTC or people. */

const RETENTION_DAYS = 365;
const ACTIVE_STAGES: RecruitmentStage[] = ["applied", "screening", "interview", "offer"];
const ERASED_NAME = "Erased candidate";

/* Helpers -------------------------------------------------------------------- */

const store = () => db();
const paiseOf = (rupees: string) => Number(rupees) * 100;
function yearsOf(tenths: number) {
  return tenths % 10 === 0 ? `${tenths / 10}` : `${Math.floor(tenths / 10)}.${tenths % 10}`;
}
function tenthsOf(years: string) {
  const [whole = "0", fraction = "0"] = years.split(".");
  return Number(whole) * 10 + Number(fraction.slice(0, 1) || "0");
}
const digits = (phone: string | null) => (phone ?? "").replace(/\D/g, "").slice(-10);
function formatPhone(phone: string) {
  const d = digits(phone);
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}
const dateOf = (instant: string) => todayInZone(DEFAULT_TIMEZONE, new Date(instant));

function person(id: string | null): PersonRef {
  const employee = id ? employeeById(id) : undefined;
  if (employee) return ref(employee);
  return { id: id ?? "unknown", name: "Former employee", initials: "FE", designation: "", photoUrl: null };
}
function actorName(actor: MockActor) {
  return me(actor).name;
}

function jobOf(id: string): MockJob {
  const job = store().recruitmentJobs.find((item) => item.id === id);
  if (!job) throw problem(404, "NOT_FOUND", "That job opening no longer exists.");
  return job;
}
function candidateOf(id: string): MockCandidate {
  const candidate = store().recruitmentCandidates.find((item) => item.id === id);
  if (!candidate) throw problem(404, "NOT_FOUND", "We couldn't find that candidate.");
  return candidate;
}
function offerOf(id: string): MockOffer {
  const offer = store().recruitmentOffers.find((item) => item.id === id);
  if (!offer) throw problem(404, "NOT_FOUND", "That offer no longer exists.");
  return offer;
}
function latestOffer(candidateId: string): MockOffer | undefined {
  return store()
    .recruitmentOffers.filter((offer) => offer.candidateId === candidateId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
function activeOffer(candidateId: string): MockOffer | undefined {
  const offer = latestOffer(candidateId);
  return offer && (offer.state === "pending_approval" || offer.state === "extended" || (offer.state === "accepted" && !offer.employeeId)) ? offer : undefined;
}
function budgetMaxFor(job: MockJob): number {
  const requisition = job.requisitionId ? store().recruitmentRequisitions.find((item) => item.id === job.requisitionId) : undefined;
  return requisition ? Math.min(requisition.budgetMaxPaise, job.ctcMaxPaise) : job.ctcMaxPaise;
}
function logEvent(candidate: MockCandidate, actor: string, title: string, detail: string | null = null) {
  candidate.events.push({ id: nextId("ce"), at: nowInstant(), actor, title, detail });
}
function touch(candidate: MockCandidate) {
  candidate.version += 1;
}
function validateOrg(input: { department: string; location: string }) {
  if (!departmentNames().includes(input.department))
    throw problem(422, "UNKNOWN_DEPARTMENT", "Choose a configured department.", { fieldErrors: { department: "Choose a configured department." } });
  if (!locationNames().includes(input.location))
    throw problem(422, "UNKNOWN_LOCATION", "Choose a configured location.", { fieldErrors: { location: "Choose a configured location." } });
}
function activeEmployee(id: string, field: string, message = "Choose an active employee.") {
  const employee = employeeById(id);
  if (!employee || employee.status === "exited") throw problem(422, "INVALID_PERSON", message, { fieldErrors: { [field]: message } });
  return employee;
}
function isRetentionDue(candidate: MockCandidate) {
  return !candidate.erasedAt && candidate.stage !== "hired" && candidate.retainUntil <= store().today;
}
function hrApprovers(): string[] {
  return Object.values(personas)
    .filter((persona) => persona.roles.includes("hr_operator"))
    .map((persona) => persona.employeeId);
}
function offerApprovers(): string[] {
  return Object.values(personas)
    .filter((persona) => persona.roles.includes("payroll_approver"))
    .map((persona) => persona.employeeId);
}

/** Duplicate by email or mobile across live (non-erased) candidate records. */
function findDuplicate(email: string, phone: string): MockCandidate | undefined {
  const mobile = digits(phone);
  return store().recruitmentCandidates.find((candidate) => !candidate.erasedAt && (candidate.email === email || digits(candidate.phone) === mobile));
}

/* Projections ---------------------------------------------------------------- */

function stageCounts(jobId: string) {
  const counts = { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 };
  for (const candidate of store().recruitmentCandidates) if (candidate.jobId === jobId) counts[candidate.stage] += 1;
  return counts;
}

function jobSummary(job: MockJob): JobSummary {
  const counts = stageCounts(job.id);
  const requisition = job.requisitionId ? store().recruitmentRequisitions.find((item) => item.id === job.requisitionId) : undefined;
  return {
    id: job.id,
    reference: job.reference,
    title: job.title,
    department: job.department,
    location: job.location,
    employmentType: job.employmentType,
    openings: job.openings,
    hires: counts.hired,
    hiringManager: person(job.hiringManagerId),
    state: job.state,
    publishToCareers: job.publishToCareers,
    openedOn: job.openedOn,
    closedOn: job.closedOn,
    daysOpen: Math.max(0, diffDays(job.openedOn, job.closedOn ?? store().today)),
    stageCounts: counts,
    ctcMin: inr(job.ctcMinPaise),
    ctcMax: inr(job.ctcMaxPaise),
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    requisitionReference: requisition?.reference ?? null,
  };
}

function nextInterviewAt(candidateId: string): string | null {
  const now = nowInstant();
  return (
    store()
      .recruitmentInterviews.filter((item) => item.candidateId === candidateId && item.state === "scheduled" && item.scheduledAt >= now)
      .map((item) => item.scheduledAt)
      .sort()[0] ?? null
  );
}

function pipelineCard(candidate: MockCandidate): PipelineCard {
  return {
    id: candidate.id,
    reference: candidate.reference,
    name: candidate.name,
    experienceYears: yearsOf(candidate.experienceTenths),
    currentCompany: candidate.currentCompany,
    source: candidate.source,
    stage: candidate.stage,
    daysInStage: Math.max(0, diffDays(dateOf(candidate.stageChangedAt), store().today)),
    nextInterviewAt: nextInterviewAt(candidate.id),
    offerState: latestOffer(candidate.id)?.state ?? null,
    rejectionReason: candidate.rejectionReason,
    erased: Boolean(candidate.erasedAt),
    version: candidate.version,
  };
}

function hasDuplicate(candidate: MockCandidate) {
  if (candidate.erasedAt) return false;
  if (candidate.duplicateOf) return true;
  return store().recruitmentCandidates.some(
    (other) => other.id !== candidate.id && !other.erasedAt && (other.email === candidate.email || digits(other.phone) === digits(candidate.phone)),
  );
}

function listItem(candidate: MockCandidate): CandidateListItem {
  return {
    id: candidate.id,
    reference: candidate.reference,
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    jobId: candidate.jobId,
    jobTitle: jobOf(candidate.jobId).title,
    stage: candidate.stage,
    source: candidate.source,
    appliedAt: candidate.appliedAt,
    experienceYears: yearsOf(candidate.experienceTenths),
    retentionDue: isRetentionDue(candidate),
    erased: Boolean(candidate.erasedAt),
    possibleDuplicate: hasDuplicate(candidate),
  };
}

function interviewView(actor: MockActor, interview: MockInterview): Interview {
  const candidate = candidateOf(interview.candidateId);
  const job = jobOf(interview.jobId);
  const isPanelist = interview.panelIds.includes(actor.employeeId);
  const mine = interview.scorecards.find((card) => card.panelistId === actor.employeeId);
  // Independent feedback: a panelist sees others' scorecards only after submitting their own.
  const visible = isPanelist ? Boolean(mine) : can(actor, "recruitment.manage");
  const onDay = dateOf(interview.scheduledAt) <= store().today;
  const blocked =
    !isPanelist
      ? "Only panelists submit scorecards."
      : mine
        ? "You've submitted your scorecard."
        : interview.state === "cancelled"
          ? "This interview was cancelled."
          : !onDay
            ? "Scorecards open on the interview day."
            : null;
  return {
    id: interview.id,
    candidateId: candidate.id,
    candidateName: candidate.name,
    candidateReference: candidate.reference,
    jobId: job.id,
    jobTitle: job.title,
    round: interview.round,
    type: interview.type,
    scheduledAt: interview.scheduledAt,
    durationMinutes: interview.durationMinutes,
    mode: interview.mode,
    locationOrLink: interview.locationOrLink,
    panel: interview.panelIds.map((id) => ({ person: person(id), submitted: interview.scorecards.some((card) => card.panelistId === id) })),
    state: interview.state,
    scorecards: visible
      ? interview.scorecards.map((card) => {
          const ratings = scorecardCriteria.map((criterion) => ({ criterion: criterion.key, label: criterion.label, rating: card.ratings[criterion.key] ?? 3 }));
          const total = ratings.reduce((sum, item) => sum + item.rating, 0);
          return {
            panelist: person(card.panelistId),
            ratings,
            average: (Math.round((total * 10) / ratings.length) / 10).toFixed(1),
            recommendation: card.recommendation,
            comments: card.comments,
            submittedAt: card.submittedAt,
          };
        })
      : [],
    feedbackHidden: !visible && interview.scorecards.length > 0,
    isPanelist,
    myScorecardSubmitted: Boolean(mine),
    canSubmit: blocked === null && interview.state === "scheduled",
    submitBlockedReason: blocked,
    candidateSummary: {
      experienceYears: yearsOf(candidate.experienceTenths),
      currentCompany: candidate.currentCompany,
      resumeName: candidate.resume?.name ?? null,
    },
  };
}

function offerView(actor: MockActor, offer: MockOffer): Offer {
  const candidate = candidateOf(offer.candidateId);
  const job = jobOf(offer.jobId);
  return {
    id: offer.id,
    reference: offer.reference,
    candidateId: candidate.id,
    candidateName: candidate.name,
    jobId: job.id,
    jobTitle: job.title,
    ctc: inr(offer.ctcPaise),
    budgetMax: inr(budgetMaxFor(job)),
    overBudget: offer.overBudget,
    joiningDate: offer.joiningDate,
    designation: offer.designation,
    department: offer.department,
    location: offer.location,
    employmentType: job.employmentType,
    manager: person(offer.managerId),
    state: offer.state,
    createdBy: person(offer.createdBy),
    createdAt: offer.createdAt,
    approver: offer.approverId ? person(offer.approverId) : null,
    approvedAt: offer.approvedAt,
    approvalNote: offer.approvalNote,
    respondedAt: offer.respondedAt,
    responseNote: offer.responseNote,
    employeeId: offer.employeeId,
    version: offer.version,
    canApprove: offer.state === "pending_approval" && can(actor, "payroll.approve") && offer.createdBy !== actor.employeeId,
  };
}

function requisitionView(actor: MockActor, requisition: MockRequisition): Requisition {
  return {
    id: requisition.id,
    reference: requisition.reference,
    title: requisition.title,
    department: requisition.department,
    location: requisition.location,
    openings: requisition.openings,
    employmentType: requisition.employmentType,
    budgetMin: inr(requisition.budgetMinPaise),
    budgetMax: inr(requisition.budgetMaxPaise),
    justification: requisition.justification,
    backfillFor: requisition.backfillFor,
    reason: requisition.reason,
    raisedBy: person(requisition.raisedBy),
    raisedAt: requisition.raisedAt,
    state: requisition.state,
    decidedBy: requisition.decidedBy ? person(requisition.decidedBy) : null,
    decidedAt: requisition.decidedAt,
    decisionNote: requisition.decisionNote,
    jobId: requisition.jobId,
    version: requisition.version,
    canDecide: requisition.state === "pending" && can(actor, "recruitment.manage") && requisition.raisedBy !== actor.employeeId,
  };
}

/* Reads ---------------------------------------------------------------------- */

export function recruitmentStats(actor: MockActor): RecruitmentStats {
  requireCapability(actor, "recruitment.manage");
  const { recruitmentJobs: jobs, recruitmentCandidates: candidates, recruitmentOffers: offers, recruitmentRequisitions: requisitions, recruitmentInterviews: interviews } = store();
  const open = jobs.filter((job) => job.state === "published" || job.state === "on_hold");
  const openPositions = open.reduce((sum, job) => sum + Math.max(0, job.openings - stageCounts(job.id).hired), 0);
  const hired = candidates.filter((candidate) => candidate.stage === "hired" && candidate.hiredAt);
  const accepted = offers.filter((offer) => offer.state === "accepted").length;
  const decided = accepted + offers.filter((offer) => offer.state === "declined").length;
  const avg = hired.length ? Math.round(hired.reduce((sum, candidate) => sum + diffDays(dateOf(candidate.appliedAt), dateOf(candidate.hiredAt ?? candidate.appliedAt)), 0) / hired.length) : null;
  const interviewed = new Set(interviews.filter((item) => item.state !== "cancelled").map((item) => item.candidateId));
  const sources: CandidateSource[] = ["careers", "referral", "linkedin", "agency", "walk_in"];
  return {
    openPositions,
    activeJobs: open.length,
    inPipeline: candidates.filter((candidate) => !candidate.erasedAt && ACTIVE_STAGES.includes(candidate.stage)).length,
    offersAccepted: accepted,
    offersDecided: decided,
    acceptanceRate: decided ? Math.round((accepted / decided) * 100) : null,
    avgDaysToHire: avg,
    hires: hired.length,
    pendingRequisitions: requisitions.filter((item) => item.state === "pending").length,
    pendingOfferApprovals: offers.filter((offer) => offer.state === "pending_approval").length,
    sources: sources.map((source) => {
      const list = candidates.filter((candidate) => candidate.source === source);
      const hires = list.filter((candidate) => candidate.stage === "hired").length;
      return {
        source,
        candidates: list.length,
        interviewed: list.filter((candidate) => interviewed.has(candidate.id) || ["interview", "offer", "hired"].includes(candidate.stage)).length,
        hired: hires,
        conversion: list.length ? Math.round((hires / list.length) * 100) : 0,
      };
    }),
  };
}

export function listJobs(actor: MockActor): JobSummary[] {
  requireCapability(actor, "recruitment.manage");
  const order = { published: 0, on_hold: 1, draft: 2, filled: 3, closed: 4 } as const;
  return store()
    .recruitmentJobs.slice()
    .sort((a, b) => order[a.state] - order[b.state] || b.openedOn.localeCompare(a.openedOn))
    .map(jobSummary);
}

export function jobDetail(actor: MockActor, jobId: string): JobDetail {
  requireCapability(actor, "recruitment.manage");
  const job = jobOf(jobId);
  const list = store().recruitmentCandidates.filter((candidate) => candidate.jobId === job.id);
  const bySource = new Map<CandidateSource, number>();
  for (const candidate of list) bySource.set(candidate.source, (bySource.get(candidate.source) ?? 0) + 1);
  return {
    ...jobSummary(job),
    description: job.description,
    skills: job.skills,
    hiringManagerId: job.hiringManagerId,
    version: job.version,
    sourceBreakdown: [...bySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    candidates: list.sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt)).map(pipelineCard),
  };
}

export function listRequisitions(actor: MockActor): Requisition[] {
  requireCapability(actor, "recruitment.manage");
  const order = { pending: 0, approved: 1, rejected: 2 } as const;
  return store()
    .recruitmentRequisitions.slice()
    .sort((a, b) => order[a.state] - order[b.state] || b.raisedAt.localeCompare(a.raisedAt))
    .map((item) => requisitionView(actor, item));
}

export function listCandidates(actor: MockActor, filters: { q?: string | undefined; jobId?: string | undefined; stage?: RecruitmentStage | undefined; source?: CandidateSource | undefined; retention?: boolean | undefined }): CandidateListItem[] {
  requireCapability(actor, "recruitment.manage");
  const q = filters.q?.trim().toLowerCase();
  const qDigits = q ? q.replace(/\D/g, "") : "";
  return store()
    .recruitmentCandidates.filter((candidate) => !filters.jobId || candidate.jobId === filters.jobId)
    .filter((candidate) => !filters.stage || candidate.stage === filters.stage)
    .filter((candidate) => !filters.source || candidate.source === filters.source)
    .filter((candidate) => !filters.retention || isRetentionDue(candidate))
    .filter((candidate) => {
      if (!q) return true;
      if ([candidate.name, candidate.email ?? "", candidate.reference, candidate.currentCompany ?? ""].join(" ").toLowerCase().includes(q)) return true;
      return qDigits.length >= 4 && digits(candidate.phone).includes(qDigits);
    })
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
    .map(listItem);
}

export function candidateDetail(actor: MockActor, candidateId: string): CandidateDetail {
  requireCapability(actor, "recruitment.manage");
  const candidate = candidateOf(candidateId);
  const job = jobOf(candidate.jobId);
  const offer = latestOffer(candidate.id);
  const open = activeOffer(candidate.id);
  const erased = Boolean(candidate.erasedAt);
  const duplicate = candidate.duplicateOf ? store().recruitmentCandidates.find((item) => item.id === candidate.duplicateOf) : undefined;
  const eraseBlockedReason = erased
    ? "Personal data has already been erased."
    : candidate.stage === "hired" || candidate.employeeId
      ? "Hired candidates' data moves to the employee record."
      : open
        ? "Resolve the open offer first."
        : candidate.stage !== "rejected" && !isRetentionDue(candidate)
          ? "Only rejected candidates, or those past their retention date, can be erased."
          : null;
  return {
    ...listItem(candidate),
    currentCompany: candidate.currentCompany,
    noticePeriodDays: candidate.noticePeriodDays,
    currentCtc: candidate.currentCtcPaise === null ? null : inr(candidate.currentCtcPaise),
    expectedCtc: candidate.expectedCtcPaise === null ? null : inr(candidate.expectedCtcPaise),
    referrer: candidate.referrerId ? person(candidate.referrerId) : null,
    resume: candidate.resume,
    consentAt: candidate.consentAt,
    retainUntil: candidate.retainUntil,
    erasedAt: candidate.erasedAt,
    rejectionReason: candidate.rejectionReason,
    employeeId: candidate.employeeId,
    duplicateOf: duplicate ? { id: duplicate.id, reference: duplicate.reference, jobTitle: jobOf(duplicate.jobId).title } : null,
    jobState: job.state,
    version: candidate.version,
    notes: candidate.notes
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((note) => ({ id: note.id, author: person(note.authorId), body: note.body, at: note.at })),
    timeline: candidate.events.slice().sort((a, b) => b.at.localeCompare(a.at)),
    interviews: store()
      .recruitmentInterviews.filter((item) => item.candidateId === candidate.id)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .map((item) => interviewView(actor, item)),
    offer: offer ? offerView(actor, offer) : null,
    permissions: {
      canMove: !erased && candidate.stage !== "hired",
      canSchedule: !erased && ["applied", "screening", "interview"].includes(candidate.stage) && job.state !== "closed" && job.state !== "filled",
      canOffer: !erased && ["interview", "offer"].includes(candidate.stage) && !open && job.state !== "closed" && job.state !== "filled",
      canConvert: !erased && offer?.state === "accepted" && !offer.employeeId && !candidate.employeeId,
      canErase: eraseBlockedReason === null,
      eraseBlockedReason,
    },
  };
}

export function offerLetter(actor: MockActor, candidateId: string): Offer {
  requireCapability(actor, "recruitment.manage");
  const offer = latestOffer(candidateOf(candidateId).id);
  if (!offer) throw problem(404, "NOT_FOUND", "There's no offer for this candidate yet.");
  return offerView(actor, offer);
}

export function myInterviews(actor: MockActor): MyInterviews {
  requireCapability(actor, "candidate.interview");
  const { recruitmentInterviews: interviews, recruitmentRequisitions: requisitions, recruitmentOffers: offers } = store();
  const canApproveOffers = can(actor, "payroll.approve");
  return {
    interviews: interviews
      .filter((item) => item.panelIds.includes(actor.employeeId) && item.state !== "cancelled")
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .map((item) => interviewView(actor, item)),
    requisitions: requisitions
      .filter((item) => item.raisedBy === actor.employeeId)
      .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
      .map((item) => requisitionView(actor, item)),
    offerApprovals: canApproveOffers
      ? offers
          .filter((offer) => offer.state === "pending_approval" || (offer.approverId === actor.employeeId && offer.approvedAt))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((offer) => offerView(actor, offer))
      : [],
    canApproveOffers,
  };
}

export function recruitmentOptions(actor: MockActor): RecruitmentOptions {
  if (!can(actor, "recruitment.manage")) requireCapability(actor, "candidate.interview");
  return {
    departments: departmentNames(),
    locations: locationNames(),
    people: store()
      .employees.filter((employee) => employee.status !== "exited")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(ref),
    jobs: can(actor, "recruitment.manage")
      ? store()
          .recruitmentJobs.filter((job) => job.state !== "closed" && job.state !== "filled")
          .map((job) => ({ id: job.id, title: job.title, state: job.state }))
      : [],
    today: store().today,
  };
}

/* Public careers (no actor; never exposes CTC, people or pipeline data) ------- */

function publicView(job: MockJob): PublicJob {
  return {
    id: job.id,
    reference: job.reference,
    title: job.title,
    department: job.department,
    location: job.location,
    employmentType: job.employmentType,
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    description: job.description,
    skills: job.skills,
    postedOn: job.openedOn,
  };
}
const isPublic = (job: MockJob) => job.state === "published" && job.publishToCareers;

export function publicJobs(): PublicJob[] {
  return store()
    .recruitmentJobs.filter(isPublic)
    .sort((a, b) => b.openedOn.localeCompare(a.openedOn))
    .map(publicView);
}
export function publicJob(jobId: string): PublicJob {
  const job = store().recruitmentJobs.find((item) => item.id === jobId);
  if (!job || !isPublic(job)) throw problem(404, "NOT_FOUND", "This role is no longer open.");
  return publicView(job);
}

function newCandidate(fields: Omit<MockCandidate, "id" | "reference" | "stage" | "appliedAt" | "stageChangedAt" | "hiredAt" | "rejectionReason" | "erasedAt" | "employeeId" | "notes" | "events" | "version" | "retainUntil">, actor: string, title: string): MockCandidate {
  const now = nowInstant();
  const candidate: MockCandidate = {
    ...fields,
    id: nextId("cand"),
    reference: nextReference("CN"),
    stage: "applied",
    appliedAt: now,
    stageChangedAt: now,
    hiredAt: null,
    rejectionReason: null,
    retainUntil: addDays(store().today, RETENTION_DAYS),
    erasedAt: null,
    employeeId: null,
    notes: [],
    events: [],
    version: 1,
  };
  logEvent(candidate, actor, title, jobOf(candidate.jobId).title);
  store().recruitmentCandidates.push(candidate);
  return candidate;
}

export function applyToJob(input: ApplyInput, resume: ResumeMeta, key: string | undefined) {
  return idempotent(key, () => {
    const job = store().recruitmentJobs.find((item) => item.id === input.jobId);
    if (!job || !isPublic(job)) throw problem(404, "NOT_FOUND", "This role is no longer open.");
    const duplicate = findDuplicate(input.email, input.phone);
    // Non-disclosing: same message whether the match is by email or phone.
    if (duplicate && duplicate.jobId === job.id)
      throw problem(409, "ALREADY_APPLIED", "You've already applied for this role. We'll be in touch.", { fieldErrors: { email: "An application with these details already exists for this role." } });
    const candidate = newCandidate(
      {
        jobId: job.id,
        name: input.name,
        email: input.email,
        phone: formatPhone(input.phone),
        currentCompany: input.currentCompany || null,
        experienceTenths: tenthsOf(input.experienceYears),
        noticePeriodDays: typeof input.noticePeriodDays === "number" ? input.noticePeriodDays : null,
        currentCtcPaise: null,
        expectedCtcPaise: null,
        source: "careers",
        referrerId: null,
        resume,
        consentAt: nowInstant(),
        duplicateOf: duplicate?.id ?? null,
      },
      "Careers page",
      "Applied on the careers page",
    );
    for (const hr of hrApprovers()) notify(hr, "system", "New application", `${job.title}: a new application arrived from the careers page.`, `/recruitment/${job.id}`);
    return { reference: candidate.reference };
  });
}

export function referCandidate(actor: MockActor, input: ReferralInput, resume: ResumeMeta | null, key: string | undefined) {
  requireCapability(actor, "directory.read");
  return idempotent(key, () => {
    const job = store().recruitmentJobs.find((item) => item.id === input.jobId);
    if (!job || job.state !== "published") throw problem(404, "NOT_FOUND", "This role isn't open for referrals.");
    const duplicate = findDuplicate(input.email, input.phone);
    if (duplicate && duplicate.jobId === job.id) throw problem(409, "ALREADY_IN_PIPELINE", "This person is already being considered for this role — thanks for thinking of them.");
    const self = me(actor);
    const candidate = newCandidate(
      {
        jobId: job.id,
        name: input.name,
        email: input.email,
        phone: formatPhone(input.phone),
        currentCompany: null,
        experienceTenths: tenthsOf(input.experienceYears),
        noticePeriodDays: null,
        currentCtcPaise: null,
        expectedCtcPaise: null,
        source: "referral",
        referrerId: self.id,
        resume,
        consentAt: nowInstant(),
        duplicateOf: duplicate?.id ?? null,
      },
      self.name,
      "Referred by an employee",
    );
    candidate.notes.push({ id: nextId("cn"), authorId: self.id, body: `Referral note: ${input.relationship}`, at: nowInstant() });
    for (const hr of hrApprovers()) if (hr !== self.id) notify(hr, "system", "New referral", `${self.name} referred someone for ${job.title}.`, `/recruitment/${job.id}`);
    return { reference: candidate.reference };
  });
}

export function myReferrals(actor: MockActor): MyReferral[] {
  requireCapability(actor, "directory.read");
  return store()
    .recruitmentCandidates.filter((candidate) => candidate.referrerId === actor.employeeId)
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
    .map((candidate) => ({
      id: candidate.id,
      jobId: candidate.jobId,
      name: candidate.name,
      jobTitle: jobOf(candidate.jobId).title,
      // Referrers see a coarse status only, never interview feedback or pay.
      status: candidate.stage === "hired" ? "hired" : candidate.stage === "rejected" ? "not_selected" : "in_process",
      referredAt: candidate.appliedAt,
    }));
}

/* Requisitions --------------------------------------------------------------- */

export function raiseRequisition(actor: MockActor, input: RequisitionInput, key: string | undefined) {
  requireCapability(actor, "candidate.interview");
  return idempotent(key, () => {
    validateOrg(input);
    const self = me(actor);
    const reference = nextReference("RQ");
    store().recruitmentRequisitions.push({
      id: nextId("rq"),
      reference,
      title: input.title,
      department: input.department,
      location: input.location,
      openings: input.openings,
      employmentType: input.employmentType,
      budgetMinPaise: paiseOf(input.budgetMin),
      budgetMaxPaise: paiseOf(input.budgetMax),
      justification: input.justification,
      backfillFor: input.justification === "backfill" ? (input.backfillFor ?? null) : null,
      reason: input.reason,
      raisedBy: self.id,
      raisedAt: nowInstant(),
      state: "pending",
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      jobId: null,
      version: 1,
    });
    for (const hr of hrApprovers()) if (hr !== self.id) notify(hr, "approval", "Hiring requisition to review", `${self.name} requested ${input.openings} × ${input.title}.`, "/recruitment?tab=requisitions");
    return { reference };
  });
}

export function decideRequisition(actor: MockActor, input: RequisitionDecisionInput) {
  requireCapability(actor, "recruitment.manage");
  const requisition = store().recruitmentRequisitions.find((item) => item.id === input.requisitionId);
  if (!requisition) throw problem(404, "NOT_FOUND", "That requisition no longer exists.");
  versionCheck(requisition.version, input.expectedVersion);
  if (requisition.state !== "pending") throw problem(409, "ALREADY_DECIDED", "This requisition has already been decided.");
  if (requisition.raisedBy === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't approve your own requisition — another HR approver must decide.");
  const now = nowInstant();
  Object.assign(requisition, { decidedBy: actor.employeeId, decidedAt: now, decisionNote: input.note || null, version: requisition.version + 1 });
  if (input.decision === "reject") {
    requisition.state = "rejected";
    notify(requisition.raisedBy, "approval", "Requisition not approved", `${requisition.title}: ${input.note ?? ""}`, "/recruitment/interviews?tab=requisitions");
    return { reference: requisition.reference, jobId: null };
  }
  requisition.state = "approved";
  const jobId = nextId("job");
  store().recruitmentJobs.push({
    id: jobId,
    reference: nextReference("JOB"),
    title: requisition.title,
    department: requisition.department,
    location: requisition.location,
    employmentType: requisition.employmentType,
    openings: requisition.openings,
    hiringManagerId: requisition.raisedBy,
    requisitionId: requisition.id,
    description: `${requisition.title} in ${requisition.department}, ${requisition.location}. ${requisition.reason} Replace this with the full role description before publishing.`,
    skills: [],
    experienceMin: 0,
    experienceMax: 5,
    ctcMinPaise: requisition.budgetMinPaise,
    ctcMaxPaise: requisition.budgetMaxPaise,
    state: "draft",
    publishToCareers: false,
    openedOn: store().today,
    closedOn: null,
    version: 1,
  });
  requisition.jobId = jobId;
  notify(requisition.raisedBy, "approval", "Requisition approved", `${requisition.title} is now a draft job opening.`, "/recruitment/interviews?tab=requisitions");
  return { reference: requisition.reference, jobId };
}

/* Jobs ----------------------------------------------------------------------- */

export function saveJob(actor: MockActor, input: JobInput, key: string | undefined) {
  requireCapability(actor, "recruitment.manage");
  return idempotent(key, () => {
    validateOrg(input);
    activeEmployee(input.hiringManagerId, "hiringManagerId", "Choose an active hiring manager.");
    const ctcMinPaise = paiseOf(input.ctcMin);
    const ctcMaxPaise = paiseOf(input.ctcMax);
    if (input.jobId) {
      const job = jobOf(input.jobId);
      versionCheck(job.version, input.expectedVersion);
      if (job.state === "closed" || job.state === "filled") throw problem(409, "JOB_CLOSED", "Closed and filled openings can't be edited.");
      const requisition = job.requisitionId ? store().recruitmentRequisitions.find((item) => item.id === job.requisitionId) : undefined;
      if (requisition && ctcMaxPaise > requisition.budgetMaxPaise)
        throw problem(422, "OVER_REQUISITION_BUDGET", "The CTC range can't exceed the approved requisition budget.", { fieldErrors: { ctcMax: `Approved budget is up to ₹${requisition.budgetMaxPaise / 100}.` } });
      const hires = stageCounts(job.id).hired;
      if (input.openings < hires) throw problem(422, "OPENINGS_BELOW_HIRES", "Openings can't be fewer than hires already made.", { fieldErrors: { openings: `${hires} already hired.` } });
      Object.assign(job, {
        title: input.title,
        department: input.department,
        location: input.location,
        employmentType: input.employmentType,
        openings: input.openings,
        hiringManagerId: input.hiringManagerId,
        description: input.description,
        skills: input.skills,
        experienceMin: input.experienceMin,
        experienceMax: input.experienceMax,
        ctcMinPaise,
        ctcMaxPaise,
        publishToCareers: input.publishToCareers,
        version: job.version + 1,
      });
      return { id: job.id, reference: job.reference };
    }
    const id = nextId("job");
    const reference = nextReference("JOB");
    store().recruitmentJobs.push({
      id,
      reference,
      title: input.title,
      department: input.department,
      location: input.location,
      employmentType: input.employmentType,
      openings: input.openings,
      hiringManagerId: input.hiringManagerId,
      requisitionId: null,
      description: input.description,
      skills: input.skills,
      experienceMin: input.experienceMin,
      experienceMax: input.experienceMax,
      ctcMinPaise,
      ctcMaxPaise,
      state: "draft",
      publishToCareers: input.publishToCareers,
      openedOn: store().today,
      closedOn: null,
      version: 1,
    });
    return { id, reference };
  });
}

export function changeJobState(actor: MockActor, input: JobStateInput) {
  requireCapability(actor, "recruitment.manage");
  const job = jobOf(input.jobId);
  versionCheck(job.version, input.expectedVersion);
  const allowed: Record<typeof input.to, MockJob["state"][]> = {
    published: ["draft", "on_hold"],
    on_hold: ["published"],
    closed: ["draft", "published", "on_hold"],
  };
  if (!allowed[input.to].includes(job.state)) throw problem(409, "INVALID_TRANSITION", `A ${job.state.replace("_", " ")} opening can't move to ${input.to.replace("_", " ")}.`);
  if (input.to === "published" && job.skills.length === 0) throw problem(422, "INCOMPLETE_JOB", "Add at least one skill (Edit job) before publishing.");
  if (input.to === "published" && job.description.includes("Replace this with the full role description"))
    throw problem(422, "INCOMPLETE_JOB", "Write the full role description (Edit job) before publishing.");
  if (input.to === "closed" && store().recruitmentCandidates.some((candidate) => candidate.jobId === job.id && activeOffer(candidate.id)))
    throw problem(409, "OPEN_OFFERS", "Resolve open offers on this job before closing it.");
  job.state = input.to;
  job.closedOn = input.to === "closed" ? store().today : null;
  job.version += 1;
  return { id: job.id, state: job.state };
}

/* Candidates ----------------------------------------------------------------- */

export function addCandidate(actor: MockActor, input: CandidateInput, resume: ResumeMeta | null, key: string | undefined) {
  requireCapability(actor, "recruitment.manage");
  return idempotent(key, () => {
    const job = jobOf(input.jobId);
    if (job.state === "closed" || job.state === "filled") throw problem(409, "JOB_CLOSED", "This opening is closed to new candidates.", { fieldErrors: { jobId: "Choose an open job." } });
    if (input.referrerId) activeEmployee(input.referrerId, "referrerId");
    const duplicate = findDuplicate(input.email, input.phone);
    if (duplicate && duplicate.jobId === job.id)
      throw problem(409, "DUPLICATE_CANDIDATE", `${duplicate.name} (${duplicate.reference}) is already in this pipeline.`, { fieldErrors: { email: `Matches ${duplicate.reference} in this job.` } });
    if (duplicate && !input.allowDuplicate)
      throw problem(409, "POSSIBLE_DUPLICATE", `Matches ${duplicate.name} (${duplicate.reference}) for ${jobOf(duplicate.jobId).title}.`, {
        fieldErrors: { email: `Same email or mobile as ${duplicate.reference}. Tick “Add as a linked application” to continue.` },
      });
    const name = actorName(actor);
    const candidate = newCandidate(
      {
        jobId: job.id,
        name: input.name,
        email: input.email,
        phone: formatPhone(input.phone),
        currentCompany: input.currentCompany || null,
        experienceTenths: tenthsOf(input.experienceYears),
        noticePeriodDays: input.noticePeriodDays,
        currentCtcPaise: input.currentCtc ? paiseOf(input.currentCtc) : null,
        expectedCtcPaise: input.expectedCtc ? paiseOf(input.expectedCtc) : null,
        source: input.source,
        referrerId: input.source === "referral" ? (input.referrerId ?? null) : null,
        resume,
        consentAt: nowInstant(),
        duplicateOf: duplicate?.id ?? null,
      },
      name,
      `Added by HR (${input.source.replace("_", "-")})`,
    );
    return { id: candidate.id, reference: candidate.reference };
  });
}

export function moveStage(actor: MockActor, input: StageMoveInput) {
  requireCapability(actor, "recruitment.manage");
  const candidate = candidateOf(input.candidateId);
  versionCheck(candidate.version, input.expectedVersion);
  if (candidate.erasedAt) throw problem(409, "ERASED", "This candidate's data was erased.");
  if (candidate.stage === "hired") throw problem(409, "ALREADY_HIRED", "Hired candidates are managed in People.");
  if (candidate.stage === input.to) throw problem(422, "SAME_STAGE", `Already in ${stageLabels[input.to]}.`, { fieldErrors: { to: "Choose a different stage." } });
  const job = jobOf(candidate.jobId);
  if ((job.state === "closed" || job.state === "filled") && input.to !== "rejected") throw problem(409, "JOB_CLOSED", "This opening is closed; candidates can only be rejected.");
  if (candidate.stage === "rejected" && !["applied", "screening"].includes(input.to))
    throw problem(422, "REOPEN_EARLY", "Reopen a rejected candidate into Applied or Screening.", { fieldErrors: { to: "Choose Applied or Screening." } });
  const open = activeOffer(candidate.id);
  if (open) throw problem(409, "OPEN_OFFER", `Offer ${open.reference} is ${open.state.replace("_", " ")} — record the response first.`);
  const from = candidate.stage;
  candidate.stage = input.to;
  candidate.stageChangedAt = nowInstant();
  if (input.to === "rejected") {
    candidate.rejectionReason = input.reason ?? null;
    // Retention restarts from the decision; consent covers 12 months of talent-pool use.
    candidate.retainUntil = addDays(store().today, RETENTION_DAYS);
    for (const item of store().recruitmentInterviews) if (item.candidateId === candidate.id && item.state === "scheduled") item.state = "cancelled";
  } else if (from === "rejected") candidate.rejectionReason = null;
  touch(candidate);
  logEvent(candidate, actorName(actor), input.to === "rejected" ? "Rejected" : `Moved from ${stageLabels[from]} to ${stageLabels[input.to]}`, input.reason || null);
  return { id: candidate.id, stage: candidate.stage };
}

export function addCandidateNote(actor: MockActor, input: CandidateNoteInput) {
  requireCapability(actor, "recruitment.manage");
  const candidate = candidateOf(input.candidateId);
  if (candidate.erasedAt) throw problem(409, "ERASED", "This candidate's data was erased.");
  candidate.notes.push({ id: nextId("cn"), authorId: actor.employeeId, body: input.body, at: nowInstant() });
  touch(candidate);
  return { id: candidate.id };
}

export function eraseCandidate(actor: MockActor, input: EraseInput) {
  requireCapability(actor, "recruitment.manage");
  const candidate = candidateOf(input.candidateId);
  const reason = candidateDetail(actor, candidate.id).permissions.eraseBlockedReason;
  if (reason) throw problem(409, "ERASE_NOT_ALLOWED", reason);
  Object.assign(candidate, {
    name: ERASED_NAME,
    email: null,
    phone: null,
    currentCompany: null,
    currentCtcPaise: null,
    expectedCtcPaise: null,
    noticePeriodDays: null,
    resume: null,
    notes: [],
    erasedAt: nowInstant(),
    duplicateOf: null,
  });
  // Keep the minimal, non-identifying trail (stage, source, dates) for hiring statistics.
  candidate.events = candidate.events.map((event) => ({ ...event, detail: null }));
  for (const item of store().recruitmentInterviews)
    if (item.candidateId === candidate.id) item.scorecards = item.scorecards.map((card) => ({ ...card, comments: "Erased with candidate data." }));
  touch(candidate);
  logEvent(candidate, actorName(actor), "Personal data erased", "Contact details, resume, notes and feedback comments removed.");
  return { id: candidate.id };
}

/* Interviews ------------------------------------------------------------------ */

export function scheduleInterview(actor: MockActor, input: InterviewInput, key: string | undefined) {
  requireCapability(actor, "recruitment.manage");
  return idempotent(key, () => {
    const candidate = candidateOf(input.candidateId);
    const job = jobOf(candidate.jobId);
    if (candidate.erasedAt || !["applied", "screening", "interview"].includes(candidate.stage))
      throw problem(409, "NOT_SCHEDULABLE", `Candidates in ${stageLabels[candidate.stage]} can't be scheduled.`);
    if (job.state === "closed" || job.state === "filled") throw problem(409, "JOB_CLOSED", "This opening is closed.");
    const start = new Date(`${input.date}T${input.time}:00+05:30`);
    if (start.getTime() <= Date.now()) throw problem(422, "PAST_SLOT", "Choose a time in the future.", { fieldErrors: { time: "This time has already passed." } });
    if (input.date > addDays(store().today, 60)) throw problem(422, "TOO_FAR", "Schedule within the next 60 days.", { fieldErrors: { date: "Within 60 days." } });
    if (input.mode === "online" && !/^https:\/\/\S+$/.test(input.locationOrLink))
      throw problem(422, "INVALID_LINK", "Online interviews need an https meeting link.", { fieldErrors: { locationOrLink: "Paste an https:// meeting link." } });
    const panel = [...new Set(input.panelIds)];
    for (const id of panel) activeEmployee(id, "panelIds", "Choose active employees for the panel.");
    const end = start.getTime() + input.durationMinutes * 60_000;
    for (const item of store().recruitmentInterviews) {
      if (item.state !== "scheduled") continue;
      const otherStart = new Date(item.scheduledAt).getTime();
      const otherEnd = otherStart + item.durationMinutes * 60_000;
      const clash = otherStart < end && start.getTime() < otherEnd ? panel.find((id) => item.panelIds.includes(id)) : undefined;
      if (clash) throw problem(409, "PANEL_CLASH", `${person(clash).name} already has an interview at that time.`, { fieldErrors: { panelIds: `${person(clash).name} is busy at that time.` } });
    }
    const round = store().recruitmentInterviews.filter((item) => item.candidateId === candidate.id && item.state !== "cancelled").length + 1;
    const id = nextId("iv");
    store().recruitmentInterviews.push({
      id,
      candidateId: candidate.id,
      jobId: job.id,
      round,
      type: input.type,
      scheduledAt: start.toISOString(),
      durationMinutes: input.durationMinutes,
      mode: input.mode,
      locationOrLink: input.locationOrLink,
      panelIds: panel,
      state: "scheduled",
      scorecards: [],
      createdBy: actor.employeeId,
      createdAt: nowInstant(),
    });
    const name = actorName(actor);
    if (candidate.stage !== "interview") {
      logEvent(candidate, name, `Moved from ${stageLabels[candidate.stage]} to Interview`);
      candidate.stage = "interview";
      candidate.stageChangedAt = nowInstant();
    }
    touch(candidate);
    logEvent(candidate, name, `Round ${round} scheduled`, `${input.type === "hr" ? "HR" : input.type} · ${input.date} ${input.time} · panel of ${panel.length}`);
    for (const panelist of panel) notify(panelist, "approval", "Interview scheduled", `${job.title} · round ${round} on ${input.date} at ${input.time}.`, "/recruitment/interviews");
    return { id, round };
  });
}

export function submitScorecard(actor: MockActor, input: ScorecardInput, key: string | undefined) {
  requireCapability(actor, "candidate.interview");
  return idempotent(key, () => {
    const interview = store().recruitmentInterviews.find((item) => item.id === input.interviewId);
    if (!interview || !interview.panelIds.includes(actor.employeeId)) throw problem(404, "NOT_FOUND", "We couldn't find that interview.");
    if (interview.scorecards.some((card) => card.panelistId === actor.employeeId)) throw problem(409, "ALREADY_SUBMITTED", "You've already submitted your scorecard.");
    if (interview.state !== "scheduled") throw problem(409, "NOT_OPEN", "This interview is no longer open for feedback.");
    if (dateOf(interview.scheduledAt) > store().today) throw problem(409, "TOO_EARLY", "Scorecards open on the interview day.");
    interview.scorecards.push({ panelistId: actor.employeeId, ratings: { ...input.ratings }, recommendation: input.recommendation, comments: input.comments, submittedAt: nowInstant() });
    if (interview.panelIds.every((id) => interview.scorecards.some((card) => card.panelistId === id))) interview.state = "completed";
    const candidate = candidateOf(interview.candidateId);
    touch(candidate);
    logEvent(candidate, actorName(actor), `Round ${interview.round} scorecard submitted`, interview.state === "completed" ? "All panel feedback is in." : null);
    return { id: interview.id, state: interview.state };
  });
}

/* Offers ---------------------------------------------------------------------- */

export function createOffer(actor: MockActor, input: OfferInput, key: string | undefined) {
  requireCapability(actor, "recruitment.manage");
  return idempotent(key, () => {
    const candidate = candidateOf(input.candidateId);
    const job = jobOf(candidate.jobId);
    if (candidate.erasedAt || !["interview", "offer"].includes(candidate.stage))
      throw problem(409, "NOT_OFFERABLE", "Offers are made to candidates in the Interview or Offer stage.");
    if (job.state === "closed" || job.state === "filled") throw problem(409, "JOB_CLOSED", "This opening is closed.");
    const open = activeOffer(candidate.id);
    if (open) throw problem(409, "OFFER_EXISTS", `Offer ${open.reference} is already ${open.state.replace("_", " ")}.`);
    validateOrg(input);
    activeEmployee(input.managerId, "managerId", "Choose an active reporting manager.");
    const store_ = store();
    if (input.joiningDate < store_.today) throw problem(422, "PAST_DATE", "Joining date can't be in the past.", { fieldErrors: { joiningDate: "Today or later." } });
    if (input.joiningDate > addDays(store_.today, 180)) throw problem(422, "TOO_FAR", "Joining date must be within 6 months.", { fieldErrors: { joiningDate: "Within 180 days." } });
    const ctcPaise = paiseOf(input.ctc);
    if (ctcPaise < 100_000 * 100) throw problem(422, "CTC_TOO_LOW", "Annual CTC looks too low.", { fieldErrors: { ctc: "Enter the annual CTC in rupees, e.g. 1800000." } });
    const budget = budgetMaxFor(job);
    const overBudget = ctcPaise > budget;
    const reference = nextReference("OF");
    const self = me(actor);
    store_.recruitmentOffers.push({
      id: nextId("of"),
      reference,
      candidateId: candidate.id,
      jobId: job.id,
      ctcPaise,
      joiningDate: input.joiningDate,
      designation: input.designation,
      department: input.department,
      location: input.location,
      managerId: input.managerId,
      state: overBudget ? "pending_approval" : "extended",
      overBudget,
      createdBy: self.id,
      createdAt: nowInstant(),
      approverId: null,
      approvedAt: null,
      approvalNote: null,
      respondedAt: null,
      responseNote: null,
      employeeId: null,
      version: 1,
    });
    if (candidate.stage !== "offer") {
      candidate.stage = "offer";
      candidate.stageChangedAt = nowInstant();
    }
    touch(candidate);
    logEvent(candidate, self.name, overBudget ? `Offer ${reference} sent for Finance approval` : `Offer ${reference} extended`, overBudget ? "CTC is above the approved budget." : null);
    if (overBudget) for (const approver of offerApprovers()) if (approver !== self.id) notify(approver, "approval", "Offer above budget", `${job.title}: offer ${reference} needs your approval.`, "/recruitment/interviews?tab=offers");
    return { reference, state: overBudget ? "pending_approval" : "extended" };
  });
}

export function decideOfferApproval(actor: MockActor, input: OfferApprovalInput) {
  requireCapability(actor, "payroll.approve");
  const offer = offerOf(input.offerId);
  versionCheck(offer.version, input.expectedVersion);
  if (offer.state !== "pending_approval") throw problem(409, "ALREADY_DECIDED", "This offer isn't waiting for approval.");
  if (offer.createdBy === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't approve an offer you created.");
  Object.assign(offer, {
    state: input.decision === "approve" ? "extended" : "approval_rejected",
    approverId: actor.employeeId,
    approvedAt: nowInstant(),
    approvalNote: input.note || null,
    version: offer.version + 1,
  });
  const candidate = candidateOf(offer.candidateId);
  touch(candidate);
  logEvent(candidate, actorName(actor), input.decision === "approve" ? `Offer ${offer.reference} approved and extended` : `Offer ${offer.reference} not approved`, input.note || null);
  notify(offer.createdBy, "approval", input.decision === "approve" ? "Offer approved" : "Offer not approved", `${offer.reference}${input.note ? `: ${input.note}` : ""}`, `/recruitment/candidates/${candidate.id}`);
  return { reference: offer.reference, state: offer.state };
}

export function respondToOffer(actor: MockActor, input: OfferResponseInput) {
  requireCapability(actor, "recruitment.manage");
  const offer = offerOf(input.offerId);
  versionCheck(offer.version, input.expectedVersion);
  if (offer.state !== "extended") throw problem(409, "NOT_EXTENDED", "Only an extended offer can be accepted or declined.");
  const candidate = candidateOf(offer.candidateId);
  Object.assign(offer, { state: input.response, respondedAt: nowInstant(), responseNote: input.note || null, version: offer.version + 1 });
  const name = actorName(actor);
  if (input.response === "declined") {
    candidate.stage = "rejected";
    candidate.stageChangedAt = nowInstant();
    candidate.rejectionReason = `Declined the offer: ${input.note ?? ""}`.trim();
    candidate.retainUntil = addDays(store().today, RETENTION_DAYS);
  }
  touch(candidate);
  logEvent(candidate, name, input.response === "accepted" ? `Offer ${offer.reference} accepted` : `Offer ${offer.reference} declined`, input.note || null);
  return { reference: offer.reference, state: offer.state };
}

/** Hire conversion: one linked identity (HR-12). Never converts twice. */
export function convertToEmployee(actor: MockActor, input: ConvertInput, key: string | undefined) {
  requireCapability(actor, "recruitment.manage");
  return idempotent(key, () => {
    const offer = offerOf(input.offerId);
    const candidate = candidateOf(offer.candidateId);
    if (offer.employeeId || candidate.employeeId)
      throw problem(409, "ALREADY_CONVERTED", "This candidate is already linked to an employee record.");
    if (offer.state !== "accepted") throw problem(409, "OFFER_NOT_ACCEPTED", "Convert only after the offer is accepted.");
    if (candidate.erasedAt) throw problem(409, "ERASED", "This candidate's data was erased.");
    const job = jobOf(offer.jobId);
    const created = createEmployee(
      actor,
      {
        name: candidate.name,
        designation: offer.designation,
        department: offer.department,
        location: offer.location,
        managerId: offer.managerId,
        joinedOn: offer.joiningDate,
        type: job.employmentType,
        probationMonths: "",
      },
      key ? `${key}:employee` : undefined,
    );
    offer.employeeId = created.id;
    offer.version += 1;
    candidate.employeeId = created.id;
    candidate.stage = "hired";
    candidate.hiredAt = nowInstant();
    candidate.stageChangedAt = candidate.hiredAt;
    touch(candidate);
    logEvent(candidate, actorName(actor), "Converted to employee", `Employee ${created.code} · joins ${offer.joiningDate}`);
    if (stageCounts(job.id).hired >= job.openings) {
      job.state = "filled";
      job.closedOn = store().today;
      job.version += 1;
    }
    return { employeeId: created.id, code: created.code };
  });
}
