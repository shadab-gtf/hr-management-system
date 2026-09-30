import "server-only";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { seeded } from "@/lib/mocks/seed/random";
import { addDays } from "@/lib/utils/date";
import type { PerfHealth, PerfPartStatus, PerfPhase, PerfPromotion, PerfSheetStatus, PerfWindowPhase } from "@/types/performance";

/* Synthetic goals, review cycles, reviews, continuous feedback. Relative to the business date. */

export interface MockPerfCycle {
  id: string;
  name: string;
  kind: "annual" | "half_yearly" | "quarterly";
  periodStart: string;
  periodEnd: string;
  eligibilityCutoff: string;
  departments: string[];
  scale: { rating: number; label: string; description: string }[];
  guideline: number[];
  goalWeight: number;
  phase: PerfPhase;
  phaseDates: Record<PerfWindowPhase, { start: string; end: string }>;
  releaseOn: string;
  calibrationLocked: boolean;
  releasedAt: string | null;
  createdAt: string;
  version: number;
}
export interface MockPerfCheckIn {
  id: string;
  at: string;
  progress: number;
  health: PerfHealth;
  comment: string;
  authorId: string;
}
export interface MockPerfGoal {
  id: string;
  cycleId: string;
  employeeId: string;
  title: string;
  description: string;
  target: string;
  weight: number;
  dueDate: string;
  objectiveId: string | null;
  progress: number;
  health: PerfHealth;
  checkIns: MockPerfCheckIn[];
  createdAt: string;
}
export interface MockPerfSheet {
  id: string;
  cycleId: string;
  employeeId: string;
  status: PerfSheetStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedById: string | null;
  comment: string | null;
  version: number;
}
export interface MockPerfRating {
  targetId: string;
  rating: number | null;
  comment: string;
}
export interface MockPerfPart {
  status: PerfPartStatus;
  goals: MockPerfRating[];
  competencies: MockPerfRating[];
  strengths: string;
  improvements: string;
  submittedAt: string | null;
}
export interface MockPerfManagerPart extends MockPerfPart {
  overallRating: number | null;
  summary: string;
  promotion: PerfPromotion;
  /** Basis points (850 = 8.50%); a recommendation only. */
  incrementBps: number | null;
}
export interface MockPerfReview {
  id: string;
  cycleId: string;
  employeeId: string;
  reviewerId: string | null;
  self: MockPerfPart;
  manager: MockPerfManagerPart;
  finalRating: number | null;
  finalReason: string | null;
  calibratedById: string | null;
  calibratedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgementComment: string | null;
  version: number;
}
export interface MockPerfFeedback {
  id: string;
  fromId: string;
  toId: string;
  visibility: "public" | "private";
  kind: "praise" | "suggestion";
  competencyId: string | null;
  goalId: string | null;
  message: string;
  createdAt: string;
  requestId: string | null;
}
export interface MockPerfFeedbackRequest {
  id: string;
  requesterId: string;
  askedId: string;
  goalId: string | null;
  question: string;
  status: "pending" | "answered" | "declined";
  createdAt: string;
  respondedAt: string | null;
}
export interface MockPerfOneOnOne {
  id: string;
  managerId: string;
  reportId: string;
  authorId: string;
  meetingOn: string;
  note: string;
  actionItems: string;
  createdAt: string;
}
export interface MockPerfAudit {
  id: string;
  at: string;
  actorId: string | null;
  cycleId: string | null;
  event: string;
}
export interface MockPerfCompetency {
  id: string;
  name: string;
  description: string;
  behaviours: string[];
}

export interface PerformanceState {
  perfCycles: MockPerfCycle[];
  perfGoals: MockPerfGoal[];
  perfSheets: MockPerfSheet[];
  perfReviews: MockPerfReview[];
  perfFeedback: MockPerfFeedback[];
  perfFeedbackRequests: MockPerfFeedbackRequest[];
  perfOneOnOnes: MockPerfOneOnOne[];
  perfAudit: MockPerfAudit[];
  perfCompetencies: MockPerfCompetency[];
  perfObjectives: { id: string; title: string }[];
}

export const defaultRatingScale = [
  { rating: 1, label: "Needs improvement", description: "Missed most goals; needs a structured improvement plan." },
  { rating: 2, label: "Partially meets", description: "Met some goals; clear gaps in delivery or behaviours." },
  { rating: 3, label: "Meets expectations", description: "Delivered goals as agreed with solid, reliable behaviours." },
  { rating: 4, label: "Exceeds expectations", description: "Delivered beyond the agreed targets and lifted the team." },
  { rating: 5, label: "Outstanding", description: "Exceptional, role-defining impact well beyond the role." },
];
export const defaultGuideline = [10, 20, 40, 20, 10];

const competencies: MockPerfCompetency[] = [
  { id: "comp_craft", name: "Craft", description: "Quality and depth in the work of your discipline.", behaviours: ["Sweats the details without losing pace", "Raises the bar for the team's standards", "Keeps learning and applies it to real work"] },
  { id: "comp_collab", name: "Collaboration", description: "Works across teams to reach shared outcomes.", behaviours: ["Shares context early and generously", "Disagrees openly, commits fully", "Makes others more effective"] },
  { id: "comp_ownership", name: "Ownership", description: "Takes responsibility for outcomes end to end.", behaviours: ["Follows through without reminders", "Flags risks early with options", "Fixes root causes, not just symptoms"] },
  { id: "comp_comm", name: "Communication", description: "Clear, timely and honest communication.", behaviours: ["Writes and speaks with clarity", "Adapts the message to the audience", "Listens before responding"] },
  { id: "comp_client", name: "Client focus", description: "Understands and delivers for clients and internal customers.", behaviours: ["Grounds decisions in client outcomes", "Manages expectations proactively", "Turns feedback into improvements"] },
];

const objectives = [
  { id: "obj_retention", title: "Grow client retention to 92%" },
  { id: "obj_quality", title: "Ship quality work without regressions" },
  { id: "obj_people", title: "Build a great place to work" },
  { id: "obj_growth", title: "Profitable growth at 18% EBITDA margin" },
];

// [title, target, objective]
type GoalTemplate = [string, string, string | null];
const templates: Record<string, GoalTemplate[]> = {
  Design: [
    ["Raise design quality scores on client work", "Average design QA score ≥ 4.3/5 across all releases", "obj_quality"],
    ["Grow the shared component library", "25 new reviewed components, documented in the design system", "obj_quality"],
    ["Cut revision rounds per project", "Average revision rounds from 3.1 to 2.2", "obj_retention"],
    ["Run monthly design critiques", "6 critiques held with ≥ 80% team attendance", "obj_people"],
  ],
  Engineering: [
    ["Reduce production incidents", "P1/P2 incidents down 40% versus last half", "obj_quality"],
    ["Improve release cadence", "Weekly releases with change-failure rate under 10%", "obj_quality"],
    ["Raise automated test coverage", "Critical-path coverage from 58% to 75%", "obj_quality"],
    ["Cut cloud spend", "Monthly infra cost down 15% with no SLA impact", "obj_growth"],
  ],
  "Performance Marketing": [
    ["Lower blended cost per lead", "CPL down 12% across paid channels", "obj_growth"],
    ["Grow organic traffic", "Organic sessions up 25% half on half", "obj_growth"],
    ["Improve campaign reporting", "Weekly client dashboards live for all retainers", "obj_retention"],
    ["Certify the team on new ad platforms", "Every specialist holds 2 current certifications", "obj_people"],
  ],
  "Strategy & Brand": [
    ["Win new brand mandates", "3 new strategy mandates worth ₹1.2 Cr combined", "obj_growth"],
    ["Raise content engagement", "Average engagement rate from 3.2% to 4.5%", "obj_retention"],
    ["Publish a brand playbook", "Playbook adopted on 5 client accounts", "obj_quality"],
    ["Cut turnaround on first drafts", "First draft within 3 working days on 90% of briefs", "obj_retention"],
  ],
  "Client Services": [
    ["Retain key accounts", "Renew 9 of 10 top accounts", "obj_retention"],
    ["Grow account revenue", "Upsell ₹80 L in new scope across the portfolio", "obj_growth"],
    ["Raise client satisfaction", "Quarterly CSAT ≥ 4.5/5", "obj_retention"],
    ["Tighten project delivery", "90% of milestones delivered on the agreed date", "obj_quality"],
  ],
  "People & Culture": [
    ["Reduce time to hire", "Average time to offer from 38 to 28 days", "obj_people"],
    ["Improve onboarding experience", "New-joiner 30-day survey score ≥ 4.4/5", "obj_people"],
    ["Close HR helpdesk tickets faster", "90% of tickets resolved within 2 working days", "obj_people"],
    ["Run the engagement survey", "Response rate ≥ 85%; action plans for every team", "obj_people"],
  ],
  Finance: [
    ["Close the books faster", "Month-end close within 5 working days", "obj_growth"],
    ["Zero statutory penalties", "All PF, ESI, TDS and PT filings on time", "obj_quality"],
    ["Improve collections", "DSO from 62 to 48 days", "obj_growth"],
    ["Automate payroll reconciliation", "Reconciliation effort down 50%", "obj_quality"],
  ],
};
const managerTemplates: GoalTemplate[] = [
  ["Build a high-performing team", "Team engagement ≥ 80%; zero regretted attrition", "obj_people"],
  ["Deliver the function's plan", "All planned initiatives delivered on time and budget", "obj_growth"],
  ["Develop successors", "Two ready-now successors identified and coached", "obj_people"],
];

const checkInNotes: Record<PerfHealth, string[]> = {
  on_track: ["Good progress; milestones landing as planned.", "Ahead of plan this month.", "Steady progress, no blockers."],
  at_risk: ["Dependency on another team is slowing this down.", "Scope grew; re-planning the next milestone.", "Client delays pushed two deliverables."],
  off_track: ["Blocked on budget approval.", "Deprioritised for a client escalation."],
};

const strengthsText = [
  "Consistently delivers high-quality work and brings others along.",
  "Owns problems end to end and communicates early.",
  "Strong client relationships and calm under pressure.",
  "Thoughtful, structured and reliable on complex work.",
];
const improvementsText = [
  "Delegate more and create space for strategic work.",
  "Share progress earlier with stakeholders.",
  "Push back on scope creep more firmly.",
  "Document decisions so the team can move without you.",
];

function yy(year: number) {
  return String(year % 100).padStart(2, "0");
}
function fyName(startYear: number) {
  return `FY${yy(startYear)}-${yy(startYear + 1)}`;
}
function pick<T>(list: readonly T[], ...parts: (string | number)[]): T {
  return list[Math.floor(seeded(...parts) * list.length)] as T;
}
function ratingFor(...parts: (string | number)[]): number {
  const value = seeded(...parts);
  if (value < 0.07) return 2;
  if (value < 0.5) return 3;
  if (value < 0.86) return 4;
  return 5;
}
function clampRating(n: number) {
  return Math.min(5, Math.max(1, n));
}

export function createPerformanceState(today: string, ago: (days: number, time?: string) => string, employees: SeedEmployee[]): PerformanceState {
  const goals: MockPerfGoal[] = [];
  const sheets: MockPerfSheet[] = [];
  const reviews: MockPerfReview[] = [];
  const audit: MockPerfAudit[] = [];
  let auditSeq = 0;
  const log = (at: string, actorId: string | null, cycleId: string | null, event: string) => audit.push({ id: `pa_${++auditSeq}`, at, actorId, cycleId, event });
  const dayOffset = (date: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  const at = (date: string, time = "11:00") => ago(dayOffset(date), time);

  /* Periods ---------------------------------------------------------------- */
  const ref = addDays(today, -20);
  const refYear = Number(ref.slice(0, 4));
  const refMonth = Number(ref.slice(5, 7));
  let halfStart: string;
  let halfEnd: string;
  let halfName: string;
  let fyStart: number;
  if (refMonth >= 4 && refMonth <= 9) {
    fyStart = refYear;
    halfStart = `${refYear}-04-01`;
    halfEnd = `${refYear}-09-30`;
    halfName = `H1 ${fyName(refYear)}`;
  } else {
    fyStart = refMonth >= 10 ? refYear : refYear - 1;
    halfStart = `${fyStart}-10-01`;
    halfEnd = `${fyStart + 1}-03-31`;
    halfName = `H2 ${fyName(fyStart)}`;
  }
  const prevStart = `${fyStart - 1}-04-01`;
  const prevEnd = `${fyStart}-03-31`;
  const month = Number(today.slice(5, 7));
  const year = Number(today.slice(0, 4));
  const nextQuarterMonth = [4, 7, 10, 13].find((m) => m > month) ?? 13;
  const qYear = nextQuarterMonth === 13 ? year + 1 : year;
  const qMonth = nextQuarterMonth === 13 ? 1 : nextQuarterMonth;
  const qStart = `${qYear}-${String(qMonth).padStart(2, "0")}-01`;
  const qEnd = addDays(`${qMonth + 3 > 12 ? qYear + 1 : qYear}-${String(((qMonth + 2) % 12) + 1).padStart(2, "0")}-01`, -1);
  const qNumber = qMonth === 4 ? 1 : qMonth === 7 ? 2 : qMonth === 10 ? 3 : 4;
  const qFy = qMonth >= 4 ? qYear : qYear - 1;

  const reviewedDepartments = ["Design", "Engineering", "Performance Marketing", "Strategy & Brand", "Client Services", "People & Culture", "Finance"];

  const prev: MockPerfCycle = {
    id: "pc_prev",
    name: `Annual ${fyName(fyStart - 1)}`,
    kind: "annual",
    periodStart: prevStart,
    periodEnd: prevEnd,
    eligibilityCutoff: addDays(prevStart, 182),
    departments: reviewedDepartments,
    scale: defaultRatingScale,
    guideline: defaultGuideline,
    goalWeight: 70,
    phase: "released",
    phaseDates: {
      goal_setting: { start: prevStart, end: addDays(prevStart, 30) },
      self_review: { start: addDays(prevEnd, 1), end: addDays(prevEnd, 14) },
      manager_review: { start: addDays(prevEnd, 15), end: addDays(prevEnd, 30) },
      calibration: { start: addDays(prevEnd, 31), end: addDays(prevEnd, 45) },
    },
    releaseOn: addDays(prevEnd, 50),
    calibrationLocked: true,
    releasedAt: at(addDays(prevEnd, 50), "10:00"),
    createdAt: at(addDays(prevStart, -10)),
    version: 7,
  };
  const half: MockPerfCycle = {
    id: "pc_half",
    name: halfName,
    kind: "half_yearly",
    periodStart: halfStart,
    periodEnd: halfEnd,
    eligibilityCutoff: addDays(halfStart, 60),
    departments: reviewedDepartments,
    scale: defaultRatingScale,
    guideline: defaultGuideline,
    goalWeight: 70,
    phase: "self_review",
    phaseDates: {
      goal_setting: { start: halfStart, end: [addDays(halfStart, 30), addDays(today, -13)].sort()[0] as string },
      self_review: { start: addDays(today, -12), end: addDays(today, 6) },
      manager_review: { start: addDays(today, 7), end: addDays(today, 20) },
      calibration: { start: addDays(today, 21), end: addDays(today, 30) },
    },
    releaseOn: addDays(today, 35),
    calibrationLocked: false,
    releasedAt: null,
    createdAt: at(addDays(halfStart, -12)),
    version: 3,
  };
  const quarter: MockPerfCycle = {
    id: "pc_quarter",
    name: `Q${qNumber} ${fyName(qFy)} goals`,
    kind: "quarterly",
    periodStart: qStart,
    periodEnd: qEnd,
    eligibilityCutoff: addDays(qStart, -1),
    departments: ["Design", "Engineering", "People & Culture"],
    scale: defaultRatingScale,
    guideline: defaultGuideline,
    goalWeight: 100,
    phase: "goal_setting",
    phaseDates: {
      goal_setting: { start: addDays(today, -5), end: addDays(today, 9) },
      self_review: { start: addDays(qEnd, -10), end: addDays(qEnd, 5) },
      manager_review: { start: addDays(qEnd, 6), end: addDays(qEnd, 15) },
      calibration: { start: addDays(qEnd, 16), end: addDays(qEnd, 22) },
    },
    releaseOn: addDays(qEnd, 25),
    calibrationLocked: false,
    releasedAt: null,
    createdAt: at(addDays(today, -7)),
    version: 2,
  };

  const eligible = (cycle: MockPerfCycle) =>
    employees.filter((e) => e.status !== "exited" && e.joinedOn <= cycle.eligibilityCutoff && (cycle.departments.length === 0 || cycle.departments.includes(e.department)));
  const hasReports = (id: string) => employees.some((e) => e.managerId === id);
  const compIds = competencies.map((c) => c.id);

  function addGoals(cycle: MockPerfCycle, e: SeedEmployee, withCheckIns: boolean, count?: number): MockPerfGoal[] {
    const pool = hasReports(e.id) ? [...managerTemplates, ...(templates[e.department] ?? [])] : (templates[e.department] ?? managerTemplates);
    const n = count ?? (seeded(cycle.id, e.id, "n") < 0.5 ? 3 : 4);
    const weights = n === 2 ? [40, 30] : n === 3 ? [40, 30, 30] : [30, 30, 20, 20];
    const offset = Math.floor(seeded(cycle.id, e.id, "o") * pool.length);
    const created: MockPerfGoal[] = [];
    for (let i = 0; i < n; i++) {
      const [title, target, objectiveId] = pool[(offset + i) % pool.length] as GoalTemplate;
      const goal: MockPerfGoal = {
        id: `pg_${cycle.id.slice(3)}_${e.id.slice(4)}_${i + 1}`,
        cycleId: cycle.id,
        employeeId: e.id,
        title,
        description: "",
        target,
        weight: weights[i] as number,
        dueDate: cycle.periodEnd,
        objectiveId,
        progress: 0,
        health: "on_track",
        checkIns: [],
        createdAt: at(cycle.phaseDates.goal_setting.start, "12:00"),
      };
      if (withCheckIns) {
        const done = cycle.phase === "released";
        const marks = done ? [110, 60, 15].map((d) => dayOffset(cycle.periodEnd) + d) : [130, 75, 25];
        let progress = 0;
        marks.forEach((days, index) => {
          if (days < 0) return;
          const health: PerfHealth = seeded(goal.id, index, "h") < 0.72 ? "on_track" : seeded(goal.id, index, "h2") < 0.8 ? "at_risk" : "off_track";
          progress = Math.min(100, progress + 15 + Math.floor(seeded(goal.id, index, "p") * 25));
          if (done && index === marks.length - 1) progress = Math.max(progress, 85);
          goal.checkIns.push({ id: `${goal.id}_c${index + 1}`, at: ago(days, "17:30"), progress, health, comment: pick(checkInNotes[health], goal.id, index), authorId: e.id });
          goal.progress = progress;
          goal.health = health;
        });
      }
      created.push(goal);
    }
    goals.push(...created);
    return created;
  }

  function emptyPart(goalList: MockPerfGoal[]): MockPerfPart {
    return { status: "not_started", goals: goalList.map((g) => ({ targetId: g.id, rating: null, comment: "" })), competencies: compIds.map((id) => ({ targetId: id, rating: null, comment: "" })), strengths: "", improvements: "", submittedAt: null };
  }
  function filledPart(goalList: MockPerfGoal[], base: number, key: string, submittedAt: string | null, status: PerfPartStatus): MockPerfPart {
    return {
      status,
      goals: goalList.map((g, i) => ({ targetId: g.id, rating: clampRating(base + (seeded(key, g.id) < 0.25 ? 1 : seeded(key, g.id) > 0.85 ? -1 : 0) + (i === 0 && base < 5 && seeded(key, "b") > 0.6 ? 1 : 0)), comment: g.progress >= 90 ? "Delivered in full with measurable results." : g.progress >= 60 ? "Most of the target delivered; remaining items planned." : "Partially delivered; dependencies slowed progress." })),
      competencies: compIds.map((id) => ({ targetId: id, rating: clampRating(base + (seeded(key, id) < 0.2 ? 1 : seeded(key, id) > 0.85 ? -1 : 0)), comment: "" })),
      strengths: pick(strengthsText, key, "s"),
      improvements: pick(improvementsText, key, "i"),
      submittedAt,
    };
  }
  function managerPart(goalList: MockPerfGoal[], rating: number, key: string, submittedAt: string | null, status: PerfPartStatus): MockPerfManagerPart {
    const part = filledPart(goalList, rating, key, submittedAt, status);
    return {
      ...part,
      overallRating: rating,
      summary: rating >= 4 ? "A strong half. Delivered beyond the agreed targets and raised the bar for the team." : rating === 3 ? "Solid, dependable delivery against the agreed goals." : "Some goals were missed; we have agreed a clear plan for the next cycle.",
      promotion: rating === 5 ? "ready" : rating === 4 && seeded(key, "promo") > 0.6 ? "ready_next_cycle" : "not_now",
      incrementBps: [0, 300, 550, 800, 1100, 1500][rating] ?? null,
    };
  }
  const reviewerOf = (e: SeedEmployee) => e.managerId;

  /* Previous annual cycle: released with final ratings -------------------- */
  for (const e of eligible(prev)) {
    const goalList = addGoals(prev, e, true, 3);
    const rating = ratingFor("prev", e.id);
    const calibrated = seeded("prev-cal", e.id) < 0.12 ? clampRating(rating - 1) : rating;
    sheets.push({ id: `ps_prev_${e.id.slice(4)}`, cycleId: prev.id, employeeId: e.id, status: "approved", submittedAt: at(addDays(prevStart, 20)), decidedAt: at(addDays(prevStart, 25)), decidedById: e.managerId, comment: null, version: 3 });
    reviews.push({
      id: `pr_prev_${e.id.slice(4)}`,
      cycleId: prev.id,
      employeeId: e.id,
      reviewerId: reviewerOf(e),
      self: filledPart(goalList, clampRating(rating + (seeded("self", e.id) > 0.6 ? 1 : 0)), `self-prev-${e.id}`, at(addDays(prevEnd, 10)), "submitted"),
      manager: managerPart(goalList, rating, `mgr-prev-${e.id}`, at(addDays(prevEnd, 25)), "submitted"),
      finalRating: calibrated,
      finalReason: calibrated !== rating ? "Normalised in calibration against peers with similar scope." : null,
      calibratedById: calibrated !== rating ? "emp_0005" : null,
      calibratedAt: calibrated !== rating ? at(addDays(prevEnd, 40)) : null,
      acknowledgedAt: seeded("ack", e.id) < 0.75 || e.id === "emp_0007" ? at(addDays(prevEnd, 55)) : null,
      acknowledgementComment: e.id === "emp_0007" ? "Thanks Rohan — agreed on the mentoring focus for this year." : null,
      version: 6,
    });
  }
  log(at(addDays(prevStart, -10)), "emp_0005", prev.id, "Cycle created");
  log(at(prevStart), "emp_0005", prev.id, "Launched · phase Goal setting");
  log(at(addDays(prevEnd, 1)), "emp_0005", prev.id, "Phase advanced to Self review");
  log(at(addDays(prevEnd, 15)), "emp_0005", prev.id, "Phase advanced to Manager review");
  log(at(addDays(prevEnd, 31)), "emp_0005", prev.id, "Phase advanced to Calibration");
  log(at(addDays(prevEnd, 45)), "emp_0005", prev.id, "Calibration locked");
  log(at(addDays(prevEnd, 50), "10:00"), "emp_0005", prev.id, "Phase advanced to Released · results visible to employees");

  /* Active half-yearly cycle, in self review ------------------------------ */
  const calibrationReady = new Set(["Finance", "Client Services", "Strategy & Brand"]);
  const lateSheets = new Set(["emp_0012", "emp_0019"]);
  for (const e of eligible(half)) {
    const isAanya = e.id === "emp_0007";
    const goalList = isAanya ? [] : addGoals(half, e, true);
    if (isAanya) {
      const aanya: [string, string, string, number, string][] = [
        ["Ship the HR self-service design system v2", "Design system foundations for the new HR product", "60 components documented; used by all 3 product squads", 40, "obj_quality"],
        ["Lift onboarding task completion", "Redesign the first-week onboarding journey with Research", "First-week task completion from 62% to 80%", 30, "obj_people"],
        ["Mentor two junior designers", "Structured mentoring for Arjun and Dev", "Two mentees complete portfolio reviews; monthly 1:1s held", 30, "obj_people"],
      ];
      const progressPlan = [
        [[25, "on_track", "Tokens and 18 core components shipped."], [55, "on_track", "Forms, tables and sheets documented; Squad A adopted."], [82, "on_track", "52 of 60 components live; Squad C migration in progress."]],
        [[20, "on_track", "Research synthesis done; 3 journeys mapped."], [45, "at_risk", "Engineering capacity moved to payroll; prototype slipped two weeks."], [70, "on_track", "New checklist live for September joiners; completion at 74%."]],
        [[30, "on_track", "Mentoring plan agreed with Rohan."], [60, "on_track", "Dev's portfolio review done."], [75, "on_track", "Monthly 1:1s held; second portfolio review booked."]],
      ] as const;
      aanya.forEach(([title, description, target, weight, objectiveId], i) => {
        const goal: MockPerfGoal = { id: `pg_half_0007_${i + 1}`, cycleId: half.id, employeeId: e.id, title, description, target, weight, dueDate: halfEnd, objectiveId, progress: 0, health: "on_track", checkIns: [], createdAt: at(addDays(halfStart, 8), "12:00") };
        [140, 80, 18].forEach((days, index) => {
          const [progress, health, comment] = progressPlan[i]?.[index] ?? [0, "on_track", ""];
          goal.checkIns.push({ id: `${goal.id}_c${index + 1}`, at: ago(days, "18:10"), progress, health, comment, authorId: e.id });
          goal.progress = progress;
          goal.health = health;
        });
        goals.push(goal);
        goalList.push(goal);
      });
    }
    const late = lateSheets.has(e.id);
    sheets.push({ id: `ps_half_${e.id.slice(4)}`, cycleId: half.id, employeeId: e.id, status: late ? "submitted" : "approved", submittedAt: at(addDays(halfStart, late ? 40 : 18)), decidedAt: late ? null : at(addDays(halfStart, 24)), decidedById: late ? null : e.managerId, comment: null, version: 2 });

    const dept = e.department;
    const rating = ratingFor("half", e.id);
    let self: MockPerfPart;
    let manager: MockPerfManagerPart = { ...emptyPart(goalList), overallRating: null, summary: "", promotion: "not_now", incrementBps: null };
    if (isAanya) {
      self = emptyPart(goalList);
      self.status = "draft";
      self.goals = goalList.map((g, i) => ({ targetId: g.id, rating: i === 0 ? 4 : null, comment: i === 0 ? "52 of 60 components live and adopted by two squads; the third migrates in October." : "" }));
      self.strengths = "Built the design system foundations and kept three squads aligned.";
    } else if (calibrationReady.has(dept) && e.id !== "emp_0038") {
      self = filledPart(goalList, clampRating(rating + (seeded("hs", e.id) > 0.7 ? 1 : 0)), `self-half-${e.id}`, ago(8), "submitted");
      manager = managerPart(goalList, rating, `mgr-half-${e.id}`, ago(3), "submitted");
    } else if (e.id === "emp_0005") {
      self = filledPart(goalList, 4, `self-half-${e.id}`, ago(9), "submitted");
      manager = managerPart(goalList, 4, `mgr-half-${e.id}`, ago(2), "submitted");
    } else if (e.id === "emp_0035" || e.id === "emp_0037" || e.id === "emp_0038") {
      self = filledPart(goalList, rating, `self-half-${e.id}`, ago(5), "submitted");
    } else if (e.id === "emp_0036") {
      self = filledPart(goalList, rating, `self-half-${e.id}`, null, "draft");
    } else {
      const roll = seeded("half-self", e.id);
      self = roll < 0.55 ? filledPart(goalList, rating, `self-half-${e.id}`, ago(Math.floor(roll * 10) + 1), "submitted") : roll < 0.8 ? filledPart(goalList, rating, `self-half-${e.id}`, null, "draft") : emptyPart(goalList);
      if (self.status === "submitted" && seeded("half-mgr", e.id) < 0.35) manager = managerPart(goalList, rating, `mgr-half-${e.id}`, null, "draft");
    }
    reviews.push({ id: `pr_half_${e.id.slice(4)}`, cycleId: half.id, employeeId: e.id, reviewerId: reviewerOf(e), self, manager, finalRating: null, finalReason: null, calibratedById: null, calibratedAt: null, acknowledgedAt: null, acknowledgementComment: null, version: 2 });
  }
  log(at(addDays(halfStart, -12)), "emp_0005", half.id, "Cycle created");
  log(at(halfStart), "emp_0005", half.id, "Launched · phase Goal setting");
  log(ago(12, "09:30"), "emp_0005", half.id, "Phase advanced to Self review");

  /* Upcoming quarterly goal cycle, in goal setting ------------------------ */
  for (const e of eligible(quarter)) {
    const isAanya = e.id === "emp_0007";
    const goalList = addGoals(quarter, e, false, isAanya ? 2 : undefined);
    if (isAanya) {
      const [first, second] = goalList;
      if (first) Object.assign(first, { title: "Launch the design system docs site", target: "Docs site live with usage analytics; 3 squads onboarded", weight: 40, objectiveId: "obj_quality" });
      if (second) Object.assign(second, { title: "Usability-test the leave journey", target: "8 sessions; top 5 issues fixed before release", weight: 30, objectiveId: "obj_people" });
    }
    const status: PerfSheetStatus = isAanya ? "draft" : e.id === "emp_0035" || e.id === "emp_0036" ? "submitted" : seeded("q-sheet", e.id) < 0.4 ? "submitted" : seeded("q-sheet", e.id) < 0.7 ? "approved" : "draft";
    sheets.push({ id: `ps_quarter_${e.id.slice(4)}`, cycleId: quarter.id, employeeId: e.id, status, submittedAt: status === "draft" ? null : ago(2), decidedAt: status === "approved" ? ago(1) : null, decidedById: status === "approved" ? e.managerId : null, comment: null, version: 1 });
    reviews.push({ id: `pr_quarter_${e.id.slice(4)}`, cycleId: quarter.id, employeeId: e.id, reviewerId: reviewerOf(e), self: emptyPart(goalList), manager: { ...emptyPart(goalList), overallRating: null, summary: "", promotion: "not_now", incrementBps: null }, finalRating: null, finalReason: null, calibratedById: null, calibratedAt: null, acknowledgedAt: null, acknowledgementComment: null, version: 1 });
  }
  log(at(addDays(today, -7)), "emp_0005", quarter.id, "Cycle created");
  log(ago(5, "09:00"), "emp_0005", quarter.id, "Launched · phase Goal setting");

  /* Continuous feedback ---------------------------------------------------- */
  const feedback: MockPerfFeedback[] = [
    { id: "pf_1", fromId: "emp_0009", toId: "emp_0007", visibility: "public", kind: "praise", competencyId: "comp_craft", goalId: "pg_half_0007_1", message: "The new table and sheet patterns made our client dashboards so much faster to build. Clear docs, great examples.", createdAt: ago(21, "16:20"), requestId: "pfr_1" },
    { id: "pf_2", fromId: "emp_0014", toId: "emp_0007", visibility: "private", kind: "suggestion", competencyId: "comp_comm", goalId: null, message: "Design hand-offs would land better with a short Loom walkthrough for the edge cases — we missed two empty states last sprint.", createdAt: ago(34, "12:05"), requestId: null },
    { id: "pf_3", fromId: "emp_0006", toId: "emp_0007", visibility: "private", kind: "praise", competencyId: "comp_ownership", goalId: null, message: "You kept the design system on track while covering for Tanvi's leave. That ownership was noticed by leadership.", createdAt: ago(46, "18:40"), requestId: null },
    { id: "pf_4", fromId: "emp_0007", toId: "emp_0010", visibility: "public", kind: "praise", competencyId: "comp_craft", goalId: null, message: "The onboarding motion prototypes were beautiful and made the research sessions so much richer.", createdAt: ago(15, "11:10"), requestId: null },
    { id: "pf_5", fromId: "emp_0007", toId: "emp_0012", visibility: "private", kind: "suggestion", competencyId: "comp_collab", goalId: null, message: "Loop in Engineering earlier on brand refresh changes — it will save you a round of rework.", createdAt: ago(27, "15:45"), requestId: null },
    { id: "pf_6", fromId: "emp_0005", toId: "emp_0035", visibility: "public", kind: "praise", competencyId: "comp_ownership", goalId: null, message: "Closed three senior engineering roles in a single month. Brilliant work with the hiring managers.", createdAt: ago(9, "10:30"), requestId: null },
    { id: "pf_7", fromId: "emp_0036", toId: "emp_0037", visibility: "public", kind: "praise", competencyId: "comp_collab", goalId: null, message: "The new visitor desk flow at Noida HQ is smooth — thank you for sorting it before the client visit.", createdAt: ago(6, "17:00"), requestId: null },
    { id: "pf_8", fromId: "emp_0003", toId: "emp_0038", visibility: "private", kind: "praise", competencyId: "comp_ownership", goalId: null, message: "Vendor reconciliation was spotless this quarter. Thank you for the extra evenings at month end.", createdAt: ago(18, "19:15"), requestId: null },
    { id: "pf_9", fromId: "emp_0013", toId: "emp_0014", visibility: "public", kind: "praise", competencyId: "comp_craft", goalId: null, message: "The performance fixes on the client portal cut load time by half. Great engineering.", createdAt: ago(11, "13:25"), requestId: null },
    { id: "pf_10", fromId: "emp_0020", toId: "emp_0021", visibility: "public", kind: "praise", competencyId: "comp_client", goalId: null, message: "Rescued the festive campaign CPL in 48 hours. The client called it out on the QBR.", createdAt: ago(4, "12:40"), requestId: null },
    { id: "pf_11", fromId: "emp_0033", toId: "emp_0005", visibility: "public", kind: "praise", competencyId: "comp_client", goalId: null, message: "The onboarding checklist for client-side hires made my new PMs productive in week one.", createdAt: ago(13, "16:55"), requestId: null },
    { id: "pf_12", fromId: "emp_0017", toId: "emp_0015", visibility: "private", kind: "suggestion", competencyId: "comp_comm", goalId: null, message: "Please post a short summary in #releases when you change an API contract — ops got surprised twice.", createdAt: ago(24, "10:05"), requestId: null },
    { id: "pf_13", fromId: "emp_0035", toId: "emp_0036", visibility: "private", kind: "suggestion", competencyId: "comp_ownership", goalId: null, message: "Offer letters sometimes wait a day for the final check. A same-day SLA would help candidates.", createdAt: ago(7, "14:20"), requestId: null },
    { id: "pf_14", fromId: "emp_0030", toId: "emp_0031", visibility: "public", kind: "praise", competencyId: "comp_client", goalId: null, message: "The renewal deck for our largest retainer was superb. Renewal signed a month early.", createdAt: ago(19, "18:05"), requestId: null },
  ];
  const requests: MockPerfFeedbackRequest[] = [
    { id: "pfr_1", requesterId: "emp_0007", askedId: "emp_0009", goalId: "pg_half_0007_1", question: "How have the new design system components worked for your client dashboards?", status: "answered", createdAt: ago(24, "10:00"), respondedAt: ago(21, "16:20") },
    { id: "pfr_2", requesterId: "emp_0007", askedId: "emp_0014", goalId: "pg_half_0007_1", question: "Are the component specs detailed enough for Engineering to build without back-and-forth?", status: "pending", createdAt: ago(5, "11:30"), respondedAt: null },
    { id: "pfr_3", requesterId: "emp_0010", askedId: "emp_0007", goalId: null, question: "What should I focus on to grow into a senior motion designer this year?", status: "pending", createdAt: ago(3, "15:10"), respondedAt: null },
    { id: "pfr_4", requesterId: "emp_0037", askedId: "emp_0005", goalId: null, question: "How did the office move logistics land from the HR side? Anything to do differently?", status: "pending", createdAt: ago(2, "12:00"), respondedAt: null },
  ];
  const oneOnOnes: MockPerfOneOnOne[] = [
    { id: "p11_1", managerId: "emp_0006", reportId: "emp_0007", authorId: "emp_0006", meetingOn: addDays(today, -44), note: "Reviewed design system adoption. Squad C migration blocked on the table component API.", actionItems: "Aanya: pair with Sneha on table API\nRohan: raise capacity with Farhan", createdAt: ago(44, "17:00") },
    { id: "p11_2", managerId: "emp_0006", reportId: "emp_0007", authorId: "emp_0007", meetingOn: addDays(today, -23), note: "Discussed onboarding journey slip and the mentoring plan for Arjun joining in September.", actionItems: "Aanya: share revised onboarding timeline\nAanya: prepare Arjun's first-week plan", createdAt: ago(23, "17:20") },
    { id: "p11_3", managerId: "emp_0006", reportId: "emp_0007", authorId: "emp_0006", meetingOn: addDays(today, -8), note: "Self review prep: agreed evidence to include for goals 1 and 2. Talked about lead-track expectations.", actionItems: "Aanya: finish self review before the deadline", createdAt: ago(8, "16:45") },
    { id: "p11_4", managerId: "emp_0005", reportId: "emp_0035", authorId: "emp_0005", meetingOn: addDays(today, -15), note: "Hiring pipeline for Q3: 6 open roles, 2 at offer. Agency spend within budget.", actionItems: "Shreya: close the QA role\nMeera: approve the referral bonus change", createdAt: ago(15, "12:30") },
    { id: "p11_5", managerId: "emp_0005", reportId: "emp_0035", authorId: "emp_0035", meetingOn: addDays(today, -3), note: "Career conversation: interested in HRBP track. Wants exposure to performance cycles.", actionItems: "Meera: pair Shreya on calibration prep", createdAt: ago(3, "12:10") },
    { id: "p11_6", managerId: "emp_0005", reportId: "emp_0036", authorId: "emp_0005", meetingOn: addDays(today, -10), note: "HR ops ticket backlog down to 14. Payroll input cut-off reminders working.", actionItems: "Manish: finish self review\nManish: document the exit checklist", createdAt: ago(10, "11:00") },
    { id: "p11_7", managerId: "emp_0002", reportId: "emp_0005", authorId: "emp_0002", meetingOn: addDays(today, -12), note: "Performance cycle plan and calibration panels agreed. Engagement survey timing moved to November.", actionItems: "Meera: share calibration panel invites", createdAt: ago(12, "15:00") },
  ];

  return {
    perfCycles: [prev, half, quarter],
    perfGoals: goals,
    perfSheets: sheets,
    perfReviews: reviews,
    perfFeedback: feedback,
    perfFeedbackRequests: requests,
    perfOneOnOnes: oneOnOnes,
    perfAudit: audit,
    perfCompetencies: competencies.map((c) => ({ ...c, behaviours: [...c.behaviours] })),
    perfObjectives: objectives.map((o) => ({ ...o })),
  };
}
