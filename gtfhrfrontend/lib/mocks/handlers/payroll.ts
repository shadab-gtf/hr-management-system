import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextId, nowInstant, type MockPayrollRun } from "@/lib/mocks/store";
import { organization } from "@/lib/mocks/seed/organization";
import { halves, inr } from "@/lib/mocks/seed/random";
import { addMonths, lastDayOfMonth } from "@/lib/utils/date";
import { formatDate, formatMoney } from "@/lib/utils/format";
import {
  calculate,
  lineAmount,
  paymentDateOf,
  payrollInputLabel,
  placementOf,
  profileOf,
  stateName,
  type Line,
  type Result,
} from "@/lib/mocks/handlers/payroll-engine";
import {
  can,
  idempotent,
  me,
  ref,
  requireCapability,
  versionCheck,
  type MockActor,
} from "@/lib/mocks/handlers/shared";
import type {
  BankAdvice,
  ComponentTotal,
  PayrollCommand,
  PayrollInputForm,
  PayrollOverview,
  PayrollRunDetail,
  PayrollRunSummary,
  PayslipDetail,
  PayslipSummary,
  RegisterRow,
  ValidationIssue,
  VarianceRow,
} from "@/types/payroll";

/*
 * Payroll runs on the MOCK statutory engine (payroll-engine.ts). Figures are
 * synthetic; Finance owns and certifies real rules (payroll-rules.md).
 */

export { calculate, type Line, type Result } from "@/lib/mocks/handlers/payroll-engine";

const FINAL_STATES: MockPayrollRun["state"][] = ["approved", "published", "paid"];
const EDITABLE_STATES: MockPayrollRun["state"][] = ["draft", "calculated", "rejected"];
const money = (paise: number) => formatMoney(inr(paise), { decimals: false });

export function resultsFor(run: MockPayrollRun): Result[] {
  const current = run.month === db().today.slice(0, 7);
  return db()
    .employees.map((employee) => calculate(employee, run.month, current))
    .filter((result): result is Result => result !== null);
}

export function runById(id: string): MockPayrollRun {
  const run = db().payrollRuns.find((item) => item.id === id);
  if (!run) throw problem(404, "NOT_FOUND", "We couldn't find that payroll run.");
  return run;
}

export const runForMonth = (month: string) => db().payrollRuns.filter((run) => run.month === month).sort((a, b) => b.revision - a.revision)[0];

export function activeHolds(month: string) {
  return db().payrollHolds.filter((hold) => hold.month === month && !hold.releasedAt);
}

function summary(run: MockPayrollRun, results = resultsFor(run)): PayrollRunSummary {
  const sum = (pick: (result: Result) => number) => results.reduce((total, result) => total + pick(result), 0);
  const issues = issuesFor(run, results);
  return {
    id: run.id,
    payGroup: organization.payGroup,
    periodLabel: formatDate(run.month, "month"),
    periodStart: `${run.month}-01`,
    periodEnd: lastDayOfMonth(run.month),
    paymentDate: paymentDateOf(run.month),
    revision: run.revision,
    state: run.state,
    employeeCount: results.length,
    totals: {
      gross: inr(sum((r) => r.gross)),
      employeeDeductions: inr(sum((r) => r.deductionsTotal)),
      employerContributions: inr(sum((r) => r.employer.reduce((t, l) => t + l.paise, 0))),
      net: inr(sum((r) => r.net)),
    },
    blockers: issues.filter((issue) => issue.severity === "blocker").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    updatedAt: run.updatedAt,
  };
}

function issuesFor(run: MockPayrollRun, results: Result[]): ValidationIssue[] {
  if (FINAL_STATES.includes(run.state)) return [];
  const issues: ValidationIssue[] = [];
  const holds = activeHolds(run.month);
  let joiners = 0;
  for (const result of results) {
    const employee = result.employee;
    const person = ref(employee);
    const profile = profileOf(employee);
    if (result.structureOverflow)
      issues.push({ id: `vi_struct_${employee.id}`, severity: "blocker", employee: person, message: "Salary structure exceeds CTC — special allowance would be negative.", resolution: "Assign a different structure template or revise the CTC before submitting." });
    if (result.net < 0)
      issues.push({ id: `vi_neg_${employee.id}`, severity: "blocker", employee: person, message: `Net pay is negative (${money(result.net)}).`, resolution: "Reduce the one-time deduction or LOP override for this employee." });
    if (profile.bankStatus !== "verified")
      issues.push({ id: `vi_bank_${employee.id}`, severity: "warning", employee: person, message: profile.bankStatus === "failed" ? "Bank account failed verification." : "Bank account awaiting independent verification.", resolution: "Excluded from the bank advice until Finance verifies the account." });
    if (result.pfApplicable && !profile.uan)
      issues.push({ id: `vi_uan_${employee.id}`, severity: "warning", employee: person, message: "UAN not generated yet.", resolution: "PF is deducted; the member is added to the ECR once the UAN is linked on the EPFO portal." });
    if (!profile.pan)
      issues.push({ id: `vi_pan_${employee.id}`, severity: "warning", employee: person, message: "PAN not on file.", resolution: "TDS is computed at the higher of slab tax or 20% (section 206AA) until PAN is provided." });
    if (!result.locationMapped)
      issues.push({ id: `vi_loc_${employee.id}`, severity: "warning", employee: person, message: `Work location “${employee.location}” isn't mapped to a legal entity.`, resolution: "Defaulted to GTF Technologies · Uttar Pradesh. Map the location in Statutory setup." });
    if (employee.status === "notice")
      issues.push({ id: `vi_notice_${employee.id}`, severity: "warning", employee: person, message: "Employee is serving notice.", resolution: "Final settlement runs separately after the last working day." });
    if (result.payableDays + result.lopDays < result.totalDays) joiners += 1;
  }
  for (const hold of holds) {
    const employee = employeeById(hold.employeeId);
    issues.push({ id: `vi_hold_${hold.id}`, severity: "warning", employee: employee ? ref(employee) : null, message: "Salary on hold.", resolution: `${hold.reason} Excluded from the bank advice until released.` });
  }
  if (joiners)
    issues.push({ id: "vi_joiners", severity: "warning", employee: null, message: `${joiners} joiner${joiners === 1 ? "" : "s"} prorated from the joining date.`, resolution: "Review the proration in the variance table." });
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "blocker" ? -1 : 1));
}

function explain(result: Result, before: Result | null): string | null {
  if (!before) return `New joiner — prorated ${result.payableDays}/${result.totalDays} days`;
  const reasons: string[] = [];
  for (const input of result.inputs) {
    if (input.kind === "lop_override") reasons.push(`${halves(input.lopHalves)} LOP day${input.lopHalves === 2 ? "" : "s"} — ${input.note}`);
    else if (input.kind === "arrears") reasons.push(`Arrears ${money(input.amountPaise)} for ${input.arrearsMonths} month${input.arrearsMonths === 1 ? "" : "s"} from ${formatDate(input.arrearsFrom ?? result.month, "month")} — ${input.note}`);
    else reasons.push(`${payrollInputLabel(input.kind)} ${input.kind === "other_deduction" ? "−" : "+"}${money(input.amountPaise)} — ${input.note}`);
  }
  for (const input of before.inputs)
    if (input.kind !== "lop_override" && !result.inputs.some((item) => item.kind === input.kind))
      reasons.push(`Last month's one-time ${payrollInputLabel(input.kind).toLowerCase()} not repeated`);
  if (before.lopDays && !result.lopDays) reasons.push(`No LOP this month (was ${before.lopDays} days)`);
  const compare = (lines: (r: Result) => Line[], code: string, label: string) => {
    const was = lineAmount(lines(before), code);
    const now = lineAmount(lines(result), code);
    if (was !== now) reasons.push(`${label} ${money(was)} → ${money(now)}`);
  };
  compare((r) => r.deductions, "TDS", "TDS re-projected");
  compare((r) => r.deductions, "PT", "Professional tax");
  compare((r) => r.deductions, "LWF", "LWF");
  compare((r) => r.deductions, "LOAN", "Loan recovery");
  if (result.regularGross !== before.regularGross) reasons.push(`Structure or CTC change (monthly gross ${money(before.regularGross)} → ${money(result.regularGross)})`);
  if (before.totalDays !== result.totalDays && !reasons.length) reasons.push("Calendar days differ between periods");
  return reasons.length ? reasons.join("; ") : null;
}

function variancesFor(run: MockPayrollRun, results: Result[]): VarianceRow[] {
  const previousMonth = addMonths(run.month, -1);
  const rows: VarianceRow[] = [];
  for (const result of results) {
    const before = calculate(result.employee, previousMonth, false);
    const change = result.net - (before?.net ?? 0);
    if (change === 0) continue;
    rows.push({
      employee: ref(result.employee),
      component: "Net pay",
      previous: inr(before?.net ?? 0),
      current: inr(result.net),
      change: inr(change),
      changePercent: before?.net ? `${((change / before.net) * 100).toFixed(1)}` : "new",
      explanation: explain(result, before),
    });
  }
  return rows.sort((a, b) => Math.abs(Number(b.change.amount)) - Math.abs(Number(a.change.amount)));
}

function componentsFor(results: Result[]): ComponentTotal[] {
  const totals = new Map<string, ComponentTotal & { value: number }>();
  const add = (line: Line, kind: ComponentTotal["kind"]) => {
    const existing = totals.get(line.code);
    // PT/LWF names carry the state; aggregate under a neutral label.
    const name = line.code === "PT" ? "Professional tax" : line.code === "LWF" ? "Labour welfare fund" : line.code === "TDS" ? "Income tax (TDS)" : line.name;
    const value = (existing?.value ?? 0) + line.paise;
    totals.set(line.code, { code: line.code, name, kind, value, amount: inr(value) });
  };
  for (const result of results) {
    result.earnings.forEach((line) => add(line, "earning"));
    result.deductions.forEach((line) => add(line, "deduction"));
    result.employer.forEach((line) => add(line, "employer"));
  }
  return [...totals.values()].map(({ value: _value, ...item }) => item);
}

function requirePayrollAccess(actor: MockActor) {
  if (!can(actor, "payroll.prepare") && !can(actor, "payroll.approve"))
    throw problem(403, "FORBIDDEN", "Payroll is limited to assigned payroll and finance roles.");
}

export function payrollOverview(actor: MockActor): PayrollOverview {
  requirePayrollAccess(actor);
  const runs = [...db().payrollRuns].sort((a, b) => b.month.localeCompare(a.month));
  const current = runs.find((run) => run.month === db().today.slice(0, 7)) ?? null;
  const results = current ? resultsFor(current) : [];
  const headcount = results.length;
  const count = (test: (result: Result) => boolean) => results.filter(test).length;
  const tone = (done: number) => (done === headcount ? "success" : done >= headcount - 2 ? "warning" : "danger") as "success" | "warning" | "danger";
  const month = current?.month ?? db().today.slice(0, 7);
  const pendingLeave = new Set(db().leaveRequests.filter((item) => item.state === "pending" && item.startDate <= lastDayOfMonth(month) && item.endDate >= `${month}-01`).map((item) => item.employeeId));
  const leaveDone = count((r) => !pendingLeave.has(r.employee.id));
  const compDone = count((r) => !r.structureOverflow);
  const bankDone = count((r) => profileOf(r.employee).bankStatus === "verified");
  const idsDone = count((r) => Boolean(profileOf(r.employee).pan) && (!r.pfApplicable || Boolean(profileOf(r.employee).uan)));
  return {
    payGroup: organization.payGroup,
    current: current ? summary(current, results) : null,
    history: runs.filter((run) => run !== current).map((run) => summary(run)),
    readiness: [
      { label: "Attendance locked", done: headcount, total: headcount, tone: "success" },
      { label: "Leave decisions final", done: leaveDone, total: headcount, tone: tone(leaveDone) },
      { label: "Salary structures valid", done: compDone, total: headcount, tone: tone(compDone) },
      { label: "Statutory ids (PAN, UAN)", done: idsDone, total: headcount, tone: tone(idsDone) },
      { label: "Bank accounts verified", done: bankDone, total: headcount, tone: tone(bankDone) },
    ],
  };
}

function inputDigest(run: MockPayrollRun) {
  const inputs = db().payrollInputs.filter((item) => item.month === run.month);
  const holds = db().payrollHolds.filter((item) => item.month === run.month);
  const text = `${run.id}|${run.revision}|${db().statSettings.version}|${inputs.map((i) => `${i.id}${i.amountPaise}${i.lopHalves}`).join(",")}|${holds.map((h) => `${h.id}${h.releasedAt ?? ""}`).join(",")}`;
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `sha256:${hash.toString(16).padStart(8, "0")}${run.id.replace(/\W/g, "").slice(-4)}…r${run.revision}`;
}

function bankAdviceFor(actor: MockActor, run: MockPayrollRun, results: Result[]): BankAdvice & { payable: Result[] } {
  const available = FINAL_STATES.includes(run.state);
  const holds = activeHolds(run.month);
  const excluded: BankAdvice["excluded"] = [];
  const payable: Result[] = [];
  for (const result of results) {
    const hold = holds.find((item) => item.employeeId === result.employee.id);
    const profile = profileOf(result.employee);
    const reason = hold
      ? `Salary on hold — ${hold.reason}`
      : profile.bankStatus !== "verified"
        ? profile.bankStatus === "failed" ? "Bank account failed verification" : "Bank account not yet verified"
        : result.net <= 0
          ? "No net pay"
          : null;
    if (reason) excluded.push({ employee: ref(result.employee), reason, net: inr(result.net) });
    else payable.push(result);
  }
  const exports = db().statBankExports.filter((item) => item.runId === run.id);
  return {
    available,
    reason: available ? null : "The bank advice is generated after Finance approves the run.",
    canExport: available && can(actor, "payment.export"),
    batchReference: `PB-${run.month.replace("-", "")}-R${run.revision}`,
    payableCount: payable.length,
    payableAmount: inr(payable.reduce((total, result) => total + result.net, 0)),
    excluded,
    exports: exports.map((item) => ({ at: item.at, by: item.by, count: item.count, amount: inr(item.amountPaise) })).reverse(),
    payable,
  };
}

export function payrollRun(actor: MockActor, id: string): PayrollRunDetail {
  requirePayrollAccess(actor);
  const run = runById(id);
  const results = resultsFor(run);
  const base = summary(run, results);
  const prepared = employeeById(run.preparedBy);
  const approved = run.approvedBy ? employeeById(run.approvedBy) : undefined;
  const isPreparer = run.preparedBy === actor.employeeId;
  const editable = EDITABLE_STATES.includes(run.state);
  const canPrepare = can(actor, "payroll.prepare");
  const commands = {
    canEditInputs: canPrepare && editable,
    canHold: canPrepare && run.state !== "paid",
    inputsLockedReason: !canPrepare ? "Only the payroll operator adds inputs." : editable ? null : "Inputs are frozen once the run is submitted for review.",
    canSubmit: can(actor, "payroll.submit") && run.state === "calculated" && base.blockers === 0,
    canApprove: can(actor, "payroll.approve") && run.state === "in_review" && !isPreparer,
    canReject: can(actor, "payroll.approve") && run.state === "in_review" && !isPreparer,
    canPublish: can(actor, "payroll.publish") && run.state === "approved",
    blockedReason:
      run.state === "in_review" && isPreparer
        ? "You prepared this run, so an independent approver must review it."
        : run.state === "calculated" && !can(actor, "payroll.submit")
          ? "Waiting for the payroll operator to submit this run for review."
          : run.state === "calculated" && base.blockers > 0
            ? "Resolve the blockers before submitting for review."
            : run.state === "in_review" && !can(actor, "payroll.approve")
              ? "Waiting for independent Finance approval."
              : null,
  };
  const holds = db().payrollHolds.filter((hold) => hold.month === run.month);
  const byId = new Map(results.map((result) => [result.employee.id, result]));
  const sum = (pick: (result: Result) => number) => inr(results.reduce((total, result) => total + pick(result), 0));
  const register: RegisterRow[] = results.map((result) => {
    const placement = placementOf(result.employee);
    return {
      employee: ref(result.employee),
      code: result.employee.code,
      entity: placement.entity.name,
      state: stateName(result.state),
      payableDays: String(result.payableDays),
      lopDays: String(result.lopDays),
      gross: inr(result.gross),
      pf: inr(lineAmount(result.deductions, "PF") + lineAmount(result.deductions, "VPF")),
      esi: inr(lineAmount(result.deductions, "ESI")),
      pt: inr(lineAmount(result.deductions, "PT")),
      tds: inr(lineAmount(result.deductions, "TDS")),
      deductions: inr(result.deductionsTotal),
      net: inr(result.net),
      held: holds.some((hold) => hold.employeeId === result.employee.id && !hold.releasedAt),
      bankStatus: profileOf(result.employee).bankStatus,
    };
  });
  const { payable: _payable, ...bankAdvice } = bankAdviceFor(actor, run, results);
  return {
    ...base,
    inputDigest: inputDigest(run),
    preparedBy: prepared ? ref(prepared) : { id: "", name: "System", initials: "SY", designation: "", photoUrl: null },
    approvedBy: approved ? ref(approved) : null,
    publishedAt: run.publishedAt,
    issues: issuesFor(run, results),
    variances: variancesFor(run, results),
    components: componentsFor(results),
    audit: [...run.audit].reverse(),
    inputs: db()
      .payrollInputs.filter((item) => item.month === run.month)
      .flatMap((item) => {
        const employee = employeeById(item.employeeId);
        if (!employee) return [];
        const added = employeeById(item.addedBy);
        return [{
          id: item.id,
          employee: ref(employee),
          employeeCode: employee.code,
          kind: item.kind,
          label: payrollInputLabel(item.kind),
          amount: item.kind === "lop_override" ? null : inr(item.amountPaise),
          lopDays: item.kind === "lop_override" ? halves(item.lopHalves) : null,
          arrearsFrom: item.arrearsFrom,
          arrearsMonths: item.kind === "arrears" ? item.arrearsMonths : null,
          note: item.note,
          addedBy: added?.name ?? "Payroll",
          addedAt: item.addedAt,
        }];
      }),
    holds: holds.flatMap((hold) => {
      const employee = employeeById(hold.employeeId);
      if (!employee) return [];
      return [{
        id: hold.id,
        employee: ref(employee),
        reason: hold.reason,
        heldBy: employeeById(hold.heldBy)?.name ?? "Payroll",
        heldAt: hold.heldAt,
        releasedBy: hold.releasedBy ? employeeById(hold.releasedBy)?.name ?? "Payroll" : null,
        releasedAt: hold.releasedAt,
        releaseNote: hold.releaseNote,
        net: inr(byId.get(employee.id)?.net ?? 0),
      }];
    }),
    register,
    bankAdvice,
    inputEmployees: results.map((result) => ({ id: result.employee.id, label: `${result.employee.name} · ${result.employee.code}` })),
    statutory: {
      pfEmployee: sum((r) => lineAmount(r.deductions, "PF") + lineAmount(r.deductions, "VPF")),
      pfEmployer: sum((r) => lineAmount(r.employer, "EPS") + lineAmount(r.employer, "EPF_ER") + lineAmount(r.employer, "EDLI") + lineAmount(r.employer, "EPF_ADM")),
      esi: sum((r) => lineAmount(r.deductions, "ESI") + lineAmount(r.employer, "ESI_ER")),
      pt: sum((r) => lineAmount(r.deductions, "PT")),
      lwf: sum((r) => lineAmount(r.deductions, "LWF") + lineAmount(r.employer, "LWF_ER")),
      tds: sum((r) => lineAmount(r.deductions, "TDS")),
    },
    commands,
  };
}

const transitions: Record<PayrollCommand, { from: MockPayrollRun["state"]; to: MockPayrollRun["state"]; event: string }> = {
  submit: { from: "calculated", to: "in_review", event: "Submitted for independent review" },
  approve: { from: "in_review", to: "approved", event: "Approved digest after review (step-up verified)" },
  reject: { from: "in_review", to: "calculated", event: "Returned to operator" },
  publish: { from: "approved", to: "published", event: "Payslips published to employees" },
};

export function runPayrollCommand(
  actor: MockActor,
  id: string,
  command: PayrollCommand,
  input: { expectedRevision?: number; note?: string },
) {
  const detail = payrollRun(actor, id);
  const allowed =
    (command === "submit" && detail.commands.canSubmit) ||
    (command === "approve" && detail.commands.canApprove) ||
    (command === "reject" && detail.commands.canReject) ||
    (command === "publish" && detail.commands.canPublish);
  if (!allowed)
    throw problem(403, "COMMAND_NOT_PERMITTED", detail.commands.blockedReason ?? "This action isn't available for the run's current state.");
  const run = runById(id);
  versionCheck(run.revision, input.expectedRevision);
  const transition = transitions[command];
  if (run.state !== transition.from) throw problem(409, "INVALID_STATE", "The run changed state. Showing the latest.");
  const actorName = me(actor).name;
  run.state = transition.to;
  run.updatedAt = nowInstant();
  if (command === "approve") run.approvedBy = actor.employeeId;
  if (command === "publish") run.publishedAt = run.updatedAt;
  run.audit.push({ at: run.updatedAt, actor: actorName, event: input.note ? `${transition.event} — ${input.note}` : transition.event });
  return { state: run.state, at: run.updatedAt };
}

/* Payroll inputs & holds --------------------------------------------------- */

function editableRun(actor: MockActor, runId: string) {
  requireCapability(actor, "payroll.prepare");
  const run = runById(runId);
  if (!EDITABLE_STATES.includes(run.state)) throw problem(409, "RUN_LOCKED", "Inputs are frozen once the run is submitted for review.");
  return run;
}

function audit(run: MockPayrollRun, actor: MockActor, event: string) {
  run.updatedAt = nowInstant();
  run.audit.push({ at: run.updatedAt, actor: me(actor).name, event });
}

const toPaise = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
};

export function addPayrollInput(actor: MockActor, input: Omit<PayrollInputForm, "runId">, runId: string, key: string | undefined) {
  return idempotent(key, () => {
    const run = editableRun(actor, runId);
    const employee = employeeById(input.employeeId);
    const before = employee ? calculate(employee, run.month, true) : null;
    if (!employee || !before) throw problem(422, "NOT_IN_RUN", "That employee isn't part of this run.", { fieldErrors: { employeeId: "Choose an employee in this run." } });
    const store = db();
    const existing = store.payrollInputs.filter((item) => item.month === run.month && item.employeeId === employee.id);
    const lopHalves = input.kind === "lop_override" ? Math.round(Number(input.lopDays) * 2) : 0;
    if (input.kind === "lop_override") {
      const eligible = before.payableDays + before.lopDays;
      if (lopHalves / 2 > eligible) throw problem(422, "LOP_EXCEEDS_DAYS", "LOP can't exceed the days payable in this period.", { fieldErrors: { lopDays: `At most ${eligible} days for this employee.` } });
    }
    if (input.kind === "arrears" && input.arrearsFrom >= run.month) throw problem(422, "ARREARS_PERIOD", "Arrears must start in an earlier month.", { fieldErrors: { arrearsFrom: "Choose a month before this pay period." } });
    if (input.kind === "arrears" && addMonths(input.arrearsFrom, Number(input.arrearsMonths)) > run.month) throw problem(422, "ARREARS_PERIOD", "Arrears months can't run into the current period.", { fieldErrors: { arrearsMonths: "Arrears must end before this pay period." } });
    const amountPaise = input.kind === "lop_override" ? 0 : toPaise(input.amount);
    if (input.kind === "other_deduction" && amountPaise > before.net) throw problem(422, "NEGATIVE_NET", "This deduction would make net pay negative.", { fieldErrors: { amount: `At most ${money(before.net)} this month.` } });
    if (input.kind !== "lop_override" && existing.some((item) => item.kind === input.kind && item.amountPaise === amountPaise && item.note === input.note))
      throw problem(409, "DUPLICATE_INPUT", "An identical input already exists for this employee.");
    // One LOP override per employee-period: a new value replaces the old one.
    const replaced = input.kind === "lop_override" ? existing.find((item) => item.kind === "lop_override") : undefined;
    if (replaced) store.payrollInputs = store.payrollInputs.filter((item) => item !== replaced);
    const record = {
      id: nextId("pin"),
      month: run.month,
      employeeId: employee.id,
      kind: input.kind,
      amountPaise,
      lopHalves,
      arrearsFrom: input.kind === "arrears" ? input.arrearsFrom : null,
      arrearsMonths: input.kind === "arrears" ? Number(input.arrearsMonths) : 0,
      note: input.note,
      addedBy: actor.employeeId,
      addedAt: nowInstant(),
    };
    store.payrollInputs.push(record);
    const after = calculate(employee, run.month, true);
    const what = input.kind === "lop_override" ? `${halves(lopHalves)} LOP days${replaced ? ` (replaces ${halves(replaced.lopHalves)})` : ""}` : `${payrollInputLabel(input.kind)} ${money(amountPaise)}`;
    audit(run, actor, `Input added for ${employee.name}: ${what} — ${input.note}. Recalculated net ${money(before.net)} → ${money(after?.net ?? 0)}`);
    if (run.state === "rejected") run.state = "calculated";
    return { id: record.id, net: inr(after?.net ?? 0) };
  });
}

export function removePayrollInput(actor: MockActor, runId: string, inputId: string) {
  const run = editableRun(actor, runId);
  const store = db();
  const item = store.payrollInputs.find((input) => input.id === inputId && input.month === run.month);
  if (!item) throw problem(404, "NOT_FOUND", "That input was already removed.");
  store.payrollInputs = store.payrollInputs.filter((input) => input !== item);
  const employee = employeeById(item.employeeId);
  audit(run, actor, `Input removed for ${employee?.name ?? item.employeeId}: ${payrollInputLabel(item.kind)}${item.kind === "lop_override" ? ` ${halves(item.lopHalves)} days` : ` ${money(item.amountPaise)}`}`);
  return { removed: item.id };
}

export function holdSalary(actor: MockActor, runId: string, employeeId: string, reason: string) {
  requireCapability(actor, "payroll.prepare");
  const run = runById(runId);
  if (run.state === "paid") throw problem(409, "RUN_PAID", "This run is already paid; holds are no longer possible.");
  const employee = employeeById(employeeId);
  if (!employee || !calculate(employee, run.month, true)) throw problem(422, "NOT_IN_RUN", "That employee isn't part of this run.", { fieldErrors: { employeeId: "Choose an employee in this run." } });
  if (activeHolds(run.month).some((hold) => hold.employeeId === employeeId)) throw problem(409, "ALREADY_HELD", "This salary is already on hold.", { fieldErrors: { employeeId: "Already on hold." } });
  const hold = { id: nextId("phd"), month: run.month, employeeId, reason, heldBy: actor.employeeId, heldAt: nowInstant(), releasedBy: null, releasedAt: null, releaseNote: null };
  db().payrollHolds.push(hold);
  audit(run, actor, `Salary held for ${employee.name} — ${reason}`);
  return { id: hold.id };
}

export function releaseSalary(actor: MockActor, runId: string, holdId: string, note: string) {
  requireCapability(actor, "payroll.prepare");
  const run = runById(runId);
  if (run.state === "paid") throw problem(409, "RUN_PAID", "This run is already paid.");
  const hold = db().payrollHolds.find((item) => item.id === holdId && item.month === run.month);
  if (!hold) throw problem(404, "NOT_FOUND", "That hold no longer exists.");
  if (hold.releasedAt) throw problem(409, "ALREADY_RELEASED", "This salary was already released.");
  hold.releasedAt = nowInstant();
  hold.releasedBy = actor.employeeId;
  hold.releaseNote = note;
  audit(run, actor, `Salary released for ${employeeById(hold.employeeId)?.name ?? hold.employeeId} — ${note}`);
  return { id: hold.id };
}

/* Bank advice -------------------------------------------------------------- */

export function bankAdviceCsv(actor: MockActor, runId: string): { fileName: string; csv: string } {
  requireCapability(actor, "payment.export");
  const run = runById(runId);
  if (!FINAL_STATES.includes(run.state)) throw problem(409, "RUN_NOT_APPROVED", "The bank advice is available after the run is approved.");
  const advice = bankAdviceFor(actor, run, resultsFor(run));
  const valueDate = paymentDateOf(run.month);
  const header = ["Payment type", "Debit account", "Beneficiary name", "Beneficiary account", "IFSC", "Amount", "Value date", "Payment reference", "Employee code", "Narration"];
  const rows = advice.payable.map((result, index) => {
    const profile = profileOf(result.employee);
    const entity = placementOf(result.employee).entity;
    return ["NEFT", entity.debitAccount, result.employee.name.toUpperCase(), profile.accountNumber, profile.ifsc, rupees(result.net), valueDate, `${advice.batchReference}-${String(index + 1).padStart(4, "0")}`, result.employee.code, `SALARY ${formatDate(run.month, "month").toUpperCase()}`];
  });
  const csv = [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n");
  const store = db();
  store.statBankExports.push({ runId: run.id, at: nowInstant(), by: me(actor).name, count: rows.length, amountPaise: advice.payable.reduce((total, result) => total + result.net, 0) });
  run.audit.push({ at: nowInstant(), actor: me(actor).name, event: `Bank advice ${advice.batchReference} exported: ${rows.length} transfers, ${advice.excluded.length} excluded (mock file — not sent to any bank)` });
  return { fileName: `gtf-bank-advice-${run.month}-r${run.revision}.csv`, csv };
}

/* Payslips ----------------------------------------------------------------- */

export function publishedRuns() {
  return db()
    .payrollRuns.filter((run) => run.state === "published" || run.state === "paid")
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function listPayslips(actor: MockActor): PayslipSummary[] {
  requireCapability(actor, "payslip.read.self");
  const employee = me(actor);
  return publishedRuns().flatMap((run) => {
    const result = calculate(employee, run.month, false);
    if (!result || !run.publishedAt) return [];
    return [{
      id: `ps_${run.month.replace("-", "")}`,
      periodLabel: formatDate(run.month, "month"),
      periodStart: `${run.month}-01`,
      paymentDate: paymentDateOf(run.month),
      publishedAt: run.publishedAt,
      paymentStatus: run.state === "paid" ? ("paid" as const) : ("published" as const),
      net: inr(result.net),
    }];
  });
}

export const maskAccount = (value: string) => (value ? `XXXX XXXX ${value.slice(-4)}` : "Not provided");
export const maskPan = (value: string | null) => (value ? `${value.slice(0, 2)}XXX${value.slice(5, 9)}${value.slice(-1)}` : null);

export function payslipDetail(actor: MockActor, id: string): PayslipDetail {
  requireCapability(actor, "payslip.read.self");
  const employee = me(actor);
  const month = `${id.slice(3, 7)}-${id.slice(7, 9)}`;
  const run = publishedRuns().find((item) => item.month === month);
  const result = run ? calculate(employee, month, false) : null;
  // Own, published payslips only — anything else is indistinguishable from missing.
  if (!run || !run.publishedAt || !result) throw problem(404, "NOT_FOUND", "We couldn't find that payslip.");
  const line = (item: Line) => ({ code: item.code, name: item.name, amount: inr(item.paise) });
  const profile = profileOf(employee);
  const { entity } = placementOf(employee);
  const slabs = db().statSettings.ptSlabs[result.state] ?? [];
  const pt = lineAmount(result.deductions, "PT");
  return {
    id,
    periodLabel: formatDate(month, "month"),
    periodStart: `${month}-01`,
    paymentDate: paymentDateOf(month),
    publishedAt: run.publishedAt,
    paymentStatus: run.state === "paid" ? "paid" : "published",
    net: inr(result.net),
    employee: {
      name: employee.name,
      code: employee.code,
      designation: employee.designation,
      department: employee.department,
      bankAccountMasked: `${profile.bankName} · ${maskAccount(profile.accountNumber)}`,
      panMasked: maskPan(profile.pan) ?? "Not on file",
    },
    payableDays: String(result.payableDays),
    lopDays: String(result.lopDays),
    earnings: result.earnings.map(line),
    deductions: result.deductions.map(line),
    employerContributions: result.employer.map(line),
    gross: inr(result.gross),
    totalDeductions: inr(result.deductionsTotal),
    artifactVersion: 1,
    statutory: {
      entity: entity.name,
      uan: profile.uan,
      pfNumber: result.pfApplicable ? `${entity.epfCode}${profile.pfMemberSerial}` : null,
      esiNumber: result.esiCovered ? profile.esiIp : null,
      workState: stateName(result.state),
      ptNote: pt ? null : slabs.length ? `Gross is below the ${stateName(result.state)} professional tax threshold.` : `Professional tax is not levied in ${stateName(result.state)}.`,
      regime: result.tax.regime,
      pfWage: inr(result.pfWage),
    },
    tax: {
      financialYear: result.tax.financialYear,
      projectedTaxable: inr(result.tax.taxableIncome),
      annualTax: inr(result.tax.annualTax),
      deductedBefore: inr(result.tax.deductedBefore),
      thisMonth: inr(lineAmount(result.deductions, "TDS")),
      remainingMonths: result.tax.remainingMonths,
    },
    held: activeHolds(month).some((hold) => hold.employeeId === employee.id),
  };
}

/* Monthly payroll register export ------------------------------------------ */

export const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
export const rupees = (paise: number) => inr(paise).amount;

/** Employee-wise register for one run: every component, gross, deductions, net. */
export function payrollRegisterCsv(actor: MockActor, id: string): { fileName: string; csv: string } {
  requirePayrollAccess(actor);
  const run = runById(id);
  const results = resultsFor(run);
  const holds = activeHolds(run.month);
  const columns = (pick: (result: Result) => Line[]) => {
    const seen = new Map<string, string>();
    for (const result of results) for (const line of pick(result)) seen.set(line.code, line.code === "PT" ? "Professional tax" : line.code === "LWF" ? "Labour welfare fund" : line.code === "TDS" ? "Income tax (TDS)" : line.name);
    return [...seen.entries()];
  };
  const earnings = columns((r) => r.earnings);
  const deductions = columns((r) => r.deductions);
  const employer = columns((r) => r.employer);
  const amount = (lines: Line[], code: string) => rupees(lineAmount(lines, code));
  const header = [
    "Employee code", "Name", "Department", "Location", "Entity", "PT/LWF state", "UAN", "Payable days", "LOP days",
    ...earnings.map(([, name]) => name), "Gross earnings",
    ...deductions.map(([, name]) => name), "Total deductions", "Net pay", "Payment status",
    ...employer.map(([, name]) => `Employer: ${name}`),
  ];
  const rows = results.map((r) => [
    r.employee.code, r.employee.name, r.employee.department, r.employee.location, placementOf(r.employee).entity.name, stateName(r.state), profileOf(r.employee).uan ?? "Pending", r.payableDays, r.lopDays,
    ...earnings.map(([code]) => amount(r.earnings, code)), rupees(r.gross),
    ...deductions.map(([code]) => amount(r.deductions, code)), rupees(r.deductionsTotal), rupees(r.net),
    holds.some((hold) => hold.employeeId === r.employee.id) ? "On hold" : "Payable",
    ...employer.map(([code]) => amount(r.employer, code)),
  ]);
  const sum = (pick: (r: Result) => number) => rupees(results.reduce((total, r) => total + pick(r), 0));
  const totalLine = (lines: (r: Result) => Line[], code: string) => sum((r) => lineAmount(lines(r), code));
  const totals = [
    "TOTAL", `${results.length} employees`, "", "", "", "", "", "", "",
    ...earnings.map(([code]) => totalLine((r) => r.earnings, code)), sum((r) => r.gross),
    ...deductions.map(([code]) => totalLine((r) => r.deductions, code)), sum((r) => r.deductionsTotal), sum((r) => r.net), "",
    ...employer.map(([code]) => totalLine((r) => r.employer, code)),
  ];
  const meta = [`GTF HR payroll register`, `Period ${formatDate(run.month, "month")}`, `Run ${run.id} revision ${run.revision}`, `State ${run.state}`, "Synthetic demo data — not statutory output"];
  const csv = [meta.map(csvCell).join(","), "", header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(",")), totals.map(csvCell).join(",")].join("\r\n");
  return { fileName: `gtf-payroll-register-${run.month}-r${run.revision}.csv`, csv };
}
