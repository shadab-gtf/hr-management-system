import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { listDocuments, registerUpload } from "@/lib/mocks/handlers/documents";
import { documentSchema, type HrDocument } from "@/types/workplace";
export const getDocuments = cache(async () => callApi({
    schema: z.array(documentSchema),
    live: { path: "/documents" },
    mock: async () => listDocuments(await mockActor()),
}));
/** Reserves an owner-scoped document before submitting its bytes for scanning. */
export async function createUpload(input: {
    name: string;
    category: HrDocument["category"];
    mime: HrDocument["mime"];
    sizeBytes: number;
}, idempotencyKey: string) {
    return callApi({
        schema: z.object({ documentId: z.string(), scanState: z.string() }),
        live: { method: "POST", path: "/documents/uploads", body: input, idempotencyKey },
        mock: async () => registerUpload(await mockActor(), input, idempotencyKey),
    });
}
export async function uploadDocumentContent(documentId: string, file: File, idempotencyKey: string) {
    return callApi({
        schema: z.object({ documentId: z.string(), scanState: z.string() }),
        live: { method: "PUT", path: `/documents/uploads/${encodeURIComponent(documentId)}/content`, body: { mime: file.type, contentBase64: Buffer.from(await file.arrayBuffer()).toString("base64") }, idempotencyKey: createHash("sha256").update(`document-content:${idempotencyKey}`).digest("hex") },
        mock: () => ({ documentId, scanState: "scanning" }),
    });
}
