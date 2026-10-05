import { EmploymentStatus, Role } from "@prisma/client";
import { hashPassword } from "../../src/core/security/hashing.js";
import { fromIsoDate } from "../../src/utils/date.js";
import type { SeedContext } from "./context.js";

interface MockDepartment {
  name: string;
  costCenter: string | null;
  headId: string | null;
}

interface MockNotification {
  id: string;
  employeeId: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  read: boolean;
  kind: string;
}

const locationStates: Record<string, string | null> = {
  "Noida HQ": "Uttar Pradesh",
  Gurugram: "Haryana",
  Mumbai: "Maharashtra",
  Remote: null,
};

/** Same derivation as the frontend mock (`lib/mocks/handlers/employees.ts`): first.last@domain. */
function mockEmail(name: string, domain: string): string {
  const [first = "", ...rest] = name.toLowerCase().split(" ");
  return `${first}.${rest.at(-1) ?? ""}@${domain}`;
}

/** Organization, departments, locations, the 43 synthetic employees, their accounts, roles and notifications. */
export default async function seedCore(ctx: SeedContext): Promise<void> {
  const { prisma, data } = ctx;
  const config = data.config as { departments: MockDepartment[]; locations: string[]; probationDefaults: unknown };

  await prisma.organization.upsert({
    where: { id: 1 },
    create: { id: 1, ...data.organization },
    update: data.organization,
  });
  await prisma.organizationSetting.upsert({
    where: { key: "probation_defaults" },
    create: { key: "probation_defaults", value: config.probationDefaults as object },
    update: {},
  });

  await prisma.department.createMany({
    data: config.departments.map((department) => ({
      id: ctx.departmentId(department.name),
      name: department.name,
      costCenter: department.costCenter,
      headEmployeeId: department.headId,
    })),
    skipDuplicates: true,
  });
  await prisma.location.createMany({
    data: config.locations.map((name) => ({ id: ctx.locationId(name), name, state: locationStates[name] ?? null })),
    skipDuplicates: true,
  });

  // Managers first is not required: the FK is checked per statement, so insert without managers, then link.
  await prisma.employee.createMany({
    data: data.employees.map((employee) => ({
      id: employee.id,
      code: employee.code,
      name: employee.name,
      workEmail: mockEmail(employee.name, data.organization.emailDomain),
      designation: employee.designation,
      departmentId: ctx.departmentId(employee.department),
      locationId: ctx.locationId(employee.location),
      joinedOn: fromIsoDate(employee.joinedOn),
      status: employee.status,
      employmentType: employee.type,
    })),
    skipDuplicates: true,
  });
  for (const employee of data.employees)
    if (employee.managerId)
      await prisma.employee.update({ where: { id: employee.id }, data: { managerId: employee.managerId } });

  const maxNumber = Math.max(...data.employees.map((employee) => Number(employee.id.slice(4))));
  await prisma.counter.upsert({
    where: { name: "employee" },
    create: { name: "employee", value: maxNumber },
    update: { value: maxNumber },
  });

  // Roles: personas keep exactly their mock roles; everyone else is an employee, plus manager if they have reports.
  const personaRoles = new Map(Object.values(data.personas).map((persona) => [persona.employeeId, persona.roles]));
  const managers = new Set(data.employees.map((employee) => employee.managerId).filter(Boolean));
  await prisma.roleAssignment.createMany({
    data: data.employees.flatMap((employee) => {
      const roles =
        personaRoles.get(employee.id) ?? (managers.has(employee.id) ? ["employee", "manager"] : ["employee"]);
      return roles.map((role) => ({ employeeId: employee.id, role: role as Role, reason: "Development seed" }));
    }),
    skipDuplicates: true,
  });

  // Development sign-in: every non-exited employee gets an account with DEV_SEED_PASSWORD (never in production).
  const devPassword = process.env.DEV_SEED_PASSWORD;
  if (devPassword) {
    if (process.env.NODE_ENV === "production") throw new Error("DEV_SEED_PASSWORD must not be used in production.");
    const passwordHash = await hashPassword(devPassword);
    const active = data.employees.filter((employee) => employee.status !== EmploymentStatus.exited);
    await prisma.userAccount.createMany({ data: active.map(({ id }) => ({ employeeId: id })), skipDuplicates: true });
    await prisma.passwordCredential.createMany({
      data: active.map(({ id }) => ({ employeeId: id, passwordHash })),
      skipDuplicates: true,
    });
    ctx.log(`${active.length} development sign-ins (password: DEV_SEED_PASSWORD in .env)`);
  } else ctx.log("DEV_SEED_PASSWORD not set: no sign-in credentials created");

  const notifications = data.notifications as MockNotification[];
  await prisma.notification.createMany({
    data: notifications.map((notification) => ({
      id: notification.id,
      employeeId: notification.employeeId,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      createdAt: ctx.shiftInstant(notification.createdAt),
      readAt: notification.read ? ctx.shiftInstant(notification.createdAt) : null,
    })),
    skipDuplicates: true,
  });

  ctx.log(
    `${data.employees.length} employees, ${config.departments.length} departments, ${config.locations.length} locations`,
  );
}
