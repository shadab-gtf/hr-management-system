import "server-only";
import { cache } from "react";
import { z } from "zod";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import {
  addLocation,
  deleteChecklistTask,
  deleteDepartment,
  deleteEvent,
  deleteHoliday,
  deleteLocation,
  deleteSite,
  getAttendanceRules,
  getCelebrationSettings,
  getChecklists,
  getOrganizationConfig,
  listEvents,
  listHolidayRecords,
  listLeaveTypeConfig,
  policyVersion,
  saveCelebrationSettings,
  saveChecklistTask,
  saveDepartment,
  saveEvent,
  saveHoliday,
  saveLeaveType,
  saveProbationDefaults,
  saveShift,
  deleteShift,
  setDefaultShift,
  assignDepartmentShift,
  saveOvertime,
  saveLateEarly,
  findAddress,
  saveSite,
} from "@/lib/mocks/handlers/config";
import {
  addressMatchSchema,
  attendanceRulesSchema,
  celebrationSettingsSchema,
  checklistsSchema,
  companyEventSchema,
  holidayRecordSchema,
  leaveTypeConfigSchema,
  organizationConfigSchema,
  type ChecklistTaskInput,
  type DepartmentInput,
  type EventInput,
  type HolidayInput,
  type LateEarlyInput,
  type LeaveTypeInput,
  type OfficeSiteInput,
  type OvertimeInput,
  type ShiftInput,
} from "@/types/hr-config";

/*
 * HR configuration (policy.publish / event.manage). Live paths follow
 * api-contract.md; every write is re-authorized by the service.
 */

const ok = z.object({ ok: z.boolean() });
const withId = z.object({ id: z.string() }).loose();

/* Holidays */
export const getHolidayRecords = cache(async () =>
  callApi({ schema: z.array(holidayRecordSchema), live: { path: "/config/holidays", list: true }, mock: async () => listHolidayRecords(await mockActor()) }),
);
export async function writeHoliday(input: HolidayInput) {
  return callApi({
    schema: withId,
    live: input.id ? { method: "PATCH", path: `/config/holidays/${encodeURIComponent(input.id)}`, body: input } : { method: "POST", path: "/config/holidays", body: input },
    mock: async () => saveHoliday(await mockActor(), input),
  });
}
export async function removeHoliday(id: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/config/holidays/${encodeURIComponent(id)}/delete`, body: {} }, mock: async () => deleteHoliday(await mockActor(), id) });
}

/* Events & celebrations */
export const getEvents = cache(async () =>
  callApi({ schema: z.array(companyEventSchema), live: { path: "/events", list: true }, mock: async () => listEvents(await mockActor()) }),
);
export async function writeEvent(input: EventInput, idempotencyKey: string) {
  return callApi({
    schema: withId,
    live: input.id ? { method: "PATCH", path: `/events/${encodeURIComponent(input.id)}`, body: input } : { method: "POST", path: "/events", body: input, idempotencyKey },
    mock: async () => saveEvent(await mockActor(), input, idempotencyKey),
  });
}
export async function removeEvent(id: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/events/${encodeURIComponent(id)}/delete`, body: {} }, mock: async () => deleteEvent(await mockActor(), id) });
}
export const getCelebrations = cache(async () =>
  callApi({ schema: celebrationSettingsSchema, live: { path: "/config/celebrations" }, mock: async () => getCelebrationSettings(await mockActor()) }),
);
export async function writeCelebrations(input: { showWorkAnniversaries: boolean; showNewJoiners: boolean }) {
  return callApi({ schema: ok, live: { method: "PATCH", path: "/config/celebrations", body: input }, mock: async () => saveCelebrationSettings(await mockActor(), input) });
}

/* Leave policy */
export const getLeavePolicy = cache(async () =>
  callApi({ schema: z.array(leaveTypeConfigSchema), live: { path: "/config/leave-types", list: true }, mock: async () => listLeaveTypeConfig(await mockActor()) }),
);
export async function writeLeaveType(input: LeaveTypeInput) {
  return callApi({
    schema: z.object({ id: z.string(), version: z.string() }),
    live: input.id ? { method: "PATCH", path: `/config/leave-types/${encodeURIComponent(input.id)}`, body: input } : { method: "POST", path: "/config/leave-types", body: input },
    mock: async () => saveLeaveType(await mockActor(), input),
  });
}

export const getLeavePolicyVersion = cache(async () =>
  callApi({ schema: z.string(), live: { path: "/config/leave-types/version" }, mock: () => policyVersion() }),
);

/* Attendance rules */
export const getAttendanceRulesConfig = cache(async () =>
  callApi({ schema: attendanceRulesSchema, live: { path: "/config/attendance" }, mock: async () => getAttendanceRules(await mockActor()) }),
);
export async function writeShift(input: ShiftInput) {
  return callApi({
    schema: withId,
    live: input.id ? { method: "PATCH", path: `/config/shifts/${encodeURIComponent(input.id)}`, body: input } : { method: "POST", path: "/config/shifts", body: input },
    mock: async () => saveShift(await mockActor(), input),
  });
}
export async function removeShift(id: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/config/shifts/${encodeURIComponent(id)}/delete`, body: {} }, mock: async () => deleteShift(await mockActor(), id) });
}
export async function makeDefaultShift(id: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/config/shifts/${encodeURIComponent(id)}/default`, body: {} }, mock: async () => setDefaultShift(await mockActor(), id) });
}
export async function writeDepartmentShift(department: string, shiftId: string) {
  return callApi({ schema: ok, live: { method: "PATCH", path: `/config/departments/${encodeURIComponent(department)}/shift`, body: { shiftId } }, mock: async () => assignDepartmentShift(await mockActor(), department, shiftId) });
}
export async function writeOvertime(input: OvertimeInput) {
  return callApi({ schema: ok, live: { method: "PATCH", path: "/config/attendance/overtime", body: input }, mock: async () => saveOvertime(await mockActor(), input) });
}
export async function writeLateEarly(input: LateEarlyInput) {
  return callApi({ schema: ok, live: { method: "PATCH", path: "/config/attendance/late-early", body: input }, mock: async () => saveLateEarly(await mockActor(), input) });
}
export async function lookupAddress(query: string) {
  return callApi({
    schema: z.array(addressMatchSchema),
    live: { path: "/config/sites/address-search", query: { q: query } },
    mock: async () => findAddress(await mockActor(), query),
  });
}
export async function writeSite(input: OfficeSiteInput) {
  return callApi({
    schema: withId,
    live: input.id ? { method: "PATCH", path: `/config/sites/${encodeURIComponent(input.id)}`, body: input } : { method: "POST", path: "/config/sites", body: input },
    mock: async () => saveSite(await mockActor(), input),
  });
}
export async function removeSite(id: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/config/sites/${encodeURIComponent(id)}/delete`, body: {} }, mock: async () => deleteSite(await mockActor(), id) });
}

/* Organization */
export const getOrganization = cache(async () =>
  callApi({ schema: organizationConfigSchema, live: { path: "/config/organization" }, mock: async () => getOrganizationConfig(await mockActor()) }),
);
export async function writeDepartment(input: DepartmentInput) {
  return callApi({
    schema: z.object({ name: z.string() }),
    live: input.originalName ? { method: "PATCH", path: `/config/departments/${encodeURIComponent(input.originalName)}`, body: input } : { method: "POST", path: "/config/departments", body: input },
    mock: async () => saveDepartment(await mockActor(), input),
  });
}
export async function removeDepartment(name: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/config/departments/${encodeURIComponent(name)}/delete`, body: {} }, mock: async () => deleteDepartment(await mockActor(), name) });
}
export async function createLocation(name: string) {
  return callApi({ schema: z.object({ name: z.string() }), live: { method: "POST", path: "/config/locations", body: { name } }, mock: async () => addLocation(await mockActor(), name) });
}
export async function removeLocation(name: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/config/locations/${encodeURIComponent(name)}/delete`, body: {} }, mock: async () => deleteLocation(await mockActor(), name) });
}

/* Checklists */
export const getChecklistTemplates = cache(async () =>
  callApi({ schema: checklistsSchema, live: { path: "/config/checklists" }, mock: async () => getChecklists(await mockActor()) }),
);
export async function writeChecklistTask(input: ChecklistTaskInput) {
  return callApi({
    schema: withId,
    live: input.id ? { method: "PATCH", path: `/config/checklists/${input.list}/${encodeURIComponent(input.id)}`, body: input } : { method: "POST", path: `/config/checklists/${input.list}`, body: input },
    mock: async () => saveChecklistTask(await mockActor(), input),
  });
}
export async function removeChecklistTask(list: "onboarding" | "offboarding", id: string) {
  return callApi({ schema: ok, live: { method: "POST", path: `/config/checklists/${list}/${encodeURIComponent(id)}/delete`, body: {} }, mock: async () => deleteChecklistTask(await mockActor(), list, id) });
}

/* Probation defaults */
export async function writeProbationDefaults(input: { full_time: number; contract: number; intern: number }) {
  return callApi({ schema: ok, live: { method: "PATCH", path: "/config/probation", body: input }, mock: async () => saveProbationDefaults(await mockActor(), input) });
}
