"use server";

import { refresh } from "next/cache";
import { submitExpense } from "@/lib/api/expenses/expenses.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { expenseInputSchema } from "@/types/workplace";
import type { ActionResult } from "@/types/action";

export async function createExpenseAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = expenseInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await submitExpense(parsed.data, key.data);
    refresh();
    return success("Claim submitted for approval", result.reference);
  } catch (error) {
    return failure(error);
  }
}
