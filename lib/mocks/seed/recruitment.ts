import "server-only";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { addDays, zonedInstant } from "@/lib/utils/date";
import type {
  CandidateSource,
  InterviewMode,
  InterviewState,
  InterviewType,
  JobState,
  OfferState,
  Recommendation,
  RecruitmentStage,
  RequisitionJustification,
  RequisitionState,
} from "@/types/recruitment";

/* Synthetic requisitions, job openings, candidates, interviews, offers. Relative to the business date. */

type EmploymentKind = SeedEmployee["type"];

export interface MockRequisition {
  id: string;
  reference: string;
  title: string;
  department: string;
  location: string;
  openings: number;
  employmentType: EmploymentKind;
  budgetMinPaise: number;
  budgetMaxPaise: number;
  justification: RequisitionJustification;
  backfillFor: string | null;
  reason: string;
  raisedBy: string;
  raisedAt: string;
  state: RequisitionState;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  jobId: string | null;
  version: number;
}

export interface MockJob {
  id: string;
  reference: string;
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentKind;
  openings: number;
  hiringManagerId: string;
  requisitionId: string | null;
  description: string;
  skills: string[];
  experienceMin: number;
  experienceMax: number;
  ctcMinPaise: number;
  ctcMaxPaise: number;
  state: JobState;
  publishToCareers: boolean;
  openedOn: string;
  closedOn: string | null;
  version: number;
}

export interface MockCandidateEvent {
  id: string;
  at: string;
  actor: string;
  title: string;
  detail: string | null;
}

export interface MockCandidate {
  id: string;
  reference: string;
  jobId: string;
  name: string;
  email: string | null;
  phone: string | null;
  currentCompany: string | null;
  /** Experience in tenths of a year (45 = 4.5 years). */
  experienceTenths: number;
  noticePeriodDays: number | null;
  currentCtcPaise: number | null;
  expectedCtcPaise: number | null;
  source: CandidateSource;
  referrerId: string | null;
  stage: RecruitmentStage;
  appliedAt: string;
  stageChangedAt: string;
  hiredAt: string | null;
  rejectionReason: string | null;
  resume: { name: string; sizeBytes: number; mime: string } | null;
  consentAt: string | null;
  retainUntil: string;
  erasedAt: string | null;
  employeeId: string | null;
  duplicateOf: string | null;
  notes: { id: string; authorId: string; body: string; at: string }[];
  events: MockCandidateEvent[];
  version: number;
}

export interface MockScorecard {
  panelistId: string;
  ratings: Record<string, number>;
  recommendation: Recommendation;
  comments: string;
  submittedAt: string;
}

export interface MockInterview {
  id: string;
  candidateId: string;
  jobId: string;
  round: number;
  type: InterviewType;
  scheduledAt: string;
  durationMinutes: number;
  mode: InterviewMode;
  locationOrLink: string;
  panelIds: string[];
  state: InterviewState;
  scorecards: MockScorecard[];
  createdBy: string;
  createdAt: string;
}

export interface MockOffer {
  id: string;
  reference: string;
  candidateId: string;
  jobId: string;
  ctcPaise: number;
  joiningDate: string;
  designation: string;
  department: string;
  location: string;
  managerId: string;
  state: OfferState;
  overBudget: boolean;
  createdBy: string;
  createdAt: string;
  approverId: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  respondedAt: string | null;
  responseNote: string | null;
  employeeId: string | null;
  version: number;
}

export interface RecruitmentState {
  recruitmentRequisitions: MockRequisition[];
  recruitmentJobs: MockJob[];
  recruitmentCandidates: MockCandidate[];
  recruitmentInterviews: MockInterview[];
  recruitmentOffers: MockOffer[];
}

const LAKH = 100_000 * 100; // paise
const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;

// [name, company, exp tenths, notice days, current L, expected L, source, referrer n, stage, applied days ago, stage days ago, rejection reason]
type CandidateRow = [string, string | null, number, number, number, number, CandidateSource, number | null, RecruitmentStage, number, number, string | null];

const candidateRows: Record<string, CandidateRow[]> = {
  job_1: [
    ["Ritika Sen", "Zomato", 62, 30, 21, 27, "linkedin", null, "offer", 30, 4, null],
    ["Aarav Khanna", "Paytm", 55, 60, 19, 25, "referral", 14, "interview", 22, 6, null],
    ["Nandini Rao", "Freshworks", 48, 30, 17, 23, "careers", null, "interview", 18, 3, null],
    ["Vivek Chauhan", "Infosys", 71, 90, 20, 28, "agency", null, "interview", 16, 2, null],
    ["Sana Sheikh", "Swiggy", 40, 30, 15, 21, "careers", null, "screening", 9, 5, null],
    ["Kunal Bhatt", "TCS", 52, 60, 14, 20, "linkedin", null, "screening", 8, 4, null],
    ["Meghna Pillai", "Razorpay", 45, 45, 18, 24, "referral", 19, "screening", 6, 2, null],
    ["Rohit Yadav", null, 38, 0, 12, 18, "careers", null, "applied", 3, 3, null],
    ["Tanya Arora", "HCLTech", 44, 60, 13, 19, "careers", null, "applied", 2, 2, null],
    ["Imran Ali", "Wipro", 50, 90, 16, 22, "walk_in", null, "applied", 1, 1, null],
    ["Deepak Menon", "Accenture", 35, 60, 11, 17, "careers", null, "rejected", 25, 20, "Frontend fundamentals below the bar in the technical round."],
    ["Prachi Soni", "Byju's", 42, 30, 14, 26, "agency", null, "rejected", 21, 15, "Expected CTC well above the approved band."],
  ],
  job_2: [
    ["Aditi Bhatnagar", "Nykaa", 78, 60, 17, 21, "linkedin", null, "offer", 19, 2, null],
    ["Rajiv Malhotra", "MakeMyTrip", 82, 90, 18, 22, "agency", null, "interview", 15, 5, null],
    ["Shruti Kapoor", "Myntra", 65, 30, 14, 18, "careers", null, "interview", 12, 3, null],
    ["Nikhil Deshpande", "Dentsu", 70, 60, 15, 19, "referral", 21, "screening", 8, 4, null],
    ["Pallavi Joshi", "GroupM", 60, 30, 13, 17, "careers", null, "screening", 6, 2, null],
    ["Arnav Sethi", null, 55, 15, 12, 16, "linkedin", null, "applied", 3, 3, null],
    ["Farah Naqvi", "Madison", 66, 60, 14, 18, "careers", null, "applied", 1, 1, null],
    ["Gautam Rao", "WATConsult", 58, 30, 13, 20, "careers", null, "rejected", 14, 9, "Limited hands-on experience with performance channels."],
  ],
  job_3: [
    ["Sneha Agarwal", "Grant Thornton", 34, 30, 5.2, 6.8, "careers", null, "interview", 14, 2, null],
    ["Mohit Goyal", "BDO India", 28, 30, 4.6, 6.2, "referral", 38, "interview", 12, 2, null],
    ["Kavita Rawat", "Deloitte", 40, 60, 5.8, 7.2, "linkedin", null, "interview", 10, 1, null],
    ["Arpit Mittal", null, 22, 0, 3.8, 5.4, "walk_in", null, "screening", 5, 3, null],
    ["Neelam Chawla", "KPMG", 31, 45, 5.0, 6.5, "careers", null, "applied", 2, 2, null],
    ["Harpreet Gill", "EY", 26, 30, 4.4, 6.0, "careers", null, "applied", 1, 1, null],
    ["Suresh Kumar", "Tally Solutions", 48, 90, 6.5, 9.8, "agency", null, "rejected", 13, 8, "Expected CTC above the role band; notice period 90 days."],
  ],
  job_4: [
    ["Ishaan Verma", "Pixel Studio", 36, 30, 8, 11, "careers", null, "screening", 38, 30, null],
    ["Mitali Das", "Toonz Media", 42, 60, 9, 12, "linkedin", null, "screening", 35, 28, null],
    ["Arjun Nambiar", null, 18, 0, 5, 8, "careers", null, "applied", 30, 30, null],
    ["Zara Hussain", "Ogilvy", 50, 60, 10, 16, "agency", null, "rejected", 37, 32, "Portfolio skewed to 3D; role needs 2D motion."],
  ],
  job_5: [
    ["Aman Tiwari", "Info Edge", 24, 30, 5.2, 6.5, "referral", 31, "hired", 52, 15, null],
    ["Preeti Saini", "Just Dial", 20, 30, 4.4, 6.0, "careers", null, "rejected", 48, 30, "Selected candidate accepted first; kept in talent pool."],
    ["Varun Oberoi", "IndiaMART", 30, 60, 5.5, 7.5, "linkedin", null, "rejected", 46, 33, "Not a fit for field client servicing."],
    ["Sakshi Tyagi", "Naukri", 18, 30, 4.0, 5.5, "careers", null, "rejected", 370, 360, "Role closed before final round."],
  ],
};

const jobDefinitions = [
  {
    id: "job_1",
    title: "Senior Frontend Engineer",
    department: "Engineering",
    location: "Gurugram",
    employmentType: "full_time" as const,
    openings: 2,
    manager: 13,
    requisition: "rq_1",
    skills: ["React", "TypeScript", "Next.js", "Accessibility", "Testing"],
    exp: [4, 8] as const,
    ctc: [22, 32] as const,
    state: "published" as const,
    careers: true,
    openedAgo: 34,
    description:
      "Build the product surfaces our clients use every day. You will own features end to end in React and Next.js, raise the bar on accessibility and performance, review code, and mentor two mid-level engineers. Hybrid from our Gurugram office three days a week.",
  },
  {
    id: "job_2",
    title: "Performance Marketing Manager",
    department: "Performance Marketing",
    location: "Mumbai",
    employmentType: "full_time" as const,
    openings: 1,
    manager: 20,
    requisition: null,
    skills: ["Google Ads", "Meta Ads", "Attribution", "Budget planning"],
    exp: [6, 10] as const,
    ctc: [14, 20] as const,
    state: "published" as const,
    careers: true,
    openedAgo: 21,
    description:
      "Lead paid acquisition for a portfolio of D2C and fintech clients. Plan budgets across Google and Meta, run structured experiments, own weekly reporting to client leadership and coach a team of three specialists.",
  },
  {
    id: "job_3",
    title: "Accounts Executive",
    department: "Finance",
    location: "Noida HQ",
    employmentType: "full_time" as const,
    openings: 1,
    manager: 3,
    requisition: "rq_2",
    skills: ["Tally", "GST returns", "TDS", "Reconciliation", "Excel"],
    exp: [2, 5] as const,
    ctc: [5, 7.5] as const,
    state: "published" as const,
    careers: true,
    openedAgo: 18,
    description:
      "Join the finance team at Noida HQ to run accounts payable, vendor reconciliations, monthly GST and TDS workings, and support the statutory audit. You will work closely with payroll during month-end close.",
  },
  {
    id: "job_4",
    title: "Motion Designer",
    department: "Design",
    location: "Remote",
    employmentType: "contract" as const,
    openings: 1,
    manager: 6,
    requisition: null,
    skills: ["After Effects", "2D animation", "Storyboarding"],
    exp: [2, 6] as const,
    ctc: [8, 12] as const,
    state: "on_hold" as const,
    careers: false,
    openedAgo: 40,
    description:
      "A 12-month contract to animate brand films, social cut-downs and product explainers with the Design team. On hold while the client scope for Q4 is confirmed; existing candidates stay in the pipeline.",
  },
  {
    id: "job_5",
    title: "Account Executive",
    department: "Client Services",
    location: "Gurugram",
    employmentType: "full_time" as const,
    openings: 1,
    manager: 30,
    requisition: null,
    skills: ["Client servicing", "Presentations", "CRM"],
    exp: [1, 4] as const,
    ctc: [5, 7] as const,
    state: "filled" as const,
    careers: false,
    openedAgo: 60,
    description:
      "Support account managers on day-to-day client servicing: status calls, briefs, timelines and invoices for a set of retail and hospitality clients in Delhi NCR.",
  },
];

const resumeMime = "application/pdf";

export function createRecruitmentState(today: string, ago: (days: number, time?: string) => string, employees: SeedEmployee[]): RecruitmentState {
  const year = today.slice(2, 4);
  const at = (daysFromToday: number, time: string) => zonedInstant(addDays(today, daysFromToday), time);
  const aman = employees.find((employee) => employee.id === e(34));

  const requisitions: MockRequisition[] = [
    {
      id: "rq_1",
      reference: `RQ-${year}0201`,
      title: "Senior Frontend Engineer",
      department: "Engineering",
      location: "Gurugram",
      openings: 2,
      employmentType: "full_time",
      budgetMinPaise: 22 * LAKH,
      budgetMaxPaise: 32 * LAKH,
      justification: "new_role",
      backfillFor: null,
      reason: "Two new retainer clients from October need a second product squad.",
      raisedBy: e(13),
      raisedAt: ago(38),
      state: "approved",
      decidedBy: e(5),
      decidedAt: ago(35, "15:10"),
      decisionNote: "Approved within FY hiring plan.",
      jobId: "job_1",
      version: 2,
    },
    {
      id: "rq_2",
      reference: `RQ-${year}0204`,
      title: "Accounts Executive",
      department: "Finance",
      location: "Noida HQ",
      openings: 1,
      employmentType: "full_time",
      budgetMinPaise: 5 * LAKH,
      budgetMaxPaise: 7.5 * LAKH,
      justification: "new_role",
      backfillFor: null,
      reason: "Vendor volumes doubled after the Mumbai expansion; reconciliations are running late.",
      raisedBy: e(3),
      raisedAt: ago(22),
      state: "approved",
      decidedBy: e(5),
      decidedAt: ago(19, "12:00"),
      decisionNote: null,
      jobId: "job_3",
      version: 2,
    },
    {
      id: "rq_3",
      reference: `RQ-${year}0211`,
      title: "Full-stack Engineer",
      department: "Engineering",
      location: "Remote",
      openings: 1,
      employmentType: "full_time",
      budgetMinPaise: 14 * LAKH,
      budgetMaxPaise: 19 * LAKH,
      justification: "backfill",
      backfillFor: "Neha Gupta (serving notice)",
      reason: "Backfill before Neha's last working day to keep the analytics roadmap on track.",
      raisedBy: e(13),
      raisedAt: ago(2, "11:20"),
      state: "pending",
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      jobId: null,
      version: 1,
    },
    {
      id: "rq_4",
      reference: `RQ-${year}0212`,
      title: "Payroll Analyst",
      department: "Finance",
      location: "Noida HQ",
      openings: 1,
      employmentType: "full_time",
      budgetMinPaise: 7 * LAKH,
      budgetMaxPaise: 10 * LAKH,
      justification: "new_role",
      backfillFor: null,
      reason: "Statutory filings and settlements now need a dedicated analyst alongside Vikram.",
      raisedBy: e(3),
      raisedAt: ago(1, "16:05"),
      state: "pending",
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      jobId: null,
      version: 1,
    },
    {
      id: "rq_5",
      reference: `RQ-${year}0198`,
      title: "Design Operations Manager",
      department: "Design",
      location: "Noida HQ",
      openings: 1,
      employmentType: "full_time",
      budgetMinPaise: 18 * LAKH,
      budgetMaxPaise: 24 * LAKH,
      justification: "new_role",
      backfillFor: null,
      reason: "Coordinate resourcing across the growing design team.",
      raisedBy: e(6),
      raisedAt: ago(45),
      state: "rejected",
      decidedBy: e(5),
      decidedAt: ago(41, "10:30"),
      decisionNote: "H2 budget freeze on new management roles — revisit in April.",
      jobId: null,
      version: 2,
    },
  ];

  const jobs: MockJob[] = jobDefinitions.map((job, index) => ({
    id: job.id,
    reference: `JOB-${year}${String(301 + index)}`,
    title: job.title,
    department: job.department,
    location: job.location,
    employmentType: job.employmentType,
    openings: job.openings,
    hiringManagerId: e(job.manager),
    requisitionId: job.requisition,
    description: job.description,
    skills: job.skills,
    experienceMin: job.exp[0],
    experienceMax: job.exp[1],
    ctcMinPaise: job.ctc[0] * LAKH,
    ctcMaxPaise: job.ctc[1] * LAKH,
    state: job.state,
    publishToCareers: job.careers,
    openedOn: addDays(today, -job.openedAgo),
    closedOn: job.state === "filled" ? addDays(today, -15) : null,
    version: 2,
  }));

  let counter = 0;
  const candidates: MockCandidate[] = [];
  for (const [jobId, rows] of Object.entries(candidateRows)) {
    const job = jobs.find((item) => item.id === jobId);
    for (const [name, company, exp, notice, currentL, expectedL, source, referrer, stage, appliedAgo, stageAgo, rejection] of rows) {
      counter += 1;
      const [first = "", ...rest] = name.toLowerCase().split(" ");
      const appliedAt = ago(appliedAgo, "10:40");
      const stageChangedAt = ago(stageAgo, "15:20");
      const isAman = name === "Aman Tiwari";
      const events: MockCandidateEvent[] = [
        {
          id: `ce_${counter}_1`,
          at: appliedAt,
          actor: source === "careers" ? "Careers page" : referrer ? (employees.find((item) => item.id === e(referrer))?.name ?? "Employee") : "Meera Kapoor",
          title: source === "careers" ? "Applied on the careers page" : source === "referral" ? "Referred by an employee" : `Added from ${source === "walk_in" ? "a walk-in" : source === "agency" ? "an agency" : "LinkedIn"}`,
          detail: job?.title ?? null,
        },
      ];
      if (stage !== "applied")
        events.push({
          id: `ce_${counter}_2`,
          at: stageChangedAt,
          actor: "Meera Kapoor",
          title: stage === "rejected" ? "Rejected" : stage === "hired" ? "Converted to employee" : `Moved to ${stage}`,
          detail: rejection,
        });
      const consentAt = appliedAt;
      candidates.push({
        id: `cand_${String(counter).padStart(3, "0")}`,
        reference: `CN-${year}${String(1100 + counter)}`,
        jobId,
        name,
        email: `${first}.${rest.at(-1) ?? "candidate"}@mail.example`,
        phone: `+91 9${String(8100 + counter * 37).slice(-4)} ${String(40000 + counter * 713).slice(-5)}`,
        currentCompany: company,
        experienceTenths: exp,
        noticePeriodDays: notice,
        currentCtcPaise: Math.round(currentL * LAKH),
        expectedCtcPaise: Math.round(expectedL * LAKH),
        source,
        referrerId: referrer ? e(referrer) : null,
        stage,
        appliedAt,
        stageChangedAt,
        hiredAt: stage === "hired" ? stageChangedAt : null,
        rejectionReason: rejection,
        resume: { name: `${name.replace(/\s+/g, "_")}_Resume.pdf`, sizeBytes: 120_000 + counter * 4_321, mime: resumeMime },
        consentAt,
        retainUntil: addDays(today, 365 - appliedAgo),
        erasedAt: null,
        employeeId: isAman && aman ? aman.id : null,
        duplicateOf: null,
        notes:
          stage === "offer" || stage === "interview"
            ? [{ id: `cn_${counter}`, authorId: e(35), body: "Strong fundamentals in the screening call. Comfortable with hybrid schedule.", at: ago(Math.max(stageAgo, 1), "12:30") }]
            : [],
        events,
        version: 2,
      });
    }
  }
  const byName = (name: string) => candidates.find((candidate) => candidate.name === name)?.id ?? "";
  // Aman's history is anchored to his real joining date so the hire stays consistent.
  const amanCandidate = candidates.find((candidate) => candidate.name === "Aman Tiwari");
  if (amanCandidate && aman) {
    amanCandidate.appliedAt = zonedInstant(addDays(aman.joinedOn, -45), "10:40");
    amanCandidate.consentAt = amanCandidate.appliedAt;
    amanCandidate.hiredAt = zonedInstant(addDays(aman.joinedOn, -14), "17:00");
    amanCandidate.stageChangedAt = amanCandidate.hiredAt;
    amanCandidate.events = amanCandidate.events.map((event, index) => ({ ...event, at: index === 0 ? amanCandidate.appliedAt : (amanCandidate.hiredAt ?? event.at) }));
  }

  const card = (panelistId: string, ratings: number[], recommendation: Recommendation, comments: string, daysAgo: number): MockScorecard => ({
    panelistId,
    ratings: { skills: ratings[0] ?? 3, problem_solving: ratings[1] ?? 3, communication: ratings[2] ?? 3, ownership: ratings[3] ?? 3, culture: ratings[4] ?? 3 },
    recommendation,
    comments,
    submittedAt: ago(daysAgo, "18:10"),
  });
  const interview = (
    id: string,
    candidateName: string,
    jobId: string,
    round: number,
    type: InterviewType,
    scheduledAt: string,
    mode: InterviewMode,
    panel: number[],
    state: InterviewState,
    scorecards: MockScorecard[] = [],
  ): MockInterview => ({
    id,
    candidateId: byName(candidateName),
    jobId,
    round,
    type,
    scheduledAt,
    durationMinutes: type === "technical" ? 60 : 45,
    mode,
    locationOrLink: mode === "online" ? "https://meet.gtf-hr.example/rec-" + id.replace("iv_", "") : "Noida HQ · Meeting room Neem (3F)",
    panelIds: panel.map(e),
    state,
    scorecards,
    createdBy: e(5),
    createdAt: ago(12),
  });

  const interviews: MockInterview[] = [
    interview("iv_1", "Ritika Sen", "job_1", 1, "technical", at(-12, "11:00"), "online", [14, 17], "completed", [
      card(e(14), [5, 4, 4, 5, 4], "strong_yes", "Excellent React architecture answers; clean take-home with tests.", 12),
      card(e(17), [4, 4, 4, 4, 4], "yes", "Good grasp of CI and performance budgets.", 12),
    ]),
    interview("iv_2", "Ritika Sen", "job_1", 2, "hr", at(-8, "15:00"), "in_person", [5], "completed", [card(e(5), [4, 4, 5, 4, 5], "strong_yes", "Clear motivation, notice period 30 days, aligned on hybrid.", 8)]),
    interview("iv_3", "Aarav Khanna", "job_1", 1, "technical", at(-6, "12:00"), "online", [14, 13], "completed", [
      card(e(14), [4, 3, 4, 4, 4], "yes", "Solid on TypeScript; state management answers were average.", 6),
      card(e(13), [4, 4, 3, 4, 4], "yes", "Would be a good fit for the second squad.", 6),
    ]),
    interview("iv_4", "Aarav Khanna", "job_1", 2, "hr", at(1, "11:00"), "in_person", [5], "scheduled"),
    interview("iv_5", "Nandini Rao", "job_1", 1, "technical", at(0, "15:00"), "online", [14, 13], "scheduled"),
    interview("iv_6", "Vivek Chauhan", "job_1", 1, "culture", at(3, "16:00"), "online", [5, 13], "scheduled"),
    interview("iv_7", "Sneha Agarwal", "job_3", 1, "technical", at(-1, "11:00"), "in_person", [3, 38], "scheduled", [
      card(e(38), [4, 4, 4, 3, 4], "yes", "Knows GST reconciliation well; Tally speed is good.", 1),
    ]),
    interview("iv_8", "Mohit Goyal", "job_3", 1, "technical", at(0, "16:30"), "online", [3], "scheduled"),
    interview("iv_9", "Kavita Rawat", "job_3", 1, "hr", at(2, "12:00"), "in_person", [3, 5], "scheduled"),
    interview("iv_10", "Aditi Bhatnagar", "job_2", 1, "technical", at(-9, "14:00"), "online", [20, 21], "completed", [
      card(e(20), [5, 5, 4, 5, 4], "strong_yes", "Best attribution answers we've heard; strong team lead.", 9),
      card(e(21), [4, 5, 4, 4, 4], "yes", "Great channel depth.", 9),
    ]),
    interview("iv_11", "Rajiv Malhotra", "job_2", 1, "technical", at(-4, "15:30"), "online", [20, 21], "completed", [
      card(e(20), [3, 3, 4, 3, 3], "no", "Relies on agencies for execution; limited hands-on.", 4),
      card(e(21), [4, 3, 3, 3, 3], "yes", "Good planning skills.", 4),
    ]),
    interview("iv_12", "Shruti Kapoor", "job_2", 1, "technical", at(4, "11:30"), "online", [20, 5], "scheduled"),
  ];

  const offers: MockOffer[] = [
    {
      id: "of_1",
      reference: `OF-${year}0401`,
      candidateId: byName("Ritika Sen"),
      jobId: "job_1",
      ctcPaise: 27 * LAKH,
      joiningDate: addDays(today, 21),
      designation: "Senior Frontend Engineer",
      department: "Engineering",
      location: "Gurugram",
      managerId: e(13),
      state: "accepted",
      overBudget: false,
      createdBy: e(5),
      createdAt: ago(6, "11:00"),
      approverId: null,
      approvedAt: null,
      approvalNote: null,
      respondedAt: ago(4, "18:30"),
      responseNote: "Accepted by email; resignation submitted to current employer.",
      employeeId: null,
      version: 3,
    },
    {
      id: "of_2",
      reference: `OF-${year}0405`,
      candidateId: byName("Aditi Bhatnagar"),
      jobId: "job_2",
      ctcPaise: 21 * LAKH,
      joiningDate: addDays(today, 45),
      designation: "Performance Marketing Manager",
      department: "Performance Marketing",
      location: "Mumbai",
      managerId: e(20),
      state: "extended",
      overBudget: true,
      createdBy: e(5),
      createdAt: ago(3, "12:15"),
      approverId: e(3),
      approvedAt: ago(2, "10:05"),
      approvalNote: "Approved ₹1 L above band given the team-lead scope.",
      respondedAt: null,
      responseNote: null,
      employeeId: null,
      version: 2,
    },
  ];
  const amanRecord = candidates.find((candidate) => candidate.name === "Aman Tiwari");
  if (amanRecord && aman)
    offers.push({
      id: "of_3",
      reference: `OF-${year}0388`,
      candidateId: amanRecord.id,
      jobId: "job_5",
      ctcPaise: Math.round(aman.annualCtc * 100),
      joiningDate: aman.joinedOn,
      designation: aman.designation,
      department: aman.department,
      location: aman.location,
      managerId: aman.managerId ?? e(30),
      state: "accepted",
      overBudget: false,
      createdBy: e(5),
      createdAt: zonedInstant(addDays(aman.joinedOn, -20), "11:00"),
      approverId: null,
      approvedAt: null,
      approvalNote: null,
      respondedAt: zonedInstant(addDays(aman.joinedOn, -16), "18:00"),
      responseNote: null,
      employeeId: aman.id,
      version: 4,
    });

  // A lapsed talent-pool consent: eligible for erasure.
  const lapsed = candidates.find((candidate) => candidate.name === "Sakshi Tyagi");
  if (lapsed) lapsed.retainUntil = addDays(today, -5);

  return {
    recruitmentRequisitions: requisitions,
    recruitmentJobs: jobs,
    recruitmentCandidates: candidates,
    recruitmentInterviews: interviews,
    recruitmentOffers: offers,
  };
}
