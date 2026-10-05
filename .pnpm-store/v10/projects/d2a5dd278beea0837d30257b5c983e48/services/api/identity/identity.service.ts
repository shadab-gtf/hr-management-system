import "server-only";
import { cache } from "react";
import { z } from "zod";
import { apiConfig } from "@/lib/api/core/config";
import { problem } from "@/lib/api/core/problem";
import { callApi } from "@/lib/api/core/transport";
import { liveRequest } from "@/lib/api/core/transport";
import { storeAccessToken } from "@/lib/api/session/credentials";
import { cookies } from "next/headers";
import { mockActor } from "@/lib/api/session/session.service";
import {
  mockAccessOverview,
  mockAuditPage,
  mockChangeRole,
  mockEmail,
  mockSetAccountDisabled,
} from "@/lib/mocks/handlers/identity";
import { db as mockDb } from "@/lib/mocks/store";
import {
  accessOverviewSchema,
  auditPageSchema,
  inviteResultSchema,
  mfaGateSchema,
  securityOverviewSchema,
  type AccessOverview,
  type AuditFilters,
  type AuditPage,
  type SecurityOverview,
} from "@/types/identity";
import type { Role } from "@/types/session";

/*
 * Identity & access boundary. Live mode calls the standalone identity API.
 * Mock mode applies the same role-grant rules to demo personas (grants, revokes,
 * disabling, audit) but has no real sign-ins, so invitations, passwords and MFA
 * answer 503.
 */

const demoOnly = () =>
  problem(
    503,
    "LIVE_API_REQUIRED",
    "Accounts, invites and MFA require a connected HR service. Demo mode has no real sign-ins.",
  );

export const getAccessOverview = cache(async (): Promise<AccessOverview> =>
  callApi({
    schema: accessOverviewSchema,
    live: { path: "/identity/access" },
    mock: async () => mockAccessOverview(await mockActor()),
  }),
);

export const getAuditPage = cache(
  async (filters: AuditFilters): Promise<AuditPage> =>
    callApi({
      schema: auditPageSchema,
      live: { path: "/audit", query: { ...filters } },
      mock: async () => mockAuditPage(await mockActor(), filters),
    }),
);

export const getSecurityOverview = cache(async (): Promise<SecurityOverview> =>
  callApi({
    schema: securityOverviewSchema,
    live: { path: "/me/security" },
    mock: async () => {
      const actor = await mockActor();
      const employee = mockDb().employees.find(
        (e) => e.id === actor.employeeId,
      );
      return {
        loginId: employee ? mockEmail(employee.name) : actor.employeeId,
        lastSignInAt: null,
        currentLevel: null,
        factors: [],
        mfaEnforced: false,
        pendingRoles: [],
        source: "mock",
      } satisfies SecurityOverview;
    },
  }),
);

/** MFA gate for the current session, or null outside live mode / when signed out. */
export const getMfaGate = cache(async () => {
  if (
    apiConfig.mode === "mock" ||
    !(await cookies()).get(apiConfig.sessionCookie)
  )
    return null;
  return mfaGateSchema.parse(
    await liveRequest({ path: "/me/security/mfa-gate" }),
  );
});

/* Commands ---------------------------------------------------------------------- */

const okSchema = z.unknown();

export async function inviteAccount(
  employeeId: string,
  idempotencyKey: string,
) {
  return callApi({
    schema: inviteResultSchema,
    live: {
      method: "POST",
      path: `/identity/accounts/${employeeId}/invite`,
      idempotencyKey,
    },
    mock: () => {
      throw demoOnly();
    },
  });
}

export async function issueInviteLink(employeeId: string) {
  return callApi({
    schema: z.object({ link: z.string().url(), expiresAt: z.string() }),
    live: {
      method: "POST",
      path: `/identity/accounts/${employeeId}/invite-link`,
    },
    mock: () => {
      throw demoOnly();
    },
  });
}

export interface RoleChangeInput {
  employeeId: string;
  role: Role;
  reason: string;
  expiresOn?: string | null;
  /** Grant only: limit an HR/payroll role to these departments; empty = organization-wide. */
  departmentIds?: string[];
  idempotencyKey: string;
}

export async function changeRole(
  op: "grant" | "revoke",
  input: RoleChangeInput,
) {
  const body = {
    role: input.role,
    reason: input.reason,
    expiresOn: input.expiresOn ?? null,
    ...(op === "grant" ? { departmentIds: input.departmentIds ?? [] } : {}),
  };
  return callApi({
    schema: okSchema,
    live: {
      method: "POST",
      path: `/identity/accounts/${input.employeeId}/roles/${op}`,
      body,
      idempotencyKey: input.idempotencyKey,
    },
    mock: async () => mockChangeRole(await mockActor(), op, input),
  });
}

export async function setAccountDisabled(input: {
  employeeId: string;
  disabled: boolean;
  reason: string;
}) {
  return callApi({
    schema: okSchema,
    live: {
      method: "POST",
      path: `/identity/accounts/${input.employeeId}/${input.disabled ? "disable" : "enable"}`,
      body: { reason: input.reason },
    },
    mock: async () =>
      mockSetAccountDisabled(
        await mockActor(),
        input.employeeId,
        input.disabled,
        input.reason,
      ),
  });
}

/** Public: no session. Mock/live modes have no local recovery. */
export async function requestPasswordRecovery(input: {
  email: string;
  ip: string;
}) {
  if (apiConfig.mode === "mock") throw demoOnly();
  await liveRequest({
    method: "POST",
    path: "/auth/recovery",
    body: { email: input.email },
  });
  return {} as { deliver?: () => Promise<void> };
}

export async function completePasswordSetup(input: {
  tokenHash: string;
  type: "invite" | "recovery";
  ref: string;
  password: string;
  ip: string;
}) {
  if (apiConfig.mode === "mock") throw demoOnly();
  return liveRequest({
    method: "POST",
    path: "/auth/set-password",
    body: input,
  });
}

/** Public: login ID behind an open set-password link, or null (closed link / not live mode). */
export async function describeSetPasswordLink(ref: string) {
  if (apiConfig.mode === "mock") return null;
  return z
    .object({ loginId: z.string(), expiresAt: z.string() })
    .nullable()
    .parse(await liveRequest({ path: "/auth/link", query: { ref } }));
}

export async function startMfaEnrollment() {
  if (apiConfig.mode === "mock") throw demoOnly();
  return z
    .object({ factorId: z.string(), secret: z.string(), qrCode: z.string() })
    .parse(
      await liveRequest({
        method: "POST",
        path: "/me/security/mfa/enroll",
        body: {},
      }),
    );
}

export async function confirmMfaEnrollment(input: {
  factorId: string;
  code: string;
}) {
  return verifyMfaSession(input);
}

export async function verifyMfaSignIn(input: { code: string }) {
  return verifyMfaSession(input);
}

export async function removeMfaFactor(factorId: string) {
  if (apiConfig.mode === "mock") throw demoOnly();
  const result = await liveRequest({
    method: "POST",
    path: `/me/security/mfa/${encodeURIComponent(factorId)}/remove`,
    body: {},
  });
  (await cookies()).delete(apiConfig.sessionCookie);
  return result;
}

export async function signOutEverywhere() {
  if (apiConfig.mode === "mock") throw demoOnly();
  return liveRequest({ method: "POST", path: "/auth/logout-all", body: {} });
}

export async function postSignInRoute(next: string) {
  if (apiConfig.mode === "mock") return next;
  const gate = await getMfaGate();
  if (!gate?.required || gate.satisfied) return next;
  return gate.hasVerifiedFactor
    ? `/auth/mfa?next=${encodeURIComponent(next)}`
    : "/settings/security";
}

async function verifyMfaSession(input: { factorId?: string; code: string }) {
  if (apiConfig.mode === "mock") throw demoOnly();
  const data = z
    .object({ accessToken: z.string(), expiresIn: z.number() })
    .parse(
      await liveRequest({
        method: "POST",
        path: "/me/security/mfa/verify",
        body: input,
      }),
    );
  await storeAccessToken(data.accessToken, data.expiresIn);
  return { ok: true };
}
export const passwordRules = { min: 15, max: 128 };
export const recoveryLinkMinutes = () => 30;
