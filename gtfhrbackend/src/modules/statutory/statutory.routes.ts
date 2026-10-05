import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { idParams, monthQuery } from "../payroll/payroll.schema.js";
import {
  bankDecisionSchema,
  challanInputSchema,
  fileParams,
  fileQuery,
  fyParams,
  fyQuery,
  pfSettingsInputSchema,
  ptSlabsInputSchema,
  stateParams,
  statutoryProfileInputSchema,
} from "./statutory.schema.js";
import { createStatutoryService } from "./statutory.service.js";
import { createStatutoryController } from "./statutory.controller.js";
export function statutoryRoutes(prisma: PrismaClient) {
  const router = Router();
  const controller = createStatutoryController(createStatutoryService(prisma));
  const options = { message: "Check statutory details.", fieldErrors: true };
  const manage = requirePermission("statutory.manage");
  router.use(["/payroll/statutory", "/payroll/form-16", "/me/tax/form-16", "/payroll/runs"], authenticate);
  router.get("/payroll/statutory", manage, validate("query", monthQuery, options), controller.hub);
  router.get("/payroll/statutory/setup", manage, controller.setup);
  router.get("/payroll/statutory/employees", manage, controller.employees);
  router.patch(
    "/payroll/statutory/settings",
    manage,
    validate("body", pfSettingsInputSchema, options),
    controller.settings,
  );
  router.patch(
    "/payroll/statutory/pt/:state",
    manage,
    validate("params", stateParams, options),
    validate("body", ptSlabsInputSchema, options),
    controller.pt,
  );
  router.patch(
    "/payroll/statutory/employees/:id",
    manage,
    validate("params", idParams, options),
    validate("body", statutoryProfileInputSchema, options),
    controller.profile,
  );
  router.post(
    "/payroll/statutory/employees/:id/bank-verification",
    requirePermission("payment.export"),
    validate("params", idParams, options),
    validate("body", bankDecisionSchema, options),
    controller.bank,
  );
  router.post("/payroll/statutory/challans", manage, validate("body", challanInputSchema, options), controller.challan);
  router.get(
    "/payroll/statutory/files/:file",
    manage,
    validate("params", fileParams, options),
    validate("query", fileQuery, options),
    controller.fileExport,
  );
  router.get(
    "/me/tax/form-16",
    requirePermission("payslip.read.self"),
    validate("query", fyQuery, options),
    controller.form16,
  );
  router.get("/payroll/form-16", manage, validate("query", fyQuery, options), controller.status);
  router.get(
    "/payroll/form-16/:id",
    manage,
    validate("params", idParams, options),
    validate("query", fyQuery, options),
    controller.otherForm16,
  );
  router.post("/payroll/form-16/:fy/generate", manage, validate("params", fyParams, options), controller.generate);
  router.get(
    "/payroll/runs/:id/register/export",
    requirePermission("payroll.prepare"),
    validate("params", idParams, options),
    controller.registerExport,
  );
  router.get(
    "/payroll/runs/:id/bank-advice/export",
    requirePermission("payment.export"),
    validate("params", idParams, options),
    controller.bankExport,
  );
  return router;
}
