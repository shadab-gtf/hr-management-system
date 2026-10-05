import type { RequestHandler } from "express";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { sendData } from "../../utils/response.js";
import { loginSchema } from "./auth.schema.js";
import type { AuthService } from "./auth.service.js";

export function createAuthController(service: AuthService) {
  return {
    login: async (_request, response) => {
      sendData(response, await service.login(validated(response, "body", loginSchema)));
    },

    me: async (request, response) => {
      sendData(response, await service.currentAccount(currentActor(request)));
    },
  } satisfies Record<string, RequestHandler>;
}
