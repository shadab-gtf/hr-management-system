/** Offline, audited deployment provisioning. This command never seeds demo identities or rates. */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { createPrismaClient } from "../src/core/database/prisma.js";
import { newId } from "../src/core/database/ids.js";
import { encrypt } from "../src/core/security/encryption.js";
import { capabilitiesFor } from "../src/core/security/capabilities.js";
import { fromIsoDate } from "../src/utils/date.js";
import { paiseFromAmount } from "../src/utils/money.js";
import { policySchema, templateTermsSchema } from "../src/modules/payroll/payroll.schema.js";
import { digest } from "../src/modules/payroll/payroll.rules.js";
import { recordAuditEvent } from "../src/modules/audit-logs/audit.repository.js";

const employeeId = z.string().min(1).max(32);
const inputSchema = z
  .object({
    preparedBy: employeeId,
    approvedBy: employeeId,
    reason: z.string().trim().min(10).max(300),
    expectedSettingsVersion: z.number().int().nonnegative(),
    policy: policySchema.optional(),
    templates: z.array(z.object({ id: z.string().min(1).max(40), terms: templateTermsSchema })).default([]),
    profiles: z
      .array(
        z.object({
          employeeId,
          entityId: z.string().min(1).max(40),
          state: z.string().min(1).max(8),
          pan: z
            .string()
            .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
            .optional(),
          uan: z
            .string()
            .regex(/^\d{12}$/)
            .optional(),
          pfMemberId: z.string().max(40).optional(),
          esiIp: z
            .string()
            .regex(/^\d{10}$/)
            .optional(),
          bankName: z.string().max(120).optional(),
          accountNumber: z
            .string()
            .regex(/^\d{8,20}$/)
            .optional(),
          ifsc: z
            .string()
            .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/)
            .optional(),
        }),
      )
      .max(5000)
      .default([]),
    openingCompensation: z
      .array(
        z.object({
          employeeId,
          effectiveFrom: z.iso.date(),
          annualCtc: z.string().regex(/^[1-9]\d{0,9}(\.\d{1,2})?$/),
          reference: z.string().min(1).max(60),
        }),
      )
      .max(5000)
      .default([]),
  })
  .strict();

const filename = process.argv[2];
if (!filename || process.argv.length !== 3)
  throw new Error("Usage: pnpm exec tsx scripts/payroll-provision.ts <reviewed-file.json>");
const content = await readFile(resolve(filename), "utf8");
if (Buffer.byteLength(content) > 5 * 1024 * 1024) throw new Error("Provisioning input exceeds 5 MiB.");
const parsed = inputSchema.safeParse(JSON.parse(content) as unknown);
if (!parsed.success)
  throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
const input = parsed.data;
if (input.preparedBy === input.approvedBy)
  throw new Error("A different Finance approver must review this provisioning file.");
const prisma = createPrismaClient();
try {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('pay:provision', 0))`;
      const actors = await tx.employee.findMany({
        where: { id: { in: [input.preparedBy, input.approvedBy] }, status: { not: "exited" } },
        include: {
          account: true,
          roleAssignments: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
        },
      });
      const preparer = actors.find((actor) => actor.id === input.preparedBy);
      const approver = actors.find((actor) => actor.id === input.approvedBy);
      if (
        !preparer ||
        preparer.account?.disabledAt ||
        !capabilitiesFor(preparer.roleAssignments.map((row) => row.role)).includes("payroll.prepare")
      )
        throw new Error("Prepared-by employee must be an active Payroll operator.");
      if (
        !approver ||
        approver.account?.disabledAt ||
        !capabilitiesFor(approver.roleAssignments.map((row) => row.role)).includes("payroll.approve")
      )
        throw new Error("Approved-by employee must be an active Finance approver.");
      const existing = await tx.payConfiguration.findUnique({ where: { id: 1 } });
      if ((existing?.version ?? 0) !== input.expectedSettingsVersion)
        throw new Error("Payroll settings changed; review the current configuration before applying this file.");
      const policy = policySchema.parse(input.policy ?? existing?.settings);
      if (input.policy && !input.policy.approvedForProduction)
        throw new Error(
          "Provision an independently reviewed policy with approvedForProduction=true; demo policies are not accepted.",
        );
      for (const regime of [policy.tax.old, policy.tax.new]) {
        if (
          regime.slabs.at(-1)?.upToPaise !== null ||
          regime.slabs.some(
            (slab, index) =>
              index < regime.slabs.length - 1 &&
              (slab.upToPaise === null || slab.upToPaise <= (regime.slabs[index - 1]?.upToPaise ?? 0)),
          )
        )
          throw new Error("Tax slabs must increase strictly and end with an unlimited slab.");
      }
      const templates = [
        ...new Set([
          ...(await tx.payTemplate.findMany({ select: { id: true } })).map((row) => row.id),
          ...input.templates.map((row) => row.id),
        ]),
      ];
      if (Object.values(policy.assignments).some((id) => !templates.includes(id)))
        throw new Error("A salary assignment refers to an unknown template.");
      const entityIds = new Set(policy.entities.map((row) => row.id));
      if (Object.values(policy.locations).some((row) => !entityIds.has(row.entityId)))
        throw new Error("A location refers to an unknown legal entity.");
      for (const profile of input.profiles) {
        if (!entityIds.has(profile.entityId) || !policy.states[profile.state])
          throw new Error("A payroll profile refers to an unknown entity or state.");
        const { pan, accountNumber } = profile;
        const bankChanged = Boolean(accountNumber || profile.ifsc || profile.bankName);
        const data: Prisma.PayProfileCreateInput = {
          employeeId: profile.employeeId,
          entityId: profile.entityId,
          state: profile.state,
          ...(profile.uan !== undefined ? { uan: profile.uan } : {}),
          ...(profile.pfMemberId !== undefined ? { pfMemberId: profile.pfMemberId } : {}),
          ...(profile.esiIp !== undefined ? { esiIp: profile.esiIp } : {}),
          ...(profile.bankName !== undefined ? { bankName: profile.bankName } : {}),
          ...(profile.ifsc !== undefined ? { ifsc: profile.ifsc } : {}),
          ...(pan ? { pan: encrypt(pan) } : {}),
          ...(accountNumber ? { accountNumber: encrypt(accountNumber) } : {}),
          ...(bankChanged ? { bankStatus: "pending", bankChangedBy: input.preparedBy, bankChangedAt: new Date() } : {}),
        };
        await tx.payProfile.upsert({
          where: { employeeId: profile.employeeId },
          create: data,
          update: { ...data, version: { increment: 1 } },
        });
      }
      for (const template of input.templates)
        await tx.payTemplate.upsert({
          where: { id: template.id },
          create: { id: template.id, terms: template.terms, publishedBy: input.approvedBy },
          update: {
            terms: template.terms,
            publishedBy: input.approvedBy,
            publishedAt: new Date(),
            version: { increment: 1 },
          },
        });
      for (const compensation of input.openingCompensation) {
        if (await tx.payCompensation.count({ where: { employeeId: compensation.employeeId } }))
          throw new Error(
            "Opening compensation is only allowed before an employee has compensation history; use the approved import workflow for revisions.",
          );
        await tx.payCompensation.create({
          data: {
            id: newId("pc"),
            employeeId: compensation.employeeId,
            effectiveFrom: fromIsoDate(compensation.effectiveFrom),
            annualPaise: BigInt(paiseFromAmount(compensation.annualCtc)),
            reason: input.reason,
            reference: compensation.reference,
          },
        });
      }
      if (input.policy)
        await tx.payConfiguration.upsert({
          where: { id: 1 },
          create: { id: 1, settings: policy },
          update: { settings: policy, version: { increment: 1 } },
        });
      await recordAuditEvent(tx, {
        actorEmployeeId: input.approvedBy,
        action: "Payroll deployment provisioned",
        entity: "pay_statutory",
        entityId: "configuration",
        requestId: newId("provision"),
        details: {
          preparedBy: input.preparedBy,
          reason: input.reason,
          fileDigest: digest(input),
          policyChanged: Boolean(input.policy),
          profiles: input.profiles.length,
          templates: input.templates.length,
          openingCompensation: input.openingCompensation.length,
        },
      });
    },
    { timeout: 60000 },
  );
  process.stdout.write("Reviewed payroll provisioning applied; verify pending bank profiles separately in Finance.\n");
} finally {
  await prisma.$disconnect();
}
