import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { config } from "../../config/index.js";
import { ACCESS_TOKEN_TTL_SECONDS, ROLES, type ApiRole } from "../../utils/constants.js";
import { AuthenticationError } from "../errors/AuthenticationError.js";

/** Claims carried by an access token. The actor's live roles are re-checked against the database per request. */
export interface AccessTokenClaims {
  employeeId: string;
  roles: ApiRole[];
  issuedAt: number;
  mfaVerified: boolean;
}

const validRoles = new Set<string>(ROLES);

export function issueAccessToken(
  employeeId: string,
  roles: readonly string[],
  options: { mfaVerified?: boolean; authenticatedAt?: number } = {},
): Promise<string> {
  return new SignJWT({ roles, mfa: options.mfaVerified ?? false, issuedAtMs: options.authenticatedAt ?? Date.now() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(employeeId)
    .setIssuer(config.jwt.issuer)
    .setAudience(config.jwt.audience)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(config.jwt.secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: ["HS256"],
    }));
  } catch {
    throw new AuthenticationError("INVALID_TOKEN", "The access token is invalid or expired.");
  }

  const employeeId = payload.sub;
  const roles = payload.roles;
  if (
    typeof employeeId !== "string" ||
    typeof payload.exp !== "number" ||
    !Array.isArray(roles) ||
    !roles.every((role): role is ApiRole => typeof role === "string" && validRoles.has(role))
  )
    throw new AuthenticationError("INVALID_TOKEN", "The access token is invalid.");

  if (typeof payload.iat !== "number") throw new AuthenticationError("INVALID_TOKEN", "The access token is invalid.");
  return {
    employeeId,
    roles,
    issuedAt: typeof payload.issuedAtMs === "number" ? payload.issuedAtMs : payload.iat * 1000,
    mfaVerified: payload.mfa === true,
  };
}
