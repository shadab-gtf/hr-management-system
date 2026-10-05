import { AppError } from "./AppError.js";

export class AuthorizationError extends AppError {
  constructor(message: string, code = "FORBIDDEN") {
    super(403, code, message);
  }
}
