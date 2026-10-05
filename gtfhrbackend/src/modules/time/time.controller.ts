import type { RequestHandler } from "express";
import { z } from "zod";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { expectedVersionOf, idempotencyKeyOf } from "../../core/http/request-context.js";
import { sendData, sendList } from "../../utils/response.js";
import type { CommandContext } from "./time.repository.js";

export function timeController<B extends z.ZodType, P extends z.ZodType, Q extends z.ZodType>(
  schemas: { body: B; params: P; query: Q },
  service: (ctx: CommandContext, input: z.output<B>, params: z.output<P>, query: z.output<Q>) => Promise<unknown>,
  list = false,
): RequestHandler {
  return async (req, res) => {
    const data = await service(
      {
        actor: currentActor(req),
        requestId: req.requestId,
        key: idempotencyKeyOf(req),
        version: expectedVersionOf(req),
      },
      validated(res, "body", schemas.body),
      validated(res, "params", schemas.params),
      validated(res, "query", schemas.query),
    );
    if (list && Array.isArray(data)) sendList(res, req.requestId, data, { total: data.length });
    else sendData(res, data);
  };
}
