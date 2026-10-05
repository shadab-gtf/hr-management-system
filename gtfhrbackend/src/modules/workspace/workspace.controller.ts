import type { RequestHandler } from "express";
import type { z } from "zod";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import type { WorkspaceService } from "./workspace.service.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { expectedVersionOf, idempotencyKeyOf } from "../../core/http/request-context.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import { sendData } from "../../utils/response.js";
import { idParams, querySchema, type CommandContext } from "./workspace.schema.js";

export function workspaceController<S extends z.ZodType>(
  schema: S,
  run: (
    actor: AuthenticatedActor,
    body: z.output<S>,
    params: Record<string, string>,
    query: Record<string, string>,
    context: CommandContext,
  ) => Promise<unknown>,
): RequestHandler {
  return async (request, response) => {
    const data = await run(
      currentActor(request),
      validated(response, "body", schema),
      validated(response, "params", idParams),
      validated(response, "query", querySchema),
      { requestId: request.requestId, key: idempotencyKeyOf(request), version: expectedVersionOf(request) },
    );
    sendData(response, data);
  };
}
export function workspaceFileController(service: WorkspaceService) {
  return {
    photo: async (request, response) => {
      const params = validated(response, "params", idParams);
      const file = await service.photo(currentActor(request), params.id ?? "");
      response.setHeader("Content-Type", file.mime);
      response.send(Buffer.from(file.bytes));
    },
    document: async (request, response) => {
      const params = validated(response, "params", idParams);
      const actor = currentActor(request);
      const file = await service.documentContent(actor, params.id ?? "");
      response.setHeader("Content-Type", file.mime);
      response.setHeader("Content-Disposition", "attachment");
      response.send(Buffer.from(file.bytes));
    },
  } satisfies Record<string, RequestHandler>;
}
