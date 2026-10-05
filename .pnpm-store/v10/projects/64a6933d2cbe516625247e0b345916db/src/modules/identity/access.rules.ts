/**
 * Who may grant or revoke which role, and where (docs/decisions BE-003). Pure functions: no I/O, unit-tested in
 * tests/unit/identity/access-rules.test.ts.
 */
import { AuthorizationError } from "../../core/errors/AuthorizationError.js";
import { ValidationError } from "../../core/errors/ValidationError.js";
import {
  PRIVILEGED_ROLES,
  SCOPABLE_ROLES,
  type AuthenticatedActor,
  type CapabilityScope,
} from "../../core/security/actor.js";
import { scopeOf } from "../../core/security/scope.js";
import type { ApiRole } from "../../utils/constants.js";

export interface Grantable {
  role: ApiRole;
  /** "all" = may grant organization-wide (or any departments); otherwise only within these departments. */
  scope: "all" | string[];
}

const isSuperAdmin = (actor: AuthenticatedActor) => (actor.grants ?? []).some((grant) => grant.role === "super_admin");

/** Roles the actor may grant or revoke, with the widest scope allowed for each. Nothing without `access.manage`. */
export function grantableRoles(actor: AuthenticatedActor): Grantable[] {
  if (!actor.capabilities.includes("access.manage")) return [];
  if (isSuperAdmin(actor)) {
    const all: ApiRole[] = [
      "employee",
      "manager",
      "hr_operator",
      "payroll_operator",
      "payroll_approver",
      "super_admin",
    ];
    return all.map((role) => ({ role, scope: "all" }));
  }
  // Everyone else may only hand out roles they hold themselves, never wider than they hold them.
  return (actor.grants ?? [])
    .filter((grant) => grant.role !== "super_admin")
    .map((grant) => ({
      role: grant.role,
      scope:
        SCOPABLE_ROLES.includes(grant.role) && grant.departmentIds.length > 0
          ? [...grant.departmentIds]
          : ("all" as const),
    }));
}

export interface AccessChange {
  op: "grant" | "revoke";
  role: ApiRole;
  /** Requested departments for a grant (empty = organization-wide). For a revoke: the target's current departments. */
  departmentIds: readonly string[];
  target: { employeeId: string; departmentId: string };
  mfaEnforced: boolean;
}

function within(scope: CapabilityScope, departmentId: string) {
  return scope === "all" || scope.includes(departmentId);
}

/** Throws the reason a role change is not allowed; returns normally when it is. */
export function assertAccessChangeAllowed(actor: AuthenticatedActor, change: AccessChange): void {
  if (!actor.capabilities.includes("access.manage")) throw new AuthorizationError("You don't have access to this.");
  if (!within(scopeOf(actor, "access.manage"), change.target.departmentId))
    throw new AuthorizationError("This employee is outside the departments you manage.", "OUT_OF_SCOPE");
  if (actor.employeeId === change.target.employeeId)
    throw new AuthorizationError("Another administrator must change your access.", "SELF_ACCESS_CHANGE");
  if (change.mfaEnforced && PRIVILEGED_ROLES.includes(change.role) && !actor.mfaVerified)
    throw new AuthorizationError("Verify your authenticator code before changing privileged access.", "MFA_REQUIRED");

  const scoped = change.departmentIds.length > 0;
  if (change.op === "grant" && scoped && !SCOPABLE_ROLES.includes(change.role))
    throw new ValidationError("ROLE_NOT_SCOPABLE", "Only HR and payroll roles can be limited to departments.", {
      departmentIds: "This role always applies organization-wide (or to the person's own team).",
    });

  const allowed = grantableRoles(actor).find((grantable) => grantable.role === change.role);
  if (!allowed)
    throw new AuthorizationError(
      change.role === "super_admin"
        ? "Only a super admin can change super admin access."
        : "You can only grant or revoke roles you hold yourself.",
      "ROLE_NOT_GRANTABLE",
    );
  if (allowed.scope === "all") return;
  // A scoped grantor can never create or remove organization-wide access, nor reach outside their departments.
  if (!scoped)
    throw new AuthorizationError(
      "Your access is limited to departments, so choose departments for this role.",
      "SCOPE_TOO_WIDE",
    );
  const outside = change.departmentIds.filter((id) => !allowed.scope.includes(id));
  if (outside.length > 0)
    throw new AuthorizationError("You can only grant access within your own departments.", "SCOPE_TOO_WIDE");
}
