import type { RequestHandler } from "express";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { expectedVersionOf, idempotencyKeyOf } from "../../core/http/request-context.js";
import { sendData, sendList } from "../../utils/response.js";
import { idParams } from "../payroll/payroll.schema.js";
import { declarationInputSchema, loanDecisionSchema, loanInputSchema } from "./salary.schema.js";
import type { SalaryService } from "./salary.service.js";
export function createSalaryController(service: SalaryService) {
  return {
    compensation: async (req, res) => {
      sendData(res, await service.compensation(currentActor(req)));
    },
    ytd: async (req, res) => {
      sendData(res, await service.ytd(currentActor(req)));
    },
    declaration: async (req, res) => {
      sendData(res, await service.declaration(currentActor(req)));
    },
    saveDeclaration: async (req, res) => {
      sendData(
        res,
        await service.saveDeclaration(currentActor(req), validated(res, "body", declarationInputSchema), req.requestId),
      );
    },
    taxStatement: async (req, res) => {
      sendData(res, await service.taxStatement(currentActor(req)));
    },
    loans: async (req, res) => {
      sendList(res, req.requestId, await service.loans(currentActor(req)));
    },
    requestLoan: async (req, res) => {
      sendData(
        res,
        await service.requestLoan(
          currentActor(req),
          validated(res, "body", loanInputSchema),
          idempotencyKeyOf(req),
          req.requestId,
        ),
      );
    },
    decideLoan: async (req, res) => {
      const { decision, note } = validated(res, "body", loanDecisionSchema);
      sendData(
        res,
        await service.decideLoan(
          currentActor(req),
          validated(res, "params", idParams).id,
          decision,
          note,
          expectedVersionOf(req),
          idempotencyKeyOf(req),
          req.requestId,
        ),
      );
    },
  } satisfies Record<string, RequestHandler>;
}
