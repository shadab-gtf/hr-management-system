import "server-only";
import { addDays, zonedInstant } from "@/lib/utils/date";
import { seeded, seededInt } from "@/lib/mocks/seed/random";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import type { CompanyValue, PraiseBadge, ReactionKind, SurveyQuestionKind } from "@/types/engage";

/* Synthetic polls, surveys, praise. Relative to the business date. */

export interface MockPoll {
  id: string;
  question: string;
  options: { id: string; label: string }[];
  multiple: boolean;
  anonymous: boolean;
  department: string | null;
  authorId: string;
  createdAt: string;
  closesAt: string;
  closedAt: string | null;
  /** employeeId → chosen option ids; latest vote replaces the earlier one. */
  votes: Record<string, { optionIds: string[]; at: string }>;
}

export interface MockSurveyQuestion {
  id: string;
  kind: SurveyQuestionKind;
  prompt: string;
  required: boolean;
  options: string[];
}

export interface MockSurveyResponse {
  id: string;
  /** null for anonymous surveys: the answers are never linked to a person. */
  employeeId: string | null;
  department: string;
  submittedAt: string;
  answers: Record<string, number | string | string[]>;
}

export interface MockSurvey {
  id: string;
  title: string;
  description: string;
  questions: MockSurveyQuestion[];
  department: string | null;
  opensOn: string;
  closesOn: string;
  anonymous: boolean;
  minResponses: number;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
  closedAt: string | null;
  /** Who has responded (for the one-response rule), kept apart from answers. */
  respondentIds: string[];
  responses: MockSurveyResponse[];
  audit: { at: string; actor: string; event: string }[];
  version: number;
}

export interface MockPraise {
  id: string;
  giverId: string;
  recipientIds: string[];
  badge: PraiseBadge;
  value: CompanyValue;
  message: string;
  createdAt: string;
  reactions: Record<ReactionKind, string[]>;
  comments: { id: string; authorId: string; body: string; createdAt: string }[];
}

export interface EngagePlusState {
  engagePolls: MockPoll[];
  engageSurveys: MockSurvey[];
  engagePraise: MockPraise[];
}

const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;
const noReactions = (): Record<ReactionKind, string[]> => ({ like: [], celebrate: [], support: [], insightful: [] });

function pickVotes(pollId: string, voters: number[], optionIds: string[], multiple: boolean, weights: number[], ago: (days: number, time?: string) => string) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const votes: MockPoll["votes"] = {};
  voters.forEach((voter, index) => {
    const roll = seeded(pollId, voter) * total;
    let cursor = 0;
    let chosen = optionIds[0] ?? "";
    for (const [i, weight] of weights.entries()) {
      cursor += weight;
      if (roll < cursor) {
        chosen = optionIds[i] ?? chosen;
        break;
      }
    }
    const extra = multiple && seeded(pollId, voter, "second") > 0.5 ? optionIds[(optionIds.indexOf(chosen) + 1) % optionIds.length] : undefined;
    votes[e(voter)] = { optionIds: extra && extra !== chosen ? [chosen, extra] : [chosen], at: ago(index % 3, `1${index % 8}:0${index % 6}`) };
  });
  return votes;
}

function polls(today: string, ago: (days: number, time?: string) => string): MockPoll[] {
  const options = (pollId: string, labels: string[]) => labels.map((label, index) => ({ id: `${pollId}_o${index + 1}`, label }));
  const offsite = options("pl_1", ["Rishikesh riverside camp", "Jaipur heritage stay", "Neemrana Fort Palace", "Stay in Noida — team dinner"]);
  const learning = options("pl_2", ["Figma advanced prototyping", "AI tools for everyday work", "Negotiation for client meetings", "Personal finance & tax planning", "Public speaking"]);
  const crit = options("pl_3", ["Weekly 45-minute crit", "Fortnightly deep-dive", "Async crit in Figma comments"]);
  const lunch = options("pl_4", ["South Indian", "North Indian thali", "Pan-Asian", "Healthy bowls"]);
  return [
    {
      id: "pl_1",
      question: "Where should we hold the Diwali team offsite?",
      options: offsite,
      multiple: false,
      anonymous: false,
      department: null,
      authorId: e(5),
      createdAt: ago(2, "11:20"),
      closesAt: zonedInstant(addDays(today, 5), "23:59"),
      closedAt: null,
      votes: pickVotes("pl_1", [2, 3, 4, 6, 9, 10, 12, 13, 14, 15, 16, 20, 21, 25, 30, 31, 35, 36], offsite.map((o) => o.id), false, [5, 4, 6, 2], ago),
    },
    {
      id: "pl_2",
      question: "Which learning sessions do you want in October? Pick all that interest you.",
      options: learning,
      multiple: true,
      anonymous: true,
      department: null,
      authorId: e(35),
      createdAt: ago(4, "09:45"),
      closesAt: zonedInstant(addDays(today, 9), "23:59"),
      closedAt: null,
      votes: {
        ...pickVotes("pl_2", [5, 6, 9, 13, 14, 17, 19, 21, 22, 24, 26, 27, 33, 38, 39, 40], learning.map((o) => o.id), true, [3, 6, 2, 4, 2], ago),
        [e(7)]: { optionIds: ["pl_2_o1", "pl_2_o2"], at: ago(3, "12:05") },
      },
    },
    {
      id: "pl_3",
      question: "What design crit format should we try next quarter?",
      options: crit,
      multiple: false,
      anonymous: false,
      department: "Design",
      authorId: e(6),
      createdAt: ago(1, "16:10"),
      closesAt: zonedInstant(addDays(today, 3), "18:00"),
      closedAt: null,
      votes: pickVotes("pl_3", [9, 10, 12], crit.map((o) => o.id), false, [2, 3, 1], ago),
    },
    {
      id: "pl_4",
      question: "Friday team lunch — which cuisine?",
      options: lunch,
      multiple: false,
      anonymous: true,
      department: null,
      authorId: e(37),
      createdAt: ago(9, "10:30"),
      closesAt: zonedInstant(addDays(today, -3), "17:00"),
      closedAt: null,
      votes: pickVotes("pl_4", [2, 4, 5, 6, 7, 9, 10, 13, 14, 15, 17, 19, 21, 22, 26, 30, 31, 33, 35, 36, 37, 38], lunch.map((o) => o.id), false, [7, 4, 5, 3], ago),
    },
  ];
}

function surveys(today: string, ago: (days: number, time?: string) => string, employees: SeedEmployee[]): MockSurvey[] {
  const pulseQuestions: MockSurveyQuestion[] = [
    { id: "sq_1", kind: "rating", prompt: "Overall, how would you rate your experience at GTF this quarter?", required: true, options: [] },
    { id: "sq_2", kind: "enps", prompt: "How likely are you to recommend GTF as a place to work to a friend?", required: true, options: [] },
    { id: "sq_3", kind: "single", prompt: "How manageable is your current workload?", required: true, options: ["Very manageable", "Manageable", "Stretched", "Unsustainable"] },
    { id: "sq_4", kind: "multiple", prompt: "What would most improve your week?", required: false, options: ["Fewer meetings", "Clearer priorities", "Better tools", "More learning time", "Flexible hours"] },
    { id: "sq_5", kind: "rating", prompt: "How supported do you feel by your manager?", required: true, options: [] },
    { id: "sq_6", kind: "text", prompt: "Anything else you would like leadership to hear?", required: false, options: [] },
  ];
  const comments = [
    "Client timelines have been tight since the festive campaigns started — more buffer in estimates would help.",
    "Loving the new design crit rhythm. Please keep the Friday no-meeting afternoons.",
    "Laptop refresh for the engineering team is overdue; builds are slow.",
    "Would like clearer growth paths for senior ICs.",
    "The hybrid policy works well for me. Commute days could be better coordinated per team.",
  ];
  const respondents = [14, 15, 16, 17, 19, 39, 40, 9, 10, 12, 21, 22];
  const responses: MockSurveyResponse[] = respondents.map((n, index) => {
    const employee = employees.find((item) => item.id === e(n));
    const r = (key: string) => seeded("sv_1", n, key);
    const answers: MockSurveyResponse["answers"] = {
      sq_1: 3 + Math.floor(r("q1") * 3 * 0.99),
      sq_2: [10, 9, 8, 7, 9, 6, 10, 8, 9, 5, 9, 7][index] ?? 8,
      sq_3: pulseQuestions[2]?.options[Math.min(3, Math.floor(r("q3") * 3.4))] ?? "Manageable",
      sq_5: 3 + Math.floor(r("q5") * 3 * 0.99),
    };
    const improve = pulseQuestions[3]?.options.filter((_, i) => r(`q4-${i}`) > 0.62) ?? [];
    if (improve.length) answers.sq_4 = improve;
    const comment = index % 2 === 0 ? comments[index / 2] : undefined;
    if (comment) answers.sq_6 = comment;
    return { id: `sr_${index + 1}`, employeeId: null, department: employee?.department ?? "Unknown", submittedAt: ago(8 - (index % 8), `1${index % 9}:2${index % 6}`), answers };
  });
  return [
    {
      id: "sv_1",
      title: "Quarterly pulse check — Q3",
      description: "Six quick questions on how work feels right now. Takes about 3 minutes. Results are shared company-wide in aggregate.",
      questions: pulseQuestions,
      department: null,
      opensOn: addDays(today, -10),
      closesOn: addDays(today, 7),
      anonymous: true,
      minResponses: 5,
      createdBy: e(5),
      createdAt: ago(13, "15:00"),
      publishedAt: ago(10, "09:30"),
      closedAt: null,
      respondentIds: respondents.map(e),
      responses,
      audit: [
        { at: ago(13, "15:00"), actor: "Meera Kapoor", event: "Survey created as draft" },
        { at: ago(12, "11:40"), actor: "Meera Kapoor", event: "6 questions added" },
        { at: ago(10, "09:30"), actor: "Meera Kapoor", event: "Published to all employees (anonymous, minimum 5 responses)" },
      ],
      version: 3,
    },
    {
      id: "sv_2",
      title: "Hybrid work experience",
      description: "Help us shape office days and collaboration rituals for the next half-year.",
      questions: [
        { id: "sq_7", kind: "single", prompt: "How many office days per week work best for you?", required: true, options: ["1 day", "2 days", "3 days", "4+ days"] },
        { id: "sq_8", kind: "rating", prompt: "How productive are your office days?", required: true, options: [] },
      ],
      department: null,
      opensOn: addDays(today, 3),
      closesOn: addDays(today, 17),
      anonymous: true,
      minResponses: 5,
      createdBy: e(5),
      createdAt: ago(1, "17:05"),
      publishedAt: null,
      closedAt: null,
      respondentIds: [],
      responses: [],
      audit: [{ at: ago(1, "17:05"), actor: "Meera Kapoor", event: "Survey created as draft" }],
      version: 1,
    },
  ];
}

type PraiseRow = [giver: number, recipients: number[], badge: PraiseBadge, value: CompanyValue, message: string, daysAgo: number];

const praiseRows: PraiseRow[] = [
  [6, [7], "above_beyond", "craft_with_care", "Aanya rebuilt the Tata Capital onboarding flows over a weekend when the client moved the review up. The prototype was flawless.", 1],
  [14, [15, 17], "team_player", "win_together", "Aditya and Karan stayed on the release bridge till 2 AM so the payments hotfix went out clean. Thank you both!", 1],
  [30, [31], "client_hero", "client_first", "Nisha turned a tense escalation with Godrej into a signed extension. Calm, clear and completely on top of it.", 2],
  [5, [35], "above_beyond", "own_the_outcome", "Shreya closed 9 campus offers in one week and still personally called every candidate who didn’t make it.", 2],
  [20, [21, 41], "innovator", "stay_curious", "Rahul and Bhavna’s new bid-shading experiment cut our CPL by 18% on the real-estate launch.", 3],
  [13, [16], "mentor", "win_together", "Riya ran three test-automation clinics for the new joiners. Everyone now writes Playwright specs first.", 3],
  [7, [9], "team_player", "win_together", "Ishita jumped in on the icon set when I was out sick — picked up exactly where I left off.", 4],
  [25, [27, 28], "client_hero", "client_first", "Kavya and Aisha’s campaign narrative won the pitch. The client quoted our tagline back to us.", 5],
  [2, [30], "above_beyond", "own_the_outcome", "Varun personally handled the quarterly business reviews for all five key accounts this month.", 5],
  [17, [42], "team_player", "win_together", "Tushar migrated every laptop to the new MDM with zero downtime. Legend.", 6],
  [6, [10, 12], "innovator", "craft_with_care", "Kabir and Dev’s motion system made the brand refresh feel alive. The client loved the micro-interactions.", 7],
  [36, [37], "team_player", "win_together", "Zoya organised the Ganesh Chaturthi celebration end to end — decor, food and the prasad counter.", 8],
  [3, [38], "above_beyond", "own_the_outcome", "Lakshmi reconciled six months of vendor payments ahead of the audit. Spotless.", 8],
  [14, [19], "mentor", "stay_curious", "Harsh paired with the interns every afternoon this sprint. Patient, generous teaching.", 9],
  [31, [32, 33], "client_hero", "client_first", "Gaurav and Divya handled a same-day scope change for the Mumbai launch without missing a beat.", 10],
  [9, [7], "mentor", "craft_with_care", "Aanya’s portfolio reviews for the design interns were the most useful hour of my month.", 11],
  [13, [14, 15, 39], "team_player", "win_together", "The platform squad shipped the new dashboard two days early. Brilliant collaboration.", 12],
  [21, [23], "innovator", "stay_curious", "Yash built a Looker Studio template that saves the team two hours every Monday.", 13],
  [5, [36], "team_player", "own_the_outcome", "Manish processed every onboarding kit for the September batch on time, including the remote joiners.", 14],
  [40, [17], "above_beyond", "own_the_outcome", "Karan recovered the analytics warehouse after the provider outage before anyone noticed.", 15],
  [26, [29], "innovator", "craft_with_care", "Rajat’s one-take product film got 2 lakh organic views. Stunning edit.", 16],
  [12, [11], "mentor", "stay_curious", "Tanvi’s research playbook is now how the whole design team runs interviews.", 18],
  [20, [24], "client_hero", "client_first", "Ananya’s live-tweeting of the client’s product launch trended in Mumbai. Huge.", 20],
  [15, [16], "team_player", "win_together", "Riya found the race condition that had haunted checkout for weeks.", 22],
  [33, [31], "client_hero", "client_first", "Nisha’s weekly client digest has become the gold standard for account updates.", 25],
  [6, [7, 9], "client_hero", "client_first", "Aanya and Ishita presented the HDFC design audit to the CXO team — crisp and confident.", 28],
  [35, [5], "mentor", "win_together", "Meera coached me through my first salary negotiation with a candidate. Thank you!", 31],
  [19, [14], "mentor", "craft_with_care", "Sneha’s code reviews make everyone better. Thorough, kind and fast.", 34],
  [22, [21], "team_player", "win_together", "Rahul covered my client calls during my exam week without being asked.", 38],
  [10, [6], "above_beyond", "own_the_outcome", "Rohan fought for the extra week on the Godrej site so we could do it properly.", 42],
];

function praise(ago: (days: number, time?: string) => string, employees: SeedEmployee[]): MockPraise[] {
  const active = employees.filter((employee) => employee.status !== "exited").map((employee) => employee.id);
  return praiseRows.map(([giver, recipients, badge, value, message, daysAgo], index) => {
    const reactions = noReactions();
    const likes = seededInt(1, 7, "praise", index);
    for (let i = 0; i < likes; i += 1) {
      const person = active[seededInt(0, active.length - 1, "praise-like", index, i)];
      const kind: ReactionKind = i % 3 === 0 ? "celebrate" : "like";
      if (person && !reactions[kind].includes(person) && person !== e(7)) reactions[kind].push(person);
    }
    return {
      id: `pr_${index + 1}`,
      giverId: e(giver),
      recipientIds: recipients.map(e),
      badge,
      value,
      message,
      createdAt: ago(daysAgo, `${10 + (index % 8)}:${String((index * 7) % 60).padStart(2, "0")}`),
      reactions,
      comments: index === 0 ? [{ id: "prc_1", authorId: e(9), body: "Totally deserved! 👏", createdAt: ago(1, "18:40") }] : [],
    };
  });
}

export function createEngagePlusState(today: string, ago: (days: number, time?: string) => string, employees: SeedEmployee[]): EngagePlusState {
  return {
    engagePolls: polls(today, ago),
    engageSurveys: surveys(today, ago, employees),
    engagePraise: praise(ago, employees),
  };
}
