import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant } from "@/lib/mocks/store";
import { inr } from "@/lib/mocks/seed/random";
import { stateCodes, statStates, type MockStructureChange, type MockStructureTemplate, type StateCode, type StructureTerms } from "@/lib/mocks/seed/statutory";
import { formatMoney } from "@/lib/utils/format";
import {
  annualTax,
  gradeLabels,
  groupKeyOf,
  lwfFor,
  pfFor,
  ptFor,
  rupee,
  structureMonth,
  templateFor,
} from "@/lib/mocks/handlers/payroll-engine";
import { can, idempotent, me, ref, type MockActor } from "@/lib/mocks/handlers/shared";
import type { AssignmentProposal, CtcBreakup, StructureChange, StructureProposal, Structures } from "@/types/statutory";

/* Salary structure templates with maker/checker publishing (mock). */

const groupOrder = ["grade:L1", "grade:L2", "grade:L3", "grade:L4", "grade:L5", "type:contract", "type:intern"];
const groupLabel = (key: string) => (key === "type:intern" ? "Interns" : key === "type:contract" ? "Fixed-term contracts" : gradeLabels[key.slice(6)] ?? key);
const rupeesText = (paise: number) => formatMoney(inr(paise), { decimals: false });

function requireStructureAccess(actor: MockActor) {
  if (!can(actor, "compensation.manage") && !can(actor, "payroll.approve")) throw problem(403, "FORBIDDEN", "Salary structures are limited to payroll and finance.");
}

const activeEmployees = () => db().employees.filter((employee) => employee.status !== "exited" && employee.annualCtc > 0);

function termsOf(template: MockStructureTemplate): StructureTerms {
  return { name: template.name, basicPctOfCtc: template.basicPctOfCtc, hraPctOfBasic: template.hraPctOfBasic, conveyancePaise: template.conveyancePaise, ltaPaise: template.ltaPaise, pf: template.pf, gratuity: template.gratuity };
}

function diffOf(change: MockStructureChange): StructureChange["diff"] {
  const store = db();
  const template = store.statTemplates.find((item) => item.id === change.templateId);
  if (change.kind === "assignment") {
    const current = store.statTemplates.find((item) => item.id === store.statAssignments[change.groupKey ?? ""]);
    return [{ label: groupLabel(change.groupKey ?? ""), from: current?.name ?? "—", to: template?.name ?? change.templateId }];
  }
  if (!template || !change.terms) return [];
  const before = termsOf(template);
  const after = change.terms;
  const rows: StructureChange["diff"] = [];
  const push = (label: string, from: string, to: string) => from !== to && rows.push({ label, from, to });
  push("Basic (% of CTC)", `${before.basicPctOfCtc}%`, `${after.basicPctOfCtc}%`);
  push("HRA (% of basic)", `${before.hraPctOfBasic}%`, `${after.hraPctOfBasic}%`);
  push("Conveyance / month", rupeesText(before.conveyancePaise), rupeesText(after.conveyancePaise));
  push("LTA / month", rupeesText(before.ltaPaise), rupeesText(after.ltaPaise));
  push("Employer PF", before.pf ? "Yes" : "No", after.pf ? "Yes" : "No");
  push("Gratuity provision", before.gratuity ? "Yes" : "No", after.gratuity ? "Yes" : "No");
  return rows;
}

function impactOf(change: MockStructureChange) {
  const store = db();
  const template = store.statTemplates.find((item) => item.id === change.templateId);
  if (!template) return { employees: 0, delta: 0 };
  const affected = activeEmployees().filter((employee) => (change.kind === "assignment" ? groupKeyOf(employee) === change.groupKey : templateFor(employee).id === template.id));
  let delta = 0;
  for (const employee of affected) {
    const monthly = (employee.annualCtc * 100) / 12;
    const before = structureMonth(monthly, templateFor(employee)).gross;
    const after = change.kind === "assignment" ? structureMonth(monthly, template).gross : structureMonth(monthly, { ...template, ...change.terms }).gross;
    delta += after - before;
  }
  return { employees: affected.length, delta };
}

function toChange(actor: MockActor, change: MockStructureChange): StructureChange {
  const preparer = employeeById(change.preparedBy);
  const template = db().statTemplates.find((item) => item.id === change.templateId);
  const impact = impactOf(change);
  const self = change.preparedBy === actor.employeeId;
  const pending = change.state === "pending";
  return {
    id: change.id,
    reference: change.reference,
    kind: change.kind,
    templateId: change.templateId,
    templateName: template?.name ?? change.templateId,
    summary: change.kind === "assignment" ? `Assign ${groupLabel(change.groupKey ?? "")} to ${template?.name ?? change.templateId}` : `Update ${template?.name ?? change.templateId} (v${(template?.version ?? 0) + 1})`,
    diff: diffOf(change),
    impact: { employees: impact.employees, monthlyGrossDelta: inr(impact.delta) },
    reason: change.reason,
    preparedBy: preparer ? ref(preparer) : { id: "", name: "Payroll", initials: "PY", designation: "", photoUrl: null },
    preparedAt: change.preparedAt,
    state: change.state,
    decidedBy: change.decidedBy ? employeeById(change.decidedBy)?.name ?? "Finance" : null,
    decidedAt: change.decidedAt,
    decisionNote: change.decisionNote,
    canDecide: pending && can(actor, "payroll.approve") && !self,
    canWithdraw: pending && self,
    blockedReason: pending && self ? "You prepared this change, so an independent approver must decide." : pending && !can(actor, "payroll.approve") ? "Waiting for Finance approval." : null,
  };
}

/* CTC calculator ----------------------------------------------------------- */

export function ctcBreakup(annualCtcRupees: number, templateId: string, state: StateCode, regime: "new" | "old"): CtcBreakup {
  const store = db();
  const template = store.statTemplates.find((item) => item.id === templateId) ?? (store.statTemplates[0] as MockStructureTemplate);
  const annual = annualCtcRupees * 100;
  const month = structureMonth(annual / 12, template);
  const pf = pfFor(month.basic, null, template.pf);
  const esiEmployee = month.employerEsi ? Math.ceil((month.gross * 0.0075) / 100 - 1e-9) * 100 : 0;
  const fy = Number(store.today.slice(5, 7)) >= 4 ? Number(store.today.slice(0, 4)) : Number(store.today.slice(0, 4)) - 1;
  const months = Array.from({ length: 12 }, (_, index) => {
    const m = (index + 3) % 12;
    return `${m < 3 ? fy + 1 : fy}-${String(m + 1).padStart(2, "0")}`;
  });
  const ptAnnual = months.reduce((total, m) => total + ptFor(state, month.gross, m), 0);
  const lwfAnnual = months.reduce((total, m) => total + lwfFor(state, month.gross, m).employee, 0);
  const lwfEmployerAnnual = months.reduce((total, m) => total + lwfFor(state, month.gross, m).employer, 0);
  const grossAnnual = month.gross * 12;
  const standard = regime === "new" ? 7_500_000 : 5_000_000;
  const pfAnnual = pf.employee * 12;
  const taxable = Math.round(Math.max(0, grossAnnual - standard - (regime === "old" ? ptAnnual + Math.min(pfAnnual, 15_000_000) : 0)) / 1000) * 1000;
  const tax = annualTax(taxable, regime).total;
  const row = (code: string, name: string, kind: "earning" | "employer" | "deduction", monthly: number, yearly = monthly * 12, note: string | null = null) => ({ code, name, kind, monthly: inr(monthly), annual: inr(yearly), note });
  const rows = [
    ...(template.stipend
      ? [row("STIP", "Stipend", "earning", month.stipend)]
      : [
          row("BASIC", "Basic salary", "earning", month.basic, undefined, `${template.basicPctOfCtc}% of CTC`),
          row("HRA", "House rent allowance", "earning", month.hra, undefined, `${template.hraPctOfBasic}% of basic`),
          ...(month.conveyance ? [row("CONV", "Conveyance allowance", "earning", month.conveyance, undefined, "Fixed")] : []),
          ...(month.lta ? [row("LTA", "Leave travel allowance", "earning", month.lta, undefined, "Fixed")] : []),
          row("SPL", "Special allowance", "earning", month.special, undefined, "Balancing figure"),
        ]),
    ...(month.employerPf ? [row("EPF_ER", "Employer PF (EPS 8.33% + EPF 3.67%)", "employer", month.employerPf, undefined, "12% of PF wages (₹15,000 ceiling)")] : []),
    ...(month.employerEsi ? [row("ESI_ER", "Employer ESI (3.25%)", "employer", month.employerEsi, undefined, "Gross within ESI ceiling")] : []),
    ...(month.gratuity ? [row("GRAT", "Gratuity provision", "employer", month.gratuity, undefined, "4.81% of basic")] : []),
    ...(pf.employee ? [row("PF", "Employee PF (12%)", "deduction", pf.employee)] : []),
    ...(esiEmployee ? [row("ESI", "Employee ESI (0.75%)", "deduction", esiEmployee)] : []),
    ...(ptAnnual ? [row("PT", `Professional tax (${statStates[state]})`, "deduction", ptFor(state, month.gross, months[0] ?? ""), ptAnnual, "Monthly rate; February is higher where applicable")] : []),
    ...(lwfAnnual ? [row("LWF", `Labour welfare fund (${statStates[state]})`, "deduction", rupee(lwfAnnual / 12), lwfAnnual, "Monthly average; deducted per the state schedule")] : []),
    ...(tax ? [row("TDS", `Income tax estimate (${regime} regime)`, "deduction", rupee(tax / 12), tax, "No declarations assumed")] : []),
  ];
  const deductionsAnnual = pfAnnual + esiEmployee * 12 + ptAnnual + lwfAnnual + tax;
  const employerAnnual = (month.employerPf + month.employerEsi + month.gratuity) * 12;
  const warnings: string[] = [];
  if (month.overflow) warnings.push("Fixed components exceed this CTC — special allowance would be negative. Choose another template or raise the CTC.");
  if (annualCtcRupees < 180_000) warnings.push("Monthly gross may fall below state minimum wages; check the applicable schedule.");
  if (pf.edli) warnings.push(`EDLI (${rupeesText(pf.edli)}) and EPF admin (${rupeesText(pf.admin)}) a month are employer costs outside this CTC.`);
  if (lwfEmployerAnnual) warnings.push(`Employer LWF (${rupeesText(lwfEmployerAnnual)} a year) is also outside CTC.`);
  return {
    annualCtc: inr(annual),
    templateId: template.id,
    templateName: template.name,
    stateName: statStates[state],
    regime,
    rows,
    gross: { monthly: inr(month.gross), annual: inr(grossAnnual) },
    employerCost: { monthly: inr(month.employerPf + month.employerEsi + month.gratuity), annual: inr(employerAnnual) },
    deductions: { monthly: inr(rupee(deductionsAnnual / 12)), annual: inr(deductionsAnnual) },
    takeHome: { monthly: inr(rupee((grossAnnual - deductionsAnnual) / 12)), annual: inr(grossAnnual - deductionsAnnual) },
    annualTax: inr(tax),
    warnings,
  };
}

/* Read --------------------------------------------------------------------- */

export function salaryStructures(actor: MockActor, calc: { ctc?: string; template?: string; state?: string; regime?: string }): Structures {
  requireStructureAccess(actor);
  const store = db();
  const employees = activeEmployees();
  const pendingChanges = store.statStructureChanges.filter((change) => change.state === "pending");
  const ctcValid = calc.ctc && /^\d{5,9}$/.test(calc.ctc) && Number(calc.ctc) >= 100_000 && Number(calc.ctc) <= 50_000_000;
  const state = (stateCodes as string[]).includes(calc.state ?? "") ? (calc.state as StateCode) : "UP";
  const regime = calc.regime === "old" ? "old" : "new";
  const templateId = store.statTemplates.some((item) => item.id === calc.template) ? (calc.template as string) : "tpl_std";
  return {
    templates: store.statTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      version: template.version,
      publishedAt: template.publishedAt,
      publishedBy: employeeById(template.publishedBy)?.name ?? "Finance",
      basicPctOfCtc: template.basicPctOfCtc,
      hraPctOfBasic: template.hraPctOfBasic,
      conveyance: inr(template.conveyancePaise),
      lta: inr(template.ltaPaise),
      pf: template.pf,
      gratuity: template.gratuity,
      esi: template.esi,
      stipend: template.stipend,
      groups: groupOrder.filter((key) => store.statAssignments[key] === template.id).map(groupLabel),
      employees: employees.filter((employee) => templateFor(employee).id === template.id).length,
      pending: pendingChanges.some((change) => change.kind === "template" && change.templateId === template.id),
    })),
    assignments: groupOrder.map((key) => {
      const template = store.statTemplates.find((item) => item.id === store.statAssignments[key]);
      return {
        key,
        label: groupLabel(key),
        templateId: template?.id ?? "",
        templateName: template?.name ?? "Unassigned",
        employees: employees.filter((employee) => groupKeyOf(employee) === key).length,
        pending: pendingChanges.some((change) => change.kind === "assignment" && change.groupKey === key),
      };
    }),
    changes: [...store.statStructureChanges].sort((a, b) => b.preparedAt.localeCompare(a.preparedAt)).map((change) => toChange(actor, change)),
    calculator: ctcValid ? ctcBreakup(Number(calc.ctc), templateId, state, regime) : null,
    calculatorInput: { ctc: calc.ctc ?? "", templateId, state, regime },
    stateOptions: stateCodes.map((code) => ({ value: code, label: statStates[code] })),
    canPrepare: can(actor, "compensation.manage"),
    canApprove: can(actor, "payroll.approve"),
  };
}

/* Maker / checker ---------------------------------------------------------- */

function requirePrepare(actor: MockActor) {
  if (!can(actor, "compensation.manage")) throw problem(403, "FORBIDDEN", "Only payroll (compensation.manage) prepares structure changes.");
}

export function proposeTemplateChange(actor: MockActor, input: StructureProposal) {
  requirePrepare(actor);
  return idempotent(input.idempotencyKey, () => {
    const store = db();
    const template = store.statTemplates.find((item) => item.id === input.templateId);
    if (!template) throw problem(404, "NOT_FOUND", "Template not found.");
    if (template.stipend) throw problem(422, "STIPEND_TEMPLATE", "The stipend template has a single component and can't be restructured.");
    if (store.statStructureChanges.some((change) => change.state === "pending" && change.kind === "template" && change.templateId === template.id))
      throw problem(409, "CHANGE_PENDING", "A change to this template is already awaiting approval.");
    const terms: StructureTerms = {
      name: template.name,
      basicPctOfCtc: input.basicPctOfCtc,
      hraPctOfBasic: input.hraPctOfBasic,
      conveyancePaise: Number(input.conveyance) * 100,
      ltaPaise: Number(input.lta) * 100,
      pf: input.pf === "yes",
      gratuity: input.gratuity === "yes",
    };
    if (JSON.stringify(terms) === JSON.stringify(termsOf(template))) throw problem(422, "NO_CHANGE", "These terms match the published version.");
    const affected = activeEmployees().filter((employee) => templateFor(employee).id === template.id);
    const overflow = affected.filter((employee) => structureMonth((employee.annualCtc * 100) / 12, { ...template, ...terms }).overflow);
    if (overflow.length)
      throw problem(422, "STRUCTURE_OVERFLOW", "Fixed components would exceed CTC for some employees.", { fieldErrors: { basicPctOfCtc: `Special allowance would go negative for ${overflow.length} employee${overflow.length === 1 ? "" : "s"} (e.g. ${overflow[0]?.name}).` } });
    const change: MockStructureChange = { id: `sc_${store.counter + 1}`, reference: nextReference("SC"), kind: "template", templateId: template.id, terms, groupKey: null, reason: input.reason, preparedBy: actor.employeeId, preparedAt: nowInstant(), state: "pending", decidedBy: null, decidedAt: null, decisionNote: null };
    store.statStructureChanges.push(change);
    store.statAudit.push({ at: nowInstant(), actor: me(actor).name, event: `Structure change ${change.reference} prepared for ${template.name}` });
    return { reference: change.reference };
  });
}

export function proposeAssignment(actor: MockActor, input: AssignmentProposal) {
  requirePrepare(actor);
  return idempotent(input.idempotencyKey, () => {
    const store = db();
    if (!groupOrder.includes(input.groupKey)) throw problem(422, "UNKNOWN_GROUP", "Unknown grade or employee type.");
    const template = store.statTemplates.find((item) => item.id === input.templateId);
    if (!template) throw problem(422, "NOT_FOUND", "Choose a template.", { fieldErrors: { templateId: "Choose a template." } });
    if (store.statAssignments[input.groupKey] === template.id) throw problem(422, "NO_CHANGE", "This group already uses that template.", { fieldErrors: { templateId: "Already assigned." } });
    if (template.stipend !== (input.groupKey === "type:intern"))
      throw problem(422, "INVALID_ASSIGNMENT", "Only interns use the stipend template.", { fieldErrors: { templateId: input.groupKey === "type:intern" ? "Interns must stay on the stipend template." : "The stipend template is for interns only." } });
    if (store.statStructureChanges.some((change) => change.state === "pending" && change.kind === "assignment" && change.groupKey === input.groupKey))
      throw problem(409, "CHANGE_PENDING", "A change for this group is already awaiting approval.");
    const overflow = activeEmployees().filter((employee) => groupKeyOf(employee) === input.groupKey && structureMonth((employee.annualCtc * 100) / 12, template).overflow);
    if (overflow.length) throw problem(422, "STRUCTURE_OVERFLOW", "The template doesn't fit some salaries in this group.", { fieldErrors: { templateId: `Negative special allowance for ${overflow.length} employee(s).` } });
    const change: MockStructureChange = { id: `sc_${store.counter + 1}`, reference: nextReference("SC"), kind: "assignment", templateId: template.id, terms: null, groupKey: input.groupKey, reason: input.reason, preparedBy: actor.employeeId, preparedAt: nowInstant(), state: "pending", decidedBy: null, decidedAt: null, decisionNote: null };
    store.statStructureChanges.push(change);
    store.statAudit.push({ at: nowInstant(), actor: me(actor).name, event: `Assignment change ${change.reference} prepared: ${groupLabel(input.groupKey)} → ${template.name}` });
    return { reference: change.reference };
  });
}

export function decideStructureChange(actor: MockActor, id: string, decision: "approve" | "reject" | "withdraw", note: string) {
  requireStructureAccess(actor);
  const store = db();
  const change = store.statStructureChanges.find((item) => item.id === id);
  if (!change) throw problem(404, "NOT_FOUND", "That change no longer exists.");
  if (change.state !== "pending") throw problem(409, "ALREADY_DECIDED", "This change was already decided.");
  const self = change.preparedBy === actor.employeeId;
  if (decision === "withdraw") {
    if (!self) throw problem(403, "FORBIDDEN", "Only the preparer can withdraw a change.");
  } else {
    if (!can(actor, "payroll.approve")) throw problem(403, "FORBIDDEN", "Only Finance (payroll.approve) decides structure changes.");
    if (self) throw problem(403, "SELF_APPROVAL", "You prepared this change — an independent approver must decide.");
    if (decision === "reject" && note.trim().length < 5) throw problem(422, "NOTE_REQUIRED", "Explain why the change is rejected.", { fieldErrors: { note: "Add a reason (5+ characters)." } });
  }
  change.state = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "withdrawn";
  change.decidedBy = actor.employeeId;
  change.decidedAt = nowInstant();
  change.decisionNote = note.trim() || null;
  if (decision === "approve") {
    if (change.kind === "template") {
      const template = store.statTemplates.find((item) => item.id === change.templateId);
      if (template && change.terms) {
        Object.assign(template, change.terms, { version: template.version + 1, publishedAt: change.decidedAt, publishedBy: actor.employeeId });
      }
    } else if (change.groupKey) store.statAssignments[change.groupKey] = change.templateId;
  }
  store.statAudit.push({ at: nowInstant(), actor: me(actor).name, event: `Structure change ${change.reference} ${change.state}${change.decisionNote ? ` — ${change.decisionNote}` : ""}${decision === "approve" ? " (applies to open and future runs; approved runs stay frozen)" : ""}` });
  return { state: change.state };
}
