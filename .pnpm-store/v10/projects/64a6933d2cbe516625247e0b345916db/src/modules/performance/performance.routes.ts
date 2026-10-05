import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import * as p from "../../contracts/performance.js";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { talentValidation } from "../talent/talent.controller.js";
import type { Capability } from "../../core/security/capabilities.js";
import { emptyBody } from "../talent/talent.schema.js";
import { performanceController } from "./performance.controller.js";
import { createPerformanceService } from "./performance.service.js";
import * as s from "./performance.schema.js";
export function performanceRoutes(prisma: PrismaClient) {
  const router = Router();
  const service = createPerformanceService(prisma);
  router.use("/performance", authenticate);
  for (const [path, cap, handler] of [
    ["/me", "performance.self", service.my],
    ["/team", "performance.review", service.team],
    ["/cycles/overview", "performance.manage", service.admin],
    ["/feedback", "performance.self", service.feedbackHub],
  ] as const)
    router.get(
      `/performance${path}`,
      requirePermission(cap),
      ...talentValidation(emptyBody),
      performanceController(emptyBody, (call) => handler(call)),
    );
  function command(
    method: "post" | "patch",
    path: string,
    action: string,
    schema: z.ZodType,
    cap: Capability = "performance.self",
  ) {
    router[method](
      `/performance${path}`,
      requirePermission(cap),
      ...talentValidation(schema),
      performanceController(schema, (call, body) => service.command(action, call, body)),
    );
  }
  command("post", "/goals", "goal", s.goalInput);
  command("patch", "/goals/:goalId", "goal", s.goalInput);
  command("post", "/goals/:goalId/delete", "delete_goal", emptyBody);
  command("post", "/cycles/:cycleId/goal-sheet/submit", "submit_goals", emptyBody);
  command("post", "/goals/:goalId/check-ins", "check_in", p.checkInInputSchema);
  command("patch", "/reviews/:reviewId/self", "self", s.reviewInput);
  command("post", "/reviews/:reviewId/acknowledge", "acknowledge", p.acknowledgeInputSchema);
  command("post", "/goal-sheets/:sheetId/decision", "decision", p.goalDecisionSchema, "performance.review");
  command("patch", "/reviews/:reviewId/manager", "manager", s.managerInput, "performance.review");
  command("post", "/cycles", "cycle", p.cycleInputSchema, "performance.manage");
  command("patch", "/cycles/:cycleId", "cycle", p.cycleInputSchema, "performance.manage");
  command(
    "post",
    "/cycles/:cycleId/advance",
    "advance",
    z.object({ expectedPhase: p.perfPhaseSchema }),
    "performance.manage",
  );
  command("post", "/cycles/:cycleId/calibration/lock", "lock", emptyBody, "performance.manage");
  command("post", "/cycles/:cycleId/calibration/reopen", "reopen", emptyBody, "performance.manage");
  command("patch", "/reviews/:reviewId/final-rating", "rating", p.calibrateInputSchema, "performance.manage");
  command("patch", "/reviews/:reviewId/reviewer", "reviewer", p.reassignInputSchema, "performance.manage");
  command("post", "/competencies", "competency", s.competencyInput, "performance.manage");
  command("patch", "/competencies/:competencyId", "competency", s.competencyInput, "performance.manage");
  command("post", "/feedback", "feedback", s.feedbackInput);
  command("post", "/feedback-requests", "request", s.requestInput);
  command("post", "/feedback-requests/:requestId/decline", "decline", emptyBody);
  command("post", "/one-on-ones", "one_on_one", p.oneOnOneInputSchema);
  return router;
}
