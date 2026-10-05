import "server-only";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { seededInt } from "@/lib/mocks/seed/random";
import { addDays, diffDays, monthOf, weekday, zonedInstant } from "@/lib/utils/date";
import type { LedgerKind } from "@/types/leave";

/*
 * Synthetic leave and attendance extensions: leave ledger, comp-off,
 * encashment, year-end processing and the shift roster. Everything is relative
 * to the business date; values are illustrative, not GTF policy.
 */

export interface MockLedgerEntry {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  date: string;
  kind: LedgerKind;
  /** Signed half-day units. */
  halves: number;
  note: string;
  by: string | null;
  reference: string | null;
}

export type TimeRequestState = "pending" | "approved" | "rejected" | "cancelled";

export interface MockCompOffClaim {
  id: string;
  reference: string;
  employeeId: string;
  workedDate: string;
  portion: "full" | "half";
  workedMinutes: number;
  reason: string;
  state: TimeRequestState;
  approverId: string | null;
  submittedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  expiresOn: string | null;
  version: number;
}

export interface MockEncashment {
  id: string;
  reference: string;
  employeeId: string;
  leaveTypeId: string;
  halves: number;
  perDayPaise: number;
  amountPaise: number;
  payrollMonth: string;
  source: "request" | "year_end";
  reason: string;
  state: TimeRequestState;
  submittedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  version: number;
}

export interface MockYearEndRow {
  employeeId: string;
  leaveTypeId: string;
  closing: number;
  carry: number;
  encash: number;
  encashPaise: number;
  lapse: number;
}
export interface MockYearEndRun {
  year: string;
  at: string;
  by: string;
  rows: MockYearEndRow[];
  totals: { carry: number; encash: number; lapse: number; rows: number };
}

export interface MockTimeAudit {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

/** Seven cells Monday → Sunday: shift id, "off" or null (department default). */
export type RosterCells = Record<string, (string | null)[]>;
export interface MockRosterWeek {
  department: string;
  /** Monday. */
  weekStart: string;
  draft: RosterCells;
  published: RosterCells | null;
  publishedAt: string | null;
  publishedBy: string | null;
  updatedAt: string;
  version: number;
}

export interface MockWeeklyOff {
  /** 0 = Sunday … 6 = Saturday; always off. */
  offWeekdays: number[];
  /** When Saturday is a working day: 2nd and 4th Saturdays are off. */
  alternateSaturdays: boolean;
}

export interface MockShiftSwap {
  id: string;
  reference: string;
  requesterId: string;
  colleagueId: string;
  date: string;
  requesterShift: string;
  colleagueShift: string;
  reason: string;
  state: TimeRequestState;
  submittedAt: string;
  decidedBy: string | null;
  decisionNote: string | null;
  version: number;
}

export interface TimeState {
  leaveLedgerEntries: MockLedgerEntry[];
  compOffClaims: MockCompOffClaim[];
  leaveEncashments: MockEncashment[];
  leaveYearEndRuns: MockYearEndRun[];
  timeAudit: MockTimeAudit[];
  /** Synthetic gender used only for leave applicability (maternity/paternity). */
  timeGender: Record<string, "female" | "male">;
  /** Week-off / holiday punches from the face device, keyed "employeeId|date". */
  timeOffDayPunches: Map<string, { in: string; out: string }>;
  rosterWeeks: MockRosterWeek[];
  rosterWeeklyOffs: Record<string, MockWeeklyOff>;
  rosterSwaps: MockShiftSwap[];
}

const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;

const female = new Set(["Aanya", "Sunita", "Priya", "Meera", "Ishita", "Tanvi", "Sneha", "Riya", "Neha", "Pooja", "Simran", "Ananya", "Kavya", "Aisha", "Nisha", "Divya", "Shreya", "Zoya", "Lakshmi", "Payal", "Bhavna", "Ritika"]);

/** Basic = 40% of (monthly CTC − employer PF), as the synthetic payroll engine does. */
export function basicMonthlyPaise(employee: Pick<SeedEmployee, "annualCtc" | "type">): number {
  const monthly = (employee.annualCtc * 100) / 12;
  const employerPf = employee.type === "intern" ? 0 : 180_000;
  return Math.round(((monthly - employerPf) * 0.4) / 100) * 100;
}
/** Encashment per day = basic ÷ 26 (synthetic rule; Finance confirms the real divisor). */
export function encashPerDayPaise(employee: Pick<SeedEmployee, "annualCtc" | "type">): number {
  return Math.round(basicMonthlyPaise(employee) / 26);
}

export function mondayOf(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

export function createTimeState(today: string, ago: (days: number, time?: string) => string, employees: SeedEmployee[]): TimeState {
  const year = today.slice(0, 4);
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  // Most recent Saturday strictly before today, then earlier Saturdays.
  const lastSat = addDays(today, -(((weekday(today) + 1) % 7) || 7));
  const sat = (n: number) => addDays(lastSat, -7 * n);
  const at = (date: string, time = "10:30") => zonedInstant(date, time);
  const daysAgo = (date: string) => diffDays(date, today);

  /* Face-device punches on week-offs (evidence for comp-off). */
  const punches = new Map<string, { in: string; out: string }>([
    [`${e(7)}|${lastSat}`, { in: "10:02", out: "19:05" }],
    [`${e(7)}|${sat(5)}`, { in: "10:15", out: "19:00" }],
    [`${e(7)}|${sat(10)}`, { in: "09:50", out: "18:40" }],
    [`${e(35)}|${sat(1)}`, { in: "09:30", out: "18:10" }],
    [`${e(9)}|${sat(2)}`, { in: "10:00", out: "18:30" }],
    [`${e(19)}|${sat(1)}`, { in: "11:00", out: "20:30" }],
    [`${e(36)}|${sat(3)}`, { in: "10:00", out: "13:30" }],
  ]);
  const sunday = addDays(lastSat, 1);
  if (sunday < today) punches.set(`${e(7)}|${sunday}`, { in: "11:00", out: "16:10" });

  const claim = (n: number, employee: number, workedDate: string, portion: "full" | "half", minutes: number, reason: string, state: TimeRequestState, approver: number, note: string | null = null): MockCompOffClaim => {
    const submittedDaysAgo = Math.max(daysAgo(workedDate) - 1, 0);
    return {
      id: `co_${n}`,
      reference: `CO-${year.slice(2)}${String(6100 + n)}`,
      employeeId: e(employee),
      workedDate,
      portion,
      workedMinutes: minutes,
      reason,
      state,
      approverId: e(approver),
      submittedAt: ago(submittedDaysAgo, "11:20"),
      decidedAt: state === "pending" ? null : ago(Math.max(submittedDaysAgo - 1, 0), "17:05"),
      decisionNote: note,
      expiresOn: state === "approved" ? addDays(workedDate, 60) : null,
      version: state === "pending" ? 1 : 2,
    };
  };
  const compOffClaims: MockCompOffClaim[] = [
    claim(1, 7, sat(10), "full", 530, "Brand refresh launch — final asset handoff over the weekend", "approved", 6, "Thanks for covering the launch."),
    claim(2, 7, sat(5), "full", 525, "Client pitch deck for Tata Cliq — Saturday review", "approved", 6),
    claim(3, 35, sat(1), "full", 520, "Campus hiring drive at Amity University, Noida", "pending", 5),
    claim(4, 9, sat(2), "full", 510, "On-site photo shoot for the festive campaign", "pending", 6),
    claim(5, 19, sat(1), "full", 570, "Weekend production release v4.2 and smoke tests", "pending", 13),
    claim(6, 36, sat(3), "half", 210, "Documentation catch-up", "rejected", 5, "Only 3 h 30 m logged — half a day needs at least 4 h."),
  ];

  /* Ledger: carried-forward openings, manual adjustments. Accruals and availed rows are derived. */
  const leaveLedgerEntries: MockLedgerEntry[] = [];
  let ledgerN = 0;
  const entry = (employeeId: string, leaveTypeId: string, date: string, kind: LedgerKind, halves: number, note: string, by: string | null, reference: string | null = null) =>
    leaveLedgerEntries.push({ id: `lg_${(ledgerN += 1)}`, employeeId, leaveTypeId, date, kind, halves, note, by, reference });
  for (const employee of employees) {
    if (employee.status === "exited" || employee.type !== "full_time" || employee.joinedOn >= `${year}-01-01`) continue;
    const halves = employee.id === e(7) ? 16 : seededInt(0, 30, employee.id, year, "el-open");
    if (halves > 0) entry(employee.id, "lt_el", `${year}-01-01`, "carry_forward", halves, `Carried forward from ${Number(year) - 1} (capped at 15 days)`, "Year-end run", `YE-${Number(year) - 1}`);
  }
  entry(e(7), "lt_el", addDays(today, -95), "adjustment", 2, "Credit for representing GTF at India Design Week (approved by Rohan Verma)", "Meera Kapoor", "ADJ-2604");
  entry(e(12), "lt_cl", addDays(today, -60), "adjustment", 2, "Election duty day (state notification)", "Meera Kapoor", "ADJ-2611");
  entry(e(19), "lt_sl", addDays(today, -150), "adjustment", -2, "Correction: duplicate sick-leave credit from migration", "Meera Kapoor", "ADJ-2587");

  /* Encashment requests. */
  const encash = (n: number, employee: number, days: number, submittedDaysAgo: number, state: TimeRequestState, reason: string, note: string | null = null): MockEncashment => {
    const person = byId.get(e(employee));
    const perDay = person ? encashPerDayPaise(person) : 0;
    const decided = state === "pending" ? null : ago(Math.max(submittedDaysAgo - 2, 0), "15:10");
    return {
      id: `en_${n}`,
      reference: `EN-${year.slice(2)}${String(7200 + n)}`,
      employeeId: e(employee),
      leaveTypeId: "lt_el",
      halves: days * 2,
      perDayPaise: perDay,
      amountPaise: perDay * days,
      payrollMonth: monthOf(addDays(today, state === "pending" ? (Number(today.slice(8)) > 20 ? 15 : 0) : -submittedDaysAgo + 5)),
      source: "request",
      reason,
      state,
      submittedAt: ago(submittedDaysAgo, "12:40"),
      decidedBy: state === "pending" ? null : "Meera Kapoor",
      decidedAt: decided,
      decisionNote: note,
      version: state === "pending" ? 1 : 2,
    };
  };
  const leaveEncashments: MockEncashment[] = [
    encash(1, 7, 2, 120, "approved", "Home renovation expenses"),
    encash(2, 14, 5, 3, "pending", "Tuition fee for my daughter's school term"),
    encash(3, 21, 4, 40, "rejected", "Personal", "Balance after encashment would fall below the 5 days you must retain."),
    encash(4, 17, 3, 1, "pending", "Medical bills"),
  ];

  /* Shift roster: Design published (last, this and next week); Engineering has an unpublished draft. */
  const week0 = mondayOf(today);
  const cellsFor = (members: string[], build: (id: string, index: number) => (string | null)[]) =>
    Object.fromEntries(members.map((id, index) => [id, build(id, index)]));
  const design = employees.filter((person) => person.department === "Design" && person.status !== "exited").map((person) => person.id);
  const engineering = employees.filter((person) => person.department === "Engineering" && person.status !== "exited").map((person) => person.id);
  const weekday5 = (shift: string | null) => [shift, shift, shift, shift, shift, "off", "off"];
  const designWeek = (offset: number) =>
    cellsFor(design, (id, index) => {
      if (id === e(6) || id === e(7)) return [null, null, null, null, null, null, null];
      if (id === e(10)) return offset === 0 ? ["sh_general", "off", "sh_general", "sh_general", "sh_general", "sh_general", "off"] : weekday5("sh_early");
      const early = (index + offset) % 2 === 0;
      return weekday5(early ? "sh_early" : "sh_general");
    });
  const rosterWeeks: MockRosterWeek[] = [-1, 0, 1].map((offset) => {
    const cells = designWeek(offset);
    return {
      department: "Design",
      weekStart: addDays(week0, 7 * offset),
      draft: structuredClone(cells),
      published: cells,
      publishedAt: at(addDays(week0, 7 * offset - 3), "17:45"),
      publishedBy: "Rohan Verma",
      updatedAt: at(addDays(week0, 7 * offset - 3), "17:45"),
      version: 2,
    };
  });
  rosterWeeks.push({
    department: "Engineering",
    weekStart: addDays(week0, 7),
    draft: cellsFor(engineering, (id, index) => (id === e(13) ? [null, null, null, null, null, null, null] : weekday5(index % 3 === 0 ? "sh_general" : "sh_early"))),
    published: null,
    publishedAt: null,
    publishedBy: null,
    updatedAt: ago(1, "18:20"),
    version: 1,
  });

  const nextWed = addDays(week0, 9);
  const rosterSwaps: MockShiftSwap[] = [
    { id: "sw_1", reference: `SW-${year.slice(2)}8101`, requesterId: e(9), colleagueId: e(10), date: nextWed, requesterShift: "General shift", colleagueShift: "Early shift", reason: "Dentist appointment in the morning", state: "pending", submittedAt: ago(1, "09:40"), decidedBy: null, decisionNote: null, version: 1 },
  ];

  return {
    leaveLedgerEntries,
    compOffClaims,
    leaveEncashments,
    leaveYearEndRuns: [
      {
        year: String(Number(year) - 1),
        at: at(`${year}-01-02`, "11:15"),
        by: "Meera Kapoor",
        rows: [],
        totals: { carry: 412, encash: 96, lapse: 238, rows: 78 },
      },
    ],
    timeAudit: [
      { id: "ta_1", at: at(`${year}-01-02`, "11:15"), actor: "Meera Kapoor", action: "Year-end processed", detail: `${Number(year) - 1}: carry forward 206 days, encash 48 days, lapse 119 days across 78 balances` },
      { id: "ta_2", at: ago(150, "16:00"), actor: "Meera Kapoor", action: "Balance adjusted", detail: "Harsh Vardhan · Sick leave −1 day (duplicate migration credit)" },
      { id: "ta_3", at: ago(95, "12:30"), actor: "Meera Kapoor", action: "Balance adjusted", detail: "Aanya Sharma · Earned leave +1 day (India Design Week)" },
      { id: "ta_4", at: ago(60, "10:05"), actor: "Meera Kapoor", action: "Balance adjusted", detail: "Dev Malhotra · Casual leave +1 day (election duty)" },
    ],
    timeGender: Object.fromEntries(employees.map((person) => [person.id, female.has(person.name.split(" ")[0] ?? "") ? "female" : "male"])),
    timeOffDayPunches: punches,
    rosterWeeks,
    rosterWeeklyOffs: {
      "Client Services": { offWeekdays: [0], alternateSaturdays: true },
    },
    rosterSwaps,
  };
}
