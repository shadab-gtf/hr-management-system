import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nowInstant } from "@/lib/mocks/store";
import { halves, inr } from "@/lib/mocks/seed/random";
import { expenseCategoryLabel } from "@/lib/mocks/handlers/expenses";
import { availableHalves, currentPolicyVersion, leaveTypeName } from "@/lib/mocks/handlers/leave";
import { attendanceDay } from "@/lib/mocks/handlers/attendance";
import { delegatorsFor } from "@/lib/mocks/handlers/requests";
import { formatDateRange, formatMoney } from "@/lib/utils/format";
import {
  ref,
  refById,
  requireCapability,
  versionCheck,
  type MockActor,
} from "@/lib/mocks/handlers/shared";
import type { ApprovalDecisionInput, ApprovalItem } from "@/types/approval";

/** Own queue plus active, workflow-bounded delegations (never the requester's own). */
function approverScope(actorId: string, workflow: "leave" | "regularization" | "expense"): string[] {
  return [actorId, ...delegatorsFor(actorId, workflow)];
}

export function listApprovals(actor: MockActor, state: "pending" | "decided" = "pending"): ApprovalItem[] {
  requireCapability(actor, "approval.decide");
  const store = db();
  const inScope = (approverId: string | null, requesterId: string, workflow: "leave" | "regularization" | "expense" = "leave") =>
    approverId !== null && approverScope(actor.employeeId, workflow).includes(approverId) && requesterId !== actor.employeeId;
  const wanted = (value: string) => (state === "pending" ? value === "pending" || value === "submitted" : value !== "pending" && value !== "submitted");
  const delegatedFrom = (approverId: string | null) =>
    approverId && approverId !== actor.employeeId ? refById(approverId) : null;

  const items: ApprovalItem[] = [];

  for (const request of store.leaveRequests) {
    if (!inScope(request.approverId, request.employeeId) || !wanted(request.state) || request.state === "cancelled") continue;
    const requester = employeeById(request.employeeId);
    if (!requester) continue;
    const available = availableHalves(requester.id, request.leaveTypeId, store.today);
    const availableBefore = available === null ? null : available + (request.state === "pending" ? request.halves : 0);
    const overlaps = store.leaveRequests
      .filter(
        (other) =>
          other.id !== request.id &&
          other.state === "approved" &&
          employeeById(other.employeeId)?.managerId === requester.managerId &&
          other.startDate <= request.endDate &&
          other.endDate >= request.startDate,
      )
      .map((other) => `${employeeById(other.employeeId)?.name ?? "A teammate"} is away ${formatDateRange(other.startDate, other.endDate)}`);
    items.push({
      id: request.id,
      kind: "leave",
      reference: request.reference,
      requester: ref(requester),
      title: `${leaveTypeName(request.leaveTypeId)} · ${halves(request.halves)} day${request.halves === 2 ? "" : "s"}`,
      summary: formatDateRange(request.startDate, request.endDate),
      submittedAt: request.submittedAt,
      state: request.state === "pending" ? "pending" : request.state === "approved" ? "approved" : "rejected",
      version: request.version,
      delegatedFrom: delegatedFrom(request.approverId),
      context: {
        kind: "leave",
        leaveType: leaveTypeName(request.leaveTypeId),
        startDate: request.startDate,
        endDate: request.endDate,
        units: halves(request.halves),
        availableBefore: availableBefore === null ? "0" : halves(availableBefore),
        availableAfter: availableBefore === null ? "0" : halves(availableBefore - request.halves),
        policyVersion: currentPolicyVersion(),
        reason: request.reason,
        overlaps,
      },
      history: [
        { at: request.submittedAt, actor: requester.name, event: "Submitted request; balance reserved" },
        ...(request.decidedAt ? [{ at: request.decidedAt, actor: refById(request.approverId)?.name ?? "Approver", event: request.state === "approved" ? "Approved" : `Rejected — ${request.decisionNote ?? ""}` }] : []),
      ],
    });
  }

  for (const item of store.regularizations) {
    if (!inScope(item.approverId, item.employeeId, "regularization") || !wanted(item.state)) continue;
    const requester = employeeById(item.employeeId);
    if (!requester) continue;
    const day = attendanceDay(requester, item.date);
    items.push({
      id: item.id,
      kind: "regularization",
      reference: item.reference,
      requester: ref(requester),
      title: "Attendance correction",
      summary: `${formatDateRange(item.date, item.date)} · ${item.proposedIn}–${item.proposedOut}`,
      submittedAt: item.submittedAt,
      state: item.state,
      version: item.version,
      delegatedFrom: delegatedFrom(item.approverId),
      context: {
        kind: "regularization",
        date: item.date,
        recordedIn: day?.firstIn ?? null,
        recordedOut: day?.lastOut ?? null,
        proposedIn: item.proposedIn,
        proposedOut: item.proposedOut,
        reason: item.reason,
      },
      history: [{ at: item.submittedAt, actor: requester.name, event: "Submitted correction; raw punches unchanged" }],
    });
  }

  for (const item of store.permissions) {
    if (!inScope(item.approverId, item.employeeId, "regularization") || !wanted(item.state)) continue;
    const requester = employeeById(item.employeeId);
    if (!requester) continue;
    const [fh = 0, fm = 0] = item.from.split(":").map(Number);
    const [th = 0, tm = 0] = item.to.split(":").map(Number);
    items.push({
      id: item.id,
      kind: "permission",
      reference: item.reference,
      requester: ref(requester),
      title: "Permission (short absence)",
      summary: `${formatDateRange(item.date, item.date)} · ${item.from}–${item.to}`,
      submittedAt: item.submittedAt,
      state: item.state,
      version: item.version,
      delegatedFrom: delegatedFrom(item.approverId),
      context: { kind: "permission", date: item.date, from: item.from, to: item.to, minutes: th * 60 + tm - (fh * 60 + fm), reason: item.reason },
      history: [{ at: item.submittedAt, actor: requester.name, event: "Requested permission" }],
    });
  }

  for (const claim of store.expenses) {
    const pending = claim.state === "submitted";
    if (!inScope(claim.approverId, claim.employeeId, "expense") || (state === "pending" ? !pending : pending || claim.state === "draft")) continue;
    const requester = employeeById(claim.employeeId);
    if (!requester || !claim.submittedAt) continue;
    const duplicate = store.expenses.find(
      (other) => other.id !== claim.id && other.employeeId === claim.employeeId && other.amountPaise === claim.amountPaise && other.merchant === claim.merchant,
    );
    items.push({
      id: claim.id,
      kind: "expense",
      reference: claim.reference,
      requester: ref(requester),
      title: claim.title,
      summary: `${expenseCategoryLabel(claim.category)} · ${formatMoney(inr(claim.amountPaise))}`,
      submittedAt: claim.submittedAt,
      state: pending ? "pending" : claim.state === "rejected" ? "rejected" : "approved",
      version: claim.version,
      delegatedFrom: delegatedFrom(claim.approverId),
      context: {
        kind: "expense",
        category: expenseCategoryLabel(claim.category),
        amount: inr(claim.amountPaise),
        incurredOn: claim.incurredOn,
        merchant: claim.merchant,
        receipts: claim.receipts,
        duplicateWarning: duplicate ? `Same amount and merchant as ${duplicate.reference}` : null,
      },
      history: [{ at: claim.submittedAt, actor: requester.name, event: `Submitted with ${claim.receipts} receipt${claim.receipts === 1 ? "" : "s"}` }],
    });
  }

  return items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function decideApproval(actor: MockActor, input: ApprovalDecisionInput) {
  requireCapability(actor, "approval.decide");
  const store = db();
  const approve = input.decision === "approve";
  const stamp = { at: nowInstant() };

  const leave = store.leaveRequests.find((item) => item.id === input.approvalId);
  const reg = store.regularizations.find((item) => item.id === input.approvalId);
  const permission = store.permissions.find((item) => item.id === input.approvalId);
  const claim = store.expenses.find((item) => item.id === input.approvalId);
  const target = leave ?? reg ?? permission ?? claim;
  const workflow = claim ? "expense" : reg || permission ? "regularization" : "leave";
  if (!target || !target.approverId || !approverScope(actor.employeeId, workflow).includes(target.approverId))
    throw problem(404, "NOT_FOUND", "This approval isn't assigned to you.");
  if (target.employeeId === actor.employeeId)
    throw problem(403, "SELF_APPROVAL", "You can't approve your own request.");
  const isPending = leave ? leave.state === "pending" : reg ? reg.state === "pending" : permission ? permission.state === "pending" : claim?.state === "submitted";
  if (!isPending)
    throw problem(409, "ALREADY_DECIDED", "Someone already acted on this request. Showing the current state.");
  versionCheck(target.version, input.expectedVersion);

  if (leave) {
    leave.state = approve ? "approved" : "rejected";
    leave.decidedAt = stamp.at;
    leave.decisionNote = input.note || null;
    leave.version += 1;
  } else if (reg) {
    reg.state = approve ? "approved" : "rejected";
    reg.decisionNote = input.note || null;
    reg.version += 1;
  } else if (permission) {
    permission.state = approve ? "approved" : "rejected";
    permission.version += 1;
  } else if (claim) {
    claim.state = approve ? "manager_approved" : "rejected";
    claim.version += 1;
  }
  return { reference: target.reference, state: approve ? "approved" : "rejected", at: stamp.at };
}
