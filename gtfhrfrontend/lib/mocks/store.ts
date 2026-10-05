import "server-only";
import { addDays, addMonths, isWeekend, monthOf, todayInZone, zonedInstant } from "@/lib/utils/date";
import { isSeedHoliday } from "@/lib/mocks/seed/calendar";
import { createConfigState, type ConfigState } from "@/lib/mocks/seed/config";
import { organization } from "@/lib/mocks/seed/organization";
import { seedEmployees, type SeedEmployee } from "@/lib/mocks/seed/people";
import { createExtendedState, type ExtendedState } from "@/lib/mocks/seed/extended";
import { createStatutoryState, type StatutoryState } from "@/lib/mocks/seed/statutory";
import { createTimeState, type TimeState } from "@/lib/mocks/seed/time";
import { createLifecycleState, type LifecycleState } from "@/lib/mocks/seed/lifecycle";
import { createPerformanceState, type PerformanceState } from "@/lib/mocks/seed/performance";
import { createRecruitmentState, type RecruitmentState } from "@/lib/mocks/seed/recruitment";
import { createEngagePlusState, type EngagePlusState } from "@/lib/mocks/seed/engage-plus";
import { createTimesheetsState, type TimesheetsState } from "@/lib/mocks/seed/timesheets";
import { createReportsState, type ReportsState } from "@/lib/mocks/seed/reports";
import type { DayPortion, LeaveState } from "@/types/leave";
import type { LocationCheck } from "@/types/location";
import type { PayrollRunState } from "@/types/payroll";
import type {
  ExpenseCategory,
  ExpenseState,
  HrDocument,
  TicketState,
} from "@/types/workplace";

/*
 * In-memory mock backend. It exists only so the frontend can be exercised end
 * to end without the real HR service; it is process-local, resets on restart,
 * and is never used when GTF_API_MODE=live.
 */

export interface MockLeaveRequest {
  id: string;
  reference: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  portion: DayPortion;
  /** Exact units in half days. */
  halves: number;
  reason: string;
  state: LeaveState;
  submittedAt: string;
  approverId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  version: number;
}

export interface MockRegularization {
  id: string;
  reference: string;
  employeeId: string;
  date: string;
  proposedIn: string;
  proposedOut: string;
  reason: string;
  state: "pending" | "approved" | "rejected";
  approverId: string | null;
  submittedAt: string;
  decisionNote: string | null;
  version: number;
}

export interface MockExpense {
  id: string;
  reference: string;
  employeeId: string;
  title: string;
  category: ExpenseCategory;
  amountPaise: number;
  incurredOn: string;
  merchant: string;
  state: ExpenseState;
  submittedAt: string | null;
  receipts: number;
  settlementReference: string | null;
  approverId: string | null;
  version: number;
}

export interface MockTicket {
  id: string;
  reference: string;
  employeeId: string;
  categoryId: string;
  subject: string;
  description: string;
  state: TicketState;
  priority: "low" | "normal" | "high";
  createdAt: string;
  updatedAt: string;
  assignee: string | null;
  lastMessage: string;
}

export interface MockPayrollRun {
  id: string;
  month: string;
  revision: number;
  state: PayrollRunState;
  preparedBy: string;
  approvedBy: string | null;
  publishedAt: string | null;
  updatedAt: string;
  audit: { at: string; actor: string; event: string }[];
}

export interface MockNotification {
  id: string;
  employeeId: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  read: boolean;
  kind: "approval" | "leave" | "payroll" | "helpdesk" | "system";
}

export interface MockDb
  extends ExtendedState,
    ConfigState,
    StatutoryState,
    TimeState,
    LifecycleState,
    PerformanceState,
    RecruitmentState,
    EngagePlusState,
    TimesheetsState,
    ReportsState {
  today: string;
  employees: SeedEmployee[];
  leaveRequests: MockLeaveRequest[];
  regularizations: MockRegularization[];
  /** Today's self-service captures, keyed by employee id. */
  captures: Map<string, { in: string | null; out: string | null; inLocation?: string | null; inEvidence?: LocationCheck | null; outLocation?: string | null; outEvidence?: LocationCheck | null }>;
  /** Past days forced into "needs review" to exercise regularization. */
  forcedExceptions: Map<string, string[]>;
  expenses: MockExpense[];
  tickets: MockTicket[];
  documents: (HrDocument & { employeeId: string | null })[];
  payrollRuns: MockPayrollRun[];
  notifications: MockNotification[];
  idempotency: Map<string, unknown>;
  /** Uploaded profile photos (process memory only). */
  photos: Map<string, { data: Uint8Array; mime: string; version: number }>;
  counter: number;
}

/**
 * Bump whenever the MockDb shape changes. Dev-server hot reload keeps the old
 * object on globalThis; a version mismatch rebuilds it instead of crashing.
 */
const STORE_VERSION = 8;

/* Keys of a freshly built store; a hot-reloaded module with new slices rebuilds too. */
let shapeKeys: string[] | null = null;
function hasShape(current: object): boolean {
  shapeKeys ??= Object.keys(createDb(todayInZone(organization.timezone)));
  return shapeKeys.every((key) => key in current);
}

const globalStore = globalThis as unknown as { __gtfMockDb?: MockDb & { version?: number } };

export function db(): MockDb {
  const today = todayInZone(organization.timezone);
  const current = globalStore.__gtfMockDb;
  // Rebuild on a new business day (relative fixtures) or a new store shape.
  if (current && current.today === today && current.version === STORE_VERSION && hasShape(current)) return current;
  const fresh = Object.assign(createDb(today), { version: STORE_VERSION });
  shapeKeys = Object.keys(fresh);
  globalStore.__gtfMockDb = fresh;
  return fresh;
}

export function nextId(prefix: string): string {
  const store = db();
  store.counter += 1;
  return `${prefix}_${String(store.counter).padStart(5, "0")}`;
}
export function nextReference(prefix: string): string {
  const store = db();
  store.counter += 1;
  return `${prefix}-${store.today.slice(2, 4)}${String(store.counter).padStart(5, "0")}`;
}
export function nowInstant(): string {
  return new Date().toISOString();
}

/** Versioned photo URL so a new upload is fetched everywhere, never a stale cache. */
export function photoUrlFor(employeeId: string): string | null {
  const photo = db().photos.get(employeeId);
  return photo ? `/api/photos/${employeeId}?v=${photo.version}` : null;
}

export function employeeById(id: string): SeedEmployee | undefined {
  return db().employees.find((employee) => employee.id === id);
}

/** Next working day on/after `today + offset`, skipping weekends and holidays. */
function workday(today: string, offset: number): string {
  let date = addDays(today, offset);
  const step = offset < 0 ? -1 : 1;
  while (isWeekend(date) || isSeedHoliday(date)) date = addDays(date, step);
  return date;
}
function ago(today: string, days: number, time = "10:15"): string {
  return zonedInstant(addDays(today, -days), time);
}

function createDb(today: string): MockDb {
  const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;
  const leave = (
    n: number,
    employee: number,
    type: string,
    start: string,
    end: string,
    halves: number,
    state: LeaveState,
    reason: string,
    submittedDaysAgo: number,
    approver: number,
    note: string | null = null,
  ): MockLeaveRequest => ({
    id: `lr_${n}`,
    reference: `LV-${today.slice(2, 4)}${String(4000 + n)}`,
    employeeId: e(employee),
    leaveTypeId: type,
    startDate: start,
    endDate: end,
    portion: halves === 1 ? "first_half" : "full",
    halves,
    reason,
    state,
    submittedAt: ago(today, submittedDaysAgo),
    approverId: e(approver),
    decidedAt: state === "pending" ? null : ago(today, Math.max(submittedDaysAgo - 1, 0), "16:40"),
    decisionNote: note,
    version: state === "pending" ? 1 : 2,
  });

  const w = (offset: number) => workday(today, offset);
  const month = monthOf(today);

  const leaveRequests: MockLeaveRequest[] = [
    // Aanya (employee persona)
    leave(1, 7, "lt_el", w(-52), w(-50), 6, "approved", "Family function in Jaipur", 70, 6),
    leave(2, 7, "lt_cl", w(-24), w(-24), 2, "approved", "Personal errand", 30, 6),
    leave(3, 7, "lt_sl", w(-12), w(-12), 1, "approved", "Doctor appointment (first half)", 12, 6),
    leave(4, 7, "lt_cl", w(-38), w(-38), 2, "rejected", "Short trip", 40, 6, "Client launch that day — please pick another date."),
    leave(5, 7, "lt_el", w(16), w(18), 6, "pending", "Diwali travel home", 2, 6),
    // Rohan's team → manager approvals
    leave(6, 9, "lt_el", w(9), w(11), 6, "pending", "Sister's wedding in Kolkata", 1, 6),
    leave(7, 10, "lt_cl", w(3), w(3), 2, "pending", "Moving to a new apartment", 0, 6),
    leave(8, 11, "lt_el", w(-6), w(8), 22, "approved", "Planned sabbatical leave", 40, 6),
    leave(9, 12, "lt_sl", w(-3), w(-3), 2, "approved", "Fever", 3, 6),
    // Meera's team
    leave(10, 36, "lt_cl", w(5), w(5), 2, "pending", "Bank and documentation work", 1, 5),
    leave(13, 35, "lt_el", w(12), w(14), 6, "pending", "Campus hiring drive — travel back home after", 1, 5),
    leave(14, 37, "lt_sl", w(-1), w(-1), 2, "pending", "Unwell, visited clinic", 0, 5),
    leave(15, 31, "lt_cl", w(6), w(6), 2, "pending", "Parent-teacher meeting", 1, 30),
    leave(16, 38, "lt_cl", w(7), w(7), 2, "pending", "Family function", 1, 3),
    leave(17, 4, "lt_el", w(20), w(21), 4, "pending", "Short trip after payroll close", 2, 3),
    // Others (history for balances)
    leave(11, 14, "lt_el", w(-30), w(-28), 6, "approved", "Vacation", 45, 13),
    leave(12, 21, "lt_cl", w(4), w(4), 2, "pending", "Personal work", 1, 20),
  ];

  const regularizations: MockRegularization[] = [
    {
      id: "rg_1",
      reference: `RG-${today.slice(2, 4)}2101`,
      employeeId: e(12),
      date: w(-2),
      proposedIn: "09:28",
      proposedOut: "18:42",
      reason: "Forgot to check out — was at the client shoot in Sector 62.",
      state: "pending",
      approverId: e(6),
      submittedAt: ago(today, 1, "11:05"),
      decisionNote: null,
      version: 1,
    },
    {
      id: "rg_2",
      reference: `RG-${today.slice(2, 4)}2088`,
      employeeId: e(7),
      date: w(-19),
      proposedIn: "09:35",
      proposedOut: "18:50",
      reason: "Biometric device was offline at Noida HQ.",
      state: "approved",
      approverId: e(6),
      submittedAt: ago(today, 18),
      decisionNote: "Confirmed with facilities.",
      version: 2,
    },
    {
      id: "rg_3",
      reference: `RG-${today.slice(2, 4)}2104`,
      employeeId: e(36),
      date: w(-3),
      proposedIn: "09:40",
      proposedOut: "18:35",
      reason: "Access card reader at Noida HQ didn't register my check-out.",
      state: "pending",
      approverId: e(5),
      submittedAt: ago(today, 1, "10:20"),
      decisionNote: null,
      version: 1,
    },
  ];

  const expenses: MockExpense[] = [
    { id: "ex_1", reference: `EX-${today.slice(2, 4)}3101`, employeeId: e(7), title: "Client workshop travel — Gurugram", category: "travel", amountPaise: 184_000, incurredOn: w(-33), merchant: "Uber India", state: "reimbursed", submittedAt: ago(today, 32), receipts: 2, settlementReference: `STL-${month.replace("-", "")}-0042`, approverId: e(6), version: 4 },
    { id: "ex_2", reference: `EX-${today.slice(2, 4)}3144`, employeeId: e(7), title: "Home internet — September", category: "internet", amountPaise: 99_900, incurredOn: w(-8), merchant: "Airtel Xstream", state: "manager_approved", submittedAt: ago(today, 7), receipts: 1, settlementReference: null, approverId: e(6), version: 2 },
    { id: "ex_3", reference: `EX-${today.slice(2, 4)}3150`, employeeId: e(9), title: "Photo shoot props", category: "equipment", amountPaise: 426_050, incurredOn: w(-4), merchant: "Crossword Stores", state: "submitted", submittedAt: ago(today, 2), receipts: 3, settlementReference: null, approverId: e(6), version: 1 },
    { id: "ex_4", reference: `EX-${today.slice(2, 4)}3152`, employeeId: e(10), title: "Team lunch with client", category: "client_meeting", amountPaise: 356_000, incurredOn: w(-3), merchant: "Farzi Café", state: "submitted", submittedAt: ago(today, 1), receipts: 1, settlementReference: null, approverId: e(6), version: 1 },
    { id: "ex_5", reference: `EX-${today.slice(2, 4)}3155`, employeeId: e(35), title: "Campus drive travel — Noida to Delhi", category: "travel", amountPaise: 214_500, incurredOn: w(-5), merchant: "Delhi Metro & Ola", state: "submitted", submittedAt: ago(today, 2), receipts: 2, settlementReference: null, approverId: e(5), version: 1 },
    { id: "ex_6", reference: `EX-${today.slice(2, 4)}3158`, employeeId: e(38), title: "Courier — statutory filings", category: "other", amountPaise: 45_000, incurredOn: w(-2), merchant: "Blue Dart", state: "submitted", submittedAt: ago(today, 1), receipts: 1, settlementReference: null, approverId: e(3), version: 1 },
  ];

  const tickets: MockTicket[] = [
    { id: "tk_1", reference: `HD-${today.slice(2, 4)}0712`, employeeId: e(7), categoryId: "tc_it", subject: "Figma organization seat not activated", description: "My Figma seat shows as viewer since Monday.", state: "resolved", priority: "normal", createdAt: ago(today, 9), updatedAt: ago(today, 8, "15:20"), assignee: "Tushar Goel", lastMessage: "Seat upgraded to editor. Please sign out and back in." },
    { id: "tk_2", reference: `HD-${today.slice(2, 4)}0748`, employeeId: e(7), categoryId: "tc_payroll", subject: "HRA exemption proof submission window", description: "When does the investment proof window open?", state: "awaiting_you", priority: "normal", createdAt: ago(today, 3), updatedAt: ago(today, 1, "12:10"), assignee: "Payroll team", lastMessage: "Please share the rent receipts for Apr–Sep as one PDF." },
    { id: "tk_3", reference: `HD-${today.slice(2, 4)}0751`, employeeId: e(19), categoryId: "tc_leave", subject: "Comp-off not credited for weekend release", description: "Worked Saturday for the release.", state: "open", priority: "normal", createdAt: ago(today, 1), updatedAt: ago(today, 1), assignee: null, lastMessage: "Request received." },
    { id: "tk_4", reference: `HD-${today.slice(2, 4)}0753`, employeeId: e(33), categoryId: "tc_policy", subject: "Clarification on hybrid work days", description: "How many office days are expected?", state: "in_progress", priority: "low", createdAt: ago(today, 2), updatedAt: ago(today, 0, "09:40"), assignee: "Meera Kapoor", lastMessage: "Checking with your department head." },
  ];

  const doc = (
    id: string,
    employeeId: string | null,
    name: string,
    category: HrDocument["category"],
    size: number,
    daysAgo: number,
    by: string,
    scanState: HrDocument["scanState"] = "clean",
  ) => ({
    id,
    employeeId,
    name,
    category,
    mime: "application/pdf" as const,
    sizeBytes: size,
    uploadedAt: ago(today, daysAgo),
    uploadedBy: by,
    scanState,
  });

  const documents = [
    doc("dc_1", null, "Leave & attendance policy 2026.pdf", "policy", 412_332, 180, "People & Culture"),
    doc("dc_2", null, "Code of conduct v3.pdf", "policy", 655_010, 240, "People & Culture"),
    doc("dc_3", null, "Hybrid work guidelines.pdf", "policy", 198_404, 60, "People & Culture"),
    doc("dc_4", e(7), "Offer letter.pdf", "employment", 221_880, 900, "HR Operations"),
    doc("dc_5", e(7), "Appointment letter.pdf", "employment", 243_120, 890, "HR Operations"),
    doc("dc_6", e(7), "Form 16 — FY 2025-26.pdf", "payroll", 318_992, 110, "Payroll"),
    doc("dc_7", e(7), "PAN card.pdf", "identity", 96_420, 900, "Aanya Sharma"),
    doc("dc_8", e(7), "Rent receipts Apr–Sep.pdf", "payroll", 1_402_551, 0, "Aanya Sharma", "scanning"),
    doc("dc_9", e(34), "Aadhaar (masked).pdf", "identity", 88_010, 12, "Aman Tiwari", "rejected"),
  ];

  const runs: MockPayrollRun[] = [];
  for (let back = 6; back >= 1; back -= 1) {
    const runMonth = addMonths(month, -back);
    runs.push({
      id: `run_${runMonth.replace("-", "")}_r1`,
      month: runMonth,
      revision: 1,
      state: back === 1 ? "published" : "paid",
      preparedBy: e(4),
      approvedBy: e(3),
      publishedAt: zonedInstant(`${runMonth}-27`, "17:30"),
      updatedAt: zonedInstant(`${runMonth}-28`, "11:00"),
      audit: [],
    });
  }
  runs.push({
    id: `run_${month.replace("-", "")}_r1`,
    month,
    revision: 1,
    state: "calculated",
    preparedBy: e(4),
    approvedBy: null,
    publishedAt: null,
    updatedAt: ago(today, 0, "09:12"),
    audit: [
      { at: ago(today, 3, "18:00"), actor: "System", event: "Input cut-off reached; attendance and leave snapshot frozen" },
      { at: ago(today, 1, "11:30"), actor: "Vikram Nair", event: "Run created from frozen inputs (revision 1)" },
      { at: ago(today, 0, "09:12"), actor: "System", event: "Calculation completed for all employees" },
    ],
  });

  const note = (
    n: number,
    employee: number,
    kind: MockNotification["kind"],
    title: string,
    body: string,
    href: string | null,
    hoursAgo: number,
    read = false,
  ): MockNotification => ({
    id: `nt_${n}`,
    employeeId: e(employee),
    title,
    body,
    href,
    createdAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    read,
    kind,
  });

  const notifications: MockNotification[] = [
    note(1, 7, "helpdesk", "HR replied to your request", "Your payroll query needs one more document.", "/helpdesk", 20),
    note(2, 7, "payroll", "Payslip published", "Your payslip for last month is available.", "/me/payslips", 70, true),
    note(3, 7, "leave", "Leave approved", "Rohan Verma approved your sick leave.", "/leave", 200, true),
    note(11, 5, "approval", "Requests awaiting you", "Leave, a correction and a travel claim from your team.", "/approvals", 2),
    note(12, 3, "approval", "Team requests", "Lakshmi Iyer and Vikram Nair have pending requests.", "/approvals", 8),
    note(4, 6, "approval", "New leave request", "Kabir Mehta requested 1 day of casual leave.", "/approvals", 3),
    note(5, 6, "approval", "Regularization awaiting you", "Dev Malhotra submitted an attendance correction.", "/approvals", 26),
    note(6, 6, "approval", "Expense claims pending", "2 team claims need your review.", "/approvals", 30),
    note(7, 5, "helpdesk", "Queue update", "2 new requests in the HR queue.", "/helpdesk", 5),
    note(8, 5, "system", "Onboarding documents rejected", "Aman Tiwari's ID upload failed verification.", "/documents", 40),
    note(9, 4, "payroll", "Calculation complete", "This month's run is ready to submit for review.", "/payroll", 4),
    note(10, 3, "payroll", "Payroll review upcoming", "The run will reach you once the operator submits it.", "/payroll", 6),
  ];

  return {
    today,
    // Copies: HR edits must not leak into the module-level seed.
    employees: seedEmployees.map((employee) => ({ ...employee })),
    leaveRequests,
    regularizations,
    captures: new Map(),
    forcedExceptions: new Map([
      [e(7), [w(-4)]],
      [e(12), [w(-2)]],
    ]),
    expenses,
    tickets,
    documents,
    payrollRuns: runs,
    notifications,
    idempotency: new Map(),
    photos: globalStore.__gtfMockDb?.photos ?? new Map(),
    counter: 100,
    ...createExtendedState(today),
    ...createConfigState(today, (days) => ago(today, days)),
    ...createStatutoryState(today, (days, time) => ago(today, days, time), seedEmployees),
    ...createTimeState(today, (days, time) => ago(today, days, time), seedEmployees),
    ...createLifecycleState(today, (days, time) => ago(today, days, time), seedEmployees),
    ...createPerformanceState(today, (days, time) => ago(today, days, time), seedEmployees),
    ...createRecruitmentState(today, (days, time) => ago(today, days, time), seedEmployees),
    ...createEngagePlusState(today, (days, time) => ago(today, days, time), seedEmployees),
    ...createTimesheetsState(today, (days, time) => ago(today, days, time), seedEmployees),
    ...createReportsState(today, (days, time) => ago(today, days, time), seedEmployees),
  };
}
