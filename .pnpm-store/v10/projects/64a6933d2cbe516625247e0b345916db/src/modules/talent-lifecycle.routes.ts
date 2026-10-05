import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { lifecycleRoutes } from "./lifecycle/lifecycle.routes.js";
import { recruitmentRoutes } from "./recruitment/recruitment.routes.js";
import { performanceRoutes } from "./performance/performance.routes.js";
export function talentLifecycleRoutes(prisma: PrismaClient) {
  const router = Router();
  router.use(lifecycleRoutes(prisma));
  router.use(recruitmentRoutes(prisma));
  router.use(performanceRoutes(prisma));
  return router;
}
