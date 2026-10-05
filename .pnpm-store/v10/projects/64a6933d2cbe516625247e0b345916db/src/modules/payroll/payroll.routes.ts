import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { createPayrollController } from "./payroll.controller.js";
import { createPayrollService } from "./payroll.service.js";
import {
  createRunSchema,
  holdParams,
  holdSchema,
  idParams,
  inputParams,
  noteSchema,
  releaseSchema,
  runInputSchema,
} from "./payroll.schema.js";

export function payrollRoutes(prisma: PrismaClient) {
  const router = Router();
  const controller = createPayrollController(createPayrollService(prisma));
  const options = { message: "Check payroll details.", fieldErrors: true };
  router.use(["/payroll", "/me/payslips"], authenticate);
  router.get("/payroll/overview", controller.overview);
  router.post(
    "/payroll/runs",
    requirePermission("payroll.prepare"),
    validate("body", createRunSchema, options),
    controller.create,
  );
  router.get("/payroll/runs/:id", validate("params", idParams, options), controller.detail);
  for (const [path, capability, handler] of [
    ["submit-review", "payroll.submit", controller.submit],
    ["approve", "payroll.approve", controller.approve],
    ["reject", "payroll.approve", controller.reject],
    ["publish", "payroll.publish", controller.publish],
    ["calculate", "payroll.prepare", controller.calculate],
    ["mark-paid", "payment.export", controller.markPaid],
  ] as const)
    router.post(
      `/payroll/runs/:id/${path}`,
      requirePermission(capability),
      validate("params", idParams, options),
      validate("body", noteSchema, options),
      handler,
    );
  router.post(
    "/payroll/runs/:id/inputs",
    requirePermission("payroll.prepare"),
    validate("params", idParams, options),
    validate("body", runInputSchema, options),
    controller.addInput,
  );
  router.post(
    "/payroll/runs/:id/inputs/:inputId/remove",
    requirePermission("payroll.prepare"),
    validate("params", inputParams, options),
    controller.removeInput,
  );
  router.post(
    "/payroll/runs/:id/holds",
    requirePermission("payroll.prepare"),
    validate("params", idParams, options),
    validate("body", holdSchema, options),
    controller.hold,
  );
  router.post(
    "/payroll/runs/:id/holds/:holdId/release",
    requirePermission("payroll.prepare"),
    validate("params", holdParams, options),
    validate("body", releaseSchema, options),
    controller.release,
  );
  router.get("/me/payslips", requirePermission("payslip.read.self"), controller.payslips);
  router.get(
    "/me/payslips/:id",
    requirePermission("payslip.read.self"),
    validate("params", idParams, options),
    controller.payslip,
  );
  return router;
}
