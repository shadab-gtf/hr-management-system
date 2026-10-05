import "server-only";
import { cache } from "react";
import { z } from "zod";
import { apiConfig } from "@/lib/api/core/config";
import { problem } from "@/lib/api/core/problem";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { decideCompensation, discardCompensation, getCompensationBatch, listCompensationBatches, previewCompensation } from "@/lib/mocks/handlers/compensation-import";
import { compensationBatchSchema, compensationBatchSummarySchema, type CompensationDecisionInput } from "@/types/compensation-import";
import { createHash } from "node:crypto";

/* Salary sheet import (compensation.manage → independent payroll.approve). */

export async function uploadCompensationFile(file: { name: string; bytes: Buffer }) {
  if (apiConfig.mode === "live") return callApi({
    schema: compensationBatchSchema,
    live: { method: "POST", path: "/compensation/imports/upload", body: { fileName: file.name, base64: file.bytes.toString("base64") }, idempotencyKey: `comp-${createHash("sha256").update(file.bytes).digest("hex")}` },
    mock: async () => { throw new Error("The live upload must use the backend API."); },
  });
  const [{ ImportFileError }, { readCompensationFile }] = await Promise.all([
    import("@/lib/mocks/parsers/attendance-file"),
    import("@/lib/mocks/parsers/compensation-file"),
  ]);
  try {
    const parsed = await readCompensationFile(file);
    if (!parsed.records.length) throw problem(422, "EMPTY_FILE", "The sheet has a header but no rows.", { fieldErrors: { file: "No salary rows found." } });
    return previewCompensation(await mockActor(), file, parsed);
  } catch (error) {
    if (error instanceof ImportFileError) throw problem(422, "UNREADABLE_FILE", error.message, { fieldErrors: { file: error.message } });
    throw error;
  }
}

export const getCompensationBatches = cache(async () =>
  callApi({ schema: z.array(compensationBatchSummarySchema), live: { path: "/compensation/imports", list: true }, mock: async () => listCompensationBatches(await mockActor()) }),
);

export const getCompensationPreview = cache(async (id: string) =>
  callApi({ schema: compensationBatchSchema, live: { path: `/compensation/imports/${encodeURIComponent(id)}` }, mock: async () => getCompensationBatch(await mockActor(), id) }),
);

export async function decideCompensationBatch(input: CompensationDecisionInput, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), state: z.string() }),
    live: { method: "POST", path: `/compensation/imports/${encodeURIComponent(input.batchId)}/decisions`, body: { decision: input.decision, reason: input.note }, idempotencyKey },
    mock: async () => decideCompensation(await mockActor(), input),
  });
}

export async function discardCompensationBatch(id: string) {
  return callApi({ schema: z.object({ ok: z.boolean() }), live: { method: "POST", path: `/compensation/imports/${encodeURIComponent(id)}/discard`, body: {} }, mock: async () => discardCompensation(await mockActor(), id) });
}
