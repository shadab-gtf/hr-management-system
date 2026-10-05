import { EmploymentStatus, type EmploymentType, type Prisma } from "@prisma/client";
import type { TransactionClient } from "../../core/database/transaction.js";
import { cursorArgs } from "../../utils/pagination.js";

const directoryInclude = {
  department: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeInclude;

export type DirectoryEmployee = Prisma.EmployeeGetPayload<{ include: typeof directoryInclude }>;

export interface DirectoryFilters {
  q?: string | undefined;
  department?: string | undefined;
  location?: string | undefined;
  status?: EmploymentStatus | undefined;
  includeExited: boolean;
}

export interface NewEmployee {
  id: string;
  code: string;
  name: string;
  workEmail: string;
  designation: string;
  departmentId: string;
  locationId: string;
  managerId: string;
  joinedOn: Date;
  employmentType: EmploymentType;
}

const notArchived = { archivedAt: null } as const;
const notExited = { status: { not: EmploymentStatus.exited } } as const;

/** `db` is the Prisma client, or a transaction client for writes that must commit together. */
export function createEmployeeRepository(db: TransactionClient) {
  return {
    async listDirectory(filters: DirectoryFilters, page: { cursor?: string | undefined; limit: number }) {
      const { q, department, location, status } = filters;
      const where: Prisma.EmployeeWhereInput = {
        ...(department ? { department: { name: department } } : {}),
        ...(location ? { location: { name: location } } : {}),
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { code: { contains: q, mode: "insensitive" } },
                { designation: { contains: q, mode: "insensitive" } },
                { department: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
        ...(filters.includeExited ? {} : notExited),
      };
      const [rows, total] = await Promise.all([
        db.employee.findMany({
          where,
          include: directoryInclude,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          ...cursorArgs(page.cursor, page.limit),
        }),
        db.employee.count({ where }),
      ]);
      return { rows, total };
    },

    async activeDepartmentNames(): Promise<string[]> {
      const rows = await db.department.findMany({
        where: notArchived,
        select: { name: true },
        orderBy: { name: "asc" },
      });
      return rows.map(({ name }) => name);
    },

    async activeLocationNames(): Promise<string[]> {
      const rows = await db.location.findMany({ where: notArchived, select: { name: true }, orderBy: { name: "asc" } });
      return rows.map(({ name }) => name);
    },

    activeEmployeesForPicker() {
      return db.employee.findMany({
        where: notExited,
        select: { id: true, name: true, designation: true },
        orderBy: { name: "asc" },
      });
    },

    async organizationSetting(key: string): Promise<unknown> {
      const setting = await db.organizationSetting.findUnique({ where: { key }, select: { value: true } });
      return setting?.value;
    },

    findActiveDepartmentByName(name: string) {
      return db.department.findFirst({ where: { name, ...notArchived }, select: { id: true } });
    },

    findActiveLocationByName(name: string) {
      return db.location.findFirst({ where: { name, ...notArchived }, select: { id: true } });
    },

    findActiveEmployee(id: string) {
      return db.employee.findFirst({ where: { id, ...notExited }, select: { id: true } });
    },

    create(employee: NewEmployee) {
      return db.employee.create({ data: employee, select: { id: true, code: true, workEmail: true } });
    },

    grantRole(employeeId: string, role: "employee", reason: string) {
      return db.roleAssignment.create({ data: { employeeId, role, reason } });
    },
  };
}
