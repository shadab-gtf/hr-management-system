import "server-only";
import { problem } from "@/lib/api/core/problem";
import {
  accessSubject,
  activeHolders,
  assertAccessChangeAllowed,
  auditEntries,
  departmentIdOf,
  departmentInScope,
  grantableRoles,
  grantsOf,
  isAccountDisabled,
  isOrgWide,
  isPrivilegedRole,
  mockDepartments,
  recordAudit,
  removeGrant,
  writeDisabled,
  writeGrant,
} from "@/lib/mocks/handlers/access-store";
import { notify } from "@/lib/mocks/handlers/notifications";
import {
  idempotent,
  requireCapability,
  type MockActor,
} from "@/lib/mocks/handlers/shared";
import { organization } from "@/lib/mocks/seed/organization";
import { db, employeeById, nowInstant } from "@/lib/mocks/store";
import type {
  AccessOverview,
  AuditFilters,
  AuditPage,
  IdentityAccount,
} from "@/types/identity";
import type { Role } from "@/types/session";

/*
 * Demo identity administration. Role grants, revokes and account disabling follow the live API's rules
 * (deny by default, department scopes, no self-change, only a super admin touches super admin, one super admin
 * always remains). Invitations, passwords and MFA need the real identity service and stay unavailable here.
 */

export function mockEmail(name: string) {
  const [first = "", ...rest] = name.toLowerCase().split(" ");
  return `${first}.${rest.at(-1) ?? ""}@${organization.emailDomain}`;
}

const departmentNames = () =>
  new Map(
    mockDepartments().map((department) => [department.id, department.name]),
  );

export function mockAccessOverview(actor: MockActor): AccessOverview {
  requireCapability(actor, "access.manage");
  const names = departmentNames();
  const accounts: IdentityAccount[] = db()
    .employees.filter((employee) =>
      departmentInScope(
        actor,
        "access.manage",
        departmentIdOf(employee.department),
      ),
    )
    .map((employee): IdentityAccount => {
      const grants = grantsOf(employee.id);
      return {
        employeeId: employee.id,
        code: employee.code,
        name: employee.name,
        designation: employee.designation,
        department: employee.department,
        email: mockEmail(employee.name),
        employmentStatus: employee.status,
        status:
          employee.status === "exited" || isAccountDisabled(employee.id)
            ? "disabled"
            : "active",
        roles: grants.map((grant) => ({
          role: grant.role,
          departments: grant.departmentIds.map((id) => ({
            id,
            name: names.get(id) ?? id,
          })),
          grantedAt: grant.grantedAt,
          expiresAt: grant.expiresAt,
          grantedBy: grant.grantedBy,
          reason: grant.reason,
        })),
        lastSignInAt: null,
        invitedAt: null,
        mfa: "unknown",
        mfaRequired: false,
        canCopyInvite: false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const grantable = grantableRoles(actor);
  return {
    accounts,
    outbox: [],
    adminReady: false,
    mailReady: false,
    mfaEnforced: false,
    viewer: {
      employeeId: actor.employeeId,
      canGrantPrivileged: grantable.some((item) => isPrivilegedRole(item.role)),
      isSuperAdmin: actor.roles.includes("super_admin"),
      grantable,
    },
    departments: mockDepartments(),
    source: "mock",
  };
}

/** The target as the access rules see it; out-of-scope and unknown people are indistinguishable (404). */
function targetOf(actor: MockActor, employeeId: string) {
  const employee = employeeById(employeeId);
  if (!employee || employee.status === "exited")
    throw problem(404, "NOT_FOUND", "We couldn't find that record.");
  const departmentId = departmentIdOf(employee.department);
  if (!departmentInScope(actor, "access.manage", departmentId))
    throw problem(404, "NOT_FOUND", "We couldn't find that record.");
  return { employee, departmentId };
}

export function mockChangeRole(
  actor: MockActor,
  op: "grant" | "revoke",
  input: {
    employeeId: string;
    role: Role;
    reason: string;
    expiresOn?: string | null;
    departmentIds?: readonly string[];
    idempotencyKey: string;
  },
) {
  requireCapability(actor, "access.manage");
  return idempotent(`identity:${input.idempotencyKey}`, () => {
    const { departmentId } = targetOf(actor, input.employeeId);
    const current = grantsOf(input.employeeId).find(
      (grant) => grant.role === input.role,
    );
    if (op === "revoke" && !current)
      throw problem(404, "NOT_FOUND", "This person doesn't hold that role.");
    const departmentIds =
      op === "grant"
        ? [...new Set(input.departmentIds ?? [])]
        : [...(current?.departmentIds ?? [])];
    assertAccessChangeAllowed(actor, {
      op,
      role: input.role,
      departmentIds,
      target: { employeeId: input.employeeId, departmentId },
    });
    // Re-granting replaces the grant, so it must also be one the actor could revoke.
    if (op === "grant" && current)
      assertAccessChangeAllowed(actor, {
        op: "revoke",
        role: input.role,
        departmentIds: current.departmentIds,
        target: { employeeId: input.employeeId, departmentId },
      });
    if (input.reason.trim().length < 5)
      throw problem(400, "VALIDATION_FAILED", "Check the submitted fields.", {
        fieldErrors: { reason: "Give a reason of at least 5 characters." },
      });
    const known = new Set(mockDepartments().map((department) => department.id));
    if (departmentIds.some((id) => !known.has(id)))
      throw problem(400, "UNKNOWN_DEPARTMENT", "Choose active departments.", {
        fieldErrors: { departmentIds: "Choose active departments." },
      });
    if (
      op === "revoke" &&
      input.role === "super_admin" &&
      activeHolders("super_admin", input.employeeId) < 1
    )
      throw problem(
        409,
        "LAST_SUPER_ADMIN",
        "Keep at least one active super admin.",
      );
    if (
      op === "revoke" &&
      input.role === "hr_operator" &&
      activeHolders("hr_operator", input.employeeId) < 1
    )
      throw problem(409, "LAST_HR", "Keep at least one active HR operator.");
    const expiresAt = input.expiresOn
      ? new Date(`${input.expiresOn}T23:59:59.999+05:30`).toISOString()
      : null;
    if (expiresAt && expiresAt <= nowInstant())
      throw problem(400, "INVALID_EXPIRY", "Choose a future expiry date.");

    if (op === "grant")
      writeGrant(input.employeeId, {
        role: input.role,
        departmentIds,
        grantedAt: nowInstant(),
        expiresAt,
        grantedBy: actor.employeeId,
        reason: input.reason.trim(),
      });
    else removeGrant(input.employeeId, input.role);
    recordAudit({
      actorId: actor.employeeId,
      action: `identity.role.${op}.details`,
      entity: "employee",
      entityId: input.employeeId,
      details: {
        role: input.role,
        departmentIds,
        reason: input.reason.trim(),
        expiresOn: input.expiresOn ?? null,
      },
    });
    notify(
      input.employeeId,
      "system",
      op === "grant" ? "You have new access" : "Your access changed",
      op === "grant"
        ? "An administrator granted you a new role."
        : "An administrator removed one of your roles.",
      "/dashboard",
    );
    return { ok: true };
  });
}

export function mockSetAccountDisabled(
  actor: MockActor,
  employeeId: string,
  disabled: boolean,
  reason: string,
) {
  requireCapability(actor, "access.manage");
  const employee = employeeById(employeeId);
  if (
    !employee ||
    !departmentInScope(
      actor,
      "access.manage",
      departmentIdOf(employee.department),
    )
  )
    throw problem(404, "NOT_FOUND", "We couldn't find that record.");
  if (actor.employeeId === employeeId)
    throw problem(
      403,
      "SELF_ACCESS_CHANGE",
      "Another administrator must change your account.",
    );
  const target = accessSubject(employeeId);
  const targetIsSuperAdmin = target.roles.includes("super_admin");
  if (targetIsSuperAdmin && !actor.roles.includes("super_admin"))
    throw problem(
      403,
      "ROLE_NOT_GRANTABLE",
      "Only a super admin can change a super admin's account.",
    );
  // Disabling switches off every role, so it needs the right to revoke each one.
  for (const grant of target.grants)
    assertAccessChangeAllowed(actor, {
      op: "revoke",
      role: grant.role,
      departmentIds: grant.departmentIds,
      target: { employeeId, departmentId: departmentIdOf(employee.department) },
    });
  if (
    disabled &&
    targetIsSuperAdmin &&
    activeHolders("super_admin", employeeId) < 1
  )
    throw problem(
      409,
      "LAST_SUPER_ADMIN",
      "Keep at least one active super admin.",
    );
  if (
    disabled &&
    target.roles.includes("hr_operator") &&
    activeHolders("hr_operator", employeeId) < 1
  )
    throw problem(409, "LAST_HR", "Keep at least one active HR operator.");
  writeDisabled(employeeId, disabled);
  recordAudit({
    actorId: actor.employeeId,
    action: "identity.account.status.details",
    entity: "employee",
    entityId: employeeId,
    details: { disabled, reason },
  });
  return { ok: true };
}

export function mockAuditPage(
  actor: MockActor,
  filters: AuditFilters,
): AuditPage {
  requireCapability(actor, "audit.read");
  if (!isOrgWide(actor, "audit.read"))
    throw problem(
      403,
      "ORG_WIDE_ACCESS_REQUIRED",
      "This action needs organization-wide access.",
    );
  const pageSize = 50;
  const all = auditEntries();
  const matching = all.filter(
    (entry) =>
      (!filters.actor || entry.actorId === filters.actor) &&
      (!filters.entity || entry.entity === filters.entity) &&
      (!filters.from || entry.at.slice(0, 10) >= filters.from) &&
      (!filters.to || entry.at.slice(0, 10) <= filters.to),
  );
  const people = db().employees;
  const nameOf = (id: string | null) =>
    id ? (people.find((employee) => employee.id === id)?.name ?? null) : null;
  return {
    items: matching
      .slice((filters.page - 1) * pageSize, filters.page * pageSize)
      .map((entry) => {
        const name = nameOf(entry.actorId);
        return {
          id: entry.id,
          at: entry.at,
          actor: entry.actorId && name ? { id: entry.actorId, name } : null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          details: JSON.stringify(entry.details),
        };
      }),
    page: filters.page,
    pageSize,
    total: matching.length,
    entities: [...new Set(all.map((entry) => entry.entity))],
    actors: people
      .map((employee) => ({ id: employee.id, name: employee.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    source: "mock",
  };
}
