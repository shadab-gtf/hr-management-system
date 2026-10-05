import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant } from "@/lib/mocks/store";
import { halves } from "@/lib/mocks/seed/random";
import { formatDate, formatDateRange } from "@/lib/utils/format";
import { expenseStatus, leaveStatus, ticketStatus } from "@/lib/utils/tones";
import { leaveTypeName } from "@/lib/mocks/handlers/leave";
import { notify } from "@/lib/mocks/handlers/notifications";
import { idempotent, me, refById, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import type { Delegation, LetterRequest, LetterType, TrackedRequest } from "@/types/requests";

/* Letters ------------------------------------------------------------------ */

export const letterLabels: Record<LetterType, string> = {
  address_proof: "Address proof letter",
  employment_verification: "Employment verification",
  salary_certificate: "Salary certificate",
  visa_letter: "Visa / travel letter",
  experience_letter: "Experience letter",
};

export function listLetters(actor: MockActor): LetterRequest[] {
  requireCapability(actor, "letter.request.self");
  return db()
    .letters.filter((letter) => letter.employeeId === actor.employeeId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .map(({ employeeId: _owner, addressedTo: _to, ...letter }) => letter);
}

export function requestLetter(actor: MockActor, input: { type: LetterType; purpose: string; addressedTo: string }, key: string | undefined) {
  requireCapability(actor, "letter.request.self");
  return idempotent(key, () => {
    const store = db();
    const employee = me(actor);
    if (input.type === "experience_letter" && employee.status !== "notice" && employee.status !== "exited")
      throw problem(422, "NOT_ELIGIBLE", "Experience letters are issued during exit. Try an employment verification letter.", {
        fieldErrors: { type: "Available during exit." },
      });
    const reference = nextReference("LTR");
    store.letters.push({ id: `lt_${store.counter}`, reference, employeeId: actor.employeeId, ...input, state: "pending", requestedAt: nowInstant(), issuedAt: null });
    return { reference };
  });
}

/* Permission (short absence) ---------------------------------------------- */

const minutesOf = (value: string) => {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + m;
};

export function requestPermission(actor: MockActor, input: { date: string; from: string; to: string; reason: string }, key: string | undefined) {
  requireCapability(actor, "attendance.regularize.request");
  return idempotent(key, () => {
    const minutes = minutesOf(input.to) - minutesOf(input.from);
    if (minutes <= 0) throw problem(422, "INVALID_TIMES", "End time must be after start time.", { fieldErrors: { to: "End after start." } });
    if (minutes > 180) throw problem(422, "LIMIT_EXCEEDED", "Permissions are up to 3 hours. Use half-day leave for longer.", { fieldErrors: { to: "Maximum 3 hours." } });
    const store = db();
    const month = input.date.slice(0, 7);
    const used = store.permissions.filter((p) => p.employeeId === actor.employeeId && p.date.startsWith(month) && p.state !== "rejected").length;
    if (used >= 2) throw problem(409, "MONTHLY_LIMIT", "You’ve used both permissions for this month.");
    const employee = me(actor);
    const reference = nextReference("PM");
    store.permissions.push({ id: `pm_${store.counter}`, reference, employeeId: employee.id, ...input, state: "pending", approverId: employee.managerId, submittedAt: nowInstant(), version: 1 });
    if (employee.managerId) notify(employee.managerId, "approval", "Permission request", `${employee.name} · ${formatDate(input.date)} ${input.from}–${input.to}`, "/approvals");
    return { reference, minutes };
  });
}

/* Delegations -------------------------------------------------------------- */

function delegationState(item: { startsOn: string; endsOn: string; revoked: boolean }, today: string): Delegation["state"] {
  if (item.revoked) return "revoked";
  if (today < item.startsOn) return "scheduled";
  if (today > item.endsOn) return "ended";
  return "active";
}

/** Active delegations where the actor acts for someone else, for a workflow. */
export function delegatorsFor(actorId: string, workflow: "leave" | "regularization" | "expense"): string[] {
  const store = db();
  return store.delegations
    .filter((d) => d.delegateId === actorId && d.workflows.includes(workflow) && delegationState(d, store.today) === "active")
    .map((d) => d.delegatorId);
}

export function listDelegations(actor: MockActor): { given: Delegation[]; received: Delegation[] } {
  requireCapability(actor, "approval.decide");
  const store = db();
  const toDto = (item: (typeof store.delegations)[number], who: string): Delegation[] => {
    const person = refById(who);
    return person ? [{ id: item.id, delegate: person, startsOn: item.startsOn, endsOn: item.endsOn, workflows: item.workflows, reason: item.reason, state: delegationState(item, store.today) }] : [];
  };
  return {
    given: store.delegations.filter((d) => d.delegatorId === actor.employeeId).flatMap((d) => toDto(d, d.delegateId)),
    received: store.delegations.filter((d) => d.delegateId === actor.employeeId).flatMap((d) => toDto(d, d.delegatorId)),
  };
}

export function createDelegation(
  actor: MockActor,
  input: { delegateId: string; startsOn: string; endsOn: string; workflows: ("leave" | "regularization" | "expense")[]; reason: string },
  key: string | undefined,
) {
  requireCapability(actor, "delegation.manage");
  return idempotent(key, () => {
    const store = db();
    const delegate = employeeById(input.delegateId);
    if (!delegate || delegate.status === "exited") throw problem(422, "INVALID_DELEGATE", "Choose an active colleague.", { fieldErrors: { delegateId: "Choose an active colleague." } });
    if (delegate.id === actor.employeeId) throw problem(422, "SELF_DELEGATION", "You can’t delegate to yourself.", { fieldErrors: { delegateId: "Choose someone else." } });
    if (input.startsOn < store.today) throw problem(422, "PAST_DATE", "Delegation can’t start in the past.", { fieldErrors: { startsOn: "Today or later." } });
    // Cycle guard: the delegate must not already delegate the same work back.
    if (store.delegations.some((d) => d.delegatorId === delegate.id && d.delegateId === actor.employeeId && !d.revoked && d.endsOn >= input.startsOn))
      throw problem(409, "DELEGATION_CYCLE", `${delegate.name} already delegates to you for overlapping dates.`);
    store.counter += 1;
    store.delegations.push({ id: `dl_${store.counter}`, delegatorId: actor.employeeId, ...input, revoked: false });
    notify(delegate.id, "approval", "Approvals delegated to you", `${me(actor).name}: ${formatDateRange(input.startsOn, input.endsOn)}`, "/delegates");
    return { ok: true };
  });
}

export function revokeDelegation(actor: MockActor, id: string) {
  const item = db().delegations.find((d) => d.id === id && d.delegatorId === actor.employeeId);
  if (!item) throw problem(404, "NOT_FOUND", "That delegation no longer exists.");
  item.revoked = true;
  return { ok: true };
}

/* Request hub -------------------------------------------------------------- */

export function trackedRequests(actor: MockActor): TrackedRequest[] {
  const store = db();
  const mine = <T extends { employeeId: string }>(items: T[]) => items.filter((item) => item.employeeId === actor.employeeId);
  const rows: TrackedRequest[] = [];
  for (const r of mine(store.leaveRequests))
    rows.push({ id: r.id, reference: r.reference, module: "leave", title: `${leaveTypeName(r.leaveTypeId)} · ${halves(r.halves)} day(s)`, detail: formatDateRange(r.startDate, r.endDate), submittedAt: r.submittedAt, status: leaveStatus[r.state], open: r.state === "pending", href: "/leave" });
  for (const r of mine(store.regularizations))
    rows.push({ id: r.id, reference: r.reference, module: "regularization", title: "Attendance correction", detail: `${formatDate(r.date)} · ${r.proposedIn}–${r.proposedOut}`, submittedAt: r.submittedAt, status: { label: r.state === "pending" ? "Pending approval" : r.state === "approved" ? "Approved" : "Rejected", tone: r.state === "pending" ? "warning" : r.state === "approved" ? "success" : "danger" }, open: r.state === "pending", href: "/attendance?view=requests" });
  for (const r of mine(store.permissions))
    rows.push({ id: r.id, reference: r.reference, module: "permission", title: "Permission", detail: `${formatDate(r.date)} · ${r.from}–${r.to}`, submittedAt: r.submittedAt, status: { label: r.state === "pending" ? "Pending approval" : r.state === "approved" ? "Approved" : "Rejected", tone: r.state === "pending" ? "warning" : r.state === "approved" ? "success" : "danger" }, open: r.state === "pending", href: "/attendance?view=requests" });
  for (const r of mine(store.expenses))
    if (r.submittedAt) rows.push({ id: r.id, reference: r.reference, module: "expense", title: r.title, detail: r.merchant, submittedAt: r.submittedAt, status: expenseStatus[r.state], open: !["reimbursed", "rejected"].includes(r.state), href: "/expenses" });
  for (const r of mine(store.tickets))
    rows.push({ id: r.id, reference: r.reference, module: "helpdesk", title: r.subject, detail: r.lastMessage, submittedAt: r.createdAt, status: ticketStatus[r.state], open: !["resolved", "closed"].includes(r.state), href: `/helpdesk/${r.id}` });
  for (const r of mine(store.letters))
    rows.push({ id: r.id, reference: r.reference, module: "letter", title: letterLabels[r.type], detail: r.purpose, submittedAt: r.requestedAt, status: { label: r.state === "issued" ? "Issued" : r.state === "rejected" ? "Rejected" : r.state === "in_progress" ? "In progress" : "Pending", tone: r.state === "issued" ? "success" : r.state === "rejected" ? "danger" : "warning" }, open: r.state === "pending" || r.state === "in_progress", href: "/documents?tab=letters" });
  for (const r of mine(store.loans))
    rows.push({ id: r.id, reference: r.reference, module: "loan", title: r.type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), detail: `${r.tenureMonths} months`, submittedAt: r.requestedAt, status: { label: r.state === "requested" ? "Awaiting Finance" : r.state === "active" ? "Active" : r.state === "closed" ? "Closed" : r.state === "rejected" ? "Rejected" : "Approved", tone: r.state === "requested" ? "warning" : r.state === "rejected" ? "danger" : "success" }, open: r.state === "requested", href: "/salary/loans" });
  for (const r of mine(store.profileRequests))
    rows.push({ id: r.id, reference: r.reference, module: "profile", title: "Profile change", detail: r.field, submittedAt: r.submittedAt, status: { label: r.state === "pending" ? "Verification pending" : r.state === "approved" ? "Verified" : "Not approved", tone: r.state === "pending" ? "warning" : r.state === "approved" ? "success" : "danger" }, open: r.state === "pending", href: "/me/profile" });
  const resignationLabels = { pending_manager: ["With manager", "warning"], pending_hr: ["With HR", "warning"], on_hold: ["On hold — discussion", "info"], accepted: ["Accepted", "success"], rejected: ["Not accepted", "danger"], withdrawn: ["Withdrawn", "neutral"] } as const;
  for (const r of mine(store.lcResignations)) {
    const [label, tone] = resignationLabels[r.state];
    rows.push({ id: r.id, reference: r.reference, module: "resignation", title: "Resignation", detail: `Requested last day ${formatDate(r.agreedLastWorkingDay ?? r.requestedLastWorkingDay)}`, submittedAt: r.submittedAt, status: { label, tone }, open: ["pending_manager", "pending_hr", "on_hold"].includes(r.state), href: "/me/resignation" });
  }
  for (const r of mine(store.lcAssetRequests))
    rows.push({ id: r.id, reference: r.reference, module: "asset", title: `Asset request · ${r.category.replace("_", " ")}`, detail: r.reason, submittedAt: r.requestedAt, status: { label: r.state === "pending" ? "With HR" : r.state === "fulfilled" ? "Assigned" : "Declined", tone: r.state === "pending" ? "warning" : r.state === "fulfilled" ? "success" : "danger" }, open: r.state === "pending", href: "/me/assets" });
  return rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

