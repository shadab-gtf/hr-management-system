import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextId, nowInstant, type MockLeaveRequest } from "@/lib/mocks/store";
import { departmentNames, leaveTypes, locationNames, probationDefaults } from "@/lib/mocks/handlers/config";
import { attendanceDay } from "@/lib/mocks/handlers/attendance";
import { calculate } from "@/lib/mocks/handlers/payroll";
import { actorFor, can, idempotent, ref, refById, requireCapability, versionCheck, type MockActor } from "@/lib/mocks/handlers/shared";
import { personas, type SeedEmployee } from "@/lib/mocks/seed/people";
import type { MockReportSchedule, MockSavedReport } from "@/lib/mocks/seed/reports";
import { halves, paise, seededInt } from "@/lib/mocks/seed/random";
import { addDays, addMonths, daysInMonth, diffDays, lastDayOfMonth, monthOf, weekday, zonedInstant } from "@/lib/utils/date";
import { formatDate } from "@/lib/utils/format";
import type { PersonRef } from "@/types/common";
import type {
  BuilderContext,
  Dataset,
  DeliveryLogEntry,
  ExportFile,
  ExportFormat,
  ExportLogEntry,
  ReportAnalytics,
  ReportCell,
  ReportColumn,
  ReportDataset,
  ReportFilters,
  ReportLibrary,
  ReportSchedule,
  ReportSpec,
  ReportTable,
  SavedReport,
  SaveReportInput,
  ScheduleInput,
  StandardReport,
  StandardReportKey,
} from "@/types/reports";
import type { Persona, Role } from "@/types/session";

/*
 * Mock reporting engine. Reads other modules' records read-only; every export
 * re-checks capability and lands in the export audit log. Scheduled delivery
 * is simulated: files are generated, nothing is emailed.
 */

type Row = Record<string, ReportCell>;

export function salaryAccess(actor: MockActor): boolean {
  return can(actor, "payroll.prepare") || can(actor, "payroll.approve") || can(actor, "compensation.manage");
}
function requireSalary(actor: MockActor) {
  if (!salaryAccess(actor)) throw problem(403, "SALARY_RESTRICTED", "Salary reports need payroll or compensation access.");
}

/* Catalog ------------------------------------------------------------------ */

const standardReports: StandardReport[] = [
  { key: "headcount", category: "people", title: "Headcount", description: "Everyone on the roster with department, location, type and status.", filters: ["department", "location", "status"], salary: false },
  { key: "joiners_leavers", category: "people", title: "Joiners & leavers", description: "Movements in a date range, with exit reasons.", filters: ["range", "department", "location"], salary: false },
  { key: "attrition", category: "people", title: "Attrition", description: "Opening and closing headcount, joiners, leavers and annualized attrition for 12 months.", filters: ["month", "department", "location"], salary: false },
  { key: "probation_due", category: "people", title: "Probation due", description: "Employees in probation or whose probation ended in the last 30 days.", filters: ["department", "location"], salary: false },
  { key: "celebrations", category: "people", title: "Birthdays & anniversaries", description: "Birthdays and work anniversaries in a month.", filters: ["month", "department", "location"], salary: false },
  { key: "attendance_summary", category: "time", title: "Attendance summary", description: "Present, late, half days, leave, review days, worked and overtime hours per person.", filters: ["month", "department", "location", "status"], salary: false },
  { key: "late_coming", category: "time", title: "Late coming", description: "People who checked in after the grace period, with the dates.", filters: ["month", "department", "location"], salary: false },
  { key: "leave_balances", category: "time", title: "Leave balances", description: "Entitled, used, pending and available days per leave type.", filters: ["department", "location", "status"], salary: false },
  { key: "leave_availed", category: "time", title: "Leave availed", description: "Approved leave taken in a date range.", filters: ["range", "department", "location"], salary: false },
  { key: "salary_register", category: "payroll", title: "Salary register", description: "Earnings, deductions and net pay per employee for a month.", filters: ["month", "department", "location"], salary: true },
  { key: "ctc_by_department", category: "payroll", title: "CTC by department", description: "Headcount, total, average, lowest and highest annual CTC.", filters: ["location", "status"], salary: true },
];

const col = (key: string, label: string, kind: ReportColumn["kind"] = "text", extra: Partial<Pick<ReportColumn, "salary" | "pii">> = {}): ReportColumn => ({ key, label, kind, salary: extra.salary ?? false, pii: extra.pii ?? false });
const money = (key: string, label: string) => col(key, label, "money", { salary: true });

const person = [col("code", "Employee code"), col("name", "Name"), col("department", "Department"), col("location", "Location")];

const datasets: Dataset[] = [
  {
    id: "employees",
    label: "Employees",
    description: "The employee roster with job, tenure and (masked) identifiers.",
    filters: ["department", "location", "status"],
    columns: [
      ...person,
      col("designation", "Designation"),
      col("manager", "Reporting manager"),
      col("status", "Status"),
      col("type", "Employment type"),
      col("joinedOn", "Joined on", "date"),
      col("tenureYears", "Tenure (years)", "number"),
      col("gender", "Gender"),
      col("pan", "PAN (masked)", "text", { pii: true }),
      col("bank", "Bank account (masked)", "text", { pii: true }),
      money("annualCtc", "Annual CTC"),
      money("monthlyCtc", "Monthly CTC"),
    ],
    defaultColumns: ["code", "name", "department", "location", "designation", "status"],
    salary: false,
  },
  {
    id: "attendance",
    label: "Attendance (month)",
    description: "One row per person for a month; days up to yesterday.",
    filters: ["month", "department", "location", "status"],
    columns: [
      ...person,
      col("present", "Present", "number"),
      col("late", "Late", "number"),
      col("halfDay", "Half day", "number"),
      col("leave", "Leave", "number"),
      col("absent", "Absent", "number"),
      col("needsReview", "Needs review", "number"),
      col("holidays", "Holidays", "number"),
      col("weeklyOff", "Weekly off", "number"),
      col("workedHours", "Worked hours", "number"),
      col("overtimeHours", "Overtime hours", "number"),
    ],
    defaultColumns: ["code", "name", "department", "present", "late", "leave", "workedHours"],
    salary: false,
  },
  {
    id: "leave_requests",
    label: "Leave requests",
    description: "Leave applications with dates, units, state and approver.",
    filters: ["range", "leaveState", "department", "location", "status"],
    columns: [
      col("reference", "Reference"),
      ...person,
      col("leaveType", "Leave type"),
      col("from", "From", "date"),
      col("to", "To", "date"),
      col("days", "Days", "number"),
      col("state", "State"),
      col("submittedOn", "Submitted on", "date"),
      col("approver", "Approver"),
    ],
    defaultColumns: ["reference", "name", "leaveType", "from", "to", "days", "state"],
    salary: false,
  },
  {
    id: "leave_balances",
    label: "Leave balances",
    description: "Current policy-year balances per person and leave type.",
    filters: ["department", "location", "status"],
    columns: [
      ...person,
      col("leaveType", "Leave type"),
      col("entitled", "Entitled", "number"),
      col("used", "Used", "number"),
      col("pending", "Pending", "number"),
      col("available", "Available", "number"),
    ],
    defaultColumns: ["code", "name", "leaveType", "entitled", "used", "available"],
    salary: false,
  },
  {
    id: "payroll_register",
    label: "Payroll register (month)",
    description: "Synthetic calculation per employee for a month. Salary access only.",
    filters: ["month", "department", "location"],
    columns: [
      ...person,
      col("payableDays", "Payable days", "number"),
      col("lopDays", "LOP days", "number"),
      money("basic", "Basic"),
      money("hra", "HRA"),
      money("special", "Special allowance"),
      money("gross", "Gross"),
      money("pf", "PF (employee)"),
      money("pt", "Professional tax"),
      money("tds", "TDS"),
      money("deductions", "Total deductions"),
      money("net", "Net pay"),
      money("employerPf", "PF (employer)"),
    ],
    defaultColumns: ["code", "name", "department", "gross", "deductions", "net"],
    salary: true,
  },
];

const roleLabels: { id: Role; label: string }[] = [
  { id: "hr_operator", label: "HR operations" },
  { id: "payroll_operator", label: "Payroll operators" },
  { id: "payroll_approver", label: "Finance approvers" },
];
const PAYROLL_ROLES: Role[] = ["payroll_operator", "payroll_approver"];

function datasetFor(id: ReportDataset): Dataset {
  const found = datasets.find((item) => item.id === id);
  if (!found) throw problem(422, "UNKNOWN_DATASET", "Choose a dataset.");
  return found;
}

/* Formatting --------------------------------------------------------------- */

function statusLabel(status: SeedEmployee["status"]) {
  return { active: "Active", on_leave: "On long leave", onboarding: "Onboarding", notice: "Serving notice", exited: "Exited" }[status];
}
function typeLabel(type: SeedEmployee["type"]) {
  return type === "full_time" ? "Full-time" : type === "contract" ? "Contract" : "Intern";
}
function rupees(paiseValue: number): string {
  return paise(paiseValue);
}
function toPaise(value: string): number {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const result = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -result : result;
}
function maskedPan(employee: SeedEmployee) {
  return `XXXXX${seededInt(1000, 9999, employee.id, "pan")}${String.fromCharCode(65 + seededInt(0, 25, employee.id, "pan-check"))}`;
}
function maskedBank(employee: SeedEmployee) {
  const banks = ["HDFC", "ICIC", "SBIN", "UTIB", "KKBK"];
  return `XXXXXXXX${seededInt(1000, 9999, employee.id, "acct")} · ${banks[seededInt(0, 4, employee.id, "bank")]}0${seededInt(100000, 999999, employee.id, "ifsc")}`;
}
function one(value: number) {
  return Math.round(value * 10) / 10;
}

export function describeFilters(filters: Partial<ReportFilters>): string {
  const parts: string[] = [];
  if (filters.month) parts.push(`Month ${filters.month}`);
  if (filters.from || filters.to) parts.push(`${filters.from || "…"} to ${filters.to || "…"}`);
  if (filters.department) parts.push(`Department ${filters.department}`);
  if (filters.location) parts.push(`Location ${filters.location}`);
  if (filters.status) parts.push(`Status ${filters.status.replace("_", " ")}`);
  if (filters.leaveState) parts.push(`Leave state ${filters.leaveState}`);
  return parts.join(" · ") || "No filters";
}

/* Population --------------------------------------------------------------- */

function roster(filters: Partial<ReportFilters>): SeedEmployee[] {
  return db()
    .employees.filter((employee) => (filters.status ? employee.status === filters.status : employee.status !== "exited"))
    .filter((employee) => !filters.department || employee.department === filters.department)
    .filter((employee) => !filters.location || employee.location === filters.location)
    .sort((a, b) => a.code.localeCompare(b.code));
}

interface Member {
  code: string;
  name: string;
  department: string;
  location: string;
  type: SeedEmployee["type"];
  joinedOn: string;
  exitedOn: string | null;
  reason: string | null;
  gender: "female" | "male";
}
/** Current roster plus former employees, for headcount history. */
function everyone(filters: Partial<ReportFilters>): Member[] {
  const store = db();
  const current: Member[] = store.employees.map((employee) => ({
    code: employee.code,
    name: employee.name,
    department: employee.department,
    location: employee.location,
    type: employee.type,
    joinedOn: employee.joinedOn,
    exitedOn: employee.status === "exited" ? (store.reportsExitDates[employee.id] ?? store.today) : null,
    reason: employee.status === "exited" ? "Resignation" : null,
    gender: store.reportsGender[employee.id] ?? "male",
  }));
  const former: Member[] = store.reportsFormerEmployees.map((item) => ({
    code: item.code,
    name: item.name,
    department: item.department,
    location: item.location,
    type: item.type,
    joinedOn: item.joinedOn,
    exitedOn: item.exitedOn,
    reason: { resignation: "Resignation", termination: "Termination", contract_end: "Contract ended" }[item.exitReason],
    gender: item.gender,
  }));
  return [...current, ...former]
    .filter((member) => !filters.department || member.department === filters.department)
    .filter((member) => !filters.location || member.location === filters.location);
}
const onRoll = (members: Member[], date: string) => members.filter((m) => m.joinedOn <= date && (!m.exitedOn || m.exitedOn > date)).length;

/* Dataset rows -------------------------------------------------------------- */

function checkMonth(month: string, fallback: string): string {
  const store = db();
  const value = month || fallback;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value > monthOf(store.today))
    throw problem(422, "INVALID_MONTH", "Choose this month or an earlier one.", { fieldErrors: { month: "Choose this month or an earlier one." } });
  return value;
}

function employeeRows(filters: ReportFilters): Row[] {
  const store = db();
  return roster(filters).map((employee) => ({
    code: employee.code,
    name: employee.name,
    department: employee.department,
    location: employee.location,
    designation: employee.designation,
    manager: employee.managerId ? (employeeById(employee.managerId)?.name ?? "") : "",
    status: statusLabel(employee.status),
    type: typeLabel(employee.type),
    joinedOn: employee.joinedOn,
    tenureYears: one(Math.max(0, diffDays(employee.joinedOn, store.today)) / 365.25),
    gender: store.reportsGender[employee.id] === "female" ? "Female" : "Male",
    pan: maskedPan(employee),
    bank: maskedBank(employee),
    annualCtc: rupees(employee.annualCtc * 100),
    monthlyCtc: rupees(Math.round((employee.annualCtc * 100) / 12)),
  }));
}

function attendanceRows(filters: ReportFilters): { rows: Row[]; month: string; lateDates: Map<string, string[]> } {
  const store = db();
  const month = checkMonth(filters.month, monthOf(store.today));
  const lateDates = new Map<string, string[]>();
  const rows = roster(filters)
    .filter((employee) => employee.joinedOn <= lastDayOfMonth(month))
    .map((employee) => {
      const days = daysInMonth(month)
        .filter((date) => date < store.today)
        .map((date) => attendanceDay(employee, date))
        .filter((day) => day !== null);
      const count = (...states: string[]) => days.filter((day) => states.includes(day.state)).length;
      lateDates.set(employee.code, days.filter((day) => day.state === "late").map((day) => day.date));
      return {
        code: employee.code,
        name: employee.name,
        department: employee.department,
        location: employee.location,
        present: count("present"),
        late: count("late"),
        halfDay: count("half_day"),
        leave: count("leave"),
        absent: count("absent"),
        needsReview: count("needs_review"),
        holidays: count("holiday"),
        weeklyOff: count("weekly_off"),
        workedHours: one(days.reduce((sum, day) => sum + day.workedMinutes, 0) / 60),
        overtimeHours: one(days.reduce((sum, day) => sum + day.overtimeMinutes, 0) / 60),
      };
    });
  return { rows, month, lateDates };
}

function overlaps(request: MockLeaveRequest, from: string, to: string) {
  return (!to || request.startDate <= to) && (!from || request.endDate >= from);
}
function leaveRequestRows(filters: ReportFilters): Row[] {
  const store = db();
  const people = new Map(roster(filters).map((employee) => [employee.id, employee]));
  const names = new Map(leaveTypes().map((type) => [type.id, type.name]));
  return store.leaveRequests
    .filter((request) => people.has(request.employeeId))
    .filter((request) => !filters.leaveState || request.state === filters.leaveState)
    .filter((request) => overlaps(request, filters.from, filters.to))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((request) => {
      const employee = people.get(request.employeeId) as SeedEmployee;
      return {
        reference: request.reference,
        code: employee.code,
        name: employee.name,
        department: employee.department,
        location: employee.location,
        leaveType: names.get(request.leaveTypeId) ?? "Leave",
        from: request.startDate,
        to: request.endDate,
        days: request.halves / 2,
        state: request.state.charAt(0).toUpperCase() + request.state.slice(1),
        submittedOn: request.submittedAt.slice(0, 10),
        approver: request.approverId ? (employeeById(request.approverId)?.name ?? "") : "",
      };
    });
}

function leaveBalanceRows(filters: ReportFilters): Row[] {
  const store = db();
  const year = store.today.slice(0, 4);
  const types = leaveTypes().filter((type) => type.entitledHalves !== null && type.active);
  const rows: Row[] = [];
  for (const employee of roster(filters)) {
    const mine = store.leaveRequests.filter((request) => request.employeeId === employee.id && request.startDate.startsWith(year));
    for (const type of types) {
      const used = mine.filter((r) => r.leaveTypeId === type.id && r.state === "approved").reduce((sum, r) => sum + r.halves, 0);
      const pending = mine.filter((r) => r.leaveTypeId === type.id && r.state === "pending").reduce((sum, r) => sum + r.halves, 0);
      const entitled = type.entitledHalves ?? 0;
      rows.push({
        code: employee.code,
        name: employee.name,
        department: employee.department,
        location: employee.location,
        leaveType: type.name,
        entitled: Number(halves(entitled)),
        used: Number(halves(used)),
        pending: Number(halves(pending)),
        available: Number(halves(entitled - used - pending)),
      });
    }
  }
  return rows;
}

function payrollRows(filters: ReportFilters): { rows: Row[]; month: string } {
  const store = db();
  const current = monthOf(store.today);
  const month = checkMonth(filters.month, addMonths(current, -1));
  const rows: Row[] = [];
  for (const employee of roster({ ...filters, status: "" })) {
    const result = calculate(employee, month, month === current);
    if (!result) continue;
    const line = (list: { code: string; paise: number }[], code: string) => list.find((item) => item.code === code)?.paise ?? 0;
    rows.push({
      code: employee.code,
      name: employee.name,
      department: employee.department,
      location: employee.location,
      payableDays: result.payableDays,
      lopDays: result.lopDays,
      basic: rupees(line(result.earnings, "BASIC") || line(result.earnings, "STIP")),
      hra: rupees(line(result.earnings, "HRA")),
      special: rupees(line(result.earnings, "SPL") + line(result.earnings, "ARR")),
      gross: rupees(result.gross),
      pf: rupees(line(result.deductions, "PF")),
      pt: rupees(line(result.deductions, "PT")),
      tds: rupees(line(result.deductions, "TDS")),
      deductions: rupees(result.deductionsTotal),
      net: rupees(result.net),
      employerPf: rupees(line(result.employer, "EPF")),
    });
  }
  return { rows, month };
}

function datasetRows(dataset: ReportDataset, filters: ReportFilters): { rows: Row[]; note: string | null } {
  if (dataset === "employees") return { rows: employeeRows(filters), note: "PAN and bank account are always masked in reports." };
  if (dataset === "attendance") {
    const { rows, month } = attendanceRows(filters);
    return { rows, note: `Attendance for ${formatDate(month, "month")}, days up to yesterday.` };
  }
  if (dataset === "leave_requests") return { rows: leaveRequestRows(filters), note: null };
  if (dataset === "leave_balances") return { rows: leaveBalanceRows(filters), note: `Policy year ${db().today.slice(0, 4)}; available = entitled − used − pending.` };
  const { rows, month } = payrollRows(filters);
  return { rows, note: `Synthetic calculation for ${formatDate(month, "month")} — not the payroll engine of record.` };
}

/* Table engine ------------------------------------------------------------- */

function compare(a: ReportCell, b: ReportCell, kind: ReportColumn["kind"]): number {
  if (a === null || a === "") return b === null || b === "" ? 0 : 1;
  if (b === null || b === "") return -1;
  if (kind === "money") return toPaise(String(a)) - toPaise(String(b));
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-IN", { numeric: true });
}

function sortRows(rows: Row[], column: ReportColumn | undefined, direction: "asc" | "desc") {
  if (!column) return rows;
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => factor * compare(a[column.key] ?? null, b[column.key] ?? null, column.kind));
}

function aggregateValue(values: ReportCell[], fn: "sum" | "avg", kind: ReportColumn["kind"]): ReportCell {
  if (kind === "money") {
    const total = values.reduce<number>((sum, value) => sum + toPaise(String(value ?? "0")), 0);
    return rupees(fn === "sum" ? total : values.length ? Math.round(total / values.length) : 0);
  }
  const total = values.reduce<number>((sum, value) => sum + (typeof value === "number" ? value : Number(value ?? 0)), 0);
  const result = fn === "sum" ? total : values.length ? total / values.length : 0;
  return Math.round(result * 100) / 100;
}

/** Runs a custom spec against the actor's field scope. */
export function runSpec(actor: MockActor, spec: ReportSpec, options: { limit?: number; title?: string } = {}): ReportTable {
  requireCapability(actor, "report.build");
  const dataset = datasetFor(spec.dataset);
  if (dataset.salary) requireSalary(actor);
  const allowedSalary = salaryAccess(actor);
  const byKey = new Map(dataset.columns.map((column) => [column.key, column]));
  const unknown = spec.columns.filter((key) => !byKey.has(key));
  if (unknown.length) throw problem(422, "UNKNOWN_COLUMN", "Some columns don't belong to this dataset.", { fieldErrors: { columns: `Remove ${unknown.join(", ")}.` } });
  const hidden = spec.columns.filter((key) => byKey.get(key)?.salary && !allowedSalary);
  const chosen = spec.columns.filter((key) => !hidden.includes(key)).map((key) => byKey.get(key) as ReportColumn);
  if (chosen.length === 0) throw problem(422, "NO_COLUMNS", "Choose at least one column you can view.", { fieldErrors: { columns: "Choose at least one column you can view." } });

  const { rows: raw, note } = datasetRows(spec.dataset, spec.filters);
  const notes = [note, hidden.length ? `Salary columns hidden for your role: ${hidden.map((key) => byKey.get(key)?.label).join(", ")}.` : null].filter((item): item is string => Boolean(item));

  let columns: ReportTable["columns"];
  let rows: Row[];
  if (spec.groupBy) {
    const group = byKey.get(spec.groupBy);
    if (!group || (group.salary && !allowedSalary) || group.pii) throw problem(422, "INVALID_GROUP", "Group by a non-salary text column.", { fieldErrors: { groupBy: "Choose a column to group by." } });
    const fn = spec.aggregate?.fn ?? "count";
    const target = spec.aggregate?.column ? byKey.get(spec.aggregate.column) : undefined;
    if (fn !== "count" && (!target || (target.kind !== "number" && target.kind !== "money")))
      throw problem(422, "INVALID_AGGREGATE", "Sum and average need a number or amount column.", { fieldErrors: { aggCol: "Pick a number or amount column." } });
    if (target?.salary && !allowedSalary) throw problem(403, "SALARY_RESTRICTED", "Salary columns need payroll or compensation access.");
    const buckets = new Map<string, Row[]>();
    for (const row of raw) {
      const key = String(row[group.key] ?? "—");
      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }
    columns = [{ key: group.key, label: group.label, kind: group.kind }, { key: "count", label: "Count", kind: "number" }];
    if (fn !== "count" && target) columns.push({ key: "value", label: `${fn === "sum" ? "Sum" : "Average"} of ${target.label}`, kind: target.kind });
    rows = [...buckets.entries()].map(([key, items]) => ({
      [group.key]: key,
      count: items.length,
      ...(fn !== "count" && target ? { value: aggregateValue(items.map((item) => item[target.key] ?? null), fn, target.kind) } : {}),
    }));
    const sortKey = spec.sort?.column === spec.aggregate?.column && fn !== "count" ? "value" : spec.sort?.column === "count" ? "count" : group.key;
    const sortColumn = columns.find((column) => column.key === sortKey);
    rows = sortRows(rows, sortColumn ? { ...sortColumn, salary: false, pii: false } : undefined, spec.sort?.direction ?? "asc");
    notes.push(`Grouped by ${group.label}: ${raw.length} records in ${rows.length} groups.`);
  } else {
    const sortColumn = spec.sort ? byKey.get(spec.sort.column) : undefined;
    if (sortColumn && sortColumn.salary && !allowedSalary) throw problem(403, "SALARY_RESTRICTED", "Salary columns need payroll or compensation access.");
    columns = chosen.map(({ key, label, kind }) => ({ key, label, kind }));
    rows = sortRows(raw, sortColumn, spec.sort?.direction ?? "asc").map((row) => Object.fromEntries(chosen.map((column) => [column.key, row[column.key] ?? null])));
  }
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  return { title: options.title ?? `${dataset.label} report`, columns, rows: rows.slice(0, limit), totalRows: rows.length, truncated: rows.length > limit, notes };
}

/* Standard reports ---------------------------------------------------------- */

function addMonthsToDate(iso: string, months: number) {
  const month = addMonths(iso.slice(0, 7), months);
  const last = lastDayOfMonth(month);
  const day = `${month}-${iso.slice(8)}`;
  return day > last ? last : day;
}
const table = (title: string, columns: ReportColumn[], rows: Row[], notes: string[] = []): ReportTable => ({
  title,
  columns: columns.map(({ key, label, kind }) => ({ key, label, kind })),
  rows,
  totalRows: rows.length,
  truncated: false,
  notes,
});

export function standardReport(actor: MockActor, key: StandardReportKey, input: Partial<ReportFilters>): ReportTable {
  requireCapability(actor, "report.read");
  const definition = standardReports.find((report) => report.key === key);
  if (!definition) throw problem(404, "UNKNOWN_REPORT", "This report doesn't exist.");
  if (definition.salary) requireSalary(actor);
  const store = db();
  const filters: ReportFilters = { department: "", location: "", status: "", leaveState: "", month: "", from: "", to: "", ...input };
  if (filters.from && filters.to && filters.from > filters.to) throw problem(422, "INVALID_RANGE", "The end date must be on or after the start date.", { fieldErrors: { to: "The end date must be on or after the start date." } });
  const current = monthOf(store.today);

  switch (key) {
    case "headcount": {
      const rows = employeeRows(filters);
      return table("Headcount", datasetFor("employees").columns.filter((c) => ["code", "name", "designation", "department", "location", "type", "status", "joinedOn"].includes(c.key)), rows, [`${rows.length} employees · ${describeFilters(filters)}`]);
    }
    case "joiners_leavers": {
      const from = filters.from || addDays(store.today, -90);
      const to = filters.to || store.today;
      const rows: Row[] = [];
      for (const member of everyone(filters)) {
        if (member.joinedOn >= from && member.joinedOn <= to) rows.push({ movement: "Joiner", date: member.joinedOn, code: member.code, name: member.name, department: member.department, location: member.location, type: typeLabel(member.type), reason: "" });
        if (member.exitedOn && member.exitedOn >= from && member.exitedOn <= to) rows.push({ movement: "Leaver", date: member.exitedOn, code: member.code, name: member.name, department: member.department, location: member.location, type: typeLabel(member.type), reason: member.reason ?? "" });
      }
      rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const joiners = rows.filter((row) => row.movement === "Joiner").length;
      return table(
        "Joiners & leavers",
        [col("movement", "Movement"), col("date", "Date", "date"), ...person.slice(0, 2), col("department", "Department"), col("location", "Location"), col("type", "Type"), col("reason", "Exit reason")],
        rows,
        [`${formatDate(from)} to ${formatDate(to)}: ${joiners} joiners, ${rows.length - joiners} leavers.`, "Includes synthetic former-employee history."],
      );
    }
    case "attrition": {
      const end = checkMonth(filters.month, current);
      const members = everyone(filters);
      const rows: Row[] = [];
      for (let back = 11; back >= 0; back -= 1) {
        const month = addMonths(end, -back);
        const first = `${month}-01`;
        const last = month === current ? store.today : lastDayOfMonth(month);
        const opening = onRoll(members, addDays(first, -1));
        const closing = onRoll(members, last);
        const joiners = members.filter((m) => m.joinedOn >= first && m.joinedOn <= last).length;
        const leavers = members.filter((m) => m.exitedOn && m.exitedOn >= first && m.exitedOn <= last).length;
        const average = (opening + closing) / 2;
        const monthly = average ? (leavers / average) * 100 : 0;
        rows.push({ month: formatDate(month, "month"), opening, joiners, leavers, closing, attritionPct: monthly.toFixed(1), annualizedPct: (monthly * 12).toFixed(1) });
      }
      return table(
        "Attrition",
        [col("month", "Month"), col("opening", "Opening headcount", "number"), col("joiners", "Joiners", "number"), col("leavers", "Leavers", "number"), col("closing", "Closing headcount", "number"), col("attritionPct", "Monthly attrition %", "number"), col("annualizedPct", "Annualized %", "number")],
        rows,
        ["Attrition % = leavers ÷ average of opening and closing headcount. Annualized = monthly × 12.", "Includes synthetic former-employee history."],
      );
    }
    case "probation_due": {
      const months = probationDefaults();
      const rows: Row[] = [];
      for (const employee of roster(filters)) {
        const length = months[employee.type];
        if (!length) continue;
        const ends = addMonthsToDate(employee.joinedOn, length);
        const left = diffDays(store.today, ends);
        if (left < -30) continue;
        rows.push({ code: employee.code, name: employee.name, department: employee.department, location: employee.location, type: typeLabel(employee.type), joinedOn: employee.joinedOn, probationMonths: length, probationEnds: ends, daysLeft: left, state: left < 0 ? "Confirmation overdue" : left <= 30 ? "Due within 30 days" : "In probation" });
      }
      rows.sort((a, b) => Number(a.daysLeft) - Number(b.daysLeft));
      return table(
        "Probation due",
        [...person, col("type", "Type"), col("joinedOn", "Joined on", "date"), col("probationMonths", "Probation (months)", "number"), col("probationEnds", "Probation ends", "date"), col("daysLeft", "Days left", "number"), col("state", "State")],
        rows,
        [`Probation length follows the HR defaults: full-time ${months.full_time}, contract ${months.contract}, intern ${months.intern} months.`],
      );
    }
    case "celebrations": {
      const month = checkMonth(filters.month, current);
      const mm = month.slice(5);
      const rows: Row[] = [];
      for (const employee of roster(filters)) {
        const birthday = store.reportsBirthdays[employee.id];
        if (birthday?.startsWith(mm)) rows.push({ date: `${month}-${birthday.slice(3)}`, kind: "Birthday", code: employee.code, name: employee.name, department: employee.department, detail: "" });
        const years = Number(month.slice(0, 4)) - Number(employee.joinedOn.slice(0, 4));
        if (employee.joinedOn.slice(5, 7) === mm && years > 0) rows.push({ date: `${month}-${employee.joinedOn.slice(8)}`, kind: "Work anniversary", code: employee.code, name: employee.name, department: employee.department, detail: `${years} year${years === 1 ? "" : "s"}` });
      }
      rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return table("Birthdays & anniversaries", [col("date", "Date", "date"), col("kind", "Occasion"), col("code", "Employee code"), col("name", "Name"), col("department", "Department"), col("detail", "Detail")], rows, [
        "Birthdays are synthetic demo values; real dates of birth are restricted personal data.",
      ]);
    }
    case "attendance_summary": {
      const { rows, month } = attendanceRows(filters);
      return table("Attendance summary", datasetFor("attendance").columns, rows, [`${formatDate(month, "month")}, days up to yesterday.`]);
    }
    case "late_coming": {
      const { rows, month, lateDates } = attendanceRows(filters);
      const late = rows
        .filter((row) => Number(row.late) > 0)
        .map((row): Row => ({ code: row.code ?? null, name: row.name ?? null, department: row.department ?? null, location: row.location ?? null, late: row.late ?? null, dates: (lateDates.get(String(row.code)) ?? []).map((date) => date.slice(8)).join(", ") }))
        .sort((a, b) => Number(b.late) - Number(a.late));
      return table("Late coming", [...person, col("late", "Late days", "number"), col("dates", "Dates (day of month)")], late, [`${formatDate(month, "month")}: check-ins after the shift grace period.`]);
    }
    case "leave_balances":
      return table("Leave balances", datasetFor("leave_balances").columns, leaveBalanceRows(filters), [`Policy year ${store.today.slice(0, 4)}.`]);
    case "leave_availed": {
      const from = filters.from || `${store.today.slice(0, 4)}-01-01`;
      const to = filters.to || store.today;
      const rows = leaveRequestRows({ ...filters, leaveState: "approved", from, to });
      return table("Leave availed", datasetFor("leave_requests").columns.filter((c) => c.key !== "state" && c.key !== "submittedOn"), rows, [`Approved leave overlapping ${formatDate(from)} to ${formatDate(to)}.`]);
    }
    case "salary_register": {
      const { rows, month } = payrollRows(filters);
      return table("Salary register", datasetFor("payroll_register").columns, rows, [`${formatDate(month, "month")} · synthetic calculation, not the payroll engine of record.`]);
    }
    case "ctc_by_department": {
      const people = roster(filters);
      const rows: Row[] = departmentNames()
        .map((department) => {
          const list = people.filter((employee) => employee.department === department).map((employee) => employee.annualCtc * 100);
          if (!list.length) return null;
          const total = list.reduce((sum, value) => sum + value, 0);
          return { department, headcount: list.length, total: rupees(total), average: rupees(Math.round(total / list.length)), lowest: rupees(Math.min(...list)), highest: rupees(Math.max(...list)) };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      return table("CTC by department", [col("department", "Department"), col("headcount", "Headcount", "number"), money("total", "Total annual CTC"), money("average", "Average CTC"), money("lowest", "Lowest CTC"), money("highest", "Highest CTC")], rows, ["Synthetic annual CTC from the demo roster."]);
    }
  }
}

/* Library, analytics, builder context -------------------------------------- */

export function reportLibrary(actor: MockActor): ReportLibrary {
  requireCapability(actor, "report.read");
  const store = db();
  const allowed = salaryAccess(actor);
  return {
    reports: standardReports.filter((report) => !report.salary || allowed),
    salaryAccess: allowed,
    statutoryAccess: can(actor, "statutory.manage"),
    departments: departmentNames(),
    locations: locationNames(),
    today: store.today,
    currentMonth: monthOf(store.today),
  };
}

export function reportAnalytics(actor: MockActor): ReportAnalytics {
  requireCapability(actor, "report.read");
  const store = db();
  const members = everyone({});
  const current = monthOf(store.today);
  const trend: ReportAnalytics["trend"] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const month = addMonths(current, -back);
    const first = `${month}-01`;
    const last = month === current ? store.today : lastDayOfMonth(month);
    const opening = onRoll(members, addDays(first, -1));
    const closing = onRoll(members, last);
    const leavers = members.filter((m) => m.exitedOn && m.exitedOn >= first && m.exitedOn <= last).length;
    const average = (opening + closing) / 2;
    trend.push({
      month,
      label: formatDate(month, "month").replace(/ (\d{4})$/, (_, year: string) => ` ’${year.slice(2)}`),
      headcount: closing,
      joiners: members.filter((m) => m.joinedOn >= first && m.joinedOn <= last).length,
      leavers,
      attritionPct: (average ? (leavers / average) * 1200 : 0).toFixed(1),
    });
  }
  const yearAgo = addDays(store.today, -365);
  const leftInYear = members.filter((m) => m.exitedOn && m.exitedOn > yearAgo && m.exitedOn <= store.today);
  const averageHeadcount = trend.reduce((sum, row) => sum + row.headcount, 0) / trend.length;
  const active = store.employees.filter((employee) => employee.status !== "exited");
  const count = (names: string[], pick: (employee: SeedEmployee) => string) => names.map((name) => ({ name, count: active.filter((employee) => pick(employee) === name).length })).filter((row) => row.count > 0);
  const years = (joined: string) => diffDays(joined, store.today) / 365.25;
  const bands = [["Under 1 year", 0, 1], ["1–3 years", 1, 3], ["3–5 years", 3, 5], ["5+ years", 5, 99]] as const;
  return {
    asOf: store.today,
    headcount: active.length,
    trend,
    attrition: {
      leavers: leftInYear.length,
      averageHeadcount: averageHeadcount.toFixed(1),
      annualizedPct: (averageHeadcount ? (leftInYear.length / averageHeadcount) * 100 : 0).toFixed(1),
      voluntary: leftInYear.filter((m) => m.reason === "Resignation").length,
    },
    byDepartment: count(departmentNames(), (employee) => employee.department).sort((a, b) => b.count - a.count),
    byLocation: count(locationNames(), (employee) => employee.location).sort((a, b) => b.count - a.count),
    byGender: count(["Female", "Male"], (employee) => (store.reportsGender[employee.id] === "female" ? "Female" : "Male")),
    tenure: bands.map(([name, min, max]) => ({ name, count: active.filter((employee) => years(employee.joinedOn) >= min && years(employee.joinedOn) < max).length })),
    byType: count(["Full-time", "Contract", "Intern"], (employee) => typeLabel(employee.type)),
  };
}

/** People whose role grants report.read (schedule recipients). */
function reportRecipients(): { employeeId: string; salary: boolean }[] {
  return (Object.keys(personas) as Persona[])
    .map((persona) => actorFor(persona))
    .filter((actor) => can(actor, "report.read"))
    .map((actor) => ({ employeeId: actor.employeeId, salary: salaryAccess(actor) }));
}

export function builderContext(actor: MockActor): BuilderContext {
  requireCapability(actor, "report.build");
  const allowed = salaryAccess(actor);
  const store = db();
  return {
    datasets: datasets.filter((dataset) => !dataset.salary || allowed).map((dataset) => ({ ...dataset, columns: dataset.columns.filter((column) => !column.salary || allowed) })),
    departments: departmentNames(),
    locations: locationNames(),
    currentMonth: monthOf(store.today),
    salaryAccess: allowed,
    roles: roleLabels,
    recipients: reportRecipients()
      .map((item) => refById(item.employeeId))
      .filter((item): item is PersonRef => item !== null),
  };
}

/* Saved reports ------------------------------------------------------------- */

function specHasSalary(spec: ReportSpec): boolean {
  const dataset = datasetFor(spec.dataset);
  if (dataset.salary) return true;
  const salaryKeys = new Set(dataset.columns.filter((column) => column.salary).map((column) => column.key));
  return spec.columns.some((key) => salaryKeys.has(key)) || Boolean(spec.aggregate?.column && salaryKeys.has(spec.aggregate.column));
}

function visible(actor: MockActor, report: MockSavedReport) {
  if (report.ownerId === actor.employeeId) return true;
  if (report.visibility !== "shared" || !report.sharedRoles.some((role) => actor.roles.includes(role))) return false;
  return !datasetFor(report.spec.dataset).salary || salaryAccess(actor);
}

function nextRun(schedule: MockReportSchedule): string | null {
  if (!schedule.active) return null;
  const store = db();
  const now = Date.now();
  for (let offset = 0; offset <= 62; offset += 1) {
    const date = addDays(store.today, offset);
    const iso = weekday(date) === 0 ? 7 : weekday(date);
    const matches = schedule.frequency === "daily" || (schedule.frequency === "weekly" && iso === schedule.weekday) || (schedule.frequency === "monthly" && Number(date.slice(8)) === schedule.dayOfMonth);
    if (!matches) continue;
    const at = zonedInstant(date, schedule.time);
    if (new Date(at).getTime() > now) return at;
  }
  return null;
}

function toSchedule(schedule: MockReportSchedule | null): ReportSchedule | null {
  if (!schedule) return null;
  return {
    frequency: schedule.frequency,
    weekday: schedule.weekday,
    dayOfMonth: schedule.dayOfMonth,
    time: schedule.time,
    format: schedule.format,
    recipients: schedule.recipientIds.map((id) => refById(id)).filter((item): item is PersonRef => item !== null),
    active: schedule.active,
    nextRunAt: nextRun(schedule),
  };
}

function toSaved(actor: MockActor, report: MockSavedReport): SavedReport {
  const owner = refById(report.ownerId);
  const dataset = datasetFor(report.spec.dataset);
  const salaryKeys = new Set(dataset.columns.filter((column) => column.salary).map((column) => column.key));
  return {
    id: report.id,
    name: report.name,
    description: report.description,
    spec: report.spec,
    visibility: report.visibility,
    sharedRoles: report.sharedRoles,
    owner: owner ?? { id: report.ownerId, name: "Former colleague", initials: "FC", designation: "", photoUrl: null },
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    version: report.version,
    canEdit: report.ownerId === actor.employeeId,
    hiddenColumns: salaryAccess(actor) ? [] : report.spec.columns.filter((key) => salaryKeys.has(key)),
    schedule: toSchedule(report.schedule),
    lastRunAt: report.lastRunAt,
  };
}

export function listSavedReports(actor: MockActor): SavedReport[] {
  requireCapability(actor, "report.build");
  return db()
    .reportsSaved.filter((report) => visible(actor, report))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((report) => toSaved(actor, report));
}

function findVisible(actor: MockActor, id: string): MockSavedReport {
  const report = db().reportsSaved.find((item) => item.id === id);
  if (!report || !visible(actor, report)) throw problem(404, "REPORT_NOT_FOUND", "This saved report doesn't exist or isn't shared with you.");
  return report;
}
function findOwned(actor: MockActor, id: string): MockSavedReport {
  const report = findVisible(actor, id);
  if (report.ownerId !== actor.employeeId) throw problem(403, "NOT_OWNER", "Only the report owner can change it.");
  return report;
}

export function savedReport(actor: MockActor, id: string): SavedReport {
  requireCapability(actor, "report.build");
  return toSaved(actor, findVisible(actor, id));
}

export function saveReport(actor: MockActor, input: SaveReportInput, key: string | undefined) {
  requireCapability(actor, "report.build");
  // Validates columns, grouping and salary scope before anything is stored.
  runSpec(actor, input.spec, { limit: 1 });
  const sharedRoles = input.visibility === "shared" ? input.sharedRoles : [];
  if (input.visibility === "shared" && sharedRoles.length === 0) throw problem(422, "NO_ROLES", "Choose who to share with.", { fieldErrors: { sharedRoles: "Choose at least one role to share with." } });
  if (specHasSalary(input.spec) && sharedRoles.some((role) => !PAYROLL_ROLES.includes(role)))
    throw problem(422, "SALARY_SHARE", "Reports with salary figures can be shared only with payroll roles.", { fieldErrors: { sharedRoles: "Reports with salary figures can be shared only with payroll operators and Finance approvers." } });
  const store = db();
  const clash = store.reportsSaved.find((report) => report.ownerId === actor.employeeId && report.name.toLowerCase() === input.name.toLowerCase() && report.id !== input.id);
  if (clash) throw problem(409, "NAME_TAKEN", "You already have a report with this name.", { fieldErrors: { name: "You already have a report with this name." } });

  if (input.id) {
    const report = findOwned(actor, input.id);
    versionCheck(report.version, input.version);
    Object.assign(report, { name: input.name, description: input.description, visibility: input.visibility, sharedRoles, spec: input.spec, updatedAt: nowInstant(), version: report.version + 1 });
    if (report.schedule && specHasSalary(input.spec)) report.schedule.recipientIds = report.schedule.recipientIds.filter((id) => reportRecipients().some((item) => item.employeeId === id && item.salary));
    return { id: report.id, reference: report.id };
  }
  return idempotent(key, () => {
    const id = nextId("rpt");
    store.reportsSaved.push({ id, name: input.name, description: input.description, spec: input.spec, visibility: input.visibility, sharedRoles, ownerId: actor.employeeId, createdAt: nowInstant(), updatedAt: nowInstant(), version: 1, schedule: null, lastRunAt: null });
    return { id, reference: id };
  });
}

export function deleteSavedReport(actor: MockActor, id: string) {
  requireCapability(actor, "report.build");
  const report = findOwned(actor, id);
  const store = db();
  store.reportsSaved = store.reportsSaved.filter((item) => item.id !== report.id);
  return { ok: true };
}

export function scheduleReport(actor: MockActor, input: ScheduleInput) {
  requireCapability(actor, "report.build");
  const report = findOwned(actor, input.reportId);
  const allowed = reportRecipients();
  const unknown = input.recipients.filter((id) => !allowed.some((item) => item.employeeId === id));
  if (unknown.length) throw problem(422, "INVALID_RECIPIENT", "Recipients need report access.", { fieldErrors: { recipients: "Recipients must hold report access." } });
  if (specHasSalary(report.spec) && input.recipients.some((id) => !allowed.find((item) => item.employeeId === id)?.salary))
    throw problem(422, "SALARY_RECIPIENT", "Salary reports go only to payroll and Finance recipients.", { fieldErrors: { recipients: "This report has salary figures — choose payroll or Finance recipients only." } });
  report.schedule = { frequency: input.frequency, weekday: input.weekday, dayOfMonth: input.dayOfMonth, time: input.time, format: input.format, recipientIds: [...new Set(input.recipients)], active: input.active };
  report.updatedAt = nowInstant();
  return { ok: true, nextRunAt: nextRun(report.schedule) };
}

export function removeSchedule(actor: MockActor, id: string) {
  requireCapability(actor, "report.build");
  const report = findOwned(actor, id);
  report.schedule = null;
  return { ok: true };
}

/** Simulates one scheduled delivery now: the file is generated, never emailed. */
export function runScheduleNow(actor: MockActor, id: string) {
  requireCapability(actor, "report.build");
  const report = findOwned(actor, id);
  if (!report.schedule) throw problem(409, "NOT_SCHEDULED", "Set a schedule first.");
  const result = runSpec(actor, report.spec, { title: report.name });
  const store = db();
  const at = nowInstant();
  store.reportsDeliveries.push({ id: nextId("rdl"), savedReportId: report.id, reportName: report.name, at, recipientIds: [...report.schedule.recipientIds], rowCount: result.totalRows, format: report.schedule.format, trigger: "manual" });
  logExport(actor, report.name, "schedule", report.schedule.format, result.totalRows, "Run now (schedule)");
  report.lastRunAt = at;
  return { ok: true, rowCount: result.totalRows };
}

export function deliveryLog(actor: MockActor): DeliveryLogEntry[] {
  requireCapability(actor, "report.build");
  const store = db();
  const ids = new Set(store.reportsSaved.filter((report) => visible(actor, report)).map((report) => report.id));
  return store.reportsDeliveries
    .filter((entry) => ids.has(entry.savedReportId))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30)
    .map((entry) => ({
      id: entry.id,
      savedReportId: entry.savedReportId,
      reportName: entry.reportName,
      at: entry.at,
      recipients: entry.recipientIds.map((recipient) => employeeById(recipient)?.name ?? recipient),
      rowCount: entry.rowCount,
      format: entry.format,
      trigger: entry.trigger,
    }));
}

/* Export + audit ------------------------------------------------------------ */

function logExport(actor: MockActor, report: string, source: ExportLogEntry["source"], format: ExportFormat, rowCount: number, filters: string) {
  db().reportsExportLog.push({ id: nextId("rxl"), at: nowInstant(), actorId: actor.employeeId, report, source, format, rowCount, filters });
}

/** For downloads served by other handlers (e.g. the employee directory CSV). */
export function recordExport(actor: MockActor, report: string, rowCount: number, filters: string) {
  requireCapability(actor, "report.read");
  logExport(actor, report, "standard", "csv", rowCount, filters);
  return { ok: true };
}

export function exportLog(actor: MockActor): ExportLogEntry[] {
  requireCapability(actor, "report.read");
  return db()
    .reportsExportLog.slice()
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 50)
    .map((entry) => {
      const employee = employeeById(entry.actorId);
      return {
        id: entry.id,
        at: entry.at,
        actor: employee ? ref(employee) : { id: entry.actorId, name: "Unknown", initials: "?", designation: "", photoUrl: null },
        report: entry.report,
        source: entry.source,
        format: entry.format,
        rowCount: entry.rowCount,
        filters: entry.filters,
      };
    });
}

function csvCell(value: ReportCell): string {
  const text = value === null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
function toCsv(result: ReportTable, meta: string): string {
  return [
    [`GTF HR · ${result.title}`, meta, `Generated ${db().today}`].map(csvCell).join(","),
    "",
    result.columns.map((column) => csvCell(column.label)).join(","),
    ...result.rows.map((row) => result.columns.map((column) => csvCell(row[column.key] ?? null)).join(",")),
  ].join("\r\n");
}
function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** Excel 2003 SpreadsheetML: opens in Excel/LibreOffice without a library. */
function toSpreadsheetMl(result: ReportTable, meta: string): string {
  const cell = (value: ReportCell, kind: ReportColumn["kind"]) => {
    if (value === null || value === "") return "<Cell/>";
    const numeric = (kind === "number" || kind === "money") && /^-?\d+(\.\d+)?$/.test(String(value));
    return `<Cell${kind === "money" ? ' ss:StyleID="money"' : ""}><Data ss:Type="${numeric ? "Number" : "String"}">${xml(String(value))}</Data></Cell>`;
  };
  const sheet = result.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles><Style ss:ID="head"><Font ss:Bold="1"/></Style><Style ss:ID="money"><NumberFormat ss:Format="#,##0.00"/></Style></Styles>',
    `<Worksheet ss:Name="${xml(sheet)}"><Table>`,
    `<Row><Cell ss:StyleID="head"><Data ss:Type="String">${xml(`GTF HR · ${result.title}`)}</Data></Cell><Cell><Data ss:Type="String">${xml(meta)}</Data></Cell><Cell><Data ss:Type="String">${xml(`Generated ${db().today}`)}</Data></Cell></Row>`,
    "<Row/>",
    `<Row>${result.columns.map((column) => `<Cell ss:StyleID="head"><Data ss:Type="String">${xml(column.label)}</Data></Cell>`).join("")}</Row>`,
    ...result.rows.map((row) => `<Row>${result.columns.map((column) => cell(row[column.key] ?? null, column.kind)).join("")}</Row>`),
    "</Table></Worksheet></Workbook>",
  ].join("\n");
}

function file(result: ReportTable, format: ExportFormat, slug: string, meta: string): ExportFile {
  const base = `gtf-${slug}-${db().today}`;
  return format === "xls"
    ? { fileName: `${base}.xls`, contentType: "application/vnd.ms-excel; charset=utf-8", content: toSpreadsheetMl(result, meta), rowCount: result.totalRows }
    : { fileName: `${base}.csv`, contentType: "text/csv; charset=utf-8", content: `﻿${toCsv(result, meta)}`, rowCount: result.totalRows };
}
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "report";

export function exportStandard(actor: MockActor, key: StandardReportKey, filters: Partial<ReportFilters>, format: ExportFormat): ExportFile {
  const result = standardReport(actor, key, filters);
  const meta = describeFilters(filters);
  logExport(actor, result.title, "standard", format, result.totalRows, meta);
  return file(result, format, slugify(result.title), meta);
}

export function exportCustom(actor: MockActor, spec: ReportSpec, format: ExportFormat): ExportFile {
  const result = runSpec(actor, spec);
  const meta = describeFilters(spec.filters);
  logExport(actor, result.title, "custom", format, result.totalRows, meta);
  return file(result, format, slugify(result.title), meta);
}

export function exportSaved(actor: MockActor, id: string, format: ExportFormat): ExportFile {
  requireCapability(actor, "report.build");
  const report = findVisible(actor, id);
  const result = runSpec(actor, report.spec, { title: report.name });
  const meta = describeFilters(report.spec.filters);
  logExport(actor, report.name, "saved", format, result.totalRows, meta);
  report.lastRunAt = nowInstant();
  return file(result, format, slugify(report.name), meta);
}

export function standardDefinitions(): StandardReport[] {
  return standardReports;
}
