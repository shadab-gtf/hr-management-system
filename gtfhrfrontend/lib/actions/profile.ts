"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { submitProfileChange } from "@/lib/api/employees/employees.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { profileChangeFieldSchema } from "@/types/employee";
import type { ActionResult } from "@/types/action";

const profileSchema = z.object({
  field: profileChangeFieldSchema,
  value: z.string().trim().min(3, "Enter the new value.").max(200),
  reason: z.string().trim().min(3, "Add a short reason.").max(300),
  idempotencyKey: idempotencyKeySchema,
});

export async function profileChangeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { idempotencyKey, ...input } = parsed.data;
  try {
    const result = await submitProfileChange(input, idempotencyKey);
    refresh();
    return success(
      result.verification === "finance" ? "Sent to Finance for verification" : "Sent to HR for verification",
      result.reference,
    );
  } catch (error) {
    return failure(error);
  }
}
