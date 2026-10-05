import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nowInstant } from "@/lib/mocks/store";
import { halves } from "@/lib/mocks/seed/random";
import type { MockChecklistTask, MockLeaveType } from "@/lib/mocks/seed/config";
import { idempotent, ref, refById, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import type {
  AttendanceRules,
  CelebrationSettings,
  ChecklistTaskInput,
  Checklists,
  CompanyEvent,
  DepartmentInput,
  EventInput,
  HolidayInput,
  HolidayRecord,
  LateEarlyInput,
  LeaveTypeConfig,
  LeaveTypeInput,
  OfficeSiteInput,
  OrganizationConfig,
  OvertimeInput,
  ShiftInput,
} from "@/types/hr-config";
import type { Holiday } from "@/types/leave";

/* Runtime lookups used by the other handlers ------------------------------ */

const appliesTo = (holiday: HolidayRecord, location: string | undefined) =>
  holiday.locations.length === 0 || (location !== undefined && holiday.locations.includes(location));

/** Paid (non-optional) holiday for the location, or any location when omitted. */
export function isHoliday(date: string, location?: string): boolean {
  return db().config.holidays.some((holiday) => holiday.date === date && holiday.kind !== "optional" && (location === undefined ? holiday.locations.length === 0 : appliesTo(holiday, location)));
}
export function holidayName(date: string, location?: string): string | null {
  return db().config.holidays.find((holiday) => holiday.date === date && (location === undefined || appliesTo(holiday, location)))?.name ?? null;
}
export function holidaysFor(location?: string): Holiday[] {
  return db()
    .config.holidays.filter((holiday) => location === undefined || appliesTo(holiday, location))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, name, kind }) => ({ date, name, kind }));
}
export function leaveTypes(): MockLeaveType[] {
  return db().config.leaveTypes;
}
export function policyVersion(): string {
  return `LV-2026.${db().config.policyRevision}`;
}
/** The employee's shift: department assignment, else the default shift. */
export function shiftFor(employee: { department: string }) {
  const { shifts, departmentShifts, defaultShiftId } = db().config;
  const id = departmentShifts[employee.department] ?? defaultShiftId;
  return shifts.find((item) => item.id === id) ?? shifts[0] ?? { id: "sh_none", name: "General shift", start: "09:30", end: "18:30", graceMinutes: 15, breakMinutes: 60 };
}
export function overtimePolicy() {
  return db().config.overtime;
}
const toMinutes = (value: string) => {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + m;
};
/** Overtime for a day under the policy: whole blocks after the end buffer, capped. */
export function overtimeMinutes(employee: { department: string }, lastOut: string | null, shiftEnd?: string): number {
  const policy = overtimePolicy();
  if (!policy.enabled || !lastOut) return 0;
  const extra = toMinutes(lastOut) - toMinutes(shiftEnd ?? shiftFor(employee).end);
  if (extra < policy.startsAfterMinutes) return 0;
  return Math.min(Math.floor(extra / policy.blockMinutes) * policy.blockMinutes, policy.dailyCapMinutes);
}
export function lateEarlyPolicy() {
  return db().config.lateEarly;
}
export function sites() {
  return db().config.sites;
}
export function departmentNames(): string[] {
  return db().config.departments.map((department) => department.name);
}
export function locationNames(): string[] {
  return db().config.locations;
}
export function costCenterFor(department: string): string {
  return db().config.departments.find((item) => item.name === department)?.costCenter ?? "Unassigned";
}
export function checklist(list: "onboarding" | "offboarding"): MockChecklistTask[] {
  return db().config.checklists[list];
}
export function celebrationSettings(): CelebrationSettings {
  return { ...db().config.celebrations, showBirthdays: false };
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "item";
function uniqueId(prefix: string, existing: string[]) {
  const store = db();
  store.counter += 1;
  let id = `${prefix}_${store.counter}`;
  while (existing.includes(id)) id = `${prefix}_${(store.counter += 1)}`;
  return id;
}

/* Holidays ----------------------------------------------------------------- */

export function listHolidayRecords(actor: MockActor): HolidayRecord[] {
  requireCapability(actor, "policy.publish");
  return [...db().config.holidays].sort((a, b) => a.date.localeCompare(b.date));
}

export function saveHoliday(actor: MockActor, input: HolidayInput) {
  requireCapability(actor, "policy.publish");
  const store = db();
  const list = store.config.holidays;
  const unknown = input.locations.find((location) => !store.config.locations.includes(location));
  if (unknown) throw problem(422, "UNKNOWN_LOCATION", `${unknown} is not a configured location.`, { fieldErrors: { locations: "Choose configured locations." } });
  const clash = list.find((holiday) => holiday.date === input.date && holiday.id !== input.id && (holiday.locations.length === 0 || input.locations.length === 0 || holiday.locations.some((l) => input.locations.includes(l))));
  if (clash) throw problem(409, "HOLIDAY_EXISTS", `${clash.name} is already on that date for an overlapping location.`, { fieldErrors: { date: "Another holiday already uses this date." } });
  if (input.id) {
    const current = list.find((holiday) => holiday.id === input.id);
    if (!current) throw problem(404, "NOT_FOUND", "That holiday no longer exists.");
    Object.assign(current, { name: input.name, date: input.date, kind: input.kind, locations: input.locations });
    return { id: current.id };
  }
  const id = uniqueId("hol", list.map((holiday) => holiday.id));
  list.push({ id, name: input.name, date: input.date, kind: input.kind, locations: input.locations });
  return { id };
}

export function deleteHoliday(actor: MockActor, id: string) {
  requireCapability(actor, "policy.publish");
  const store = db();
  const holiday = store.config.holidays.find((item) => item.id === id);
  if (!holiday) throw problem(404, "NOT_FOUND", "That holiday no longer exists.");
  if (holiday.date < store.today) throw problem(409, "PAST_HOLIDAY", "Past holidays are part of attendance history and can’t be removed.");
  store.config.holidays = store.config.holidays.filter((item) => item.id !== id);
  return { ok: true };
}

/* Events & celebrations ---------------------------------------------------- */

export function listEvents(actor: MockActor, options: { upcomingOnly?: boolean; department?: string } = {}): CompanyEvent[] {
  requireCapability(actor, "directory.read");
  const store = db();
  return store.config.events
    .filter((event) => !options.upcomingOnly || event.date >= store.today)
    .filter((event) => options.department === undefined || event.audience === "Everyone" || event.audience === options.department)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

export function saveEvent(actor: MockActor, input: EventInput, key: string | undefined) {
  requireCapability(actor, "event.manage");
  return idempotent(key, () => {
    const store = db();
    if (input.audience !== "Everyone" && !departmentNames().includes(input.audience))
      throw problem(422, "UNKNOWN_AUDIENCE", "Choose Everyone or a department.", { fieldErrors: { audience: "Choose Everyone or a department." } });
    if (!input.id && input.date < store.today) throw problem(422, "PAST_DATE", "New events need a date from today.", { fieldErrors: { date: "Today or later." } });
    const record: Omit<CompanyEvent, "id"> = {
      title: input.title,
      date: input.date,
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      venue: input.venue,
      description: input.description,
      category: input.category,
      audience: input.audience,
    };
    if (input.id) {
      const current = store.config.events.find((event) => event.id === input.id);
      if (!current) throw problem(404, "NOT_FOUND", "That event no longer exists.");
      Object.assign(current, record);
      return { id: current.id };
    }
    const id = uniqueId("ev", store.config.events.map((event) => event.id));
    store.config.events.push({ id, ...record });
    if (input.shareToFeed)
      store.posts.unshift({
        id: `po_${id}`,
        kind: "announcement",
        group: "Events",
        authorId: null,
        subjectId: null,
        title: input.title,
        body: `${input.description || "Join us!"} · ${input.venue}`,
        createdAt: nowInstant(),
        reactions: { like: [], celebrate: [], support: [], insightful: [] },
        comments: [],
      });
    return { id };
  });
}

export function deleteEvent(actor: MockActor, id: string) {
  requireCapability(actor, "event.manage");
  const store = db();
  if (!store.config.events.some((event) => event.id === id)) throw problem(404, "NOT_FOUND", "That event no longer exists.");
  store.config.events = store.config.events.filter((event) => event.id !== id);
  return { ok: true };
}

export function getCelebrationSettings(actor: MockActor): CelebrationSettings {
  requireCapability(actor, "event.manage");
  return celebrationSettings();
}
export function saveCelebrationSettings(actor: MockActor, input: { showWorkAnniversaries: boolean; showNewJoiners: boolean }) {
  requireCapability(actor, "event.manage");
  db().config.celebrations = { ...input };
  return { ok: true };
}

/* Leave policy ------------------------------------------------------------- */

export function listLeaveTypeConfig(actor: MockActor): LeaveTypeConfig[] {
  requireCapability(actor, "policy.publish");
  const store = db();
  return store.config.leaveTypes.map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    description: type.description,
    entitledDays: type.entitledHalves === null ? null : halves(type.entitledHalves),
    allowHalfDay: type.allowHalfDay,
    carryForwardDays: halves(type.carryForwardHalves),
    countsAsPresent: type.countsAsPresent,
    active: type.active,
    inUse: store.leaveRequests.some((request) => request.leaveTypeId === type.id),
    accrual: type.accrual,
    encashable: type.encashable,
    maxEncashDays: halves(type.maxEncashHalves),
    minRetainDays: halves(type.minRetainHalves),
    maxConsecutiveDays: type.maxConsecutiveDays,
    minNoticeDays: type.minNoticeDays,
    backdateDays: type.backdateDays,
    sandwich: type.sandwich,
    negativeDays: halves(type.negativeHalves),
    gender: type.gender,
    employmentTypes: [...type.employmentTypes],
    afterProbationOnly: type.afterProbationOnly,
    minServiceDays: type.minServiceDays,
    documentAfterDays: type.documentAfterDays,
    expiryDays: type.expiryDays,
  }));
}

export function saveLeaveType(actor: MockActor, input: LeaveTypeInput) {
  requireCapability(actor, "policy.publish");
  const store = db();
  const list = store.config.leaveTypes;
  if (!input.unlimited && input.entitledDays === "")
    throw problem(422, "ENTITLEMENT_REQUIRED", "Set the annual days, or mark the type unlimited.", { fieldErrors: { entitledDays: "Enter days, or tick Unlimited." } });
  const entitledHalves = input.unlimited ? null : Math.round(Number(input.entitledDays) * 2);
  const carryForwardHalves = Math.round(Number(input.carryForwardDays || "0") * 2);
  if (entitledHalves !== null && carryForwardHalves > entitledHalves)
    throw problem(422, "CARRY_FORWARD_TOO_HIGH", "Carry-forward can’t exceed the annual entitlement.", { fieldErrors: { carryForwardDays: "At most the annual entitlement." } });
  const duplicate = list.find((type) => type.code === input.code && type.id !== input.id);
  if (duplicate) throw problem(409, "CODE_EXISTS", `${duplicate.name} already uses ${input.code}.`, { fieldErrors: { code: "Code already in use." } });
  const toHalves = (value: string) => Math.round(Number(value || "0") * 2);
  const maxEncashHalves = input.encashable ? toHalves(input.maxEncashDays) : 0;
  const minRetainHalves = input.encashable ? toHalves(input.minRetainDays) : 0;
  if (entitledHalves !== null && maxEncashHalves > entitledHalves + carryForwardHalves)
    throw problem(422, "ENCASH_TOO_HIGH", "Encashment can’t exceed the yearly entitlement plus carry-forward.", { fieldErrors: { maxEncashDays: "Too many days." } });
  const maxConsecutiveDays = input.maxConsecutiveDays === "" ? null : input.maxConsecutiveDays;
  if (maxConsecutiveDays === 0) throw problem(422, "INVALID_MAX", "Leave empty for no limit, or at least 1 day.", { fieldErrors: { maxConsecutiveDays: "At least 1, or empty." } });
  const values = {
    code: input.code,
    name: input.name,
    description: input.description,
    entitledHalves,
    carryForwardHalves,
    allowHalfDay: input.allowHalfDay,
    countsAsPresent: input.countsAsPresent,
    active: input.active,
    accrual: input.accrual,
    encashable: input.encashable,
    maxEncashHalves,
    minRetainHalves,
    maxConsecutiveDays,
    minNoticeDays: input.minNoticeDays,
    backdateDays: input.backdateDays,
    sandwich: input.sandwich,
    negativeHalves: toHalves(input.negativeDays),
    gender: input.gender,
    employmentTypes: [...new Set(input.employmentTypes)],
    afterProbationOnly: input.afterProbationOnly,
    minServiceDays: input.minServiceDays,
    documentAfterDays: input.documentAfterDays === "" ? null : input.documentAfterDays,
    expiryDays: input.expiryDays === "" ? null : input.expiryDays,
  };
  store.config.policyRevision += 1;
  if (input.id) {
    const current = list.find((type) => type.id === input.id);
    if (!current) throw problem(404, "NOT_FOUND", "That leave type no longer exists.");
    Object.assign(current, values);
    return { id: current.id, version: policyVersion() };
  }
  const id = `lt_${slug(input.code)}`;
  if (list.some((type) => type.id === id)) throw problem(409, "CODE_EXISTS", "That code was used before.", { fieldErrors: { code: "Code already in use." } });
  list.push({ id, requiresAttachment: false, ...values });
  return { id, version: policyVersion() };
}

/* Attendance rules --------------------------------------------------------- */

export function getAttendanceRules(actor: MockActor): AttendanceRules {
  requireCapability(actor, "policy.publish");
  const store = db();
  const { shifts, defaultShiftId, departmentShifts, overtime, lateEarly, sites } = store.config;
  return {
    shifts: shifts.map((item) => ({ ...item })),
    defaultShiftId,
    departmentShifts: departmentNames().map((department) => ({ department, shiftId: departmentShifts[department] ?? defaultShiftId })),
    overtime: { ...overtime },
    lateEarly: { ...lateEarly },
    sites: sites.map((site) => ({ ...site })),
  };
}

export function saveShift(actor: MockActor, input: ShiftInput) {
  requireCapability(actor, "policy.publish");
  const store = db();
  const list = store.config.shifts;
  if (list.some((item) => item.id !== input.id && item.start === input.start && item.end === input.end))
    throw problem(409, "SHIFT_EXISTS", "A shift with the same timing exists.", { fieldErrors: { start: "Same timing as another shift." } });
  const { id: _id, ...values } = input;
  if (input.id) {
    const current = list.find((item) => item.id === input.id);
    if (!current) throw problem(404, "NOT_FOUND", "That shift no longer exists.");
    Object.assign(current, values);
    return { id: current.id };
  }
  if (list.length >= 12) throw problem(409, "TOO_MANY_SHIFTS", "Keep to 12 shifts or fewer.");
  const id = uniqueId("sh", list.map((item) => item.id));
  list.push({ id, ...values });
  return { id };
}

export function deleteShift(actor: MockActor, id: string) {
  requireCapability(actor, "policy.publish");
  const store = db();
  if (!store.config.shifts.some((item) => item.id === id)) throw problem(404, "NOT_FOUND", "That shift no longer exists.");
  if (store.config.defaultShiftId === id) throw problem(409, "DEFAULT_SHIFT", "Choose another default shift first.");
  const used = Object.entries(store.config.departmentShifts).filter(([, shiftId]) => shiftId === id).map(([department]) => department);
  if (used.length) throw problem(409, "SHIFT_IN_USE", `Assigned to ${used.join(", ")}. Move those departments first.`);
  store.config.shifts = store.config.shifts.filter((item) => item.id !== id);
  return { ok: true };
}

export function setDefaultShift(actor: MockActor, id: string) {
  requireCapability(actor, "policy.publish");
  const store = db();
  if (!store.config.shifts.some((item) => item.id === id)) throw problem(404, "NOT_FOUND", "That shift no longer exists.");
  store.config.defaultShiftId = id;
  return { ok: true };
}

export function assignDepartmentShift(actor: MockActor, department: string, shiftId: string) {
  requireCapability(actor, "policy.publish");
  const store = db();
  if (!departmentNames().includes(department)) throw problem(404, "NOT_FOUND", "That department no longer exists.");
  if (!store.config.shifts.some((item) => item.id === shiftId)) throw problem(422, "UNKNOWN_SHIFT", "Choose a configured shift.");
  if (shiftId === store.config.defaultShiftId) delete store.config.departmentShifts[department];
  else store.config.departmentShifts[department] = shiftId;
  return { ok: true };
}

export function saveOvertime(actor: MockActor, input: OvertimeInput) {
  requireCapability(actor, "policy.publish");
  db().config.overtime = { ...input };
  return { ok: true };
}

export function saveLateEarly(actor: MockActor, input: LateEarlyInput) {
  requireCapability(actor, "policy.publish");
  db().config.lateEarly = { ...input };
  return { ok: true };
}

export function saveSite(actor: MockActor, input: OfficeSiteInput) {
  requireCapability(actor, "policy.publish");
  const store = db();
  const list = store.config.sites;
  if (list.some((site) => site.name.toLowerCase() === input.name.toLowerCase() && site.id !== input.id))
    throw problem(409, "SITE_EXISTS", "A site with that name exists.", { fieldErrors: { name: "Name already in use." } });
  const values = { name: input.name, latitude: input.latitude, longitude: input.longitude, radiusMeters: input.radiusMeters };
  if (input.id) {
    const current = list.find((site) => site.id === input.id);
    if (!current) throw problem(404, "NOT_FOUND", "That site no longer exists.");
    Object.assign(current, values);
    return { id: current.id };
  }
  const id = uniqueId("site", list.map((site) => site.id));
  list.push({ id, ...values });
  return { id };
}

/** Demo lookup uses configured fixture sites. Live geocoding belongs to the API. */
export async function findAddress(actor: MockActor, query: string) {
  requireCapability(actor, "policy.publish");
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 3) return [];
  return sites().filter((site) => site.name.toLocaleLowerCase().includes(needle)).map((site) => ({ label: site.name, latitude: site.latitude, longitude: site.longitude }));
}

export function deleteSite(actor: MockActor, id: string) {
  requireCapability(actor, "policy.publish");
  const store = db();
  if (!store.config.sites.some((site) => site.id === id)) throw problem(404, "NOT_FOUND", "That site no longer exists.");
  store.config.sites = store.config.sites.filter((site) => site.id !== id);
  return { ok: true };
}

/* Organization ------------------------------------------------------------- */

export function getOrganizationConfig(actor: MockActor): OrganizationConfig {
  requireCapability(actor, "policy.publish");
  const store = db();
  const active = store.employees.filter((employee) => employee.status !== "exited");
  return {
    departments: store.config.departments.map((department) => ({
      name: department.name,
      costCenter: department.costCenter,
      head: refById(department.headId),
      headcount: active.filter((employee) => employee.department === department.name).length,
    })),
    locations: store.config.locations.map((name) => ({ name, headcount: active.filter((employee) => employee.location === name).length })),
    probationDefaults: { ...store.config.probationDefaults },
  };
}

export function saveDepartment(actor: MockActor, input: DepartmentInput) {
  requireCapability(actor, "policy.publish");
  const store = db();
  const list = store.config.departments;
  if (list.some((item) => item.name.toLowerCase() === input.name.toLowerCase() && item.name !== input.originalName))
    throw problem(409, "DEPARTMENT_EXISTS", "That department already exists.", { fieldErrors: { name: "Name already in use." } });
  const head = input.headId ? employeeById(input.headId) : null;
  if (input.headId && (!head || head.status === "exited")) throw problem(422, "INVALID_HEAD", "Choose an active employee.", { fieldErrors: { headId: "Choose an active employee." } });
  if (input.originalName) {
    const current = list.find((item) => item.name === input.originalName);
    if (!current) throw problem(404, "NOT_FOUND", "That department no longer exists.");
    // Renames move people with the department (one source of truth).
    if (current.name !== input.name)
      for (const employee of store.employees) if (employee.department === current.name) employee.department = input.name;
    Object.assign(current, { name: input.name, costCenter: input.costCenter, headId: head?.id ?? null });
    return { name: current.name };
  }
  list.push({ name: input.name, costCenter: input.costCenter, headId: head?.id ?? null });
  return { name: input.name };
}

export function deleteDepartment(actor: MockActor, name: string) {
  requireCapability(actor, "policy.publish");
  const store = db();
  if (!store.config.departments.some((item) => item.name === name)) throw problem(404, "NOT_FOUND", "That department no longer exists.");
  const members = store.employees.filter((employee) => employee.department === name && employee.status !== "exited").length;
  if (members) throw problem(409, "DEPARTMENT_IN_USE", `Move the ${members} employee${members === 1 ? "" : "s"} in ${name} first.`);
  store.config.departments = store.config.departments.filter((item) => item.name !== name);
  return { ok: true };
}

export function addLocation(actor: MockActor, name: string) {
  requireCapability(actor, "policy.publish");
  const store = db();
  if (store.config.locations.some((item) => item.toLowerCase() === name.toLowerCase()))
    throw problem(409, "LOCATION_EXISTS", "That location already exists.", { fieldErrors: { name: "Name already in use." } });
  store.config.locations.push(name);
  return { name };
}

export function deleteLocation(actor: MockActor, name: string) {
  requireCapability(actor, "policy.publish");
  const store = db();
  if (!store.config.locations.includes(name)) throw problem(404, "NOT_FOUND", "That location no longer exists.");
  const members = store.employees.filter((employee) => employee.location === name && employee.status !== "exited").length;
  if (members) throw problem(409, "LOCATION_IN_USE", `Move the ${members} employee${members === 1 ? "" : "s"} at ${name} first.`);
  store.config.locations = store.config.locations.filter((item) => item !== name);
  for (const holiday of store.config.holidays) holiday.locations = holiday.locations.filter((item) => item !== name);
  return { ok: true };
}

export function probationDefaults() {
  return { ...db().config.probationDefaults };
}

export function saveProbationDefaults(actor: MockActor, input: { full_time: number; contract: number; intern: number }) {
  requireCapability(actor, "policy.publish");
  // Applies to new joiners and anyone without an individual override.
  db().config.probationDefaults = { ...input };
  return { ok: true };
}

/* Checklists --------------------------------------------------------------- */

export function getChecklists(actor: MockActor): Checklists {
  requireCapability(actor, "onboarding.manage");
  const { onboarding, offboarding } = db().config.checklists;
  return { onboarding: onboarding.map((task) => ({ ...task })), offboarding: offboarding.map((task) => ({ ...task })) };
}

export function saveChecklistTask(actor: MockActor, input: ChecklistTaskInput) {
  requireCapability(actor, "onboarding.manage");
  const store = db();
  const list = store.config.checklists[input.list];
  const values = { title: input.title, owner: input.owner, offsetDays: input.offsetDays, blocking: input.blocking };
  if (input.id) {
    const current = list.find((task) => task.id === input.id);
    if (!current) throw problem(404, "NOT_FOUND", "That task no longer exists.");
    Object.assign(current, values);
    return { id: current.id };
  }
  if (list.length >= 20) throw problem(409, "TOO_MANY_TASKS", "Keep checklists to 20 tasks or fewer.");
  const id = uniqueId(slug(input.title), list.map((task) => task.id));
  list.push({ id, ...values });
  return { id };
}

export function deleteChecklistTask(actor: MockActor, list: "onboarding" | "offboarding", id: string) {
  requireCapability(actor, "onboarding.manage");
  const store = db();
  if (!store.config.checklists[list].some((task) => task.id === id)) throw problem(404, "NOT_FOUND", "That task no longer exists.");
  store.config.checklists[list] = store.config.checklists[list].filter((task) => task.id !== id);
  return { ok: true };
}

/** Active employees for manager/head pickers (directory-safe refs only). */
export function managerOptions() {
  return db()
    .employees.filter((employee) => employee.status !== "exited")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(ref);
}
