import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { listDocuments, registerUpload } from "@/lib/mocks/handlers/documents";
import { documentSchema, type HrDocument } from "@/types/workplace";

export const getDocuments = cache(async () =>
  callApi({
    schema: z.array(documentSchema),
    live: { path: "/documents" },
    mock: async () => listDocuments(await mockActor()),
  }),
);

/** Registers an upload; live mode returns a short-lived, single-object upload grant. */
export async function createUpload(
  input: { name: string; category: HrDocument["category"]; mime: HrDocument["mime"]; sizeBytes: number },
  idempotencyKey: string,
) {
  return callApi({
    schema: z.object({ documentId: z.string(), scanState: z.string() }),
    live: { method: "POST", path: "/documents/uploads", body: input, idempotencyKey },
    mock: async () => registerUpload(await mockActor(), input, idempotencyKey),
  });
}
