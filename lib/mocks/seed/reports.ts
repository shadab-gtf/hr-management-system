import "server-only";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { seededInt } from "@/lib/mocks/seed/random";
import { addDays, addMonths, monthOf } from "@/lib/utils/date";
import type { NotificationTopic } from "@/types/hr-config";
import type { ExportFormat, ReportSpec } from "@/types/reports";
import type { Role } from "@/types/session";

/* Synthetic saved custom reports and schedules, notification channels. Relative to the business date. */

export interface MockReportSchedule {
  frequency: "daily" | "weekly" | "monthly";
  weekday: number;
  dayOfMonth: number;
  time: string;
  format: ExportFormat;
  recipientIds: string[];
  active: boolean;
}

export interface MockSavedReport {
  id: string;
  name: string;
  description: string;
  spec: ReportSpec;
  visibility: "private" | "shared";
  sharedRoles: Role[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  schedule: MockReportSchedule | null;
  lastRunAt: string | null;
}

export interface MockReportDelivery {
  id: string;
  savedReportId: string;
  reportName: string;
  at: string;
  recipientIds: string[];
  rowCount: number;
  format: ExportFormat;
  trigger: "schedule" | "manual";
}

export interface MockExportLogEntry {
  id: string;
  at: string;
  actorId: string;
  report: string;
  source: "standard" | "custom" | "saved" | "schedule";
  format: ExportFormat;
  rowCount: number;
  filters: string;
}

/** People who left before the current roster; only reports read them (headcount history). */
export interface MockFormerEmployee {
  id: string;
  code: string;
  name: string;
  designation: string;
  department: string;
  location: string;
  joinedOn: string;
  exitedOn: string;
  exitReason: "resignation" | "termination" | "contract_end";
  type: SeedEmployee["type"];
  gender: "female" | "male";
}

export interface MockChannelPrefs {
  sms: Record<NotificationTopic, boolean>;
  whatsapp: Record<NotificationTopic, boolean>;
  digest: { mode: "instant" | "daily"; time: string };
}

export interface MockPhone {
  number: string | null;
  verified: boolean;
  verifiedAt: string | null;
  pending: { number: string; code: string; expiresAt: string; attemptsLeft: number } | null;
}

export interface ReportsState {
  reportsSaved: MockSavedReport[];
  reportsDeliveries: MockReportDelivery[];
  reportsExportLog: MockExportLogEntry[];
  reportsFormerEmployees: MockFormerEmployee[];
  /** Exit dates for current-roster employees whose status is exited. */
  reportsExitDates: Record<string, string>;
  /** Synthetic self-declared gender for workforce analytics. */
  reportsGender: Record<string, "female" | "male">;
  /** Synthetic birthdays (MM-DD, no year); real dates of birth are restricted. */
  reportsBirthdays: Record<string, string>;
  notifChannelPrefs: Map<string, MockChannelPrefs>;
  notifPhones: Map<string, MockPhone>;
}

const e = (n: number) => `emp_${String(n).padStart(4, "0")}`;
const FEMALE = new Set([2, 3, 5, 7, 9, 11, 14, 16, 18, 20, 22, 24, 27, 28, 31, 33, 35, 37, 38, 41, 43]);
const noFilters = { department: "", location: "", status: "", leaveState: "", month: "", from: "", to: "" } as const;

export function createReportsState(today: string, ago: (days: number, time?: string) => string, employees: SeedEmployee[]): ReportsState {
  const month = monthOf(today);
  const lastMonth = addMonths(month, -1);

  const former: MockFormerEmployee[] = (
    [
      ["Abhishek Rana", "Frontend Engineer", "Engineering", "Gurugram", addDays(today, -1400), 340, "resignation", "full_time", "male"],
      ["Sana Sheikh", "Copywriter", "Strategy & Brand", "Mumbai", addDays(today, -900), 300, "resignation", "full_time", "female"],
      ["Rakesh Yadav", "Account Executive", "Client Services", "Noida HQ", addDays(today, -330), 262, "termination", "full_time", "male"],
      ["Megha Arora", "Paid Media Specialist", "Performance Marketing", "Mumbai", addDays(today, -1100), 205, "resignation", "full_time", "female"],
      ["Nitin Chauhan", "Video Editor", "Strategy & Brand", "Noida HQ", addDays(today, -270), 150, "contract_end", "contract", "male"],
      ["Pallavi Deshmukh", "QA Engineer", "Engineering", "Remote", addDays(today, -760), 118, "resignation", "full_time", "female"],
      ["Rohit Bansal", "Design Intern", "Design", "Noida HQ", addDays(today, -200), 20 + 90, "contract_end", "intern", "male"],
      ["Ayesha Siddiqui", "Accounts Executive", "Finance", "Noida HQ", addDays(today, -640), 44, "resignation", "full_time", "female"],
      ["Vivek Menon", "Backend Engineer", "Engineering", "Remote", addDays(today, -520), 12, "resignation", "full_time", "male"],
    ] as const
  ).map(([name, designation, department, location, joinedOn, exitedAgo, exitReason, type, gender], index) => ({
    id: `fx_${String(index + 1).padStart(2, "0")}`,
    code: `GTF-0${900 + index + 1}`,
    name,
    designation,
    department,
    location,
    joinedOn,
    exitedOn: addDays(today, -exitedAgo),
    exitReason,
    type,
    gender,
  }));

  const reportsGender: Record<string, "female" | "male"> = {};
  const reportsBirthdays: Record<string, string> = {};
  for (const employee of employees) {
    const n = Number(employee.id.slice(4));
    reportsGender[employee.id] = FEMALE.has(n) ? "female" : "male";
    const monthPart = seededInt(1, 12, employee.id, "birth-month");
    const dayPart = seededInt(1, 28, employee.id, "birth-day");
    reportsBirthdays[employee.id] = `${String(monthPart).padStart(2, "0")}-${String(dayPart).padStart(2, "0")}`;
  }
  // Two birthdays this month keep the celebrations report meaningful.
  reportsBirthdays[e(9)] = `${today.slice(5, 7)}-${addDays(today, 3).slice(8)}`;
  reportsBirthdays[e(15)] = `${today.slice(5, 7)}-${addDays(today, -4).slice(8)}`;

  const saved: MockSavedReport[] = [
    {
      id: "rpt_1",
      name: "Headcount by department",
      description: "Current employees grouped by department — sent to HR and Finance every Monday.",
      spec: { dataset: "employees", columns: ["code", "name", "department", "location", "status"], filters: { ...noFilters }, sort: { column: "department", direction: "asc" }, groupBy: "department", aggregate: { fn: "count", column: null } },
      visibility: "shared",
      sharedRoles: ["hr_operator", "payroll_approver"],
      ownerId: e(5),
      createdAt: ago(120),
      updatedAt: ago(40),
      version: 3,
      schedule: { frequency: "weekly", weekday: 1, dayOfMonth: 1, time: "09:00", format: "xls", recipientIds: [e(5), e(3)], active: true },
      lastRunAt: ago(1, "09:00"),
    },
    {
      id: "rpt_2",
      name: "Late coming — Design",
      description: "Design team attendance this month, most late days first.",
      spec: { dataset: "attendance", columns: ["code", "name", "present", "late", "needsReview", "workedHours"], filters: { ...noFilters, department: "Design", month }, sort: { column: "late", direction: "desc" }, groupBy: null, aggregate: null },
      visibility: "private",
      sharedRoles: [],
      ownerId: e(5),
      createdAt: ago(30),
      updatedAt: ago(30),
      version: 1,
      schedule: null,
      lastRunAt: ago(6, "11:20"),
    },
    {
      id: "rpt_3",
      name: "Pending leave requests",
      description: "Every leave request still awaiting a decision.",
      spec: { dataset: "leave_requests", columns: ["reference", "name", "department", "leaveType", "from", "to", "days", "approver"], filters: { ...noFilters, leaveState: "pending" }, sort: { column: "from", direction: "asc" }, groupBy: null, aggregate: null },
      visibility: "shared",
      sharedRoles: ["hr_operator", "payroll_operator", "payroll_approver"],
      ownerId: e(5),
      createdAt: ago(75),
      updatedAt: ago(12),
      version: 2,
      schedule: null,
      lastRunAt: ago(2, "15:05"),
    },
    {
      id: "rpt_4",
      name: "Net pay by department",
      description: "Last month's register summed by department for the Finance review.",
      spec: { dataset: "payroll_register", columns: ["code", "name", "department", "gross", "deductions", "net"], filters: { ...noFilters, month: lastMonth }, sort: { column: "net", direction: "desc" }, groupBy: "department", aggregate: { fn: "sum", column: "net" } },
      visibility: "shared",
      sharedRoles: ["payroll_approver"],
      ownerId: e(4),
      createdAt: ago(60),
      updatedAt: ago(20),
      version: 1,
      schedule: null,
      lastRunAt: ago(3, "10:40"),
    },
  ];

  const deliveries: MockReportDelivery[] = [1, 8, 15, 22].map((days, index) => ({
    id: `rdl_${index + 1}`,
    savedReportId: "rpt_1",
    reportName: "Headcount by department",
    at: ago(days, "09:00"),
    recipientIds: [e(5), e(3)],
    rowCount: 8,
    format: "xls" as const,
    trigger: "schedule" as const,
  }));

  const log = (n: number, days: number, time: string, actor: number, report: string, source: MockExportLogEntry["source"], format: ExportFormat, rowCount: number, filters: string): MockExportLogEntry => ({
    id: `rxl_${n}`,
    at: ago(days, time),
    actorId: e(actor),
    report,
    source,
    format,
    rowCount,
    filters,
  });
  const exportLog: MockExportLogEntry[] = [
    log(1, 22, "09:00", 5, "Headcount by department", "schedule", "xls", 8, "Weekly schedule"),
    log(2, 15, "09:00", 5, "Headcount by department", "schedule", "xls", 8, "Weekly schedule"),
    log(3, 13, "16:10", 5, "Attendance summary", "standard", "csv", 41, `Month ${lastMonth}`),
    log(4, 9, "12:45", 4, "Salary register", "standard", "csv", 40, `Month ${lastMonth}`),
    log(5, 8, "09:00", 5, "Headcount by department", "schedule", "xls", 8, "Weekly schedule"),
    log(6, 6, "11:20", 5, "Late coming — Design", "saved", "csv", 6, `Department Design · Month ${month}`),
    log(7, 3, "10:40", 4, "Net pay by department", "saved", "xls", 8, `Month ${lastMonth}`),
    log(8, 2, "15:05", 5, "Pending leave requests", "saved", "csv", 12, "Leave state pending"),
    log(9, 1, "09:00", 5, "Headcount by department", "schedule", "xls", 8, "Weekly schedule"),
    log(10, 1, "17:30", 3, "CTC by department", "standard", "csv", 8, "All departments"),
  ];

  const topics: NotificationTopic[] = ["approval", "leave", "payroll", "helpdesk", "announcement"];
  const off = Object.fromEntries(topics.map((topic) => [topic, false])) as Record<NotificationTopic, boolean>;

  return {
    reportsSaved: saved,
    reportsDeliveries: deliveries,
    reportsExportLog: exportLog,
    reportsFormerEmployees: former,
    reportsExitDates: { [e(43)]: addDays(today, -75) },
    reportsGender,
    reportsBirthdays,
    notifChannelPrefs: new Map([[e(5), { sms: { ...off }, whatsapp: { ...off, approval: true }, digest: { mode: "instant", time: "18:00" } }]]),
    notifPhones: new Map([[e(5), { number: "9810045432", verified: true, verifiedAt: ago(90), pending: null }]]),
  };
}
