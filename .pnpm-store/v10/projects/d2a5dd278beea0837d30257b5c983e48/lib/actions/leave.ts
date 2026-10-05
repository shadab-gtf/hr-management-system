"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  adjustLeaveBalance,
  cancelCompOffClaim,
  cancelEncashmentRequest,
  cancelLeaveRequest,
  decideCompOffClaim,
  decideEncashmentRequest,
  runYearEnd,
  submitCompOffClaim,
  submitEncashment,
  submitLeaveRequest,
} from "@/lib/api/leave/leave.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import {
  balanceAdjustmentInputSchema,
  compOffClaimInputSchema,
  decisionInputSchema,
  encashInputSchema,
  leaveRequestInputSchema,
} from "@/types/leave";
import { formatUnits } from "@/lib/utils/format";
import type { ActionResult } from "@/types/action";

const ATTACHMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_ATTACHMENT = 5 * 1024 * 1024;

export async function requestLeaveAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  const parsed = leaveRequestInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  if (!key.success) return validationError(key.error);
  const file = formData.get("attachment");
  let attachmentName: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!ATTACHMENT_TYPES.has(file.type))
      return { status: "error", code: "VALIDATION_FAILED", message: "Check the highlighted fields.", fieldErrors: { attachment: "Use a PDF, JPG or PNG." }, retryable: false };
    if (file.size > MAX_ATTACHMENT)
      return { status: "error", code: "VALIDATION_FAILED", message: "Check the highlighted fields.", fieldErrors: { attachment: "Keep the file under 5 MB." }, retryable: false };
    attachmentName = file.name.slice(0, 120);
  }
  try {
    // Units are computed by the server; the client estimate is never trusted.
    const result = await submitLeaveRequest({ ...parsed.data, attachmentName }, key.data);
    refresh();
    return success(`Request sent for ${formatUnits(result.units)}`, result.reference);
  } catch (error) {
    return failure(error);
  }
}

const cancelSchema = z.object({ id: z.string().min(1), version: z.coerce.number().int() });

export async function cancelLeaveAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await cancelLeaveRequest(parsed.data.id, parsed.data.version);
    refresh();
    return success("Leave request cancelled", result.reference);
  } catch (error) {
    return failure(error);
  }
}

/* Comp-off ------------------------------------------------------------------ */

export async function claimCompOffAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = compOffClaimInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await submitCompOffClaim(parsed.data, key.data);
    refresh();
    return success("Comp-off claim sent to your manager", result.reference);
  } catch (error) {
    return failure(error);
  }
}

export async function decideCompOffAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = decisionInputSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await decideCompOffClaim(parsed.data);
    refresh();
    return success(parsed.data.decision === "approve" ? "Comp-off approved and credited" : "Comp-off rejected", result.reference);
  } catch (error) {
    refresh();
    return failure(error);
  }
}

const idSchema = z.string().min(1).max(120);

export async function cancelCompOffAction(id: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await cancelCompOffClaim(parsed.data);
    refresh();
    return success("Claim withdrawn", result.reference);
  } catch (error) {
    return failure(error);
  }
}

/* Encashment ---------------------------------------------------------------- */

export async function requestEncashmentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = encashInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await submitEncashment(parsed.data, key.data);
    refresh();
    return success(`Encashment request sent to HR (${result.amount})`, result.reference);
  } catch (error) {
    return failure(error);
  }
}

export async function decideEncashmentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = decisionInputSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await decideEncashmentRequest(parsed.data);
    refresh();
    return success(parsed.data.decision === "approve" ? "Encashment approved — payout recorded for payroll" : "Encashment rejected", result.reference);
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function cancelEncashmentAction(id: string): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await cancelEncashmentRequest(parsed.data);
    refresh();
    return success("Encashment request withdrawn", result.reference);
  } catch (error) {
    return failure(error);
  }
}

/* HR: adjustments and year-end --------------------------------------------- */

export async function adjustBalanceAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = balanceAdjustmentInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await adjustLeaveBalance(parsed.data, key.data);
    refresh();
    return success(`Balance adjusted — new balance ${formatUnits(result.balance)}`, result.reference);
  } catch (error) {
    return failure(error);
  }
}

const yearSchema = z.object({ year: z.string().regex(/^\d{4}$/), idempotencyKey: idempotencyKeySchema });

export async function runYearEndAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = yearSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await runYearEnd(parsed.data.year, parsed.data.idempotencyKey);
    refresh();
    return success(`Year-end ${result.year} processed · ${result.rows} balances`);
  } catch (error) {
    refresh();
    return failure(error);
  }
}
