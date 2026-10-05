"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createUpload, uploadDocumentContent } from "@/lib/api/documents/documents.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { documentSchema } from "@/types/workplace";
import type { ActionResult } from "@/types/action";

const allowedMime = documentSchema.shape.mime;
const uploadSchema = z.object({
  category: documentSchema.shape.category,
  idempotencyKey: idempotencyKeySchema,
});

/**
 * Validates metadata and submits the private file to the backend scan queue.
 */
export async function uploadDocumentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = uploadSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", code: "VALIDATION_FAILED", message: "Choose a file to upload.", fieldErrors: { file: "Choose a PDF, PNG or JPEG file." }, retryable: false };
  if (file.size > 10 * 1024 * 1024)
    return { status: "error", code: "VALIDATION_FAILED", message: "The file is too large.", fieldErrors: { file: "Choose a file smaller than 10 MiB." }, retryable: false };
  const mime = allowedMime.safeParse(file.type);
  if (!mime.success)
    return { status: "error", code: "VALIDATION_FAILED", message: "That file type isn't allowed.", fieldErrors: { file: "Only PDF, PNG or JPEG files are allowed." }, retryable: false };
  try {
    const upload = await createUpload(
      { name: file.name.slice(0, 120), category: parsed.data.category, mime: mime.data, sizeBytes: file.size },
      parsed.data.idempotencyKey,
    );
    await uploadDocumentContent(upload.documentId, file, parsed.data.idempotencyKey);
    refresh();
    return success("Uploaded — verification in progress");
  } catch (error) {
    return failure(error);
  }
}
