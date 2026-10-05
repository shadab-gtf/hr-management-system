import "server-only";
import { applyDueCompensation } from "@/lib/mocks/handlers/compensation-import";
import { problem } from "@/lib/api/core/problem";
import { db, nextReference, nowInstant } from "@/lib/mocks/store";
import type { MockDeclaration } from "@/lib/mocks/seed/extended";
import { inr } from "@/lib/mocks/seed/random";
import { addMonths, lastDayOfMonth } from "@/lib/utils/date";
import { formatDate } from "@/lib/utils/format";
import { calculate, publishedRuns } from "@/lib/mocks/handlers/payroll";
import { profileOf, structureMonth, templateFor } from "@/lib/mocks/handlers/payroll-engine";
import { idempotent, me, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import type {
  Compensation,
  DeclarationInput,
  Loan,
  LoanInput,
  ProofState,
  TaxDeclaration,
  TaxStatement,
  Ytd,
} from "@/types/salary";

/*
 * ILLUSTRATIVE figures for the UI. Not tax advice and not the payroll engine;
 * Finance owns real statutory rules (system/brain/payroll-rules.md).
 */

function financialYear(today: string) {
  const year = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? year : year - 1;
  return { start, label: `FY ${start}-${String(start + 1).slice(2)}`, firstMonth: `${start}-04` };
}
const toPaise = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
};

/* YTD ---------------------------------------------------------------------- */

export function ytdSummary(actor: MockActor): Ytd {
  requireCapability(actor, "payslip.read.self");
  const employee = me(actor);
  const fy = financialYear(db().today);
  const months = publishedRuns()
    .map((run) => run.month)
    .filter((month) => month >= fy.firstMonth)
    .sort();
  const results = months.map((month) => calculate(employee, month, false));
  const rows = new Map<string, { code: string; name: string; kind: "earning" | "deduction"; values: (number | null)[] }>();
  results.forEach((result, index) => {
    if (!result) return;
    for (const [kind, lines] of [["earning", result.earnings], ["deduction", result.deductions]] as const)
      for (const line of lines) {
        const row = rows.get(line.code) ?? { code: line.code, name: line.name, kind, values: months.map(() => null) };
        row.values[index] = line.paise;
        rows.set(line.code, row);
      }
  });
  const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0);
  const gross = results.reduce((total, result) => total + (result?.gross ?? 0), 0);
  const deductions = results.reduce((total, result) => total + (result?.deductionsTotal ?? 0), 0);
  return {
    financialYear: fy.label,
    months: months.map((month) => {
      const [name = "", year = ""] = formatDate(month, "month").split(" ");
      return `${name.slice(0, 3)} ’${year.slice(2)}`;
    }),
    rows: [...rows.values()].map((row) => ({
      code: row.code,
      name: row.name,
      kind: row.kind,
      amounts: row.values.map((value) => (value === null ? null : inr(value))),
      total: inr(sum(row.values)),
    })),
    gross: inr(gross),
    deductions: inr(deductions),
    net: inr(gross - deductions),
  };
}

/* Declaration -------------------------------------------------------------- */

const sections = [
  { code: "80C", name: "Section 80C — investments", limit: 15_000_000, items: [["80c_ppf", "Public Provident Fund (PPF)"], ["80c_elss", "ELSS mutual funds"], ["80c_lic", "Life insurance premium"], ["80c_tuition", "Children’s tuition fees"], ["80c_hlp", "Home loan principal"]] },
  { code: "80D", name: "Section 80D — health insurance", limit: 7_500_000, items: [["80d_self", "Self, spouse & children"], ["80d_parents", "Parents"]] },
  { code: "80CCD(1B)", name: "Section 80CCD(1B) — NPS", limit: 5_000_000, items: [["80ccd_nps", "Additional NPS contribution"]] },
  { code: "24(b)", name: "Section 24(b) — home loan interest", limit: 20_000_000, items: [["24b_interest", "Interest on self-occupied property"]] },
] as const;

function declarationFor(employeeId: string): MockDeclaration {
  const store = db();
  let declaration = store.declarations.get(employeeId);
  if (!declaration) {
    declaration = { regime: "new", status: "draft", submittedAt: null, items: {}, proofs: {}, monthlyRentPaise: 0, rentCity: "metro" };
    store.declarations.set(employeeId, declaration);
  }
  return declaration;
}

function windows(today: string) {
  const fy = financialYear(today);
  const closesOn = lastDayOfMonth(today.slice(0, 7));
  const proofOpens = `${fy.start + 1}-01-01`;
  const proofCloses = `${fy.start + 1}-02-28`;
  return {
    fy,
    window: { opensOn: `${fy.start}-04-01`, closesOn, open: today <= closesOn },
    proofWindow: { opensOn: proofOpens, closesOn: proofCloses, open: today >= proofOpens && today <= proofCloses },
  };
}

export function taxDeclaration(actor: MockActor): TaxDeclaration {
  requireCapability(actor, "tax.declare.self");
  const declaration = declarationFor(actor.employeeId);
  const { fy, window, proofWindow } = windows(db().today);
  return {
    financialYear: fy.label,
    regime: declaration.regime,
    status: declaration.status,
    window,
    proofWindow,
    submittedAt: declaration.submittedAt,
    monthlyRent: inr(declaration.monthlyRentPaise),
    rentCity: declaration.rentCity,
    sections: sections.map((section) => ({
      code: section.code,
      name: section.name,
      limit: inr(section.limit),
      oldRegimeOnly: true,
      items: section.items.map(([id, name]) => {
        const declared = declaration.items[id] ?? 0;
        const proof: ProofState = declared === 0 ? "not_required" : declaration.proofs[id] ?? "pending";
        return { id, name, declared: inr(declared), proof };
      }),
    })),
  };
}

export function saveDeclaration(actor: MockActor, input: DeclarationInput) {
  requireCapability(actor, "tax.declare.self");
  const { window } = windows(db().today);
  if (!window.open) throw problem(409, "WINDOW_CLOSED", "The declaration window is closed.");
  const items: Record<string, number> = {};
  const fieldErrors: Record<string, string> = {};
  for (const section of sections) {
    let total = 0;
    for (const [id] of section.items) {
      const value = toPaise(input.items[id] ?? "0");
      items[id] = value;
      total += value;
    }
    if (input.regime === "old" && total > section.limit)
      fieldErrors[section.items[0][0]] = `${section.code} total exceeds the ₹${(section.limit / 100).toLocaleString("en-IN")} limit.`;
  }
  if (Object.keys(fieldErrors).length) throw problem(422, "LIMIT_EXCEEDED", "Some sections exceed their limits.", { fieldErrors });
  const declaration = declarationFor(actor.employeeId);
  Object.assign(declaration, {
    regime: input.regime,
    items: input.regime === "new" ? {} : items,
    monthlyRentPaise: input.regime === "new" ? 0 : toPaise(input.monthlyRent),
    rentCity: input.rentCity,
    status: input.submit ? "submitted" : "draft",
    submittedAt: input.submit ? nowInstant() : declaration.submittedAt,
  } satisfies Partial<MockDeclaration>);
  return { status: declaration.status };
}

/* Tax statement ------------------------------------------------------------ */

export function taxStatement(actor: MockActor): TaxStatement {
  requireCapability(actor, "payslip.read.self");
  const employee = me(actor);
  const store = db();
  const fy = financialYear(store.today);
  const current = store.today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, index) => addMonths(fy.firstMonth, index));
  const results = months.map((month) => calculate(employee, month, month === current));
  const anchor = results[months.indexOf(current)] ?? results.find((result) => result !== null) ?? null;
  const tds = (index: number) => results[index]?.deductions.find((line) => line.code === "TDS")?.paise ?? 0;
  const deducted = months.reduce((total, month, index) => total + (month < current ? tds(index) : 0), 0);
  const tax = anchor?.tax;
  const neg = (value: number) => inr(-value);
  const lines = tax
    ? [
        { label: "Projected gross salary (17(1))", amount: inr(tax.projectedGross), emphasis: true },
        ...(tax.hraExemption ? [{ label: "HRA exemption u/s 10(13A)", amount: neg(tax.hraExemption), emphasis: false }] : []),
        { label: `Standard deduction u/s 16(ia)`, amount: neg(tax.standardDeduction), emphasis: false },
        ...(tax.professionalTax ? [{ label: "Professional tax u/s 16(iii)", amount: neg(tax.professionalTax), emphasis: false }] : []),
        ...tax.chapterVia.map((item) => ({ label: `Chapter VI-A · ${item.label}`, amount: neg(item.paise), emphasis: false })),
        ...(tax.homeLoanInterest ? [{ label: "Home loan interest u/s 24(b)", amount: neg(tax.homeLoanInterest), emphasis: false }] : []),
        { label: "Taxable income (rounded u/s 288A)", amount: inr(tax.taxableIncome), emphasis: true },
        { label: "Tax on income (slab rates)", amount: inr(tax.slabTax), emphasis: false },
        ...(tax.rebate87a ? [{ label: "Rebate u/s 87A", amount: neg(tax.rebate87a), emphasis: false }] : []),
        ...(tax.surcharge ? [{ label: "Surcharge", amount: inr(tax.surcharge), emphasis: false }] : []),
        { label: "Health & education cess (4%)", amount: inr(tax.cess), emphasis: false },
        ...(tax.panMissing ? [{ label: "Section 206AA minimum (PAN not on file)", amount: inr(tax.annualTax), emphasis: false }] : []),
        { label: "Total tax for the year", amount: inr(tax.annualTax), emphasis: true },
      ]
    : [];
  const payable = tax?.annualTax ?? 0;
  return {
    financialYear: fy.label,
    regime: tax?.regime ?? declarationFor(employee.id).regime,
    lines,
    taxPayable: inr(payable),
    taxDeducted: inr(deducted),
    balance: inr(payable - deducted),
    monthlyTds: months.flatMap((month, index) =>
      results[index] ? [{ month: formatDate(month, "month"), amount: inr(tds(index)), projected: month >= current }] : [],
    ),
    disclaimer: "Computed by the mock payroll engine (FY 2025-26 slabs onward, 87A rebate, 4% cess; TDS = projected tax less TDS deducted, spread over the remaining months). Synthetic data — not tax advice; Finance confirms actual TDS.",
  };
}

/* Loans -------------------------------------------------------------------- */

export function listLoans(actor: MockActor): Loan[] {
  requireCapability(actor, "loan.request.self");
  return db()
    .loans.filter((loan) => loan.employeeId === actor.employeeId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .map((loan) => {
      const emi = Math.ceil(loan.principalPaise / loan.tenureMonths / 100) * 100;
      return {
        id: loan.id,
        reference: loan.reference,
        type: loan.type,
        principal: inr(loan.principalPaise),
        outstanding: inr(Math.max(0, loan.principalPaise - emi * loan.paidInstallments)),
        emi: inr(emi),
        tenureMonths: loan.tenureMonths,
        paidInstallments: loan.paidInstallments,
        startMonth: loan.startMonth,
        state: loan.state,
        requestedAt: loan.requestedAt,
      };
    });
}

export function requestLoan(actor: MockActor, input: LoanInput, key: string | undefined) {
  requireCapability(actor, "loan.request.self");
  return idempotent(key, () => {
    const store = db();
    const principal = Number(input.amount) * 100;
    const monthlyGross = (me(actor).annualCtc * 100) / 12;
    if (input.type === "salary_advance" && principal > monthlyGross)
      throw problem(422, "LIMIT_EXCEEDED", "A salary advance can’t exceed one month’s gross pay.", { fieldErrors: { amount: "Up to one month’s gross pay." } });
    if (principal > 50_000_000) throw problem(422, "LIMIT_EXCEEDED", "Requests above ₹5,00,000 need a separate Finance review.", { fieldErrors: { amount: "Maximum ₹5,00,000." } });
    if (store.loans.some((loan) => loan.employeeId === actor.employeeId && loan.state === "requested"))
      throw problem(409, "REQUEST_PENDING", "You already have a request awaiting Finance.");
    const reference = nextReference("LN");
    store.loans.push({
      id: `ln_${store.counter}`,
      reference,
      employeeId: actor.employeeId,
      type: input.type,
      principalPaise: principal,
      tenureMonths: input.tenureMonths,
      paidInstallments: 0,
      startMonth: addMonths(store.today.slice(0, 7), 1),
      state: "requested",
      requestedAt: nowInstant(),
      reason: input.reason,
    });
    return { reference };
  });
}

/* Compensation ------------------------------------------------------------- */

export function compensation(actor: MockActor): Compensation {
  requireCapability(actor, "payslip.read.self");
  applyDueCompensation();
  const employee = me(actor);
  const template = templateFor(employee);
  const profile = profileOf(employee);
  const full = structureMonth((employee.annualCtc * 100) / 12, template, { pfOptOut: profile.pfOptOut });
  const ctc = employee.annualCtc * 100;
  const parts: [string, number][] = template.stipend
    ? [["Stipend", full.stipend]]
    : [
        ["Basic salary", full.basic],
        ["House rent allowance", full.hra],
        ["Conveyance allowance", full.conveyance],
        ["Leave travel allowance", full.lta],
        ["Special allowance", full.special],
        ["Employer PF (12%)", full.employerPf],
        ["Employer ESI (3.25%)", full.employerEsi],
        ["Gratuity provision (4.81%)", full.gratuity],
      ];
  const components = parts.filter(([, paise]) => paise > 0).map(([name, paise]) => ({ name, monthly: inr(paise), annual: inr(paise * 12) }));
  const imported = (db().compensationHistory.get(employee.id) ?? [])
    .filter((item) => item.applied)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
    .map((item) => ({
      id: `rv_${item.batchId}`,
      effectiveFrom: item.effectiveFrom,
      previousCtc: inr(item.previousPaise),
      newCtc: inr(item.newPaise),
      changePercent: item.previousPaise ? (((item.newPaise - item.previousPaise) / item.previousPaise) * 100).toFixed(1) : "0.0",
      reason: item.reason,
      letterReference: item.reference,
    }));
  const revisions = [...imported];
  let current = imported.length ? (imported.at(-1)?.previousCtc ? Number(imported.at(-1)?.previousCtc.amount) * 100 : ctc) : ctc;
  for (const [year, percent, reason] of [[2026, 10, "Annual performance review"], [2025, 12, "Annual performance review"]] as const) {
    const effective = `${year}-04-01`;
    if (effective <= employee.joinedOn) break;
    const previous = Math.round(current / (1 + percent / 100) / 100) * 100;
    revisions.push({
      id: `rv_${year}`,
      effectiveFrom: effective,
      previousCtc: inr(previous),
      newCtc: inr(current),
      changePercent: percent.toFixed(1),
      reason,
      letterReference: `REV-${year}-${employee.code}`,
    });
    current = previous;
  }
  return { annualCtc: inr(ctc), monthlyGross: inr(full.gross), components, revisions };
}
