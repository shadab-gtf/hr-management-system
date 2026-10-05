import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { createEmployeeController } from "./employee.controller.js";
import { createEmployeeSchema, listEmployeesQuerySchema } from "./employee.schema.js";
import { createEmployeeService } from "./employee.service.js";

/** Mounted at `/api/v1/employees`. */
export function employeeRoutes(prisma: PrismaClient): Router {
  const controller = createEmployeeController(createEmployeeService(prisma));
  const router = Router();

  router.use(authenticate);
  router.get(
    "/",
    requirePermission("directory.read"),
    validate("query", listEmployeesQuerySchema, { code: "INVALID_QUERY", message: "Check the employee list filters." }),
    controller.list,
  );
  router.get("/facets", requirePermission("directory.read"), controller.facets);
  router.get("/form-options", requirePermission("employee.create"), controller.formOptions);
  router.post(
    "/",
    requirePermission("employee.create"),
    validate("body", createEmployeeSchema, { message: "Employee details are invalid.", fieldErrors: true }),
    controller.create,
  );

  return router;
}
