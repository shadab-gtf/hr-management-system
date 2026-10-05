/**
 * Contract checks against the frontend's own Zod schemas (gtfhrfrontend/types/*.ts), so the API can never drift
 * from what the UI validates. Test-only: the runtime service never imports frontend code.
 *
 *   const { leaveOverviewSchema } = await frontendContract("leave");
 *   expectContract(leaveOverviewSchema, dataOf(result));
 *   expectListContract(leaveRequestSchema, result);   // `{ data: T[], meta }` envelope
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import type { ApiResult } from "./api.js";

interface SafeParser {
  safeParse(value: unknown): { success: boolean; error?: { issues: unknown[] } };
}

const frontendRoot = fileURLToPath(new URL("../../../gtfhrfrontend/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": frontendRoot } });

/** All exports of `gtfhrfrontend/types/<file>.ts`. */
export async function frontendContract(file: string): Promise<Record<string, SafeParser>> {
  return jiti.import<Record<string, SafeParser>>(`${frontendRoot}types/${file}.ts`);
}

export function expectContract(schema: SafeParser | undefined, value: unknown): void {
  assert.ok(schema, "schema export not found in the frontend contract");
  const parsed = schema.safeParse(value);
  assert.ok(parsed.success, `contract mismatch: ${JSON.stringify(parsed.error?.issues.slice(0, 5), null, 1)}`);
}

/** Checks a list response: each item against `itemSchema`, plus the list meta. */
export function expectListContract(itemSchema: SafeParser | undefined, result: ApiResult): void {
  assert.equal(result.status, 200, `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`);
  const body = result.body as { data: unknown[]; meta: { requestId: string; hasMore: boolean; nextCursor: unknown } };
  assert.ok(Array.isArray(body.data), "list responses must be { data: [...], meta }");
  assert.equal(typeof body.meta.requestId, "string");
  assert.equal(typeof body.meta.hasMore, "boolean");
  for (const item of body.data) expectContract(itemSchema, item);
}
