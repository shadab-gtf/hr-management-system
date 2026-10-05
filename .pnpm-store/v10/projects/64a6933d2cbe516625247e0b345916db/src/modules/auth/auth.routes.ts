import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { loginRateLimit } from "../../core/middleware/rate-limit.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { createAuthController } from "./auth.controller.js";
import { loginSchema } from "./auth.schema.js";
import { createAuthService } from "./auth.service.js";

/** Mounted at `/api/v1/auth`. */
export function authRoutes(prisma: PrismaClient): Router {
  const controller = createAuthController(createAuthService(prisma));
  const router = Router();

  router.post(
    "/login",
    loginRateLimit(),
    validate("body", loginSchema, { message: "Enter a valid email and password." }),
    controller.login,
  );
  router.get("/me", authenticate, controller.me);

  return router;
}
