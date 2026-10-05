import "server-only";
import { z } from "zod";
import { ApiProblem } from "@/lib/api/core/problem";
import type { ActionResult } from "@/types/action";

export const idempotencyKeySchema = z.string().min(8).max(128);

/** Plain object from FormData (string values only; files are handled separately). */
export function formObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") result[key] = value;
  });
  return result;
}

export function success(message: string, reference?: string): ActionResult {
  return { status: "success", message, at: new Date().toISOString(), ...(reference ? { reference } : {}) };
}

export function validationError(error: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return {
    status: "error",
    code: "VALIDATION_FAILED",
    message: "Check the highlighted fields.",
    fieldErrors,
    retryable: false,
  };
}

/** Maps a domain/API problem to UI feedback without leaking internals. */
export function failure(error: unknown): ActionResult {
  if (error instanceof ApiProblem)
    return {
      status: "error",
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      retryable: error.retryable,
    };
  console.error("[gtf-action] unexpected failure", error);
  return {
    status: "error",
    code: "UNEXPECTED_ERROR",
    message: "Something went wrong. Nothing was changed — try again.",
    retryable: true,
  };
}
