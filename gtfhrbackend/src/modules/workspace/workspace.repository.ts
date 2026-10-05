import { Prisma, type PrismaClient } from "@prisma/client";
import type { TransactionClient } from "../../core/database/transaction.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import { ConflictError, NotFoundError, PreconditionFailedError } from "../../core/errors/index.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import { decrypt, encrypt } from "../../core/security/encryption.js";

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function createWorkspaceRepository(db: TransactionClient) {
  return {
    lockProfile(employeeId: string) {
      return db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace-profile:${employeeId}`}, 0))`;
    },
    list(kind: string, where: Prisma.WorkspaceRecordWhereInput = {}) {
      return db.workspaceRecord.findMany({
        where: { kind, state: { not: "archived" }, ...where },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    },
    get(id: string) {
      return db.workspaceRecord.findUnique({ where: { id } });
    },
    async require(id: string, kind: string) {
      const row = await db.workspaceRecord.findFirst({ where: { id, kind, state: { not: "archived" } } });
      if (!row) throw new NotFoundError();
      return row;
    },
    create(input: {
      id: string;
      kind: string;
      ownerId?: string | null;
      parentId?: string | null;
      state?: string;
      data: unknown;
    }) {
      return db.workspaceRecord.create({ data: { ...input, data: jsonValue(input.data) } });
    },
    async update(id: string, data: unknown, version?: number, state?: string) {
      const result = await db.workspaceRecord.updateMany({
        where: { id, ...(version === undefined ? {} : { version }) },
        data: { data: jsonValue(data), version: { increment: 1 }, ...(state ? { state } : {}) },
      });
      if (result.count !== 1) throw new PreconditionFailedError();
    },
    upsert(id: string, kind: string, ownerId: string | null, data: unknown) {
      return db.workspaceRecord.upsert({
        where: { id },
        create: { id, kind, ownerId, data: jsonValue(data) },
        update: { data: jsonValue(data), state: "active", version: { increment: 1 } },
      });
    },
    remove(id: string) {
      return db.workspaceRecord.deleteMany({ where: { id } });
    },
    employees(where: Prisma.EmployeeWhereInput = {}) {
      return db.employee.findMany({
        where: { status: { not: "exited" }, ...where },
        include: { department: true, location: true, manager: true },
        orderBy: { name: "asc" },
      });
    },
    async employee(id: string) {
      const employee = await db.employee.findUnique({
        where: { id },
        include: {
          department: true,
          location: true,
          manager: true,
          directReports: true,
          account: true,
          roleAssignments: true,
        },
      });
      if (!employee) throw new NotFoundError("Employee not found.");
      return employee;
    },
    async organization() {
      const row = await db.organization.findFirst();
      if (!row) throw new NotFoundError("Configure the organization before using the workspace.");
      return row;
    },
    setting(key: string) {
      return db.organizationSetting.findUnique({ where: { key } });
    },
    saveSetting(key: string, value: unknown) {
      return db.organizationSetting.upsert({
        where: { key },
        create: { key, value: jsonValue(value) },
        update: { value: jsonValue(value) },
      });
    },
    departments() {
      return db.department.findMany({
        where: { archivedAt: null },
        include: { _count: { select: { employees: { where: { status: { not: "exited" } } } } } },
        orderBy: { name: "asc" },
      });
    },
    locations() {
      return db.location.findMany({
        where: { archivedAt: null },
        include: { _count: { select: { employees: { where: { status: { not: "exited" } } } } } },
        orderBy: { name: "asc" },
      });
    },
    department(name: string) {
      return db.department.findUnique({ where: { name } });
    },
    location(name: string) {
      return db.location.findUnique({ where: { name } });
    },
    saveDepartment(id: string, data: { name: string; costCenter: string; headEmployeeId: string | null }) {
      return db.department.upsert({ where: { id }, create: { id, ...data }, update: data });
    },
    saveLocation(id: string, name: string) {
      return db.location.create({ data: { id, name } });
    },
    archiveDepartment(id: string) {
      return db.department.update({ where: { id }, data: { archivedAt: new Date() } });
    },
    archiveLocation(id: string) {
      return db.location.update({ where: { id }, data: { archivedAt: new Date() } });
    },
    async updateEmployee(id: string, version: number, data: Prisma.EmployeeUncheckedUpdateManyInput) {
      const row = await db.employee.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (row.count !== 1) throw new PreconditionFailedError();
    },
    notifications(employeeId: string) {
      return db.notification.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" }, take: 500 });
    },
    readNotifications(employeeId: string, id?: string) {
      return db.notification.updateMany({ where: { employeeId, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
    },
    file(id: string) {
      return db.privateFile.findUnique({ where: { id } });
    },
    saveFile(id: string, ownerId: string, mime: string, bytes: Uint8Array<ArrayBuffer>, sha256: string) {
      return db.privateFile.upsert({
        where: { id },
        create: { id, ownerId, mime, bytes, sha256 },
        update: { mime, bytes, sha256 },
      });
    },
    deleteFile(id: string) {
      return db.privateFile.deleteMany({ where: { id } });
    },
    photoVersion(id: string, version: number | null) {
      return db.employee.update({ where: { id }, data: { photoVersion: version } });
    },
  };
}
export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;

/** Serialize writes to an aggregate before reading it; retries cannot create duplicate children or lost updates. */
export async function workspaceCommand<T>(
  prisma: PrismaClient,
  actor: AuthenticatedActor,
  action: string,
  entityId: string,
  key: string | undefined,
  requestId: string,
  work: (repository: WorkspaceRepository, tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`workspace:${entityId}`}, 0))`;
      if (key) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`idempotency:${actor.employeeId}:${key}`}, 0))`;
        const prior = await tx.idempotencyKey.findUnique({
          where: { actorId_key: { actorId: actor.employeeId, key } },
        });
        if (prior) {
          if (prior.command !== `${action}:${entityId}`)
            throw new ConflictError("IDEMPOTENCY_KEY_REUSED", "Use a new request key for this action.");
          const saved = prior.response;
          if (saved && typeof saved === "object" && !Array.isArray(saved) && typeof saved.encrypted === "string")
            return JSON.parse(decrypt(saved.encrypted)) as T;
          return saved as T;
        }
      }
      const result = await work(createWorkspaceRepository(tx), tx);
      await recordAuditEvent(tx, {
        actorEmployeeId: actor.employeeId,
        action,
        entity: action.split(".")[0] ?? "workspace",
        entityId,
        requestId,
        details: {},
      });
      if (key)
        await tx.idempotencyKey.create({
          data: {
            actorId: actor.employeeId,
            key,
            command: `${action}:${entityId}`,
            status: 200,
            response: { encrypted: encrypt(JSON.stringify(result)) },
          },
        });
      return result;
    },
    { timeout: 20000 },
  );
}
