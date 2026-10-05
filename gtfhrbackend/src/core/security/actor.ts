import type { ApiRole } from "../../utils/constants.js";
import { AuthorizationError } from "../errors/AuthorizationError.js";
import type { Capability } from "./capabilities.js";

/** The authenticated caller. Roles are re-read from the database on every request, so revocation is immediate. */
export interface AuthenticatedActor {
  employeeId: string;
  roles: ApiRole[];
  capabilities: Capability[];
  mfaVerified?: boolean;
  mfaRequired?: boolean;
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
