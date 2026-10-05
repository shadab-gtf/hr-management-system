import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { payrollRoutes } from "./payroll/payroll.routes.js";
import { salaryRoutes } from "./salary/salary.routes.js";
import { compensationRoutes } from "./compensation/compensation.routes.js";
import { statutoryRoutes } from "./statutory/statutory.routes.js";
import { reportsRoutes } from "./reports/reports.routes.js";
export function payrollReportRoutes(prisma: PrismaClient) {
  const router = Router();
  router.use(payrollRoutes(prisma));
  router.use(salaryRoutes(prisma));
  router.use(compensationRoutes(prisma));
  router.use(statutoryRoutes(prisma));
  router.use(reportsRoutes(prisma));
  return router;
}
