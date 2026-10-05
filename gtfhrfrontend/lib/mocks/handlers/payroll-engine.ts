import "server-only";
import { db, type MockDb } from "@/lib/mocks/store";
import type { SeedEmployee } from "@/lib/mocks/seed/people";
import {
  statStates,
  type DueRule,
  type LwfRule,
  type MockEntity,
  type MockPayrollInput,
  type MockStatProfile,
  type MockStructureTemplate,
  type PtSlab,
  type StateCode,
} from "@/lib/mocks/seed/statutory";
import { addDays, addMonths, daysInMonth, diffDays, lastDayOfMonth } from "@/lib/utils/date";

/*
 * MOCK statutory payroll engine. It implements the published Indian mechanics
 * (EPF/EPS/EDLI, ESI with contribution periods, state PT/LWF, TDS u/s 192 by
 * regime) on synthetic data so every screen is explainable end to end. It is
 * not certified tax advice; Finance signs off real rules (payroll-rules.md).
 * All money is integer paise; statutory amounts round to whole rupees.
 */

export interface Line { code: string; name: string; paise: number }

export interface TaxBreakdown {
  financialYear: string;
  fyStart: number;
  regime: "new" | "old";
  projectedGross: number;
  hraExemption: number;
  standardDeduction: number;
  professionalTax: number;
  chapterVia: { code: string; label: string; paise: number }[];
  homeLoanInterest: number;
  taxableIncome: number;
  slabTax: number;
  rebate87a: number;
  surcharge: number;
  cess: number;
  annualTax: number;
  /** TDS deducted in earlier months of the FY. */
  deductedBefore: number;
  remainingMonths: number;
  monthlyTds: number;
  panMissing: boolean;
}

export interface Result {
  employee: SeedEmployee;
  payableDays: number;
  totalDays: number;
  lopDays: number;
  earnings: Line[];
  deductions: Line[];
  employer: Line[];
  gross: number;
  deductionsTotal: number;
  net: number;
  /* Statutory context (added fields). */
  month: string;
  entityId: string;
  state: StateCode;
  locationMapped: boolean;
  templateId: string;
  grade: string;
  /** Full-month structure gross, before proration and one-time inputs. */
  regularGross: number;
  pfWage: number;
  pfApplicable: boolean;
  esiWage: number;
  esiCovered: boolean;
  tax: TaxBreakdown;
  inputs: MockPayrollInput[];
  /** Special allowance would be negative: the structure exceeds CTC. */
  structureOverflow: boolean;
}

export const rupee = (value: number) => Math.round(value / 100) * 100;
const ceilRupee = (value: number) => Math.ceil(value / 100 - 1e-9) * 100;
const pct = (value: number, percent: number) => (value * percent) / 100;
const LAKH = 10_000_000; // ₹1,00,000 in paise

/* Resolution --------------------------------------------------------------- */

export function gradeOf(employee: SeedEmployee): string {
  const lakhs = employee.annualCtc / 100_000;
  if (lakhs >= 30) return "L5";
  if (lakhs >= 18) return "L4";
  if (lakhs >= 12) return "L3";
  if (lakhs >= 8) return "L2";
  return "L1";
}
export const gradeLabels: Record<string, string> = {
  L1: "Grade L1 · below ₹8L",
  L2: "Grade L2 · ₹8L–12L",
  L3: "Grade L3 · ₹12L–18L",
  L4: "Grade L4 · ₹18L–30L",
  L5: "Grade L5 · ₹30L and above",
};

export function groupKeyOf(employee: SeedEmployee): string {
  if (employee.type === "intern") return "type:intern";
  if (employee.type === "contract") return "type:contract";
  return `grade:${gradeOf(employee)}`;
}

export function templateFor(employee: SeedEmployee, store: MockDb = db()): MockStructureTemplate {
  const id = store.statAssignments[groupKeyOf(employee)] ?? "tpl_std";
  return store.statTemplates.find((item) => item.id === id) ?? (store.statTemplates[0] as MockStructureTemplate);
}

export function profileOf(employee: SeedEmployee, store: MockDb = db()): MockStatProfile {
  let profile = store.statProfiles.get(employee.id);
  if (!profile) {
    // Employees added after seeding start with an empty statutory profile.
    profile = {
      employeeId: employee.id,
      uan: null,
      pfMemberSerial: employee.id.slice(-4).padStart(7, "0"),
      esiIp: null,
      pan: null,
      pfOptOut: false,
      vpfPercent: 0,
      bankName: "Not provided",
      accountNumber: "",
      ifsc: "",
      bankStatus: "pending",
      bankChangedAt: null,
      registeredState: employee.location === "Remote" ? "UP" : null,
    };
    store.statProfiles.set(employee.id, profile);
  }
  return profile;
}

export function placementOf(employee: SeedEmployee, store: MockDb = db()): { entity: MockEntity; state: StateCode; mapped: boolean } {
  const mapping = store.statLocations[employee.location];
  const entity = store.statEntities.find((item) => item.id === (mapping?.entityId ?? "ent_tech")) ?? (store.statEntities[0] as MockEntity);
  const state = mapping?.state ?? profileOf(employee, store).registeredState ?? "UP";
  return { entity, state, mapped: Boolean(mapping) };
}

export const stateName = (state: StateCode) => statStates[state];

/* Salary structure --------------------------------------------------------- */

export interface StructureMonth {
  basic: number;
  hra: number;
  conveyance: number;
  lta: number;
  special: number;
  stipend: number;
  employerPf: number;
  gratuity: number;
  employerEsi: number;
  gross: number;
  overflow: boolean;
}

/** Full-month components for a monthly CTC (paise) under a template. */
export function structureMonth(
  monthlyCtc: number,
  template: Pick<MockStructureTemplate, "basicPctOfCtc" | "hraPctOfBasic" | "conveyancePaise" | "ltaPaise" | "pf" | "gratuity" | "esi" | "stipend">,
  options: { pfOptOut?: boolean } = {},
  store: MockDb = db(),
): StructureMonth {
  const settings = store.statSettings;
  if (template.stipend) {
    const stipend = rupee(monthlyCtc);
    return { basic: 0, hra: 0, conveyance: 0, lta: 0, special: 0, stipend, employerPf: 0, gratuity: 0, employerEsi: 0, gross: stipend, overflow: false };
  }
  const basic = rupee(pct(monthlyCtc, template.basicPctOfCtc));
  const hra = rupee(pct(basic, template.hraPctOfBasic));
  const conveyance = template.conveyancePaise;
  const lta = template.ltaPaise;
  const pfBase = settings.pfWageBasis === "ceiling" ? Math.min(basic, settings.pfCeilingPaise) : basic;
  const employerPf = template.pf && !options.pfOptOut ? rupee(pct(pfBase, 12)) : 0;
  const gratuity = template.gratuity ? rupee(pct(basic, 4.81)) : 0;
  const available = monthlyCtc - employerPf - gratuity;
  // ESI-covered pay: employer ESI (3.25% of gross) also sits inside CTC.
  let gross = available;
  let employerEsi = 0;
  if (template.esi && available / 1.0325 <= settings.esiCeilingPaise) {
    gross = rupee(available / 1.0325);
    employerEsi = ceilRupee(pct(gross, 3.25));
  }
  const special = gross - basic - hra - conveyance - lta;
  return {
    basic,
    hra,
    conveyance,
    lta,
    special: Math.max(0, special),
    stipend: 0,
    employerPf,
    gratuity,
    employerEsi,
    gross: basic + hra + conveyance + lta + Math.max(0, special),
    overflow: special < 0,
  };
}

/* PF / ESI / PT / LWF ------------------------------------------------------ */

export interface PfResult { employee: number; vpf: number; eps: number; epfEmployer: number; edli: number; admin: number; base: number }

export function pfFor(pfWage: number, profile: MockStatProfile | null, applicable: boolean, store: MockDb = db()): PfResult {
  const zero = { employee: 0, vpf: 0, eps: 0, epfEmployer: 0, edli: 0, admin: 0, base: 0 };
  if (!applicable || profile?.pfOptOut || pfWage <= 0) return zero;
  const settings = store.statSettings;
  const capped = Math.min(pfWage, settings.pfCeilingPaise);
  const base = settings.pfWageBasis === "ceiling" ? capped : pfWage;
  const employee = rupee(pct(base, 12));
  const vpf = profile?.vpfPercent ? rupee(pct(pfWage, profile.vpfPercent)) : 0;
  const eps = Math.min(rupee(pct(capped, 8.33)), 125_000);
  const employerTotal = rupee(pct(base, 12));
  return {
    employee,
    vpf,
    eps,
    epfEmployer: employerTotal - eps,
    edli: Math.min(rupee(pct(capped, 0.5)), 7_500),
    admin: rupee(pct(base, 0.5)),
    base,
  };
}

export function contributionPeriodStart(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (m >= 4 && m <= 9) return `${year}-04`;
  return m >= 10 ? `${year}-10` : `${year - 1}-10`;
}

export function ptSlabFor(state: StateCode, gross: number, store: MockDb = db()): PtSlab | null {
  const slabs = store.statSettings.ptSlabs[state] ?? [];
  return slabs.find((slab) => slab.toPaise === null || gross <= slab.toPaise) ?? null;
}
export function ptFor(state: StateCode, gross: number, month: string, store: MockDb = db()): number {
  const slab = ptSlabFor(state, gross, store);
  if (!slab) return 0;
  return month.slice(5, 7) === "02" ? slab.februaryPaise : slab.monthlyPaise;
}

export function lwfFor(state: StateCode, gross: number, month: string, store: MockDb = db()): { employee: number; employer: number } {
  const rule: LwfRule | undefined = store.statSettings.lwf[state];
  if (!rule || gross <= 0) return { employee: 0, employer: 0 };
  const m = Number(month.slice(5, 7));
  if (rule.months.length && !rule.months.includes(m)) return { employee: 0, employer: 0 };
  let employee = rule.employeeFixedPaise ?? 0;
  if (rule.employeeRateBp !== null) {
    employee = Math.round((gross * rule.employeeRateBp) / 10_000);
    if (rule.employeeCapPaise !== null) employee = Math.min(employee, rule.employeeCapPaise);
  }
  const employer = rule.employerFixedPaise ?? Math.round(employee * (rule.employerMultiplier ?? 0));
  return { employee, employer };
}

/* Due dates ---------------------------------------------------------------- */

export function dueDate(rule: DueRule, month: string): string | null {
  if (rule.kind === "none") return null;
  if (rule.kind === "same_month_end") return lastDayOfMonth(month);
  return `${addMonths(month, 1)}-${String(rule.day).padStart(2, "0")}`;
}
export function tdsDueDate(month: string): string {
  // Tax deducted in March is due by 30 April; otherwise the 7th of next month.
  return month.slice(5, 7) === "03" ? `${month.slice(0, 4)}-04-30` : `${addMonths(month, 1)}-07`;
}

/* Income tax --------------------------------------------------------------- */

export function financialYearOf(month: string) {
  const year = Number(month.slice(0, 4));
  const start = Number(month.slice(5, 7)) >= 4 ? year : year - 1;
  return { start, label: `FY ${start}-${String(start + 1).slice(2)}`, short: `${start}-${String(start + 1).slice(2)}`, firstMonth: `${start}-04`, lastMonth: `${start + 1}-03` };
}

const slabsNew: [number, number][] = [[4 * LAKH, 0], [8 * LAKH, 5], [12 * LAKH, 10], [16 * LAKH, 15], [20 * LAKH, 20], [24 * LAKH, 25], [Infinity, 30]];
const slabsOld: [number, number][] = [[2.5 * LAKH, 0], [5 * LAKH, 5], [10 * LAKH, 20], [Infinity, 30]];

/** Annual tax on taxable income (paise) — FY 2025-26 onward slabs, 87A rebate, surcharge, 4% cess. */
export function annualTax(taxable: number, regime: "new" | "old") {
  let slabTax = 0;
  let lower = 0;
  for (const [upper, rate] of regime === "new" ? slabsNew : slabsOld) {
    if (taxable > lower) slabTax += Math.round(pct(Math.min(taxable, upper) - lower, rate));
    lower = upper;
  }
  let rebate = 0;
  if (regime === "new") {
    if (taxable <= 12 * LAKH) rebate = Math.min(slabTax, 6_000_000);
    // Marginal relief: tax may not exceed the income above ₹12 lakh.
    else if (slabTax > taxable - 12 * LAKH) rebate = slabTax - (taxable - 12 * LAKH);
  } else if (taxable <= 5 * LAKH) rebate = Math.min(slabTax, 1_250_000);
  const afterRebate = slabTax - rebate;
  const surchargeRate = taxable > 500 * LAKH ? (regime === "new" ? 25 : 37) : taxable > 200 * LAKH ? 25 : taxable > 100 * LAKH ? 15 : taxable > 50 * LAKH ? 10 : 0;
  const surcharge = rupee(pct(afterRebate, surchargeRate));
  const cess = rupee(pct(afterRebate + surcharge, 4));
  return { slabTax, rebate, surcharge, cess, total: rupee(afterRebate + surcharge + cess) };
}

const declarationSections = [
  { code: "80C", label: "80C — PF, PPF, ELSS, insurance, tuition, home-loan principal", limit: 150_000_00, items: ["80c_ppf", "80c_elss", "80c_lic", "80c_tuition", "80c_hlp"] },
  { code: "80D", label: "80D — health insurance", limit: 75_000_00, items: ["80d_self", "80d_parents"] },
  { code: "80CCD(1B)", label: "80CCD(1B) — additional NPS", limit: 50_000_00, items: ["80ccd_nps"] },
] as const;

interface Declared { regime: "new" | "old"; items: Record<string, number>; monthlyRentPaise: number; rentCity: "metro" | "non_metro" }

function declarationFor(employeeId: string, fyStart: number, store: MockDb): Declared {
  const current = financialYearOf(store.today.slice(0, 7)).start;
  // Only the current FY's declaration is held; earlier years were archived under the default regime.
  if (fyStart !== current) return { regime: "new", items: {}, monthlyRentPaise: 0, rentCity: "metro" };
  const declaration = store.declarations.get(employeeId);
  if (!declaration) return { regime: "new", items: {}, monthlyRentPaise: 0, rentCity: "metro" };
  return { regime: declaration.regime, items: declaration.items, monthlyRentPaise: declaration.monthlyRentPaise, rentCity: declaration.rentCity };
}

interface YearTotals { gross: number; basic: number; hra: number; pt: number; pf: number; months: number }

function computeTax(store: MockDb, employee: SeedEmployee, month: string, fy: ReturnType<typeof financialYearOf>, actual: YearTotals, projected: YearTotals, deductedBefore: number): TaxBreakdown {
  const declared = declarationFor(employee.id, fy.start, store);
  const old = declared.regime === "old";
  const gross = actual.gross + projected.gross;
  const basic = actual.basic + projected.basic;
  const hraReceived = actual.hra + projected.hra;
  const monthsEmployed = actual.months + projected.months;
  const standardDeduction = Math.min(gross, old ? 50_000_00 : 75_000_00);
  const professionalTax = old ? actual.pt + projected.pt : 0;
  const rent = declared.monthlyRentPaise * monthsEmployed;
  const hraExemption = old && rent > 0 ? Math.max(0, Math.round(Math.min(hraReceived, rent - pct(basic, 10), pct(basic, declared.rentCity === "metro" ? 50 : 40)))) : 0;
  const chapterVia = old
    ? declarationSections
        .map((section) => {
          const declaredAmount = section.items.reduce((total, id) => total + (declared.items[id] ?? 0), 0) + (section.code === "80C" ? actual.pf + projected.pf : 0);
          return { code: section.code, label: section.label, paise: Math.min(section.limit, declaredAmount) };
        })
        .filter((item) => item.paise > 0)
    : [];
  const homeLoanInterest = old ? Math.min(200_000_00, declared.items["24b_interest"] ?? 0) : 0;
  const viaTotal = chapterVia.reduce((total, item) => total + item.paise, 0);
  // Section 288A: taxable income rounded to the nearest ₹10.
  const taxableIncome = Math.round(Math.max(0, gross - standardDeduction - professionalTax - hraExemption - viaTotal - homeLoanInterest) / 1000) * 1000;
  const tax = annualTax(taxableIncome, declared.regime);
  const profile = profileOf(employee, store);
  const panMissing = !profile.pan;
  // Section 206AA: without a PAN, TDS is at least 20% of taxable income.
  const total = panMissing ? Math.max(tax.total, rupee(pct(taxableIncome, 20))) : tax.total;
  const index = diffMonths(fy.firstMonth, month);
  const remainingMonths = 12 - index;
  const monthlyTds = Math.max(0, rupee((total - deductedBefore) / remainingMonths));
  return {
    financialYear: fy.label,
    fyStart: fy.start,
    regime: declared.regime,
    projectedGross: gross,
    hraExemption,
    standardDeduction,
    professionalTax,
    chapterVia,
    homeLoanInterest,
    taxableIncome,
    slabTax: tax.slabTax,
    rebate87a: tax.rebate,
    surcharge: tax.surcharge,
    cess: tax.cess,
    annualTax: total,
    deductedBefore,
    remainingMonths,
    monthlyTds,
    panMissing,
  };
}

function diffMonths(from: string, to: string) {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
}

/* Month calculation -------------------------------------------------------- */

interface PreTax {
  result: Omit<Result, "tax" | "deductions" | "deductionsTotal" | "net">;
  deductions: Line[];
  pt: number;
  pfEmployee: number;
}

const inputLabels: Record<MockPayrollInput["kind"], string> = {
  bonus: "Bonus",
  incentive: "Incentive",
  arrears: "Arrears",
  other_deduction: "Other deduction",
  lop_override: "LOP days",
};
export const payrollInputLabel = (kind: MockPayrollInput["kind"]) => inputLabels[kind];

function loanRecovery(store: MockDb, employeeId: string, month: string): number {
  return store.loans.filter((loan) => loan.employeeId === employeeId && loan.state === "active" && month >= loan.startMonth && month < addMonths(loan.startMonth, loan.tenureMonths))
    .reduce((total, loan) => total + Math.ceil(loan.principalPaise / loan.tenureMonths / 100) * 100, 0);
}

function preTax(store: MockDb, employee: SeedEmployee, month: string): PreTax | null {
  const periodEnd = lastDayOfMonth(month);
  if (employee.joinedOn > periodEnd) return null;
  if (employee.status === "exited") return null;
  // New hires stay out of payroll until Payroll sets compensation (compensation.manage).
  if (employee.annualCtc <= 0) return null;

  const template = templateFor(employee, store);
  const profile = profileOf(employee, store);
  const { entity, state, mapped } = placementOf(employee, store);
  const inputs = store.payrollInputs.filter((item) => item.employeeId === employee.id && item.month === month);
  const totalDays = daysInMonth(month).length;
  const joinedInPeriod = employee.joinedOn > `${month}-01`;
  const eligibleDays = joinedInPeriod ? diffDays(employee.joinedOn, periodEnd) + 1 : totalDays;
  const lopInput = inputs.find((item) => item.kind === "lop_override");
  const lopDays = Math.min(eligibleDays, (lopInput?.lopHalves ?? 0) / 2);
  const payableDays = eligibleDays - lopDays;
  const factor = payableDays / totalDays;

  const monthlyCtc = (employee.annualCtc * 100) / 12;
  const pfApplicable = template.pf && !profile.pfOptOut;
  const full = structureMonth(monthlyCtc, template, { pfOptOut: profile.pfOptOut }, store);
  const prorate = (value: number) => rupee(value * factor);

  const earnings: Line[] = [];
  if (template.stipend) earnings.push({ code: "STIP", name: "Stipend", paise: prorate(full.stipend) });
  else {
    const basic = prorate(full.basic);
    const hra = prorate(full.hra);
    const conveyance = prorate(full.conveyance);
    const lta = prorate(full.lta);
    const special = prorate(full.gross) - basic - hra - conveyance - lta;
    earnings.push({ code: "BASIC", name: "Basic salary", paise: basic }, { code: "HRA", name: "House rent allowance", paise: hra });
    if (conveyance) earnings.push({ code: "CONV", name: "Conveyance allowance", paise: conveyance });
    if (lta) earnings.push({ code: "LTA", name: "Leave travel allowance", paise: lta });
    earnings.push({ code: "SPL", name: "Special allowance", paise: Math.max(0, special) });
  }
  const oneTime = (kind: MockPayrollInput["kind"]) => inputs.filter((item) => item.kind === kind).reduce((total, item) => total + item.amountPaise, 0);
  const bonus = oneTime("bonus");
  const incentive = oneTime("incentive");
  const arrears = oneTime("arrears");
  if (bonus) earnings.push({ code: "BONUS", name: "Bonus", paise: bonus });
  if (incentive) earnings.push({ code: "INCENT", name: "Incentive", paise: incentive });
  if (arrears) earnings.push({ code: "ARR", name: "Arrears", paise: arrears });
  // Approved leave encashment (leave module) is paid in its target payroll month.
  const encashment = store.leaveEncashments
    .filter((item) => item.employeeId === employee.id && item.state === "approved" && item.payrollMonth === month)
    .reduce((total, item) => total + item.amountPaise, 0);
  if (encashment) earnings.push({ code: "LENC", name: "Leave encashment", paise: encashment });
  const gross = earnings.reduce((total, line) => total + line.paise, 0);

  // EPF wages = basic earned this month (arrears/bonus excluded in this mock).
  const pfWage = earnings.find((line) => line.code === "BASIC")?.paise ?? 0;
  const pf = pfFor(pfWage, profile, pfApplicable, store);

  // ESI: eligibility is fixed at the start of each contribution period (Apr–Sep, Oct–Mar).
  // Mock: the structure gross at the period start equals today's structure (no mid-period history).
  const esiCovered = template.esi && full.gross <= store.statSettings.esiCeilingPaise;
  // Bonus and leave encashment are not ESI wages.
  const esiWage = esiCovered ? gross - bonus - encashment : 0;
  const esiEmployee = esiCovered ? ceilRupee(pct(esiWage, 0.75)) : 0;
  const esiEmployer = esiCovered ? ceilRupee(pct(esiWage, 3.25)) : 0;

  const pt = ptFor(state, gross, month, store);
  const lwf = lwfFor(state, gross, month, store);
  const loan = loanRecovery(store, employee.id, month);
  const other = oneTime("other_deduction");

  const deductions: Line[] = [];
  if (pf.employee) deductions.push({ code: "PF", name: "Provident fund (EPF 12%)", paise: pf.employee });
  if (pf.vpf) deductions.push({ code: "VPF", name: `Voluntary PF (${profile.vpfPercent}%)`, paise: pf.vpf });
  if (esiEmployee) deductions.push({ code: "ESI", name: "ESI (0.75%)", paise: esiEmployee });
  if (pt) deductions.push({ code: "PT", name: `Professional tax (${stateName(state)})`, paise: pt });
  if (lwf.employee) deductions.push({ code: "LWF", name: `Labour welfare fund (${stateName(state)})`, paise: lwf.employee });
  if (loan) deductions.push({ code: "LOAN", name: "Loan / advance recovery", paise: loan });
  if (other) deductions.push({ code: "OTHDED", name: "Other deduction", paise: other });

  const employer: Line[] = [];
  if (pf.eps) employer.push({ code: "EPS", name: "Pension scheme (EPS 8.33%)", paise: pf.eps });
  if (pf.epfEmployer) employer.push({ code: "EPF_ER", name: "Provident fund (employer EPF)", paise: pf.epfEmployer });
  if (pf.edli) employer.push({ code: "EDLI", name: "EDLI insurance (0.5%)", paise: pf.edli });
  if (pf.admin) employer.push({ code: "EPF_ADM", name: "EPF admin charges (0.5%)", paise: pf.admin });
  if (esiEmployer) employer.push({ code: "ESI_ER", name: "ESI (employer 3.25%)", paise: esiEmployer });
  if (lwf.employer) employer.push({ code: "LWF_ER", name: "Labour welfare fund (employer)", paise: lwf.employer });
  if (full.gratuity) employer.push({ code: "GRAT", name: "Gratuity provision (4.81%)", paise: prorate(full.gratuity) });

  return {
    result: {
      employee,
      payableDays,
      totalDays,
      lopDays,
      earnings,
      employer,
      gross,
      month,
      entityId: entity.id,
      state,
      locationMapped: mapped,
      templateId: template.id,
      grade: gradeOf(employee),
      regularGross: full.gross,
      pfWage,
      pfApplicable,
      esiWage,
      esiCovered,
      inputs,
      structureOverflow: full.overflow,
    },
    deductions,
    pt,
    pfEmployee: pf.employee + pf.vpf,
  };
}

/** Projection of the rest of the FY at the regular (full-month, no one-time) structure. */
function projectRest(store: MockDb, employee: SeedEmployee, month: string, lastMonth: string): YearTotals {
  const totals: YearTotals = { gross: 0, basic: 0, hra: 0, pt: 0, pf: 0, months: 0 };
  if (employee.status === "exited") return totals;
  const template = templateFor(employee, store);
  const profile = profileOf(employee, store);
  const { state } = placementOf(employee, store);
  const full = structureMonth((employee.annualCtc * 100) / 12, template, { pfOptOut: profile.pfOptOut }, store);
  const pf = pfFor(full.basic, profile, template.pf && !profile.pfOptOut, store);
  for (let m = addMonths(month, 1); m <= lastMonth; m = addMonths(m, 1)) {
    if (employee.joinedOn > lastDayOfMonth(m)) continue;
    totals.gross += full.gross;
    totals.basic += full.basic;
    totals.hra += full.hra;
    totals.pt += ptFor(state, full.gross, m, store);
    totals.pf += pf.employee + pf.vpf;
    totals.months += 1;
  }
  return totals;
}

/** Months whose results are frozen: approved/closed runs and pre-system history. */
function isFrozen(month: string, store: MockDb = db()): boolean {
  const current = store.today.slice(0, 7);
  if (month >= current) {
    const run = store.payrollRuns.find((item) => item.month === month);
    return Boolean(run && ["approved", "published", "paid"].includes(run.state));
  }
  const earliest = store.payrollRuns.reduce((min, run) => (run.month < min ? run.month : min), current);
  if (month < earliest) return true;
  const run = store.payrollRuns.find((item) => item.month === month);
  return !run || ["approved", "published", "paid"].includes(run.state);
}

function finish(pre: PreTax, tax: TaxBreakdown): Result {
  const deductions = [...pre.deductions];
  if (tax.monthlyTds) {
    // Keep TDS just before loan/other recoveries for a conventional payslip order.
    const index = deductions.findIndex((line) => line.code === "LOAN" || line.code === "OTHDED");
    const line = { code: "TDS", name: `Income tax (TDS, ${tax.regime} regime)`, paise: tax.monthlyTds };
    if (index === -1) deductions.push(line);
    else deductions.splice(index, 0, line);
  }
  const deductionsTotal = deductions.reduce((total, line) => total + line.paise, 0);
  return { ...pre.result, deductions, deductionsTotal, net: pre.result.gross - deductionsTotal, tax };
}

/**
 * Calculates one employee-month. TDS follows section 192: projected annual tax
 * less TDS already deducted this FY, spread over the remaining months.
 * `_current` is kept for callers; one-time inputs are month-keyed and always apply.
 */
export function calculate(employee: SeedEmployee, month: string, _current: boolean): Result | null {
  const store = db();
  const fy = financialYearOf(month);
  const actual: YearTotals = { gross: 0, basic: 0, hra: 0, pt: 0, pf: 0, months: 0 };
  let deducted = 0;
  let result: Result | null = null;
  for (let m = fy.firstMonth; m <= month; m = addMonths(m, 1)) {
    const key = `${employee.id}|${m}`;
    const frozen = isFrozen(m, store);
    let monthResult: Result | null;
    if (frozen && store.statSnapshots.has(key)) monthResult = store.statSnapshots.get(key) as Result | null;
    else {
      const pre = preTax(store, employee, m);
      if (!pre) monthResult = null;
      else {
        const withThis: YearTotals = {
          gross: actual.gross + pre.result.gross,
          basic: actual.basic + (pre.result.earnings.find((line) => line.code === "BASIC")?.paise ?? 0),
          hra: actual.hra + (pre.result.earnings.find((line) => line.code === "HRA")?.paise ?? 0),
          pt: actual.pt + pre.pt,
          pf: actual.pf + pre.pfEmployee,
          months: actual.months + 1,
        };
        monthResult = finish(pre, computeTax(store, employee, m, fy, withThis, projectRest(store, employee, m, fy.lastMonth), deducted));
      }
      if (frozen) store.statSnapshots.set(key, monthResult);
    }
    if (m === month) result = monthResult;
    else if (monthResult) {
      actual.gross += monthResult.gross;
      actual.basic += monthResult.earnings.find((line) => line.code === "BASIC")?.paise ?? 0;
      actual.hra += monthResult.earnings.find((line) => line.code === "HRA")?.paise ?? 0;
      actual.pt += monthResult.deductions.find((line) => line.code === "PT")?.paise ?? 0;
      actual.pf += (monthResult.deductions.find((line) => line.code === "PF")?.paise ?? 0) + (monthResult.deductions.find((line) => line.code === "VPF")?.paise ?? 0);
      actual.months += 1;
      deducted += monthResult.deductions.find((line) => line.code === "TDS")?.paise ?? 0;
    }
  }
  return result;
}

/** Drops cached results for months that are not frozen (after inputs/rules change). */
export function invalidateLive() {
  const store = db();
  for (const key of store.statSnapshots.keys()) {
    const month = key.split("|")[1] ?? "";
    if (!isFrozen(month, store)) store.statSnapshots.delete(key);
  }
}

export const lineAmount = (lines: Line[], code: string) => lines.find((line) => line.code === code)?.paise ?? 0;

/** Payment date: last working weekday of the month. */
export function paymentDateOf(month: string) {
  let date = lastDayOfMonth(month);
  while ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) date = addDays(date, -1);
  return date;
}
