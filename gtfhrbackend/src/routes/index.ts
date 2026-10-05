import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { employeeRoutes } from "../modules/employees/employee.routes.js";
import { healthRoutes } from "../modules/health/health.routes.js";
import { API_PREFIX } from "../utils/constants.js";
import { workspaceRoutes } from "../modules/workspace/workspace.routes.js";
import { identityRoutes } from "../modules/identity/identity.routes.js";
import { engageRoutes } from "../modules/engage/engage.routes.js";
import { timeRoutes } from "../modules/time.routes.js";
import { talentLifecycleRoutes } from "../modules/talent-lifecycle.routes.js";
import { payrollReportRoutes } from "../modules/payroll-report.routes.js";

/** Every HTTP route the service exposes. Register a new module here. */
export function createRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.use(healthRoutes(prisma));
  router.use(`${API_PREFIX}/auth`, authRoutes(prisma));
  router.use(`${API_PREFIX}/employees`, employeeRoutes(prisma));
  router.use(API_PREFIX, identityRoutes(prisma));
  router.use(API_PREFIX, workspaceRoutes(prisma));
  router.use(API_PREFIX, engageRoutes(prisma));
  router.use(API_PREFIX, talentLifecycleRoutes(prisma));
  router.use(API_PREFIX, payrollReportRoutes(prisma));
  router.use(API_PREFIX, timeRoutes(prisma));

  return router;
}
