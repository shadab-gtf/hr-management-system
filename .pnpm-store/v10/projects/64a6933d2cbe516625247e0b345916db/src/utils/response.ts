import type { Response } from "express";

export interface ProblemOptions {
  fieldErrors?: Record<string, string>;
  retryable?: boolean;
}

/** Writes an RFC 9457-style problem body: the only error shape this API returns. */
export function sendProblem(
  response: Response,
  requestId: string,
  status: number,
  code: string,
  title: string,
  options: ProblemOptions = {},
): void {
  response.status(status).json({
    type: `urn:gtf:problem:${code.toLowerCase().replace(/_/g, "-")}`,
    title,
    status,
    code,
    requestId,
    retryable: options.retryable ?? status >= 500,
    ...(options.fieldErrors
      ? {
          fieldErrors: Object.entries(options.fieldErrors).map(([field, message]) => ({
            field,
            code: "INVALID",
            message,
          })),
        }
      : {}),
  });
}

/** Writes the success envelope `{ data, meta? }`. */
export function sendData(response: Response, data: unknown, options: { status?: number; meta?: unknown } = {}): void {
  response.status(options.status ?? 200).json(options.meta === undefined ? { data } : { data, meta: options.meta });
}

/** Writes a list envelope `{ data: T[], meta }`; the frontend transport maps it to `{ items, meta }`. */
export function sendList(
  response: Response,
  requestId: string,
  items: readonly unknown[],
  page: { hasMore?: boolean; nextCursor?: string | null; total?: number } = {},
): void {
  response.status(200).json({
    data: items,
    meta: {
      requestId,
      nextCursor: page.nextCursor ?? null,
      hasMore: page.hasMore ?? false,
      ...(page.total === undefined ? {} : { total: page.total }),
    },
  });
}

/** 204 for commands that return nothing. */
export function sendNoContent(response: Response): void {
  response.status(204).end();
}
