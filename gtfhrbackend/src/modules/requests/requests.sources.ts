import { z } from "zod";
import { can } from "../../core/security/actor.js";
import type { TrackedRequest } from "../../contracts/requests.js";
import type { WorkQueueItem } from "../../contracts/approval.js";
import type { CommandContext, TimeRepository } from "../time/time.repository.js";
import { scopedPeople } from "../time/time.service.js";

const source = z.object({
  reference: z.string().optional(),
  title: z.string().optional(),
  subject: z.string().optional(),
  type: z.string().optional(),
  field: z.string().optional(),
  category: z.string().optional(),
  state: z.string().optional(),
  status: z.string().optional(),
});
function status(state: string): TrackedRequest["status"] {
  return {
    label: state.replaceAll("_", " "),
    tone: ["pending", "requested", "submitted", "in_progress", "manager_review", "hr_review", "open"].includes(state)
      ? "warning"
      : ["approved", "issued", "accepted", "fulfilled", "closed", "resolved", "active"].includes(state)
        ? "success"
        : state === "rejected"
          ? "danger"
          : "neutral",
  };
}
export async function otherTrackedRequests(repo: TimeRepository, ctx: CommandContext): Promise<TrackedRequest[]> {
  const [workspace, talent, loans] = await Promise.all([
      repo.workspaceRequests(ctx.actor.employeeId),
      repo.talentRequests(ctx.actor.employeeId),
      repo.loans(ctx.actor.employeeId),
    ]),
    result: TrackedRequest[] = [];
  for (const row of workspace) {
    const p = source.parse(row.data),
      state = p.state ?? p.status ?? row.state;
    result.push({
      id: row.id,
      reference: p.reference ?? row.id,
      module: row.kind === "ticket" ? "helpdesk" : "profile",
      title: row.kind === "ticket" ? (p.subject ?? p.title ?? "Helpdesk request") : "Profile update",
      detail: row.kind === "ticket" ? (p.category ?? "Helpdesk") : "Personal information verification",
      submittedAt: row.createdAt.toISOString(),
      status: status(state),
      open: !["approved", "rejected", "resolved", "closed"].includes(state),
      href: row.kind === "ticket" ? `/helpdesk/${row.id}` : "/me/profile",
    });
  }
  for (const row of talent) {
    const p = source.parse(row.data),
      state = p.state ?? row.state,
      module = row.kind === "letter_request" ? "letter" : row.kind === "asset_request" ? "asset" : "resignation";
    result.push({
      id: row.id,
      reference: p.reference ?? row.id,
      module,
      title: module === "letter" ? "Letter request" : module === "asset" ? "Asset request" : "Resignation",
      detail:
        module === "letter"
          ? (p.type?.replaceAll("_", " ") ?? "Requested letter")
          : module === "asset"
            ? (p.category ?? "Equipment")
            : "Employment exit request",
      submittedAt: row.createdAt.toISOString(),
      status: status(state),
      open: ["pending", "manager_review", "hr_review", "in_progress"].includes(state),
      href: module === "letter" ? "/documents?tab=letters" : module === "asset" ? "/me/assets" : "/me/resignation",
    });
  }
  for (const row of loans)
    result.push({
      id: row.id,
      reference: row.reference,
      module: "loan",
      title: row.type === "salary_advance" ? "Salary advance" : "Loan request",
      detail: `${row.tenureMonths} monthly installments`,
      submittedAt: row.requestedAt.toISOString(),
      status: status(row.state),
      open: row.state === "requested",
      href: "/salary/loans",
    });
  return result;
}
export async function otherWorkQueue(repo: TimeRepository, ctx: CommandContext): Promise<WorkQueueItem[]> {
  const result: WorkQueueItem[] = [],
    people = await scopedPeople(repo, ctx.actor),
    ids = people.filter((p) => p.id !== ctx.actor.employeeId).map((p) => p.id);
  const resignations = await repo.talentQueue(["resignation"], can(ctx.actor, "employee.update") ? undefined : ids);
  const pendingResignations = resignations.filter((r) => {
    const state = source.parse(r.data).state ?? r.state;
    return can(ctx.actor, "employee.update")
      ? ["hr_review", "manager_review", "pending_manager", "pending_hr"].includes(state)
      : ["manager_review", "pending_manager"].includes(state);
  }).length;
  if (pendingResignations)
    result.push({
      key: "resignation",
      label: "Resignations",
      detail: "Exit requests awaiting a decision",
      icon: "userRemove",
      href: "/admin/offboarding",
      count: pendingResignations,
    });
  if (can(ctx.actor, "asset.manage")) {
    const count = (await repo.talentQueue(["asset_request"])).filter(
      (r) => (source.parse(r.data).state ?? r.state) === "pending",
    ).length;
    if (count)
      result.push({
        key: "assets",
        label: "Asset requests",
        detail: "Equipment awaiting allocation",
        icon: "box",
        href: "/admin/assets",
        count,
      });
  }
  if (can(ctx.actor, "settlement.approve")) {
    const count = (await repo.talentQueue(["settlement"])).filter(
      (r) => (source.parse(r.data).state ?? r.state) === "submitted" && r.ownerId !== ctx.actor.employeeId,
    ).length;
    if (count)
      result.push({
        key: "settlements",
        label: "Final settlements",
        detail: "Submitted settlements awaiting review",
        icon: "calculator",
        href: "/admin/settlements",
        count,
      });
  }
  return result;
}
