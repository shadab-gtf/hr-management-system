import { AppError } from "./AppError.js";

export class AuthenticationError extends AppError {
  constructor(code: string, message: string) {
    super(401, code, message);
  }
}
