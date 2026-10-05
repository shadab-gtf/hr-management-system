import type { PrismaClient } from "@prisma/client";
import { AuthenticationError } from "../../core/errors/AuthenticationError.js";
import { hashPassword, verifyPassword } from "../../core/security/hashing.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import { issueAccessToken } from "../../core/security/tokens.js";
import { ACCESS_TOKEN_TTL_SECONDS, LOGIN_LOCKOUT } from "../../utils/constants.js";
import { createAuthRepository } from "./auth.repository.js";
import type { LoginInput } from "./auth.schema.js";

/** Compared against when the account is missing, so response time does not reveal which emails exist. */
const dummyPasswordHash = hashPassword("random inert comparison phrase for missing users");

export function createAuthService(prisma: PrismaClient) {
  const repository = createAuthRepository(prisma);

  return {
    async login(input: LoginInput) {
      const authenticatedAt = Date.now();
      const employee = await repository.findLoginCandidate(input.email);
      const credential = employee?.credential;
      const lockActive = Boolean(credential?.lockedUntil && credential.lockedUntil > new Date());
      const passwordMatches = await verifyPassword(
        input.password,
        credential?.passwordHash ?? (await dummyPasswordHash),
      );

      if (
        !employee ||
        !credential ||
        !employee.account ||
        employee.account.disabledAt ||
        lockActive ||
        !passwordMatches
      ) {
        if (employee && credential && !lockActive) {
          const failedAttempts = await repository.incrementFailedAttempts(employee.id);
          if (failedAttempts >= LOGIN_LOCKOUT.maxFailedAttempts)
            await repository.lockAccount(employee.id, new Date(Date.now() + LOGIN_LOCKOUT.durationMs));
        }
        throw new AuthenticationError("INVALID_CREDENTIALS", "Email or password is incorrect.");
      }

      await repository.clearFailedAttempts(employee.id);
      await repository.signIn(employee.id);
      const roles = employee.roleAssignments.map(({ role }) => role);
      return {
        accessToken: await issueAccessToken(employee.id, roles, { authenticatedAt }),
        tokenType: "Bearer",
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        employee: { id: employee.id, name: employee.name, email: employee.workEmail, roles },
      };
    },

    async currentAccount(actor: AuthenticatedActor) {
      const account = await repository.findAccount(actor.employeeId);
      if (!account) throw new AuthenticationError("INVALID_TOKEN", "The access token is invalid.");
      return { ...account, roles: actor.roles };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
