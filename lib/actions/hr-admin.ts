"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { closeExit, decideService, updateOffboardingTask } from "@/lib/api/admin/admin.service";
import {
  createLocation,
  removeChecklistTask,
  removeDepartment,
  removeEvent,
  removeHoliday,
  removeLocation,
  removeSite,
  writeCelebrations,
  writeChecklistTask,
  writeDepartment,
  writeEvent,
  writeHoliday,
  writeLeaveType,
  writeProbationDefaults,
  writeShift,
  writeSite,
  removeShift,
  makeDefaultShift,
  writeDepartmentShift,
  writeOvertime,
  writeLateEarly,
  lookupAddress,
} from "@/lib/api/config/config.service";
import { addEmployee, beginExit, changeEmployment } from "@/lib/api/employees/employees.service";
import { failure, formObject, idempotencyKeySchema, success, validationError } from "@/lib/actions/result";
import {
  celebrationSettingsInputSchema,
  checklistTaskInputSchema,
  departmentInputSchema,
  employeeCreateInputSchema,
  employeeExitInputSchema,
  employeeJobInputSchema,
  eventInputSchema,
  holidayInputSchema,
  leaveTypeInputSchema,
  locationInputSchema,
  officeSiteInputSchema,
  probationDefaultsInputSchema,
  serviceDecisionInputSchema,
  shiftInputSchema,
  overtimeInputSchema,
  lateEarlyInputSchema,
  departmentShiftInputSchema,
} from "@/types/hr-config";
import type { ActionResult } from "@/types/action";
import type { AddressMatch } from "@/types/hr-config";

/*
 * HR administration commands. Each validates input, then calls the service,
 * which re-checks the capability; the browser's view of permissions is never trusted.
 */

type Parser<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: z.ZodError } };

async function run<T>(schema: Parser<T>, raw: unknown, command: (input: T) => Promise<unknown>, message: string | ((input: T) => string)): Promise<ActionResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await command(parsed.data);
    refresh();
    return success(typeof message === "function" ? message(parsed.data) : message);
  } catch (error) {
    return failure(error);
  }
}

const idSchema = z.string().min(1).max(120);

/* Holidays */
export async function saveHolidayAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const scope = fields.scope === "selected" ? formData.getAll("locations").filter((value): value is string => typeof value === "string") : [];
  return run(holidayInputSchema, { ...fields, id: fields.id || undefined, locations: scope }, writeHoliday, (input) => (input.id ? "Holiday updated" : `${input.name} added to the calendar`));
}
export async function deleteHolidayAction(id: string): Promise<ActionResult> {
  return run(idSchema, id, removeHoliday, "Holiday removed");
}

/* Events */
export async function saveEventAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  return run(eventInputSchema, { ...fields, id: fields.id || undefined }, (input) => writeEvent(input, key.data), (input) => (input.id ? "Event updated" : "Event published"));
}
export async function deleteEventAction(id: string): Promise<ActionResult> {
  return run(idSchema, id, removeEvent, "Event cancelled");
}
export async function saveCelebrationsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(celebrationSettingsInputSchema, formObject(formData), writeCelebrations, "Celebration settings saved");
}

/* Leave policy */
export async function saveLeaveTypeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const employmentTypes = formData.getAll("employmentTypes").filter((value): value is string => typeof value === "string");
  return run(leaveTypeInputSchema, { ...fields, id: fields.id || undefined, employmentTypes: employmentTypes.length ? employmentTypes : fields.employmentTypesPresent ? [] : undefined }, writeLeaveType, (input) => (input.id ? `${input.name} updated — new policy version` : `${input.name} added`));
}

/* Attendance rules */
export async function saveShiftAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(shiftInputSchema, { ...fields, id: fields.id || undefined }, writeShift, (input) => (input.id ? "Shift updated" : `${input.name} added`));
}
export async function deleteShiftAction(id: string): Promise<ActionResult> {
  return run(idSchema, id, removeShift, "Shift removed");
}
export async function defaultShiftAction(id: string): Promise<ActionResult> {
  return run(idSchema, id, makeDefaultShift, "Default shift changed");
}
export async function assignShiftAction(department: string, shiftId: string): Promise<ActionResult> {
  return run(departmentShiftInputSchema, { department, shiftId }, (input) => writeDepartmentShift(input.department, input.shiftId), (input) => `${input.department} shift updated`);
}
export async function saveOvertimeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(overtimeInputSchema, formObject(formData), writeOvertime, "Overtime policy saved");
}
export async function saveLateEarlyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(lateEarlyInputSchema, formObject(formData), writeLateEarly, "Late coming & early going policy saved");
}
export async function saveSiteAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(officeSiteInputSchema, { ...fields, id: fields.id || undefined }, writeSite, (input) => (input.id ? "Office site updated" : `${input.name} added`));
}
export async function searchAddressAction(query: string): Promise<{ status: "ok"; matches: AddressMatch[] } | { status: "error"; message: string }> {
  const parsed = z.string().trim().min(3, "Type at least 3 characters.").max(160).safeParse(query);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Type an address." };
  try {
    return { status: "ok", matches: await lookupAddress(parsed.data) };
  } catch (error) {
    const result = failure(error);
    return { status: "error", message: result.status === "error" ? result.message : "Search failed." };
  }
}
export async function deleteSiteAction(id: string): Promise<ActionResult> {
  return run(idSchema, id, removeSite, "Office site removed");
}

/* Organization */
export async function saveDepartmentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(departmentInputSchema, { ...fields, originalName: fields.originalName || undefined }, writeDepartment, (input) => (input.originalName ? "Department updated" : `${input.name} created`));
}
export async function deleteDepartmentAction(name: string): Promise<ActionResult> {
  return run(idSchema, name, removeDepartment, "Department removed");
}
export async function addLocationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(locationInputSchema, formObject(formData), (input) => createLocation(input.name), (input) => `${input.name} added`);
}
export async function deleteLocationAction(name: string): Promise<ActionResult> {
  return run(idSchema, name, removeLocation, "Location removed");
}
export async function saveProbationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(probationDefaultsInputSchema, formObject(formData), writeProbationDefaults, "Probation defaults saved");
}

/* Checklists */
export async function saveChecklistTaskAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  return run(checklistTaskInputSchema, { ...fields, id: fields.id || undefined }, writeChecklistTask, (input) => (input.id ? "Task updated" : "Task added to the checklist"));
}
const checklistRef = z.object({ list: z.enum(["onboarding", "offboarding"]), id: idSchema });
export async function deleteChecklistTaskAction(list: "onboarding" | "offboarding", id: string): Promise<ActionResult> {
  return run(checklistRef, { list, id }, (input) => removeChecklistTask(input.list, input.id), "Task removed");
}

/* Offboarding */
const taskToggle = z.object({ employeeId: idSchema, taskId: idSchema, done: z.boolean() });
export async function toggleOffboardingTaskAction(employeeId: string, taskId: string, done: boolean): Promise<ActionResult> {
  return run(taskToggle, { employeeId, taskId, done }, (input) => updateOffboardingTask(input.employeeId, input.taskId, input.done), done ? "Task completed" : "Task reopened");
}
export async function completeExitAction(employeeId: string): Promise<ActionResult> {
  return run(idSchema, employeeId, closeExit, "Exit completed — access and records closed");
}

/* Employee lifecycle */
export async function createEmployeeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = employeeCreateInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await addEmployee(parsed.data, key.data);
    refresh();
    return success(`${parsed.data.name} added — onboarding checklist created`, result.code);
  } catch (error) {
    return failure(error);
  }
}
export async function updateEmploymentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(employeeJobInputSchema, formObject(formData), changeEmployment, "Employment details updated");
}
export async function startExitAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(employeeExitInputSchema, formObject(formData), beginExit, "Exit started — offboarding checklist created");
}

/* Service requests */
export async function decideServiceAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const fields = formObject(formData);
  const parsed = serviceDecisionInputSchema.safeParse(fields);
  if (!parsed.success) return validationError(parsed.error);
  const key = idempotencyKeySchema.safeParse(fields.idempotencyKey);
  if (!key.success) return validationError(key.error);
  try {
    const result = await decideService(parsed.data, key.data);
    refresh();
    const label = parsed.data.decision === "start" ? "Marked in progress" : parsed.data.decision === "approve" ? (parsed.data.kind === "letter" ? "Letter issued" : "Approved") : "Rejected";
    return success(label, result.reference);
  } catch (error) {
    refresh();
    return failure(error);
  }
}
