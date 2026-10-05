import type { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { config } from "../../config/index.js";
import { employeeCodeFor, nextEmployeeId } from "../../core/database/ids.js";
import { idempotent } from "../../core/database/idempotency.js";
import { newId } from "../../core/database/ids.js";
import { queueEmail } from "../../core/mail/outbox.js";
import { createIdentityRepository } from "../identity/identity.repository.js";
import { createWorkspaceRepository } from "../workspace/workspace.repository.js";
import { createTimeRepository } from "../time/time.repository.js";
import { createPayrollRepository } from "../payroll/payroll.repository.js";
import { provisionLeaveEntitlements } from "../time/time.service.js";
import { AppError } from "../../core/errors/AppError.js";
import type { AuthenticatedActor } from "../../core/security/actor.js";
import { fromIsoDate, toIsoDate, todayInOrgZone } from "../../utils/date.js";
import { DIRECTORY_STATUS_FILTERS } from "../../utils/constants.js";
import { toCursorPage } from "../../utils/pagination.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import { createEmployeeRepository, type DirectoryEmployee } from "./employee.repository.js";
import { probationDefaultsSchema, type CreateEmployeeInput, type ListEmployeesQuery } from "./employee.schema.js";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isHrOperator(actor: AuthenticatedActor): boolean {
  return actor.roles.includes("hr_operator");
}

/** Directory card. Employment status and join date are HR-only fields. */
function toEmployeeDto(employee: DirectoryEmployee, canReadHrFields: boolean) {
  return {
    id: employee.id,
    code: employee.code,
    name: employee.name,
    initials: initials(employee.name),
    photoUrl: null,
    designation: employee.designation,
    department: employee.department.name,
    location: employee.location.name,
    workEmail: employee.workEmail,
    ...(canReadHrFields ? { status: employee.status, joinedOn: toIsoDate(employee.joinedOn) } : {}),
  };
}

export function createEmployeeService(prisma: PrismaClient) {
  const repository = createEmployeeRepository(prisma);

  return {
    async listDirectory(actor: AuthenticatedActor, query: ListEmployeesQuery, requestId: string) {
      const isHr = isHrOperator(actor);
      const { rows, total } = await repository.listDirectory(
        {
          q: query.q,
          department: query.department,
          location: query.location,
          status: isHr ? query.status : undefined,
          includeExited: isHr,
        },
        { cursor: query.cursor, limit: query.limit },
      );
      const page = toCursorPage(rows, query.limit);
      return {
        data: page.items.map((employee) => toEmployeeDto(employee, isHr)),
        meta: { requestId, hasMore: page.hasMore, total, nextCursor: page.nextCursor },
      };
    },

    async facets(actor: AuthenticatedActor) {
      const [departments, locations] = await Promise.all([
        repository.activeDepartmentNames(),
        repository.activeLocationNames(),
      ]);
      return { departments, locations, statuses: isHrOperator(actor) ? [...DIRECTORY_STATUS_FILTERS] : [] };
    },

    async formOptions() {
      const [departments, locations, managers, probationSetting] = await Promise.all([
        repository.activeDepartmentNames(),
        repository.activeLocationNames(),
        repository.activeEmployeesForPicker(),
        repository.organizationSetting("probation_defaults"),
      ]);
      const probationDefaults = probationDefaultsSchema.safeParse(probationSetting);
      if (!probationDefaults.success)
        throw new AppError(503, "CONFIGURATION_UNAVAILABLE", "HR probation defaults are not configured.");

      return {
        departments,
        locations,
        managers: managers.map((manager) => ({ ...manager, initials: initials(manager.name), photoUrl: null })),
        today: todayInOrgZone(),
        probationDefaults: probationDefaults.data,
      };
    },

    /** Creates the employee, base role and audit row in one transaction. */
    create(actor: AuthenticatedActor, input: CreateEmployeeInput, requestId: string, key?: string) {
      return idempotent(prisma, { actorId: actor.employeeId, key, command: "employee.create" }, async (tx) => {
        const employees = createEmployeeRepository(tx);
        const [department, location, manager] = await Promise.all([
          employees.findActiveDepartmentByName(input.department),
          employees.findActiveLocationByName(input.location),
          employees.findActiveEmployee(input.managerId),
        ]);
        if (!department || !location || !manager)
          throw new AppError(422, "INVALID_REFERENCE", "Select an active department, location, and manager.");

        const id = await nextEmployeeId(tx);
        const employee = await employees.create({
          id,
          code: employeeCodeFor(id),
          name: input.name,
          workEmail: input.workEmail,
          designation: input.designation,
          departmentId: department.id,
          locationId: location.id,
          managerId: manager.id,
          joinedOn: fromIsoDate(input.joinedOn),
          employmentType: input.type,
        });
        await employees.grantRole(employee.id, "employee", "Initial account role");
        const workspace = createWorkspaceRepository(tx);
        const defaults = probationDefaultsSchema.parse(await employees.organizationSetting("probation_defaults"));
        const months = typeof input.probationMonths === "number" ? input.probationMonths : defaults[input.type];
        const endsOn = fromIsoDate(input.joinedOn);
        endsOn.setUTCMonth(endsOn.getUTCMonth() + months);
        await workspace.upsert(`assignment:${employee.id}`, "assignment", employee.id, {
          months,
          endsOn: months ? toIsoDate(endsOn) : null,
          status: months ? "on_probation" : "none",
        });
        await provisionLeaveEntitlements(createTimeRepository(tx), employee.id, todayInOrgZone().slice(0, 4));
        await createPayrollRepository(tx).ensureProfile(employee.id);
        const identity = createIdentityRepository(tx);
        await identity.accountEnabled(employee.id, false);
        const token = randomBytes(32).toString("base64url");
        const linkId = newId("lnk");
        const expiresAt = new Date(Date.now() + 86400000);
        await identity.createLink({
          id: linkId,
          employeeId: employee.id,
          kind: "invite",
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt,
        });
        const link = new URL("/auth/set-password", config.appBaseUrl);
        link.searchParams.set("ref", linkId);
        link.searchParams.set("token_hash", token);
        link.searchParams.set("type", "invite");
        await queueEmail(tx, {
          to: employee.workEmail,
          template: "invite",
          subject: "Set up your HR account",
          text: `Set your password using this single-use link before ${expiresAt.toISOString()}: ${link.toString()}`,
        });
        await recordAuditEvent(tx, {
          actorEmployeeId: actor.employeeId,
          action: "employee.created",
          entity: "employee",
          entityId: employee.id,
          requestId,
          details: {
            createdFields: ["name", "workEmail", "designation", "department", "location", "joinedOn", "type"],
          },
        });
        return { ...employee, inviteDelivery: config.mail.smtpUrl ? ("queued" as const) : ("not_configured" as const) };
      });
    },
  };
}

export type EmployeeService = ReturnType<typeof createEmployeeService>;
