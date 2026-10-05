import { otherTrackedRequests, otherWorkQueue } from "./requests.sources.js";
import { required } from "../time/time.service.js";
import type { PrismaClient, TimeWorkflow } from "@prisma/client";
import { z } from "zod";
import { newId } from "../../core/database/ids.js";
import { assertVersion } from "../../core/http/request-context.js";
import { hasAdministrativeReach } from "../../core/security/scope.js";
import { todayInOrgZone, daysBetween, zonedInstant } from "../../utils/date.js";
import {
  delegationInputSchema,
  permissionInputSchema,
  type TrackedRequest,
  type Delegation,
} from "../../contracts/requests.js";
import { type ApprovalItem } from "../../contracts/approval.js";
import {
  createTimeRepository,
  timeCommand,
  json,
  type CommandContext,
  type TimeRepository,
} from "../time/time.repository.js";
import {
  attendanceRules,
  canDecide,
  clockTime,
  decimal,
  employeeOf,
  fail,
  leaveBalance,
  minutesOf,
  money,
  personRef,
  policyTypes,
  requireDecision,
  requirePending,
  workflowOf,
} from "../time/time.service.js";
import { expenseBody, leavePayload, permissionPayload, regularizationBody } from "../time/time.schema.js";
export function createRequestsService(prisma: PrismaClient) {
  const repo = createTimeRepository(prisma);
  return {
    async tracked(ctx: CommandContext): Promise<TrackedRequest[]> {
      const rows = await repo.workflows({
        employeeId: ctx.actor.employeeId,
        kind: { in: ["leave", "regularization", "permission", "expense"] },
      });
      const timeRows: TrackedRequest[] = rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        module: z.enum(["leave", "regularization", "permission", "expense"]).parse(row.kind),
        title:
          row.kind === "leave"
            ? "Leave request"
            : row.kind === "regularization"
              ? "Attendance correction"
              : row.kind === "permission"
                ? "Short absence permission"
                : expenseBody.parse(row.payload).title,
        detail: row.startDate
          ? `${row.startDate}${row.endDate !== row.startDate ? ` – ${row.endDate}` : ""}`
          : row.reference,
        submittedAt: row.createdAt.toISOString(),
        status: {
          label: row.state.replaceAll("_", " "),
          tone: ["pending", "submitted"].includes(row.state)
            ? "warning"
            : ["approved", "manager_approved", "reimbursed"].includes(row.state)
              ? "success"
              : row.state === "rejected"
                ? "danger"
                : "neutral",
        },
        open: ["pending", "submitted", "manager_approved"].includes(row.state),
        href: row.kind === "leave" ? "/leave" : row.kind === "expense" ? "/expenses" : "/attendance/requests",
      }));
      return [...timeRows, ...(await otherTrackedRequests(repo, ctx))].sort((a, b) =>
        b.submittedAt.localeCompare(a.submittedAt),
      );
    },
    permission(ctx: CommandContext, input: z.infer<typeof permissionInputSchema>) {
      return timeCommand(prisma, ctx, "attendance.permission.create", async (r, reference) => {
        const minutes = minutesOf(input.to) - minutesOf(input.from),
          today = todayInOrgZone();
        if (minutes <= 0 || minutes > 120)
          fail("PERMISSION_DURATION", "A permission must be between 1 and 120 minutes.");
        if (input.date < today || daysBetween(today, input.date) > 30)
          fail("INVALID_DATE", "Choose a date in the next 30 days.");
        const e = await employeeOf(r, ctx.actor.employeeId);
        if (!e.managerId) fail("NO_APPROVER", "A reporting manager is required.");
        const existing = await r.workflows({
          kind: "permission",
          employeeId: e.id,
          startDate: input.date,
          state: { in: ["pending", "approved"] },
        });
        if (
          existing.some((row) => {
            const p = permissionPayload.parse(row.payload);
            return p.from < input.to && p.to > input.from;
          })
        )
          fail("OVERLAPPING_PERMISSION", "A permission overlaps this time.", 409);
        const ref = await reference("PM");
        await r.createWorkflow({
          id: newId("pm"),
          reference: ref,
          kind: "permission",
          employeeId: e.id,
          approverId: e.managerId,
          startDate: input.date,
          endDate: input.date,
          payload: json({ ...input, minutes }),
        });
        return { reference: ref, minutes };
      });
    },
    async expenses(ctx: CommandContext) {
      return (await repo.workflows({ kind: "expense", employeeId: ctx.actor.employeeId })).map((r) => ({
        ...expenseBody.parse(r.payload),
        id: r.id,
        reference: r.reference,
        state: r.state,
        submittedAt: r.createdAt.toISOString(),
        receipts: 0,
        settlementReference: null,
      }));
    },
    expense(ctx: CommandContext, input: z.infer<typeof expenseBody>) {
      return timeCommand(prisma, ctx, "expense.create", async (r, reference) => {
        if (input.incurredOn > todayInOrgZone() || daysBetween(input.incurredOn, todayInOrgZone()) > 90)
          fail("INVALID_DATE", "Submit expenses incurred in the last 90 days.");
        const e = await employeeOf(r, ctx.actor.employeeId);
        if (!e.managerId) fail("NO_APPROVER", "A reporting manager is required.");
        const rows = await r.workflows({
          kind: "expense",
          employeeId: e.id,
          startDate: input.incurredOn,
          state: { not: "rejected" },
        });
        if (
          rows.some((row) => {
            const p = expenseBody.parse(row.payload);
            return (
              p.merchant.toLowerCase() === input.merchant.toLowerCase() &&
              Number(p.amount.amount) === Number(input.amount.amount)
            );
          })
        )
          fail("DUPLICATE_EXPENSE", "An expense with this merchant, date and amount already exists.", 409);
        const ref = await reference("EX");
        await r.createWorkflow({
          id: newId("exp"),
          reference: ref,
          kind: "expense",
          employeeId: e.id,
          approverId: e.managerId,
          state: "submitted",
          startDate: input.incurredOn,
          endDate: input.incurredOn,
          payload: json(input),
        });
        return { reference: ref, state: "submitted" };
      });
    },
    async delegations(ctx: CommandContext) {
      const given = await repo.workflows({ kind: "delegation", employeeId: ctx.actor.employeeId }),
        received = await repo.workflows({ kind: "delegation", approverId: ctx.actor.employeeId });
      return {
        given: await Promise.all(given.map((r) => delegationDto(repo, r, false))),
        received: await Promise.all(received.map((r) => delegationDto(repo, r, true))),
      };
    },
    delegate(ctx: CommandContext, input: z.infer<typeof delegationInputSchema>) {
      return timeCommand(prisma, ctx, "delegation.create", async (r, reference) => {
        if (input.delegateId === ctx.actor.employeeId) fail("SELF_DELEGATION", "Choose another approver.");
        if (input.startsOn < todayInOrgZone() || daysBetween(input.startsOn, input.endsOn) > 90)
          fail("INVALID_RANGE", "Delegation must be upcoming and no longer than 90 days.");
        const target = await employeeOf(r, input.delegateId);
        const roles = await r.roleAssignments(target.id);
        if (!roles.some((role) => ["manager", "hr_operator", "super_admin"].includes(role.role)))
          fail("INVALID_DELEGATE", "Choose a manager or HR approver.");
        const overlaps = await r.workflows({
          kind: "delegation",
          employeeId: ctx.actor.employeeId,
          state: "active",
          startDate: { lte: input.endsOn },
          endDate: { gte: input.startsOn },
        });
        if (
          overlaps.some((d) =>
            delegationInputSchema.parse(d.payload).workflows.some((w) => input.workflows.includes(w)),
          )
        )
          fail("OVERLAPPING_DELEGATION", "There is already a delegation for this workflow and date range.", 409);
        const cycle = await r.workflows({
          kind: "delegation",
          employeeId: input.delegateId,
          approverId: ctx.actor.employeeId,
          state: "active",
          startDate: { lte: input.endsOn },
          endDate: { gte: input.startsOn },
        });
        if (cycle.length) fail("DELEGATION_CYCLE", "Reciprocal delegation is not allowed.");
        await r.createWorkflow({
          id: newId("dlg"),
          reference: await reference("DL"),
          kind: "delegation",
          employeeId: ctx.actor.employeeId,
          approverId: target.id,
          state: "active",
          startDate: input.startsOn,
          endDate: input.endsOn,
          payload: json(input),
        });
        return { ok: true };
      });
    },
    revoke: (ctx: CommandContext, id: string) =>
      timeCommand(prisma, ctx, `delegation.${id}.revoke`, async (r) => {
        const row = await workflowOf(r, id, "delegation");
        if (row.employeeId !== ctx.actor.employeeId) fail("NOT_FOUND", "Delegation was not found.", 404);
        if (row.state !== "active") fail("ALREADY_REVOKED", "Delegation is already revoked.", 409);
        await r.updateWorkflow(id, { state: "revoked", version: { increment: 1 } });
        return { ok: true };
      }),
    async approvals(ctx: CommandContext, state: "pending" | "decided") {
      const rows = await repo.workflows({
          kind: { in: ["leave", "regularization", "permission", "expense"] },
          state:
            state === "pending"
              ? { in: ["pending", "submitted"] }
              : { in: ["approved", "rejected", "manager_approved"] },
        }),
        result: ApprovalItem[] = [];
      for (const row of rows) if (await canDecide(repo, ctx.actor, row)) result.push(await approvalDto(repo, ctx, row));
      return result;
    },
    decide(ctx: CommandContext, id: string, decision: "approve" | "reject", reason: string) {
      return timeCommand(prisma, ctx, `approval.${id}.${decision}`, async (r) => {
        const row = await workflowOf(r, id);
        if (!["leave", "regularization", "permission", "expense"].includes(row.kind))
          fail("NOT_FOUND", "Approval was not found.", 404);
        await requireDecision(r, ctx.actor, row);
        requirePending(row);
        assertVersion(row.version, ctx.version);
        if (decision === "approve") {
          if (row.kind === "leave") {
            const p = leavePayload.parse(row.payload),
              balance = await leaveBalance(r, row.employeeId, p.leaveTypeId),
              type = required((await policyTypes(r)).find((t) => t.id === p.leaveTypeId));
            if (type.entitledDays !== null && Number(balance.available) + Number(type.negativeDays) < 0)
              fail("INSUFFICIENT_BALANCE", "The available balance changed before approval.", 409);
            await r.addLedger({
              id: newId("lg"),
              employeeId: row.employeeId,
              leaveTypeId: p.leaveTypeId,
              date: todayInOrgZone(),
              kind: "availed",
              units: -p.units,
              reference: row.reference,
              note: p.reason,
              actorId: ctx.actor.employeeId,
            });
          }
          if (row.kind === "regularization") {
            const p = regularizationBody.parse(row.payload),
              rules = await attendanceRules(r),
              e = await employeeOf(r, row.employeeId),
              shift = required(
                rules.shifts.find(
                  (s) =>
                    s.id ===
                    (rules.departmentShifts.find((d) => d.department === e.department.name)?.shiftId ??
                      rules.defaultShiftId),
                ),
              );
            await r.saveAttendance(row.employeeId, p.date, {
              firstIn: zonedInstant(p.date, p.proposedIn),
              lastOut: zonedInstant(p.date, p.proposedOut),
              workedMinutes: Math.max(0, minutesOf(p.proposedOut) - minutesOf(p.proposedIn) - shift.breakMinutes),
              source: "regularization",
            });
          }
        }
        const state = decision === "reject" ? "rejected" : row.kind === "expense" ? "manager_approved" : "approved",
          at = new Date();
        await r.updateWorkflow(id, {
          state,
          version: { increment: 1 },
          decidedAt: at,
          decidedBy: ctx.actor.employeeId,
          decisionNote: reason,
        });
        await r.notify(
          row.employeeId,
          `${row.kind} ${state.replaceAll("_", " ")}`,
          `${row.reference}: ${reason || state}`,
          row.kind === "leave" ? "/leave" : "/requests",
        );
        return { reference: row.reference, state, at: at.toISOString() };
      });
    },
    async workQueue(ctx: CommandContext) {
      const rows = await repo.workflows({
          state: { in: ["pending", "submitted"] },
          kind: { in: ["comp_off", "encashment", "timesheet", "shift_swap"] },
        }),
        allowed: TimeWorkflow[] = [];
      for (const row of rows) if (await canDecide(repo, ctx.actor, row)) allowed.push(row);
      const definitions = [
        {
          key: "comp_off",
          label: "Comp-off claims",
          detail: "Off-day work awaiting a decision",
          icon: "calendarCheck",
          href: "/leave/comp-off",
        },
        {
          key: "encashment",
          label: "Leave encashments",
          detail: "Review leave encashment requests",
          icon: "moneyIn",
          href: "/leave/comp-off",
        },
        {
          key: "timesheet",
          label: "Timesheets",
          detail: "Review submitted weekly hours",
          icon: "task",
          href: "/timesheets/team",
        },
        {
          key: "shift_swap",
          label: "Shift swaps",
          detail: "Review roster changes",
          icon: "swap",
          href: "/attendance/roster",
        },
      ];
      return [
        ...(await otherWorkQueue(prisma, repo, ctx)),
        ...definitions
          .map((d) => ({ ...d, count: allowed.filter((r) => r.kind === d.key).length }))
          .filter((d) => d.count > 0),
      ];
    },
  };
}
async function delegationDto(repo: TimeRepository, row: TimeWorkflow, received: boolean): Promise<Delegation> {
  const p = delegationInputSchema.parse(row.payload),
    today = todayInOrgZone();
  return {
    id: row.id,
    delegate: personRef(await employeeOf(repo, received ? row.employeeId : p.delegateId)),
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    workflows: p.workflows,
    reason: p.reason,
    state:
      row.state === "revoked" ? "revoked" : p.endsOn < today ? "ended" : p.startsOn > today ? "scheduled" : "active",
  };
}
async function approvalDto(repo: TimeRepository, ctx: CommandContext, row: TimeWorkflow): Promise<ApprovalItem> {
  const e = await employeeOf(repo, row.employeeId),
    kind = z.enum(["leave", "regularization", "permission", "expense"]).parse(row.kind);
  let context: ApprovalItem["context"];
  if (kind === "leave") {
    const p = leavePayload.parse(row.payload),
      t = (await policyTypes(repo)).find((t) => t.id === p.leaveTypeId),
      balance = await leaveBalance(repo, e.id, p.leaveTypeId);
    context = {
      kind,
      leaveType: t?.name ?? p.leaveTypeId,
      startDate: p.startDate,
      endDate: p.endDate,
      units: decimal(p.units),
      availableBefore: decimal(Number(balance.available) + (row.state === "pending" ? p.units : 0)),
      availableAfter: balance.available,
      policyVersion: p.policyVersion,
      reason: p.reason,
      overlaps: [],
    };
  } else if (kind === "regularization") {
    const p = regularizationBody.parse(row.payload),
      record = await repo.attendance(e.id, p.date);
    context = {
      kind,
      ...p,
      recordedIn: clockTime(record?.firstIn ?? null),
      recordedOut: clockTime(record?.lastOut ?? null),
    };
  } else if (kind === "permission") context = { kind, ...permissionPayload.parse(row.payload) };
  else {
    const p = expenseBody.parse(row.payload);
    context = {
      kind,
      category: p.category,
      amount: money(p.amount.amount),
      incurredOn: p.incurredOn,
      merchant: p.merchant,
      receipts: 0,
      duplicateWarning: null,
    };
  }
  const delegated =
    row.approverId && row.approverId !== ctx.actor.employeeId && !hasAdministrativeReach(ctx.actor, "employee.update")
      ? await repo.employee(row.approverId)
      : null;
  return {
    id: row.id,
    kind,
    reference: row.reference,
    requester: personRef(e),
    title:
      kind === "expense"
        ? expenseBody.parse(row.payload).title
        : `${required(kind[0]).toUpperCase()}${kind.slice(1)} request`,
    summary: row.startDate ?? row.reference,
    submittedAt: row.createdAt.toISOString(),
    state:
      row.state === "submitted"
        ? "pending"
        : row.state === "manager_approved"
          ? "approved"
          : z.enum(["pending", "approved", "rejected"]).parse(row.state),
    version: row.version,
    delegatedFrom: delegated ? personRef(delegated) : null,
    context,
    history: [
      { at: row.createdAt.toISOString(), actor: e.name, event: "Submitted" },
      ...(row.decidedAt
        ? [
            {
              at: row.decidedAt.toISOString(),
              actor: row.decidedBy ? (await employeeOf(repo, row.decidedBy)).name : "Approver",
              event: `${row.state}${row.decisionNote ? `: ${row.decisionNote}` : ""}`,
            },
          ]
        : []),
    ],
  };
}
