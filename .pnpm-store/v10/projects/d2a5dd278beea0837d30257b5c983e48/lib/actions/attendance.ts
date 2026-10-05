"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  applyRosterWeekPattern,
  cancelSwap,
  decideSwap,
  recordAttendance,
  saveRosterWeek,
  saveWeeklyOffRule,
  submitRegularization,
  submitShiftSwap,
} from "@/lib/api/attendance/attendance.service";
import { rosterPatternInputSchema, rosterSaveInputSchema, shiftSwapInputSchema, weeklyOffInputSchema } from "@/types/attendance";
import { decisionInputSchema } from "@/types/leave";
import { verifyLocation } from "@/lib/api/location/location.service";
import { locationReadingSchema } from "@/types/location";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import { isoDateSchema } from "@/types/common";
import type { ActionResult } from "@/types/action";

const captureSchema = z.object({
  direction: z.enum(["check_in", "check_out"]),
  idempotencyKey: idempotencyKeySchema,
  /** Present only when the user chose to share location for this action. */
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  accuracy: z.string().optional(),
});

export async function captureAttendanceAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = captureSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { latitude, longitude, accuracy } = parsed.data;
    const reading = latitude && longitude ? locationReadingSchema.safeParse({ latitude, longitude, accuracy: accuracy ?? "0" }) : null;
    const location = await verifyLocation(reading?.success ? reading.data : null);
    const result = await recordAttendance(parsed.data.direction, parsed.data.idempotencyKey, location);
    refresh();
    return success(`${parsed.data.direction === "check_in" ? "Checked in" : "Checked out"} · ${location.label}`, result.reference);
  } catch (error) {
    return failure(error);
  }
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30.");
const regularizationSchema = z.object({
  date: isoDateSchema,
  proposedIn: time,
  proposedOut: time,
  reason: z.string().trim().min(5, "Explain what happened (at least 5 characters).").max(500),
  idempotencyKey: idempotencyKeySchema,
});

export async function regularizeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = regularizationSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { idempotencyKey, ...input } = parsed.data;
    const result = await submitRegularization(input, idempotencyKey);
    refresh();
    return success(`Correction sent to ${result.approver}`, result.reference);
  } catch (error) {
    return failure(error);
  }
}

/* Shift roster -------------------------------------------------------------- */

export async function saveRosterAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = rosterSaveInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  // Cells arrive as "cell:<employeeId>:<dayIndex>" → "" (department default), "off" or a shift id.
  const cells: Record<string, (string | null)[]> = {};
  for (const [name, value] of Object.entries(fields)) {
    const match = /^cell:([\w-]{1,40}):([0-6])$/.exec(name);
    if (!match?.[1] || !match[2]) continue;
    const row = (cells[match[1]] ??= [null, null, null, null, null, null, null]);
    row[Number(match[2])] = value === "" ? null : value.slice(0, 40);
  }
  try {
    const result = await saveRosterWeek(parsed.data, cells, key.data);
    refresh();
    return success(result.status === "published" ? "Roster published — employees can see it now" : "Draft saved (not visible to employees)");
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function applyRosterPatternAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = rosterPatternInputSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await applyRosterWeekPattern(parsed.data);
    refresh();
    return success(parsed.data.pattern === "copy_previous" ? "Copied last week into the draft" : parsed.data.pattern === "rotate" ? "Rotation applied to the draft" : "Draft reset to department defaults");
  } catch (error) {
    return failure(error);
  }
}

export async function saveWeeklyOffAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = weeklyOffInputSchema.safeParse({
    department: fields.department,
    offWeekdays: formData.getAll("offWeekdays").filter((value): value is string => typeof value === "string"),
    alternateSaturdays: fields.alternateSaturdays === "on",
  });
  if (!parsed.success) return validationError(parsed.error);
  try {
    await saveWeeklyOffRule(parsed.data);
    refresh();
    return success(`Weekly offs for ${parsed.data.department} saved`);
  } catch (error) {
    return failure(error);
  }
}

export async function requestSwapAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = shiftSwapInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await submitShiftSwap(parsed.data, key.data);
    refresh();
    return success("Swap request sent to your manager", result.reference);
  } catch (error) {
    return failure(error);
  }
}

export async function decideSwapAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = decisionInputSchema.safeParse(formObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await decideSwap(parsed.data);
    refresh();
    return success(parsed.data.decision === "approve" ? "Swap approved — roster updated" : "Swap rejected", result.reference);
  } catch (error) {
    refresh();
    return failure(error);
  }
}

export async function cancelSwapAction(id: string): Promise<ActionResult> {
  const parsed = z.string().min(1).max(120).safeParse(id);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await cancelSwap(parsed.data);
    refresh();
    return success("Swap request withdrawn", result.reference);
  } catch (error) {
    return failure(error);
  }
}
