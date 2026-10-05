import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { idParams, noteSchema } from "../payroll/payroll.schema.js";
import {
  assignmentProposalSchema,
  structureProposalSchema,
  batchDecisionSchema,
  calcQuerySchema,
  changeDecisionParams,
  compensationUploadSchema,
  compensationFileSchema,
} from "./compensation.schema.js";
import { createCompensationService } from "./compensation.service.js";
import { createCompensationController } from "./compensation.controller.js";
export function compensationRoutes(prisma: PrismaClient) {
  const router = Router();
  const controller = createCompensationController(createCompensationService(prisma));
  const options = { message: "Check compensation details.", fieldErrors: true };
  router.use(["/payroll/structures", "/compensation"], authenticate);
  router.get("/payroll/structures", validate("query", calcQuerySchema, options), controller.structures);
  router.post(
    "/payroll/structures/assignments/changes",
    requirePermission("compensation.manage"),
    validate("body", assignmentProposalSchema, options),
    controller.assignment,
  );
  router.post(
    "/payroll/structures/:id/changes",
    requirePermission("compensation.manage"),
    validate("params", idParams, options),
    validate("body", structureProposalSchema, options),
    controller.template,
  );
  router.post(
    "/payroll/structures/changes/:id/:decision",
    validate("params", changeDecisionParams, options),
    validate("body", noteSchema, options),
    controller.decideStructure,
  );
  router.get("/compensation/imports", controller.list);
  router.get("/compensation/imports/:id", validate("params", idParams, options), controller.detail);
  router.post(
    "/compensation/imports",
    requirePermission("compensation.manage"),
    validate("body", compensationUploadSchema, options),
    controller.upload,
  );
  router.post(
    "/compensation/imports/upload",
    requirePermission("compensation.manage"),
    validate("body", compensationFileSchema, options),
    controller.uploadFile,
  );
  router.post(
    "/compensation/imports/:id/decisions",
    validate("params", idParams, options),
    validate("body", batchDecisionSchema, options),
    controller.decide,
  );
  router.post(
    "/compensation/imports/:id/discard",
    requirePermission("compensation.manage"),
    validate("params", idParams, options),
    controller.discard,
  );
  return router;
}
