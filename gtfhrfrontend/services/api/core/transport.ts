import "server-only";
import { cookies } from "next/headers";
import type { z } from "zod";
import { apiConfig } from "@/lib/api/core/config";
import { ApiProblem, problem, problemSchema } from "@/lib/api/core/problem";
import type { ListMeta } from "@/types/common";

type Query = Record<string, string | number | boolean | undefined | null>;

export interface LiveRequest {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path relative to `/api/v1`, e.g. `/employees`. */
  path: string;
  query?: Query;
  body?: unknown;
  /** Required on commands listed in api-contract.md "Idempotency". */
  idempotencyKey?: string;
  /** Last seen version/ETag for PATCH and workflow decisions. */
  ifMatch?: string | number;
  /** List endpoints return `{ data: T[], meta }`; normalize to `{ items, meta }`. */
  list?: boolean;
}

interface CallOptions<T> {
  schema: z.ZodType<T>;
  live: LiveRequest;
  /** Mock handler with the same contract as the live endpoint. */
  mock: () => unknown;
}

/**
 * Every read and command goes through here. Both transports are validated by
 * the same runtime schema, so a mock can never drift from the contract that
 * the UI relies on.
 */
export async function callApi<T>({ schema, live, mock }: CallOptions<T>): Promise<T> {
  let raw: unknown;
  if (apiConfig.mode === "live") {
    raw = await liveRequest(live);
  } else {
    raw = await runMock(mock);
  }
  let parsed = schema.safeParse(raw);
  if (!parsed.success && live.list && typeof raw === "object" && raw !== null && "items" in raw)
    parsed = schema.safeParse(raw.items);
  if (!parsed.success) {
    console.error("[gtf-api] contract mismatch", live.path);
    throw problem(502, "CONTRACT_MISMATCH", "The HR service returned an unexpected response.", {
      retryable: true,
    });
  }
  return parsed.data;
}

async function runMock(mock: () => unknown): Promise<unknown> {
  if (apiConfig.mockLatencyMs > 0)
    await new Promise((resolve) => setTimeout(resolve, apiConfig.mockLatencyMs));
  // Clone so callers can never mutate the in-memory store by reference.
  return structuredClone(await mock());
}

export async function liveRequest(request: LiveRequest): Promise<unknown> {
  if (!apiConfig.baseUrl)
    throw problem(500, "API_NOT_CONFIGURED", "GTF_API_BASE_URL is not set.");

  const url = new URL(`${apiConfig.baseUrl}/api/v1${request.path}`);
  for (const [key, value] of Object.entries(request.query ?? {}))
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));

  const session = (await cookies()).get(apiConfig.sessionCookie)?.value;
  const headers = new Headers({ Accept: "application/json" });
  if (session) {
    headers.set("Cookie", `${apiConfig.sessionCookie}=${session}`);
    if (session.split(".").length === 3) headers.set("Authorization", `Bearer ${session}`);
  }
  if (request.body !== undefined) headers.set("Content-Type", "application/json");
  if (request.idempotencyKey) headers.set("Idempotency-Key", request.idempotencyKey);
  if (request.ifMatch !== undefined) headers.set("If-Match", `"${request.ifMatch}"`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method ?? "GET",
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      cache: "no-store",
      signal: AbortSignal.timeout(apiConfig.timeoutMs),
    });
  } catch {
    throw problem(503, "SERVICE_UNAVAILABLE", "The HR service could not be reached.", {
      retryable: true,
    });
  }

  if (response.status === 204) return null;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = problemSchema.safeParse(payload);
    throw parsed.success
      ? new ApiProblem(parsed.data)
      : problem(response.status, "UNEXPECTED_ERROR", "The request could not be completed.", {
          retryable: response.status >= 500,
        });
  }
  const envelope = payload as { data?: unknown; meta?: ListMeta } | null;
  return request.list
    ? { items: envelope?.data ?? [], meta: envelope?.meta }
    : envelope?.data;
}
