import type { PrismaClient } from "@prisma/client";
import cors from "cors";
import express, { type Express } from "express";
import { config } from "./config/index.js";
import { createPrismaClient } from "./core/database/prisma.js";
import { errorHandler, notFoundHandler } from "./core/middleware/error.middleware.js";
import { requestId } from "./core/middleware/request-id.middleware.js";
import { createRouter } from "./routes/index.js";
import { REQUEST_BODY_LIMIT } from "./utils/constants.js";

export function buildApp(prisma: PrismaClient = createPrismaClient()): Express {
  const app = express();

  app.disable("x-powered-by");
  app.locals.prisma = prisma;
  app.use(requestId);
  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id", "Idempotency-Key", "If-Match", "X-File-Name"],
      exposedHeaders: ["X-Request-Id"],
    }),
  );
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    if (request.path.endsWith("/content") || request.path.endsWith("/photo"))
      express.json({ limit: "14mb" })(request, response, next);
    // Selfie + GPS attendance: one selfie of at most 2 MB, base64-encoded (docs/api/attendance-log.md).
    else if (request.method === "POST" && request.path === "/api/v1/attendance/log")
      express.json({ limit: "3500kb" })(request, response, next);
    else if (request.path.endsWith("/upload") && /\/(imports|compensation)\//.test(request.path))
      express.json({ limit: "8mb" })(request, response, next);
    else if (
      request.method === "POST" &&
      (/^\/api\/v1\/public\/careers\/jobs\/[^/]+\/applications$/.test(request.path) ||
        request.path === "/api/v1/recruitment/candidates" ||
        /^\/api\/v1\/recruitment\/jobs\/[^/]+\/referrals$/.test(request.path))
    )
      express.json({ limit: "8mb" })(request, response, next);
    else next();
  });
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.use(createRouter(prisma));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
