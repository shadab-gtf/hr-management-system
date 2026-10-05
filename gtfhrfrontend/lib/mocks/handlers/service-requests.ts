import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nowInstant } from "@/lib/mocks/store";
import { inr } from "@/lib/mocks/seed/random";
import { letterLabels } from "@/lib/mocks/handlers/requests";
import { notify } from "@/lib/mocks/handlers/notifications";
import { issueRequestedLetter } from "@/lib/mocks/handlers/lifecycle";
import { can, ref, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import { formatMoney } from "@/lib/utils/format";
import type { ServiceDecisionInput, ServiceRequest } from "@/types/hr-config";

/*
 * HR/Finance service queue for requests that are not manager approvals:
 * profile changes (HR; bank details → Finance), letters (HR) and loans (Finance).
 * The requester can never act on their own item.
 */

const fieldLabels: Record<string, string> = {
  mobile: "Mobile number",
  personalEmail: "Personal email",
  address: "Address",
  emergencyContact: "Emergency contact",
  bankAccount: "Bank account",
};
const loanLabels: Record<string, string> = {
  salary_advance: "Salary advance",
  personal_loan: "Personal loan",
  laptop_loan: "Laptop loan",
  emergency: "Emergency loan",
};

const canVerifyProfile = (actor: MockActor, field: string) =>
  field === "bankAccount" ? can(actor, "loan.approve") : can(actor, "employee.update");

export function canUseServiceQueue(actor: MockActor) {
  return can(actor, "employee.update") || can(actor, "letter.issue") || can(actor, "loan.approve");
}

export function listServiceRequests(actor: MockActor, view: "open" | "closed"): ServiceRequest[] {
  if (!canUseServiceQueue(actor)) throw problem(403, "FORBIDDEN", "You don't have access to this.");
  const store = db();
  const open = (state: string) => (view === "open" ? state === "pending" || state === "in_progress" || state === "requested" : !(state === "pending" || state === "in_progress" || state === "requested"));
  const rows: ServiceRequest[] = [];

  for (const item of store.profileRequests) {
    const requester = employeeById(item.employeeId);
    if (!requester || item.employeeId === actor.employeeId || !canVerifyProfile(actor, item.field) || !open(item.state)) continue;
    rows.push({
      id: item.id,
      kind: "profile_change",
      reference: item.reference,
      requester: ref(requester),
      title: `${fieldLabels[item.field] ?? item.field} change`,
      detail: item.field === "bankAccount" ? "Independent verification required before payroll uses it" : "Verify against a supporting document",
      proposed: item.value,
      reason: item.reason,
      submittedAt: item.submittedAt,
      state: item.state,
      verifier: item.field === "bankAccount" ? "Finance" : "HR",
      decisionNote: item.decisionNote,
    });
  }

  if (can(actor, "letter.issue"))
    for (const item of store.letters) {
      const requester = employeeById(item.employeeId);
      if (!requester || item.employeeId === actor.employeeId || !open(item.state)) continue;
      rows.push({
        id: item.id,
        kind: "letter",
        reference: item.reference,
        requester: ref(requester),
        title: letterLabels[item.type],
        detail: `Addressed to ${item.addressedTo}`,
        proposed: null,
        reason: item.purpose,
        submittedAt: item.requestedAt,
        state: item.state === "issued" ? "approved" : item.state,
        verifier: "HR",
        decisionNote: null,
      });
    }

  if (can(actor, "loan.approve"))
    for (const item of store.loans) {
      const requester = employeeById(item.employeeId);
      if (!requester || item.employeeId === actor.employeeId || !open(item.state)) continue;
      rows.push({
        id: item.id,
        kind: "loan",
        reference: item.reference,
        requester: ref(requester),
        title: loanLabels[item.type] ?? "Loan",
        detail: `${formatMoney(inr(item.principalPaise), { decimals: false })} over ${item.tenureMonths} months`,
        proposed: null,
        reason: item.reason,
        submittedAt: item.requestedAt,
        state: item.state === "requested" ? "pending" : item.state === "rejected" ? "rejected" : "approved",
        verifier: "Finance",
        decisionNote: null,
      });
    }

  return rows.sort((a, b) => (view === "open" ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt)));
}

export function decideServiceRequest(actor: MockActor, input: ServiceDecisionInput) {
  const store = db();
  const approve = input.decision === "approve";
  const alreadyDecided = () => problem(409, "ALREADY_DECIDED", "Someone already acted on this request. Showing the current state.");

  if (input.kind === "profile_change") {
    const item = store.profileRequests.find((request) => request.id === input.requestId);
    if (!item || !canVerifyProfile(actor, item.field)) throw problem(404, "NOT_FOUND", "This request isn't in your queue.");
    if (item.employeeId === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't verify your own change.");
    if (item.state !== "pending") throw alreadyDecided();
    if (input.decision === "start") throw problem(422, "INVALID_DECISION", "Approve or reject this request.");
    item.state = approve ? "approved" : "rejected";
    item.decisionNote = input.note || null;
    if (approve) {
      const overrides = store.profileOverrides.get(item.employeeId) ?? {};
      overrides[item.field] = item.value;
      store.profileOverrides.set(item.employeeId, overrides);
    }
    notify(item.employeeId, "system", approve ? "Profile change verified" : "Profile change not approved", approve ? `${fieldLabels[item.field] ?? "Your profile"} is updated.` : input.note, "/me/profile?tab=personal");
    return { reference: item.reference, state: item.state };
  }

  if (input.kind === "letter") {
    requireCapability(actor, "letter.issue");
    const item = store.letters.find((letter) => letter.id === input.requestId);
    if (!item) throw problem(404, "NOT_FOUND", "This request isn't in your queue.");
    if (item.employeeId === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't issue your own letter.");
    if (item.state !== "pending" && item.state !== "in_progress") throw alreadyDecided();
    if (input.decision === "start") {
      if (item.state === "in_progress") throw alreadyDecided();
      item.state = "in_progress";
      return { reference: item.reference, state: item.state };
    }
    // Issuing renders the matching letter template; it fails (nothing changes) if values are missing.
    if (approve) issueRequestedLetter(actor, item);
    item.state = approve ? "issued" : "rejected";
    if (approve) item.issuedAt = nowInstant();
    if (!approve) notify(item.employeeId, "system", "Letter request declined", input.note, "/documents?tab=letters");
    return { reference: item.reference, state: item.state };
  }

  requireCapability(actor, "loan.approve");
  const loan = store.loans.find((item) => item.id === input.requestId);
  if (!loan) throw problem(404, "NOT_FOUND", "This request isn't in your queue.");
  if (loan.employeeId === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't approve your own loan.");
  if (loan.state !== "requested") throw alreadyDecided();
  if (input.decision === "start") throw problem(422, "INVALID_DECISION", "Approve or reject this request.");
  loan.state = approve ? "approved" : "rejected";
  if (approve) loan.startMonth = store.today.slice(0, 7);
  notify(loan.employeeId, "payroll", approve ? "Loan approved" : "Loan not approved", approve ? `${loan.reference}: repayment starts with next payroll.` : input.note, "/salary/loans");
  return { reference: loan.reference, state: loan.state };
}
