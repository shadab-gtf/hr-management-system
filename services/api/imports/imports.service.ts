import "server-only";
import { cache } from "react";
import { z } from "zod";
import { apiConfig } from "@/lib/api/core/config";
import { problem } from "@/lib/api/core/problem";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { commitImport, digestOf, discardImport, getImportBatch, listImportBatches, previewImport } from "@/lib/mocks/handlers/attendance-import";
import { ImportFileError, readAttendanceFile } from "@/lib/server/imports/attendance-file";
import { importBatchSchema, importBatchSummarySchema } from "@/types/attendance-import";

/*
 * Attendance device imports (import.commit). Live mode uploads the raw file to
 * the import service (multipart, virus-scanned, stored immutably) — not wired
 * in this JSON transport yet, so it refuses rather than pretending.
 */

export async function uploadAttendanceFile(file: { name: string; bytes: Buffer }) {
  if (apiConfig.mode !== "mock") throw problem(501, "IMPORT_UPLOAD_NOT_CONNECTED", "Device imports need the live import service.");
  try {
    const parsed = await readAttendanceFile(file);
    if (!parsed.records.length) throw problem(422, "EMPTY_FILE", "The file has a header but no rows.", { fieldErrors: { file: "No attendance rows found." } });
    const actor = await mockActor();
    return previewImport(actor, { name: file.name, digest: digestOf(file.bytes) }, parsed);
  } catch (error) {
    if (error instanceof ImportFileError) throw problem(422, "UNREADABLE_FILE", error.message, { fieldErrors: { file: error.message } });
    throw error;
  }
}

export const getImportBatches = cache(async () =>
  callApi({ schema: z.array(importBatchSummarySchema), live: { path: "/imports/attendance", list: true }, mock: async () => listImportBatches(await mockActor()) }),
);

export const getImportPreview = cache(async (id: string) =>
  callApi({ schema: importBatchSchema, live: { path: `/imports/attendance/${encodeURIComponent(id)}` }, mock: async () => getImportBatch(await mockActor(), id) }),
);

export async function commitAttendanceImport(id: string, idempotencyKey: string) {
  return callApi({
    schema: z.object({ reference: z.string(), applied: z.number().int() }),
    live: { method: "POST", path: `/imports/attendance/${encodeURIComponent(id)}/commit`, body: {}, idempotencyKey },
    mock: async () => commitImport(await mockActor(), id),
  });
}

export async function discardAttendanceImport(id: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: { method: "POST", path: `/imports/attendance/${encodeURIComponent(id)}/discard`, body: {} },
    mock: async () => discardImport(await mockActor(), id),
  });
}
