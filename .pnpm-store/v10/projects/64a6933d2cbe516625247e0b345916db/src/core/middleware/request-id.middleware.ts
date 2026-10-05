import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._-]{1,100}$/;

/** Reuses a well-formed caller `X-Request-Id`, otherwise mints one, and echoes it on the response. */
export const requestId: RequestHandler = (request, response, next) => {
  const requested = request.header("x-request-id");
  request.requestId = requested && SAFE_REQUEST_ID.test(requested) ? requested : randomUUID();
  response.setHeader("X-Request-Id", request.requestId);
  next();
};
