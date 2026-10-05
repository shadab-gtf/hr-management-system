"use server";

import { refresh } from "next/cache";
import {
  clearReportSchedule,
  createOrUpdateReport,
  removeSavedReport,
  runReportScheduleNow,
  setReportSchedule,
} from "@/lib/api/reports/reports.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { saveReportInputSchema, scheduleInputSchema } from "@/types/reports";
import type { ActionResult } from "@/types/action";

function parseSpec(value: string | undefined): unknown {
  try {
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

export async function saveReportAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = saveReportInputSchema.safeParse({
    id: fields.id || undefined,
    version: fields.version || undefined,
    name: fields.name,
    description: fields.description ?? "",
    visibility: fields.visibility,
    sharedRoles: formData.getAll("sharedRoles").filter((value): value is string => typeof value === "string"),
    spec: parseSpec(fields.spec),
  });
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  let id: string;
  try {
    id = (await createOrUpdateReport(parsed.data, key.data)).id;
  } catch (error) {
    return failure(error);
  }
  refresh();
  return success(parsed.data.id ? "Report updated" : "Report saved", id);
}

export async function deleteReportAction(id: string): Promise<ActionResult> {
  try {
    await removeSavedReport(id);
    refresh();
    return success("Saved report deleted");
  } catch (error) {
    return failure(error);
  }
}

export async function scheduleReportAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = scheduleInputSchema.safeParse({
    reportId: fields.reportId,
    frequency: fields.frequency,
    weekday: fields.weekday || 1,
    dayOfMonth: fields.dayOfMonth || 1,
    time: fields.time,
    format: fields.format,
    recipients: formData.getAll("recipients").filter((value): value is string => typeof value === "string"),
    active: fields.active === "on",
  });
  if (!parsed.success) return validationError(parsed.error);
  try {
    await setReportSchedule(parsed.data);
    refresh();
    return success(parsed.data.active ? "Schedule saved" : "Schedule saved (paused)");
  } catch (error) {
    return failure(error);
  }
}

export async function removeScheduleAction(id: string): Promise<ActionResult> {
  try {
    await clearReportSchedule(id);
    refresh();
    return success("Schedule removed");
  } catch (error) {
    return failure(error);
  }
}

export async function runScheduleNowAction(id: string): Promise<ActionResult> {
  try {
    const result = await runReportScheduleNow(id);
    refresh();
    return success(`Generated ${result.rowCount} rows — logged as a mock delivery (not emailed)`);
  } catch (error) {
    return failure(error);
  }
}
