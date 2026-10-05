import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  announcementSchema,
  documentSchema,
  ticketDetailSchema,
  ticketCategorySchema,
} from "../../contracts/workplace.js";
import { announcementInputSchema } from "../../contracts/admin.js";
import {
  celebrationSettingsSchema,
  companyEventSchema,
  departmentInputSchema,
  eventInputSchema,
  probationDefaultsSchema,
  employeeJobInputSchema,
} from "../../contracts/hr-config.js";
import { employeeDetailSchema, employmentEventSchema } from "../../contracts/employee.js";
import { sessionSchema } from "../../contracts/session.js";
import { newId } from "../../core/database/ids.js";
import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../core/errors/index.js";
import { assertVersion } from "../../core/http/request-context.js";
import { personRef, photoUrlFor } from "../../core/people/person-ref.js";
import { requireCapability, type AuthenticatedActor } from "../../core/security/actor.js";
import {
  assertEmployeeInScope,
  departmentInScope,
  employeeIdsInScope,
  hasAdministrativeReach,
  requireOrgWide,
} from "../../core/security/scope.js";
import { managesAudience, requireAudience, requireManagedRecord } from "./workspace.access.js";
import { toIsoDate, todayInOrgZone } from "../../utils/date.js";
import { createWorkspaceRepository, workspaceCommand } from "./workspace.repository.js";
import { privateProfileSchema, type CommandContext } from "./workspace.schema.js";
import type { TicketInput } from "../../contracts/workplace.js";

export const helpdeskCategories = [
  { id: "hr", name: "HR & People", confidential: false, description: "Employment, benefits and workplace support." },
  { id: "payroll", name: "Payroll", confidential: true, description: "Private salary and payment questions." },
  { id: "it", name: "IT Support", confidential: false, description: "Devices, accounts and workplace technology." },
  {
    id: "grievance",
    name: "Confidential concern",
    confidential: true,
    description: "Visible only to you and authorized HR.",
  },
];

export function createWorkspaceService(prisma: PrismaClient) {
  const repo = createWorkspaceRepository(prisma);
  const command = <T>(
    actor: AuthenticatedActor,
    action: string,
    id: string,
    context: CommandContext,
    work: Parameters<typeof workspaceCommand<T>>[6],
  ) => workspaceCommand(prisma, actor, action, id, context.key, context.requestId, work);
  /** HR helpdesk reach over a ticket's requester: the `helpdesk.queue` grant must cover their department. */
  const handlesTicket = async (actor: AuthenticatedActor, ownerId: string | null): Promise<boolean> =>
    ownerId !== null &&
    hasAdministrativeReach(actor, "helpdesk.queue") &&
    (await employeeIdsInScope(prisma, actor, "helpdesk.queue", [ownerId])).has(ownerId);
  const service = {
    async session(actor: AuthenticatedActor) {
      const [employee, organization, notifications] = await Promise.all([
        repo.employee(actor.employeeId),
        repo.organization(),
        repo.notifications(actor.employeeId),
      ]);
      return sessionSchema.parse({
        userId: employee.id,
        employeeId: employee.id,
        displayName: employee.name,
        firstName: employee.name.split(" ")[0],
        ...personRef(employee),
        roles: actor.roles,
        capabilities: actor.capabilities,
        department: employee.department.name,
        organization,
        unreadNotifications: notifications.filter((n) => !n.readAt).length,
        source: "live",
      });
    },
    async employee(actor: AuthenticatedActor, id: string) {
      const employee = await repo.employee(id);
      const self = id === actor.employeeId;
      // HR reach applies only inside the operator's departments (BE-003); elsewhere they see the colleague view.
      const hr = departmentInScope(actor, "employee.update", employee.departmentId);
      const hrRead = hr || departmentInScope(actor, "employee.read", employee.departmentId);
      const manager = employee.managerId === actor.employeeId;
      if (!self && !hrRead && employee.status === "exited") throw new NotFoundError();
      const history = self || hrRead || manager;
      const [organization, profile, timeline, assignment, exit] = await Promise.all([
        repo.organization(),
        self || hr ? repo.get(`profile:${id}`) : null,
        history ? repo.list("employment_event", { ownerId: id }) : [],
        repo.get(`assignment:${id}`),
        history ? repo.get(`exit:${id}`) : null,
      ]);
      const probation = z
        .object({
          months: z.number(),
          endsOn: z.string().nullable(),
          status: z.enum(["none", "on_probation", "confirmed"]),
        })
        .safeParse(assignment?.data);
      return employeeDetailSchema.parse({
        ...personRef(employee),
        code: employee.code,
        workEmail: employee.workEmail,
        department: employee.department.name,
        location: employee.location.name,
        status: employee.status,
        joinedOn: toIsoDate(employee.joinedOn),
        employmentType: employee.employmentType,
        legalEntity: organization.legalEntity,
        costCenter: employee.department.costCenter ?? "",
        workPhone: null,
        manager: employee.manager ? personRef(employee.manager) : null,
        directReports: employee.directReports.filter((e) => e.status !== "exited").map(personRef),
        timeline: timeline.map((r) => employmentEventSchema.parse(r.data)),
        privateProfile: self || hr ? privateProfileSchema.parse(profile?.data ?? {}) : null,
        version: employee.version,
        exit: exit?.data ?? null,
        probation: probation.success ? probation.data : { months: 0, endsOn: null, status: "none" },
        permissions: { canEdit: hr, canViewPrivate: self || hr, canRequestChange: self },
      });
    },
    async orgChart() {
      const employees = await repo.employees();
      function descendants(id: string, visited = new Set<string>()): number {
        if (visited.has(id)) return 0;
        visited.add(id);
        return employees.filter((e) => e.managerId === id).reduce((n, e) => n + 1 + descendants(e.id, visited), 0);
      }
      return employees.map((e) => ({
        person: personRef(e),
        managerId: e.managerId,
        department: e.department.name,
        location: e.location.name,
        code: e.code,
        directCount: employees.filter((c) => c.managerId === e.id).length,
        totalCount: descendants(e.id),
      }));
    },
    async directory(actor: AuthenticatedActor, id: string) {
      const e = await repo.employee(id);
      if (
        e.status === "exited" &&
        id !== actor.employeeId &&
        !departmentInScope(actor, "employee.read", e.departmentId)
      )
        throw new NotFoundError();
      return {
        person: personRef(e),
        code: e.code,
        department: e.department.name,
        location: e.location.name,
        workEmail: e.workEmail,
        workPhone: null,
        manager: e.manager ? personRef(e.manager) : null,
        joinedOn: toIsoDate(e.joinedOn),
        starred: Boolean(await repo.get(`star:${actor.employeeId}:${id}`)),
      };
    },
    async stars(actor: AuthenticatedActor) {
      return (await repo.list("star", { ownerId: actor.employeeId })).map((r) => r.parentId);
    },
    star(actor: AuthenticatedActor, id: string, context: CommandContext) {
      return command(actor, "people.star", `star:${actor.employeeId}:${id}`, context, async (r) => {
        await r.employee(id);
        const key = `star:${actor.employeeId}:${id}`;
        if (await r.get(key)) {
          await r.remove(key);
          return { starred: false };
        }
        await r.create({ id: key, kind: "star", ownerId: actor.employeeId, parentId: id, data: {} });
        return { starred: true };
      });
    },
    assignment(
      actor: AuthenticatedActor,
      id: string,
      input: z.infer<typeof employeeJobInputSchema>,
      context: CommandContext,
    ) {
      requireCapability(actor, "employee.update");
      return command(actor, "employee.assignment", id, context, async (r, tx) => {
        await assertEmployeeInScope(tx, actor, "employee.update", id);
        const employee = await r.employee(id);
        assertVersion(employee.version, context.version ?? input.expectedVersion);
        const [department, location, employees] = await Promise.all([
          r.department(input.department),
          r.location(input.location),
          r.employees(),
        ]);
        if (!department || department.archivedAt || !location || location.archivedAt)
          throw new ValidationError("INVALID_REFERENCE", "Select active department and location.");
        if (!departmentInScope(actor, "employee.update", department.id))
          throw new AuthorizationError(
            "Moving people to this department needs organization-wide access.",
            "ORG_WIDE_ACCESS_REQUIRED",
          );
        let managerId: string | null = input.managerId || null;
        const visited = new Set([id]);
        while (managerId) {
          if (visited.has(managerId))
            throw new ConflictError("MANAGER_CYCLE", "A reporting relationship cannot contain a cycle.");
          visited.add(managerId);
          const manager = employees.find((e) => e.id === managerId);
          if (!manager) throw new ValidationError("INVALID_MANAGER", "Choose an active manager.");
          managerId = manager.managerId;
        }
        if (input.effectiveOn > todayInOrgZone())
          throw new ValidationError("FUTURE_ASSIGNMENT", "Use an effective date on or before today.");
        await r.updateEmployee(id, employee.version, {
          designation: input.designation,
          departmentId: department.id,
          locationId: location.id,
          managerId: input.managerId || null,
          employmentType: input.type,
        });
        const end = new Date(employee.joinedOn);
        end.setUTCMonth(end.getUTCMonth() + input.probationMonths);
        await r.upsert(`assignment:${id}`, "assignment", id, {
          months: input.probationMonths,
          endsOn: input.probationMonths ? toIsoDate(end) : null,
          status: input.probationMonths ? "on_probation" : "none",
        });
        const eventId = newId("job");
        await r.create({
          id: eventId,
          kind: "employment_event",
          ownerId: id,
          data: {
            id: eventId,
            kind: "job_change",
            title: input.designation,
            detail: input.reason,
            effectiveOn: input.effectiveOn,
            recordedOn: todayInOrgZone(),
          },
        });
        return { id, version: employee.version + 1 };
      });
    },
    async organization(actor: AuthenticatedActor) {
      requireOrgWide(actor, "policy.publish");
      const [departments, locations, employees, probation] = await Promise.all([
        repo.departments(),
        repo.locations(),
        repo.employees(),
        repo.setting("probation_defaults"),
      ]);
      return {
        departments: departments.map((d) => {
          const head = employees.find((e) => e.id === d.headEmployeeId);
          return {
            name: d.name,
            costCenter: d.costCenter ?? "",
            head: head ? personRef(head) : null,
            headcount: d._count.employees,
          };
        }),
        locations: locations.map((l) => ({ name: l.name, headcount: l._count.employees })),
        probationDefaults: probationDefaultsSchema.parse(probation?.value ?? { full_time: 0, contract: 0, intern: 0 }),
      };
    },
    department(
      actor: AuthenticatedActor,
      input: z.infer<typeof departmentInputSchema>,
      originalName: string | undefined,
      context: CommandContext,
    ) {
      requireOrgWide(actor, "policy.publish");
      return command(actor, "organization.department", originalName ?? input.name, context, async (r) => {
        if (input.headId) await r.employee(input.headId);
        const original = originalName ? await r.department(originalName) : null;
        if (originalName && !original) throw new NotFoundError();
        await r.saveDepartment(original?.id ?? newId("dep"), {
          name: input.name,
          costCenter: input.costCenter,
          headEmployeeId: input.headId || null,
        });
        return { name: input.name };
      });
    },
    location(actor: AuthenticatedActor, name: string, context: CommandContext) {
      requireOrgWide(actor, "policy.publish");
      return command(actor, "organization.location", name, context, async (r) => {
        await r.saveLocation(newId("loc"), name);
        return { name };
      });
    },
    removeOrganizationItem(
      actor: AuthenticatedActor,
      kind: "department" | "location",
      name: string,
      context: CommandContext,
    ) {
      requireOrgWide(actor, "policy.publish");
      return command(actor, `organization.${kind}.archive`, name, context, async (r) => {
        const row = kind === "department" ? await r.department(name) : await r.location(name);
        if (!row) throw new NotFoundError();
        const assigned = await r.employees(kind === "department" ? { departmentId: row.id } : { locationId: row.id });
        if (assigned.length) throw new ConflictError("IN_USE", "Move assigned employees before archiving this record.");
        if (kind === "department") await r.archiveDepartment(row.id);
        else await r.archiveLocation(row.id);
        return { ok: true };
      });
    },
    async celebrations() {
      return celebrationSettingsSchema.parse(
        (await repo.setting("celebrations"))?.value ?? {
          showWorkAnniversaries: true,
          showNewJoiners: true,
          showBirthdays: false,
        },
      );
    },
    setting(actor: AuthenticatedActor, key: string, data: unknown, context: CommandContext) {
      requireOrgWide(actor, "policy.publish");
      return command(actor, "organization.setting", key, context, async (r) => {
        await r.saveSetting(key, data);
        return { ok: true };
      });
    },
    async events(actor: AuthenticatedActor) {
      const employee = await repo.employee(actor.employeeId);
      const events = (await repo.list("event")).map((r) => companyEventSchema.parse(r.data));
      // Event managers also see events addressed to the departments they manage (all of them when org-wide).
      const visible = await Promise.all(
        events.map(
          async (e) =>
            e.audience === "Everyone" ||
            e.audience === employee.department.name ||
            (hasAdministrativeReach(actor, "event.manage") &&
              (await managesAudience(repo, actor, "event.manage", e.audience))),
        ),
      );
      return events.filter((_e, index) => visible[index]);
    },
    event(
      actor: AuthenticatedActor,
      input: z.infer<typeof eventInputSchema>,
      id: string | undefined,
      context: CommandContext,
    ) {
      requireCapability(actor, "event.manage");
      return command(actor, "event.save", id ?? "new", context, async (r) => {
        if (id)
          await requireManagedRecord(
            r,
            actor,
            "event.manage",
            companyEventSchema.parse((await r.require(id, "event")).data).audience,
          );
        await requireAudience(r, actor, "event.manage", input.audience);
        const key = id ?? newId("evt");
        await r.upsert(key, "event", actor.employeeId, {
          ...input,
          id: key,
          startTime: input.startTime || null,
          endTime: input.endTime || null,
        });
        return { id: key };
      });
    },
    archive(actor: AuthenticatedActor, id: string, kind: "event" | "announcement", context: CommandContext) {
      const capability = kind === "event" ? "event.manage" : "announcement.publish";
      requireCapability(actor, capability);
      return command(actor, `${kind}.archive`, id, context, async (r) => {
        const row = await r.require(id, kind);
        const { audience } = z.object({ audience: z.string().default("Everyone") }).parse(row.data);
        await requireManagedRecord(r, actor, capability, audience);
        await r.update(id, row.data, row.version, "archived");
        return { ok: true };
      });
    },
    async announcements(actor: AuthenticatedActor, view: string | undefined) {
      if (view === "admin") {
        requireCapability(actor, "announcement.publish");
        if (!hasAdministrativeReach(actor, "announcement.publish"))
          throw new AuthorizationError("You don't have access to this.");
      }
      const employee = await repo.employee(actor.employeeId);
      const rows = (await repo.list("announcement"))
        .map((r) => announcementSchema.parse(r.data))
        .map((a) => ({ ...a, status: new Date(a.publishedAt) > new Date() ? "scheduled" : "published" }));
      // Admin view: only announcements addressed to the operator's departments (everything when organization-wide).
      const visible = await Promise.all(
        rows.map(async (a) =>
          view === "admin"
            ? managesAudience(repo, actor, "announcement.publish", a.audience)
            : a.status === "published" && (a.audience === "Everyone" || a.audience === employee.department.name),
        ),
      );
      return rows.filter((_a, index) => visible[index]);
    },
    announcement(
      actor: AuthenticatedActor,
      input: z.infer<typeof announcementInputSchema>,
      id: string | undefined,
      context: CommandContext,
    ) {
      requireCapability(actor, "announcement.publish");
      return command(actor, "announcement.save", id ?? "new", context, async (r) => {
        if (id)
          await requireManagedRecord(
            r,
            actor,
            "announcement.publish",
            announcementSchema.parse((await r.require(id, "announcement")).data).audience,
          );
        if (input.audience !== "Everyone" && !(await r.department(input.audience)))
          throw new ValidationError("INVALID_AUDIENCE", "Choose an existing department.");
        await requireAudience(r, actor, "announcement.publish", input.audience);
        const key = id ?? newId("ann");
        const publishedAt = input.publishAt ? new Date(`${input.publishAt}:00+05:30`) : new Date();
        if (!Number.isFinite(publishedAt.getTime()))
          throw new ValidationError("INVALID_DATE", "Choose a valid publication time.");
        const scheduled = publishedAt > new Date();
        const author = (await r.employee(actor.employeeId)).name;
        await r.upsert(key, "announcement", actor.employeeId, {
          ...input,
          id: key,
          author,
          publishedAt: publishedAt.toISOString(),
          status: scheduled ? "scheduled" : "published",
        });
        return { id: key, scheduled };
      });
    },
    async ticketCategories() {
      const configured = await repo.setting("ticket_categories");
      return z.array(ticketCategorySchema).parse(configured?.value ?? helpdeskCategories);
    },
    async tickets(actor: AuthenticatedActor, scope: string | undefined) {
      if (scope !== "queue")
        return (await repo.list("ticket", { ownerId: actor.employeeId })).map((r) => ticketDetailSchema.parse(r.data));
      requireCapability(actor, "helpdesk.queue");
      if (!hasAdministrativeReach(actor, "helpdesk.queue"))
        throw new AuthorizationError("You don't have access to this.");
      // The HR queue holds only tickets raised by employees inside the operator's departments (BE-003).
      const rows = await repo.list("ticket");
      const owners = await employeeIdsInScope(
        prisma,
        actor,
        "helpdesk.queue",
        rows.flatMap((r) => (r.ownerId ? [r.ownerId] : [])),
      );
      return rows.filter((r) => r.ownerId && owners.has(r.ownerId)).map((r) => ticketDetailSchema.parse(r.data));
    },
    async ticket(actor: AuthenticatedActor, id: string) {
      const row = await repo.require(id, "ticket");
      const hr = await handlesTicket(actor, row.ownerId);
      if (row.ownerId !== actor.employeeId && !hr) throw new NotFoundError();
      const dto = ticketDetailSchema.parse(row.data);
      return {
        ...dto,
        viewerIsHr: hr,
        canReply: dto.state !== "closed",
        canClose: dto.state !== "closed",
      };
    },
    async createTicket(actor: AuthenticatedActor, input: TicketInput, context: CommandContext) {
      requireCapability(actor, "helpdesk.request.self");
      const category = (await service.ticketCategories()).find((c) => c.id === input.categoryId);
      if (!category) throw new ValidationError("INVALID_CATEGORY", "Choose an available category.");
      return command(actor, "helpdesk.create", actor.employeeId, context, async (r) => {
        const id = newId("tkt");
        const at = new Date().toISOString();
        const reference = `HD-${id.slice(-8).toUpperCase()}`;
        const requester = personRef(await r.employee(actor.employeeId));
        await r.create({
          id,
          kind: "ticket",
          ownerId: actor.employeeId,
          state: "open",
          data: {
            ...input,
            id,
            reference,
            category: category.name,
            confidential: category.confidential,
            state: "open",
            createdAt: at,
            updatedAt: at,
            assignee: null,
            lastMessage: input.description,
            requester,
            messages: [],
            canReply: true,
            canClose: true,
            viewerIsHr: false,
          },
        });
        return { reference, confidential: category.confidential };
      });
    },
    ticketCommand(actor: AuthenticatedActor, id: string, body: string | null, context: CommandContext) {
      return command(actor, body === null ? "helpdesk.close" : "helpdesk.reply", id, context, async (r) => {
        const row = await r.require(id, "ticket");
        const hr = await handlesTicket(actor, row.ownerId);
        if (row.ownerId !== actor.employeeId && !hr) throw new NotFoundError();
        const dto = ticketDetailSchema.parse(row.data);
        if (dto.state === "closed") throw new ConflictError("TICKET_CLOSED", "This ticket is already closed.");
        const at = new Date().toISOString();
        const fromHr = hr && row.ownerId !== actor.employeeId;
        if (body !== null)
          dto.messages.push({ id: newId("msg"), author: (await r.employee(actor.employeeId)).name, fromHr, body, at });
        const state = body === null ? "closed" : fromHr ? "awaiting_you" : "open";
        await r.update(id, { ...dto, state, updatedAt: at, lastMessage: body ?? dto.lastMessage }, row.version, state);
        return { ok: true };
      });
    },
    async documents(actor: AuthenticatedActor) {
      return (await repo.list("document", { ownerId: actor.employeeId })).map((r) => documentSchema.parse(r.data));
    },
    async documentContent(actor: AuthenticatedActor, id: string) {
      const row = await repo.require(id, "document");
      if (row.ownerId !== actor.employeeId) throw new NotFoundError();
      if (row.state !== "clean")
        throw new AppError(409, "DOCUMENT_NOT_READY", "The document has not passed its security scan.");
      const file = await repo.file(row.id);
      if (!file) throw new NotFoundError();
      return file;
    },
    upload(
      actor: AuthenticatedActor,
      input: { name: string; category: string; mime: string; sizeBytes: number },
      context: CommandContext,
    ) {
      requireCapability(actor, "document.upload");
      return command(actor, "document.upload", actor.employeeId, context, async (r) => {
        const id = newId("doc");
        await r.create({
          id,
          kind: "document",
          ownerId: actor.employeeId,
          state: "awaiting_upload",
          data: {
            ...input,
            id,
            uploadedAt: new Date().toISOString(),
            uploadedBy: (await r.employee(actor.employeeId)).name,
            scanState: "scanning",
          },
        });
        return { documentId: id, scanState: "scanning" };
      });
    },
    fileContent(
      actor: AuthenticatedActor,
      id: string,
      bytes: Uint8Array<ArrayBuffer>,
      mime: string,
      context: CommandContext,
    ) {
      requireCapability(actor, "document.upload");
      return command(actor, "document.content", id, context, async (r) => {
        const row = await r.require(id, "document");
        if (row.ownerId !== actor.employeeId) throw new NotFoundError();
        const dto = documentSchema.parse(row.data);
        if (row.state !== "awaiting_upload")
          throw new ConflictError("UPLOAD_CLOSED", "This upload has already been submitted.");
        if (bytes.byteLength !== dto.sizeBytes || mime !== dto.mime)
          throw new ValidationError("INVALID_FILE", "Uploaded content must match its declared size and media type.");
        validateFile(bytes, mime);
        await r.saveFile(id, actor.employeeId, mime, bytes, createHash("sha256").update(bytes).digest("hex"));
        await r.update(id, dto, row.version, "scanning");
        return { documentId: id, scanState: "scanning" };
      });
    },
    async photo(actor: AuthenticatedActor, id: string) {
      await service.directory(actor, id);
      const file = await repo.file(`photo:${id}`);
      if (!file) throw new NotFoundError("Photo not found.");
      return file;
    },
    photoUpdate(
      actor: AuthenticatedActor,
      file: { bytes: Uint8Array<ArrayBuffer>; mime: string } | null,
      context: CommandContext,
    ) {
      requireCapability(actor, "profile.change.request");
      return command(actor, "profile.photo", actor.employeeId, context, async (r) => {
        const employee = await r.employee(actor.employeeId);
        if (file) {
          if (!file.mime.startsWith("image/")) throw new ValidationError("INVALID_FILE", "Choose a PNG or JPEG photo.");
          validateFile(file.bytes, file.mime);
          await r.saveFile(
            `photo:${actor.employeeId}`,
            actor.employeeId,
            file.mime,
            file.bytes,
            createHash("sha256").update(file.bytes).digest("hex"),
          );
        } else await r.deleteFile(`photo:${actor.employeeId}`);
        const version = file ? (employee.photoVersion ?? 0) + 1 : null;
        await r.photoVersion(actor.employeeId, version);
        return { photoUrl: photoUrlFor(actor.employeeId, version) };
      });
    },
  };
  return service;
}
export type WorkspaceService = ReturnType<typeof createWorkspaceService>;

export function validateFile(bytes: Uint8Array, mime: string): void {
  if (bytes.length < 8 || bytes.length > 10 * 1024 * 1024)
    throw new ValidationError("INVALID_FILE_SIZE", "Files must be between 8 bytes and 10 MB.");
  const header = Buffer.from(bytes.subarray(0, 8));
  const valid =
    mime === "application/pdf"
      ? header.subarray(0, 5).toString() === "%PDF-"
      : mime === "image/png"
        ? header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === "image/jpeg" && header[0] === 255 && header[1] === 216 && header[2] === 255;
  if (!valid) throw new ValidationError("INVALID_FILE_TYPE", "The content does not match the selected file type.");
}
