import type { RequestHandler } from "express";
import { z } from "zod";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { expectedVersionOf, idempotencyKeyOf } from "../../core/http/request-context.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import { sendData, sendList } from "../../utils/response.js";

export interface TalentCall {
  actor: AuthenticatedActor | null;
  params: Record<string, string>;
  query: Record<string, string>;
  version: number | undefined;
  key: string | undefined;
}
const paramsSchema = z.record(z.string(), z.string().min(1).max(180));
const querySchema = z.record(z.string(), z.string().max(1000));
export function talentValidation(schema: z.ZodType): RequestHandler[] {
  return [
    validate("params", paramsSchema, { message: "Check the resource identifier." }),
    validate("query", querySchema, { message: "Check the filters." }),
    validate("body", schema, { message: "Check the request details.", fieldErrors: true }),
  ];
}
export function talentController<T>(
  schema: z.ZodType<T>,
  work: (call: TalentCall, body: T) => Promise<unknown>,
  publicAccess = false,
): RequestHandler {
  return async (request, response) => {
    const params = validated(response, "params", paramsSchema);
    const query = validated(response, "query", querySchema);
    const result = await work(
      {
        actor: publicAccess ? null : currentActor(request),
        params,
        query,
        version: expectedVersionOf(request),
        key: idempotencyKeyOf(request),
      },
      validated(response, "body", schema),
    );
    if (Array.isArray(result)) sendList(response, request.requestId, result, { total: result.length });
    else sendData(response, result);
  };
}
