import type { RequestHandler } from "express";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { expectedVersionOf, idempotencyKeyOf } from "../../core/http/request-context.js";
import { sendData } from "../../utils/response.js";
import { idParams } from "../payroll/payroll.schema.js";
import {
  auditExportSchema,
  customExportSchema,
  formatSchema,
  previewQuerySchema,
  saveReportInputSchema,
  scheduleInputSchema,
  standardExportSchema,
  standardParams,
} from "./reports.schema.js";
import type { ReportsService } from "./reports.service.js";
export function createReportsController(service: ReportsService) {
  return {
    library: async (req, res) => {
      sendData(res, await service.library(currentActor(req)));
    },
    builder: async (req, res) => {
      sendData(res, await service.builder(currentActor(req)));
    },
    analytics: async (req, res) => {
      sendData(res, await service.analytics(currentActor(req)));
    },
    workforce: async (req, res) => {
      sendData(res, await service.workforce(currentActor(req)));
    },
    preview: async (req, res) => {
      sendData(res, await service.preview(currentActor(req), validated(res, "query", previewQuerySchema)));
    },
    list: async (req, res) => {
      sendData(res, await service.list(currentActor(req)));
    },
    saved: async (req, res) => {
      sendData(res, await service.saved(currentActor(req), validated(res, "params", idParams).id));
    },
    create: async (req, res) => {
      sendData(
        res,
        await service.save(
          currentActor(req),
          validated(res, "body", saveReportInputSchema),
          undefined,
          undefined,
          idempotencyKeyOf(req),
          req.requestId,
        ),
        { status: 201 },
      );
    },
    update: async (req, res) => {
      sendData(
        res,
        await service.save(
          currentActor(req),
          validated(res, "body", saveReportInputSchema),
          validated(res, "params", idParams).id,
          expectedVersionOf(req),
          undefined,
          req.requestId,
        ),
      );
    },
    remove: async (req, res) => {
      sendData(res, await service.remove(currentActor(req), validated(res, "params", idParams).id, req.requestId));
    },
    schedule: async (req, res) => {
      sendData(
        res,
        await service.schedule(
          currentActor(req),
          validated(res, "params", idParams).id,
          validated(res, "body", scheduleInputSchema),
          req.requestId,
        ),
      );
    },
    clearSchedule: async (req, res) => {
      sendData(
        res,
        await service.schedule(currentActor(req), validated(res, "params", idParams).id, null, req.requestId),
      );
    },
    runSchedule: async (req, res) => {
      sendData(res, await service.runSchedule(currentActor(req), validated(res, "params", idParams).id, req.requestId));
    },
    deliveries: async (req, res) => {
      sendData(res, await service.deliveries(currentActor(req)));
    },
    download: async (req, res) => {
      sendData(res, await service.download(currentActor(req), validated(res, "params", idParams).id));
    },
    exports: async (req, res) => {
      sendData(res, await service.exports(currentActor(req)));
    },
    auditExport: async (req, res) => {
      const input = validated(res, "body", auditExportSchema);
      sendData(
        res,
        await service.auditExport(currentActor(req), input.report, input.rowCount, input.filters, req.requestId),
      );
    },
    standardExport: async (req, res) => {
      const input = validated(res, "body", standardExportSchema);
      sendData(
        res,
        await service.exportStandard(
          currentActor(req),
          validated(res, "params", standardParams).key,
          input.filters,
          input.format,
          req.requestId,
        ),
      );
    },
    customExport: async (req, res) => {
      const input = validated(res, "body", customExportSchema);
      sendData(res, await service.exportCustom(currentActor(req), input.spec, input.format, req.requestId));
    },
    savedExport: async (req, res) => {
      sendData(
        res,
        await service.exportSaved(
          currentActor(req),
          validated(res, "params", idParams).id,
          validated(res, "body", formatSchema).format,
          req.requestId,
        ),
      );
    },
  } satisfies Record<string, RequestHandler>;
}
