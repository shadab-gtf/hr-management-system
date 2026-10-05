import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
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
import { createReportsService } from "./reports.service.js";
import { createReportsController } from "./reports.controller.js";
export function reportsRoutes(prisma: PrismaClient) {
  const router = Router();
  const controller = createReportsController(createReportsService(prisma));
  const options = { message: "Check report details.", fieldErrors: true };
  const build = requirePermission("report.build");
  router.use("/reports", authenticate, requirePermission("report.read"));
  router.get("/reports/library", controller.library);
  router.get("/reports/builder", build, controller.builder);
  router.get("/reports/workforce", controller.workforce);
  router.get("/reports/analytics/workforce", controller.analytics);
  router.get("/reports/preview", validate("query", previewQuerySchema, options), controller.preview);
  router.get("/reports/saved", controller.list);
  router.get("/reports/saved/:id", validate("params", idParams, options), controller.saved);
  router.post("/reports/saved", build, validate("body", saveReportInputSchema, options), controller.create);
  router.patch(
    "/reports/saved/:id",
    build,
    validate("params", idParams, options),
    validate("body", saveReportInputSchema, options),
    controller.update,
  );
  router.post("/reports/saved/:id/delete", build, validate("params", idParams, options), controller.remove);
  router.patch(
    "/reports/saved/:id/schedule",
    build,
    validate("params", idParams, options),
    validate("body", scheduleInputSchema, options),
    controller.schedule,
  );
  router.post(
    "/reports/saved/:id/schedule/delete",
    build,
    validate("params", idParams, options),
    controller.clearSchedule,
  );
  router.post("/reports/saved/:id/schedule/run", build, validate("params", idParams, options), controller.runSchedule);
  router.get("/reports/exports", controller.exports);
  router.post("/reports/exports", validate("body", auditExportSchema, options), controller.auditExport);
  router.get("/reports/deliveries", controller.deliveries);
  router.get("/reports/deliveries/:id/download", validate("params", idParams, options), controller.download);
  router.post(
    "/reports/standard/:key/export",
    validate("params", standardParams, options),
    validate("body", standardExportSchema, options),
    controller.standardExport,
  );
  router.post("/reports/custom/export", validate("body", customExportSchema, options), controller.customExport);
  router.post(
    "/reports/saved/:id/export",
    validate("params", idParams, options),
    validate("body", formatSchema, options),
    controller.savedExport,
  );
  return router;
}
