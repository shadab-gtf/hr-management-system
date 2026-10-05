import type { RequestHandler, Request } from "express";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { validated } from "../../core/middleware/validation.middleware.js";
import { idempotencyKeyOf } from "../../core/http/request-context.js";
import { sendData, sendList } from "../../utils/response.js";
import type { CommandContext } from "../time/time.repository.js";
import { attendanceLogBody, attendanceLogParams, attendanceLogQuery, attendanceLogReviewQuery } from "./attendance-log.schema.js";
import type { createAttendanceLogService } from "./attendance-log.service.js";

type Service = ReturnType<typeof createAttendanceLogService>;

const contextOf = (request: Request): CommandContext => ({
  actor: currentActor(request),
  requestId: request.requestId,
  key: idempotencyKeyOf(request),
});

/** HTTP only: read validated input, call the service, send. Request bodies are never logged. */
export function attendanceLogController(service: Service) {
  return {
    log: async (request, response) => {
      const body = validated(response, "body", attendanceLogBody);
      sendData(response, await service.log(contextOf(request), body, request.ip ?? request.socket.remoteAddress));
    },
    mine: async (request, response) => {
      const query = validated(response, "query", attendanceLogQuery);
      sendList(response, request.requestId, await service.mine(contextOf(request), query.date));
    },
    review: async (request, response) => {
      const query = validated(response, "query", attendanceLogReviewQuery);
      const rows = await service.review(contextOf(request), query);
      sendList(response, request.requestId, rows, { total: rows.length });
    },
    selfie: async (request, response) => {
      const params = validated(response, "params", attendanceLogParams);
      const file = await service.selfie(contextOf(request), params.id);
      response.setHeader("Content-Type", file.mime);
      response.setHeader("Content-Disposition", "inline");
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Content-Security-Policy", "default-src 'none'");
      response.send(file.bytes);
    },
  } satisfies Record<string, RequestHandler>;
}
