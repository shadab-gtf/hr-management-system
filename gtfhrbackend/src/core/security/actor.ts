import type { ApiRole } from "../../utils/constants.js";
import { AuthorizationError } from "../errors/AuthorizationError.js";
import { roleCapabilities, type Capability } from "./capabilities.js";

/** Where a capability applies: the whole organization, or only employees of these department ids. */
export type CapabilityScope = "all" | readonly string[];

/** One active role grant, as loaded from `role_assignments` + `role_scopes`. */
export interface RoleGrant {
  role: ApiRole;
  /** Empty = organization-wide. */
  departmentIds: readonly string[];
}

/**
 * The authenticated caller. Roles, department scopes and account state are re-read from the database on every
 * request, so a grant or revocation takes effect on the very next request.
 */
export interface AuthenticatedActor {
  employeeId: string;
  roles: ApiRole[];
  capabilities: Capability[];
  /** Department scope per capability (absent = not granted). Use `scopeOf()` rather than reading this directly. */
  scopes?: Partial<Record<Capability, CapabilityScope>>;
  grants?: RoleGrant[];
  mfaVerified?: boolean;
  mfaRequired?: boolean;
}

/** Roles that may be limited to departments. Employee (self), manager (own team) and super admin are never scoped. */
export const SCOPABLE_ROLES: readonly ApiRole[] = ["hr_operator", "payroll_operator", "payroll_approver"];
/** Roles that need MFA when enforcement is on. */
export const PRIVILEGED_ROLES: readonly ApiRole[] = [
  "hr_operator",
  "payroll_operator",
  "payroll_approver",
  "super_admin",
];

/**
 * Organization/department reach per capability. Only administrative grants (HR, payroll, super admin) give reach;
 * the employee role covers the person's own records and the manager role their own team, both enforced by the
 * modules' relationship checks, so they never widen an HR operator's department scope.
 * An organization-wide grant wins over any department list.
 */
export function scopesFor(grants: readonly RoleGrant[]): Partial<Record<Capability, CapabilityScope>> {
  const scopes: Partial<Record<Capability, CapabilityScope>> = {};
  for (const grant of grants) {
    if (grant.role === "employee" || grant.role === "manager") continue;
    const orgWide = grant.departmentIds.length === 0 || !SCOPABLE_ROLES.includes(grant.role);
    for (const capability of roleCapabilities[grant.role]) {
      const current = scopes[capability];
      if (current === "all") continue;
      if (orgWide) scopes[capability] = "all";
      else scopes[capability] = [...new Set([...(current ?? []), ...grant.departmentIds])];
    }
  }
  return scopes;
}

export function can(actor: AuthenticatedActor, capability: Capability): boolean {
  return actor.capabilities.includes(capability);
}

/** Server-side denial; same 403 problem as the frontend mock. */
export function requireCapability(actor: AuthenticatedActor, capability: Capability): void {
  if (!can(actor, capability)) throw new AuthorizationError("You don't have access to this.");
}

export function hasRole(actor: AuthenticatedActor, role: ApiRole): boolean {
  return actor.roles.includes(role);
}
