import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant, type MockDb } from "@/lib/mocks/store";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import { inr, seededInt } from "@/lib/mocks/seed/random";
import { stateCodes, statStates, type ChallanType, type DueRule, type MockChallan, type PtSlab, type StateCode } from "@/lib/mocks/seed/statutory";
import { addDays, addMonths, diffDays, lastDayOfMonth } from "@/lib/utils/date";
import { formatDate, formatMoney } from "@/lib/utils/format";
import {
  calculate,
  dueDate,
  financialYearOf,
  lineAmount,
  paymentDateOf,
  placementOf,
  profileOf,
  ptSlabFor,
  stateName,
  tdsDueDate,
  type Result,
} from "@/lib/mocks/handlers/payroll-engine";
import { csvCell, maskAccount, maskPan, rupees, runForMonth } from "@/lib/mocks/handlers/payroll";
import { can, idempotent, me, ref, requireCapability, versionCheck, type MockActor } from "@/lib/mocks/handlers/shared";
import type {
  ChallanInput,
  ChallanStatus,
  Form16,
  Form16Status,
  Obligation,
  PfSettingsInput,
  PtSlabsInput,
  StatutoryEmployees,
  StatutoryHub,
  StatutoryProfileInput,
  StatutorySetup,
} from "@/types/statutory";

/*
 * Statutory compliance on the MOCK engine. Files follow the published layouts
 * (EPFO ECR v2, ESIC monthly upload, 24Q annexure) but are generated from
 * synthetic data and are never filed with any authority.
 */

const FINAL: string[] = ["approved", "published", "paid"];
const typeLabels: Record<ChallanType, string> = { epf: "EPF (ECR)", esi: "ESI", pt: "Professional tax", lwf: "Labour welfare fund", tds: "TDS (24Q)" };
const money = (paise: number) => formatMoney(inr(paise), { decimals: false });
const today = () => db().today;
const currentMonth = () => today().slice(0, 7);

/** Months with frozen, final payroll: approved/closed runs and pre-system history. */
export function isFinalMonth(month: string): boolean {
  const store = db();
  if (month >= currentMonth()) return FINAL.includes(runForMonth(month)?.state ?? "");
  const earliest = store.payrollRuns.reduce((min, run) => (run.month < min ? run.month : min), currentMonth());
  if (month < earliest) return true;
  const run = runForMonth(month);
  return !run || FINAL.includes(run.state);
}

function firstMonth() {
  return `${financialYearOf(currentMonth()).start - 1}-04`;
}
function lastFinalMonth() {
  let month = currentMonth();
  while (month >= firstMonth() && !isFinalMonth(month)) month = addMonths(month, -1);
  return month;
}

const monthCache = new WeakMap<MockDb, Map<string, Result[]>>();
export function monthResults(month: string): Result[] {
  const store = db();
  // Final months are frozen, so their results can be reused for this store.
  const final = isFinalMonth(month);
  let cache = monthCache.get(store);
  if (!cache) monthCache.set(store, (cache = new Map()));
  const cached = final ? cache.get(month) : undefined;
  if (cached) return cached;
  const results = store.employees.map((employee) => calculate(employee, month, month === currentMonth())).filter((result): result is Result => result !== null);
  if (final) cache.set(month, results);
  return results;
}

/* Obligations & challans --------------------------------------------------- */

interface MockObligation { key: string; type: ChallanType; entityId: string; state: StateCode | null; period: string; liability: number; dueOn: string }

function ptDueOf(state: StateCode, month: string) {
  return dueDate(db().statSettings.ptDue[state] ?? { kind: "none" }, month) ?? lastDayOfMonth(month);
}
function lwfDueOf(state: StateCode, month: string) {
  const rule: DueRule = db().statSettings.lwf[state]?.due ?? { kind: "next_month_day", day: 15 };
  return dueDate(rule, month) ?? `${addMonths(month, 1)}-15`;
}

function obligationsForMonth(month: string): MockObligation[] {
  const map = new Map<string, MockObligation>();
  const add = (type: ChallanType, entityId: string, state: StateCode | null, liability: number, dueOn: string) => {
    if (liability <= 0) return;
    const key = [type, entityId, state ?? "-", month].join("|");
    const existing = map.get(key);
    if (existing) existing.liability += liability;
    else map.set(key, { key, type, entityId, state, period: month, liability, dueOn });
  };
  for (const r of monthResults(month)) {
    add("epf", r.entityId, null, ["PF", "VPF"].reduce((t, c) => t + lineAmount(r.deductions, c), 0) + ["EPS", "EPF_ER", "EDLI", "EPF_ADM"].reduce((t, c) => t + lineAmount(r.employer, c), 0), `${addMonths(month, 1)}-15`);
    add("esi", r.entityId, null, lineAmount(r.deductions, "ESI") + lineAmount(r.employer, "ESI_ER"), `${addMonths(month, 1)}-15`);
    add("pt", r.entityId, r.state, lineAmount(r.deductions, "PT"), ptDueOf(r.state, month));
    add("lwf", r.entityId, r.state, lineAmount(r.deductions, "LWF") + lineAmount(r.employer, "LWF_ER"), lwfDueOf(r.state, month));
    add("tds", r.entityId, null, lineAmount(r.deductions, "TDS"), tdsDueDate(month));
  }
  return [...map.values()];
}

function allObligations(): MockObligation[] {
  const list: MockObligation[] = [];
  for (let month = firstMonth(); month <= lastFinalMonth(); month = addMonths(month, 1)) list.push(...obligationsForMonth(month));
  return list;
}

/** Seeds paid challans for history once the engine can price them. One TDS challan is late, one LWF is unpaid. */
export function ensureChallans() {
  const store = db();
  if (store.statChallansSeeded) return;
  store.statChallansSeeded = true;
  const last = lastFinalMonth();
  const fyStart = financialYearOf(currentMonth()).start;
  for (const item of allObligations()) {
    if (item.type === "lwf" && item.state === "HR" && item.period === last) continue;
    const late = item.type === "tds" && item.entityId === "ent_tech" && item.period === `${fyStart}-06`;
    const paidOn = late ? addDays(item.dueOn, 2) : addDays(item.dueOn, -seededInt(1, 4, item.key));
    if (paidOn > store.today) continue;
    const n = (length: number, salt: string) => Array.from({ length }, (_, index) => seededInt(0, 9, item.key, salt, index)).join("");
    store.statChallans.push({
      id: `chl_${store.statChallans.length + 1}`,
      reference: `CH-${item.period.replace("-", "")}-${String(store.statChallans.length + 1).padStart(3, "0")}`,
      type: item.type,
      entityId: item.entityId,
      state: item.state,
      period: item.period,
      amountPaise: item.liability,
      paidOn,
      challanNo: item.type === "epf" ? `1${n(12, "trrn")}` : item.type === "esi" ? `2${n(13, "esic")}` : item.type === "tds" ? n(5, "csn") : `${item.state ?? "XX"}${n(10, "rcpt")}`,
      bsrCode: item.type === "tds" ? `0${n(6, "bsr")}` : null,
      recordedBy: "emp_0004",
      recordedAt: `${paidOn}T07:30:00.000Z`,
    });
  }
}

function challanFor(item: MockObligation): MockChallan | undefined {
  return db().statChallans.find((challan) => challan.type === item.type && challan.entityId === item.entityId && (challan.state ?? null) === item.state && challan.period === item.period);
}

function statusOf(item: MockObligation, challan: MockChallan | undefined): { status: ChallanStatus; daysLate: number } {
  if (!challan) return today() > item.dueOn ? { status: "overdue", daysLate: diffDays(item.dueOn, today()) } : { status: "due", daysLate: 0 };
  if (challan.amountPaise + 100 < item.liability) return { status: "short", daysLate: Math.max(0, diffDays(item.dueOn, challan.paidOn)) };
  return challan.paidOn > item.dueOn ? { status: "late", daysLate: diffDays(item.dueOn, challan.paidOn) } : { status: "on_time", daysLate: 0 };
}

const entityName = (id: string) => db().statEntities.find((entity) => entity.id === id)?.name ?? id;
const shortEntity = (id: string) => entityName(id).replace(" Private Limited", "");

function toObligation(item: MockObligation): Obligation {
  const challan = challanFor(item);
  const { status, daysLate } = statusOf(item, challan);
  return {
    key: item.key,
    type: item.type,
    typeLabel: typeLabels[item.type],
    entity: shortEntity(item.entityId),
    state: item.state ? statStates[item.state] : null,
    period: item.period,
    periodLabel: formatDate(item.period, "month"),
    liability: inr(item.liability),
    dueOn: item.dueOn,
    status,
    daysLate,
    challan: challan
      ? { reference: challan.reference, amount: inr(challan.amountPaise), paidOn: challan.paidOn, challanNo: challan.challanNo, bsrCode: challan.bsrCode, recordedBy: employeeById(challan.recordedBy)?.name ?? "Payroll", recordedAt: challan.recordedAt }
      : null,
  };
}

/* Hub ---------------------------------------------------------------------- */

function quarterOf(month: string) {
  const fy = financialYearOf(month);
  const index = Math.floor(((Number(month.slice(5, 7)) + 8) % 12) / 3);
  const start = addMonths(fy.firstMonth, index * 3);
  const returnDue = [`${fy.start}-07-31`, `${fy.start}-10-31`, `${fy.start + 1}-01-31`, `${fy.start + 1}-05-31`][index] ?? `${fy.start}-07-31`;
  return { label: `Q${index + 1}`, months: [start, addMonths(start, 1), addMonths(start, 2)], returnDue };
}

export function monthOptions() {
  const options: { value: string; label: string }[] = [];
  for (let month = currentMonth(); month >= firstMonth(); month = addMonths(month, -1)) options.push({ value: month, label: `${formatDate(month, "month")}${isFinalMonth(month) ? "" : " (open run)"}` });
  return options;
}

export function statutoryHub(actor: MockActor, requested: string | undefined): StatutoryHub {
  requireCapability(actor, "statutory.manage");
  ensureChallans();
  const store = db();
  const options = monthOptions();
  const month = requested && options.some((option) => option.value === requested) ? requested : lastFinalMonth();
  const results = monthResults(month);
  const sum = (pick: (r: Result) => number, list = results) => list.reduce((total, r) => total + pick(r), 0);
  const d = (code: string) => (r: Result) => lineAmount(r.deductions, code);
  const er = (code: string) => (r: Result) => lineAmount(r.employer, code);
  const run = runForMonth(month);
  const fy = financialYearOf(month);

  const entities = store.statEntities.map((entity) => {
    const list = results.filter((r) => r.entityId === entity.id);
    const pfList = list.filter((r) => d("PF")(r) > 0);
    const esiList = list.filter((r) => r.esiCovered);
    const tdsList = list.filter((r) => d("TDS")(r) > 0);
    return {
      id: entity.id,
      name: entity.name,
      epfCode: entity.epfCode,
      esicCode: entity.esicCode,
      tan: entity.tan,
      pfMembers: pfList.length,
      pfTotal: inr(sum((r) => d("PF")(r) + d("VPF")(r) + er("EPS")(r) + er("EPF_ER")(r) + er("EDLI")(r) + er("EPF_ADM")(r), list)),
      pendingUan: pfList.filter((r) => !profileOf(r.employee).uan).length,
      esiMembers: esiList.length,
      esiTotal: inr(sum((r) => d("ESI")(r) + er("ESI_ER")(r), list)),
      tdsDeductees: tdsList.length,
      tdsTotal: inr(sum(d("TDS"), list)),
    };
  });

  const groups = new Map<string, Result[]>();
  for (const r of results) {
    const key = `${r.entityId}|${r.state}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const pt: StatutoryHub["pt"] = [];
  const lwf: StatutoryHub["lwf"] = [];
  for (const [key, list] of [...groups.entries()].sort()) {
    const [entityId = "", stateCode = "UP"] = key.split("|");
    const state = stateCode as StateCode;
    const entity = store.statEntities.find((item) => item.id === entityId);
    const slabCounts = new Map<string, { count: number; amount: number }>();
    for (const r of list) {
      const slab = ptSlabFor(state, r.gross);
      if (!slab) continue;
      const label = slabLabel(slab);
      const current = slabCounts.get(label) ?? { count: 0, amount: 0 };
      slabCounts.set(label, { count: current.count + 1, amount: current.amount + d("PT")(r) });
    }
    const ptAmount = sum(d("PT"), list);
    pt.push({
      state: state,
      stateName: statStates[state],
      entity: shortEntity(entityId),
      registration: entity?.ptRegistrations[state] ?? null,
      employees: list.length,
      grossWages: inr(sum((r) => r.gross, list)),
      amount: inr(ptAmount),
      dueOn: ptAmount ? ptDueOf(state, month) : null,
      slabs: [...slabCounts.entries()].map(([label, value]) => ({ label, count: value.count, amount: inr(value.amount) })),
    });
    const lwfEmployee = sum(d("LWF"), list);
    lwf.push({
      state,
      stateName: statStates[state],
      entity: shortEntity(entityId),
      registration: entity?.lwfRegistrations[state] ?? null,
      employees: list.filter((r) => d("LWF")(r) > 0).length,
      employee: inr(lwfEmployee),
      employer: inr(sum(er("LWF_ER"), list)),
      dueOn: lwfEmployee ? lwfDueOf(state, month) : null,
      schedule: lwfSchedule(state),
    });
  }

  const quarter = quarterOf(month);
  const tdsMonths = quarter.months.map((m) => {
    const list = m <= currentMonth() ? monthResults(m) : [];
    const deposited = db().statChallans.filter((challan) => challan.type === "tds" && challan.period === m).reduce((total, challan) => total + challan.amountPaise, 0);
    return { month: m, label: formatDate(m, "month"), deductees: list.filter((r) => d("TDS")(r) > 0).length, amount: inr(sum(d("TDS"), list)), deposited: inr(deposited), final: isFinalMonth(m) && m <= currentMonth() };
  });

  const fyObligations = allObligations().filter((item) => financialYearOf(item.period).start === fy.start);
  const obligations = fyObligations.map(toObligation).sort((a, b) => b.period.localeCompare(a.period) || a.type.localeCompare(b.type));
  const covered = results.filter((r) => r.esiCovered).length;
  return {
    month,
    periodLabel: formatDate(month, "month"),
    financialYear: fy.label,
    monthOptions: options,
    run: run ? { id: run.id, state: run.state, final: FINAL.includes(run.state) } : null,
    totals: {
      epfEmployee: inr(sum((r) => d("PF")(r) + d("VPF")(r))),
      epfEmployer: inr(sum(er("EPF_ER"))),
      eps: inr(sum(er("EPS"))),
      edliAdmin: inr(sum((r) => er("EDLI")(r) + er("EPF_ADM")(r))),
      esi: inr(sum((r) => d("ESI")(r) + er("ESI_ER")(r))),
      pt: inr(sum(d("PT"))),
      lwf: inr(sum((r) => d("LWF")(r) + er("LWF_ER")(r))),
      tds: inr(sum(d("TDS"))),
    },
    entities,
    pt,
    lwf,
    esiNote: covered
      ? `${covered} employee${covered === 1 ? "" : "s"} covered this contribution period (gross up to ${money(store.statSettings.esiCeilingPaise)}).`
      : `No employee is within the ESI wage ceiling of ${money(store.statSettings.esiCeilingPaise)} a month, so no ESI is due. Eligibility is fixed for each contribution period (April–September, October–March).`,
    tds: {
      quarter: `${quarter.label} ${fy.label}`,
      returnDueOn: quarter.returnDue,
      months: tdsMonths,
      total: inr(tdsMonths.reduce((total, m) => total + Number(m.amount.amount) * 100, 0)),
      deposited: inr(tdsMonths.reduce((total, m) => total + Number(m.deposited.amount) * 100, 0)),
    },
    obligations,
    openObligations: obligations
      .filter((item) => !item.challan)
      .map((item) => ({ key: item.key, type: item.type, liability: item.liability, label: `${item.typeLabel} · ${item.entity}${item.state ? ` · ${item.state}` : ""} · ${item.periodLabel} · ${formatMoney(item.liability)} due ${formatDate(item.dueOn)}` })),
    dueSummary: {
      overdue: obligations.filter((item) => item.status === "overdue").length,
      due: obligations.filter((item) => item.status === "due").length,
      late: obligations.filter((item) => item.status === "late" || item.status === "short").length,
      onTime: obligations.filter((item) => item.status === "on_time").length,
    },
    canManage: can(actor, "statutory.manage"),
  };
}

function slabLabel(slab: PtSlab) {
  const from = money(slab.fromPaise);
  const to = slab.toPaise === null ? "and above" : `– ${money(slab.toPaise)}`;
  return `${from} ${to} · ${money(slab.monthlyPaise)}${slab.februaryPaise !== slab.monthlyPaise ? ` (Feb ${money(slab.februaryPaise)})` : ""}`;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function lwfSchedule(state: StateCode) {
  const rule = db().statSettings.lwf[state];
  if (!rule) return "Not applicable";
  const when = rule.months.length ? rule.months.map((m) => monthNames[m - 1]).join(" & ") : "Monthly";
  const employee = rule.employeeRateBp !== null ? `${rule.employeeRateBp / 100}% of wages${rule.employeeCapPaise !== null ? ` (max ${formatMoney(inr(rule.employeeCapPaise))})` : ""}` : formatMoney(inr(rule.employeeFixedPaise ?? 0));
  const employer = rule.employerFixedPaise !== null ? formatMoney(inr(rule.employerFixedPaise)) : `${rule.employerMultiplier ?? 0}× employee`;
  return `${when} · employee ${employee} · employer ${employer}`;
}

export function recordChallan(actor: MockActor, input: ChallanInput) {
  requireCapability(actor, "statutory.manage");
  return idempotent(input.idempotencyKey, () => {
    ensureChallans();
    const item = allObligations().find((obligation) => obligation.key === input.obligationKey);
    if (!item) throw problem(422, "UNKNOWN_OBLIGATION", "That liability isn't open for a challan.", { fieldErrors: { obligationKey: "Choose an open liability." } });
    if (challanFor(item)) throw problem(409, "ALREADY_PAID", "A challan is already recorded for this liability.", { fieldErrors: { obligationKey: "Already recorded." } });
    if (input.paidOn > today()) throw problem(422, "FUTURE_DATE", "Payment date can't be in the future.", { fieldErrors: { paidOn: "Use today or an earlier date." } });
    if (input.paidOn < `${item.period}-01`) throw problem(422, "BEFORE_PERIOD", "Payment date is before the wage month.", { fieldErrors: { paidOn: `Use a date on or after ${formatDate(`${item.period}-01`)}.` } });
    const [whole = "0", fraction = ""] = input.amount.split(".");
    const amountPaise = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
    if (amountPaise > item.liability * 2) throw problem(422, "AMOUNT_MISMATCH", "Amount is far above the computed liability.", { fieldErrors: { amount: `Liability is ${formatMoney(inr(item.liability))}.` } });
    const store = db();
    const reference = nextReference("CH");
    store.statChallans.push({
      id: `chl_${store.counter}`,
      reference,
      type: item.type,
      entityId: item.entityId,
      state: item.state,
      period: item.period,
      amountPaise,
      paidOn: input.paidOn,
      challanNo: input.challanNo.toUpperCase(),
      bsrCode: item.type === "tds" ? input.bsrCode : null,
      recordedBy: actor.employeeId,
      recordedAt: nowInstant(),
    });
    const status = statusOf(item, challanFor(item)).status;
    store.statAudit.push({ at: nowInstant(), actor: me(actor).name, event: `Challan ${reference} recorded: ${typeLabels[item.type]} ${formatDate(item.period, "month")} ${formatMoney(inr(amountPaise))} paid ${formatDate(input.paidOn)} (${status.replace("_", " ")})` });
    return { reference, status };
  });
}

/* Files -------------------------------------------------------------------- */

export type StatutoryFile = "ecr.txt" | "esi.csv" | "pt.csv" | "lwf.csv" | "24q.csv";

export function statutoryFile(actor: MockActor, file: StatutoryFile, month: string, entityId: string | undefined): { fileName: string; body: string; contentType: string } {
  requireCapability(actor, "statutory.manage");
  ensureChallans();
  if (!monthOptions().some((option) => option.value === month)) throw problem(404, "NOT_FOUND", "Choose a month with payroll.");
  if (!isFinalMonth(month)) throw problem(409, "RUN_NOT_FINAL", "Returns are generated only from an approved payroll run.");
  const store = db();
  const entity = store.statEntities.find((item) => item.id === (entityId ?? "ent_tech"));
  if (!entity) throw problem(404, "NOT_FOUND", "Unknown legal entity.");
  const results = monthResults(month).filter((r) => r.entityId === entity.id);
  const stamp = `${entity.id.replace("ent_", "")}-${month}`;
  const csv = (header: string[], rows: (string | number)[][]) => [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n");
  const r0 = (paise: number) => String(Math.round(paise / 100));

  if (file === "ecr.txt") {
    // EPFO ECR v2.0: 11 fields separated by #~#, whole rupees, members with a UAN only.
    const lines = results
      .filter((r) => lineAmount(r.deductions, "PF") > 0 && profileOf(r.employee).uan)
      .map((r) => {
        const capped = Math.min(r.pfWage, store.statSettings.pfCeilingPaise);
        const epfWages = store.statSettings.pfWageBasis === "ceiling" ? capped : r.pfWage;
        return [
          profileOf(r.employee).uan ?? "",
          r.employee.name.toUpperCase(),
          r0(r.gross),
          r0(epfWages),
          r0(capped),
          r0(capped),
          r0(lineAmount(r.deductions, "PF") + lineAmount(r.deductions, "VPF")),
          r0(lineAmount(r.employer, "EPS")),
          r0(lineAmount(r.employer, "EPF_ER")),
          String(Math.round(r.lopDays)),
          "0",
        ].join("#~#");
      });
    return { fileName: `ECR-${entity.epfCode}-${month}.txt`, body: lines.join("\r\n"), contentType: "text/plain; charset=utf-8" };
  }
  if (file === "esi.csv") {
    const rows = results.filter((r) => r.esiCovered).map((r) => [profileOf(r.employee).esiIp ?? "", r.employee.name, r.payableDays, rupees(r.esiWage), r.payableDays ? "" : "1", ""]);
    return { fileName: `ESI-${entity.esicCode}-${month}.csv`, body: csv(["IP Number", "IP Name", "No of Days for which wages paid/payable during the month", "Total Monthly Wages", "Reason Code for Zero workings days", "Last Working Day"], rows), contentType: "text/csv; charset=utf-8" };
  }
  if (file === "pt.csv") {
    const rows = results.filter((r) => lineAmount(r.deductions, "PT") > 0).map((r) => [r.employee.code, r.employee.name, statStates[r.state], entity.ptRegistrations[r.state] ?? "Not registered", rupees(r.gross), rupees(lineAmount(r.deductions, "PT"))]);
    return { fileName: `PT-${stamp}.csv`, body: csv(["Employee code", "Name", "State", "PT registration", "Gross salary", "Professional tax"], rows), contentType: "text/csv; charset=utf-8" };
  }
  if (file === "lwf.csv") {
    const rows = results.filter((r) => lineAmount(r.deductions, "LWF") > 0).map((r) => [r.employee.code, r.employee.name, statStates[r.state], entity.lwfRegistrations[r.state] ?? "Not registered", rupees(r.gross), rupees(lineAmount(r.deductions, "LWF")), rupees(lineAmount(r.employer, "LWF_ER"))]);
    return { fileName: `LWF-${stamp}.csv`, body: csv(["Employee code", "Name", "State", "LWF registration", "Gross salary", "Employee contribution", "Employer contribution"], rows), contentType: "text/csv; charset=utf-8" };
  }
  // 24Q annexure I (deductee-wise) for the quarter containing the month.
  const quarter = quarterOf(month);
  const rows: (string | number)[][] = [];
  for (const m of quarter.months.filter((item) => item <= currentMonth() && isFinalMonth(item))) {
    const challan = store.statChallans.find((item) => item.type === "tds" && item.entityId === entity.id && item.period === m);
    for (const r of monthResults(m).filter((item) => item.entityId === entity.id)) {
      const tds = lineAmount(r.deductions, "TDS");
      rows.push([r.employee.code, r.employee.name, profileOf(r.employee).pan ?? "PANNOTAVBL", "192", formatDate(m, "month"), paymentDateOf(m), rupees(r.gross), rupees(tds), challan?.bsrCode ?? "", challan?.paidOn ?? "", challan?.challanNo ?? "", tds ? "" : "No deduction (below taxable limit)"]);
    }
  }
  return { fileName: `24Q-${entity.tan}-${quarter.label}-${financialYearOf(month).short}.csv`, body: csv(["Employee code", "Deductee name", "PAN", "Section", "Month", "Date of payment", "Amount paid/credited", "TDS deducted", "BSR code", "Challan date", "Challan serial no.", "Remarks"], rows), contentType: "text/csv; charset=utf-8" };
}


/* Setup -------------------------------------------------------------------- */

const dueLabel = (rule: DueRule) => (rule.kind === "none" ? "No PT" : rule.kind === "same_month_end" ? "Last day of the same month" : `${rule.day}th of the next month`);

export function statutorySetup(actor: MockActor): StatutorySetup {
  requireCapability(actor, "statutory.manage");
  const store = db();
  const settings = store.statSettings;
  const active = store.employees.filter((employee) => employee.status !== "exited");
  const locations = [...new Set([...Object.keys(store.statLocations), ...active.map((employee) => employee.location)])];
  return {
    entities: store.statEntities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      address: entity.address,
      pan: entity.pan,
      tan: entity.tan,
      epfCode: entity.epfCode,
      esicCode: entity.esicCode,
      debitBank: `${entity.debitBank} · ${maskAccount(entity.debitAccount)}`,
      locations: Object.entries(store.statLocations).filter(([, value]) => value.entityId === entity.id).map(([location]) => location),
      pt: Object.entries(entity.ptRegistrations).map(([state, registration]) => ({ state: statStates[state as StateCode], registration: registration ?? "" })),
      lwf: Object.entries(entity.lwfRegistrations).map(([state, registration]) => ({ state: statStates[state as StateCode], registration: registration ?? "" })),
    })),
    locations: locations.map((location) => {
      const mapping = store.statLocations[location];
      return {
        location,
        entity: shortEntity(mapping?.entityId ?? "ent_tech"),
        state: mapping ? (mapping.state ? statStates[mapping.state] : "Employee's registered state (default Uttar Pradesh)") : "Not mapped — defaults to Uttar Pradesh",
        headcount: active.filter((employee) => employee.location === location).length,
        mapped: Boolean(mapping),
      };
    }),
    pf: { wageBasis: settings.pfWageBasis, ceiling: inr(settings.pfCeilingPaise) },
    esi: { ceiling: inr(settings.esiCeilingPaise) },
    pt: stateCodes.map((state) => ({
      state,
      stateName: statStates[state],
      due: dueLabel(settings.ptDue[state]),
      slabs: settings.ptSlabs[state].map((slab) => ({ from: inr(slab.fromPaise), to: slab.toPaise === null ? null : inr(slab.toPaise), monthly: inr(slab.monthlyPaise), february: inr(slab.februaryPaise) })),
    })),
    lwf: stateCodes.map((state) => {
      const rule = settings.lwf[state];
      const [when = "Not applicable", employee = "—", employer = "—"] = lwfSchedule(state).split(" · ");
      return { state, stateName: statStates[state], schedule: when, employee: employee.replace("employee ", ""), employer: employer.replace("employer ", ""), due: rule ? dueLabel(rule.due) : "—" };
    }),
    audit: [...store.statAudit].reverse().slice(0, 20),
    settingsVersion: settings.version,
    canManage: can(actor, "statutory.manage"),
  };
}

export function savePfSettings(actor: MockActor, input: PfSettingsInput) {
  requireCapability(actor, "statutory.manage");
  const settings = db().statSettings;
  versionCheck(settings.version, input.expectedVersion);
  const ceiling = Number(input.esiCeiling) * 100;
  if (ceiling < 1_000_000 || ceiling > 5_000_000) throw problem(422, "OUT_OF_RANGE", "ESI ceiling must be between ₹10,000 and ₹50,000.", { fieldErrors: { esiCeiling: "Between ₹10,000 and ₹50,000." } });
  const changes: string[] = [];
  if (settings.pfWageBasis !== input.wageBasis) changes.push(`PF wages ${input.wageBasis === "ceiling" ? "restricted to the ₹15,000 ceiling" : "on actual basic"}`);
  if (settings.esiCeilingPaise !== ceiling) changes.push(`ESI ceiling ${money(settings.esiCeilingPaise)} → ${money(ceiling)}`);
  if (!changes.length) throw problem(422, "NO_CHANGE", "Nothing changed.");
  settings.pfWageBasis = input.wageBasis;
  settings.esiCeilingPaise = ceiling;
  settings.version += 1;
  db().statAudit.push({ at: nowInstant(), actor: me(actor).name, event: `${changes.join("; ")} — applies to open runs (v${settings.version})` });
  return { version: settings.version };
}

export function savePtSlabs(actor: MockActor, input: PtSlabsInput) {
  requireCapability(actor, "statutory.manage");
  const settings = db().statSettings;
  versionCheck(settings.version, input.expectedVersion);
  if (!(stateCodes as string[]).includes(input.state)) throw problem(422, "UNKNOWN_STATE", "Unknown state.");
  const state = input.state as StateCode;
  const fieldErrors: Record<string, string> = {};
  const whole = /^\d{1,7}$/;
  const rows = input.rows
    .map((row, index) => ({ ...row, index }))
    .filter((row) => row.from || row.to || row.monthly || row.february);
  const slabs: PtSlab[] = [];
  rows.forEach((row, position) => {
    const key = (field: string) => `rows.${row.index}.${field}`;
    if (!whole.test(row.from)) fieldErrors[key("from")] = "Whole rupees.";
    if (row.to && !whole.test(row.to)) fieldErrors[key("to")] = "Whole rupees or blank for no limit.";
    if (!whole.test(row.monthly)) fieldErrors[key("monthly")] = "Whole rupees.";
    if (row.february && !whole.test(row.february)) fieldErrors[key("february")] = "Whole rupees or blank.";
    const slab = { fromPaise: Number(row.from) * 100, toPaise: row.to ? Number(row.to) * 100 : null, monthlyPaise: Number(row.monthly) * 100, februaryPaise: Number(row.february || row.monthly) * 100 };
    const previous = slabs.at(-1);
    if (slab.toPaise !== null && slab.toPaise < slab.fromPaise) fieldErrors[key("to")] = "Must be above “from”.";
    if (position === 0 && slab.fromPaise !== 0) fieldErrors[key("from")] = "The first slab starts at ₹0.";
    if (previous && (previous.toPaise === null || slab.fromPaise !== previous.toPaise + 100)) fieldErrors[key("from")] = previous.toPaise === null ? "The previous slab has no upper limit." : `Must be ₹${previous.toPaise / 100 + 1} (no gaps or overlaps).`;
    if (position === rows.length - 1 && slab.toPaise !== null) fieldErrors[key("to")] = "Leave the last slab's upper limit blank.";
    // Article 276(2): professional tax can't exceed ₹2,500 a year.
    if (slab.monthlyPaise * 11 + slab.februaryPaise > 250_000) fieldErrors[key("monthly")] = "Annual PT would exceed the ₹2,500 constitutional cap.";
    slabs.push(slab);
  });
  if (Object.keys(fieldErrors).length) throw problem(422, "INVALID_SLABS", "Check the highlighted slabs.", { fieldErrors });
  settings.ptSlabs[state] = slabs;
  settings.version += 1;
  db().statAudit.push({ at: nowInstant(), actor: me(actor).name, event: slabs.length ? `PT slabs updated for ${statStates[state]} (${slabs.length} slabs, v${settings.version})` : `PT removed for ${statStates[state]} (v${settings.version})` });
  return { version: settings.version };
}

/* Employee statutory profiles ---------------------------------------------- */

export function statutoryEmployees(actor: MockActor): StatutoryEmployees {
  requireCapability(actor, "statutory.manage");
  const store = db();
  const rows = store.employees
    .filter((employee) => employee.status !== "exited")
    .map((employee) => {
      const profile = profileOf(employee);
      const { entity, state } = placementOf(employee);
      const result = calculate(employee, currentMonth(), true);
      const applicable = result?.pfApplicable ?? employee.type !== "intern";
      const issues: string[] = [];
      if (applicable && !profile.uan) issues.push("UAN pending");
      if (!profile.pan) issues.push("PAN missing");
      if (profile.bankStatus !== "verified") issues.push(profile.bankStatus === "failed" ? "Bank verification failed" : "Bank not verified");
      return {
        employee: ref(employee),
        code: employee.code,
        location: employee.location,
        entity: shortEntity(entity.id),
        state: stateName(state),
        uan: profile.uan,
        pfMemberId: applicable && !profile.pfOptOut ? `${entity.epfCode}${profile.pfMemberSerial}` : null,
        esiIp: profile.esiIp,
        panMasked: maskPan(profile.pan),
        pfStatus: profile.pfOptOut ? ("opted_out" as const) : applicable ? ("member" as const) : ("not_applicable" as const),
        vpfPercent: profile.vpfPercent,
        bank: { name: profile.bankName, accountMasked: maskAccount(profile.accountNumber), ifsc: profile.ifsc || "—", status: profile.bankStatus, changedAt: profile.bankChangedAt },
        issues,
      };
    });
  return {
    rows,
    counts: {
      total: rows.length,
      uanPending: rows.filter((row) => row.issues.includes("UAN pending")).length,
      panMissing: rows.filter((row) => row.issues.includes("PAN missing")).length,
      bankPending: rows.filter((row) => row.bank.status !== "verified").length,
    },
    canEdit: can(actor, "statutory.manage"),
    canVerifyBank: can(actor, "payment.export"),
  };
}

export function saveStatutoryProfile(actor: MockActor, input: StatutoryProfileInput) {
  requireCapability(actor, "statutory.manage");
  const employee = employeeById(input.employeeId);
  if (!employee) throw problem(404, "NOT_FOUND", "Employee not found.");
  const profile = profileOf(employee);
  const vpf = Number(input.vpfPercent);
  if (vpf > 88) throw problem(422, "VPF_LIMIT", "VPF can't exceed 88% (100% with the mandatory 12%).", { fieldErrors: { vpfPercent: "0 to 88." } });
  const optOut = input.pfOptOut === "yes";
  if (optOut && !profile.pfOptOut) {
    const basic = calculate(employee, currentMonth(), true)?.pfWage ?? 0;
    // Only an "excluded employee" (PF wages above the ceiling, never a member) may opt out.
    if (basic <= db().statSettings.pfCeilingPaise) throw problem(422, "OPT_OUT_NOT_ALLOWED", "PF opt-out is allowed only when PF wages exceed ₹15,000.", { fieldErrors: { pfOptOut: "Not eligible: basic is within the PF ceiling." } });
    if (profile.uan) throw problem(422, "OPT_OUT_NOT_ALLOWED", "An existing EPF member (with a UAN) can't opt out.", { fieldErrors: { pfOptOut: "Existing members can't opt out." } });
  }
  if (optOut && vpf > 0) throw problem(422, "VPF_WITHOUT_PF", "VPF needs PF membership.", { fieldErrors: { vpfPercent: "Set 0 when opted out." } });
  const uan = input.uan || null;
  if (uan && [...db().statProfiles.values()].some((other) => other.employeeId !== employee.id && other.uan === uan)) throw problem(409, "DUPLICATE_UAN", "Another employee already has this UAN.", { fieldErrors: { uan: "UAN already in use." } });
  const changes: string[] = [];
  if (profile.uan !== uan) changes.push(`UAN ${uan ? "set" : "cleared"}`);
  if (profile.esiIp !== (input.esiIp || null)) changes.push("ESI IP updated");
  if (profile.vpfPercent !== vpf) changes.push(`VPF ${profile.vpfPercent}% → ${vpf}%`);
  if (profile.pfOptOut !== optOut) changes.push(optOut ? "PF opt-out recorded (Form 11)" : "PF membership restored");
  if (!changes.length) throw problem(422, "NO_CHANGE", "Nothing changed.");
  Object.assign(profile, { uan, esiIp: input.esiIp || null, vpfPercent: vpf, pfOptOut: optOut });
  db().statAudit.push({ at: nowInstant(), actor: me(actor).name, event: `${employee.name}: ${changes.join(", ")}` });
  return { employeeId: employee.id };
}

export function verifyBankAccount(actor: MockActor, employeeId: string, decision: "verified" | "failed") {
  requireCapability(actor, "payment.export");
  const employee = employeeById(employeeId);
  if (!employee) throw problem(404, "NOT_FOUND", "Employee not found.");
  if (employee.id === actor.employeeId) throw problem(403, "SELF_VERIFICATION", "You can't verify your own bank account.");
  const profile = profileOf(employee);
  if (profile.bankStatus !== "pending") throw problem(409, "NOT_PENDING", "This account isn't awaiting verification.");
  if (!profile.accountNumber) throw problem(422, "NO_ACCOUNT", "No bank account has been provided yet.");
  profile.bankStatus = decision;
  db().statAudit.push({ at: nowInstant(), actor: me(actor).name, event: `Bank account ${maskAccount(profile.accountNumber)} for ${employee.name} ${decision === "verified" ? "verified (penny-drop simulated)" : "marked failed"}` });
  return { status: decision };
}

/* Form 16 ------------------------------------------------------------------ */

function fyMonths(fyStart: number) {
  return Array.from({ length: 12 }, (_, index) => addMonths(`${fyStart}-04`, index)).filter((month) => month <= currentMonth());
}

function fyOptions(employee: SeedEmployee) {
  const current = financialYearOf(currentMonth()).start;
  return [current, current - 1]
    .filter((start) => employee.joinedOn <= `${start + 1}-03-31` && fyMonths(start).some((month) => calculate(employee, month, false)))
    .map((start) => ({ value: `${start}-${String(start + 1).slice(2)}`, label: `FY ${start}-${String(start + 1).slice(2)}${start === current ? " (in progress)" : ""}` }));
}

export function form16(actor: MockActor, fyParam: string | undefined, employeeId: string | undefined): Form16 {
  requireCapability(actor, "payslip.read.self");
  const viewingOther = Boolean(employeeId && employeeId !== actor.employeeId);
  if (viewingOther) requireCapability(actor, "statutory.manage");
  const employee = viewingOther ? employeeById(employeeId ?? "") : me(actor);
  if (!employee) throw problem(404, "NOT_FOUND", "Employee not found.");
  ensureChallans();
  const options = fyOptions(employee);
  const currentFy = financialYearOf(currentMonth()).start;
  const chosen = options.find((option) => option.value === fyParam) ?? options.find((option) => Number(option.value.slice(0, 4)) < currentFy) ?? options[0];
  const fyStart = chosen ? Number(chosen.value.slice(0, 4)) : currentFy;
  const months = fyMonths(fyStart);
  const results = months.map((month) => calculate(employee, month, month === currentMonth()));
  const last = [...results].reverse().find((result): result is Result => result !== null) ?? null;
  const closed = fyStart < currentFy;
  const issued = closed ? db().statForm16.get(fyStart) ?? null : null;
  const { entity } = placementOf(employee);
  const profile = profileOf(employee);
  const tdsOf = (result: Result | null) => (result ? lineAmount(result.deductions, "TDS") : 0);
  const challanOf = (month: string, result: Result | null) => (result ? db().statChallans.find((item) => item.type === "tds" && item.entityId === result.entityId && item.period === month) : undefined);
  const quarters = [0, 1, 2, 3].map((q) => {
    const qMonths = months.map((month, index) => ({ month, result: results[index] ?? null })).filter(({ month }) => Math.floor(((Number(month.slice(5, 7)) + 8) % 12) / 3) === q);
    const quarterEnd = lastDayOfMonth(addMonths(`${fyStart}-04`, q * 3 + 2));
    return {
      quarter: `Q${q + 1}`,
      receipt: quarterEnd < today() && qMonths.length ? `QR${entity.tan.slice(4, 9)}${fyStart % 100}${q + 1}${seededInt(100, 999, employee.id, fyStart, q)}` : null,
      paid: inr(qMonths.reduce((total, item) => total + (item.result?.gross ?? 0), 0)),
      deducted: inr(qMonths.reduce((total, item) => total + tdsOf(item.result), 0)),
      deposited: inr(qMonths.reduce((total, item) => total + (challanOf(item.month, item.result) ? tdsOf(item.result) : 0), 0)),
    };
  });
  const challans = months.flatMap((month, index) => {
    const result = results[index] ?? null;
    const tds = tdsOf(result);
    if (!tds) return [];
    const challan = challanOf(month, result);
    return [{ month: formatDate(month, "month"), bsrCode: challan?.bsrCode ?? null, paidOn: challan?.paidOn ?? null, challanNo: challan?.challanNo ?? null, amount: inr(tds), status: challan ? ("deposited" as const) : ("pending" as const) }];
  });
  const totalDeducted = results.reduce((total, result) => total + tdsOf(result), 0);
  const totalDeposited = months.reduce((total, month, index) => total + (challanOf(month, results[index] ?? null) ? tdsOf(results[index] ?? null) : 0), 0);
  const tax = last?.tax;
  const line = (refNo: string, label: string, paise: number, emphasis = false, indent = false) => ({ ref: refNo, label, amount: inr(paise), emphasis, indent });
  const partB = tax
    ? (() => {
        const via = tax.chapterVia.reduce((total, item) => total + item.paise, 0);
        const afterExemptions = tax.projectedGross - tax.hraExemption;
        const deductions16 = tax.standardDeduction + tax.professionalTax;
        const salaries = afterExemptions - deductions16;
        const payable = tax.annualTax;
        return [
          line("1(a)", "Salary as per provisions contained in section 17(1)", tax.projectedGross, false, true),
          line("1(d)", "Total gross salary", tax.projectedGross, true),
          line("2(e)", "Less: house rent allowance exempt u/s 10(13A)", tax.hraExemption, false, true),
          line("3", "Total salary received from current employer", afterExemptions, true),
          line("4(a)", "Standard deduction u/s 16(ia)", tax.standardDeduction, false, true),
          line("4(c)", "Tax on employment (professional tax) u/s 16(iii)", tax.professionalTax, false, true),
          line("6", "Income chargeable under the head “Salaries”", salaries, true),
          line("7(a)", "Less: interest on housing loan u/s 24(b)", tax.homeLoanInterest, false, true),
          line("9", "Gross total income", salaries - tax.homeLoanInterest, true),
          ...tax.chapterVia.map((item) => line(`10 · ${item.code}`, `Deduction u/s ${item.label}`, item.paise, false, true)),
          line("11", "Aggregate of deductible amounts under Chapter VI-A", via, false),
          line("12", "Total taxable income (rounded u/s 288A)", tax.taxableIncome, true),
          line("13", "Tax on total income", tax.slabTax),
          line("14", "Rebate under section 87A", tax.rebate87a),
          line("15", "Surcharge", tax.surcharge),
          line("16", "Health and education cess (4%)", tax.cess),
          line("17", "Tax payable", payable, true),
          line("18", "Less: relief under section 89", 0),
          line("19", "Net tax payable", payable, true),
          line("20", "Tax deducted at source (Part A)", totalDeducted),
          line("21", closed ? "Balance tax payable / (refundable)" : "Balance to be deducted in the remaining months", payable - totalDeducted, true),
        ];
      })()
    : [];
  const employedFrom = employee.joinedOn > `${fyStart}-04-01` ? employee.joinedOn : `${fyStart}-04-01`;
  return {
    fy: `${fyStart}-${String(fyStart + 1).slice(2)}`,
    fyLabel: `FY ${fyStart}-${String(fyStart + 1).slice(2)}`,
    assessmentYear: `AY ${fyStart + 1}-${String(fyStart + 2).slice(2)}`,
    options,
    status: !last ? "not_employed" : issued ? "issued" : "provisional",
    generatedAt: issued?.generatedAt ?? null,
    certificateNo: `${entity.tan.slice(0, 4)}${String(fyStart).slice(2)}${employee.code.replace(/\D/g, "")}${seededInt(10, 99, employee.id, fyStart)}`,
    employer: { name: entity.name, address: entity.address, pan: entity.pan, tan: entity.tan },
    employee: { id: employee.id, name: employee.name, code: employee.code, designation: employee.designation, pan: maskPan(profile.pan) ?? "PAN NOT AVAILABLE", periodFrom: employedFrom, periodTo: closed ? `${fyStart + 1}-03-31` : lastDayOfMonth(currentMonth()), regime: tax?.regime ?? "new" },
    partA: { quarters, challans, totalDeducted: inr(totalDeducted), totalDeposited: inr(totalDeposited) },
    partB,
    viewingOther,
  };
}

export function form16Status(actor: MockActor, fyParam: string | undefined): Form16Status {
  requireCapability(actor, "statutory.manage");
  ensureChallans();
  const currentFy = financialYearOf(currentMonth()).start;
  const fyStart = fyParam && /^\d{4}-\d{2}$/.test(fyParam) && Number(fyParam.slice(0, 4)) <= currentFy && Number(fyParam.slice(0, 4)) >= currentFy - 1 ? Number(fyParam.slice(0, 4)) : currentFy - 1;
  const closed = fyStart < currentFy;
  const generated = db().statForm16.get(fyStart) ?? null;
  const months = fyMonths(fyStart);
  const rows: Form16Status["rows"] = [];
  for (const employee of db().employees) {
    const results = months.map((month) => ({ month, result: calculate(employee, month, false) })).filter((item) => item.result);
    if (!results.length) continue;
    const tds = results.reduce((total, item) => total + (item.result ? lineAmount(item.result.deductions, "TDS") : 0), 0);
    const deposited = results.reduce((total, item) => total + (item.result && db().statChallans.some((challan) => challan.type === "tds" && challan.entityId === item.result?.entityId && challan.period === item.month) ? lineAmount(item.result.deductions, "TDS") : 0), 0);
    const pan = Boolean(profileOf(employee).pan);
    rows.push({
      employee: ref(employee),
      code: employee.code,
      pan,
      tds: inr(tds),
      deposited: inr(deposited),
      status: !closed ? "provisional" : !pan ? "pan_missing" : !tds ? "no_tds" : generated ? "generated" : "ready",
    });
  }
  const short = rows.some((row) => row.tds.amount !== row.deposited.amount);
  return {
    fy: `${fyStart}-${String(fyStart + 1).slice(2)}`,
    fyLabel: `FY ${fyStart}-${String(fyStart + 1).slice(2)}`,
    closed,
    generatedAt: generated?.generatedAt ?? null,
    generatedBy: generated ? employeeById(generated.generatedBy)?.name ?? "Payroll" : null,
    canGenerate: closed && !short && can(actor, "statutory.manage"),
    generateBlockedReason: !closed ? "Form 16 is generated after the financial year closes (by 15 June)." : short ? "Some TDS isn't deposited yet — record the pending TDS challans first." : null,
    counts: { generated: rows.filter((row) => row.status === "generated").length, noTds: rows.filter((row) => row.status === "no_tds").length, blocked: rows.filter((row) => row.status === "pan_missing").length },
    rows,
  };
}

export function generateForm16(actor: MockActor, fy: string) {
  const status = form16Status(actor, fy);
  if (!status.canGenerate) throw problem(409, "CANNOT_GENERATE", status.generateBlockedReason ?? "Form 16 can't be generated yet.");
  const fyStart = Number(status.fy.slice(0, 4));
  const regenerated = db().statForm16.has(fyStart);
  db().statForm16.set(fyStart, { generatedAt: nowInstant(), generatedBy: actor.employeeId });
  db().statAudit.push({ at: nowInstant(), actor: me(actor).name, event: `Form 16 ${regenerated ? "regenerated" : "generated"} for ${status.fyLabel} (${status.rows.length} employees, mock — not from TRACES)` });
  return { fy: status.fy };
}
