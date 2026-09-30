"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { decideCompensationBatch, discardCompensationBatch, uploadCompensationFile } from "@/lib/api/imports/compensation.service";
import { commitAttendanceImport, discardAttendanceImport, uploadAttendanceFile } from "@/lib/api/imports/imports.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { MAX_IMPORT_BYTES } from "@/lib/server/imports/attendance-file";
import type { ActionResult } from "@/types/action";
import { compensationDecisionInputSchema } from "@/types/compensation-import";

const fileError = (message: string): ActionResult => ({ status: "error", code: "VALIDATION_FAILED", message, fieldErrors: { file: message }, retryable: false });

/** Parses and validates the file into a preview. Nothing is imported yet. */
export async function uploadAttendanceAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fileError("Choose the CSV or Excel file exported from the face device.");
  if (file.size > MAX_IMPORT_BYTES) return fileError("Files can be up to 5 MB. Export a shorter date range.");
  if (!/\.(csv|txt|xlsx|xls)$/i.test(file.name)) return fileError("Upload a CSV or Excel (.xlsx) file.");
  let batchId: string;
  try {
    const result = await uploadAttendanceFile({ name: file.name.slice(0, 120), bytes: Buffer.from(await file.arrayBuffer()) });
    batchId = result.id;
  } catch (error) {
    return failure(error);
  }
  redirect(`/admin/attendance-import?batch=${encodeURIComponent(batchId)}`);
}

export async function commitAttendanceAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const id = z.string().min(1).safeParse(fields.batchId);
  if (!id.success) return validationError(id.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await commitAttendanceImport(id.data, key.data);
    refresh();
    return success(`Imported ${result.applied} attendance day${result.applied === 1 ? "" : "s"}`, result.reference);
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function discardAttendanceAction(id: string): Promise<ActionResult> {
  try {
    await discardAttendanceImport(z.string().min(1).parse(id));
    refresh();
    return success("Preview discarded — nothing was imported");
  } catch (error) {
    return failure(error);
  }
}

/* Salary sheet ---------------------------------------------------------------- */

export async function uploadCompensationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fileError("Choose the salary sheet (CSV or Excel).");
  if (file.size > MAX_IMPORT_BYTES) return fileError("Files can be up to 5 MB.");
  if (!/\.(csv|txt|xlsx|xls)$/i.test(file.name)) return fileError("Upload a CSV or Excel (.xlsx) file. PDFs and Word files can't be read reliably — export the data as a spreadsheet.");
  let batchId: string;
  try {
    const result = await uploadCompensationFile({ name: file.name.slice(0, 120), bytes: Buffer.from(await file.arrayBuffer()) });
    batchId = result.id;
  } catch (error) {
    return failure(error);
  }
  redirect(`/payroll/compensation?batch=${encodeURIComponent(batchId)}`);
}

export async function decideCompensationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = compensationDecisionInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await decideCompensationBatch(parsed.data, key.data);
    refresh();
    const label = parsed.data.decision === "submit" ? "Submitted for independent approval" : parsed.data.decision === "approve" ? "Approved — salary revisions applied" : "Batch rejected";
    return success(label, result.reference);
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function discardCompensationAction(id: string): Promise<ActionResult> {
  try {
    await discardCompensationBatch(z.string().min(1).parse(id));
    refresh();
    return success("Preview discarded — nothing changed");
  } catch (error) {
    return failure(error);
  }
}
