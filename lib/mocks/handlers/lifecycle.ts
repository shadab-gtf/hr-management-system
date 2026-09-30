import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextId, nextReference, nowInstant } from "@/lib/mocks/store";
import { organization } from "@/lib/mocks/seed/organization";
import { personas, type SeedEmployee } from "@/lib/mocks/seed/people";
import { inr } from "@/lib/mocks/seed/random";
import type { LifecycleEvent, MockAsset, MockClearance, MockIssuedLetter, MockPolicy, MockResignation, MockSettlement, MockSettlementLine } from "@/lib/mocks/seed/lifecycle";
import { checklist, departmentNames } from "@/lib/mocks/handlers/config";
import { openExitCase, probationOf, recordEmploymentEvent } from "@/lib/mocks/handlers/employees";
import { availableHalves } from "@/lib/mocks/handlers/leave";
import { notify } from "@/lib/mocks/handlers/notifications";
import { bookValuePaise, computeSettlement, letterPlaceholders, monthlyStructure, noticePolicy, renderTemplate, serviceLength, unknownPlaceholders } from "@/lib/mocks/handlers/lifecycle-rules";
import { can, directReports, idempotent, me, ref, refById, requireCapability, versionCheck, type MockActor } from "@/lib/mocks/handlers/shared";
import { addDays, diffDays } from "@/lib/utils/date";
import { formatDate, formatMoney } from "@/lib/utils/format";
import type {
  Asset,
  AssetAssignInput,
  AssetCategory,
  AssetDetail,
  AssetInput,
  AssetInventory,
  AssetRequest,
  AssetRequestInput,
  AssetReturnInput,
  AssetStatusInput,
  Clearance,
  ClearanceDepartment,
  ClearanceInput,
  ExitInterviewInput,
  ExitLetterLink,
  IssuedLetter,
  LetterKind,
  LetterStudio,
  LetterTemplate,
  LetterTemplateInput,
  MyAssets,
  MyPolicy,
  OffboardingBoard,
  OffboardingDetail,
  PolicyAck,
  PolicyPublishInput,
  Resignation,
  ResignationDecision,
  ResignationInput,
  ResignationReason,
  ResignationView,
  SettlementBoard,
  SettlementDecisionInput,
  SettlementDetail,
  SettlementLineInput,
  SettlementPaymentInput,
  SettlementSummary,
  SettlementWaiverInput,
} from "@/types/lifecycle";

/*
 * Mock lifecycle backend. SYNTHETIC rules for demonstration: real notice,
 * settlement and statutory treatment is owned by HR/Finance and the live service.
 */

const OPEN_RESIGNATION = ["pending_manager", "pending_hr", "on_hold"] as const;
const isOpen = (state: MockResignation["state"]) => (OPEN_RESIGNATION as readonly string[]).includes(state);
const isHr = (actor: MockActor) => can(actor, "employee.update");
const nameOf = (actor: MockActor) => me(actor).name;
const event = (actor: string, text: string, note: string | null = null): LifecycleEvent => ({ id: nextId("lce"), at: nowInstant(), actor, event: text, note });
const long = (iso: string) => formatDate(iso, "medium");

function hrPartners(): string[] {
  return Object.values(personas).filter((persona) => persona.roles.includes("hr_operator")).map((persona) => persona.employeeId);
}
function approvers(): string[] {
  return Object.values(personas).filter((persona) => persona.roles.includes("payroll_approver")).map((persona) => persona.employeeId);
}
function mustEmployee(id: string): SeedEmployee {
  const employee = employeeById(id);
  if (!employee) throw problem(404, "NOT_FOUND", "We couldn't find that person.");
  return employee;
}
export function noticeFor(employee: SeedEmployee) {
  return noticePolicy(employee.type, probationOf(employee).status === "on_probation");
}

/* Resignation -------------------------------------------------------------- */

function toResignation(item: MockResignation, actor: MockActor): Resignation {
  const employee = mustEmployee(item.employeeId);
  const self = item.employeeId === actor.employeeId;
  const managerOf = employee.managerId === actor.employeeId && can(actor, "approval.decide");
  return {
    id: item.id,
    reference: item.reference,
    person: ref(employee),
    department: employee.department,
    reason: item.reason,
    note: item.note,
    submittedAt: item.submittedAt,
    noticeDays: item.noticeDays,
    noticeBasis: item.noticeBasis,
    policyLastWorkingDay: item.policyLastWorkingDay,
    requestedLastWorkingDay: item.requestedLastWorkingDay,
    earlyRelease: item.requestedLastWorkingDay < item.policyLastWorkingDay,
    earlyReleaseReason: item.earlyReleaseReason,
    agreedLastWorkingDay: item.agreedLastWorkingDay,
    managerRecommendation: item.managerRecommendation,
    state: item.state,
    history: item.history,
    version: item.version,
    permissions: {
      canWithdraw: self && isOpen(item.state),
      canDecideAsManager: !self && managerOf && !isHr(actor) && (item.state === "pending_manager" || item.state === "on_hold"),
      canDecideAsHr: !self && isHr(actor) && isOpen(item.state),
    },
  };
}

function shortfallFor(employeeId: string, lastWorkingDay: string): number {
  const resignation = db().lcResignations.find((item) => item.employeeId === employeeId && item.state === "accepted");
  return resignation ? Math.max(0, diffDays(lastWorkingDay, resignation.policyLastWorkingDay)) : 0;
}

export function resignationView(actor: MockActor): ResignationView {
  requireCapability(actor, "exit.request.self");
  const store = db();
  const employee = me(actor);
  const policy = noticeFor(employee);
  const mine = store.lcResignations.filter((item) => item.employeeId === employee.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const current = mine.find((item) => isOpen(item.state) || item.state === "accepted") ?? null;
  const exit = store.exits.get(employee.id);
  const reports = new Set(directReports(employee.id).map((person) => person.id));
  const team = can(actor, "approval.decide")
    ? store.lcResignations.filter((item) => reports.has(item.employeeId) && (isOpen(item.state) || (item.state === "accepted" && (item.history.at(-1)?.at ?? "") >= addDays(store.today, -30)))).map((item) => toResignation(item, actor))
    : [];
  let blockedReason: string | null = null;
  if (current && isOpen(current.state)) blockedReason = "Your resignation is being reviewed.";
  else if (exit || employee.status === "notice") blockedReason = "Your exit is already in progress.";
  else if (employee.status === "exited") blockedReason = "You have already exited.";
  return {
    today: store.today,
    policy: { noticeDays: policy.days, basis: policy.basis, defaultLastWorkingDay: addDays(store.today, policy.days) },
    current: current ? toResignation(current, actor) : null,
    past: mine.filter((item) => item !== current).map((item) => toResignation(item, actor)),
    exit: exit ? myExit(employee) : null,
    team,
    canResign: blockedReason === null,
    blockedReason,
  };
}

function myExit(employee: SeedEmployee): ResignationView["exit"] {
  const store = db();
  const exit = store.exits.get(employee.id);
  if (!exit) return null;
  const settlement = settlements().find((item) => item.employeeId === employee.id);
  const released = settlement && (settlement.state === "approved" || settlement.state === "paid");
  return {
    lastWorkingDay: exit.lastWorkingDay,
    status: employee.status === "exited" ? "exited" : "notice",
    clearances: clearancesFor(employee).map(({ department, label, status }) => ({ department, label, status })),
    assetsToReturn: store.lcAssets.filter((asset) => asset.assigneeId === employee.id && asset.status === "assigned").length,
    settlement: settlement ? { reference: settlement.reference, state: settlement.state, net: released ? inr(netOf(settlement.lines)) : null, paidAt: settlement.paidAt } : null,
    letters: exitLetters(employee.id),
  };
}

export function submitResignation(actor: MockActor, input: ResignationInput, key: string | undefined) {
  requireCapability(actor, "exit.request.self");
  return idempotent(key, () => {
    const store = db();
    const employee = me(actor);
    if (store.lcResignations.some((item) => item.employeeId === employee.id && isOpen(item.state)))
      throw problem(409, "RESIGNATION_PENDING", "You already have a resignation under review. Withdraw it first to change the details.");
    if (store.exits.has(employee.id) || employee.status === "notice" || employee.status === "exited")
      throw problem(409, "EXIT_EXISTS", "Your exit is already in progress. Contact HR to change your last working day.");
    const policy = noticeFor(employee);
    const policyLastDay = addDays(store.today, policy.days);
    if (input.lastWorkingDay <= store.today)
      throw problem(422, "INVALID_DATE", "Choose a last working day after today.", { fieldErrors: { lastWorkingDay: "After today." } });
    if (input.lastWorkingDay > policyLastDay)
      throw problem(422, "BEYOND_NOTICE", `Your notice ends on ${long(policyLastDay)}. Choose that date or earlier.`, { fieldErrors: { lastWorkingDay: `On or before ${long(policyLastDay)}.` } });
    const early = input.lastWorkingDay < policyLastDay;
    if (early && input.earlyReleaseReason.length < 10)
      throw problem(422, "EARLY_RELEASE_REASON", "Tell us why you need an early release.", { fieldErrors: { earlyReleaseReason: "Explain the early release (at least 10 characters)." } });
    const reference = nextReference("RSG");
    const item: MockResignation = {
      id: nextId("rs"),
      reference,
      employeeId: employee.id,
      reason: input.reason,
      note: input.note,
      submittedAt: nowInstant(),
      noticeDays: policy.days,
      noticeBasis: policy.basis,
      policyLastWorkingDay: policyLastDay,
      requestedLastWorkingDay: input.lastWorkingDay,
      earlyReleaseReason: early ? input.earlyReleaseReason : "",
      agreedLastWorkingDay: null,
      managerRecommendation: null,
      state: employee.managerId ? "pending_manager" : "pending_hr",
      history: [event(employee.name, "Resignation submitted", early ? `Early release requested (${diffDays(input.lastWorkingDay, policyLastDay)} days)` : null)],
      version: 1,
    };
    store.lcResignations.push(item);
    const body = `${employee.name} · requested last day ${long(input.lastWorkingDay)}`;
    if (employee.managerId) notify(employee.managerId, "approval", "Resignation received", body, "/me/resignation");
    for (const hr of hrPartners()) if (hr !== employee.id) notify(hr, "approval", "Resignation submitted", body, "/admin/offboarding");
    return { reference, state: item.state };
  });
}

export function withdrawResignation(actor: MockActor, id: string, expectedVersion: number | undefined) {
  requireCapability(actor, "exit.request.self");
  const item = db().lcResignations.find((entry) => entry.id === id && entry.employeeId === actor.employeeId);
  if (!item) throw problem(404, "NOT_FOUND", "That resignation no longer exists.");
  versionCheck(item.version, expectedVersion);
  if (!isOpen(item.state)) throw problem(409, "NOT_WITHDRAWABLE", "An accepted resignation can't be withdrawn here. Talk to HR.");
  item.state = "withdrawn";
  item.version += 1;
  item.history.push(event(nameOf(actor), "Withdrawn"));
  const employee = me(actor);
  if (employee.managerId) notify(employee.managerId, "approval", "Resignation withdrawn", `${employee.name} withdrew ${item.reference}.`, "/me/resignation");
  return { reference: item.reference, state: item.state };
}

export function decideResignation(actor: MockActor, input: ResignationDecision) {
  const store = db();
  const item = store.lcResignations.find((entry) => entry.id === input.resignationId);
  const employee = item ? employeeById(item.employeeId) : undefined;
  if (!item || !employee) throw problem(404, "NOT_FOUND", "That resignation no longer exists.");
  const asHr = isHr(actor);
  const asManager = employee.managerId === actor.employeeId && can(actor, "approval.decide");
  if (!asHr && !asManager) throw problem(404, "NOT_FOUND", "That resignation isn't in your queue.");
  if (item.employeeId === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't act on your own resignation.");
  versionCheck(item.version, input.expectedVersion);
  if (!isOpen(item.state)) throw problem(409, "ALREADY_DECIDED", "Someone already acted on this resignation. Showing the current state.");
  if (!asHr && item.state === "pending_hr") throw problem(409, "WITH_HR", "You've already recommended this; HR makes the final decision.");
  const who = nameOf(actor);
  const note = input.note || null;

  if (input.decision === "hold") {
    item.state = "on_hold";
    item.history.push(event(who, "Put on hold for a retention discussion", note));
    notify(employee.id, "system", "Resignation on hold", `${who} would like to discuss your resignation. ${input.note}`, "/me/resignation");
  } else if (input.decision === "reject") {
    item.state = "rejected";
    item.history.push(event(who, asHr ? "Rejected by HR" : "Rejected by manager", note));
    notify(employee.id, "system", "Resignation not accepted", input.note, "/me/resignation");
  } else if (!asHr) {
    item.state = "pending_hr";
    item.managerRecommendation = input.note || "Accepted";
    item.history.push(event(who, "Manager accepted", note));
    for (const hr of hrPartners()) if (hr !== employee.id) notify(hr, "approval", "Resignation ready for HR", `${employee.name} · manager accepted`, "/admin/offboarding");
  } else {
    const lastDay = input.lastWorkingDay || item.requestedLastWorkingDay;
    if (lastDay < store.today) throw problem(422, "PAST_DATE", "The last working day can't be in the past.", { fieldErrors: { lastWorkingDay: "Today or later." } });
    if (lastDay > addDays(item.policyLastWorkingDay, 30)) throw problem(422, "TOO_LATE", "Agree a date within 30 days of the policy notice end.", { fieldErrors: { lastWorkingDay: `By ${long(addDays(item.policyLastWorkingDay, 30))}.` } });
    openExitCase(employee, { lastWorkingDay: lastDay, reason: "resignation", note: item.note.slice(0, 300) });
    item.state = "accepted";
    item.agreedLastWorkingDay = lastDay;
    const shortfall = Math.max(0, diffDays(lastDay, item.policyLastWorkingDay));
    item.history.push(event(who, "HR accepted", `Agreed last working day ${long(lastDay)}${shortfall ? ` · ${shortfall} days short of notice` : ""}${note ? ` · ${note}` : ""}`));
    ensureClearances(employee.id);
    notify(employee.id, "system", "Resignation accepted", `Your last working day is ${long(lastDay)}. Your exit checklist has started.`, "/me/resignation");
    if (employee.managerId && employee.managerId !== actor.employeeId) notify(employee.managerId, "approval", "Resignation accepted", `${employee.name} · last day ${long(lastDay)}`, "/me/resignation");
  }
  item.version += 1;
  return { reference: item.reference, state: item.state };
}

/* Offboarding -------------------------------------------------------------- */

const clearanceMeta: Record<ClearanceDepartment, { label: string; scope: string }> = {
  manager: { label: "Manager — work handover", scope: "Projects, documents and client contacts handed over; direct reports reassigned." },
  it: { label: "IT — devices & access", scope: "Laptop, phone, monitor and SIM returned; SSO, email and VPN revoked." },
  admin: { label: "Admin — ID card & facilities", scope: "ID/access card, locker keys and other facilities returned." },
  finance: { label: "Finance — dues", scope: "Loans, advances and reimbursements settled through the F&F." },
};
const IT_CATEGORIES: AssetCategory[] = ["laptop", "phone", "monitor", "sim"];

function ensureClearances(employeeId: string): Record<ClearanceDepartment, MockClearance> {
  const store = db();
  let record = store.lcClearances.get(employeeId);
  if (!record) {
    const pending = (): MockClearance => ({ status: "pending", note: null, clearedBy: null, clearedAt: null });
    record = { manager: pending(), it: pending(), admin: pending(), finance: pending() };
    store.lcClearances.set(employeeId, record);
  }
  return record;
}

function clearanceBlockers(employee: SeedEmployee, department: ClearanceDepartment): string[] {
  const store = db();
  const held = store.lcAssets.filter((asset) => asset.assigneeId === employee.id && asset.status === "assigned");
  if (department === "manager") {
    const reports = directReports(employee.id).length;
    return reports ? [`Reassign ${reports} direct report${reports === 1 ? "" : "s"}`] : [];
  }
  if (department === "it") return held.filter((asset) => IT_CATEGORIES.includes(asset.category)).map((asset) => `Return ${asset.tag} (${asset.make} ${asset.model})`);
  if (department === "admin") return held.filter((asset) => !IT_CATEGORIES.includes(asset.category)).map((asset) => `Return ${asset.tag} (${asset.make} ${asset.model})`);
  const settlement = settlements().find((item) => item.employeeId === employee.id);
  if (!settlement) return ["Prepare the full & final settlement"];
  if (settlement.state !== "approved" && settlement.state !== "paid") return [`Settlement ${settlement.reference} is not approved yet`];
  return [];
}

function clearancesFor(employee: SeedEmployee): Clearance[] {
  const record = ensureClearances(employee.id);
  return (Object.keys(clearanceMeta) as ClearanceDepartment[]).map((department) => ({
    department,
    ...clearanceMeta[department],
    ...record[department],
    blockers: record[department].status === "cleared" ? [] : clearanceBlockers(employee, department),
  }));
}

function exitLetters(employeeId: string): ExitLetterLink[] {
  return db()
    .lcIssuedLetters.filter((letter) => letter.employeeId === employeeId && (letter.kind === "relieving" || letter.kind === "experience"))
    .map((letter) => ({ id: letter.id, title: letter.title, href: `/documents/letters/${letter.id}`, issuedAt: letter.issuedAt }));
}

/** Reasons the exit can't close yet (clearances, reports, checklist, date). */
export function exitCompletionBlockers(employeeId: string): string[] {
  const store = db();
  const exit = store.exits.get(employeeId);
  const employee = employeeById(employeeId);
  if (!exit || !employee) return ["No exit case"];
  const blockers: string[] = [];
  for (const clearance of clearancesFor(employee)) if (clearance.status !== "cleared") blockers.push(`${clearance.label.split(" — ")[0]} clearance pending`);
  for (const task of checklist("offboarding")) if (task.blocking && !exit.tasks[task.id]) blockers.push(`${task.title}`);
  if (exit.lastWorkingDay > store.today) blockers.push(`Last working day is ${long(exit.lastWorkingDay)}`);
  return [...new Set(blockers)];
}

function offboardingDetail(employee: SeedEmployee): OffboardingDetail | null {
  const store = db();
  const exit = store.exits.get(employee.id);
  if (!exit) return null;
  const settlement = settlements().find((item) => item.employeeId === employee.id);
  const resignation = store.lcResignations.find((item) => item.employeeId === employee.id && item.state === "accepted");
  return {
    id: `off_${employee.id}`,
    person: ref(employee),
    department: employee.department,
    lastWorkingDay: exit.lastWorkingDay,
    reason: exit.reason,
    status: employee.status === "exited" ? "exited" : "notice",
    accessRevoked: Boolean(exit.tasks.access),
    tasks: checklist("offboarding").map((task) => ({ id: task.id, title: task.title, owner: task.owner, blocking: task.blocking, done: Boolean(exit.tasks[task.id]), due: addDays(exit.lastWorkingDay, -task.offsetDays) })),
    reasonNote: exit.note,
    startedAt: exit.startedAt,
    noticeShortfallDays: shortfallFor(employee.id, exit.lastWorkingDay),
    resignationReference: resignation?.reference ?? null,
    clearances: clearancesFor(employee),
    assets: store.lcAssets.filter((asset) => asset.assigneeId === employee.id && asset.status === "assigned").map((asset) => toAsset(asset, exit.lastWorkingDay)),
    interview: store.lcExitInterviews.get(employee.id) ?? null,
    settlement: settlement ? { id: settlement.id, reference: settlement.reference, state: settlement.state, net: inr(netOf(settlement.lines)) } : null,
    letters: exitLetters(employee.id),
    completeBlockers: employee.status === "exited" ? [] : exitCompletionBlockers(employee.id),
  };
}

export function offboardingBoard(actor: MockActor): OffboardingBoard {
  requireCapability(actor, "onboarding.manage");
  const store = db();
  const cases = [...store.exits.keys()]
    .map((id) => employeeById(id))
    .filter((employee): employee is SeedEmployee => Boolean(employee))
    .map(offboardingDetail)
    .filter((item): item is OffboardingDetail => item !== null)
    .sort((a, b) => (a.status === b.status ? a.lastWorkingDay.localeCompare(b.lastWorkingDay) : a.status === "notice" ? -1 : 1));
  const interviews = [...store.lcExitInterviews.values()];
  const counts = new Map<ResignationReason, number>();
  for (const interview of interviews) counts.set(interview.primaryReason, (counts.get(interview.primaryReason) ?? 0) + 1);
  const keys = ["role", "manager", "growth", "compensation", "culture", "workLife"] as const;
  return {
    today: store.today,
    cases,
    resignations: store.lcResignations.filter((item) => isOpen(item.state)).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).map((item) => toResignation(item, actor)),
    exitReasons: [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    averageRatings: keys.map((key) => ({ key, average: interviews.length ? (interviews.reduce((sum, item) => sum + item.ratings[key], 0) / interviews.length).toFixed(1) : "0" })),
    canDecide: isHr(actor),
  };
}

export function setClearance(actor: MockActor, input: ClearanceInput) {
  requireCapability(actor, "onboarding.manage");
  const store = db();
  const exit = store.exits.get(input.employeeId);
  const employee = employeeById(input.employeeId);
  if (!exit || !employee) throw problem(404, "NOT_FOUND", "That exit no longer exists.");
  if (employee.status === "exited") throw problem(409, "EXIT_CLOSED", "This exit is closed.");
  if (employee.id === actor.employeeId) throw problem(403, "SELF_EDIT", "You can't clear your own exit.");
  const record = ensureClearances(employee.id);
  if (input.status === "cleared") {
    const blockers = clearanceBlockers(employee, input.department);
    if (blockers.length) throw problem(409, "CLEARANCE_BLOCKED", `Can't clear yet: ${blockers.join("; ")}.`);
    record[input.department] = { status: "cleared", note: input.note || null, clearedBy: nameOf(actor), clearedAt: nowInstant() };
  } else {
    record[input.department] = { status: "pending", note: input.note || null, clearedBy: null, clearedAt: null };
  }
  // Keep the configurable exit checklist in step with department clearances.
  const done = input.status === "cleared";
  if (input.department === "manager") exit.tasks.handover = done;
  if (input.department === "it") exit.tasks.access = done;
  if (input.department === "finance") exit.tasks.fnf = done;
  exit.tasks.assets = record.it.status === "cleared" && record.admin.status === "cleared";
  return { ok: true };
}

export function saveExitInterview(actor: MockActor, input: ExitInterviewInput) {
  requireCapability(actor, "onboarding.manage");
  const store = db();
  const exit = store.exits.get(input.employeeId);
  if (!exit) throw problem(404, "NOT_FOUND", "That exit no longer exists.");
  if (input.employeeId === actor.employeeId) throw problem(403, "SELF_EDIT", "Someone else must record your exit interview.");
  store.lcExitInterviews.set(input.employeeId, {
    primaryReason: input.primaryReason,
    ratings: { role: input.role, manager: input.manager, growth: input.growth, compensation: input.compensation, culture: input.culture, workLife: input.workLife },
    wouldRejoin: input.wouldRejoin,
    wouldRecommend: input.wouldRecommend,
    comments: input.comments,
    conductedBy: nameOf(actor),
    conductedAt: nowInstant(),
  });
  exit.tasks.exit_interview = true;
  return { ok: true };
}

/** Issues relieving + experience letters on exit completion (skips kinds already issued). */
export function issueExitLetters(actor: MockActor, employeeId: string) {
  const employee = mustEmployee(employeeId);
  const store = db();
  for (const kind of ["relieving", "experience"] as const) {
    if (store.lcIssuedLetters.some((letter) => letter.employeeId === employeeId && letter.kind === kind)) continue;
    const template = store.lcLetterTemplates.find((item) => item.kind === kind && item.active);
    if (template) issue(actor, employee, template.id, {}, false);
  }
  const exit = store.exits.get(employeeId);
  if (exit) exit.tasks.relieving = true;
}

/* Assets ------------------------------------------------------------------- */

function toAsset(asset: MockAsset, asOf = db().today): Asset {
  return {
    id: asset.id,
    tag: asset.tag,
    category: asset.category,
    make: asset.make,
    model: asset.model,
    serial: asset.serial,
    purchasedOn: asset.purchasedOn,
    cost: inr(asset.costPaise),
    bookValue: inr(asset.status === "retired" ? 0 : bookValuePaise(asset.category, asset.costPaise, asset.purchasedOn, asOf)),
    condition: asset.condition,
    status: asset.status,
    assignee: refById(asset.assigneeId),
    assignedAt: asset.assignedAt,
    acknowledgedAt: asset.acknowledgedAt,
    notes: asset.notes,
    version: asset.version,
  };
}
function toAssetRequest(item: (ReturnType<typeof db>)["lcAssetRequests"][number]): AssetRequest[] {
  const requester = refById(item.employeeId);
  if (!requester) return [];
  return [{ id: item.id, reference: item.reference, requester, category: item.category, reason: item.reason, state: item.state, requestedAt: item.requestedAt, decidedAt: item.decidedAt, assetTag: item.assetId ? (db().lcAssets.find((asset) => asset.id === item.assetId)?.tag ?? null) : null, note: item.note }];
}
function historyEvent(asset: MockAsset, actor: string, text: string, kind: MockAsset["history"][number]["kind"], employeeId: string | null, note: string | null = null) {
  asset.history.push({ ...event(actor, text, note), employeeId, kind });
}

export function assetInventory(actor: MockActor): AssetInventory {
  requireCapability(actor, "asset.manage");
  const store = db();
  const assets: AssetDetail[] = store.lcAssets
    .map((asset) => ({ ...toAsset(asset), history: [...asset.history].reverse().map(({ employeeId: _e, kind: _k, ...rest }) => rest) }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
  const count = (status: MockAsset["status"]) => store.lcAssets.filter((asset) => asset.status === status).length;
  return {
    assets,
    requests: store.lcAssetRequests.flatMap(toAssetRequest).sort((a, b) => (a.state === b.state ? b.requestedAt.localeCompare(a.requestedAt) : a.state === "pending" ? -1 : 1)),
    people: store.employees.filter((employee) => employee.status !== "exited").sort((a, b) => a.name.localeCompare(b.name)).map(ref),
    totals: {
      count: store.lcAssets.length,
      assigned: count("assigned"),
      inStock: count("in_stock"),
      inRepair: count("in_repair"),
      retired: count("retired"),
      unacknowledged: store.lcAssets.filter((asset) => asset.status === "assigned" && !asset.acknowledgedAt).length,
      bookValue: inr(assets.reduce((sum, asset) => sum + Math.round(Number(asset.bookValue.amount) * 100), 0)),
    },
  };
}

export function myAssets(actor: MockActor): MyAssets {
  requireCapability(actor, "asset.read.self");
  const store = db();
  const returned = store.lcAssets.flatMap((asset) =>
    asset.history.filter((entry) => entry.kind === "returned" && entry.employeeId === actor.employeeId).map((entry) => ({ id: `${asset.id}_${entry.id}`, tag: asset.tag, label: `${asset.make} ${asset.model}`, returnedAt: entry.at, condition: entry.note ?? "Returned" })),
  );
  return {
    assigned: store.lcAssets.filter((asset) => asset.assigneeId === actor.employeeId && asset.status === "assigned").map((asset) => toAsset(asset)),
    returned: returned.sort((a, b) => b.returnedAt.localeCompare(a.returnedAt)),
    requests: store.lcAssetRequests.filter((item) => item.employeeId === actor.employeeId).flatMap(toAssetRequest).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
  };
}

const paiseOf = (amount: string) => Math.round(Number(amount) * 100);

export function saveAsset(actor: MockActor, input: AssetInput, key: string | undefined) {
  requireCapability(actor, "asset.manage");
  return idempotent(key, () => {
    const store = db();
    if (input.purchasedOn > store.today) throw problem(422, "FUTURE_DATE", "Purchase date can't be in the future.", { fieldErrors: { purchasedOn: "Today or earlier." } });
    const clash = store.lcAssets.find((asset) => asset.tag === input.tag && asset.id !== input.id);
    if (clash) throw problem(409, "DUPLICATE_TAG", `${input.tag} is already used.`, { fieldErrors: { tag: "This tag is already in use." } });
    const serialClash = store.lcAssets.find((asset) => asset.serial.toLowerCase() === input.serial.toLowerCase() && asset.id !== input.id);
    if (serialClash) throw problem(409, "DUPLICATE_SERIAL", `Serial already registered on ${serialClash.tag}.`, { fieldErrors: { serial: `Already on ${serialClash.tag}.` } });
    const who = nameOf(actor);
    if (input.id) {
      const asset = store.lcAssets.find((item) => item.id === input.id);
      if (!asset) throw problem(404, "NOT_FOUND", "That asset no longer exists.");
      Object.assign(asset, { tag: input.tag, category: input.category, make: input.make, model: input.model, serial: input.serial, purchasedOn: input.purchasedOn, costPaise: paiseOf(input.cost), condition: input.condition, notes: input.notes });
      asset.version += 1;
      historyEvent(asset, who, "Details edited", "edited", null);
      return { id: asset.id, tag: asset.tag };
    }
    const asset: MockAsset = { id: nextId("as"), tag: input.tag, category: input.category, make: input.make, model: input.model, serial: input.serial, purchasedOn: input.purchasedOn, costPaise: paiseOf(input.cost), condition: input.condition, status: "in_stock", assigneeId: null, assignedAt: null, acknowledgedAt: null, notes: input.notes, history: [], version: 1 };
    historyEvent(asset, who, "Added to inventory", "added", null, `Purchased ${input.purchasedOn}`);
    store.lcAssets.push(asset);
    return { id: asset.id, tag: asset.tag };
  });
}

export function assignAsset(actor: MockActor, input: AssetAssignInput) {
  requireCapability(actor, "asset.manage");
  const store = db();
  const asset = store.lcAssets.find((item) => item.id === input.assetId);
  if (!asset) throw problem(404, "NOT_FOUND", "That asset no longer exists.", { fieldErrors: { assetId: "Choose an available asset." } });
  if (asset.status !== "in_stock") throw problem(409, "NOT_AVAILABLE", `${asset.tag} is ${asset.status.replace("_", " ")} — only in-stock assets can be assigned.`, { fieldErrors: { assetId: "Not in stock." } });
  const employee = employeeById(input.employeeId);
  if (!employee || employee.status === "exited") throw problem(422, "INVALID_EMPLOYEE", "Choose an active employee.", { fieldErrors: { employeeId: "Choose an active employee." } });
  if (employee.status === "notice") throw problem(422, "SERVING_NOTICE", `${employee.name} is serving notice; new assets aren't issued during exit.`, { fieldErrors: { employeeId: "Serving notice." } });
  const request = input.requestId ? store.lcAssetRequests.find((item) => item.id === input.requestId) : undefined;
  if (input.requestId) {
    if (!request || request.state !== "pending") throw problem(409, "ALREADY_DECIDED", "That request was already handled.");
    if (request.employeeId !== employee.id) throw problem(422, "WRONG_EMPLOYEE", "Assign to the person who asked.", { fieldErrors: { employeeId: "Must be the requester." } });
    if (request.category !== asset.category) throw problem(422, "WRONG_CATEGORY", `The request is for a ${request.category.replace("_", " ")}.`, { fieldErrors: { assetId: "Pick a matching category." } });
  }
  asset.status = "assigned";
  asset.assigneeId = employee.id;
  asset.assignedAt = nowInstant();
  asset.acknowledgedAt = null;
  asset.version += 1;
  historyEvent(asset, nameOf(actor), `Assigned to ${employee.name}`, "assigned", employee.id, input.note || null);
  if (request) Object.assign(request, { state: "fulfilled", decidedAt: nowInstant(), assetId: asset.id, note: `Assigned ${asset.tag}.` });
  notify(employee.id, "system", "Asset assigned to you", `${asset.tag} · ${asset.make} ${asset.model}. Please acknowledge receipt.`, "/me/assets");
  return { tag: asset.tag, employee: employee.name };
}

export function returnAsset(actor: MockActor, input: AssetReturnInput) {
  requireCapability(actor, "asset.manage");
  const asset = db().lcAssets.find((item) => item.id === input.assetId);
  if (!asset) throw problem(404, "NOT_FOUND", "That asset no longer exists.");
  versionCheck(asset.version, input.expectedVersion);
  if (asset.status !== "assigned" || !asset.assigneeId) throw problem(409, "NOT_ASSIGNED", `${asset.tag} isn't assigned to anyone.`);
  const holder = employeeById(asset.assigneeId);
  const damaged = input.condition === "damaged";
  historyEvent(asset, nameOf(actor), `Returned by ${holder?.name ?? "employee"}`, "returned", asset.assigneeId, `${input.condition === "new" ? "Like new" : input.condition[0]!.toUpperCase() + input.condition.slice(1)} condition${input.note ? ` — ${input.note}` : ""}`);
  Object.assign(asset, { status: damaged ? "in_repair" : "in_stock", condition: input.condition, assigneeId: null, assignedAt: null, acknowledgedAt: null });
  asset.version += 1;
  if (holder) notify(holder.id, "system", "Asset return recorded", `${asset.tag} was checked in by ${nameOf(actor)}.`, "/me/assets");
  return { tag: asset.tag, status: asset.status };
}

export function setAssetStatus(actor: MockActor, input: AssetStatusInput) {
  requireCapability(actor, "asset.manage");
  const asset = db().lcAssets.find((item) => item.id === input.assetId);
  if (!asset) throw problem(404, "NOT_FOUND", "That asset no longer exists.");
  if (asset.status === "assigned") throw problem(409, "ASSIGNED", "Record the return before changing the status.");
  if (asset.status === "retired") throw problem(409, "RETIRED", "Retired assets can't be reactivated; add a new record instead.");
  if (asset.status === input.status) throw problem(409, "NO_CHANGE", "That's already the status.");
  asset.status = input.status;
  if (input.status === "in_stock" && asset.condition === "damaged") asset.condition = "good";
  asset.version += 1;
  const labels = { in_stock: "Back in stock", in_repair: "Sent for repair", retired: "Retired" } as const;
  historyEvent(asset, nameOf(actor), labels[input.status], "status", null, input.note);
  return { tag: asset.tag, status: asset.status };
}

export function acknowledgeAsset(actor: MockActor, assetId: string) {
  requireCapability(actor, "asset.read.self");
  const asset = db().lcAssets.find((item) => item.id === assetId && item.assigneeId === actor.employeeId && item.status === "assigned");
  if (!asset) throw problem(404, "NOT_FOUND", "That asset isn't assigned to you.");
  if (asset.acknowledgedAt) throw problem(409, "ALREADY_ACKNOWLEDGED", "You already acknowledged this asset.");
  asset.acknowledgedAt = nowInstant();
  asset.version += 1;
  historyEvent(asset, nameOf(actor), "Receipt acknowledged", "acknowledged", actor.employeeId);
  return { tag: asset.tag };
}

export function requestAsset(actor: MockActor, input: AssetRequestInput, key: string | undefined) {
  requireCapability(actor, "asset.read.self");
  return idempotent(key, () => {
    const store = db();
    const employee = me(actor);
    if (employee.status === "notice" || employee.status === "exited") throw problem(409, "SERVING_NOTICE", "New assets aren't issued during your exit.");
    if (store.lcAssetRequests.some((item) => item.employeeId === employee.id && item.category === input.category && item.state === "pending"))
      throw problem(409, "REQUEST_PENDING", "You already have a pending request for this kind of asset.", { fieldErrors: { category: "Already requested." } });
    const reference = nextReference("AR");
    store.lcAssetRequests.push({ id: nextId("ar"), reference, employeeId: employee.id, category: input.category, reason: input.reason, state: "pending", requestedAt: nowInstant(), decidedAt: null, assetId: null, note: null });
    for (const hr of hrPartners()) if (hr !== employee.id) notify(hr, "approval", "Asset request", `${employee.name} · ${input.category.replace("_", " ")}`, "/admin/assets");
    return { reference };
  });
}

export function rejectAssetRequest(actor: MockActor, requestId: string, note: string) {
  requireCapability(actor, "asset.manage");
  const item = db().lcAssetRequests.find((entry) => entry.id === requestId);
  if (!item) throw problem(404, "NOT_FOUND", "That request no longer exists.");
  if (item.state !== "pending") throw problem(409, "ALREADY_DECIDED", "That request was already handled.");
  if (item.employeeId === actor.employeeId) throw problem(403, "SELF_APPROVAL", "Someone else must decide your request.");
  Object.assign(item, { state: "rejected", decidedAt: nowInstant(), note });
  notify(item.employeeId, "system", "Asset request declined", note, "/me/assets");
  return { reference: item.reference };
}

/* Full & final settlement -------------------------------------------------- */

/** Settlements, with seeded open ones calculated from live inputs on first read. */
function settlements(): MockSettlement[] {
  const list = db().lcSettlements;
  for (const item of list)
    if (item.calculateOnLoad) {
      item.calculateOnLoad = false;
      recompute(item);
    }
  return list;
}

const netOf = (lines: MockSettlementLine[]) => lines.reduce((sum, line) => sum + (line.kind === "earning" ? line.paise : -line.paise), 0);

function autoLines(settlement: Pick<MockSettlement, "employeeId" | "lastWorkingDay" | "noticeShortfallDays" | "noticeWaived" | "lines">) {
  const store = db();
  const employee = mustEmployee(settlement.employeeId);
  const loans = store.loans
    .filter((loan) => loan.employeeId === employee.id && (loan.state === "active" || loan.state === "approved"))
    .map((loan) => ({ reference: loan.reference, label: loan.type.replace(/_/g, " "), outstandingPaise: Math.round((loan.principalPaise * Math.max(0, loan.tenureMonths - loan.paidInstallments)) / loan.tenureMonths / 100) * 100 }));
  return computeSettlement({
    employee,
    lastWorkingDay: settlement.lastWorkingDay,
    elHalves: availableHalves(employee.id, "lt_el", settlement.lastWorkingDay) ?? 0,
    noticeShortfallDays: settlement.noticeShortfallDays,
    noticeWaived: settlement.noticeWaived,
    reimbursements: store.expenses.filter((claim) => claim.employeeId === employee.id && (claim.state === "manager_approved" || claim.state === "finance_approved")).map((claim) => ({ reference: claim.reference, title: claim.title, paise: claim.amountPaise })),
    loans,
    assets: store.lcAssets.filter((asset) => asset.assigneeId === employee.id && asset.status === "assigned").map((asset) => ({ tag: asset.tag, label: `${asset.make} ${asset.model}`, paise: bookValuePaise(asset.category, asset.costPaise, asset.purchasedOn, settlement.lastWorkingDay) })),
    manual: settlement.lines.filter((line) => line.manual).map((line) => ({ kind: line.kind, paise: line.paise })),
  });
}
const fingerprint = (lines: { code: string; paise: number }[]) => lines.map((line) => `${line.code}:${line.paise}`).sort().join("|");
function isStale(settlement: MockSettlement) {
  if (settlement.state === "approved" || settlement.state === "paid") return false;
  return fingerprint(autoLines(settlement)) !== fingerprint(settlement.lines.filter((line) => !line.manual));
}
function recompute(settlement: MockSettlement) {
  const manual = settlement.lines.filter((line) => line.manual);
  settlement.lines = [...autoLines(settlement).map((line) => ({ id: nextId("sl"), ...line, manual: false, reason: null })), ...manual];
}
function touch(settlement: MockSettlement, actor: MockActor, text: string, note: string | null = null) {
  settlement.audit.push(event(nameOf(actor), text, note));
  settlement.updatedAt = nowInstant();
  settlement.version += 1;
}
function requireSettlementAccess(actor: MockActor) {
  if (!can(actor, "settlement.prepare") && !can(actor, "settlement.approve")) throw problem(403, "FORBIDDEN", "You don't have access to this.");
}
function findSettlement(id: string) {
  const settlement = settlements().find((item) => item.id === id);
  if (!settlement) throw problem(404, "NOT_FOUND", "That settlement no longer exists.");
  return settlement;
}
function editable(actor: MockActor, settlement: MockSettlement, expectedVersion?: number) {
  requireCapability(actor, "settlement.prepare");
  versionCheck(settlement.version, expectedVersion);
  if (settlement.state !== "draft" && settlement.state !== "rejected") throw problem(409, "LOCKED", "Submitted settlements are locked. Ask the approver to send it back.");
  if (settlement.employeeId === actor.employeeId) throw problem(403, "SELF_EDIT", "You can't work on your own settlement.");
}

function toSummary(settlement: MockSettlement): SettlementSummary {
  const employee = mustEmployee(settlement.employeeId);
  return { id: settlement.id, reference: settlement.reference, person: ref(employee), department: employee.department, lastWorkingDay: settlement.lastWorkingDay, state: settlement.state, net: inr(netOf(settlement.lines)), preparedBy: employeeById(settlement.preparedById)?.name ?? "Payroll", updatedAt: settlement.updatedAt };
}

export function settlementBoard(actor: MockActor): SettlementBoard {
  requireSettlementAccess(actor);
  const store = db();
  const settled = new Set(settlements().map((item) => item.employeeId));
  return {
    settlements: settlements().map(toSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    eligible: [...store.exits.values()]
      .filter((exit) => !settled.has(exit.employeeId) && exit.employeeId !== actor.employeeId)
      .flatMap((exit) => {
        const employee = employeeById(exit.employeeId);
        return employee ? [{ person: ref(employee), department: employee.department, lastWorkingDay: exit.lastWorkingDay }] : [];
      })
      .sort((a, b) => a.lastWorkingDay.localeCompare(b.lastWorkingDay)),
    canPrepare: can(actor, "settlement.prepare"),
    canApprove: can(actor, "settlement.approve"),
  };
}

export function settlementDetail(actor: MockActor, id: string): SettlementDetail {
  requireSettlementAccess(actor);
  const store = db();
  const settlement = findSettlement(id);
  const employee = mustEmployee(settlement.employeeId);
  const structure = monthlyStructure(employee.annualCtc, employee.type);
  const stale = isStale(settlement);
  const earnings = settlement.lines.filter((line) => line.kind === "earning").reduce((sum, line) => sum + line.paise, 0);
  const deductions = settlement.lines.filter((line) => line.kind === "deduction").reduce((sum, line) => sum + line.paise, 0);
  const warnings: string[] = [];
  const unapproved = store.expenses.filter((claim) => claim.employeeId === employee.id && claim.state === "submitted");
  if (unapproved.length) warnings.push(`${unapproved.length} reimbursement claim${unapproved.length === 1 ? " is" : "s are"} still awaiting approval and not included.`);
  if (store.leaveRequests.some((request) => request.employeeId === employee.id && request.state === "pending")) warnings.push("Pending leave requests may change the encashable balance.");
  if (earnings - deductions < 0) warnings.push("Net is recoverable from the employee — collect it before issuing the relieving letter.");
  if (stale) warnings.push("Inputs changed since calculation (assets, leave, claims or loans). Recalculate before submitting or approving.");
  const self = settlement.employeeId === actor.employeeId;
  const prepare = can(actor, "settlement.prepare") && !self;
  const approve = can(actor, "settlement.approve") && !self;
  let approveBlockedReason: string | null = null;
  if (approve && settlement.state === "submitted") {
    if (settlement.preparedById === actor.employeeId) approveBlockedReason = "You prepared this settlement; a different approver must check it.";
    else if (stale) approveBlockedReason = "Inputs changed since submission — send it back for recalculation.";
  }
  const service = serviceLength(employee.joinedOn, settlement.lastWorkingDay);
  return {
    ...toSummary(settlement),
    code: employee.code,
    designation: employee.designation,
    joinedOn: employee.joinedOn,
    service: `${service.years} years ${service.months} months ${service.days} days`,
    employmentType: employee.type === "full_time" ? "Full-time" : employee.type === "contract" ? "Contract" : "Intern",
    noticeDays: settlement.noticeDays,
    noticeShortfallDays: settlement.noticeShortfallDays,
    noticeWaived: settlement.noticeWaived,
    waiverReason: settlement.waiverReason,
    monthlyGross: inr(structure.gross),
    monthlyBasic: inr(structure.basic),
    lines: settlement.lines.map((line) => ({ id: line.id, code: line.code, kind: line.kind, label: line.label, detail: line.detail, amount: inr(line.paise), manual: line.manual, reason: line.reason })),
    earnings: inr(earnings),
    deductions: inr(deductions),
    preparedAt: settlement.preparedAt,
    submittedAt: settlement.submittedAt,
    approvedBy: employeeById(settlement.approvedById ?? "")?.name ?? null,
    approvedAt: settlement.approvedAt,
    rejectionNote: settlement.rejectionNote,
    paidAt: settlement.paidAt,
    paidOn: settlement.paidOn,
    utr: settlement.utr,
    stale,
    warnings,
    audit: [...settlement.audit].reverse(),
    version: settlement.version,
    permissions: {
      canEdit: prepare && (settlement.state === "draft" || settlement.state === "rejected"),
      canSubmit: prepare && (settlement.state === "draft" || settlement.state === "rejected"),
      canApprove: approve && settlement.state === "submitted" && approveBlockedReason === null,
      approveBlockedReason,
      canPay: approve && settlement.state === "approved",
    },
  };
}

export function prepareSettlement(actor: MockActor, employeeId: string, key: string | undefined) {
  requireCapability(actor, "settlement.prepare");
  return idempotent(key, () => {
    const store = db();
    const employee = mustEmployee(employeeId);
    if (employee.id === actor.employeeId) throw problem(403, "SELF_EDIT", "You can't prepare your own settlement.");
    const exit = store.exits.get(employee.id);
    if (!exit) throw problem(409, "NO_EXIT", "Start the exit (or accept the resignation) before preparing the settlement.");
    const existing = settlements().find((item) => item.employeeId === employee.id);
    if (existing) throw problem(409, "SETTLEMENT_EXISTS", `${existing.reference} already exists for ${employee.name}.`);
    const resignation = store.lcResignations.find((item) => item.employeeId === employee.id && item.state === "accepted");
    const settlement: MockSettlement = {
      id: nextId("st"),
      reference: nextReference("FNF"),
      employeeId: employee.id,
      lastWorkingDay: exit.lastWorkingDay,
      noticeDays: resignation?.noticeDays ?? noticeFor(employee).days,
      noticeShortfallDays: shortfallFor(employee.id, exit.lastWorkingDay),
      noticeWaived: false,
      waiverReason: null,
      lines: [],
      state: "draft",
      preparedById: actor.employeeId,
      preparedAt: nowInstant(),
      submittedAt: null,
      approvedById: null,
      approvedAt: null,
      rejectionNote: null,
      paidAt: null,
      paidOn: null,
      utr: null,
      audit: [],
      updatedAt: nowInstant(),
      version: 0,
    };
    recompute(settlement);
    touch(settlement, actor, "Prepared from last working day", `Last working day ${long(exit.lastWorkingDay)}`);
    settlements().push(settlement);
    return { id: settlement.id, reference: settlement.reference };
  });
}

export function recalculateSettlement(actor: MockActor, id: string, expectedVersion: number | undefined) {
  const settlement = findSettlement(id);
  editable(actor, settlement, expectedVersion);
  const before = netOf(settlement.lines);
  recompute(settlement);
  touch(settlement, actor, "Recalculated", `Net ${formatMoney(inr(before))} → ${formatMoney(inr(netOf(settlement.lines)))}`);
  return { reference: settlement.reference };
}

export function addSettlementLine(actor: MockActor, input: SettlementLineInput) {
  const settlement = findSettlement(input.settlementId);
  editable(actor, settlement, input.expectedVersion);
  const paise = Math.round(Number(input.amount) * 100);
  if (paise <= 0) throw problem(422, "INVALID_AMOUNT", "Enter an amount above zero.", { fieldErrors: { amount: "Above zero." } });
  settlement.lines.push({ id: nextId("sl"), code: input.kind === "earning" ? "BONUS" : "ADJ", kind: input.kind, label: input.label, detail: "Manual adjustment", paise, manual: true, reason: input.reason });
  recompute(settlement);
  touch(settlement, actor, "Manual line added", `${input.label} · ${formatMoney(inr(paise))} (${input.kind})`);
  return { reference: settlement.reference };
}

export function removeSettlementLine(actor: MockActor, id: string, lineId: string) {
  const settlement = findSettlement(id);
  editable(actor, settlement);
  const line = settlement.lines.find((item) => item.id === lineId && item.manual);
  if (!line) throw problem(404, "NOT_FOUND", "Only manual lines can be removed.");
  settlement.lines = settlement.lines.filter((item) => item !== line);
  recompute(settlement);
  touch(settlement, actor, "Manual line removed", line.label);
  return { reference: settlement.reference };
}

export function setNoticeWaiver(actor: MockActor, input: SettlementWaiverInput) {
  const settlement = findSettlement(input.settlementId);
  editable(actor, settlement, input.expectedVersion);
  if (!isHr(actor)) throw problem(403, "HR_ONLY", "Only HR can waive notice pay recovery.");
  if (settlement.noticeShortfallDays <= 0) throw problem(409, "NO_SHORTFALL", "There is no notice shortfall to waive.");
  settlement.noticeWaived = input.waive;
  settlement.waiverReason = input.waive ? input.reason : null;
  recompute(settlement);
  touch(settlement, actor, input.waive ? "Notice recovery waived" : "Notice recovery reinstated", input.waive ? input.reason : null);
  return { reference: settlement.reference };
}

export function submitSettlement(actor: MockActor, id: string, expectedVersion: number | undefined) {
  const settlement = findSettlement(id);
  editable(actor, settlement, expectedVersion);
  recompute(settlement);
  settlement.state = "submitted";
  settlement.submittedAt = nowInstant();
  settlement.rejectionNote = null;
  touch(settlement, actor, "Submitted for approval", `Net ${formatMoney(inr(netOf(settlement.lines)))}`);
  const employee = mustEmployee(settlement.employeeId);
  for (const approver of approvers()) if (approver !== actor.employeeId && approver !== employee.id) notify(approver, "payroll", "F&F settlement to approve", `${settlement.reference} · ${employee.name}`, `/admin/settlements/${settlement.id}`);
  return { reference: settlement.reference };
}

export function decideSettlement(actor: MockActor, input: SettlementDecisionInput) {
  requireCapability(actor, "settlement.approve");
  const settlement = findSettlement(input.settlementId);
  versionCheck(settlement.version, input.expectedVersion);
  if (settlement.state !== "submitted") throw problem(409, "ALREADY_DECIDED", "This settlement isn't awaiting approval.");
  if (settlement.employeeId === actor.employeeId) throw problem(403, "SELF_APPROVAL", "You can't approve your own settlement.");
  if (settlement.preparedById === actor.employeeId) throw problem(403, "MAKER_CHECKER", "The preparer can't approve the same settlement.");
  if (input.decision === "approve") {
    if (isStale(settlement)) throw problem(409, "STALE_INPUTS", "Inputs changed since submission. Send it back for recalculation.");
    settlement.state = "approved";
    settlement.approvedById = actor.employeeId;
    settlement.approvedAt = nowInstant();
    touch(settlement, actor, "Approved", input.note || null);
    const exit = db().exits.get(settlement.employeeId);
    if (exit) exit.tasks.fnf = true;
  } else {
    settlement.state = "rejected";
    settlement.rejectionNote = input.note;
    touch(settlement, actor, "Sent back", input.note);
  }
  notify(settlement.preparedById, "payroll", input.decision === "approve" ? "Settlement approved" : "Settlement sent back", `${settlement.reference}${input.note ? ` · ${input.note}` : ""}`, `/admin/settlements/${settlement.id}`);
  return { reference: settlement.reference, state: settlement.state };
}

export function markSettlementPaid(actor: MockActor, input: SettlementPaymentInput) {
  requireCapability(actor, "settlement.approve");
  const store = db();
  const settlement = findSettlement(input.settlementId);
  versionCheck(settlement.version, input.expectedVersion);
  if (settlement.state !== "approved") throw problem(409, "NOT_APPROVED", "Only approved settlements can be marked paid.");
  if (input.paidOn > store.today) throw problem(422, "FUTURE_DATE", "Payment date can't be in the future.", { fieldErrors: { paidOn: "Today or earlier." } });
  if (settlement.approvedAt && input.paidOn < settlement.approvedAt.slice(0, 10)) throw problem(422, "BEFORE_APPROVAL", "Payment can't precede approval.", { fieldErrors: { paidOn: "On or after the approval date." } });
  if (settlements().some((item) => item.utr === input.utr)) throw problem(409, "DUPLICATE_UTR", "This UTR is already recorded on another settlement.", { fieldErrors: { utr: "Already used." } });
  settlement.state = "paid";
  settlement.paidAt = nowInstant();
  settlement.paidOn = input.paidOn;
  settlement.utr = input.utr;
  touch(settlement, actor, "Marked paid", `UTR ${input.utr} · ${long(input.paidOn)}`);
  notify(settlement.employeeId, "payroll", "Full & final settlement paid", `${settlement.reference} was paid on ${long(input.paidOn)}.`, "/me/resignation");
  return { reference: settlement.reference };
}

/* Letter templates --------------------------------------------------------- */

export const letterKindLabels: Record<LetterKind, string> = {
  offer: "Offer letter",
  appointment: "Appointment letter",
  confirmation: "Confirmation letter",
  increment: "Increment letter",
  experience: "Experience letter",
  relieving: "Relieving letter",
  address_proof: "Address proof letter",
  employment_verification: "Employment verification",
  salary_certificate: "Salary certificate",
  visa_letter: "Visa / travel letter",
};

function addressOf(employee: SeedEmployee) {
  const n = Number(employee.id.slice(-4));
  return db().profileOverrides.get(employee.id)?.address ?? `${100 + n}, Sample Residency, ${employee.location === "Remote" ? "Pune" : employee.location.replace(" HQ", "")}`;
}

function letterValues(employee: SeedEmployee, signer: SeedEmployee | undefined, extra: { reference?: string; purpose?: string; addressedTo?: string }): Record<string, string | null> {
  const store = db();
  const exit = store.exits.get(employee.id);
  const resignation = store.lcResignations.find((item) => item.employeeId === employee.id && item.state === "accepted");
  const lastDay = exit?.lastWorkingDay ?? resignation?.agreedLastWorkingDay ?? null;
  const structure = monthlyStructure(employee.annualCtc, employee.type);
  const probation = probationOf(employee);
  const service = serviceLength(employee.joinedOn, lastDay ?? store.today);
  const manager = employeeById(employee.managerId ?? "");
  const full = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return {
    "employee.name": employee.name,
    "employee.firstName": employee.name.split(" ")[0] ?? employee.name,
    "employee.code": employee.code,
    designation: employee.designation,
    department: employee.department,
    location: employee.location,
    manager: manager ? `${manager.name}, ${manager.designation}` : null,
    joinedOn: full(employee.joinedOn),
    ctc: employee.annualCtc > 0 ? `${formatMoney(inr(employee.annualCtc * 100), { decimals: false })} per annum` : null,
    monthlyGross: employee.annualCtc > 0 ? formatMoney(inr(structure.gross), { decimals: false }) : null,
    probationEndsOn: probation.endsOn ? full(probation.endsOn) : null,
    lastWorkingDay: lastDay ? full(lastDay) : null,
    service: `${service.years} year${service.years === 1 ? "" : "s"} ${service.months} month${service.months === 1 ? "" : "s"}`,
    address: addressOf(employee),
    today: full(store.today),
    reference: extra.reference ?? "LTR-(assigned on issue)",
    company: organization.name,
    legalEntity: organization.legalEntity,
    signatory: signer?.name ?? "HR Operations",
    signatoryTitle: signer?.designation ?? "People & Culture",
    purpose: extra.purpose || null,
    addressedTo: extra.addressedTo || null,
  };
}

function toTemplate(template: (ReturnType<typeof db>)["lcLetterTemplates"][number]): LetterTemplate {
  return { ...template, issuedCount: db().lcIssuedLetters.filter((letter) => letter.templateId === template.id).length };
}
function toIssued(letter: MockIssuedLetter): IssuedLetter[] {
  const employee = employeeById(letter.employeeId);
  if (!employee) return [];
  return [{ id: letter.id, reference: letter.reference, kind: letter.kind, title: letter.title, subject: letter.subject, body: letter.body, person: ref(employee), employeeCode: employee.code, issuedAt: letter.issuedAt, issuedBy: letter.issuedBy, templateName: letter.templateName, href: `/documents/letters/${letter.id}` }];
}

export function letterStudio(actor: MockActor, selection: { templateId?: string | undefined; employeeId?: string | undefined; purpose?: string | undefined; addressedTo?: string | undefined }): LetterStudio {
  requireCapability(actor, "letter.issue");
  const store = db();
  let preview: LetterStudio["preview"] = null;
  const template = store.lcLetterTemplates.find((item) => item.id === selection.templateId);
  const employee = selection.employeeId ? employeeById(selection.employeeId) : undefined;
  if (template && employee) {
    const values = letterValues(employee, me(actor), { purpose: selection.purpose ?? "", addressedTo: selection.addressedTo ?? "" });
    const subject = renderTemplate(template.subject, values);
    const body = renderTemplate(template.body, values);
    preview = { templateId: template.id, employeeId: employee.id, subject: subject.text, body: body.text, missing: [...new Set([...subject.missing, ...body.missing])].map((key) => letterPlaceholders.find((item) => item.key === key)?.label ?? key) };
  }
  return {
    templates: store.lcLetterTemplates.map(toTemplate).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    placeholders: letterPlaceholders,
    people: store.employees.slice().sort((a, b) => a.name.localeCompare(b.name)).map((person) => ({ ...ref(person), code: person.code, status: person.status })),
    preview,
    issued: store.lcIssuedLetters.flatMap(toIssued).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0, 25),
  };
}

export function saveLetterTemplate(actor: MockActor, input: LetterTemplateInput) {
  requireCapability(actor, "letter.issue");
  const store = db();
  const unknown = unknownPlaceholders(`${input.subject}\n${input.body}`);
  if (unknown.length) throw problem(422, "UNKNOWN_PLACEHOLDER", `Unknown placeholder${unknown.length === 1 ? "" : "s"}: ${unknown.map((key) => `{{${key}}}`).join(", ")}.`, { fieldErrors: { body: `Unknown: ${unknown.map((key) => `{{${key}}}`).join(", ")}` } });
  const clash = store.lcLetterTemplates.find((item) => item.name.toLowerCase() === input.name.toLowerCase() && item.id !== input.id);
  if (clash) throw problem(409, "DUPLICATE_NAME", "Another template has this name.", { fieldErrors: { name: "Name already used." } });
  const who = nameOf(actor);
  if (input.id) {
    const template = store.lcLetterTemplates.find((item) => item.id === input.id);
    if (!template) throw problem(404, "NOT_FOUND", "That template no longer exists.");
    Object.assign(template, { name: input.name, kind: input.kind, subject: input.subject, body: input.body, active: input.active, updatedAt: nowInstant(), updatedBy: who, version: template.version + 1 });
    return { id: template.id };
  }
  const id = nextId("tpl");
  store.lcLetterTemplates.push({ id, name: input.name, kind: input.kind, subject: input.subject, body: input.body, active: input.active, updatedAt: nowInstant(), updatedBy: who, version: 1 });
  return { id };
}

const EXIT_KINDS: LetterKind[] = ["experience", "relieving"];

function issue(actor: MockActor, employee: SeedEmployee, templateId: string | null, extra: { purpose?: string; addressedTo?: string; kind?: LetterKind }, strict = true): MockIssuedLetter {
  const store = db();
  const template = templateId ? store.lcLetterTemplates.find((item) => item.id === templateId) : undefined;
  if (templateId && (!template || !template.active)) throw problem(422, "TEMPLATE_INACTIVE", "Choose an active template.", { fieldErrors: { templateId: "Choose an active template." } });
  const kind = template?.kind ?? extra.kind ?? "employment_verification";
  if (EXIT_KINDS.includes(kind) && !store.exits.has(employee.id) && employee.status !== "exited")
    throw problem(422, "NOT_ELIGIBLE", `${letterKindLabels[kind]}s are issued only for employees with an exit case.`, { fieldErrors: { employeeId: "No exit in progress." } });
  const reference = nextReference("LTR");
  const values = letterValues(employee, me(actor), { reference, ...extra });
  const subjectText = template?.subject ?? letterKindLabels[kind];
  const bodyText =
    template?.body ??
    `Date: {{today}}\nRef: {{reference}}\n\nTO WHOMSOEVER IT MAY CONCERN\n\nThis is to certify that {{employee.name}} (Employee code {{employee.code}}) is employed with {{legalEntity}} as {{designation}} in the {{department}} department since {{joinedOn}}.\n\nThis letter is issued at the employee's request for {{purpose}}.\n\nFor {{legalEntity}}\n\n{{signatory}}\n{{signatoryTitle}}`;
  const subject = renderTemplate(subjectText, values);
  const body = renderTemplate(bodyText, values);
  const missing = [...new Set([...subject.missing, ...body.missing])];
  if (strict && missing.length) {
    const labels = missing.map((key) => letterPlaceholders.find((item) => item.key === key)?.label ?? key);
    throw problem(422, "MISSING_VALUES", `This letter needs: ${labels.join(", ")}.`);
  }
  const letter: MockIssuedLetter = { id: nextId("il"), reference, employeeId: employee.id, kind, title: template?.name ?? letterKindLabels[kind], subject: subject.text, body: body.text, issuedAt: nowInstant(), issuedBy: nameOf(actor), templateId: template?.id ?? null, templateName: template?.name ?? null };
  store.lcIssuedLetters.push(letter);
  notify(employee.id, "system", `${letter.title} issued`, `${reference} is in your Document center.`, `/documents/letters/${letter.id}`);
  return letter;
}

export function generateLetter(actor: MockActor, input: { templateId: string; employeeId: string; purpose: string; addressedTo: string }, key: string | undefined) {
  requireCapability(actor, "letter.issue");
  return idempotent(key, () => {
    const employee = employeeById(input.employeeId);
    if (!employee) throw problem(422, "INVALID_EMPLOYEE", "Choose an employee.", { fieldErrors: { employeeId: "Choose an employee." } });
    if (employee.id === actor.employeeId) throw problem(403, "SELF_APPROVAL", "Someone else must issue your letters.");
    const letter = issue(actor, employee, input.templateId, { purpose: input.purpose, addressedTo: input.addressedTo });
    return { id: letter.id, reference: letter.reference };
  });
}

const requestKind: Record<string, LetterKind> = {
  address_proof: "address_proof",
  employment_verification: "employment_verification",
  salary_certificate: "salary_certificate",
  visa_letter: "visa_letter",
  experience_letter: "experience",
};

/** Fulfils an employee letter request with the matching active template (or a generic body). */
export function issueRequestedLetter(actor: MockActor, request: { employeeId: string; type: string; purpose: string; addressedTo: string }): { id: string; title: string } {
  const employee = mustEmployee(request.employeeId);
  const kind = requestKind[request.type] ?? "employment_verification";
  const template = db().lcLetterTemplates.find((item) => item.kind === kind && item.active);
  const letter = issue(actor, employee, template?.id ?? null, { kind, purpose: request.purpose, addressedTo: request.addressedTo || "To whomsoever it may concern" });
  return { id: letter.id, title: letter.title };
}

export function issuedLetter(actor: MockActor, id: string): IssuedLetter {
  const letter = db().lcIssuedLetters.find((item) => item.id === id);
  if (!letter || (letter.employeeId !== actor.employeeId && !can(actor, "letter.issue"))) throw problem(404, "NOT_FOUND", "We couldn't find that letter.");
  const [dto] = toIssued(letter);
  if (!dto) throw problem(404, "NOT_FOUND", "We couldn't find that letter.");
  return dto;
}

/** Document-center rows for letters issued to one employee. */
export function issuedLetterDocuments(employeeId: string) {
  return db()
    .lcIssuedLetters.filter((letter) => letter.employeeId === employeeId)
    .map((letter) => ({ id: `doc_${letter.id}`, name: `${letter.title} — ${letter.reference}.pdf`, category: "employment" as const, mime: "application/pdf" as const, sizeBytes: 90_000 + letter.body.length * 24, uploadedAt: letter.issuedAt, uploadedBy: letter.issuedBy, scanState: "clean" as const, href: `/documents/letters/${letter.id}` }));
}

/* Policy acknowledgements -------------------------------------------------- */

function audienceOf(policy: MockPolicy): SeedEmployee[] {
  return db().employees.filter((employee) => employee.status !== "exited" && (policy.audience === "Everyone" || employee.department === policy.audience));
}
const inAudience = (policy: MockPolicy, employee: SeedEmployee) => policy.audience === "Everyone" || employee.department === policy.audience;

export function policyBoard(actor: MockActor): PolicyAck[] {
  requireCapability(actor, "policy.publish");
  return db()
    .lcPolicies.slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((policy) => {
      const members = audienceOf(policy);
      const done = members.filter((employee) => policy.acks[employee.id]);
      return {
        id: policy.id,
        title: policy.title,
        version: policy.version,
        summary: policy.summary,
        body: policy.body,
        audience: policy.audience,
        publishedAt: policy.publishedAt,
        publishedBy: policy.publishedBy,
        dueOn: policy.dueOn,
        total: members.length,
        acknowledged: done.length,
        pending: members.filter((employee) => !policy.acks[employee.id]).sort((a, b) => a.name.localeCompare(b.name)).map((employee) => ({ ...ref(employee), department: employee.department })),
        recent: done.map((employee) => ({ person: ref(employee), at: policy.acks[employee.id] ?? policy.publishedAt })).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
        reminders: [...policy.reminders].reverse(),
      };
    });
}

export function publishPolicy(actor: MockActor, input: PolicyPublishInput, key: string | undefined) {
  requireCapability(actor, "policy.publish");
  return idempotent(key, () => {
    const store = db();
    if (input.audience !== "Everyone" && !departmentNames().includes(input.audience)) throw problem(422, "INVALID_AUDIENCE", "Choose everyone or a department.", { fieldErrors: { audience: "Choose a department." } });
    if (input.dueOn <= store.today) throw problem(422, "INVALID_DUE", "Give people at least a day to acknowledge.", { fieldErrors: { dueOn: "After today." } });
    if (input.dueOn > addDays(store.today, 90)) throw problem(422, "INVALID_DUE", "Keep the due date within 90 days.", { fieldErrors: { dueOn: "Within 90 days." } });
    const version = input.version.startsWith("v") ? input.version : `v${input.version}`;
    if (store.lcPolicies.some((policy) => policy.title.toLowerCase() === input.title.toLowerCase() && policy.version === version)) throw problem(409, "DUPLICATE_VERSION", "This version is already published — bump the version.", { fieldErrors: { version: "Already published." } });
    const policy: MockPolicy = { id: nextId("pol"), title: input.title, version, summary: input.summary, body: input.body, audience: input.audience, publishedAt: nowInstant(), publishedBy: nameOf(actor), dueOn: input.dueOn, acks: {}, reminders: [] };
    store.lcPolicies.push(policy);
    const members = audienceOf(policy);
    for (const employee of members) notify(employee.id, "system", "Policy to acknowledge", `${policy.title} ${version} · due ${long(input.dueOn)}`, "/documents?tab=policies");
    return { id: policy.id, audience: members.length };
  });
}

export function remindPolicy(actor: MockActor, id: string) {
  requireCapability(actor, "policy.publish");
  const policy = db().lcPolicies.find((item) => item.id === id);
  if (!policy) throw problem(404, "NOT_FOUND", "That policy no longer exists.");
  const pending = audienceOf(policy).filter((employee) => !policy.acks[employee.id]);
  if (!pending.length) throw problem(409, "ALL_DONE", "Everyone has acknowledged this policy.");
  const last = policy.reminders.at(-1);
  if (last && Date.now() - new Date(last.at).getTime() < 60 * 60 * 1000) throw problem(429, "RECENTLY_REMINDED", "A reminder went out within the last hour.");
  for (const employee of pending) notify(employee.id, "system", "Reminder: acknowledge policy", `${policy.title} ${policy.version} · due ${long(policy.dueOn)}`, "/documents?tab=policies");
  policy.reminders.push({ at: nowInstant(), by: nameOf(actor), count: pending.length });
  return { count: pending.length };
}

export function myPolicies(actor: MockActor): MyPolicy[] {
  requireCapability(actor, "document.read");
  const store = db();
  const employee = me(actor);
  return store.lcPolicies
    .filter((policy) => inAudience(policy, employee))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((policy) => ({ id: policy.id, title: policy.title, version: policy.version, summary: policy.summary, body: policy.body, dueOn: policy.dueOn, publishedAt: policy.publishedAt, acknowledgedAt: policy.acks[employee.id] ?? null, overdue: !policy.acks[employee.id] && policy.dueOn < store.today }));
}

export function acknowledgePolicy(actor: MockActor, id: string) {
  requireCapability(actor, "document.read");
  const employee = me(actor);
  const policy = db().lcPolicies.find((item) => item.id === id);
  if (!policy || !inAudience(policy, employee)) throw problem(404, "NOT_FOUND", "That policy isn't assigned to you.");
  if (policy.acks[employee.id]) throw problem(409, "ALREADY_ACKNOWLEDGED", "You already acknowledged this policy.");
  policy.acks[employee.id] = nowInstant();
  return { title: policy.title, version: policy.version };
}

/** Document-center rows for policies published to this employee. */
export function policyDocuments(employeeId: string) {
  const employee = employeeById(employeeId);
  if (!employee) return [];
  return db()
    .lcPolicies.filter((policy) => inAudience(policy, employee))
    .map((policy) => ({ id: `doc_${policy.id}`, name: `${policy.title} ${policy.version}.pdf`, category: "policy" as const, mime: "application/pdf" as const, sizeBytes: 120_000 + policy.body.length * 30, uploadedAt: policy.publishedAt, uploadedBy: policy.publishedBy, scanState: "clean" as const, href: "/documents?tab=policies" }));
}

/** Timeline hook: records the relieving on the employment history. */
export function recordExitCompleted(employeeId: string, lastWorkingDay: string) {
  recordEmploymentEvent(employeeId, { kind: "exit", title: "Relieved", detail: `Last working day ${long(lastWorkingDay)}`, effectiveOn: lastWorkingDay });
}
