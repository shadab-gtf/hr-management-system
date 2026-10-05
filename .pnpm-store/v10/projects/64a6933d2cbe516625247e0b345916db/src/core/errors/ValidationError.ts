import { AppError } from "./AppError.js";

export class ValidationError extends AppError {
  constructor(code: string, message: string, fieldErrors?: Record<string, string>) {
    super(400, code, message, fieldErrors ? { fieldErrors } : {});
  }
}
