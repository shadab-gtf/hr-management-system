import type { RequestHandler } from "express";
import { validated } from "../../core/middleware/validation.middleware.js";
import { sendData } from "../../utils/response.js";
import type { createIdentityService } from "./identity.service.js";
import { recoveryInput, passwordSetupInput } from "./identity.schema.js";
import { querySchema } from "../workspace/workspace.schema.js";
export function identityController(service: ReturnType<typeof createIdentityService>) {
  return {
    recovery: async (request, response) => {
      sendData(response, await service.recovery(validated(response, "body", recoveryInput).email, request.requestId));
    },
    password: async (request, response) => {
      sendData(response, await service.setPassword(validated(response, "body", passwordSetupInput), request.requestId));
    },
    describe: async (_request, response) => {
      sendData(response, await service.describeLink(validated(response, "query", querySchema).ref ?? ""));
    },
  } satisfies Record<string, RequestHandler>;
}
