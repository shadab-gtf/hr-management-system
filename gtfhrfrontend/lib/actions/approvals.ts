"use server";

import { refresh } from "next/cache";
import { decide } from "@/lib/api/approvals/approvals.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { approvalDecisionInputSchema } from "@/types/approval";
import type { ActionResult } from "@/types/action";

export async function decideApprovalAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = approvalDecisionInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await decide(parsed.data, key.data);
    refresh();
    return success(parsed.data.decision === "approve" ? "Approved" : "Rejected", result.reference);
  } catch (error) {
    // Stale or already-decided items refresh so the authoritative state shows.
    refresh();
    return failure(error);
  }
}
