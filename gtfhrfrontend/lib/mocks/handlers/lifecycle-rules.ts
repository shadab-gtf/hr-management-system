import "server-only";
import { addDays, daysInMonth, diffDays, monthOf } from "@/lib/utils/date";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { inr } from "@/lib/mocks/seed/random";
import type { AssetCategory } from "@/types/lifecycle";

/*
 * Pure lifecycle rules (no store access) shared by the seed and the handlers.
 * SYNTHETIC: illustrative Indian-practice rules for the mock only. Finance and
 * legal must confirm real notice, encashment, gratuity and TDS treatment.
 */

export const NOTICE_DAYS = { confirmed: 60, probation: 30, shortTerm: 15 } as const;

export function noticePolicy(type: "full_time" | "contract" | "intern", onProbation: boolean): { days: number; basis: string } {
  if (type === "intern") return { days: NOTICE_DAYS.shortTerm, basis: "Intern — 15 days" };
  if (type === "contract") return { days: NOTICE_DAYS.shortTerm, basis: "Contract — 15 days" };
  if (onProbation) return { days: NOTICE_DAYS.probation, basis: "Full-time on probation — 30 days" };
  return { days: NOTICE_DAYS.confirmed, basis: "Full-time, confirmed — 60 days" };
}

const rupee = (value: number) => Math.round(value / 100) * 100;

/** Monthly structure in paise; mirrors the synthetic payroll split (basic = 40% of gross). */
export function monthlyStructure(annualCtcRupees: number, type: "full_time" | "contract" | "intern") {
  const monthlyCtc = (annualCtcRupees * 100) / 12;
  const employerPf = type === "intern" ? 0 : 180_000;
  const gross = rupee(monthlyCtc - employerPf);
  const basic = type === "intern" ? gross : rupee(gross * 0.4);
  return { gross, basic, employerPf };
}

export function tdsRate(annualCtcRupees: number) {
  return annualCtcRupees > 1_500_000 ? 0.1 : annualCtcRupees > 1_000_000 ? 0.05 : annualCtcRupees > 700_000 ? 0.02 : 0;
}

/** Completed years, months and days of service between two business dates (inclusive of the last day). */
export function serviceLength(joinedOn: string, lastDay: string) {
  const [y1 = 0, m1 = 1, d1 = 1] = joinedOn.split("-").map(Number);
  const end = addDays(lastDay, 1);
  const [y2 = 0, m2 = 1, d2 = 1] = end.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1);
  let days = d2 - d1;
  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(Date.UTC(y2, m2 - 1, 0)).getUTCDate();
    days += prevMonth;
  }
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  // Gratuity: a part year of more than six months counts as a full year.
  const gratuityYears = years + (remMonths > 6 || (remMonths === 6 && days > 0) ? 1 : 0);
  return { years, months: remMonths, days, gratuityYears, label: `${years} yr ${remMonths} mo` };
}

export const GRATUITY_CAP_PAISE = 2_000_000 * 100;

/** Straight-line book value: devices over 36 months to a 10% floor; cards and SIMs at cost. */
export function bookValuePaise(category: AssetCategory, costPaise: number, purchasedOn: string, asOf: string) {
  if (category === "id_card" || category === "sim") return costPaise;
  const months = Math.max(0, Math.floor(diffDays(purchasedOn, asOf) / 30.44));
  const factor = Math.max(0.1, 1 - months / 36);
  return rupee(costPaise * factor);
}

export interface SettlementComputeInput {
  employee: { name: string; type: "full_time" | "contract" | "intern"; annualCtc: number; joinedOn: string };
  lastWorkingDay: string;
  /** Earned-leave balance in half days. */
  elHalves: number;
  noticeShortfallDays: number;
  noticeWaived: boolean;
  reimbursements: { reference: string; title: string; paise: number }[];
  loans: { reference: string; label: string; outstandingPaise: number }[];
  assets: { tag: string; label: string; paise: number }[];
  manual: { kind: "earning" | "deduction"; paise: number }[];
}

export interface ComputedLine {
  code: string;
  kind: "earning" | "deduction";
  label: string;
  detail: string;
  paise: number;
}

const money = (paise: number) => formatMoney(inr(paise));

/** Auto lines of a full & final settlement, earnings first. Manual lines are appended by the caller. */
export function computeSettlement(input: SettlementComputeInput): ComputedLine[] {
  const { employee, lastWorkingDay } = input;
  const structure = monthlyStructure(employee.annualCtc, employee.type);
  const month = monthOf(lastWorkingDay);
  const monthDays = daysInMonth(month).length;
  const from = employee.joinedOn > `${month}-01` ? employee.joinedOn : `${month}-01`;
  const worked = Math.max(0, diffDays(from, lastWorkingDay) + 1);
  const lines: ComputedLine[] = [];

  const salary = rupee((structure.gross * worked) / monthDays);
  const basicEarned = rupee((structure.basic * worked) / monthDays);
  lines.push({ code: "SAL", kind: "earning", label: `Salary for ${formatDate(`${month}-01`, "month")}`, detail: `${worked} of ${monthDays} days × monthly gross ${money(structure.gross)}`, paise: salary });

  const elDays = Math.max(0, input.elHalves) / 2;
  const encashment = rupee((structure.basic / 26) * elDays);
  if (elDays > 0) lines.push({ code: "ENC", kind: "earning", label: "Leave encashment", detail: `${elDays} earned-leave days × basic ${money(structure.basic)} ÷ 26`, paise: encashment });

  const service = serviceLength(employee.joinedOn, lastWorkingDay);
  if (employee.type !== "intern" && service.years >= 5) {
    const raw = rupee((15 * structure.basic * service.gratuityYears) / 26);
    const capped = Math.min(raw, GRATUITY_CAP_PAISE);
    lines.push({ code: "GRAT", kind: "earning", label: "Gratuity", detail: `15 ÷ 26 × basic ${money(structure.basic)} × ${service.gratuityYears} years (service ${service.label})${capped < raw ? " · capped at ₹20,00,000" : ""}`, paise: capped });
  }

  for (const item of input.reimbursements)
    lines.push({ code: `REIMB-${item.reference}`, kind: "earning", label: "Approved reimbursement", detail: `${item.reference} · ${item.title}`, paise: item.paise });

  const pf = employee.type === "intern" ? 0 : Math.min(rupee(basicEarned * 0.12), 180_000);
  if (pf) lines.push({ code: "PF", kind: "deduction", label: "Provident fund (employee)", detail: `12% of final-month basic ${money(basicEarned)}, capped at ₹1,800`, paise: pf });
  if (salary > 1_500_000) lines.push({ code: "PT", kind: "deduction", label: "Professional tax", detail: "Final month slab", paise: 20_000 });

  if (input.noticeShortfallDays > 0 && !input.noticeWaived) {
    const recovery = rupee((structure.gross / 30) * input.noticeShortfallDays);
    lines.push({ code: "NOTICE", kind: "deduction", label: "Notice pay recovery", detail: `${input.noticeShortfallDays} days short × monthly gross ${money(structure.gross)} ÷ 30`, paise: recovery });
  }
  for (const loan of input.loans)
    if (loan.outstandingPaise > 0) lines.push({ code: `LOAN-${loan.reference}`, kind: "deduction", label: "Loan / advance recovery", detail: `${loan.reference} · ${loan.label} outstanding`, paise: loan.outstandingPaise });
  for (const asset of input.assets)
    if (asset.paise > 0) lines.push({ code: `ASSET-${asset.tag}`, kind: "deduction", label: "Unreturned asset recovery", detail: `${asset.tag} · ${asset.label} at book value`, paise: asset.paise });

  const manualTaxable = input.manual.filter((line) => line.kind === "earning").reduce((sum, line) => sum + line.paise, 0);
  const taxable = salary + encashment + manualTaxable;
  const rate = tdsRate(employee.annualCtc);
  const tds = rupee(taxable * rate);
  if (tds > 0) lines.push({ code: "TDS", kind: "deduction", label: "Income tax (TDS)", detail: `${(rate * 100).toFixed(0)}% of taxable ${money(taxable)} (salary, encashment, bonus). Gratuity treated as exempt.`, paise: tds });
  return lines;
}

/** Placeholder keys a letter template may use. */
export const letterPlaceholders: { key: string; label: string }[] = [
  { key: "employee.name", label: "Full name" },
  { key: "employee.firstName", label: "First name" },
  { key: "employee.code", label: "Employee code" },
  { key: "designation", label: "Designation" },
  { key: "department", label: "Department" },
  { key: "location", label: "Work location" },
  { key: "manager", label: "Reporting manager" },
  { key: "joinedOn", label: "Date of joining" },
  { key: "ctc", label: "Annual CTC" },
  { key: "monthlyGross", label: "Monthly gross" },
  { key: "probationEndsOn", label: "Probation end date" },
  { key: "lastWorkingDay", label: "Last working day" },
  { key: "service", label: "Length of service" },
  { key: "address", label: "Residential address" },
  { key: "today", label: "Issue date" },
  { key: "reference", label: "Letter reference" },
  { key: "company", label: "Company name" },
  { key: "legalEntity", label: "Legal entity" },
  { key: "signatory", label: "Signatory name" },
  { key: "signatoryTitle", label: "Signatory title" },
  { key: "purpose", label: "Purpose (letter requests)" },
  { key: "addressedTo", label: "Addressed to (letter requests)" },
];

const placeholderPattern = /\{\{\s*([a-zA-Z.]+)\s*\}\}/g;

export function unknownPlaceholders(textValue: string): string[] {
  const known = new Set(letterPlaceholders.map((item) => item.key));
  return [...new Set([...textValue.matchAll(placeholderPattern)].map((match) => match[1] ?? ""))].filter((key) => !known.has(key));
}

/** Substitutes placeholders; missing values render as a visible marker and are reported. */
export function renderTemplate(textValue: string, values: Record<string, string | null>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = textValue.replace(placeholderPattern, (_all, key: string) => {
    const value = values[key];
    if (value === null || value === undefined || value === "") {
      missing.add(key);
      return `[${letterPlaceholders.find((item) => item.key === key)?.label ?? key}]`;
    }
    return value;
  });
  return { text: out, missing: [...missing] };
}

