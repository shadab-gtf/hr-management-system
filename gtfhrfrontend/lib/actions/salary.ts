"use server";

import { refresh } from "next/cache";
import { applyForLoan, updateDeclaration } from "@/lib/api/salary/salary.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { declarationInputSchema, loanInputSchema } from "@/types/salary";
import type { ActionResult } from "@/types/action";

/** Items arrive as `item.<id>` fields; the submitter decides draft vs submit. */
export async function saveDeclarationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const items = Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => key.startsWith("item."))
      .map(([key, value]) => [key.slice(5), value.trim() === "" ? "0" : value.trim()]),
  );
  const parsed = declarationInputSchema.safeParse({
    regime: fields.regime,
    monthlyRent: fields.monthlyRent?.trim() || "0",
    rentCity: fields.rentCity,
    items,
    submit: fields.intent === "submit",
  });
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await updateDeclaration(parsed.data);
    refresh();
    return success(result.status === "submitted" ? "Declaration submitted" : "Draft saved");
  } catch (error) {
    const result = failure(error);
    // Map server field keys (item ids) back to their form field names.
    if (result.status === "error" && result.fieldErrors)
      result.fieldErrors = Object.fromEntries(Object.entries(result.fieldErrors).map(([key, value]) => [`item.${key}`, value]));
    return result;
  }
}

export async function requestLoanAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = loanInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await applyForLoan(parsed.data, key.data);
    refresh();
    return success("Sent to Finance for approval", result.reference);
  } catch (error) {
    return failure(error);
  }
}
