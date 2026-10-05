import { AppError } from "./AppError.js";

/** Optimistic-concurrency failure (412): the caller's `If-Match` version is stale. Same code as the frontend mock. */
export class PreconditionFailedError extends AppError {
  constructor() {
    super(412, "STALE_VERSION", "This record changed since you opened it. Review the latest version.");
  }
}
