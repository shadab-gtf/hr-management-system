import type { RequestHandler } from "express";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { idempotencyKeyOf } from "../../core/http/request-context.js";
import { sendData, sendList } from "../../utils/response.js";
import { idParams, noteSchema } from "../payroll/payroll.schema.js";
import {
  assignmentProposalSchema,
  structureProposalSchema,
  batchDecisionSchema,
  calcQuerySchema,
  changeDecisionParams,
  compensationUploadSchema,
  compensationFileSchema,
} from "./compensation.schema.js";
import type { CompensationService } from "./compensation.service.js";
export function createCompensationController(service: CompensationService) {
  return {
    uploadFile: async (req, res) => {
      sendData(
        res,
        await service.uploadFile(
          currentActor(req),
          validated(res, "body", compensationFileSchema),
          idempotencyKeyOf(req),
          req.requestId,
        ),
        { status: 201 },
      );
    },
    structures: async (req, res) => {
      sendData(res, await service.structures(currentActor(req), validated(res, "query", calcQuerySchema)));
    },
    template: async (req, res) => {
      sendData(
        res,
        await service.propose(
          currentActor(req),
          "template",
          validated(res, "body", structureProposalSchema),
          idempotencyKeyOf(req),
          req.requestId,
        ),
      );
    },
    assignment: async (req, res) => {
      sendData(
        res,
        await service.propose(
          currentActor(req),
          "assignment",
          validated(res, "body", assignmentProposalSchema),
          idempotencyKeyOf(req),
          req.requestId,
        ),
      );
    },
    decideStructure: async (req, res) => {
      const { id, decision } = validated(res, "params", changeDecisionParams);
      sendData(
        res,
        await service.decideStructure(
          currentActor(req),
          id,
          decision,
          validated(res, "body", noteSchema).note,
          req.requestId,
        ),
      );
    },
    list: async (req, res) => {
      sendList(res, req.requestId, await service.listImports(currentActor(req)));
    },
    detail: async (req, res) => {
      sendData(res, await service.import(currentActor(req), validated(res, "params", idParams).id));
    },
    upload: async (req, res) => {
      sendData(
        res,
        await service.upload(
          currentActor(req),
          validated(res, "body", compensationUploadSchema),
          idempotencyKeyOf(req),
          req.requestId,
        ),
        { status: 201 },
      );
    },
    decide: async (req, res) => {
      const { decision, reason } = validated(res, "body", batchDecisionSchema);
      sendData(
        res,
        await service.decideImport(
          currentActor(req),
          validated(res, "params", idParams).id,
          decision,
          reason,
          idempotencyKeyOf(req),
          req.requestId,
        ),
      );
    },
    discard: async (req, res) => {
      sendData(
        res,
        await service.decideImport(
          currentActor(req),
          validated(res, "params", idParams).id,
          "discard",
          "",
          undefined,
          req.requestId,
        ),
      );
    },
  } satisfies Record<string, RequestHandler>;
}
