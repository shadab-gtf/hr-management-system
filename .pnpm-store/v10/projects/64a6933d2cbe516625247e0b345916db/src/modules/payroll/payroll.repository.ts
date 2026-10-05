import { Prisma, type PrismaClient } from "@prisma/client";
import type { TransactionClient } from "../../core/database/transaction.js";
import { todayInOrgZone } from "../../utils/date.js";
import { decrypt } from "../../core/security/encryption.js";
import type { PayProfile } from "@prisma/client";
import { policySchema } from "./payroll.schema.js";
import { createTimeRepository } from "../time/time.repository.js";

const openedProfile = (row: PayProfile): PayProfile => ({
  ...row,
  pan: row.pan ? decrypt(row.pan) : null,
  accountNumber: row.accountNumber ? decrypt(row.accountNumber) : "",
});

export type PayDb = PrismaClient | TransactionClient;
export const payEmployeeInclude = { department: true, location: true } satisfies Prisma.EmployeeInclude;
export type PayEmployee = Prisma.EmployeeGetPayload<{ include: typeof payEmployeeInclude }>;
export const fullRunInclude = { results: true, inputs: true, holds: true } satisfies Prisma.PayRunInclude;
export type FullRun = Prisma.PayRunGetPayload<{ include: typeof fullRunInclude }>;

export function createPayrollRepository(db: PayDb) {
  const initialProfile = async (employeeId: string) => {
    const [employee, configuration] = await Promise.all([
      db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { location: true } }),
      db.payConfiguration.findUnique({ where: { id: 1 } }),
    ]);
    const parsed = policySchema.safeParse(configuration?.settings);
    const mapping = parsed.success ? parsed.data.locations[employee.location.name] : undefined;
    return { employeeId, entityId: mapping?.entityId ?? "", state: mapping?.state ?? "" };
  };
  return {
    time: createTimeRepository(db),
    ensureProfile: async (employeeId: string) =>
      db.payProfile.upsert({
        where: { employeeId },
        create: await initialProfile(employeeId),
        update: {},
      }),
    upsertBankAccount: async (employeeId: string, encryptedNumber: string, changedBy: string) => {
      decrypt(encryptedNumber);
      const data = {
        accountNumber: encryptedNumber,
        bankStatus: "pending",
        bankChangedBy: changedBy,
        bankChangedAt: new Date(),
      };
      return db.payProfile.upsert({
        where: { employeeId },
        create: { ...(await initialProfile(employeeId)), ...data },
        update: { ...data, version: { increment: 1 } },
      });
    },
    configuration: () => db.payConfiguration.findUnique({ where: { id: 1 } }),
    saveConfiguration: (settings: Prisma.InputJsonValue) =>
      db.payConfiguration.update({ where: { id: 1 }, data: { settings, version: { increment: 1 } } }),
    employees: () => db.employee.findMany({ include: payEmployeeInclude, orderBy: { code: "asc" } }),
    employee: (id: string) => db.employee.findUnique({ where: { id }, include: payEmployeeInclude }),
    profiles: async () => (await db.payProfile.findMany()).map(openedProfile),
    profile: async (employeeId: string) => {
      const row = await db.payProfile.findUnique({ where: { employeeId } });
      return row ? openedProfile(row) : null;
    },
    saveProfile: (employeeId: string, data: Prisma.PayProfileUpdateInput) =>
      db.payProfile.update({ where: { employeeId }, data: { ...data, version: { increment: 1 } } }),
    templates: () => db.payTemplate.findMany({ orderBy: { id: "asc" } }),
    template: (id: string) => db.payTemplate.findUnique({ where: { id } }),
    saveTemplate: (id: string, terms: Prisma.InputJsonValue, publishedBy: string) =>
      db.payTemplate.update({
        where: { id },
        data: { terms, publishedBy, publishedAt: new Date(), version: { increment: 1 } },
      }),
    compensations: (employeeId?: string) =>
      db.payCompensation.findMany({ where: employeeId ? { employeeId } : {}, orderBy: { effectiveFrom: "asc" } }),
    salaryBases: (employeeIds: string[]) =>
      db.payCompensation.findMany({
        where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: new Date(`${todayInOrgZone()}T00:00:00Z`) } },
        orderBy: { effectiveFrom: "desc" },
        distinct: ["employeeId"],
      }),
    createCompensation: (data: Prisma.PayCompensationCreateInput) => db.payCompensation.create({ data }),
    runs: () => db.payRun.findMany({ include: fullRunInclude, orderBy: { month: "desc" } }),
    latestRun: () => db.payRun.findFirst({ include: fullRunInclude, orderBy: { month: "desc" } }),
    run: (id: string) => db.payRun.findUnique({ where: { id }, include: fullRunInclude }),
    runByMonth: (month: string) => db.payRun.findUnique({ where: { month }, include: fullRunInclude }),
    lock: (key: string) => db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pay:${key}`}, 0))`,
    lockProfiles: (employeeIds: string[]) =>
      employeeIds.length
        ? db.$queryRaw(
            Prisma.sql`SELECT "employeeId" FROM pay_profiles WHERE "employeeId" IN (${Prisma.join(employeeIds)}) ORDER BY "employeeId" FOR UPDATE`,
          )
        : Promise.resolve([]),
    createRun: (data: Prisma.PayRunCreateInput) => db.payRun.create({ data }),
    updateRun: (id: string, data: Prisma.PayRunUpdateInput) => db.payRun.update({ where: { id }, data }),
    replaceResults: async (runId: string, data: Prisma.PayResultCreateManyInput[]) => {
      await db.payResult.deleteMany({ where: { runId } });
      return db.payResult.createMany({ data });
    },
    ownResults: (employeeId: string) =>
      db.payResult.findMany({
        where: { employeeId, run: { state: { in: ["published", "paid"] } } },
        include: { run: true },
        orderBy: { run: { month: "desc" } },
      }),
    result: (id: string) => db.payResult.findUnique({ where: { id }, include: { run: true } }),
    addInput: (data: Prisma.PayInputUncheckedCreateInput) => db.payInput.create({ data }),
    removeInput: (id: string) => db.payInput.delete({ where: { id } }),
    addHold: (data: Prisma.PayHoldUncheckedCreateInput) => db.payHold.create({ data }),
    releaseHold: (id: string, releasedBy: string, releaseNote: string) =>
      db.payHold.update({ where: { id }, data: { releasedBy, releaseNote, releasedAt: new Date() } }),
    audit: (entity: string, entityId?: string) =>
      db.auditLog.findMany({
        where: { entity, ...(entityId ? { entityId } : {}) },
        orderBy: { at: "desc" },
        take: 200,
      }),
    declarations: (financialYear: string) => db.payDeclaration.findMany({ where: { financialYear } }),
    declaration: (employeeId: string, financialYear: string) =>
      db.payDeclaration.findUnique({ where: { employeeId_financialYear: { employeeId, financialYear } } }),
    saveDeclaration: (
      employeeId: string,
      financialYear: string,
      data: Omit<Prisma.PayDeclarationUncheckedCreateInput, "employeeId" | "financialYear">,
    ) =>
      db.payDeclaration.upsert({
        where: { employeeId_financialYear: { employeeId, financialYear } },
        create: { employeeId, financialYear, ...data },
        update: { ...data, version: { increment: 1 } },
      }),
    loans: (employeeId?: string) =>
      db.payLoan.findMany({ where: employeeId ? { employeeId } : {}, orderBy: { requestedAt: "desc" } }),
    loan: (id: string) => db.payLoan.findUnique({ where: { id } }),
    addLoan: (data: Prisma.PayLoanCreateInput) => db.payLoan.create({ data }),
    updateLoan: (id: string, data: Prisma.PayLoanUpdateInput) =>
      db.payLoan.update({ where: { id }, data: { ...data, version: { increment: 1 } } }),
    structureChanges: () => db.payStructureChange.findMany({ orderBy: { preparedAt: "desc" } }),
    structureChange: (id: string) => db.payStructureChange.findUnique({ where: { id } }),
    addStructureChange: (data: Prisma.PayStructureChangeCreateInput) => db.payStructureChange.create({ data }),
    updateStructureChange: (id: string, data: Prisma.PayStructureChangeUpdateInput) =>
      db.payStructureChange.update({ where: { id }, data: { ...data, version: { increment: 1 } } }),
    imports: () => db.payImport.findMany({ orderBy: { uploadedAt: "desc" } }),
    import: (id: string) => db.payImport.findUnique({ where: { id } }),
    addImport: (data: Prisma.PayImportCreateInput) => db.payImport.create({ data }),
    updateImport: (id: string, data: Prisma.PayImportUpdateInput) =>
      db.payImport.update({ where: { id }, data: { ...data, version: { increment: 1 } } }),
    challans: () => db.payChallan.findMany({ orderBy: { period: "desc" } }),
    addChallan: (data: Prisma.PayChallanCreateInput) => db.payChallan.create({ data }),
    form16s: (financialYear: string) => db.payForm16.findMany({ where: { financialYear } }),
    saveForm16: (data: Prisma.PayForm16CreateInput) =>
      db.payForm16.upsert({
        where: { employeeId_financialYear: { employeeId: data.employeeId, financialYear: data.financialYear } },
        create: data,
        update: {},
      }),
    encashments: () => db.timeWorkflow.findMany({ where: { kind: "encashment", state: "approved" } }),
    unpaidLeaves: () => db.timeWorkflow.findMany({ where: { kind: "leave", state: "approved" } }),
    leaveTypes: () => db.timeDocument.findMany({ where: { kind: "leave_type" } }),
    paidSettlements: () =>
      db.talentRecord.findMany({ where: { domain: "lifecycle", kind: "settlement", state: "paid" } }),
  };
}
export type PayrollRepository = ReturnType<typeof createPayrollRepository>;
