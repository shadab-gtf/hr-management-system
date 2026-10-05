import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { SERVICE_NAME } from "../../utils/constants.js";

/** Liveness (`/health`, no dependencies) and readiness (`/ready`, checks PostgreSQL). */
export function healthRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json({ status: "ok", service: SERVICE_NAME });
  });

  router.get("/ready", async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ status: "ready", database: "connected" });
    } catch {
      response.status(503).json({ status: "not_ready", database: "unavailable" });
    }
  });

  return router;
}
