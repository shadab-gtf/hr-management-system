import type { Prisma, Role } from "@prisma/client";
import type { TransactionClient } from "../../core/database/transaction.js";

export function createIdentityRepository(db: TransactionClient) {
  return {
    lockAdministration() {
      return db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('identity-access-administration', 0))`;
    },
    security(employeeId: string) {
      return db.accountSecurity.findUnique({ where: { employeeId } });
    },
    saveSecurity(employeeId: string, data: Prisma.AccountSecurityUncheckedUpdateInput) {
      return db.accountSecurity
        .upsert({ where: { employeeId }, create: { employeeId }, update: {} })
        .then(() => db.accountSecurity.update({ where: { employeeId }, data }));
    },
    accounts() {
      return db.employee.findMany({
        include: {
          account: true,
          credential: { select: { employeeId: true } },
          roleAssignments: {
            include: { departments: { include: { department: { select: { id: true, name: true } } } } },
          },
          department: true,
        },
        orderBy: { name: "asc" },
      });
    },
    account(employeeId: string) {
      return db.employee.findUnique({
        where: { id: employeeId },
        include: {
          account: true,
          roleAssignments: { include: { departments: { select: { departmentId: true } } } },
          credential: { select: { employeeId: true } },
        },
      });
    },
    findEmail(workEmail: string) {
      return db.employee.findUnique({
        where: { workEmail },
        include: { account: true, credential: { select: { employeeId: true } } },
      });
    },
    outbox() {
      return db.mailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    },
    links(employeeId: string) {
      return db.accountLink.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" } });
    },
    link(id: string) {
      return db.accountLink.findUnique({ where: { id } });
    },
    invalidateLinks(employeeId: string) {
      return db.accountLink.updateMany({ where: { employeeId, usedAt: null }, data: { usedAt: new Date() } });
    },
    createLink(data: Prisma.AccountLinkUncheckedCreateInput) {
      return db.accountLink.create({ data });
    },
    consumeLink(id: string) {
      return db.accountLink.updateMany({
        where: { id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
    },
    setPassword(employeeId: string, passwordHash: string) {
      return db.passwordCredential.upsert({
        where: { employeeId },
        create: { employeeId, passwordHash },
        update: { passwordHash, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null },
      });
    },
    accountEnabled(employeeId: string, disabled: boolean) {
      return db.userAccount.upsert({
        where: { employeeId },
        create: { employeeId, disabledAt: disabled ? new Date() : null },
        update: { disabledAt: disabled ? new Date() : null },
      });
    },
    /** Creates or replaces a grant, including its department scope (empty = organization-wide). */
    async grantRole(
      employeeId: string,
      role: Role,
      grantedBy: string,
      reason: string,
      expiresAt: Date | null,
      departmentIds: readonly string[],
    ) {
      await db.roleAssignment.upsert({
        where: { employeeId_role: { employeeId, role } },
        create: { employeeId, role, grantedBy, reason, expiresAt },
        update: { grantedBy, reason, expiresAt, grantedAt: new Date() },
      });
      await db.roleScope.deleteMany({ where: { employeeId, role } });
      if (departmentIds.length > 0)
        await db.roleScope.createMany({
          data: departmentIds.map((departmentId) => ({ employeeId, role, departmentId })),
        });
    },
    activeDepartments() {
      return db.department.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    },
    /** Active (non-exited, enabled, unexpired) super admins other than `excludingEmployeeId`. */
    activeSuperAdminCount(excludingEmployeeId?: string) {
      return db.employee.count({
        where: {
          ...(excludingEmployeeId ? { id: { not: excludingEmployeeId } } : {}),
          status: { not: "exited" },
          account: { disabledAt: null },
          roleAssignments: {
            some: { role: "super_admin", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          },
        },
      });
    },
    revokeRole(employeeId: string, role: Role) {
      return db.roleAssignment.deleteMany({ where: { employeeId, role } });
    },
    /** Active HR operators other than `excludingEmployeeId`. */
    activeHrCount(excludingEmployeeId?: string) {
      return db.employee.count({
        where: {
          ...(excludingEmployeeId ? { id: { not: excludingEmployeeId } } : {}),
          status: { not: "exited" },
          account: { disabledAt: null },
          roleAssignments: {
            some: { role: "hr_operator", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          },
        },
      });
    },
    async audit(where: Prisma.AuditLogWhereInput, skip: number) {
      const [items, total, entities, actors] = await Promise.all([
        db.auditLog.findMany({ where, orderBy: { at: "desc" }, skip, take: 50 }),
        db.auditLog.count({ where }),
        db.auditLog.findMany({ distinct: ["entity"], select: { entity: true } }),
        db.employee.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ]);
      return { items, total, entities: entities.map((e) => e.entity), actors };
    },
  };
}
