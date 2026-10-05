import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import { z } from "zod";
import { config } from "../../config/index.js";
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../core/errors/index.js";
import { requireCapability, type AuthenticatedActor } from "../../core/security/actor.js";
import { encrypt, decrypt } from "../../core/security/encryption.js";
import { hashPassword } from "../../core/security/hashing.js";
import { generateTotpSecret, verifyTotp } from "../../core/security/totp.js";
import { issueAccessToken } from "../../core/security/tokens.js";
import { queueEmail } from "../../core/mail/outbox.js";
import { newId } from "../../core/database/ids.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import { createIdentityRepository } from "./identity.repository.js";
import { workspaceCommand } from "../workspace/workspace.repository.js";
import type { CommandContext } from "../workspace/workspace.schema.js";
import type { passwordSetupInput, roleInput } from "./identity.schema.js";
const privileged = new Set(["hr_operator", "payroll_operator", "payroll_approver"]);
export const needsMfa = (roles: readonly string[]) => config.mfaEnforced && roles.some((r) => privileged.has(r));
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export function createIdentityService(prisma: PrismaClient) {
  const repository = createIdentityRepository(prisma);
  const command = <T>(
    actor: AuthenticatedActor,
    action: string,
    id: string,
    context: CommandContext,
    work: Parameters<typeof workspaceCommand<T>>[6],
  ) => workspaceCommand(prisma, actor, action, id, context.key, context.requestId, work);
  return {
    async access(actor: AuthenticatedActor) {
      requireCapability(actor, "employee.update");
      const accounts = await repository.accounts();
      const outbox = await repository.outbox();
      return {
        accounts: await Promise.all(
          accounts.map(async (e) => {
            const [security, links] = await Promise.all([repository.security(e.id), repository.links(e.id)]);
            return {
              employeeId: e.id,
              code: e.code,
              name: e.name,
              designation: e.designation,
              department: e.department.name,
              email: e.workEmail,
              employmentStatus: e.status,
              status:
                e.status === "exited" || e.account?.disabledAt
                  ? "disabled"
                  : e.credential
                    ? "active"
                    : links.length
                      ? "invited"
                      : "not_invited",
              roles: e.roleAssignments.map((r) => ({
                role: r.role,
                grantedAt: r.grantedAt.toISOString(),
                expiresAt: r.expiresAt?.toISOString() ?? null,
                grantedBy: r.grantedBy,
                reason: r.reason,
              })),
              lastSignInAt: e.account?.lastSignInAt?.toISOString() ?? null,
              invitedAt: links[0]?.createdAt.toISOString() ?? null,
              mfa: security?.verifiedAt ? "enrolled" : "not_enrolled",
              mfaRequired: needsMfa(e.roleAssignments.map((r) => r.role)),
              canCopyInvite: !e.credential && !e.account?.disabledAt && e.status !== "exited",
            };
          }),
        ),
        outbox: outbox
          .filter((m) =>
            ["invite", "recovery", "password_changed", "mfa_changed", "access_changed"].includes(m.template),
          )
          .map((m) => ({
            id: m.id,
            employeeId: accounts.find((e) => e.workEmail === m.to)?.id ?? null,
            to: m.to,
            template: m.template,
            subject: m.subject,
            bodyRedacted: "Sensitive message content is available only through the delivery service.",
            status: m.status,
            error: m.lastError,
            createdAt: m.createdAt.toISOString(),
            sentAt: m.sentAt?.toISOString() ?? null,
            linkExpiresAt: null,
            linkUsedAt: null,
          })),
        adminReady: true,
        mailReady: Boolean(config.mail.smtpUrl),
        mfaEnforced: config.mfaEnforced,
        viewer: { employeeId: actor.employeeId, canGrantPrivileged: actor.roles.includes("hr_operator") },
        source: "database",
      };
    },
    async security(actor: AuthenticatedActor) {
      const [account, security] = await Promise.all([
        repository.account(actor.employeeId),
        repository.security(actor.employeeId),
      ]);
      if (!account) throw new NotFoundError();
      const roles = account.roleAssignments.filter((r) => !r.expiresAt || r.expiresAt > new Date()).map((r) => r.role);
      return {
        loginId: account.workEmail,
        lastSignInAt: account.account?.lastSignInAt?.toISOString() ?? null,
        currentLevel: actor.mfaVerified ? "aal2" : "aal1",
        factors: security?.factorId
          ? [
              {
                id: security.factorId,
                friendlyName: "Authenticator",
                status: security.verifiedAt ? "verified" : "unverified",
                createdAt: security.createdAt.toISOString(),
              },
            ]
          : [],
        mfaEnforced: config.mfaEnforced,
        pendingRoles: !actor.mfaVerified && needsMfa(roles) ? roles.filter((r) => privileged.has(r)) : [],
        source: "database",
      };
    },
    async gate(actor: AuthenticatedActor) {
      const account = await repository.account(actor.employeeId);
      const security = await repository.security(actor.employeeId);
      const roles =
        account?.roleAssignments.filter((r) => !r.expiresAt || r.expiresAt > new Date()).map((r) => r.role) ?? [];
      const required = needsMfa(roles) || Boolean(security?.verifiedAt);
      return {
        required,
        satisfied: !required || Boolean(actor.mfaVerified),
        hasVerifiedFactor: Boolean(security?.verifiedAt),
        pendingRoles: required && !actor.mfaVerified ? roles.filter((r) => privileged.has(r)) : [],
      };
    },
    invite(actor: AuthenticatedActor, employeeId: string, copy: boolean, context: CommandContext) {
      requireCapability(actor, "employee.update");
      return command(actor, copy ? "identity.invite_link" : "identity.invite", employeeId, context, async (_r, tx) => {
        const r = createIdentityRepository(tx);
        const account = await r.account(employeeId);
        if (!account || account.status === "exited") throw new NotFoundError();
        if (account.account?.disabledAt)
          throw new ConflictError("ACCOUNT_DISABLED", "Enable the account before sending an invitation.");
        if (copy && account.credential)
          throw new ConflictError("ALREADY_ACTIVATED", "This account has already been activated.");
        const kind = account.credential ? "recovery" : "invite";
        const token = randomBytes(32).toString("base64url");
        const id = newId("lnk");
        const expiresAt = new Date(Date.now() + (kind === "invite" ? 86400_000 : 1800_000));
        await r.invalidateLinks(employeeId);
        await r.createLink({ id, employeeId, kind, tokenHash: digest(token), expiresAt });
        await r.accountEnabled(employeeId, false);
        const url = new URL("/auth/set-password", config.appBaseUrl);
        url.searchParams.set("ref", id);
        url.searchParams.set("token_hash", token);
        url.searchParams.set("type", kind);
        if (copy) return { link: url.toString(), expiresAt: expiresAt.toISOString() };
        const outboxId = await queueEmail(tx, {
          to: account.workEmail,
          template: kind,
          subject: kind === "invite" ? "Set up your HR account" : "Reset your HR password",
          text: `Open this single-use link before ${expiresAt.toISOString()}: ${url.toString()}`,
        });
        return {
          employeeId,
          loginId: account.workEmail,
          outboxId,
          delivery: config.mail.smtpUrl ? "queued" : "not_configured",
          linkType: kind,
        };
      });
    },
    async recovery(email: string, requestId: string) {
      const account = await repository.findEmail(email);
      if (account && account.status !== "exited" && account.credential && !account.account?.disabledAt) {
        const serviceActor: AuthenticatedActor = { employeeId: account.id, roles: [], capabilities: [] };
        await command(
          serviceActor,
          "identity.recovery",
          account.id,
          { requestId, key: undefined, version: undefined },
          async (_r, tx) => {
            const r = createIdentityRepository(tx);
            const token = randomBytes(32).toString("base64url");
            const id = newId("lnk");
            const expiresAt = new Date(Date.now() + 1800_000);
            await r.invalidateLinks(account.id);
            await r.createLink({ id, employeeId: account.id, kind: "recovery", tokenHash: digest(token), expiresAt });
            const url = new URL("/auth/set-password", config.appBaseUrl);
            url.searchParams.set("ref", id);
            url.searchParams.set("token_hash", token);
            url.searchParams.set("type", "recovery");
            await queueEmail(tx, {
              to: account.workEmail,
              template: "recovery",
              subject: "Reset your HR password",
              text: `This reset link expires in 30 minutes: ${url.toString()}`,
            });
            return { ok: true };
          },
        );
      }
      return { ok: true };
    },
    async setPassword(input: z.infer<typeof passwordSetupInput>, requestId: string) {
      const row = await repository.link(input.ref);
      if (
        !row ||
        row.kind !== input.type ||
        row.usedAt ||
        row.expiresAt <= new Date() ||
        !timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(digest(input.tokenHash)))
      )
        throw new ValidationError("INVALID_LINK", "This link is invalid or expired. Request a new one.");
      const passwordHash = await hashPassword(input.password);
      const actor: AuthenticatedActor = { employeeId: row.employeeId, roles: [], capabilities: [] };
      return command(
        actor,
        "identity.password_changed",
        row.employeeId,
        { requestId, key: undefined, version: undefined },
        async (_r, tx) => {
          const r = createIdentityRepository(tx);
          const account = await r.account(row.employeeId);
          if (!account || account.status === "exited" || account.account?.disabledAt)
            throw new AuthenticationError("ACCOUNT_UNAVAILABLE", "The account is unavailable.");
          if ((await r.consumeLink(row.id)).count !== 1)
            throw new ConflictError("LINK_USED", "This link was already used.");
          await r.setPassword(row.employeeId, passwordHash);
          await r.saveSecurity(row.employeeId, { revokedBefore: new Date() });
          await queueEmail(tx, {
            to: account.workEmail,
            template: "password_changed",
            subject: "Your HR password was changed",
            text: "Your password was changed. Contact HR if you did not request this change.",
          });
          return { ok: true };
        },
      );
    },
    async describeLink(ref: string) {
      const row = await repository.link(ref);
      if (!row || row.usedAt || row.expiresAt <= new Date()) return null;
      // Never expose the login id without possessing the secret token.
      return { email: "", loginId: "", expiresAt: row.expiresAt.toISOString() };
    },
    role(
      actor: AuthenticatedActor,
      employeeId: string,
      op: "grant" | "revoke",
      input: z.infer<typeof roleInput>,
      context: CommandContext,
    ) {
      requireCapability(actor, "employee.update");
      return command(actor, `identity.role.${op}`, employeeId, context, async (_r, tx) => {
        const r = createIdentityRepository(tx);
        await r.lockAdministration();
        const account = await r.account(employeeId);
        if (!account || account.status === "exited") throw new NotFoundError();
        if (actor.employeeId === employeeId && privileged.has(input.role))
          throw new AuthorizationError("Another HR operator must change your privileged access.");
        if (op === "revoke" && input.role === "hr_operator" && (await r.activeHrCount()) <= 1)
          throw new ConflictError("LAST_HR", "Keep at least one active HR operator.");
        const expiresAt = input.expiresOn ? new Date(`${input.expiresOn}T23:59:59.999+05:30`) : null;
        if (expiresAt && expiresAt <= new Date())
          throw new ValidationError("INVALID_EXPIRY", "Choose a future expiry date.");
        if (op === "grant") await r.grantRole(employeeId, input.role, actor.employeeId, input.reason, expiresAt);
        else await r.revokeRole(employeeId, input.role);
        await recordAuditEvent(tx, {
          actorEmployeeId: actor.employeeId,
          action: `identity.role.${op}.details`,
          entity: "employee",
          entityId: employeeId,
          requestId: context.requestId,
          details: { role: input.role, reason: input.reason, expiresOn: input.expiresOn ?? null },
        });
        return { ok: true };
      });
    },
    disable(actor: AuthenticatedActor, employeeId: string, disabled: boolean, reason: string, context: CommandContext) {
      requireCapability(actor, "employee.update");
      return command(
        actor,
        disabled ? "identity.account.disable" : "identity.account.enable",
        employeeId,
        context,
        async (_r, tx) => {
          const r = createIdentityRepository(tx);
          await r.lockAdministration();
          const account = await r.account(employeeId);
          if (!account) throw new NotFoundError();
          if (disabled && actor.employeeId === employeeId)
            throw new AuthorizationError("You cannot disable your own account.");
          if (
            disabled &&
            account.roleAssignments.some((a) => a.role === "hr_operator") &&
            (await r.activeHrCount()) <= 1
          )
            throw new ConflictError("LAST_HR", "Keep at least one active HR operator.");
          await r.accountEnabled(employeeId, disabled);
          await r.saveSecurity(employeeId, { revokedBefore: new Date() });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "identity.account.status.details",
            entity: "employee",
            entityId: employeeId,
            requestId: context.requestId,
            details: { disabled, reason },
          });
          return { ok: true };
        },
      );
    },
    async enroll(actor: AuthenticatedActor, context: CommandContext) {
      const account = await repository.account(actor.employeeId);
      if (!account) throw new NotFoundError();
      const secret = generateTotpSecret();
      const factorId = randomUUID();
      return command(actor, "identity.mfa.enroll", actor.employeeId, context, async (_r, tx) => {
        const r = createIdentityRepository(tx);
        if ((await r.security(actor.employeeId))?.verifiedAt)
          throw new ConflictError("MFA_ALREADY_ENABLED", "An authenticator is already enrolled.");
        await r.saveSecurity(actor.employeeId, {
          factorId,
          totpSecret: encrypt(secret),
          verifiedAt: null,
          lastTotpStep: null,
        });
        const uri = `otpauth://totp/${encodeURIComponent(`GTF HR:${account.workEmail}`)}?secret=${secret}&issuer=GTF%20HR&algorithm=SHA1&digits=6&period=30`;
        return { factorId, secret, qrCode: await QRCode.toString(uri, { type: "svg" }) };
      });
    },
    async verify(actor: AuthenticatedActor, code: string, factorId: string | undefined, context: CommandContext) {
      const authenticatedAt = Date.now();
      const result = await command(
        actor,
        "identity.mfa.verify",
        actor.employeeId,
        { ...context, key: undefined },
        async (_r, tx) => {
          const r = createIdentityRepository(tx);
          const security = await r.security(actor.employeeId);
          if (!security?.totpSecret || (factorId && security.factorId !== factorId))
            throw new ValidationError("MFA_NOT_ENROLLED", "Set up an authenticator first.");
          if (security.lockedUntil && security.lockedUntil > new Date()) return false;
          const step = verifyTotp(decrypt(security.totpSecret), code, security.lastTotpStep);
          if (step === null) {
            await r.saveSecurity(actor.employeeId, {
              attempts: { increment: 1 },
              ...(security.attempts >= 4 ? { lockedUntil: new Date(Date.now() + 900_000), attempts: 0 } : {}),
            });
            return false;
          }
          await r.saveSecurity(actor.employeeId, {
            verifiedAt: security.verifiedAt ?? new Date(),
            lastTotpStep: BigInt(step),
            attempts: 0,
            lockedUntil: null,
          });
          return true;
        },
      );
      if (!result)
        throw new AuthenticationError("INVALID_CODE", "The code is invalid, already used, or temporarily locked.");
      const account = await repository.account(actor.employeeId);
      return {
        ok: true,
        accessToken: await issueAccessToken(actor.employeeId, account?.roleAssignments.map((r) => r.role) ?? [], {
          mfaVerified: true,
          authenticatedAt,
        }),
        expiresIn: 900,
      };
    },
    removeFactor(actor: AuthenticatedActor, factorId: string, context: CommandContext) {
      if (!actor.mfaVerified) throw new AuthorizationError("Verify your authenticator before removing it.");
      return command(actor, "identity.mfa.remove", actor.employeeId, context, async (_r, tx) => {
        const r = createIdentityRepository(tx);
        const security = await r.security(actor.employeeId);
        if (security?.factorId !== factorId) throw new NotFoundError();
        await r.saveSecurity(actor.employeeId, {
          totpSecret: null,
          factorId: null,
          verifiedAt: null,
          lastTotpStep: null,
          revokedBefore: new Date(),
        });
        return { ok: true };
      });
    },
    logout(actor: AuthenticatedActor, context: CommandContext) {
      return command(actor, "identity.logout_all", actor.employeeId, context, async (_r, tx) => {
        await createIdentityRepository(tx).saveSecurity(actor.employeeId, { revokedBefore: new Date() });
        return { ok: true };
      });
    },
    async audit(actor: AuthenticatedActor, query: Record<string, string>) {
      requireCapability(actor, "employee.update");
      const parsed = z
        .object({
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
          page: z.coerce.number().int().min(1).max(10000).default(1),
        })
        .safeParse(query);
      if (!parsed.success) throw new ValidationError("INVALID_FILTER", "Choose valid dates and a whole page number.");
      const page = parsed.data.page;
      const result = await repository.audit(
        {
          ...(query.actor ? { actorEmployeeId: query.actor } : {}),
          ...(query.entity ? { entity: query.entity } : {}),
          ...(query.from || query.to
            ? {
                at: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
                },
              }
            : {}),
        },
        (page - 1) * 50,
      );
      return {
        ...result,
        items: result.items.map((i) => ({
          id: i.id.toString(),
          at: i.at.toISOString(),
          actor: result.actors.find((a) => a.id === i.actorEmployeeId) ?? null,
          action: i.action,
          entity: i.entity,
          entityId: i.entityId,
          details: JSON.stringify(i.details),
        })),
        page,
        pageSize: 50,
        source: "database",
      };
    },
  };
}
