import "server-only";
import { problem } from "@/lib/api/core/problem";
import { capabilitiesFor, roleCapabilities } from "@/lib/mocks/capabilities";
import { personas } from "@/lib/mocks/seed/people";
import { db, nowInstant } from "@/lib/mocks/store";
import { privilegedRoles, scopableRoles } from "@/types/identity";
import type { Capability, Role } from "@/types/session";

/*
 * Demo-mode role grants (docs/decisions BE-003 in the backend). Same rules as
 * gtfhrbackend/src/core/security/{actor,scope}.ts and modules/identity/access.rules.ts,
 * so the demo never shows access the live API would refuse. Grants are re-read on
 * every request, like the live API: a grant or revoke applies to the next page load.
 */

export type CapabilityScope = "all" | readonly string[];

export interface MockRoleGrant {
  role: Role;
  /** Empty = organization-wide. */
  departmentIds: string[];
  grantedAt: string;
  expiresAt: string | null;
  grantedBy: string | null;
  reason: string | null;
}

export interface MockAuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown>;
}

export interface AccessSubject {
  employeeId: string;
  roles: Role[];
  capabilities: Capability[];
  grants: { role: Role; departmentIds: readonly string[] }[];
}

export interface Grantable {
  role: Role;
  scope: "all" | string[];
}

interface AccessState {
  grants: Map<string, MockRoleGrant[]>;
  disabled: Set<string>;
  audit: MockAuditEntry[];
  sequence: number;
}

const isScopable = (role: Role) =>
  (scopableRoles as readonly Role[]).includes(role);
export const isPrivilegedRole = (role: Role) =>
  (privilegedRoles as readonly Role[]).includes(role);
const allRoles: Role[] = [
  "employee",
  "manager",
  "hr_operator",
  "payroll_operator",
  "payroll_approver",
  "super_admin",
];

/** Same id the backend seed derives from a department name (`dep_people_and_culture`). */
export function departmentIdOf(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `dep_${slug}`;
}

export function mockDepartments(): { id: string; name: string }[] {
  return db()
    .config.departments.map((department) => ({
      id: departmentIdOf(department.name),
      name: department.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* State: one per mock database, so a rebuilt demo store starts from the seed again. */
const holder = globalThis as unknown as {
  __gtfMockAccess?: WeakMap<object, AccessState>;
};

function seedState(): AccessState {
  const store = db();
  const at = nowInstant();
  const grant = (
    role: Role,
    reason: string,
    departmentIds: string[] = [],
  ): MockRoleGrant => ({
    role,
    departmentIds,
    grantedAt: at,
    expiresAt: null,
    grantedBy: null,
    reason,
  });
  const managers = new Set(
    store.employees.flatMap((employee) =>
      employee.managerId ? [employee.managerId] : [],
    ),
  );
  const personaRoles = new Map(
    Object.values(personas).map((persona) => [
      persona.employeeId,
      persona.roles,
    ]),
  );
  const grants = new Map<string, MockRoleGrant[]>();
  for (const employee of store.employees) {
    const roles =
      personaRoles.get(employee.id) ??
      (managers.has(employee.id) ? ["employee", "manager"] : ["employee"]);
    grants.set(
      employee.id,
      roles.map((role) => grant(role, "Development seed")),
    );
  }
  // Same demo access model as the backend seed: the CEO is the super admin; the Engineering manager is an HR
  // operator limited to Engineering.
  const add = (employeeId: string, value: MockRoleGrant) => {
    const list = grants.get(employeeId) ?? [];
    if (!list.some((item) => item.role === value.role))
      grants.set(employeeId, [...list, value]);
  };
  add("emp_0001", grant("super_admin", "Development seed: super admin"));
  add(
    "emp_0013",
    grant("hr_operator", "Development seed: Engineering HR", [
      departmentIdOf("Engineering"),
    ]),
  );
  return { grants, disabled: new Set(), audit: [], sequence: 0 };
}

function state(): AccessState {
  holder.__gtfMockAccess ??= new WeakMap();
  const store = db();
  let current = holder.__gtfMockAccess.get(store);
  if (!current) {
    current = seedState();
    holder.__gtfMockAccess.set(store, current);
  }
  return current;
}

const active = (grant: MockRoleGrant) =>
  !grant.expiresAt || grant.expiresAt > nowInstant();

/** Unexpired grants of one person. */
export function grantsOf(employeeId: string): MockRoleGrant[] {
  return (state().grants.get(employeeId) ?? []).filter(active);
}

export function isAccountDisabled(employeeId: string): boolean {
  return state().disabled.has(employeeId);
}

/** The live roles/capabilities of a person, as the API's `loadActor` builds them. */
export function accessSubject(employeeId: string): AccessSubject {
  const grants = grantsOf(employeeId).map(({ role, departmentIds }) => ({
    role,
    departmentIds,
  }));
  const roles = grants.map(({ role }) => role);
  return { employeeId, roles, capabilities: capabilitiesFor(roles), grants };
}

/* Rules ----------------------------------------------------------------------------- */

/** Administrative reach of a capability: "all", department ids, or [] (self/team only, or not held). */
export function scopeOf(
  subject: AccessSubject,
  capability: Capability,
): CapabilityScope {
  if (!subject.capabilities.includes(capability)) return [];
  let departments: string[] = [];
  for (const grant of subject.grants) {
    if (grant.role === "employee" || grant.role === "manager") continue;
    if (!roleCapabilities[grant.role].includes(capability)) continue;
    if (grant.departmentIds.length === 0 || !isScopable(grant.role))
      return "all";
    departments = [...new Set([...departments, ...grant.departmentIds])];
  }
  return departments;
}

export function isOrgWide(
  subject: AccessSubject,
  capability: Capability,
): boolean {
  return scopeOf(subject, capability) === "all";
}

export function departmentInScope(
  subject: AccessSubject,
  capability: Capability,
  departmentId: string,
): boolean {
  const scope = scopeOf(subject, capability);
  return scope === "all" || scope.includes(departmentId);
}

const isSuperAdmin = (subject: AccessSubject) =>
  subject.grants.some((grant) => grant.role === "super_admin");

/** Roles the subject may grant or revoke, with the widest scope allowed for each. */
export function grantableRoles(subject: AccessSubject): Grantable[] {
  if (!subject.capabilities.includes("access.manage")) return [];
  if (isSuperAdmin(subject))
    return allRoles.map((role) => ({ role, scope: "all" }));
  return subject.grants
    .filter((grant) => grant.role !== "super_admin")
    .map((grant) => ({
      role: grant.role,
      scope:
        isScopable(grant.role) && grant.departmentIds.length > 0
          ? [...grant.departmentIds]
          : ("all" as const),
    }));
}

export interface AccessChange {
  op: "grant" | "revoke";
  role: Role;
  departmentIds: readonly string[];
  target: { employeeId: string; departmentId: string };
}

/** Throws the same problem the live API answers when a role change is not allowed. */
export function assertAccessChangeAllowed(
  subject: AccessSubject,
  change: AccessChange,
): void {
  if (!subject.capabilities.includes("access.manage"))
    throw problem(403, "FORBIDDEN", "You don't have access to this.");
  if (!departmentInScope(subject, "access.manage", change.target.departmentId))
    throw problem(
      403,
      "OUT_OF_SCOPE",
      "This employee is outside the departments you manage.",
    );
  if (subject.employeeId === change.target.employeeId)
    throw problem(
      403,
      "SELF_ACCESS_CHANGE",
      "Another administrator must change your access.",
    );
  const scoped = change.departmentIds.length > 0;
  if (change.op === "grant" && scoped && !isScopable(change.role))
    throw problem(
      400,
      "ROLE_NOT_SCOPABLE",
      "Only HR and payroll roles can be limited to departments.",
      {
        fieldErrors: {
          departmentIds:
            "This role always applies organization-wide (or to the person's own team).",
        },
      },
    );
  const allowed = grantableRoles(subject).find(
    (grantable) => grantable.role === change.role,
  );
  if (!allowed)
    throw problem(
      403,
      "ROLE_NOT_GRANTABLE",
      change.role === "super_admin"
        ? "Only a super admin can change super admin access."
        : "You can only grant or revoke roles you hold yourself.",
    );
  if (allowed.scope === "all") return;
  if (!scoped)
    throw problem(
      403,
      "SCOPE_TOO_WIDE",
      "Your access is limited to departments, so choose departments for this role.",
    );
  if (change.departmentIds.some((id) => !allowed.scope.includes(id)))
    throw problem(
      403,
      "SCOPE_TOO_WIDE",
      "You can only grant access within your own departments.",
    );
}

/** Active (enabled, non-exited, unexpired) holders of a role, other than `excluding`. */
export function activeHolders(role: Role, excluding: string): number {
  const store = db();
  return store.employees.filter(
    (employee) =>
      employee.id !== excluding &&
      employee.status !== "exited" &&
      !isAccountDisabled(employee.id) &&
      grantsOf(employee.id).some((grant) => grant.role === role),
  ).length;
}

/* Mutations ------------------------------------------------------------------------- */

export function writeGrant(employeeId: string, value: MockRoleGrant): void {
  const current = state().grants.get(employeeId) ?? [];
  state().grants.set(employeeId, [
    ...current.filter((grant) => grant.role !== value.role),
    value,
  ]);
}

export function removeGrant(employeeId: string, role: Role): void {
  const current = state().grants.get(employeeId) ?? [];
  state().grants.set(
    employeeId,
    current.filter((grant) => grant.role !== role),
  );
}

export function writeDisabled(employeeId: string, disabled: boolean): void {
  if (disabled) state().disabled.add(employeeId);
  else state().disabled.delete(employeeId);
}

export function recordAudit(entry: Omit<MockAuditEntry, "id" | "at">): void {
  const current = state();
  current.sequence += 1;
  current.audit.unshift({
    ...entry,
    id: String(current.sequence),
    at: nowInstant(),
  });
}

export function auditEntries(): readonly MockAuditEntry[] {
  return state().audit;
}
