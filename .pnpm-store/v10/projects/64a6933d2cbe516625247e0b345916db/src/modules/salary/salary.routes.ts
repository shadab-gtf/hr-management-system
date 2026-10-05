import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { idParams } from "../payroll/payroll.schema.js";
import { declarationInputSchema, loanDecisionSchema, loanInputSchema } from "./salary.schema.js";
import { createSalaryService } from "./salary.service.js";
import { createSalaryController } from "./salary.controller.js";
export function salaryRoutes(prisma: PrismaClient) {
  const router = Router();
  const controller = createSalaryController(createSalaryService(prisma));
  const options = { message: "Check salary details.", fieldErrors: true };
  router.use(["/me/compensation", "/me/salary/ytd", "/me/tax", "/me/loans", "/loans"], authenticate);
  router.get("/me/compensation", requirePermission("payslip.read.self"), controller.compensation);
  router.get("/me/salary/ytd", requirePermission("payslip.read.self"), controller.ytd);
  router.get("/me/tax/declaration", requirePermission("tax.declare.self"), controller.declaration);
  router.patch(
    "/me/tax/declaration",
    requirePermission("tax.declare.self"),
    validate("body", declarationInputSchema, options),
    controller.saveDeclaration,
  );
  router.get("/me/tax/statement", requirePermission("payslip.read.self"), controller.taxStatement);
  router.get("/me/loans", requirePermission("loan.request.self"), controller.loans);
  router.post(
    "/me/loans",
    requirePermission("loan.request.self"),
    validate("body", loanInputSchema, options),
    controller.requestLoan,
  );
  router.post(
    "/loans/:id/decisions",
    requirePermission("loan.approve"),
    validate("params", idParams, options),
    validate("body", loanDecisionSchema, options),
    controller.decideLoan,
  );
  return router;
}
