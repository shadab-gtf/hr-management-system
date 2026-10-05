import type { RequestHandler } from "express";
import { currentActor } from "../../core/middleware/auth.middleware.js";
import { sendData } from "../../utils/response.js";
import type { RealtimeService } from "./realtime.service.js";

export function realtimeController(service: RealtimeService) {
  const ticket: RequestHandler = async (request, response) => {
    // `authenticate` already required and verified this header.
    const bearer = request.headers.authorization?.slice(7) ?? "";
    sendData(response, await service.ticket(currentActor(request), bearer), { status: 201 });
  };
  return { ticket };
}
