import { z } from "zod";
import {
  exportFormatSchema,
  reportFiltersSchema,
  reportSpecSchema,
  scheduleInputSchema,
  standardReportKeySchema,
} from "../../contracts/reports.js";
export { saveReportInputSchema, scheduleInputSchema } from "../../contracts/reports.js";
export const standardParams = z.object({ key: standardReportKeySchema });
export const standardExportSchema = z.object({ filters: reportFiltersSchema, format: exportFormatSchema });
export const customExportSchema = z.object({ spec: reportSpecSchema, format: exportFormatSchema });
export const formatSchema = z.object({ format: exportFormatSchema });
export const auditExportSchema = z.object({
  report: z.string().trim().min(1).max(200),
  rowCount: z.number().int().nonnegative().max(1000000),
  filters: z.string().max(2000),
});
export const scheduleStoredSchema = scheduleInputSchema.omit({ reportId: true });
const queryValue = z.union([z.string(), z.array(z.string())]).optional();
export const previewQuerySchema = z
  .object({
    dataset: z.string(),
    col: queryValue,
    department: z.string().optional(),
    location: z.string().optional(),
    status: z.string().optional(),
    leaveState: z.string().optional(),
    month: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    sort: z.string().optional(),
    dir: z.enum(["asc", "desc"]).optional(),
    group: z.string().optional(),
    agg: z.enum(["count", "sum", "avg"]).optional(),
    aggCol: z.string().optional(),
  })
  .transform((value): unknown => ({
    dataset: value.dataset,
    columns: Array.isArray(value.col) ? value.col : value.col ? [value.col] : [],
    filters: {
      department: value.department,
      location: value.location,
      status: value.status,
      leaveState: value.leaveState,
      month: value.month,
      from: value.from,
      to: value.to,
    },
    sort: value.sort ? { column: value.sort, direction: value.dir ?? "asc" } : null,
    groupBy: value.group || null,
    aggregate: value.group ? { fn: value.agg ?? "count", column: value.aggCol || null } : null,
  }))
  .pipe(reportSpecSchema);
