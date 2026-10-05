import type { Prisma } from "@prisma/client";
import { personRefSelect } from "../../core/people/person-ref.js";
import type { TimeClient } from "../time/time.repository.js";

const entryInclude = {
  employee: { select: { ...personRefSelect, departmentId: true, managerId: true } },
} satisfies Prisma.AttLogEntryInclude;

export type AttLogRow = Prisma.AttLogEntryGetPayload<{ include: typeof entryInclude }>;

/** All Prisma access of the attendance-log module. Takes the client or the command's transaction. */
export function createAttendanceLogRepository(db: TimeClient) {
  return {
    insert: (data: Prisma.AttLogEntryUncheckedCreateInput) => db.attLogEntry.create({ data, include: entryInclude }),
    byId: (id: string) => db.attLogEntry.findUnique({ where: { id }, include: entryInclude }),
    list: (where: Prisma.AttLogEntryWhereInput, take = 500) =>
      db.attLogEntry.findMany({ where, include: entryInclude, orderBy: { serverTimestamp: "desc" }, take }),
    /** Latest successful log with a position, for the impossible-travel check. */
    previousPositioned: (employeeId: string) =>
      db.attLogEntry.findFirst({
        where: { employeeId, status: "success", latitude: { not: null }, longitude: { not: null } },
        orderBy: { positionTimestamp: "desc" },
      }),
    device: (employeeId: string) => db.attLogDevice.findUnique({ where: { employeeId } }),
    registerDevice: (employeeId: string, deviceId: string) =>
      db.attLogDevice.create({ data: { employeeId, deviceId } }),
    seenDevice: async (employeeId: string, deviceId: string) =>
      (await db.attLogEntry.count({ where: { employeeId, deviceId } })) > 0,
    /** Live (not retention-deleted) selfie files among these ids. */
    liveFiles: async (ids: string[]) =>
      new Set(
        ids.length
          ? (
              await db.storedFile.findMany({
                where: { id: { in: ids }, deletedAt: null },
                select: { id: true },
              })
            ).map((f) => f.id)
          : [],
      ),
    /** HR operators whose grant reaches this department (organization-wide or scoped to it). */
    hrRecipients: async (departmentId: string) =>
      (
        await db.roleAssignment.findMany({
          where: {
            role: "hr_operator",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            AND: [{ OR: [{ departments: { none: {} } }, { departments: { some: { departmentId } } }] }],
            employee: { status: { not: "exited" } },
          },
          select: { employeeId: true },
        })
      ).map((a) => a.employeeId),
    expiredSelfies: (purpose: string, before: Date, take: number) =>
      db.storedFile.findMany({
        where: { purpose, deletedAt: null, createdAt: { lt: before } },
        select: { id: true, storageKey: true },
        take,
      }),
    markFileDeleted: (id: string) => db.storedFile.update({ where: { id }, data: { deletedAt: new Date() } }),
  };
}
export type AttendanceLogRepository = ReturnType<typeof createAttendanceLogRepository>;
