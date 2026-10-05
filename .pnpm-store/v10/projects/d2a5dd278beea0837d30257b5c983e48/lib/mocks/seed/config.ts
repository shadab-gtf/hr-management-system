import "server-only";
import { holidays } from "@/lib/mocks/seed/calendar";
import { costCenters, defaultShift, departments, locations } from "@/lib/mocks/seed/organization";
import { addDays } from "@/lib/utils/date";
import type { MockImportBatch } from "@/lib/mocks/handlers/attendance-import";
import type { MockCompensationBatch, MockCompensationRevision } from "@/lib/mocks/handlers/compensation-import";
import type { EmploymentEvent } from "@/types/employee";
import type { CompanyEvent, ExitReason, HolidayRecord, LateEarlyPolicy, LeaveAccrual, LeaveGender, NotificationTopic, OvertimePolicy, ShiftConfig, TaskOwner } from "@/types/hr-config";

/*
 * Synthetic HR configuration that HR can edit in the mock. Values are
 * illustrative placeholders — GTF must configure real policy before go-live.
 */

export interface MockLeaveType {
  id: string;
  code: string;
  name: string;
  description: string;
  /** Half-day units; null = unlimited (unpaid). */
  entitledHalves: number | null;
  carryForwardHalves: number;
  allowHalfDay: boolean;
  requiresAttachment: boolean;
  /** Work-from-home style types: the day counts as working, not absence. */
  countsAsPresent: boolean;
  active: boolean;
  /** Policy engine (all day values in half-day units). */
  accrual: LeaveAccrual;
  encashable: boolean;
  maxEncashHalves: number;
  minRetainHalves: number;
  maxConsecutiveDays: number | null;
  minNoticeDays: number;
  backdateDays: number;
  /** Weekends/holidays between leave days are charged too. */
  sandwich: boolean;
  negativeHalves: number;
  gender: LeaveGender;
  employmentTypes: ("full_time" | "contract" | "intern")[];
  afterProbationOnly: boolean;
  minServiceDays: number;
  documentAfterDays: number | null;
  expiryDays: number | null;
}
export interface MockChecklistTask {
  id: string;
  title: string;
  owner: TaskOwner;
  offsetDays: number;
  blocking: boolean;
}
export interface MockExit {
  employeeId: string;
  lastWorkingDay: string;
  reason: ExitReason;
  note: string;
  startedAt: string;
  tasks: Record<string, boolean>;
}
export interface MockProfileChange {
  id: string;
  reference: string;
  employeeId: string;
  field: string;
  value: string;
  reason: string;
  submittedAt: string;
  state: "pending" | "approved" | "rejected";
  decisionNote: string | null;
}
export interface MockNotificationPrefs {
  topics: Record<NotificationTopic, { email: boolean; push: boolean }>;
  quietHours: { enabled: boolean; from: string; to: string };
}

const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;

type LeaveBasics = Pick<MockLeaveType, "id" | "code" | "name" | "description" | "entitledHalves"> & Partial<Pick<MockLeaveType, "carryForwardHalves" | "allowHalfDay" | "countsAsPresent">>;
/** Leave type with synthetic default rules; GTF must confirm the real policy. */
function rules(basics: LeaveBasics, policy: Partial<MockLeaveType>): MockLeaveType {
  return {
    carryForwardHalves: 0,
    allowHalfDay: false,
    requiresAttachment: false,
    countsAsPresent: false,
    active: true,
    accrual: "annual_upfront",
    encashable: false,
    maxEncashHalves: 0,
    minRetainHalves: 0,
    maxConsecutiveDays: null,
    minNoticeDays: 0,
    backdateDays: 0,
    sandwich: false,
    negativeHalves: 0,
    gender: "any",
    employmentTypes: ["full_time", "contract", "intern"],
    afterProbationOnly: false,
    minServiceDays: 0,
    documentAfterDays: null,
    expiryDays: null,
    ...basics,
    ...policy,
  };
}

export function createConfigState(today: string, stamp: (daysAgo: number) => string) {
  const events: CompanyEvent[] = [
    { id: "ev_1", title: "Quarterly town hall", date: addDays(today, 6), startTime: "16:00", endTime: "17:30", venue: "Noida HQ · Auditorium + online", description: "Business update, client wins and open Q&A with leadership.", category: "town_hall", audience: "Everyone" },
    { id: "ev_2", title: "Diwali celebration", date: addDays(today, 24), startTime: "15:00", endTime: "18:00", venue: "Noida HQ · Terrace", description: "Rangoli, sweets and a potluck. Families welcome after 5 PM.", category: "celebration", audience: "Everyone" },
    { id: "ev_3", title: "Figma variables workshop", date: addDays(today, 3), startTime: "11:00", endTime: "12:30", venue: "Online", description: "Hands-on session on design tokens with variables.", category: "training", audience: "Design" },
  ];
  return {
    config: {
      holidays: holidays.map((holiday): HolidayRecord => ({ ...holiday, locations: [...holiday.locations] })),
      events,
      celebrations: { showWorkAnniversaries: true, showNewJoiners: true },
      leaveTypes: [
        rules({ id: "lt_cl", code: "CL", name: "Casual leave", description: "Short personal needs. Half days allowed.", entitledHalves: 24, allowHalfDay: true }, { accrual: "monthly", maxConsecutiveDays: 3, minNoticeDays: 1 }),
        rules({ id: "lt_sl", code: "SL", name: "Sick leave", description: "Illness or medical appointments. Certificate needed beyond 2 days.", entitledHalves: 16, allowHalfDay: true }, { backdateDays: 7, documentAfterDays: 2, negativeHalves: 2 }),
        rules({ id: "lt_el", code: "EL", name: "Earned leave", description: "Planned vacations. Full days only; sandwich rule applies.", entitledHalves: 36, carryForwardHalves: 30 }, { accrual: "monthly", encashable: true, maxEncashHalves: 20, minRetainHalves: 10, maxConsecutiveDays: 15, minNoticeDays: 7, sandwich: true, negativeHalves: 6, employmentTypes: ["full_time"], afterProbationOnly: true }),
        rules({ id: "lt_wfh", code: "WFH", name: "Work from home", description: "Working remotely for the day. Counts as present; no pay impact.", entitledHalves: 48, allowHalfDay: true, countsAsPresent: true }, { maxConsecutiveDays: 5, minNoticeDays: 1 }),
        rules({ id: "lt_co", code: "CO", name: "Comp-off", description: "Credited for approved week-off or holiday work. Each credit expires after 60 days.", entitledHalves: 0, allowHalfDay: true }, { accrual: "none", expiryDays: 60 }),
        rules({ id: "lt_ml", code: "ML", name: "Maternity leave", description: "26 weeks (Maternity Benefit Act). Calendar days; certificate required.", entitledHalves: 364 }, { minNoticeDays: 14, sandwich: true, gender: "female", employmentTypes: ["full_time", "contract"], minServiceDays: 80, documentAfterDays: 0 }),
        rules({ id: "lt_pl", code: "PTL", name: "Paternity leave", description: "5 working days within 6 months of the child's birth.", entitledHalves: 10 }, { maxConsecutiveDays: 5, minNoticeDays: 7, gender: "male", employmentTypes: ["full_time"] }),
        rules({ id: "lt_lop", code: "LOP", name: "Unpaid leave", description: "Loss of pay. Affects payroll.", entitledHalves: null, allowHalfDay: true }, { accrual: "none" }),
      ] as MockLeaveType[],
      policyRevision: 2,
      /** Default probation length (months) per employment type; 0 = none. */
      probationDefaults: { full_time: 6, contract: 3, intern: 1 } as Record<"full_time" | "contract" | "intern", number>,
      shifts: [
        { id: "sh_general", name: defaultShift.name, start: defaultShift.start, end: defaultShift.end, graceMinutes: defaultShift.graceMinutes, breakMinutes: 60 },
        { id: "sh_early", name: "Early shift", start: "09:00", end: "18:00", graceMinutes: 15, breakMinutes: 60 },
      ] as ShiftConfig[],
      defaultShiftId: "sh_general",
      /** Department → shift id; unassigned departments use the default. */
      departmentShifts: { Engineering: "sh_early" } as Record<string, string>,
      overtime: { enabled: true, startsAfterMinutes: 30, blockMinutes: 30, dailyCapMinutes: 240, compensation: "comp_off", requiresApproval: true } as OvertimePolicy,
      /** Late coming / early going: every 3rd mark in a month deducts half a day. */
      lateEarly: { enabled: true, earlyGraceMinutes: 15, marksPerHalfDay: 3, countEarlyGoing: true } as LateEarlyPolicy,
      /** Office geofences: none until HR adds the real sites (Attendance rules). */
      sites: [] as { id: string; name: string; latitude: number; longitude: number; radiusMeters: number }[],
      departments: departments.map((name): { name: string; costCenter: string; headId: string | null } => ({ name, costCenter: costCenters[name], headId: null })),
      locations: [...locations] as string[],
      checklists: {
        onboarding: [
          { id: "docs", title: "Collect joining documents", owner: "HR", offsetDays: 0, blocking: true },
          { id: "bank", title: "Verify bank account", owner: "Finance", offsetDays: 3, blocking: true },
          { id: "it", title: "Issue laptop & accounts", owner: "IT", offsetDays: 0, blocking: true },
          { id: "induction", title: "Complete induction session", owner: "HR", offsetDays: 5, blocking: false },
          { id: "buddy", title: "Assign onboarding buddy", owner: "Manager", offsetDays: 1, blocking: false },
          { id: "policy", title: "Acknowledge code of conduct", owner: "Employee", offsetDays: 7, blocking: false },
        ] as MockChecklistTask[],
        offboarding: [
          { id: "handover", title: "Complete work handover", owner: "Manager", offsetDays: 7, blocking: true },
          { id: "assets", title: "Return laptop, ID card and assets", owner: "IT", offsetDays: 0, blocking: true },
          { id: "access", title: "Revoke system access at end of day", owner: "IT", offsetDays: 0, blocking: true },
          { id: "fnf", title: "Prepare full & final settlement", owner: "Finance", offsetDays: -15, blocking: true },
          { id: "exit_interview", title: "Exit interview", owner: "HR", offsetDays: 3, blocking: false },
          { id: "relieving", title: "Issue relieving & experience letter", owner: "HR", offsetDays: 0, blocking: false },
        ] as MockChecklistTask[],
      },
    },
    exits: new Map<string, MockExit>([
      [e(18), { employeeId: e(18), lastWorkingDay: addDays(today, 18), reason: "resignation", note: "Relocating to Bengaluru.", startedAt: stamp(12), tasks: { handover: false, exit_interview: true } }],
    ]),
    /** HR-recorded employment changes, newest last. */
    employmentEvents: new Map<string, EmploymentEvent[]>(),
    employeeVersions: new Map<string, number>(),
    /** Per-employee probation override in months (else the type default). */
    probation: new Map<string, number>(),
    /** Probation confirmed early/late by HR: employeeId → confirmation date. */
    probationConfirmed: new Map<string, string>(),
    profileRequests: [
      { id: "pc_1", reference: "PC-2600191", employeeId: e(12), field: "address", value: "B-204, Green Meadows, Sector 50, Noida", reason: "Moved to a new flat", submittedAt: stamp(2), state: "pending", decisionNote: null },
      { id: "pc_2", reference: "PC-2600194", employeeId: e(21), field: "bankAccount", value: "XXXX XXXX 7781 · HDFC0001234", reason: "Salary account changed", submittedAt: stamp(1), state: "pending", decisionNote: null },
    ] as MockProfileChange[],
    /** Approved profile values (overrides the synthetic private profile). */
    profileOverrides: new Map<string, Record<string, string>>(),
    notificationPrefs: new Map<string, MockNotificationPrefs>(),
    /** Staged device imports, newest first (see handlers/attendance-import). */
    importBatches: [] as MockImportBatch[],
    /** Committed device attendance keyed "employeeId|date". */
    devicePunches: new Map<string, { in: string | null; out: string | null; batchId: string }>(),
    /** Salary sheet batches (maker/checker), newest first. */
    compensationBatches: [] as MockCompensationBatch[],
    /** Approved, effective-dated compensation revisions per employee. */
    compensationHistory: new Map<string, MockCompensationRevision[]>(),
  };
}

export type ConfigState = ReturnType<typeof createConfigState>;
