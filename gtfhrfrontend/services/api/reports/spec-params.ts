import "server-only";
import { reportFiltersSchema, reportSpecSchema, standardReportKeySchema, exportFormatSchema, type ReportFilters, type ReportSpec } from "@/types/reports";

/* URL <-> report spec. The builder is a GET form, so a preview is a shareable,
 * server-rendered URL and downloads reuse the same query string. */

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const all = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []);

export function filtersFromParams(params: SearchParams): { filters: ReportFilters; errors: Record<string, string> } {
  const parsed = reportFiltersSchema.safeParse({
    department: first(params.department),
    location: first(params.location),
    status: first(params.status),
    leaveState: first(params.leaveState),
    month: first(params.month),
    from: first(params.from),
    to: first(params.to),
  });
  if (parsed.success) return { filters: parsed.data, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
  return { filters: reportFiltersSchema.parse({}), errors };
}

export function specFromParams(params: SearchParams): { spec: ReportSpec | null; errors: Record<string, string> } {
  if (!first(params.dataset)) return { spec: null, errors: {} };
  const group = first(params.group);
  const fn = first(params.agg);
  const sort = first(params.sort);
  const parsed = reportSpecSchema.safeParse({
    dataset: first(params.dataset),
    columns: all(params.col),
    filters: filtersFromParams(params).filters,
    sort: sort ? { column: sort, direction: first(params.dir) === "desc" ? "desc" : "asc" } : null,
    groupBy: group || null,
    aggregate: group ? { fn: fn === "sum" || fn === "avg" ? fn : "count", column: first(params.aggCol) || null } : null,
  });
  const { errors: filterErrors } = filtersFromParams(params);
  if (parsed.success) return { spec: parsed.data, errors: filterErrors };
  const errors: Record<string, string> = { ...filterErrors };
  for (const issue of parsed.error.issues) errors[issue.path.at(-1) === undefined ? "form" : String(issue.path[issue.path.length - 1])] ??= issue.message;
  return { spec: null, errors };
}

export function specToQuery(spec: ReportSpec): string {
  const query = new URLSearchParams();
  query.set("dataset", spec.dataset);
  for (const column of spec.columns) query.append("col", column);
  for (const [key, value] of Object.entries(spec.filters)) if (value) query.set(key, value);
  if (spec.sort) {
    query.set("sort", spec.sort.column);
    query.set("dir", spec.sort.direction);
  }
  if (spec.groupBy) {
    query.set("group", spec.groupBy);
    if (spec.aggregate) query.set("agg", spec.aggregate.fn);
    if (spec.aggregate?.column) query.set("aggCol", spec.aggregate.column);
  }
  return query.toString();
}

export function parseStandardKey(value: string) {
  return standardReportKeySchema.safeParse(value);
}
export function parseFormat(value: string | null) {
  return exportFormatSchema.catch("csv").parse(value ?? "csv");
}
