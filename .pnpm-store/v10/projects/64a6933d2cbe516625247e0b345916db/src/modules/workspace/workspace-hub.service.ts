import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireCapability, type AuthenticatedActor } from "../../core/security/actor.js";
import {
  assertEmployeeInScope,
  departmentInScope,
  employeeIdsInScope,
  hasAdministrativeReach,
  isOrgWide,
} from "../../core/security/scope.js";
import { decrypt, encrypt } from "../../core/security/encryption.js";
import { newId } from "../../core/database/ids.js";
import { personRef } from "../../core/people/person-ref.js";
import { AuthorizationError, ConflictError, ValidationError } from "../../core/errors/index.js";
import { todayInOrgZone, toIsoDate } from "../../utils/date.js";
import { homeInsightsSchema } from "../../contracts/dashboard.js";
import { serviceRequestSchema, type ServiceRequest } from "../../contracts/hr-config.js";
import { createPayrollRepository } from "../payroll/payroll.repository.js";
import { createSalaryService } from "../salary/salary.service.js";
import { createTimeRepository } from "../time/time.repository.js";
import { createLifecycleService } from "../lifecycle/lifecycle.service.js";
import { createWorkspaceRepository, workspaceCommand } from "./workspace.repository.js";
import { createWorkspaceService } from "./workspace.service.js";
import { privateProfileSchema, profileRequestSchema, type CommandContext } from "./workspace.schema.js";
const profileChange = profileRequestSchema.extend({
  reference: z.string(),
  state: z.enum(["pending", "in_progress", "approved", "rejected"]),
  verification: z.enum(["HR", "Finance"]),
  submittedAt: z.string(),
  decisionNote: z.string().nullable(),
});

export function createWorkspaceHubService(prisma: PrismaClient) {
  const repo = createWorkspaceRepository(prisma);
  const pay = createPayrollRepository(prisma);
  const time = createTimeRepository(prisma);
  const workspace = createWorkspaceService(prisma);
  return {
    async home(actor: AuthenticatedActor) {
      const employee = await repo.employee(actor.employeeId);
      // HR / payroll widgets aggregate only over employees inside the caller's scope (BE-003). The team widget is the
      // manager-of-team view (direct reports) and is independent of department scopes.
      const hr = hasAdministrativeReach(actor, "employee.read"),
        helpdesk = hasAdministrativeReach(actor, "helpdesk.queue"),
        manager = actor.roles.includes("manager"),
        payrollCapability = (["payroll.prepare", "payroll.approve"] as const).find((c) =>
          hasAdministrativeReach(actor, c),
        );
      const [employees, events, settings, allTickets, payroll] = await Promise.all([
        repo.employees(),
        workspace.events(actor),
        workspace.celebrations(),
        repo.list("ticket", helpdesk ? {} : { ownerId: actor.employeeId }),
        payrollCapability ? pay.latestRun() : null,
      ]);
      const departmentOf = new Map(employees.map((e) => [e.id, e.departmentId]));
      const inScope = (capability: Parameters<typeof departmentInScope>[1], employeeId: string | null) => {
        if (!employeeId) return false;
        if (isOrgWide(actor, capability)) return true;
        const departmentId = departmentOf.get(employeeId);
        return departmentId !== undefined && departmentInScope(actor, capability, departmentId);
      };
      const tickets = allTickets.filter((t) => t.ownerId === actor.employeeId || inScope("helpdesk.queue", t.ownerId));
      const workforce = hr ? employees.filter((e) => inScope("employee.read", e.id)) : [];
      const today = todayInOrgZone();
      const month = today.slice(0, 7);
      const team = employees.filter((e) => e.managerId === employee.id);
      const teamAttendance = manager ? await Promise.all(team.map((e) => time.attendance(e.id, today))) : [];
      const pending = manager ? await time.workflows({ approverId: actor.employeeId, state: "pending" }) : [];
      const leave = manager
        ? await time.workflows({ kind: "leave", state: "approved", employeeId: { in: team.map((e) => e.id) } })
        : [];
      const onLeave = leave.filter(
        (row) => row.startDate && row.endDate && row.startDate <= today && row.endDate >= today,
      );
      const tasks = tickets
        .filter((t) => t.ownerId === actor.employeeId && t.state === "awaiting_you")
        .map((t) => ({
          id: t.id,
          title: "Reply to helpdesk",
          detail: "Your support request is awaiting your reply.",
          href: `/helpdesk/${t.id}`,
          due: null,
          tone: "info",
        }));
      if (pending.length)
        tasks.push({
          id: "approvals",
          title: "Review team requests",
          detail: `${pending.length} requests await your decision.`,
          href: "/approvals",
          due: null,
          tone: "warning",
        });
      const celebrations = employees.flatMap((e) => {
        const joined = toIsoDate(e.joinedOn);
        if (settings.showNewJoiners && joined.slice(0, 7) === month)
          return [{ person: personRef(e), kind: "new_joiner", date: joined, detail: "Joined this month" }];
        if (settings.showWorkAnniversaries && joined.slice(5) === today.slice(5) && joined < today)
          return [
            {
              person: personRef(e),
              kind: "work_anniversary",
              date: today,
              detail: `${Number(today.slice(0, 4)) - Number(joined.slice(0, 4))} years with the organization`,
            },
          ];
        return [];
      });
      return homeInsightsSchema.parse({
        tasks,
        celebrations,
        events: events.filter((e) => e.date >= today).slice(0, 10),
        team: manager
          ? {
              size: team.length,
              checkedIn: teamAttendance.filter((a) => a?.firstIn).length,
              onLeave: new Set(onLeave.map((l) => l.employeeId)).size,
              pendingApprovals: pending.length,
            }
          : null,
        workforce: hr
          ? {
              headcount: workforce.length,
              joinersThisMonth: workforce.filter((e) => toIsoDate(e.joinedOn).startsWith(month)).length,
              onNotice: workforce.filter((e) => e.status === "notice").length,
              openTickets: tickets.filter(
                (t) => inScope("helpdesk.queue", t.ownerId) && t.state !== "closed" && t.state !== "resolved",
              ).length,
              byDepartment: [...new Set(workforce.map((e) => e.department.name))].map((name) => ({
                name,
                count: workforce.filter((e) => e.department.name === name).length,
              })),
            }
          : null,
        payroll: payroll
          ? {
              runId: payroll.id,
              periodLabel: new Date(`${payroll.month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }),
              state: payroll.state,
              employeeCount: payrollCapability
                ? payroll.results.filter((r) => inScope(payrollCapability, r.employeeId)).length
                : 0,
            }
          : null,
      });
    },
    profileRequest(actor: AuthenticatedActor, input: z.infer<typeof profileRequestSchema>, context: CommandContext) {
      requireCapability(actor, "profile.change.request");
      if (input.field === "personalEmail" && !z.email().safeParse(input.value).success)
        throw new ValidationError("INVALID_EMAIL", "Enter a valid personal email address.");
      if (input.field === "bankAccount" && !/^\d{8,20}$/.test(input.value))
        throw new ValidationError("INVALID_BANK_ACCOUNT", "Enter an account number of 8 to 20 digits.");
      return workspaceCommand(
        prisma,
        actor,
        "profile.change_request",
        actor.employeeId,
        context.key,
        context.requestId,
        async (r) => {
          const pending = await r.list("profile_change", {
            ownerId: actor.employeeId,
            state: { in: ["pending", "in_progress"] },
          });
          if (pending.some((p) => profileChange.parse(p.data).field === input.field))
            throw new ConflictError("REQUEST_PENDING", "A change for this field is already awaiting verification.");
          const id = newId("prf");
          const reference = `PR-${id.slice(-8).toUpperCase()}`;
          const verification = input.field === "bankAccount" ? "Finance" : "HR";
          await r.create({
            id,
            kind: "profile_change",
            ownerId: actor.employeeId,
            state: "pending",
            data: {
              ...input,
              value: input.field === "bankAccount" ? encrypt(input.value) : input.value,
              reference,
              verification,
              state: "pending",
              submittedAt: new Date().toISOString(),
              decisionNote: null,
            },
          });
          return { reference, state: "pending", verification };
        },
      );
    },
    async requests(actor: AuthenticatedActor, view: string | undefined): Promise<ServiceRequest[]> {
      const hr = hasAdministrativeReach(actor, "employee.update"),
        finance = hasAdministrativeReach(actor, "loan.approve");
      if (!hr && !finance) throw new AuthorizationError("HR or Finance access is required.");
      const requests: ServiceRequest[] = [];
      // Each verifier sees only requests from employees inside their grant's departments (BE-003).
      for (const row of await repo.list("profile_change")) {
        const data = profileChange.parse(row.data);
        if (!row.ownerId) continue;
        const capability = data.verification === "Finance" ? "loan.approve" : "employee.update";
        const requester = await repo.employee(row.ownerId);
        if (!departmentInScope(actor, capability, requester.departmentId)) continue;
        requests.push({
          id: row.id,
          kind: "profile_change",
          reference: data.reference,
          requester: personRef(requester),
          title: `Update ${data.field}`,
          detail: "Personal profile change",
          proposed: data.field === "bankAccount" ? "Bank account change (protected)" : data.value,
          reason: data.reason,
          submittedAt: data.submittedAt,
          state: data.state,
          verifier: data.verification,
          decisionNote: data.decisionNote,
        });
      }
      if (hr && hasAdministrativeReach(actor, "letter.issue")) {
        const letters = z.array(serviceRequestSchema).parse(
          await createLifecycleService(prisma).read("letter_queue", {
            actor,
            params: {},
            query: { view: view ?? "open" },
            version: undefined,
            key: undefined,
          }),
        );
        const allowed = await employeeIdsInScope(
          prisma,
          actor,
          "letter.issue",
          letters.map((l) => l.requester.id),
        );
        requests.push(...letters.filter((l) => allowed.has(l.requester.id)));
      }
      if (finance) {
        const loans = await pay.loans();
        const allowed = await employeeIdsInScope(
          prisma,
          actor,
          "loan.approve",
          loans.map((l) => l.employeeId),
        );
        for (const loan of loans.filter((l) => allowed.has(l.employeeId)))
          requests.push({
            id: loan.id,
            kind: "loan",
            reference: loan.reference,
            requester: personRef(await repo.employee(loan.employeeId)),
            title: loan.type.replace(/_/g, " "),
            detail: `${(Number(loan.principalPaise) / 100).toFixed(2)} INR over ${loan.tenureMonths} months`,
            proposed: null,
            reason: loan.reason,
            submittedAt: loan.requestedAt.toISOString(),
            state: loan.state === "requested" ? "pending" : loan.state === "rejected" ? "rejected" : "approved",
            verifier: "Finance",
            decisionNote: loan.decisionNote,
          });
      }
      return requests.filter((r) =>
        view === "closed" ? ["approved", "rejected"].includes(r.state) : ["pending", "in_progress"].includes(r.state),
      );
    },
    async decide(
      actor: AuthenticatedActor,
      id: string,
      kind: string,
      decision: "approve" | "reject" | "start",
      note: string,
      context: CommandContext,
    ) {
      if (decision === "reject" && note.trim().length < 3)
        throw new ValidationError("REASON_REQUIRED", "Provide a rejection reason.");
      if (kind === "loan") {
        if (decision === "start") throw new ValidationError("INVALID_DECISION", "Choose approve or reject for a loan.");
        return createSalaryService(prisma).decideLoan(
          actor,
          id,
          decision,
          note,
          context.version,
          context.key,
          context.requestId,
        );
      }
      if (kind === "letter")
        return createLifecycleService(prisma).command(
          "letter_decision",
          { actor, params: { requestId: id }, query: {}, version: context.version, key: context.key },
          { decision, note },
        );
      return workspaceCommand(
        prisma,
        actor,
        "profile.change.decide",
        id,
        context.key,
        context.requestId,
        async (r, tx) => {
          const row = await r.require(id, "profile_change");
          const data = profileChange.parse(row.data);
          const capability = data.verification === "Finance" ? "loan.approve" : "employee.update";
          requireCapability(actor, capability);
          // Out-of-scope requests answer 404 before anything is written (BE-003).
          if (row.ownerId && row.ownerId !== actor.employeeId)
            await assertEmployeeInScope(tx, actor, capability, row.ownerId);
          if (row.ownerId === actor.employeeId)
            throw new AuthorizationError("You cannot verify your own profile changes.");
          if (!row.ownerId || !["pending", "in_progress"].includes(data.state))
            throw new ConflictError("ALREADY_DECIDED", "This request has already been decided.");
          const state = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "in_progress";
          if (decision === "approve") {
            await r.lockProfile(row.ownerId);
            const profile = privateProfileSchema.parse((await r.get(`profile:${row.ownerId}`))?.data ?? {});
            if (data.field === "bankAccount") {
              await r.upsert(`bank:${row.ownerId}`, "bank_account", row.ownerId, { accountNumber: data.value });
              await createPayrollRepository(tx).upsertBankAccount(row.ownerId, data.value, actor.employeeId);
              profile.bankAccountMasked = `•••• ${decrypt(data.value).slice(-4)}`;
            } else profile[data.field] = data.value;
            await r.upsert(`profile:${row.ownerId}`, "profile", row.ownerId, profile);
          }
          await r.update(id, { ...data, state, decisionNote: note || null }, row.version, state);
          return { ok: true };
        },
      );
    },
  };
}
