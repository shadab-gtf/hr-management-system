/**
 * Department-wise permissions (docs/decisions BE-003). A capability held through a department-scoped grant applies
 * only to employees of those departments. Use these helpers whenever an HR / payroll / finance capability is used to
 * read or change ANOTHER employee's data; self-service and manager-of-team checks are separate and unchanged.
 */
import type { Prisma } from "@prisma/client";
import { AuthorizationError } from "../errors/AuthorizationError.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import type { TransactionClient } from "../database/transaction.js";
import type { AuthenticatedActor, CapabilityScope } from "./actor.js";
import type { Capability } from "./capabilities.js";

const NONE: readonly string[] = [];

/**
 * Administrative reach of a capability: `"all"`, the department ids it covers, or `[]` when the actor holds it only
 * through the employee (self) or manager (own team) role, or not at all.
 */
export function scopeOf(actor: AuthenticatedActor, capability: Capability): CapabilityScope {
  if (!actor.capabilities.includes(capability)) return NONE;
  // Internal service actors are built without scopes and act organization-wide.
  if (!actor.scopes) return "all";
  return actor.scopes[capability] ?? NONE;
}

/** True when the actor holds the capability through an HR / payroll / super admin grant (any scope). */
export function hasAdministrativeReach(actor: AuthenticatedActor, capability: Capability): boolean {
  const scope = scopeOf(actor, capability);
  return scope === "all" || scope.length > 0;
}

export function isOrgWide(actor: AuthenticatedActor, capability: Capability): boolean {
  return scopeOf(actor, capability) === "all";
}

export function departmentInScope(actor: AuthenticatedActor, capability: Capability, departmentId: string): boolean {
  const scope = scopeOf(actor, capability);
  return scope === "all" || scope.includes(departmentId);
}

/** Prisma filter on `Employee` limited to the capability's scope (matches nothing without the capability). */
export function employeeScopeWhere(actor: AuthenticatedActor, capability: Capability): Prisma.EmployeeWhereInput {
  const scope = scopeOf(actor, capability);
  if (scope === "all") return {};
  return { departmentId: { in: [...scope] } };
}

/** Filter for rows that reference an employee through a relation named `employee` (e.g. `{ employee: ... }`). */
export function employeeRelationScopeWhere(
  actor: AuthenticatedActor,
  capability: Capability,
): { employee?: Prisma.EmployeeWhereInput } {
  const scope = scopeOf(actor, capability);
  return scope === "all" ? {} : { employee: { departmentId: { in: [...scope] } } };
}

/** Employee ids (from a candidate list) the actor may act on with this capability. */
export async function employeeIdsInScope(
  db: TransactionClient,
  actor: AuthenticatedActor,
  capability: Capability,
  employeeIds: readonly string[],
): Promise<Set<string>> {
  const scope = scopeOf(actor, capability);
  if (scope === "all") return new Set(employeeIds);
  if (scope.length === 0 || employeeIds.length === 0) return new Set();
  const rows = await db.employee.findMany({
    where: { id: { in: [...employeeIds] }, departmentId: { in: [...scope] } },
    select: { id: true },
  });
  return new Set(rows.map(({ id }) => id));
}

/**
 * Throws unless the employee is inside the capability's scope. Out-of-scope records answer 404 (not 403) so a
 * scoped operator cannot probe which employee ids exist in other departments.
 */
export async function assertEmployeeInScope(
  db: TransactionClient,
  actor: AuthenticatedActor,
  capability: Capability,
  employeeId: string,
): Promise<void> {
  if (!actor.capabilities.includes(capability)) throw new AuthorizationError("You don't have access to this.");
  const scope = scopeOf(actor, capability);
  if (scope === "all") return;
  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { departmentId: true } });
  if (!employee || !scope.includes(employee.departmentId)) throw new NotFoundError();
}

/**
 * Organization-level actions (policies, payroll runs, statutory filings, settings) need an organization-wide grant;
 * a department-scoped operator cannot change what affects other departments.
 */
export function requireOrgWide(actor: AuthenticatedActor, capability: Capability): void {
  if (!actor.capabilities.includes(capability)) throw new AuthorizationError("You don't have access to this.");
  if (!isOrgWide(actor, capability))
    throw new AuthorizationError("This action needs organization-wide access.", "ORG_WIDE_ACCESS_REQUIRED");
}
