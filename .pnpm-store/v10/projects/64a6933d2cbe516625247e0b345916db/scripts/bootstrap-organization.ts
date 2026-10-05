/** Initializes a new organization without importing demo employees or granting accounts. */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { attendanceRulesSchema, shiftInputSchema } from "../src/contracts/hr-config.js";

const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const schema = z
  .object({
    organization: z
      .object({
        name: text(120),
        legalEntity: text(160),
        payGroup: text(120),
        timezone: text(60).refine((value) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: value });
            return true;
          } catch {
            return false;
          }
        }, "Use a valid IANA timezone."),
        currency: z.string().regex(/^[A-Z]{3}$/),
        emailDomain: z
          .string()
          .toLowerCase()
          .regex(/^(?=.{1,120}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/),
      })
      .strict(),
    departments: z
      .array(z.object({ id, name: text(60), costCenter: text(80).nullable().default(null) }).strict())
      .min(1)
      .max(1000),
    locations: z
      .array(z.object({ id, name: text(60), state: text(80).nullable().default(null) }).strict())
      .min(1)
      .max(1000),
    initialShift: shiftInputSchema,
    probationDefaults: z
      .object({
        full_time: z.number().int().min(0).max(6),
        contract: z.number().int().min(0).max(6),
        intern: z.number().int().min(0).max(6),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const key of ["departments", "locations"] as const) {
      for (const field of ["id", "name"] as const) {
        if (new Set(value[key].map((row) => row[field].toLowerCase())).size !== value[key].length)
          context.addIssue({ code: "custom", path: [key], message: `Duplicate ${field}.` });
      }
    }
  });

const path = process.argv[2];
if (!path || process.argv.length !== 3) throw new Error("Usage: pnpm bootstrap:organization path/to/organization.json");
const raw = readFileSync(path, "utf8");
if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) throw new Error("Organization JSON exceeds 1 MiB.");
const parsed = schema.safeParse(JSON.parse(raw) as unknown);
if (!parsed.success)
  throw new Error(
    `Invalid organization configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
  );
const input = parsed.data;
const prisma = new PrismaClient();
try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('identity:bootstrap'))`;
    if ((await tx.organization.count()) || (await tx.employee.count()))
      throw new Error("Organization already initialized. Use authenticated configuration APIs for changes.");
    await tx.organization.create({ data: { id: 1, ...input.organization } });
    await tx.department.createMany({ data: input.departments });
    await tx.location.createMany({ data: input.locations });
    await tx.organizationSetting.create({ data: { key: "probation_defaults", value: input.probationDefaults } });
    const shift = { ...input.initialShift, id: "initial-shift" };
    const rules = attendanceRulesSchema.parse({
      shifts: [shift],
      defaultShiftId: shift.id,
      departmentShifts: [],
      sites: [],
      overtime: {
        enabled: false,
        startsAfterMinutes: 0,
        blockMinutes: 30,
        dailyCapMinutes: 120,
        compensation: "comp_off",
        requiresApproval: true,
      },
      lateEarly: { enabled: false, earlyGraceMinutes: 0, marksPerHalfDay: 3, countEarlyGoing: false },
    });
    await tx.timeDocument.create({ data: { id: "attendance_rules", kind: "attendance_rules", payload: rules } });
    await tx.auditLog.create({
      data: {
        action: "organization.bootstrapped",
        entity: "organization",
        entityId: "1",
        details: { departments: input.departments.length, locations: input.locations.length },
      },
    });
  });
  console.info("Organization initialized. Provision the first HR operator with bootstrap:hr.");
} finally {
  await prisma.$disconnect();
}
