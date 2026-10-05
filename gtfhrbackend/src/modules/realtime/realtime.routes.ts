import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { sendProblem } from "../../utils/response.js";
import { realtimeController } from "./realtime.controller.js";
import { ticketInput } from "./realtime.schema.js";
import { createRealtimeService } from "./realtime.service.js";

/**
 * Mounted under `/api/v1`. The socket itself (`GET /api/v1/realtime`, HTTP upgrade) is attached to the HTTP server
 * by `attachRealtime()` in `src/server.ts`, because upgrades never pass through Express.
 */
export function realtimeRoutes(): Router {
  const router = Router();
  const controller = realtimeController(createRealtimeService());
  router.post(
    "/me/realtime/ticket",
    authenticate,
    // Reconnect storms (many tabs, flaky network) stay bounded per person.
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (request) => `realtime:${request.actor?.employeeId ?? "anonymous"}`,
      handler: (request, response) => {
        sendProblem(response, request.requestId, 429, "RATE_LIMITED", "Too many connection attempts. Try again soon.", {
          retryable: true,
        });
      },
    }),
    validate("body", ticketInput, { message: "This request takes no input." }),
    controller.ticket,
  );
  return router;
}
