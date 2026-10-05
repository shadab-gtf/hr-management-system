export interface AppErrorOptions {
  fieldErrors?: Record<string, string>;
  retryable?: boolean;
  cause?: unknown;
}

/** An expected failure that maps to a problem response. Its message is safe to show to clients. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string> | undefined;
  readonly retryable: boolean | undefined;

  constructor(status: number, code: string, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.fieldErrors = options.fieldErrors;
    this.retryable = options.retryable;
  }
}
