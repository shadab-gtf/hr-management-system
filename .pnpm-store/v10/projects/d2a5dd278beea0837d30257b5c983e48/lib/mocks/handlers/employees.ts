import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextId, nextReference, nowInstant, photoUrlFor } from "@/lib/mocks/store";
import { organization } from "@/lib/mocks/seed/organization";
import { costCenterFor, departmentNames, locationNames, managerOptions, probationDefaults } from "@/lib/mocks/handlers/config";
import { notify } from "@/lib/mocks/handlers/notifications";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { addDays } from "@/lib/utils/date";
import { initialsOf } from "@/lib/utils/format";
import {
  can,
  directReports,
  idempotent,
  ref,
  refById,
  requireCapability,
  versionCheck,
  type MockActor,
} from "@/lib/mocks/handlers/shared";
import type { EmployeeCreateInput, EmployeeExitInput, EmployeeJobInput, HrFormOptions } from "@/types/hr-config";
import type {
  EmployeeDetail,
  EmployeeFacets,
  EmployeeFilters,
  EmployeeListItem,
  EmploymentEvent,
  EmploymentStatus,
  ProfileChangeField,
} from "@/types/employee";
import type { ListResult } from "@/types/common";

function email(employee: SeedEmployee) {
  const [first = "", ...rest] = employee.name.toLowerCase().split(" ");
  return `${first}.${rest.at(-1) ?? ""}@${organization.emailDomain}`;
}

function listItem(employee: SeedEmployee, hrProjection: boolean): EmployeeListItem {
  return {
    id: employee.id,
    code: employee.code,
    name: employee.name,
    initials: initialsOf(employee.name),
    photoUrl: photoUrlFor(employee.id),
    designation: employee.designation,
    department: employee.department,
    location: employee.location,
    workEmail: email(employee),
    // Status/joining date are HR-projection fields only.
    ...(hrProjection ? { status: employee.status, joinedOn: employee.joinedOn } : {}),
  };
}

/** Opaque cursor: offset + filter fingerprint, like the live API's signed cursor. */
function encodeCursor(offset: number, fingerprint: string) {
  return Buffer.from(JSON.stringify({ o: offset, f: fingerprint })).toString("base64url");
}
function decodeCursor(cursor: string | undefined, fingerprint: string): number {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString()) as { o?: unknown; f?: unknown };
    if (value.f === fingerprint && typeof value.o === "number" && value.o >= 0) return value.o;
  } catch {
    /* fall through */
  }
  throw problem(400, "INVALID_CURSOR", "This page link is no longer valid.");
}

export function listEmployees(actor: MockActor, filters: EmployeeFilters): ListResult<EmployeeListItem> {
  requireCapability(actor, "directory.read");
  const hr = can(actor, "employee.read");
  const q = filters.q?.toLowerCase();
  const matches = db()
    .employees.filter((employee) => (hr ? true : employee.status !== "exited"))
    .filter((employee) => !filters.department || employee.department === filters.department)
    .filter((employee) => !filters.location || employee.location === filters.location)
    .filter((employee) => !hr || !filters.status || employee.status === filters.status)
    .filter((employee) => {
      if (!q) return true;
      return [employee.name, employee.designation, employee.code, employee.department]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const fingerprint = [q, filters.department, filters.location, filters.status].join("|");
  const offset = decodeCursor(filters.cursor, fingerprint);
  const page = matches.slice(offset, offset + filters.limit);
  const hasMore = offset + filters.limit < matches.length;
  return {
    items: page.map((employee) => listItem(employee, hr)),
    meta: {
      requestId: `req_${Date.now().toString(36)}`,
      nextCursor: hasMore ? encodeCursor(offset + filters.limit, fingerprint) : null,
      hasMore,
      total: matches.length,
    },
  };
}

export function employeeFacets(actor: MockActor): EmployeeFacets {
  requireCapability(actor, "directory.read");
  const statuses: EmploymentStatus[] = ["active", "onboarding", "on_leave", "notice", "exited"];
  return {
    departments: departmentNames(),
    locations: locationNames(),
    statuses: can(actor, "employee.read") ? statuses : [],
  };
}

function timeline(employee: SeedEmployee): EmploymentEvent[] {
  const events: EmploymentEvent[] = [
    {
      id: `${employee.id}_join`,
      kind: "joined",
      title: "Joined GTF Technologies",
      detail: `${employee.department} · ${employee.location}`,
      effectiveOn: employee.joinedOn,
      recordedOn: addDays(employee.joinedOn, -14),
    },
  ];
  const probation = probationOf(employee);
  if (probation.status === "confirmed" && probation.endsOn)
    events.push({
      id: `${employee.id}_confirm`,
      kind: "confirmation",
      title: "Probation confirmed",
      detail: `Completed ${probation.months}-month probation`,
      effectiveOn: probation.endsOn,
      recordedOn: probation.endsOn,
    });
  if (employee.joinedOn < "2022-01-01")
    events.push({
      id: `${employee.id}_promo`,
      kind: "promotion",
      title: `Promoted to ${employee.designation}`,
      detail: "Annual performance cycle",
      effectiveOn: "2025-04-01",
      recordedOn: "2025-04-08",
    });
  events.push(...(db().employmentEvents.get(employee.id) ?? []));
  return events.sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || b.recordedOn.localeCompare(a.recordedOn));
}

export const exitReasonLabels: Record<EmployeeExitInput["reason"], string> = {
  resignation: "Resignation",
  termination: "Termination",
  contract_end: "Contract end",
  retirement: "Retirement",
  other: "Other",
};

/** Probation from the individual override or the employment-type default. */
export function probationOf(employee: SeedEmployee): EmployeeDetail["probation"] {
  const store = db();
  const months = store.probation.get(employee.id) ?? probationDefaults()[employee.type];
  if (months <= 0) return { months: 0, endsOn: null, status: "none" };
  const [y = 0, m = 1, d = 1] = employee.joinedOn.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  const endsOn = store.probationConfirmed.get(employee.id) ?? end.toISOString().slice(0, 10);
  return { months, endsOn, status: endsOn <= store.today ? "confirmed" : "on_probation" };
}

function versionOf(id: string) {
  return db().employeeVersions.get(id) ?? 1;
}

export function employeeDetail(actor: MockActor, id: string): EmployeeDetail {
  const employee = employeeById(id);
  const isSelf = id === actor.employeeId;
  const isManager = employee?.managerId === actor.employeeId;
  const hr = can(actor, "employee.read");
  // Non-disclosing: unknown and out-of-scope records look the same.
  if (!employee || (!isSelf && employee.status === "exited" && !hr))
    throw problem(404, "NOT_FOUND", "We couldn't find that person.");
  requireCapability(actor, "directory.read");

  const canViewPrivate = isSelf || can(actor, "employee.update");
  const n = Number(employee.id.slice(-4));
  const overrides = db().profileOverrides.get(employee.id) ?? {};
  const exit = db().exits.get(employee.id);
  return {
    ...listItem(employee, true),
    status: employee.status,
    joinedOn: employee.joinedOn,
    employmentType: employee.type,
    legalEntity: organization.legalEntity,
    costCenter: costCenterFor(employee.department),
    workPhone: `+91 120 400 ${String(1000 + n).slice(-4)}`,
    manager: refById(employee.managerId),
    directReports: directReports(employee.id).map(ref),
    timeline: isSelf || isManager || hr ? timeline(employee) : timeline(employee).slice(-1),
    privateProfile: canViewPrivate
      ? {
          personalEmail: overrides.personalEmail ?? `${employee.name.split(" ")[0]?.toLowerCase()}.personal@mail.example`,
          mobile: overrides.mobile ?? `+91 90000 ${String(10000 + n * 37).slice(-5)}`,
          emergencyContact: overrides.emergencyContact ?? "Family contact · +91 90000 55555",
          address: overrides.address ?? `${100 + n}, Sample Residency, ${employee.location === "Remote" ? "Pune" : employee.location.replace(" HQ", "")}`,
          bankAccountMasked: overrides.bankAccount ?? `XXXX XXXX ${String(4000 + n * 13).slice(-4)}`,
        }
      : null,
    version: versionOf(employee.id),
    probation: probationOf(employee),
    exit: hr && exit ? { lastWorkingDay: exit.lastWorkingDay, reason: exitReasonLabels[exit.reason] } : null,
    permissions: {
      canEdit: can(actor, "employee.update") && !isSelf && employee.status !== "exited",
      canViewPrivate,
      canRequestChange: isSelf && can(actor, "profile.change.request"),
    },
  };
}

export function requestProfileChange(
  actor: MockActor,
  input: { field: ProfileChangeField; value: string; reason: string },
  key: string | undefined,
) {
  requireCapability(actor, "profile.change.request");
  return idempotent(key, () => {
    const store = db();
    const pending = store.profileRequests.find((item) => item.employeeId === actor.employeeId && item.field === input.field && item.state === "pending");
    if (pending) throw problem(409, "CHANGE_PENDING", `You already have a pending change for this field (${pending.reference}).`);
    const reference = nextReference("PC");
    store.profileRequests.push({
      id: nextId("pc"),
      reference,
      employeeId: actor.employeeId,
      field: input.field,
      // Bank numbers are stored masked in the mock; the live service vaults them.
      value: input.field === "bankAccount" ? `XXXX XXXX ${input.value.replace(/\D/g, "").slice(-4)}` : input.value,
      reason: input.reason,
      submittedAt: nowInstant(),
      state: "pending",
      decisionNote: null,
    });
    return {
      reference,
      state: "pending_verification",
      // Bank changes always go through independent verification.
      verification: input.field === "bankAccount" ? "finance" : "hr",
    };
  });
}

/* HR lifecycle commands ------------------------------------------------------ */

export function hrFormOptions(actor: MockActor): HrFormOptions {
  requireCapability(actor, "employee.read");
  return { departments: departmentNames(), locations: locationNames(), managers: managerOptions(), today: db().today, probationDefaults: probationDefaults() };
}

function validateOrg(input: { department: string; location: string }) {
  if (!departmentNames().includes(input.department))
    throw problem(422, "UNKNOWN_DEPARTMENT", "Choose a configured department.", { fieldErrors: { department: "Choose a configured department." } });
  if (!locationNames().includes(input.location))
    throw problem(422, "UNKNOWN_LOCATION", "Choose a configured location.", { fieldErrors: { location: "Choose a configured location." } });
}

function recordEvent(employeeId: string, event: Omit<EmploymentEvent, "id" | "recordedOn">) {
  const store = db();
  const list = store.employmentEvents.get(employeeId) ?? [];
  list.push({ id: nextId("ee"), recordedOn: store.today, ...event });
  store.employmentEvents.set(employeeId, list);
}

export function createEmployee(actor: MockActor, input: EmployeeCreateInput, key: string | undefined) {
  requireCapability(actor, "employee.create");
  return idempotent(key, () => {
    const store = db();
    validateOrg(input);
    const manager = employeeById(input.managerId);
    if (!manager || manager.status === "exited")
      throw problem(422, "INVALID_MANAGER", "Choose an active manager.", { fieldErrors: { managerId: "Choose an active manager." } });
    if (input.joinedOn < addDays(store.today, -30))
      throw problem(422, "BACKDATED_JOIN", "Joining dates more than 30 days back need a data correction request.", { fieldErrors: { joinedOn: "Within the last 30 days or later." } });
    const lower = input.name.toLowerCase();
    const duplicate = store.employees.find((employee) => employee.name.toLowerCase() === lower && employee.status !== "exited");
    if (duplicate)
      throw problem(409, "POSSIBLE_DUPLICATE", `${duplicate.name} (${duplicate.code}) already exists. Rehires reuse the existing person record.`, { fieldErrors: { name: "A person with this name already exists." } });
    const next = Math.max(...store.employees.map((employee) => Number(employee.id.slice(-4)))) + 1;
    const id = `emp_${String(next).padStart(4, "0")}`;
    const code = `GTF-${1000 + next}`;
    store.employees.push({
      id,
      code,
      name: input.name,
      designation: input.designation,
      department: input.department,
      location: input.location,
      managerId: manager.id,
      joinedOn: input.joinedOn,
      status: input.joinedOn > store.today ? "onboarding" : "active",
      type: input.type,
      // Payroll sets compensation separately (compensation.manage).
      annualCtc: 0,
    });
    if (input.probationMonths !== "") store.probation.set(id, input.probationMonths);
    notify(manager.id, "system", "New team member", `${input.name} joins as ${input.designation} on ${input.joinedOn}.`, `/employees/${id}`);
    return { id, code };
  });
}

export function updateEmployeeJob(actor: MockActor, input: EmployeeJobInput) {
  requireCapability(actor, "employee.update");
  const store = db();
  const employee = employeeById(input.employeeId);
  if (!employee || employee.status === "exited") throw problem(404, "NOT_FOUND", "We couldn't find that person.");
  if (employee.id === actor.employeeId) throw problem(403, "SELF_EDIT", "You can't change your own employment record.");
  versionCheck(versionOf(employee.id), input.expectedVersion);
  validateOrg(input);
  const manager = input.managerId ? employeeById(input.managerId) : undefined;
  if (input.managerId && (!manager || manager.status === "exited"))
    throw problem(422, "INVALID_MANAGER", "Choose an active manager.", { fieldErrors: { managerId: "Choose an active manager." } });
  // Cycle guard: the new manager can't report (directly or indirectly) to this person.
  for (let cursor = manager; cursor; cursor = cursor.managerId ? employeeById(cursor.managerId) : undefined)
    if (cursor.id === employee.id)
      throw problem(422, "MANAGER_CYCLE", "That would create a reporting loop.", { fieldErrors: { managerId: "This person reports to the employee." } });
  if (input.effectiveOn < employee.joinedOn)
    throw problem(422, "BEFORE_JOINING", "The change can't be effective before joining.", { fieldErrors: { effectiveOn: "On or after the joining date." } });

  const changes: string[] = [];
  let kind: EmploymentEvent["kind"] = "job_change";
  if (employee.designation !== input.designation) {
    changes.push(`${employee.designation} → ${input.designation}`);
    kind = "promotion";
  }
  if (employee.department !== input.department || employee.location !== input.location) {
    changes.push(`${employee.department} · ${employee.location} → ${input.department} · ${input.location}`);
    if (kind === "job_change") kind = "transfer";
  }
  if ((employee.managerId ?? "") !== (manager?.id ?? "")) {
    changes.push(`Manager → ${manager?.name ?? "None"}`);
    if (kind === "job_change") kind = "manager_change";
  }
  if (employee.type !== input.type) changes.push(`Type → ${input.type.replace("_", "-")}`);
  const previousProbation = probationOf(employee).months;
  if (previousProbation !== input.probationMonths) changes.push(`Probation ${previousProbation} → ${input.probationMonths} months`);
  if (!changes.length) throw problem(422, "NO_CHANGES", "Nothing changed — edit a field first.");

  Object.assign(employee, { designation: input.designation, department: input.department, location: input.location, managerId: manager?.id ?? null, type: input.type });
  if (previousProbation !== input.probationMonths) store.probation.set(employee.id, input.probationMonths);
  store.employeeVersions.set(employee.id, versionOf(employee.id) + 1);
  const titles: Record<string, string> = { promotion: `Now ${input.designation}`, transfer: "Transferred", manager_change: "Reporting manager changed", job_change: "Employment updated" };
  recordEvent(employee.id, { kind, title: titles[kind] ?? "Employment updated", detail: `${changes.join(" · ")} — ${input.reason}`, effectiveOn: input.effectiveOn });
  notify(employee.id, "system", "Your employment details changed", changes.join(" · "), "/me/profile?tab=employment");
  return { id: employee.id, version: versionOf(employee.id) };
}

export function startExit(actor: MockActor, input: EmployeeExitInput) {
  requireCapability(actor, "employee.update");
  const store = db();
  const employee = employeeById(input.employeeId);
  if (!employee || employee.status === "exited") throw problem(404, "NOT_FOUND", "We couldn't find that person.");
  if (employee.id === actor.employeeId) throw problem(403, "SELF_EDIT", "You can't start your own exit here.");
  if (store.exits.has(employee.id)) throw problem(409, "EXIT_EXISTS", "An exit is already in progress. Manage it in Offboarding.");
  if (input.lastWorkingDay < store.today)
    throw problem(422, "PAST_DATE", "The last working day can't be in the past.", { fieldErrors: { lastWorkingDay: "Today or later." } });
  if (directReports(employee.id).length)
    throw problem(409, "HAS_REPORTS", "Reassign this person's direct reports first (Edit job details on each).");
  openExitCase(employee, input);
  return { id: employee.id };
}

/**
 * Opens the offboarding case (checklist, notice status, timeline event).
 * Shared by HR-started exits and accepted resignations; callers check access.
 */
export function openExitCase(employee: SeedEmployee, input: Pick<EmployeeExitInput, "lastWorkingDay" | "reason" | "note">) {
  const store = db();
  if (store.exits.has(employee.id)) throw problem(409, "EXIT_EXISTS", "An exit is already in progress. Manage it in Offboarding.");
  store.exits.set(employee.id, { employeeId: employee.id, lastWorkingDay: input.lastWorkingDay, reason: input.reason, note: input.note, startedAt: nowInstant(), tasks: {} });
  employee.status = "notice";
  store.employeeVersions.set(employee.id, versionOf(employee.id) + 1);
  recordEvent(employee.id, { kind: "exit", title: "Exit started", detail: `${exitReasonLabels[input.reason]} · last working day ${input.lastWorkingDay}`, effectiveOn: store.today });
}

/** Records an employment timeline event from another lifecycle module. */
export function recordEmploymentEvent(employeeId: string, event: Omit<EmploymentEvent, "id" | "recordedOn">) {
  recordEvent(employeeId, event);
}

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function setProfilePhoto(actor: MockActor, file: { data: Uint8Array; mime: string } | null) {
  requireCapability(actor, "profile.read.self");
  const store = db();
  if (!file) {
    store.photos.delete(actor.employeeId);
    return { photoUrl: null };
  }
  if (!PHOTO_TYPES.includes(file.mime))
    throw problem(415, "UNSUPPORTED_MEDIA_TYPE", "Use a JPEG, PNG or WebP image.", { fieldErrors: { photo: "Use a JPEG, PNG or WebP image." } });
  if (file.data.byteLength > MAX_PHOTO_BYTES)
    throw problem(413, "FILE_TOO_LARGE", "Photos must be 2 MB or smaller.", { fieldErrors: { photo: "Choose an image up to 2 MB." } });
  const version = (store.photos.get(actor.employeeId)?.version ?? 0) + 1;
  store.photos.set(actor.employeeId, { data: file.data, mime: file.mime, version });
  return { photoUrl: photoUrlFor(actor.employeeId) };
}

/** Any signed-in member may see work photos (directory-level data). */
export function getProfilePhoto(actor: MockActor, employeeId: string) {
  requireCapability(actor, "directory.read");
  const photo = db().photos.get(employeeId);
  if (!photo) throw problem(404, "NOT_FOUND", "No photo.");
  return photo;
}
