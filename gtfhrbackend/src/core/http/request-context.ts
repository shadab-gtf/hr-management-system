import type { Request } from "express";
import { ValidationError } from "../errors/ValidationError.js";
import { PreconditionFailedError } from "../errors/PreconditionFailedError.js";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;

/** `Idempotency-Key` header (api-contract.md "Idempotency"); undefined when absent. */
export function idempotencyKeyOf(request: Request): string | undefined {
  const key = request.header("idempotency-key");
  if (key === undefined) return undefined;
  if (!IDEMPOTENCY_KEY.test(key))
    throw new ValidationError("INVALID_IDEMPOTENCY_KEY", "The Idempotency-Key header is malformed.");
  return key;
}

/** Version from `If-Match: "3"` (or `3`, or `W/"3"`); undefined when absent. */
export function expectedVersionOf(request: Request): number | undefined {
  const header = request.header("if-match");
  if (header === undefined) return undefined;
  const match = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim());
  if (!match?.[1]) throw new ValidationError("INVALID_IF_MATCH", "The If-Match header must be a record version.");
  return Number(match[1]);
}

/** Throws 412 STALE_VERSION when the caller sent a version that is not the current one. */
export function assertVersion(current: number, expected: number | undefined): void {
  if (expected !== undefined && expected !== current) throw new PreconditionFailedError();
}
