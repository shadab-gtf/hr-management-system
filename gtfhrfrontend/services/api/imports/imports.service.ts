import "server-only";
import { cache } from "react";
import { z } from "zod";
import { problem } from "@/lib/api/core/problem";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  commitImport,
  digestOf,
  discardImport,
  getImportBatch,
  listImportBatches,
  previewImport,
} from "@/lib/mocks/handlers/attendance-import";
import {
  importBatchSchema,
  importBatchSummarySchema,
} from "@/types/attendance-import";

/** The backend owns parsing, validation, staging and commit for device uploads. */
export async function uploadAttendanceFile(file: {
  name: string;
  bytes: Buffer;
}) {
  return callApi({
    schema: importBatchSchema,
    live: {
      method: "POST",
      path: "/imports/attendance/upload",
      body: {
        fileName: file.name,
        contentBase64: file.bytes.toString("base64"),
      },
      idempotencyKey: crypto.randomUUID(),
    },
    mock: async () => {
      const { ImportFileError, readAttendanceFile } =
        await import("@/lib/mocks/parsers/attendance-file");
      try {
        const parsed = await readAttendanceFile(file);
        if (!parsed.records.length)
          throw problem(
            422,
            "EMPTY_FILE",
            "The file has a header but no rows.",
          );
        return previewImport(
          await mockActor(),
          { name: file.name, digest: digestOf(file.bytes) },
          parsed,
        );
      } catch (error) {
        if (error instanceof ImportFileError)
          throw problem(422, "UNREADABLE_FILE", error.message);
        throw error;
      }
    },
  });
}

export const getImportBatches = cache(async () =>
  callApi({
    schema: z.array(importBatchSummarySchema),
    live: { path: "/imports/attendance", list: true },
    mock: async () => listImportBatches(await mockActor()),
  }),
);
export const getImportPreview = cache(async (id: string) =>
  callApi({
    schema: importBatchSchema,
    live: { path: `/imports/attendance/${encodeURIComponent(id)}` },
    mock: async () => getImportBatch(await mockActor(), id),
  }),
);
export async function commitAttendanceImport(
  id: string,
  idempotencyKey: string,
) {
  return callApi({
    schema: z.object({ reference: z.string(), applied: z.number().int() }),
    live: {
      method: "POST",
      path: `/imports/attendance/${encodeURIComponent(id)}/commit`,
      body: {},
      idempotencyKey,
    },
    mock: async () => commitImport(await mockActor(), id),
  });
}
export async function discardAttendanceImport(id: string) {
  return callApi({
    schema: z.object({ ok: z.boolean() }),
    live: {
      method: "POST",
      path: `/imports/attendance/${encodeURIComponent(id)}/discard`,
      body: {},
    },
    mock: async () => discardImport(await mockActor(), id),
  });
}
