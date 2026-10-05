import "dotenv/config";
import { EmploymentStatus, EmploymentType, PrismaClient, Role } from "@prisma/client";
import { z } from "zod";
import { employeeCodeFor, nextEmployeeId } from "../src/core/database/ids.js";
import { hashPassword } from "../src/core/security/hashing.js";

const inputSchema = z.object({
  HR_BOOTSTRAP_CONFIRM: z.literal("true"),
  HR_BOOTSTRAP_NAME: z.string().trim().min(2).max(120),
  HR_BOOTSTRAP_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  HR_BOOTSTRAP_PASSWORD: z.string().min(15).max(128),
  HR_BOOTSTRAP_DEPARTMENT_ID: z.string().min(1),
  HR_BOOTSTRAP_LOCATION_ID: z.string().min(1),
});

const parsed = inputSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `Invalid HR bootstrap configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
  );
}

const prisma = new PrismaClient();

try {
  const input = parsed.data;
  const passwordHash = await hashPassword(input.HR_BOOTSTRAP_PASSWORD);
  const employee = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('identity:bootstrap'))`;
    const [department, location, currentHr, existingEmployee] = await Promise.all([
      tx.department.findFirst({ where: { id: input.HR_BOOTSTRAP_DEPARTMENT_ID, archivedAt: null } }),
      tx.location.findFirst({ where: { id: input.HR_BOOTSTRAP_LOCATION_ID, archivedAt: null } }),
      tx.roleAssignment.findFirst({
        where: {
          role: { in: [Role.super_admin, Role.hr_operator] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      tx.employee.findUnique({ where: { workEmail: input.HR_BOOTSTRAP_EMAIL } }),
    ]);
    if (!department || !location)
      throw new Error("Choose existing active department and location IDs before bootstrapping.");
    if (existingEmployee?.status === EmploymentStatus.exited)
      throw new Error("An exited employee cannot be bootstrapped as the first administrator.");
    if (currentHr)
      throw new Error("An administrator already exists. Grant further access from Access & accounts instead.");

    const newEmployeeId = existingEmployee ? null : await nextEmployeeId(tx);
    const employee =
      existingEmployee ??
      (await tx.employee.create({
        data: {
          id: newEmployeeId ?? "",
          code: employeeCodeFor(newEmployeeId ?? ""),
          name: input.HR_BOOTSTRAP_NAME,
          workEmail: input.HR_BOOTSTRAP_EMAIL,
          designation: "HR Operator",
          departmentId: department.id,
          locationId: location.id,
          joinedOn: new Date(),
          status: EmploymentStatus.active,
          employmentType: EmploymentType.full_time,
        },
      }));

    await tx.userAccount.upsert({
      where: { employeeId: employee.id },
      create: { employeeId: employee.id },
      update: { disabledAt: null },
    });
    await tx.accountSecurity.upsert({
      where: { employeeId: employee.id },
      create: { employeeId: employee.id },
      update: { revokedBefore: new Date() },
    });
    await tx.passwordCredential.upsert({
      where: { employeeId: employee.id },
      create: { employeeId: employee.id, passwordHash },
      update: { passwordHash, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null },
    });
    await tx.roleAssignment.upsert({
      where: { employeeId_role: { employeeId: employee.id, role: Role.employee } },
      create: { employeeId: employee.id, role: Role.employee, reason: "Initial HR bootstrap" },
      update: { reason: "Initial HR bootstrap" },
    });
    await tx.roleAssignment.upsert({
      where: { employeeId_role: { employeeId: employee.id, role: Role.super_admin } },
      create: { employeeId: employee.id, role: Role.super_admin, reason: "Initial administrator bootstrap" },
      update: { reason: "Initial administrator bootstrap", expiresAt: null },
    });
    await tx.auditLog.create({
      data: {
        action: "identity.hr_bootstrapped",
        entity: "employee",
        entityId: employee.id,
        details: { role: "super_admin", bootstrap: true },
      },
    });
    return employee;
  });
  console.info(
    `Super admin provisioned for ${employee.workEmail}. Clear HR_BOOTSTRAP_PASSWORD from the environment now.`,
  );
} finally {
  await prisma.$disconnect();
}
