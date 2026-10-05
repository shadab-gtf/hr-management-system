import type { Prisma, PrismaClient } from "@prisma/client";
import type { TransactionClient } from "../../core/database/transaction.js";
import { idempotent } from "../../core/database/idempotency.js";
import { nextReference, newId } from "../../core/database/ids.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import { todayInOrgZone } from "../../utils/date.js";

export type TimeClient = PrismaClient | TransactionClient;
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function createTimeRepository(db: TimeClient) {
  return {
    workspaceRequests: (ownerId: string) =>
      db.workspaceRecord.findMany({
        where: { ownerId, kind: { in: ["ticket", "profile_change"] } },
        orderBy: { createdAt: "desc" },
      }),
    talentRequests: (ownerId: string) =>
      db.talentRecord.findMany({
        where: { ownerId, kind: { in: ["letter_request", "resignation", "asset_request"] } },
        orderBy: { createdAt: "desc" },
      }),
    loans: (employeeId: string) => db.payLoan.findMany({ where: { employeeId }, orderBy: { requestedAt: "desc" } }),
    salary: (employeeId: string) =>
      db.payCompensation.findFirst({
        where: { employeeId, effectiveFrom: { lte: new Date(`${todayInOrgZone()}T00:00:00Z`) } },
        orderBy: { effectiveFrom: "desc" },
      }),
    talentQueue: (kinds: string[], ownerIds?: string[]) =>
      db.talentRecord.findMany({ where: { kind: { in: kinds }, ...(ownerIds ? { ownerId: { in: ownerIds } } : {}) } }),
    employee: (id: string) =>
      db.employee.findUnique({ where: { id }, include: { department: true, location: true, manager: true } }),
    people: (where: Prisma.EmployeeWhereInput = {}) =>
      db.employee.findMany({
        where: { status: { not: "exited" }, ...where },
        include: { department: true, location: true },
        orderBy: { name: "asc" },
      }),
    departments: () => db.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    roleAssignments: (employeeId: string) =>
      db.roleAssignment.findMany({
        where: { employeeId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      }),
    workflows: (where: Prisma.TimeWorkflowWhereInput = {}) =>
      db.timeWorkflow.findMany({ where, orderBy: { createdAt: "desc" } }),
    workflow: (id: string) => db.timeWorkflow.findUnique({ where: { id } }),
    createWorkflow: (data: Prisma.TimeWorkflowCreateInput) => db.timeWorkflow.create({ data }),
    updateWorkflow: (id: string, data: Prisma.TimeWorkflowUpdateInput) =>
      db.timeWorkflow.update({ where: { id }, data }),
    document: (id: string) => db.timeDocument.findUnique({ where: { id } }),
    documents: (kind: string, scope?: string) =>
      db.timeDocument.findMany({ where: { kind, ...(scope === undefined ? {} : { scope }) }, orderBy: { id: "asc" } }),
    saveDocument: (id: string, kind: string, payload: unknown, scope?: string) =>
      db.timeDocument.upsert({
        where: { id },
        create: { id, kind, payload: json(payload), scope: scope ?? null },
        update: { payload: json(payload), version: { increment: 1 }, ...(scope === undefined ? {} : { scope }) },
      }),
    deleteDocument: (id: string) => db.timeDocument.delete({ where: { id } }),
    attendance: (employeeId: string, date: string) =>
      db.timeAttendance.findUnique({ where: { employeeId_date: { employeeId, date } } }),
    attendanceDays: (employeeId: string, from: string, to: string) =>
      db.timeAttendance.findMany({ where: { employeeId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } }),
    attendanceBatch: (employeeIds: string[], from: string, to: string) =>
      db.timeAttendance.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: from, lte: to } } }),
    insertAttendanceBatch: (data: Prisma.TimeAttendanceCreateManyInput[]) => db.timeAttendance.createMany({ data }),
    saveAttendance: (
      employeeId: string,
      date: string,
      data: Omit<Prisma.TimeAttendanceUncheckedCreateInput, "employeeId" | "date" | "id">,
    ) =>
      db.timeAttendance.upsert({
        where: { employeeId_date: { employeeId, date } },
        create: { id: newId("att"), employeeId, date, ...data },
        update: data,
      }),
    ledger: (employeeId: string, leaveTypeId?: string) =>
      db.timeLeaveLedger.findMany({
        where: { employeeId, ...(leaveTypeId ? { leaveTypeId } : {}) },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
    addLedger: (data: Prisma.TimeLeaveLedgerCreateInput) => db.timeLeaveLedger.create({ data }),
    ensureLedger: (data: Prisma.TimeLeaveLedgerCreateInput) =>
      db.timeLeaveLedger.upsert({
        where: {
          employeeId_leaveTypeId_kind_reference: {
            employeeId: data.employeeId,
            leaveTypeId: data.leaveTypeId,
            kind: data.kind,
            reference: data.reference,
          },
        },
        create: data,
        update: {},
      }),
    audit: (entityId: string) => db.auditLog.findMany({ where: { entityId }, orderBy: { at: "asc" } }),
    notify: (employeeId: string, title: string, body: string, href: string) =>
      db.notification.create({ data: { id: newId("ntf"), employeeId, kind: "approval", title, body, href } }),
    organizationSetting: (key: string) => db.organizationSetting.findUnique({ where: { key } }),
    lock: async (key: string) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`time:${key}`}, 0))`;
    },
  };
}
export type TimeRepository = ReturnType<typeof createTimeRepository>;
export interface CommandContext {
  actor: AuthenticatedActor;
  requestId: string;
  key?: string | undefined;
  version?: number | undefined;
}

/** One transaction for row locks, business mutation, audit and idempotency result. */
export function timeCommand<T>(
  prisma: PrismaClient,
  ctx: CommandContext,
  command: string,
  work: (repo: TimeRepository, reference: (prefix: string) => Promise<string>) => Promise<T>,
): Promise<T> {
  return idempotent(prisma, { actorId: ctx.actor.employeeId, key: ctx.key, command }, async (tx) => {
    const repo = createTimeRepository(tx);
    await repo.lock("workflows");
    const result = await work(repo, (prefix) => nextReference(tx, prefix, todayInOrgZone()));
    await recordAuditEvent(tx, {
      actorEmployeeId: ctx.actor.employeeId,
      action: command,
      entity: "time",
      entityId:
        typeof result === "object" && result !== null && "reference" in result ? String(result.reference) : command,
      requestId: ctx.requestId,
      details: { command },
    });
    return result;
  });
}
