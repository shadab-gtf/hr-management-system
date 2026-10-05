import type { RequestHandler, Response } from "express";
import { z } from "zod";
import { ValidationError } from "../errors/ValidationError.js";

type RequestSource = "body" | "query" | "params";

interface ValidationFailure {
  /** Problem code; defaults to `VALIDATION_ERROR`. */
  code?: string;
  message: string;
  /** Include the first message per invalid field (form endpoints). */
  fieldErrors?: boolean;
}

function firstFieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(z.flattenError(error).fieldErrors).flatMap(([field, messages]) =>
      Array.isArray(messages) && typeof messages[0] === "string" ? [[field, messages[0]]] : [],
    ),
  );
}

/** Parses `request[source]` with `schema` and stores the result for `validated()`. */
export function validate(source: RequestSource, schema: z.ZodType, failure: ValidationFailure): RequestHandler {
  return (request, response, next) => {
    const parsed = schema.safeParse(request[source]);
    if (!parsed.success)
      throw new ValidationError(
        failure.code ?? "VALIDATION_ERROR",
        failure.message,
        failure.fieldErrors ? firstFieldErrors(parsed.error) : undefined,
      );
    response.locals[source] = parsed.data;
    next();
  };
}

/** The parsed input stored by `validate(source, schema)` earlier in the chain. */
export function validated<S extends z.ZodType>(response: Response, source: RequestSource, _schema: S): z.output<S> {
  return response.locals[source] as z.output<S>;
}
