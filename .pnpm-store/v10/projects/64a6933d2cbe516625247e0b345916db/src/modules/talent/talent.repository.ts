import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { idempotent } from "../../core/database/idempotency.js";
import { employeeCodeFor, nextEmployeeId, nextReference, newId } from "../../core/database/ids.js";
import type { TransactionClient } from "../../core/database/transaction.js";
import { NotFoundError, ConflictError } from "../../core/errors/index.js";
import { assertVersion } from "../../core/http/request-context.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import { todayInOrgZone } from "../../utils/date.js";
import { createPayrollRepository } from "../payroll/payroll.repository.js";
import { createTimeRepository } from "../time/time.repository.js";
import { createWorkspaceRepository } from "../workspace/workspace.repository.js";

export type TalentDomain = "lifecycle" | "recruitment" | "performance";
export interface RecordScope {
  ownerId?: string | null;
  parentId?: string;
  state?: string;
}
export function talentRepository(db: TransactionClient, domain: TalentDomain) {
  return {
    workspace() {
      return createWorkspaceRepository(db);
    },
    payroll() {
      return createPayrollRepository(db);
    },
    time() {
      return createTimeRepository(db);
    },
    async list<T>(kind: string, schema: z.ZodType<T>, scope: RecordScope = {}): Promise<T[]> {
      const rows = await db.talentRecord.findMany({ where: { domain, kind, ...scope }, orderBy: { createdAt: "asc" } });
      return rows.map((row) => schema.parse(row.data));
    },
    async get<T>(id: string, kind: string, schema: z.ZodType<T>): Promise<T> {
      const row = await db.talentRecord.findFirst({ where: { id, domain, kind } });
      if (!row) throw new NotFoundError("This record was not found.", "RECORD_NOT_FOUND");
      return schema.parse(row.data);
    },
    async save<T>(kind: string, schema: z.ZodType<T>, value: T, scope: RecordScope = {}, expected?: number) {
      const data = schema.parse(value);
      const id = z.object({ id: z.string() }).parse(data).id;
      const current = await db.talentRecord.findFirst({ where: { id, domain, kind } });
      if (current) assertVersion(current.version, expected);
      const json = JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
      await db.talentRecord.upsert({
        where: { id },
        create: { id, domain, kind, ...scope, data: json },
        update: { ...scope, data: json, version: { increment: 1 } },
      });
      return data;
    },
    async remove(id: string, kind: string) {
      const result = await db.talentRecord.deleteMany({ where: { id, domain, kind } });
      if (!result.count) throw new NotFoundError("This record was not found.", "RECORD_NOT_FOUND");
    },
    people() {
      return db.employee.findMany({
        include: { department: true, location: true, manager: true },
        orderBy: { name: "asc" },
      });
    },
    async person(id: string) {
      const person = await db.employee.findUnique({
        where: { id },
        include: { department: true, location: true, manager: true },
      });
      if (!person) throw new NotFoundError("Employee was not found.", "EMPLOYEE_NOT_FOUND");
      return person;
    },
    departments() {
      return db.department.findMany({ where: { archivedAt: null } });
    },
    locations() {
      return db.location.findMany({ where: { archivedAt: null } });
    },
    organization() {
      return db.organization.findFirst();
    },
    async setting(key: string): Promise<unknown> {
      return (await db.organizationSetting.findUnique({ where: { key } }))?.value;
    },
    saveSetting(key: string, value: Prisma.InputJsonValue) {
      return db.organizationSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    },
    async setEmployment(id: string, status: "notice" | "exited" | "active", exitedOn?: string) {
      await db.employee.update({
        where: { id },
        data: { status, ...(exitedOn ? { exitedOn: new Date(exitedOn) } : {}), version: { increment: 1 } },
      });
      if (status === "exited")
        await db.userAccount.updateMany({ where: { employeeId: id }, data: { disabledAt: new Date() } });
    },
    async convertEmployee(input: {
      name: string;
      designation: string;
      department: string;
      location: string;
      managerId: string;
      joinedOn: string;
      employmentType: "full_time" | "contract" | "intern";
    }) {
      const organization = await db.organization.findFirst();
      const department = await db.department.findFirst({ where: { name: input.department, archivedAt: null } });
      const location = await db.location.findFirst({ where: { name: input.location, archivedAt: null } });
      if (!organization || !department || !location)
        throw new ConflictError(
          "ORGANIZATION_NOT_CONFIGURED",
          "Configure the organization, department and location first.",
        );
      const id = await nextEmployeeId(db);
      const code = employeeCodeFor(id);
      await db.employee.create({
        data: {
          id,
          code,
          name: input.name,
          designation: input.designation,
          departmentId: department.id,
          locationId: location.id,
          managerId: input.managerId,
          joinedOn: new Date(input.joinedOn),
          employmentType: input.employmentType,
          workEmail: `${id}@${organization.emailDomain}`,
          status: "onboarding",
        },
      });
      await db.roleAssignment.create({
        data: { employeeId: id, role: "employee", reason: "Accepted recruitment offer" },
      });
      return { employeeId: id, code };
    },
    reference(prefix: string) {
      return nextReference(db, prefix, todayInOrgZone());
    },
    notify(employeeId: string, title: string, body: string, href: string) {
      return db.notification.create({ data: { id: newId("ntf"), employeeId, kind: "system", title, body, href } });
    },
  };
}
export type TalentRepository = ReturnType<typeof talentRepository>;
export function talentUnitOfWork(prisma: PrismaClient, domain: TalentDomain) {
  return {
    read: talentRepository(prisma, domain),
    command<T>(
      actorId: string | null,
      key: string | undefined,
      action: string,
      work: (repository: TalentRepository) => Promise<T>,
    ): Promise<T> {
      return idempotent(prisma, { actorId: actorId ?? "public", key, command: `${domain}.${action}` }, async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`talent:${domain}`}, 0))`;
        const result = await work(talentRepository(tx, domain));
        const identity = z.object({ id: z.string().optional(), reference: z.string().optional() }).safeParse(result);
        await recordAuditEvent(tx, {
          actorEmployeeId: actorId,
          action: `${domain}.${action}`,
          entity: domain,
          entityId: identity.success ? (identity.data.id ?? identity.data.reference ?? action) : action,
          details: {},
        });
        return result;
      });
    },
  };
}
