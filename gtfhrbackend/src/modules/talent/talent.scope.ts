/**
 * Department-wise permissions (docs/decisions BE-003) for the talent modules (lifecycle, recruitment, performance).
 * Thin helpers over `core/security/scope.ts` for the shapes these modules work with: in-memory employee lists,
 * records keyed by department name (jobs, requisitions, offers) and endpoints reachable through more than one
 * administrative capability (settlements: prepare or approve).
 */
import { AuthorizationError } from "../../core/errors/AuthorizationError.js";
import { NotFoundError } from "../../core/errors/NotFoundError.js";
import type { TransactionClient } from "../../core/database/transaction.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import type { Capability } from "../../core/security/capabilities.js";
import { departmentInScope, isOrgWide } from "../../core/security/scope.js";

/** True when the employee (by department) is inside the actor's administrative reach for any of the capabilities. */
export function personInScope(
  actor: AuthenticatedActor,
  capabilities: Capability | readonly Capability[],
  employee: { departmentId: string } | undefined,
): boolean {
  if (!employee) return false;
  const list = typeof capabilities === "string" ? [capabilities] : capabilities;
  return list.some((capability) => departmentInScope(actor, capability, employee.departmentId));
}

/** Predicate over employee ids, built from an already loaded employee list. */
export function personIdScope(
  actor: AuthenticatedActor,
  capabilities: Capability | readonly Capability[],
  people: readonly { id: string; departmentId: string }[],
): (employeeId: string) => boolean {
  const byId = new Map(people.map((person) => [person.id, person]));
  return (employeeId) => personInScope(actor, capabilities, byId.get(employeeId));
}

/**
 * Predicate over department NAMES (jobs, requisitions and offers store the department name). Org-wide grants cover
 * every name; a scoped grant covers only names of active departments in its list.
 */
export function departmentNameScope(
  actor: AuthenticatedActor,
  capability: Capability,
  departments: readonly { id: string; name: string }[],
): (departmentName: string) => boolean {
  const ids = new Map(departments.map((department) => [department.name, department.id]));
  return (departmentName) => {
    if (isOrgWide(actor, capability)) return true;
    const id = ids.get(departmentName);
    return !!id && departmentInScope(actor, capability, id);
  };
}

/** Out-of-scope department records answer 404 so other departments' records cannot be probed. */
export function assertDepartmentRecordInScope(inScope: boolean): void {
  if (!inScope) throw new NotFoundError("This record was not found.", "RECORD_NOT_FOUND");
}

/** Creating or moving something INTO a department the actor does not administer is forbidden. */
export function assertDepartmentTargetInScope(inScope: boolean): void {
  if (!inScope) throw new AuthorizationError("You don't have access to this department.", "DEPARTMENT_OUT_OF_SCOPE");
}

/**
 * Like `assertEmployeeInScope`, for endpoints that accept any of several capabilities (e.g. settlement prepare or
 * approve): 403 without any of them, 404 when the employee is outside every held capability's scope.
 */
export async function assertEmployeeInAnyScope(
  db: TransactionClient,
  actor: AuthenticatedActor,
  capabilities: readonly Capability[],
  employeeId: string,
): Promise<void> {
  const held = capabilities.filter((capability) => actor.capabilities.includes(capability));
  if (!held.length) throw new AuthorizationError("You don't have access to this.");
  if (held.some((capability) => isOrgWide(actor, capability))) return;
  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { departmentId: true } });
  if (!employee || !personInScope(actor, held, employee)) throw new NotFoundError();
}

/** `requireOrgWide` for endpoints that accept any of several capabilities. */
export function requireOrgWideAny(actor: AuthenticatedActor, capabilities: readonly Capability[]): void {
  const held = capabilities.filter((capability) => actor.capabilities.includes(capability));
  if (!held.length) throw new AuthorizationError("You don't have access to this.");
  if (!held.some((capability) => isOrgWide(actor, capability)))
    throw new AuthorizationError("This action needs organization-wide access.", "ORG_WIDE_ACCESS_REQUIRED");
}
