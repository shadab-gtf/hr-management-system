import type { RequestHandler } from "express";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { expectedVersionOf, idempotencyKeyOf } from "../../core/http/request-context.js";
import { sendData } from "../../utils/response.js";
import { idParams, monthQuery } from "../payroll/payroll.schema.js";
import {
  bankDecisionSchema,
  challanInputSchema,
  fileParams,
  fileQuery,
  fyParams,
  fyQuery,
  pfSettingsInputSchema,
  ptSlabsInputSchema,
  stateParams,
  statutoryProfileInputSchema,
} from "./statutory.schema.js";
import type { StatutoryService } from "./statutory.service.js";
export function createStatutoryController(service: StatutoryService) {
  return {
    setup: async (req, res) => {
      sendData(res, await service.setup(currentActor(req)));
    },
    employees: async (req, res) => {
      sendData(res, await service.employees(currentActor(req)));
    },
    hub: async (req, res) => {
      sendData(res, await service.hub(currentActor(req), validated(res, "query", monthQuery).month));
    },
    settings: async (req, res) => {
      sendData(
        res,
        await service.saveSettings(
          currentActor(req),
          validated(res, "body", pfSettingsInputSchema),
          expectedVersionOf(req),
          req.requestId,
        ),
      );
    },
    pt: async (req, res) => {
      sendData(
        res,
        await service.savePt(
          currentActor(req),
          validated(res, "params", stateParams).state,
          validated(res, "body", ptSlabsInputSchema),
          expectedVersionOf(req),
          req.requestId,
        ),
      );
    },
    profile: async (req, res) => {
      sendData(
        res,
        await service.saveProfile(
          currentActor(req),
          validated(res, "params", idParams).id,
          validated(res, "body", statutoryProfileInputSchema),
          req.requestId,
        ),
      );
    },
    bank: async (req, res) => {
      sendData(
        res,
        await service.bankDecision(
          currentActor(req),
          validated(res, "params", idParams).id,
          validated(res, "body", bankDecisionSchema).decision,
          req.requestId,
        ),
      );
    },
    challan: async (req, res) => {
      sendData(
        res,
        await service.challan(
          currentActor(req),
          validated(res, "body", challanInputSchema),
          idempotencyKeyOf(req),
          req.requestId,
        ),
      );
    },
    form16: async (req, res) => {
      sendData(res, await service.form16(currentActor(req), validated(res, "query", fyQuery).fy));
    },
    otherForm16: async (req, res) => {
      sendData(
        res,
        await service.form16(
          currentActor(req),
          validated(res, "query", fyQuery).fy,
          validated(res, "params", idParams).id,
        ),
      );
    },
    status: async (req, res) => {
      sendData(res, await service.form16Status(currentActor(req), validated(res, "query", fyQuery).fy));
    },
    generate: async (req, res) => {
      sendData(
        res,
        await service.generateForm16(currentActor(req), validated(res, "params", fyParams).fy, req.requestId),
      );
    },
    registerExport: async (req, res) => {
      sendData(
        res,
        await service.exportRun(currentActor(req), validated(res, "params", idParams).id, false, req.requestId),
      );
    },
    bankExport: async (req, res) => {
      sendData(
        res,
        await service.exportRun(currentActor(req), validated(res, "params", idParams).id, true, req.requestId),
      );
    },
    fileExport: async (req, res) => {
      const { month, entity } = validated(res, "query", fileQuery);
      sendData(
        res,
        await service.exportStatutory(
          currentActor(req),
          validated(res, "params", fileParams).file,
          month,
          entity,
          req.requestId,
        ),
      );
    },
  } satisfies Record<string, RequestHandler>;
}
