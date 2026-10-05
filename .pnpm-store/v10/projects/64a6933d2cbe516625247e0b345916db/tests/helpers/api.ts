/**
 * Integration-test client. Run tests through a sandbox so DATABASE_URL points at a seeded private database:
 *
 *   pnpm db:sandbox <name> --reset --seed -- pnpm exec tsx --test tests/integration/<module>/*.test.ts
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { after, before } from "node:test";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app.js";
import { issueAccessToken } from "../../src/core/security/tokens.js";

/** Seeded personas (same people as the frontend mock login). `manager` is Rohan Verma, Aanya's manager. */
export const personas = {
  employee: "emp_0007",
  manager: "emp_0006",
  hr: "emp_0005",
  payroll: "emp_0004",
  finance: "emp_0003",
  /** Nikhil Anand (CEO): super admin. */
  superAdmin: "emp_0001",
  /** Farhan Qureshi (Engineering manager): HR operator limited to the Engineering department. */
  scopedHr: "emp_0013",
} as const;
export type Persona = keyof typeof personas;

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: number;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

export interface TestApi {
  prisma: PrismaClient;
  baseUrl: string;
  /** Access token for a seeded employee id (roles are loaded from the database, like production). */
  token(employeeId: string): Promise<string>;
  as(persona: Persona | null, method: string, path: string, options?: RequestOptions): Promise<ApiResult>;
}

/** Starts the real app on a random port for the current test file and stops it afterwards. */
export function useTestApi(): TestApi {
  const prisma = new PrismaClient();
  let server: Server | undefined;
  const api: TestApi = {
    prisma,
    baseUrl: "",
    token: (employeeId) => issueAccessToken(employeeId, [], { mfaVerified: true }),
    async as(persona, method, path, options = {}) {
      const url = new URL(
        `${api.baseUrl}${path.startsWith("/api/") || ["/health", "/ready"].includes(path) ? "" : "/api/v1"}${path}`,
      );
      for (const [key, value] of Object.entries(options.query ?? {}))
        if (value !== undefined) url.searchParams.set(key, String(value));
      const headers = new Headers(options.headers);
      if (persona) headers.set("Authorization", `Bearer ${await api.token(personas[persona])}`);
      if (options.body !== undefined) headers.set("Content-Type", "application/json");
      if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
      if (options.ifMatch !== undefined) headers.set("If-Match", `"${options.ifMatch}"`);
      const response = await fetch(url, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const text = await response.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        /* non-JSON (CSV, files) */
      }
      return { status: response.status, body, headers: response.headers };
    },
  };

  before(async () => {
    server = buildApp(prisma).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    api.baseUrl = `http://127.0.0.1:${address.port}`;
  });
  after(async () => {
    if (server) {
      server.close();
      await once(server, "close");
    }
    await prisma.$disconnect();
  });
  return api;
}

/** Asserts a problem response and returns its body. */
export function expectProblem(result: ApiResult, status: number, code?: string): { code: string; title: string } {
  const body = result.body as { code: string; title: string; status: number };
  assert.equal(result.status, status, `expected ${status}, got ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(body.status, status);
  if (code) assert.equal(body.code, code);
  return body;
}

/** Unwraps `{ data }` from a 2xx response. */
export function dataOf<T = unknown>(result: ApiResult): T {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `expected 2xx, got ${result.status}: ${JSON.stringify(result.body)}`,
  );
  return (result.body as { data: T }).data;
}

/** A fresh idempotency key. */
export function newKey(): string {
  return `test-${crypto.randomUUID()}`;
}
