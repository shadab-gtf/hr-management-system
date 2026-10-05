import { EmploymentStatus, type PrismaClient } from "@prisma/client";

export function createAuthRepository(prisma: PrismaClient) {
  return {
    /** A non-exited employee by work email, with credential state and unexpired roles. */
    findLoginCandidate(email: string) {
      return prisma.employee.findFirst({
        where: { workEmail: email, status: { not: EmploymentStatus.exited } },
        include: {
          account: { select: { disabledAt: true } },
          credential: { select: { passwordHash: true, failedAttempts: true, lockedUntil: true } },
          roleAssignments: {
            where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            select: { role: true },
          },
        },
      });
    },

    async incrementFailedAttempts(employeeId: string): Promise<number> {
      const updated = await prisma.passwordCredential.update({
        where: { employeeId },
        data: { failedAttempts: { increment: 1 } },
        select: { failedAttempts: true },
      });
      return updated.failedAttempts;
    },

    lockAccount(employeeId: string, until: Date) {
      return prisma.passwordCredential.update({
        where: { employeeId },
        data: { failedAttempts: 0, lockedUntil: until },
      });
    },

    clearFailedAttempts(employeeId: string) {
      return prisma.passwordCredential.update({
        where: { employeeId },
        data: { failedAttempts: 0, lockedUntil: null },
      });
    },

    findAccount(employeeId: string) {
      return prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, name: true, workEmail: true },
      });
    },
    signIn(employeeId: string) {
      return prisma.userAccount.update({ where: { employeeId }, data: { lastSignInAt: new Date() } });
    },
    actorRecord(employeeId: string) {
      return prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          status: true,
          account: { select: { disabledAt: true } },
          roleAssignments: {
            where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            select: { role: true, departments: { select: { departmentId: true } } },
          },
        },
      });
    },
    security(employeeId: string) {
      return prisma.accountSecurity.findUnique({ where: { employeeId } });
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
