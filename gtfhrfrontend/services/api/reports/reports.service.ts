import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { problem } from "@/lib/api/core/problem";
import { mockActor } from "@/lib/api/session/session.service";
import {
  builderContext,
  deleteSavedReport,
  deliveryLog,
  exportCustom,
  exportLog,
  exportSaved,
  exportStandard,
  listSavedReports,
  recordExport,
  removeSchedule,
  reportAnalytics,
  reportLibrary,
  runScheduleNow,
  runSpec,
  saveReport,
  savedReport,
  scheduleReport,
} from "@/lib/mocks/handlers/reports";
import { specToQuery } from "@/lib/api/reports/spec-params";
import {
  builderContextSchema,
  deliveryLogEntrySchema,
  exportFileSchema,
  exportLogEntrySchema,
  reportAnalyticsSchema,
  reportLibrarySchema,
  reportTableSchema,
  savedReportSchema,
  type ExportFormat,
  type ReportFilters,
  type ReportSpec,
  type SaveReportInput,
  type ScheduleInput,
  type StandardReportKey,
} from "@/types/reports";

const ok = z.object({ ok: z.boolean() });

export const getReportLibrary = cache(async () =>
  callApi({ schema: reportLibrarySchema, live: { path: "/reports/library" }, mock: async () => reportLibrary(await mockActor()) }),
);

export const getReportAnalytics = cache(async () =>
  callApi({ schema: reportAnalyticsSchema, live: { path: "/reports/analytics/workforce" }, mock: async () => reportAnalytics(await mockActor()) }),
);

export const getExportLog = cache(async () =>
  callApi({ schema: z.array(exportLogEntrySchema), live: { path: "/reports/exports" }, mock: async () => exportLog(await mockActor()) }),
);

export const getBuilderContext = cache(async () =>
  callApi({ schema: builderContextSchema, live: { path: "/reports/builder" }, mock: async () => builderContext(await mockActor()) }),
);

export const getSavedReports = cache(async () =>
  callApi({ schema: z.array(savedReportSchema), live: { path: "/reports/saved" }, mock: async () => listSavedReports(await mockActor()) }),
);

export const getSavedReport = cache(async (id: string) =>
  callApi({ schema: savedReportSchema, live: { path: `/reports/saved/${encodeURIComponent(id)}` }, mock: async () => savedReport(await mockActor(), id) }),
);

export const getDeliveryLog = cache(async () =>
  callApi({ schema: z.array(deliveryLogEntrySchema), live: { path: "/reports/deliveries" }, mock: async () => deliveryLog(await mockActor()) }),
);

/** Download the immutable artifact delivered by a scheduled report run. */
export async function getDeliveryExport(id: string) {
  return callApi({
    schema: exportFileSchema,
    live: { path: `/reports/deliveries/${encodeURIComponent(id)}/download` },
    mock: async () => {
      const actor = await mockActor();
      const delivery = deliveryLog(actor).find((item) => item.id === id);
      if (!delivery) throw problem(404, "NOT_FOUND", "This report delivery was not found.");
      return exportSaved(actor, delivery.savedReportId, delivery.format);
    },
  });
}

/** Preview: first 50 rows of a custom spec. */
export async function previewReport(spec: ReportSpec) {
  return callApi({
    schema: reportTableSchema,
    live: { path: `/reports/preview?${specToQuery(spec)}` },
    mock: async () => runSpec(await mockActor(), spec, { limit: 50 }),
  });
}

export async function createOrUpdateReport(input: SaveReportInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ id: z.string(), reference: z.string() }),
    live: input.id
      ? { method: "PATCH", path: `/reports/saved/${encodeURIComponent(input.id)}`, body: input, ifMatch: input.version }
      : { method: "POST", path: "/reports/saved", body: input, idempotencyKey },
    mock: async () => saveReport(await mockActor(), input, idempotencyKey),
  });
}

export async function removeSavedReport(id: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/reports/saved/${encodeURIComponent(id)}/delete`, body: {} }, mock: async () => deleteSavedReport(await mockActor(), id) });
}

export async function setReportSchedule(input: ScheduleInput) {
  return callApi({
    schema: z.object({ ok: z.boolean(), nextRunAt: z.string().nullable() }),
    live: { method: "PATCH", path: `/reports/saved/${encodeURIComponent(input.reportId)}/schedule`, body: input },
    mock: async () => scheduleReport(await mockActor(), input),
  });
}

export async function clearReportSchedule(id: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/reports/saved/${encodeURIComponent(id)}/schedule/delete`, body: {} }, mock: async () => removeSchedule(await mockActor(), id) });
}

export async function runReportScheduleNow(id: string) {
  return callApi({
    schema: z.object({ ok: z.boolean(), rowCount: z.number().int() }),
    live: { method: "POST", path: `/reports/saved/${encodeURIComponent(id)}/schedule/run`, body: {} },
    mock: async () => runScheduleNow(await mockActor(), id),
  });
}

/* Exports: the live service returns the generated artifact inline. Each call is audit-logged server side. */

export async function exportStandardReport(key: StandardReportKey, filters: Partial<ReportFilters>, format: ExportFormat) {
  return callApi({
    schema: exportFileSchema,
    live: { method: "POST", path: `/reports/standard/${key}/export`, body: { filters, format } },
    mock: async () => exportStandard(await mockActor(), key, filters, format),
  });
}

export async function exportCustomReport(spec: ReportSpec, format: ExportFormat) {
  return callApi({ schema: exportFileSchema, live: { method: "POST", path: "/reports/custom/export", body: { spec, format } }, mock: async () => exportCustom(await mockActor(), spec, format) });
}

export async function exportSavedReport(id: string, format: ExportFormat) {
  return callApi({
    schema: exportFileSchema,
    live: { method: "POST", path: `/reports/saved/${encodeURIComponent(id)}/export`, body: { format } },
    mock: async () => exportSaved(await mockActor(), id, format),
  });
}

/** Audit entry for downloads produced elsewhere (employee directory CSV). */
export async function auditExport(report: string, rowCount: number, filters: string) {
  return callApi({
    schema: ok,
    live: { method: "POST", path: "/reports/exports", body: { report, rowCount, filters } },
    mock: async () => recordExport(await mockActor(), report, rowCount, filters),
  });
}
