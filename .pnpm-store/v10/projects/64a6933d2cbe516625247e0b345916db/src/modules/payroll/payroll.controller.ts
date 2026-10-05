import type { RequestHandler } from "express";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { expectedVersionOf, idempotencyKeyOf } from "../../core/http/request-context.js";
import { sendData } from "../../utils/response.js";
import {
  createRunSchema,
  holdParams,
  holdSchema,
  idParams,
  inputParams,
  noteSchema,
  releaseSchema,
  runInputSchema,
} from "./payroll.schema.js";
import type { PayrollService } from "./payroll.service.js";

export function createPayrollController(service: PayrollService) {
  const command =
    (action: Parameters<PayrollService["command"]>[2]): RequestHandler =>
    async (req, res) => {
      const { id } = validated(res, "params", idParams);
      const { note } = validated(res, "body", noteSchema);
      sendData(
        res,
        await service.command(
          currentActor(req),
          id,
          action,
          note,
          expectedVersionOf(req),
          idempotencyKeyOf(req),
          req.requestId,
        ),
      );
    };
  return {
    overview: async (req, res) => {
      sendData(res, await service.overview(currentActor(req)));
    },
    detail: async (req, res) => {
      sendData(res, await service.detail(currentActor(req), validated(res, "params", idParams).id));
    },
    create: async (req, res) => {
      sendData(
        res,
        await service.create(
          currentActor(req),
          validated(res, "body", createRunSchema).month,
          idempotencyKeyOf(req),
          req.requestId,
        ),
        { status: 201 },
      );
    },
    addInput: async (req, res) => {
      sendData(
        res,
        await service.addInput(
          currentActor(req),
          validated(res, "params", idParams).id,
          validated(res, "body", runInputSchema),
          idempotencyKeyOf(req),
          req.requestId,
        ),
      );
    },
    removeInput: async (req, res) => {
      const { id, inputId } = validated(res, "params", inputParams);
      sendData(res, await service.removeInput(currentActor(req), id, inputId, req.requestId));
    },
    hold: async (req, res) => {
      const { employeeId, reason } = validated(res, "body", holdSchema);
      sendData(
        res,
        await service.hold(
          currentActor(req),
          validated(res, "params", idParams).id,
          employeeId,
          reason,
          idempotencyKeyOf(req),
          req.requestId,
        ),
      );
    },
    release: async (req, res) => {
      const { id, holdId } = validated(res, "params", holdParams);
      sendData(
        res,
        await service.release(currentActor(req), id, holdId, validated(res, "body", releaseSchema).note, req.requestId),
      );
    },
    payslips: async (req, res) => {
      sendData(res, await service.payslips(currentActor(req)));
    },
    payslip: async (req, res) => {
      sendData(res, await service.payslip(currentActor(req), validated(res, "params", idParams).id));
    },
    submit: command("submit"),
    approve: command("approve"),
    reject: command("reject"),
    publish: command("publish"),
    calculate: command("calculate"),
    markPaid: command("mark_paid"),
  } satisfies Record<string, RequestHandler>;
}
