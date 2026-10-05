import { AppError } from "./AppError.js";

/** The request is valid but the record's current state forbids it (409), e.g. deciding an already-decided request. */
export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}
