import { EmploymentStatus, type PrismaClient } from "@prisma/client";
import type { Request, RequestHandler } from "express";
import { prismaOf } from "../database/prisma.js";
import { AuthenticationError } from "../errors/AuthenticationError.js";
import type { AuthenticatedActor } from "../security/actor.js";
import { capabilitiesFor } from "../security/capabilities.js";
import { verifyAccessToken } from "../security/tokens.js";
import { createAuthRepository } from "../../modules/auth/auth.repository.js";
import { config } from "../../config/index.js";
import { AuthorizationError } from "../errors/AuthorizationError.js";

/** The live actor for a verified token: exited employees, disabled accounts and revoked roles are refused at once. */
export async function loadActor(
  prisma: PrismaClient,
  employeeId: string,
  claims?: { issuedAt: number; mfaVerified: boolean },
): Promise<AuthenticatedActor> {
  const repository = createAuthRepository(prisma);
  const [employee, security] = await Promise.all([repository.actorRecord(employeeId), repository.security(employeeId)]);
  if (
    !employee ||
    !employee.account ||
    employee.status === EmploymentStatus.exited ||
    employee.account.disabledAt ||
    (claims && security?.revokedBefore && claims.issuedAt <= security.revokedBefore.getTime())
  )
    throw new AuthenticationError("INVALID_TOKEN", "The access token is invalid.");

  const mfaVerified = claims?.mfaVerified ?? false;
  const roles = employee.roleAssignments
    .map(({ role }) => role)
    .filter(
      (role) =>
        !config.mfaEnforced || mfaVerified || !["hr_operator", "payroll_operator", "payroll_approver"].includes(role),
    );
  return {
    employeeId,
    roles,
    capabilities: capabilitiesFor(roles),
    mfaVerified,
    mfaRequired: Boolean(security?.verifiedAt),
  };
}

/** Requires a valid bearer access token and attaches the caller to `request.actor`. */
export const authenticate: RequestHandler = async (request, _response, next) => {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) throw new AuthenticationError("UNAUTHORIZED", "A bearer token is required.");

  const claims = await verifyAccessToken(token);
  request.actor = await loadActor(prismaOf(request), claims.employeeId, claims);
  const path = request.originalUrl.split("?")[0] ?? "";
  if (
    request.actor.mfaRequired &&
    !request.actor.mfaVerified &&
    path !== "/api/v1/me" &&
    path !== "/api/v1/auth/logout-all" &&
    !path.startsWith("/api/v1/me/security")
  )
    throw new AuthorizationError("Verify your authenticator code before continuing.", "MFA_REQUIRED");
  next();
};

/** The authenticated caller; use only on routes behind `authenticate`. */
export function currentActor(request: Request): AuthenticatedActor {
  if (!request.actor) throw new AuthenticationError("INVALID_TOKEN", "The access token is invalid.");
  return request.actor;
}
