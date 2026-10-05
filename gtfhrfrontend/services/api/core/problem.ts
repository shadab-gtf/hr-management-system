import { z } from "zod";

/** `application/problem+json` shape from system/brain/api-contract.md. */
export const problemSchema = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  requestId: z.string().optional(),
  retryable: z.boolean().default(false),
  fieldErrors: z
    .array(z.object({ field: z.string(), code: z.string(), message: z.string().optional() }))
    .optional(),
});

export class ApiProblem extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly fieldErrors: Record<string, string>;
  readonly requestId: string | undefined;

  constructor(problem: z.infer<typeof problemSchema>) {
    super(problem.title);
    this.name = "ApiProblem";
    this.status = problem.status;
    this.code = problem.code;
    this.retryable = problem.retryable;
    this.requestId = problem.requestId;
    this.fieldErrors = Object.fromEntries(
      (problem.fieldErrors ?? []).map((item) => [
        item.field,
        item.message ?? item.code,
      ]),
    );
  }
}

export function problem(
  status: number,
  code: string,
  title: string,
  extra: { retryable?: boolean; fieldErrors?: Record<string, string> } = {},
): ApiProblem {
  return new ApiProblem({
    type: `urn:gtf:problem:${code.toLowerCase().replace(/_/g, "-")}`,
    title,
    status,
    code,
    retryable: extra.retryable ?? false,
    fieldErrors: Object.entries(extra.fieldErrors ?? {}).map(
      ([field, message]) => ({ field, code: "INVALID", message }),
    ),
  });
}
