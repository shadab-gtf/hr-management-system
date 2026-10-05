"use server";

import { refresh } from "next/cache";
import { addDelegation, endDelegation, submitLetter, submitPermission } from "@/lib/api/requests/requests.service";
import { star } from "@/lib/api/people/people.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { delegationInputSchema, letterInputSchema, permissionInputSchema } from "@/types/requests";
import type { ActionResult } from "@/types/action";

export async function requestLetterAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = letterInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await submitLetter(parsed.data, key.data);
    refresh();
    return success("Letter requested", result.reference);
  } catch (error) {
    return failure(error);
  }
}

export async function requestPermissionAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = permissionInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await submitPermission(parsed.data, key.data);
    refresh();
    return success(`Permission requested (${result.minutes} min)`, result.reference);
  } catch (error) {
    return failure(error);
  }
}

export async function createDelegationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = delegationInputSchema.safeParse({ ...fields, workflows: formData.getAll("workflows") });
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    await addDelegation(parsed.data, key.data);
    refresh();
    return success("Delegation scheduled");
  } catch (error) {
    return failure(error);
  }
}

export async function revokeDelegationAction(id: string): Promise<void> {
  await endDelegation(id);
  refresh();
}

/** Starring is a personal preference; safe to reflect optimistically. */
export async function toggleStarAction(id: string): Promise<void> {
  await star(id);
  refresh();
}
