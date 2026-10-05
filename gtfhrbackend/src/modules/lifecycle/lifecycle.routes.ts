import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import * as l from "../../contracts/lifecycle.js";
import { checklistTaskInputSchema, employeeExitInputSchema } from "../../contracts/hr-config.js";
import { letterInputSchema } from "../../contracts/requests.js";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { talentValidation } from "../talent/talent.controller.js";
import { can } from "../../core/security/actor.js";
import type { Capability } from "../../core/security/capabilities.js";
import { AuthorizationError } from "../../core/errors/AuthorizationError.js";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { emptyBody } from "../talent/talent.schema.js";
import { lifecycleController } from "./lifecycle.controller.js";
import { createLifecycleService } from "./lifecycle.service.js";
import * as s from "./lifecycle.schema.js";
export function lifecycleRoutes(prisma: PrismaClient) {
  const router = Router();
  const service = createLifecycleService(prisma);
  function read(path: string, action: string, cap: Capability | "settlement_read") {
    router.get(
      path,
      authenticate,
      cap === "settlement_read"
        ? (req, _res, next) => {
            const actor = currentActor(req);
            if (!can(actor, "settlement.prepare") && !can(actor, "settlement.approve")) {
              next(new AuthorizationError("Settlement access is restricted."));
              return;
            }
            next();
          }
        : requirePermission(cap),
      ...talentValidation(emptyBody),
      lifecycleController(emptyBody, (call) => service.read(action, call)),
    );
  }
  read("/me/resignation", "resignation", "exit.request.self");
  read("/lifecycle/onboarding", "onboarding", "onboarding.manage");
  read("/lifecycle/offboarding", "offboarding", "onboarding.manage");
  read("/lifecycle/offboarding/board", "offboarding_board", "onboarding.manage");
  read("/config/checklists", "checklists", "onboarding.manage");
  read("/assets", "assets", "asset.manage");
  read("/me/assets", "my_assets", "asset.read.self");
  read("/settlements", "settlements", "settlement_read");
  read("/settlements/:settlementId", "settlement", "settlement_read");
  read("/letter-templates/studio", "studio", "letter.issue");
  read("/letters/:letterId", "letter", "letter.request.self");
  read("/me/letters", "letter_requests", "letter.request.self");
  read("/policies", "policies", "policy.publish");
  read("/me/policies", "my_policies", "directory.read");
  read("/config/settlement-policy", "settlement_policy", "settlement_read");
  function command(method: "post" | "patch", path: string, action: string, schema: z.ZodType, cap: Capability) {
    router[method](
      path,
      authenticate,
      requirePermission(cap),
      ...talentValidation(schema),
      lifecycleController(schema, (call, body) => service.command(action, call, body)),
    );
  }
  command("post", "/me/resignation", "resign", l.resignationInputSchema, "exit.request.self");
  command(
    "post",
    "/employees/:employeeId/exit",
    "start_exit",
    employeeExitInputSchema.omit({ employeeId: true }),
    "employee.update",
  );
  command("patch", "/config/settlement-policy", "settlement_policy", s.settlementPolicySchema, "policy.publish");
  command("post", "/resignations/:resignationId/withdraw", "withdraw", emptyBody, "exit.request.self");
  command("post", "/resignations/:resignationId/decisions", "resignation_decision", s.decisionInput, "approval.decide");
  command("post", "/config/checklists/:list", "checklist", checklistTaskInputSchema, "onboarding.manage");
  command("patch", "/config/checklists/:list/:taskId", "checklist", checklistTaskInputSchema, "onboarding.manage");
  command("post", "/config/checklists/:list/:taskId/delete", "checklist_delete", emptyBody, "onboarding.manage");
  command(
    "patch",
    "/lifecycle/onboarding/:employeeId/tasks/:taskId",
    "onboarding_task",
    z.object({ done: z.boolean() }),
    "onboarding.manage",
  );
  command(
    "patch",
    "/lifecycle/offboarding/:employeeId/tasks/:taskId",
    "offboarding_task",
    z.object({ done: z.boolean() }),
    "onboarding.manage",
  );
  command("post", "/lifecycle/offboarding/:employeeId/complete", "complete", emptyBody, "onboarding.manage");
  command(
    "patch",
    "/lifecycle/offboarding/:employeeId/clearances/:department",
    "clearance",
    z.object({ status: z.enum(["pending", "cleared"]), note: z.string().max(300).default("") }),
    "onboarding.manage",
  );
  command(
    "post",
    "/lifecycle/offboarding/:employeeId/exit-interview",
    "interview",
    l.exitInterviewInputSchema,
    "onboarding.manage",
  );
  command("post", "/assets", "asset", l.assetInputSchema, "asset.manage");
  command("patch", "/assets/:assetId", "asset", l.assetInputSchema, "asset.manage");
  command("post", "/assets/:assetId/assignments", "assign", s.assignInput, "asset.manage");
  command("post", "/assets/:assetId/return", "return", s.returnInput, "asset.manage");
  command("patch", "/assets/:assetId/status", "asset_status", s.statusInput, "asset.manage");
  command("post", "/me/assets/:assetId/acknowledge", "ack_asset", emptyBody, "asset.read.self");
  command("post", "/me/asset-requests", "asset_request", l.assetRequestInputSchema, "asset.read.self");
  command(
    "post",
    "/asset-requests/:requestId/decisions",
    "asset_reject",
    z.object({ decision: z.literal("reject"), reason: z.string().min(5).max(300) }),
    "asset.manage",
  );
  command("post", "/letter-templates", "template", l.letterTemplateInputSchema, "letter.issue");
  command("patch", "/letter-templates/:templateId", "template", l.letterTemplateInputSchema, "letter.issue");
  command("post", "/letters", "issue", s.issueInput, "letter.issue");
  command("post", "/me/letters", "letter_request", letterInputSchema, "letter.request.self");
  command("post", "/policies", "policy", l.policyPublishInputSchema, "policy.publish");
  command("post", "/policies/:policyId/reminders", "policy_remind", emptyBody, "policy.publish");
  command("post", "/me/policies/:policyId/acknowledgements", "ack_policy", emptyBody, "directory.read");
  command(
    "post",
    "/settlements",
    "settlement_create",
    z.object({ employeeId: z.string().min(1) }),
    "settlement.prepare",
  );
  command("post", "/settlements/:settlementId/recalculate", "recalculate", emptyBody, "settlement.prepare");
  command("post", "/settlements/:settlementId/lines", "line", s.lineInput, "settlement.prepare");
  command("post", "/settlements/:settlementId/lines/:lineId/remove", "remove_line", emptyBody, "settlement.prepare");
  command("patch", "/settlements/:settlementId/notice-waiver", "waiver", s.waiverInput, "settlement.prepare");
  command("post", "/settlements/:settlementId/submit", "settlement_submit", emptyBody, "settlement.prepare");
  command(
    "post",
    "/settlements/:settlementId/decisions",
    "settlement_decision",
    s.settlementDecision,
    "settlement.approve",
  );
  command("post", "/settlements/:settlementId/payment", "settlement_payment", s.paymentInput, "settlement.approve");
  return router;
}
