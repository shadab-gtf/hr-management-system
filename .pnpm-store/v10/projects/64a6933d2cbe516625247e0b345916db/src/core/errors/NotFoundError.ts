import { AppError } from "./AppError.js";

export class NotFoundError extends AppError {
  constructor(message = "We couldn't find that record.", code = "NOT_FOUND") {
    super(404, code, message);
  }
}
