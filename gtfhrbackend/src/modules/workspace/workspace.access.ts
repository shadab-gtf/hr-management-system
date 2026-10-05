/**
 * Department-wise reach for workspace content (BE-003). Announcements and events target either "Everyone" or one
 * department by name: a department-scoped operator manages only content addressed to departments in their scope, and
 * addressing the whole organization needs an organization-wide grant.
 */
import { AuthorizationError, NotFoundError } from "../../core/errors/index.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import type { Capability } from "../../core/security/capabilities.js";
import { departmentInScope, isOrgWide, requireOrgWide } from "../../core/security/scope.js";

export const EVERYONE = "Everyone";

interface DepartmentLookup {
  department(name: string): Promise<{ id: string } | null>;
}

/** True when the actor may manage content addressed to `audience` with `capability`. */
export async function managesAudience(
  departments: DepartmentLookup,
  actor: AuthenticatedActor,
  capability: Capability,
  audience: string,
): Promise<boolean> {
  if (isOrgWide(actor, capability)) return true;
  if (audience === EVERYONE) return false;
  const department = await departments.department(audience);
  return Boolean(department && departmentInScope(actor, capability, department.id));
}

/** New or changed audience: 403 `ORG_WIDE_ACCESS_REQUIRED` when it reaches beyond the actor's departments. */
export async function requireAudience(
  departments: DepartmentLookup,
  actor: AuthenticatedActor,
  capability: Capability,
  audience: string,
): Promise<void> {
  if (audience === EVERYONE) {
    requireOrgWide(actor, capability);
    return;
  }
  if (!(await managesAudience(departments, actor, capability, audience)))
    throw new AuthorizationError(
      "Publishing to this department needs organization-wide access.",
      "ORG_WIDE_ACCESS_REQUIRED",
    );
}

/** Existing content outside the actor's departments answers 404, like any out-of-scope record. */
export async function requireManagedRecord(
  departments: DepartmentLookup,
  actor: AuthenticatedActor,
  capability: Capability,
  audience: string,
): Promise<void> {
  if (!(await managesAudience(departments, actor, capability, audience))) throw new NotFoundError();
}
