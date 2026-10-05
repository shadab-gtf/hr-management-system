import type { Prisma } from "@prisma/client";
import type { PayDb } from "../payroll/payroll.repository.js";
export function createReportsRepository(db: PayDb) {
  return {
    setting: (key: string) => db.organizationSetting.findUnique({ where: { key } }),
    saved: () => db.reportSaved.findMany({ orderBy: { updatedAt: "desc" } }),
    savedById: (id: string) => db.reportSaved.findUnique({ where: { id } }),
    create: (data: Prisma.ReportSavedCreateInput) => db.reportSaved.create({ data }),
    update: (id: string, data: Prisma.ReportSavedUpdateInput) =>
      db.reportSaved.update({ where: { id }, data: { ...data, version: { increment: 1 } } }),
    remove: (id: string) => db.reportSaved.delete({ where: { id } }),
    exports: () => db.reportExport.findMany({ orderBy: { at: "desc" }, take: 200 }),
    export: (data: Prisma.ReportExportCreateInput) => db.reportExport.create({ data }),
    deliveries: () => db.reportDelivery.findMany({ orderBy: { at: "desc" }, take: 200 }),
    delivery: (data: Prisma.ReportDeliveryCreateInput) => db.reportDelivery.create({ data }),
    download: (id: string) => db.reportDelivery.findUnique({ where: { id } }),
    due: (now: Date) =>
      db.reportSaved.findMany({ where: { nextRunAt: { lte: now } }, orderBy: { nextRunAt: "asc" }, take: 20 }),
    roles: (employeeId: string) =>
      db.roleAssignment.findMany({
        where: { employeeId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        include: { departments: { select: { departmentId: true } } },
      }),
    attendance: (from: string, to: string) => db.timeAttendance.findMany({ where: { date: { gte: from, lte: to } } }),
    workflows: (kind: string) => db.timeWorkflow.findMany({ where: { kind } }),
    ledger: () => db.timeLeaveLedger.findMany(),
    timeDocuments: (kind: string) => db.timeDocument.findMany({ where: { kind } }),
  };
}
export type ReportsRepository = ReturnType<typeof createReportsRepository>;
