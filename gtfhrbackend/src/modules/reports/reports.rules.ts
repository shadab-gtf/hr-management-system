/*
 * Pure reporting rules: catalog, salary scoping, table engine (sort, group,
 * aggregate), CSV/SpreadsheetML output, schedule timing and workforce maths.
 * No I/O and no clock: callers pass `today` and `nowMs`.
 */

export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type ColumnKind = "text" | "number" | "date" | "money";
export type RoleName = "employee" | "manager" | "hr_operator" | "payroll_operator" | "payroll_approver";
export type FilterKind = "month" | "range" | "department" | "location" | "status" | "leaveState";
export type DatasetId = "employees" | "attendance" | "leave_requests" | "leave_balances" | "payroll_register";
export type StandardKey =
  | "headcount"
  | "joiners_leavers"
  | "attrition"
  | "probation_due"
  | "celebrations"
  | "attendance_summary"
  | "late_coming"
  | "leave_balances"
  | "leave_availed"
  | "salary_register"
  | "ctc_by_department";

export interface Column {
  key: string;
  label: string;
  kind: ColumnKind;
  salary: boolean;
  pii: boolean;
}
export interface DatasetDef {
  id: DatasetId;
  label: string;
  description: string;
  filters: FilterKind[];
  columns: Column[];
  defaultColumns: string[];
  salary: boolean;
}
export interface StandardDef {
  key: StandardKey;
  category: "people" | "time" | "payroll" | "compliance";
  title: string;
  description: string;
  filters: FilterKind[];
  salary: boolean;
}
export interface Filters {
  department: string;
  location: string;
  status: "" | "active" | "on_leave" | "onboarding" | "notice" | "exited";
  leaveState: "" | "pending" | "approved" | "rejected" | "cancelled";
  month: string;
  from: string;
  to: string;
}
export interface Spec {
  dataset: DatasetId;
  columns: string[];
  filters: Filters;
  sort: { column: string; direction: "asc" | "desc" } | null;
  groupBy: string | null;
  aggregate: { fn: "count" | "sum" | "avg"; column: string | null } | null;
}
export interface Table {
  title: string;
  columns: { key: string; label: string; kind: ColumnKind }[];
  rows: Row[];
  totalRows: number;
  truncated: boolean;
  notes: string[];
}

export const EMPTY_FILTERS: Filters = {
  department: "",
  location: "",
  status: "",
  leaveState: "",
  month: "",
  from: "",
  to: "",
};

/* Catalog ------------------------------------------------------------------ */

export const standardReports: StandardDef[] = [
  {
    key: "headcount",
    category: "people",
    title: "Headcount",
    description: "Everyone on the roster with department, location, type and status.",
    filters: ["department", "location", "status"],
    salary: false,
  },
  {
    key: "joiners_leavers",
    category: "people",
    title: "Joiners & leavers",
    description: "Movements in a date range, with exit reasons.",
    filters: ["range", "department", "location"],
    salary: false,
  },
  {
    key: "attrition",
    category: "people",
    title: "Attrition",
    description: "Opening and closing headcount, joiners, leavers and annualized attrition for 12 months.",
    filters: ["month", "department", "location"],
    salary: false,
  },
  {
    key: "probation_due",
    category: "people",
    title: "Probation due",
    description: "Employees in probation or whose probation ended in the last 30 days.",
    filters: ["department", "location"],
    salary: false,
  },
  {
    key: "celebrations",
    category: "people",
    title: "Birthdays & anniversaries",
    description: "Birthdays and work anniversaries in a month.",
    filters: ["month", "department", "location"],
    salary: false,
  },
  {
    key: "attendance_summary",
    category: "time",
    title: "Attendance summary",
    description: "Present, late, half days, leave, review days, worked and overtime hours per person.",
    filters: ["month", "department", "location", "status"],
    salary: false,
  },
  {
    key: "late_coming",
    category: "time",
    title: "Late coming",
    description: "People who checked in after the grace period, with the dates.",
    filters: ["month", "department", "location"],
    salary: false,
  },
  {
    key: "leave_balances",
    category: "time",
    title: "Leave balances",
    description: "Entitled, used, pending and available days per leave type.",
    filters: ["department", "location", "status"],
    salary: false,
  },
  {
    key: "leave_availed",
    category: "time",
    title: "Leave availed",
    description: "Approved leave taken in a date range.",
    filters: ["range", "department", "location"],
    salary: false,
  },
  {
    key: "salary_register",
    category: "payroll",
    title: "Salary register",
    description: "Earnings, deductions and net pay per employee for a month.",
    filters: ["month", "department", "location"],
    salary: true,
  },
  {
    key: "ctc_by_department",
    category: "payroll",
    title: "CTC by department",
    description: "Headcount, total, average, lowest and highest annual CTC.",
    filters: ["location", "status"],
    salary: true,
  },
];

export const col = (
  key: string,
  label: string,
  kind: ColumnKind = "text",
  extra: Partial<Pick<Column, "salary" | "pii">> = {},
): Column => ({ key, label, kind, salary: extra.salary ?? false, pii: extra.pii ?? false });
export const money = (key: string, label: string) => col(key, label, "money", { salary: true });
export const personColumns = [
  col("code", "Employee code"),
  col("name", "Name"),
  col("department", "Department"),
  col("location", "Location"),
];

export const datasets: DatasetDef[] = [
  {
    id: "employees",
    label: "Employees",
    description: "The employee roster with job, tenure and (masked) identifiers.",
    filters: ["department", "location", "status"],
    columns: [
      ...personColumns,
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
      ...personColumns,
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
      ...personColumns,
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
      ...personColumns,
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
    description: "Persisted payroll calculation per employee for a month. Salary access only.",
    filters: ["month", "department", "location"],
    columns: [
      ...personColumns,
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

export const roleLabels: { id: RoleName; label: string }[] = [
  { id: "hr_operator", label: "HR operations" },
  { id: "payroll_operator", label: "Payroll operators" },
  { id: "payroll_approver", label: "Finance approvers" },
];
export const PAYROLL_ROLES: RoleName[] = ["payroll_operator", "payroll_approver"];

export function datasetOf(id: DatasetId): DatasetDef | undefined {
  return datasets.find((item) => item.id === id);
}

/* Access ------------------------------------------------------------------- */

export function hasSalaryAccess(capabilities: readonly string[]): boolean {
  return (
    capabilities.includes("payroll.prepare") ||
    capabilities.includes("payroll.approve") ||
    capabilities.includes("compensation.manage")
  );
}

export function specHasSalary(spec: Pick<Spec, "dataset" | "columns" | "aggregate">): boolean {
  const dataset = datasetOf(spec.dataset);
  if (!dataset) return false;
  if (dataset.salary) return true;
  const salaryKeys = new Set(dataset.columns.filter((column) => column.salary).map((column) => column.key));
  return (
    spec.columns.some((key) => salaryKeys.has(key)) ||
    Boolean(spec.aggregate?.column && salaryKeys.has(spec.aggregate.column))
  );
}

/** Owner always; shared reports to holders of a shared role (salary datasets need salary access). */
export function savedVisible(
  report: { ownerId: string; visibility: "private" | "shared"; sharedRoles: readonly string[]; dataset: DatasetId },
  viewer: { id: string; roles: readonly string[]; salary: boolean },
): boolean {
  if (report.ownerId === viewer.id) return true;
  if (report.visibility !== "shared" || !report.sharedRoles.some((role) => viewer.roles.includes(role))) return false;
  return !datasetOf(report.dataset)?.salary || viewer.salary;
}

export function hiddenSalaryColumns(spec: Pick<Spec, "dataset" | "columns">, salary: boolean): string[] {
  if (salary) return [];
  const dataset = datasetOf(spec.dataset);
  const keys = new Set((dataset?.columns ?? []).filter((column) => column.salary).map((column) => column.key));
  return spec.columns.filter((key) => keys.has(key));
}

export type ShareError = { code: "NO_ROLES" } | { code: "SALARY_SHARE" };
export function shareError(
  spec: Spec,
  visibility: "private" | "shared",
  sharedRoles: readonly RoleName[],
): ShareError | null {
  if (visibility === "shared" && sharedRoles.length === 0) return { code: "NO_ROLES" };
  if (specHasSalary(spec) && sharedRoles.some((role) => !PAYROLL_ROLES.includes(role))) return { code: "SALARY_SHARE" };
  return null;
}

/* Formatting --------------------------------------------------------------- */

export function rupees(paiseValue: number): string {
  const negative = paiseValue < 0;
  const abs = Math.abs(Math.round(paiseValue));
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
export function toPaise(value: string): number {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const result = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -result : result;
}
export const oneDecimal = (value: number) => Math.round(value * 10) / 10;

export const statusLabel = (status: string) =>
  ({
    active: "Active",
    on_leave: "On long leave",
    onboarding: "Onboarding",
    notice: "Serving notice",
    exited: "Exited",
  })[status] ?? status;
export const typeLabel = (type: string) =>
  type === "full_time" ? "Full-time" : type === "contract" ? "Contract" : "Intern";

/** Personal identifiers never leave a report unmasked: keep only the last 4 characters. */
export function maskIdentifier(value: string | null | undefined): string {
  if (!value) return "";
  const clean = value.replace(/\s+/g, "");
  if (clean.length <= 4) return "X".repeat(clean.length);
  return `${"X".repeat(clean.length - 4)}${clean.slice(-4)}`;
}

export function describeFilters(filters: Partial<Filters>): string {
  const parts: string[] = [];
  if (filters.month) parts.push(`Month ${filters.month}`);
  if (filters.from || filters.to) parts.push(`${filters.from || "…"} to ${filters.to || "…"}`);
  if (filters.department) parts.push(`Department ${filters.department}`);
  if (filters.location) parts.push(`Location ${filters.location}`);
  if (filters.status) parts.push(`Status ${filters.status.replace("_", " ")}`);
  if (filters.leaveState) parts.push(`Leave state ${filters.leaveState}`);
  return parts.join(" · ") || "No filters";
}

/** A month (YYYY-MM) no later than the current one, or null. */
export function validMonth(value: string, currentMonth: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= currentMonth;
}

/* Table engine ------------------------------------------------------------- */

function compare(a: Cell, b: Cell, kind: ColumnKind): number {
  if (a === null || a === "") return b === null || b === "" ? 0 : 1;
  if (b === null || b === "") return -1;
  if (kind === "money") return toPaise(String(a)) - toPaise(String(b));
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-IN", { numeric: true });
}

export function sortRows(
  rows: readonly Row[],
  column: Pick<Column, "key" | "kind"> | undefined,
  direction: "asc" | "desc",
): Row[] {
  if (!column) return [...rows];
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => factor * compare(a[column.key] ?? null, b[column.key] ?? null, column.kind));
}

export function aggregateValue(values: readonly Cell[], fn: "sum" | "avg", kind: ColumnKind): Cell {
  if (kind === "money") {
    const total = values.reduce<number>((acc, value) => acc + toPaise(String(value ?? "0")), 0);
    return rupees(fn === "sum" ? total : values.length ? Math.round(total / values.length) : 0);
  }
  const total = values.reduce<number>(
    (acc, value) => acc + (typeof value === "number" ? value : Number(value ?? 0)),
    0,
  );
  const result = fn === "sum" ? total : values.length ? total / values.length : 0;
  return Math.round(result * 100) / 100;
}

export type SpecError =
  | { status: 422; code: "UNKNOWN_COLUMN"; field: "columns"; message: string; detail: string }
  | { status: 422; code: "NO_COLUMNS"; field: "columns"; message: string; detail: string }
  | { status: 422; code: "INVALID_GROUP"; field: "groupBy"; message: string; detail: string }
  | { status: 422; code: "INVALID_AGGREGATE"; field: "aggCol"; message: string; detail: string }
  | { status: 403; code: "SALARY_RESTRICTED"; message: string };

/**
 * Applies a spec to raw dataset rows with salary scoping: salary columns are
 * hidden without salary access, never grouped/aggregated/sorted on.
 */
export function applySpec(
  dataset: DatasetDef,
  spec: Spec,
  raw: readonly Row[],
  options: { salary: boolean; note: string | null; limit?: number; title?: string },
): Table | SpecError {
  const byKey = new Map(dataset.columns.map((column) => [column.key, column]));
  const unknown = spec.columns.filter((key) => !byKey.has(key));
  if (unknown.length)
    return {
      status: 422,
      code: "UNKNOWN_COLUMN",
      field: "columns",
      message: "Some columns don't belong to this dataset.",
      detail: `Remove ${unknown.join(", ")}.`,
    };
  const hidden = spec.columns.filter((key) => byKey.get(key)?.salary && !options.salary);
  const chosen = spec.columns
    .filter((key) => !hidden.includes(key))
    .flatMap((key) => {
      const column = byKey.get(key);
      return column ? [column] : [];
    });
  if (chosen.length === 0)
    return {
      status: 422,
      code: "NO_COLUMNS",
      field: "columns",
      message: "Choose at least one column you can view.",
      detail: "Choose at least one column you can view.",
    };
  const notes = [
    options.note,
    hidden.length
      ? `Salary columns hidden for your role: ${hidden.map((key) => byKey.get(key)?.label).join(", ")}.`
      : null,
  ].filter((item): item is string => Boolean(item));

  let columns: Table["columns"];
  let rows: Row[];
  if (spec.groupBy) {
    const group = byKey.get(spec.groupBy);
    if (!group || (group.salary && !options.salary) || group.pii)
      return {
        status: 422,
        code: "INVALID_GROUP",
        field: "groupBy",
        message: "Group by a non-salary text column.",
        detail: "Choose a column to group by.",
      };
    const fn = spec.aggregate?.fn ?? "count";
    const target = spec.aggregate?.column ? byKey.get(spec.aggregate.column) : undefined;
    if (fn !== "count" && (!target || (target.kind !== "number" && target.kind !== "money")))
      return {
        status: 422,
        code: "INVALID_AGGREGATE",
        field: "aggCol",
        message: "Sum and average need a number or amount column.",
        detail: "Pick a number or amount column.",
      };
    if (target?.salary && !options.salary)
      return { status: 403, code: "SALARY_RESTRICTED", message: "Salary columns need payroll or compensation access." };
    const buckets = new Map<string, Row[]>();
    for (const row of raw) {
      const key = String(row[group.key] ?? "—");
      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }
    columns = [
      { key: group.key, label: group.label, kind: group.kind },
      { key: "count", label: "Count", kind: "number" },
    ];
    if (fn !== "count" && target)
      columns.push({
        key: "value",
        label: `${fn === "sum" ? "Sum" : "Average"} of ${target.label}`,
        kind: target.kind,
      });
    rows = [...buckets.entries()].map(([key, items]) => ({
      [group.key]: key,
      count: items.length,
      ...(fn !== "count" && target
        ? {
            value: aggregateValue(
              items.map((item) => item[target.key] ?? null),
              fn,
              target.kind,
            ),
          }
        : {}),
    }));
    const sortKey =
      spec.sort?.column === spec.aggregate?.column && fn !== "count"
        ? "value"
        : spec.sort?.column === "count"
          ? "count"
          : group.key;
    rows = sortRows(
      rows,
      columns.find((column) => column.key === sortKey),
      spec.sort?.direction ?? "asc",
    );
    notes.push(`Grouped by ${group.label}: ${raw.length} records in ${rows.length} groups.`);
  } else {
    const sortColumn = spec.sort ? byKey.get(spec.sort.column) : undefined;
    if (sortColumn?.salary && !options.salary)
      return { status: 403, code: "SALARY_RESTRICTED", message: "Salary columns need payroll or compensation access." };
    columns = chosen.map(({ key, label, kind }) => ({ key, label, kind }));
    rows = sortRows(raw, sortColumn, spec.sort?.direction ?? "asc").map((row) =>
      Object.fromEntries(chosen.map((column) => [column.key, row[column.key] ?? null])),
    );
  }
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  return {
    title: options.title ?? `${dataset.label} report`,
    columns,
    rows: rows.slice(0, limit),
    totalRows: rows.length,
    truncated: rows.length > limit,
    notes,
  };
}

export function table(title: string, columns: readonly Column[], rows: Row[], notes: string[] = []): Table {
  return {
    title,
    columns: columns.map(({ key, label, kind }) => ({ key, label, kind })),
    rows,
    totalRows: rows.length,
    truncated: false,
    notes,
  };
}

/* Files -------------------------------------------------------------------- */

function csvCell(value: Cell): string {
  const text = value === null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function toCsv(result: Table, meta: string, today: string): string {
  return [
    [`GTF HR · ${result.title}`, meta, `Generated ${today}`].map(csvCell).join(","),
    "",
    result.columns.map((column) => csvCell(column.label)).join(","),
    ...result.rows.map((row) => result.columns.map((column) => csvCell(row[column.key] ?? null)).join(",")),
  ].join("\r\n");
}
const xml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Excel 2003 SpreadsheetML: opens in Excel/LibreOffice without a library. */
export function toSpreadsheetMl(result: Table, meta: string, today: string): string {
  const cell = (value: Cell, kind: ColumnKind) => {
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
    `<Row><Cell ss:StyleID="head"><Data ss:Type="String">${xml(`GTF HR · ${result.title}`)}</Data></Cell><Cell><Data ss:Type="String">${xml(meta)}</Data></Cell><Cell><Data ss:Type="String">${xml(`Generated ${today}`)}</Data></Cell></Row>`,
    "<Row/>",
    `<Row>${result.columns.map((column) => `<Cell ss:StyleID="head"><Data ss:Type="String">${xml(column.label)}</Data></Cell>`).join("")}</Row>`,
    ...result.rows.map(
      (row) => `<Row>${result.columns.map((column) => cell(row[column.key] ?? null, column.kind)).join("")}</Row>`,
    ),
    "</Table></Worksheet></Workbook>",
  ].join("\n");
}
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "report";

export function exportFile(result: Table, format: "csv" | "xls", slug: string, meta: string, today: string) {
  const base = `gtf-${slug}-${today}`;
  return format === "xls"
    ? {
        fileName: `${base}.xls`,
        contentType: "application/vnd.ms-excel; charset=utf-8",
        content: toSpreadsheetMl(result, meta, today),
        rowCount: result.totalRows,
      }
    : {
        fileName: `${base}.csv`,
        contentType: "text/csv; charset=utf-8",
        content: `\uFEFF${toCsv(result, meta, today)}`,
        rowCount: result.totalRows,
      };
}

/* Dates and schedules ------------------------------------------------------- */

const DAY_MS = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
export const addDays = (iso: string, days: number) => new Date(utc(iso) + days * DAY_MS).toISOString().slice(0, 10);
export const diffDays = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS);
export function addMonths(month: string, count: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + count, 1)).toISOString().slice(0, 7);
}
export const lastDayOfMonth = (month: string) => addDays(`${addMonths(month, 1)}-01`, -1);
/** Local IST wall time on a business date → instant. */
export const istInstant = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).toISOString();

export interface ScheduleFacts {
  frequency: "daily" | "weekly" | "monthly";
  weekday: number;
  dayOfMonth: number;
  time: string;
  active: boolean;
}

/** Next delivery instant within ~2 months, or null when paused. */
export function nextRun(schedule: ScheduleFacts, today: string, nowMs: number): string | null {
  if (!schedule.active) return null;
  for (let offset = 0; offset <= 62; offset += 1) {
    const date = addDays(today, offset);
    const js = new Date(utc(date)).getUTCDay();
    const iso = js === 0 ? 7 : js;
    const matches =
      schedule.frequency === "daily" ||
      (schedule.frequency === "weekly" && iso === schedule.weekday) ||
      (schedule.frequency === "monthly" && Number(date.slice(8)) === schedule.dayOfMonth);
    if (!matches) continue;
    const at = istInstant(date, schedule.time);
    if (new Date(at).getTime() > nowMs) return at;
  }
  return null;
}

/** Probation end (joined + months, clamped to month end). */
export function addMonthsToDate(iso: string, months: number): string {
  const month = addMonths(iso.slice(0, 7), months);
  const last = lastDayOfMonth(month);
  const day = `${month}-${iso.slice(8)}`;
  return day > last ? last : day;
}

/* Workforce history ---------------------------------------------------------- */

export interface Member {
  code: string;
  name: string;
  department: string;
  location: string;
  type: string;
  joinedOn: string;
  exitedOn: string | null;
  reason: string | null;
  gender: string;
  status: string | null;
}

export const onRoll = (members: readonly Member[], date: string) =>
  members.filter((m) => m.joinedOn <= date && (!m.exitedOn || m.exitedOn > date)).length;

export interface MonthStat {
  month: string;
  opening: number;
  closing: number;
  joiners: number;
  leavers: number;
}

/** Opening/closing headcount, joiners and leavers for 12 months ending at `end`. */
export function monthlyMovement(members: readonly Member[], end: string, today: string): MonthStat[] {
  const current = today.slice(0, 7);
  const rows: MonthStat[] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const month = addMonths(end, -back);
    const first = `${month}-01`;
    const last = month === current ? today : lastDayOfMonth(month);
    rows.push({
      month,
      opening: onRoll(members, addDays(first, -1)),
      closing: onRoll(members, last),
      joiners: members.filter((m) => m.joinedOn >= first && m.joinedOn <= last).length,
      leavers: members.filter((m) => m.exitedOn && m.exitedOn >= first && m.exitedOn <= last).length,
    });
  }
  return rows;
}

/** Monthly attrition % = leavers ÷ average(opening, closing) × 100. */
export function monthlyAttrition(stat: Pick<MonthStat, "opening" | "closing" | "leavers">): number {
  const average = (stat.opening + stat.closing) / 2;
  return average ? (stat.leavers / average) * 100 : 0;
}

export const TENURE_BANDS = [
  ["Under 1 year", 0, 1],
  ["1–3 years", 1, 3],
  ["3–5 years", 3, 5],
  ["5+ years", 5, 99],
] as const;
