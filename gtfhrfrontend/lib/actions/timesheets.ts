"use server";

import { refresh } from "next/cache";
import {
  copyTimesheetFromPreviousWeek,
  decideTeamTimesheet,
  remindMissingTimesheet,
  saveTimesheet,
  upsertProject,
} from "@/lib/api/timesheets/timesheets.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import {
  copyPreviousWeekInputSchema,
  hoursLabel,
  projectInputSchema,
  saveTimesheetInputSchema,
  timesheetDecisionInputSchema,
  timesheetReminderInputSchema,
} from "@/types/timesheets";
import type { ActionResult } from "@/types/action";

function parseRows(value: string | undefined): unknown {
  try {
    return JSON.parse(value ?? "[]");
  } catch {
    return null;
  }
}

export async function saveTimesheetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = saveTimesheetInputSchema.safeParse({ ...fields, rows: parseRows(fields.rows) });
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await saveTimesheet(parsed.data, key.data);
    refresh();
    const warning = result.warnings.length > 0 ? ` · ${result.warnings.length} day${result.warnings.length === 1 ? "" : "s"} to double-check` : "";
    return success(parsed.data.intent === "submit" ? `Submitted ${hoursLabel(result.totalQuarters)} for approval` : `Draft saved · ${hoursLabel(result.totalQuarters)}${warning}`);
  } catch (error) {
    return failure(error);
  }
}

export async function copyPreviousWeekAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = copyPreviousWeekInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await copyTimesheetFromPreviousWeek(parsed.data, key.data);
    refresh();
    const skipped = result.skippedRows > 0 ? ` · ${result.skippedRows} closed project row${result.skippedRows === 1 ? "" : "s"} skipped` : "";
    return success(`Copied ${result.copiedRows} row${result.copiedRows === 1 ? "" : "s"} (${hoursLabel(result.totalQuarters)}) as a draft${skipped}`);
  } catch (error) {
    return failure(error);
  }
}

export async function decideTimesheetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = timesheetDecisionInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    await decideTeamTimesheet(parsed.data, key.data);
    refresh();
    return success(parsed.data.decision === "approve" ? "Timesheet approved" : "Timesheet sent back with your comment");
  } catch (error) {
    return failure(error);
  }
}

export async function remindTimesheetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = timesheetReminderInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await remindMissingTimesheet(parsed.data, key.data);
    refresh();
    return success(result.state === "already_reminded" ? "Already reminded today" : "Reminder sent");
  } catch (error) {
    return failure(error);
  }
}

export async function saveProjectAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = projectInputSchema.safeParse({
    ...fields,
    id: fields.id || undefined,
    version: fields.version || undefined,
    memberIds: formData.getAll("memberIds").filter((value): value is string => typeof value === "string"),
  });
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await upsertProject(parsed.data, key.data);
    refresh();
    return success(parsed.data.id ? "Project updated" : "Project created", result.reference);
  } catch (error) {
    return failure(error);
  }
}
