import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import * as r from "../../contracts/recruitment.js";
import { AppError } from "../../core/errors/AppError.js";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { talentValidation } from "../talent/talent.controller.js";
import type { Capability } from "../../core/security/capabilities.js";
import { emptyBody } from "../talent/talent.schema.js";
import { recruitmentController } from "./recruitment.controller.js";
import { createRecruitmentService } from "./recruitment.service.js";
import * as s from "./recruitment.schema.js";
export function recruitmentRoutes(prisma: PrismaClient) {
  const router = Router();
  const service = createRecruitmentService(prisma);
  router.get(
    "/public/careers/jobs",
    ...talentValidation(emptyBody),
    recruitmentController(emptyBody, (call) => service.read("public_jobs", call), true),
  );
  router.get(
    "/public/careers/jobs/:jobId",
    ...talentValidation(emptyBody),
    recruitmentController(emptyBody, (call) => service.read("public_job", call), true),
  );
  router.post(
    "/public/careers/jobs/:jobId/applications",
    rateLimit({
      windowMs: 3600000,
      limit: 5,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(new AppError(429, "APPLICATION_LIMIT", "Too many applications. Try again later."));
      },
    }),
    ...talentValidation(s.applyInput),
    recruitmentController(s.applyInput, (call, body) => service.command("application", call, body), true),
  );
  router.use("/recruitment", authenticate);
  function read(path: string, action: string, cap: Capability = "recruitment.manage") {
    router.get(
      `/recruitment${path}`,
      requirePermission(cap),
      ...talentValidation(emptyBody),
      recruitmentController(emptyBody, (call) => service.read(action, call)),
    );
  }
  read("/stats", "stats");
  read("/jobs", "jobs");
  read("/jobs/:jobId", "job");
  read("/requisitions", "requisitions");
  read("/candidates", "candidates");
  read("/candidates/:candidateId", "candidate");
  read("/candidates/:candidateId/offer", "offer");
  read("/candidates/:candidateId/resume", "resume");
  read("/options", "options", "directory.read");
  read("/me/interviews", "interviews", "directory.read");
  read("/me/referrals", "referrals", "directory.read");
  function command(
    method: "post" | "patch",
    path: string,
    action: string,
    schema: z.ZodType,
    cap: Capability = "recruitment.manage",
  ) {
    router[method](
      `/recruitment${path}`,
      requirePermission(cap),
      ...talentValidation(schema),
      recruitmentController(schema, (call, body) => service.command(action, call, body)),
    );
  }
  command("post", "/jobs/:jobId/referrals", "referral", s.referralInput, "directory.read");
  command("post", "/requisitions", "requisition", s.requisitionInput, "candidate.interview");
  command("post", "/requisitions/:requisitionId/decision", "requisition_decision", s.decisionInput);
  command("post", "/jobs", "job", s.jobInput);
  command("patch", "/jobs/:jobId", "job", s.jobInput);
  command(
    "post",
    "/jobs/:jobId/state",
    "job_state",
    z.object({ to: r.jobStateSchema.extract(["published", "on_hold", "closed"]) }),
  );
  command("post", "/candidates", "candidate", s.candidateInput);
  command("post", "/candidates/:candidateId/stage", "stage", s.stageInput);
  command("post", "/candidates/:candidateId/notes", "note", z.object({ body: z.string().trim().min(2).max(1000) }));
  command("post", "/candidates/:candidateId/erase", "erase", emptyBody);
  command("post", "/candidates/:candidateId/interviews", "interview", r.interviewInputSchema);
  command("post", "/interviews/:interviewId/scorecards", "scorecard", r.scorecardInputSchema, "directory.read");
  command("post", "/candidates/:candidateId/offers", "offer", s.offerInput);
  command("post", "/offers/:offerId/approval", "offer_approval", s.decisionInput, "payroll.approve");
  command("post", "/offers/:offerId/response", "offer_response", s.responseInput);
  command("post", "/offers/:offerId/convert", "convert", emptyBody);
  return router;
}
