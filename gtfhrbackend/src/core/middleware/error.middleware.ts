import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { sendProblem } from "../../utils/response.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../logger/logger.js";

function httpStatusOf(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", "The requested resource does not exist."));
};

/** Known failures become their own problem; anything else is logged (codes only, no payloads) and becomes a 500. */
function toAppError(error: unknown, requestId: string): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    return new AppError(409, "ALREADY_EXISTS", "An employee with these unique details already exists.");
  if (error instanceof SyntaxError && httpStatusOf(error) === 400)
    return new AppError(400, "INVALID_JSON", "Request body must be valid JSON.");
  if (httpStatusOf(error) === 413) return new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");

  logger.error("request failed", {
    requestId,
    error: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "UNEXPECTED_ERROR",
  });
  return new AppError(500, "INTERNAL_ERROR", "The request could not be completed.");
}

/** Last middleware: every error leaves the API as a problem response. */
export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const problem = toAppError(error, request.requestId);
  sendProblem(response, request.requestId, problem.status, problem.code, problem.message, {
    ...(problem.fieldErrors ? { fieldErrors: problem.fieldErrors } : {}),
    ...(problem.retryable === undefined ? {} : { retryable: problem.retryable }),
  });
};
