import { createHash } from "node:crypto";
import type { PayCompensation, PayDeclaration, PayInput, PayLoan, PayProfile, PayTemplate } from "@prisma/client";
import { z } from "zod";
import { personRef } from "../../core/people/person-ref.js";
import { AppError } from "../../core/errors/AppError.js";
import { inr, paiseFromAmount } from "../../utils/money.js";
import { toIsoDate, addDays, daysBetween } from "../../utils/date.js";
import type { FullRun, PayEmployee } from "./payroll.repository.js";
import {
  policySchema,
  templateTermsSchema,
  type PayPolicy,
  type ResultSnapshot,
  type TemplateTerms,
} from "./payroll.schema.js";

export const finalStates = ["approved", "published", "paid"];
export const editableStates = ["draft", "calculated", "rejected"];
export const inputLabels: Record<string, string> = {
  bonus: "Bonus",
  incentive: "Incentive",
  arrears: "Arrears",
  other_deduction: "Other deduction",
  lop_override: "LOP days",
};
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
export function addMonths(month: string, amount: number) {
  const [year = 1970, number = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + amount, 1)).toISOString().slice(0, 7);
}
export const monthEnd = (month: string) => addDays(`${addMonths(month, 1)}-01`, -1);
export function fiscalYear(month: string) {
  const year = Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 4 ? 1 : 0);
  return {
    start: year,
    key: `${year}-${String(year + 1).slice(-2)}`,
    firstMonth: `${year}-04`,
    lastMonth: `${year + 1}-03`,
    label: `FY ${year}-${String(year + 1).slice(-2)}`,
  };
}
export const roundDiv = (numerator: bigint, denominator: bigint) =>
  Number((numerator + denominator / 2n) / denominator);
export const rate = (paise: number, bps: number) => roundDiv(BigInt(paise) * BigInt(bps), 10000n);
export const roundedRupee = (paise: number) => roundDiv(BigInt(paise), 100n) * 100;
export const emiOf = (principal: bigint, months: number) =>
  Number((principal + BigInt(months * 100 - 1)) / BigInt(months * 100)) * 100;
export const maskAccount = (value: string) => (value ? `XXXX XXXX ${value.slice(-4)}` : "Not provided");
export const maskPan = (value: string | null) => (value ? `${value.slice(0, 2)}XXX${value.slice(5)}` : null);
export const digest = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
export function loadPolicy(value: unknown): PayPolicy {
  const parsed = policySchema.safeParse(value);
  if (!parsed.success)
    throw new AppError(
      503,
      "PAYROLL_CONFIGURATION_REQUIRED",
      "Configure approved payroll policies before calculating payroll.",
    );
  return parsed.data;
}
export function groupKey(type: string, annualPaise: number) {
  if (type !== "full_time") return `type:${type}`;
  const lakh = annualPaise / 10000000;
  return `grade:${lakh >= 30 ? "L5" : lakh >= 18 ? "L4" : lakh >= 12 ? "L3" : lakh >= 8 ? "L2" : "L1"}`;
}
export function currentCtc(rows: PayCompensation[], employeeId: string, date: string) {
  return (
    rows.filter((row) => row.employeeId === employeeId && toIsoDate(row.effectiveFrom) <= date).at(-1)?.annualPaise ??
    0n
  );
}
export function templateFor(
  employee: Pick<PayEmployee, "employmentType">,
  annualPaise: number,
  templates: PayTemplate[],
  policy: PayPolicy,
) {
  const id = policy.assignments[groupKey(employee.employmentType, annualPaise)];
  const template = templates.find((row) => row.id === id);
  if (!template)
    throw new AppError(
      409,
      "SALARY_STRUCTURE_MISSING",
      "Assign a salary structure to every employment group before calculation.",
    );
  return { ...templateTermsSchema.parse(template.terms), id: template.id };
}

export function structure(annualPaise: number, terms: TemplateTerms, policy: PayPolicy, pfOptOut = false) {
  const monthly = roundDiv(BigInt(annualPaise), 12n);
  if (terms.stipend)
    return {
      basic: 0,
      hra: 0,
      conveyance: 0,
      lta: 0,
      special: 0,
      stipend: monthly,
      gross: monthly,
      pf: 0,
      gratuity: 0,
      esi: 0,
      overflow: false,
    };
  const basic = rate(monthly, Math.round(terms.basicPctOfCtc * 100));
  const hra = rate(basic, Math.round(terms.hraPctOfBasic * 100));
  const pf =
    terms.pf && !pfOptOut
      ? roundedRupee(
          rate(
            policy.pfWageBasis === "ceiling" ? Math.min(basic, policy.pfCeilingPaise) : basic,
            policy.rates.pfEmployerBps,
          ),
        )
      : 0;
  const gratuity = terms.gratuity ? rate(basic, policy.rates.gratuityBps) : 0;
  let gross = monthly - pf - gratuity;
  const esiApplies =
    terms.esi &&
    roundDiv(BigInt(gross) * 10000n, BigInt(10000 + policy.rates.esiEmployerBps)) <= policy.esiCeilingPaise;
  const esi = esiApplies ? gross - roundDiv(BigInt(gross) * 10000n, BigInt(10000 + policy.rates.esiEmployerBps)) : 0;
  gross -= esi;
  const special = gross - basic - hra - terms.conveyancePaise - terms.ltaPaise;
  return {
    basic,
    hra,
    conveyance: terms.conveyancePaise,
    lta: terms.ltaPaise,
    special: Math.max(0, special),
    stipend: 0,
    gross,
    pf,
    gratuity,
    esi,
    overflow: special < 0,
  };
}

/** All legal thresholds/rates are versioned configuration; arithmetic uses integer paise. */
export function annualTax(
  projectedGross: number,
  regime: "old" | "new",
  policy: PayPolicy,
  declaration: PayDeclaration | null,
  panPresent: boolean,
  basicAnnual = 0,
  hraAnnual = 0,
) {
  const rule = policy.tax[regime];
  const items = z.record(z.string(), z.number().int().nonnegative()).parse(declaration?.items ?? {});
  const declared =
    regime === "old"
      ? policy.declarationSections.reduce(
          (sum, section) =>
            sum +
            Math.min(
              section.limitPaise,
              section.items.reduce((total, item) => total + (items[item.id] ?? 0), 0),
            ),
          0,
        )
      : 0;
  const rent = Number(declaration?.monthlyRentPaise ?? 0n) * 12;
  const hraExemption =
    regime === "old"
      ? Math.max(
          0,
          Math.min(
            hraAnnual,
            rent - rate(basicAnnual, policy.hra.rentBaseBps),
            rate(
              basicAnnual,
              declaration?.rentCity === "metro" ? policy.hra.metroLimitBps : policy.hra.nonMetroLimitBps,
            ),
          ),
        )
      : 0;
  const taxable = Math.max(0, projectedGross - rule.standardDeductionPaise - declared - hraExemption);
  let tax = 0;
  let previous = 0;
  for (const slab of rule.slabs) {
    const upper = slab.upToPaise ?? taxable;
    const portion = Math.max(0, Math.min(taxable, upper) - previous);
    tax += rate(portion, slab.rateBps);
    previous = upper;
    if (taxable <= upper) break;
  }
  if (taxable <= rule.rebateLimitPaise) tax -= Math.min(tax, rule.rebateMaxPaise);
  const cess = rate(tax, policy.rates.cessBps);
  tax += cess;
  if (!panPresent) tax = Math.max(tax, rate(taxable, policy.rates.panMissingBps));
  return {
    taxable,
    tax: roundedRupee(tax),
    gross: projectedGross,
    standardDeduction: rule.standardDeductionPaise,
    declared,
    hraExemption,
    cess,
  };
}

export interface CalculationData {
  policy: PayPolicy;
  employees: PayEmployee[];
  profiles: PayProfile[];
  templates: PayTemplate[];
  compensation: PayCompensation[];
  declarations: PayDeclaration[];
  loans: PayLoan[];
  prior: { employeeId: string; gross: number; tds: number }[];
  attendanceLop?: Record<string, number>;
  encashments?: Record<string, number>;
}
export function calculateRun(
  run: Pick<FullRun, "id" | "month" | "revision" | "publishedAt" | "state" | "inputs" | "holds">,
  data: CalculationData,
): ResultSnapshot[] {
  const { policy } = data;
  const fy = fiscalYear(run.month);
  if (!policy.financialYears.includes(fy.key))
    throw new AppError(409, "TAX_POLICY_MISSING", `Configure tax rules for ${fy.label} before calculation.`);
  const days = Number(monthEnd(run.month).slice(8));
  return data.employees.flatMap((employee) => {
    const joined = toIsoDate(employee.joinedOn);
    const exited = employee.exitedOn ? toIsoDate(employee.exitedOn) : null;
    if (joined > monthEnd(run.month) || (exited && exited < `${run.month}-01`)) return [];
    const employeeStart = joined > `${run.month}-01` ? joined : `${run.month}-01`;
    const employeeEnd = exited && exited < monthEnd(run.month) ? exited : monthEnd(run.month);
    const employmentDays = daysBetween(employeeStart, employeeEnd) + 1;
    const weightedAnnual = Array.from({ length: employmentDays }, (_, index) =>
      currentCtc(data.compensation, employee.id, addDays(employeeStart, index)),
    ).reduce((sum, amount) => sum + amount, 0n);
    const annual = roundDiv(weightedAnnual, BigInt(employmentDays));
    if (!annual) return [];
    const profile = data.profiles.find((row) => row.employeeId === employee.id);
    const mapped = policy.locations[employee.location.name];
    const entityId = profile?.entityId ?? mapped?.entityId ?? "";
    const state = profile?.state ?? mapped?.state ?? "";
    const entity = policy.entities.find((row) => row.id === entityId);
    const terms = templateFor(employee, annual, data.templates, policy);
    const full = structure(annual, terms, policy, profile?.pfOptOut ?? false);
    const inputs: PayInput[] = run.inputs.filter((input) => input.employeeId === employee.id);
    const start = joined > `${run.month}-01` ? joined : `${run.month}-01`;
    const end = exited && exited < monthEnd(run.month) ? exited : monthEnd(run.month);
    const employed = daysBetween(start, end) + 1;
    const lop = Math.min(
      employed,
      (inputs.filter((input) => input.kind === "lop_override").at(-1)?.lopHalves ??
        data.attendanceLop?.[employee.id] ??
        0) / 2,
    );
    const paidHalves = Math.max(0, employed * 2 - lop * 2);
    const prorate = (paise: number) => roundDiv(BigInt(paise) * BigInt(paidHalves), BigInt(days * 2));
    const lines = [
      ["BASIC", "Basic salary", full.basic],
      ["HRA", "House rent allowance", full.hra],
      ["CONVEYANCE", "Conveyance allowance", full.conveyance],
      ["LTA", "Leave travel allowance", full.lta],
      ["SPECIAL", "Special allowance", full.special],
      ["STIPEND", "Stipend", full.stipend],
    ] as const;
    const earnings: { code: string; name: string; amount: ReturnType<typeof inr> }[] = lines
      .filter(([, , amount]) => amount > 0)
      .map(([code, name, amount]) => ({ code, name, amount: inr(prorate(amount)) }));
    for (const input of inputs.filter((row) => ["bonus", "incentive", "arrears"].includes(row.kind)))
      earnings.push({
        code: input.kind.toUpperCase(),
        name: inputLabels[input.kind] ?? input.kind,
        amount: inr(input.amountPaise),
      });
    const encashment = data.encashments?.[employee.id] ?? 0;
    if (encashment) earnings.push({ code: "ENCASHMENT", name: "Leave encashment", amount: inr(encashment) });
    const gross = earnings.reduce((sum, line) => sum + paiseFromAmount(line.amount.amount), 0);
    const pfApplicable = terms.pf && !profile?.pfOptOut;
    const pfWage = pfApplicable
      ? policy.pfWageBasis === "ceiling"
        ? Math.min(prorate(full.basic), policy.pfCeilingPaise)
        : prorate(full.basic)
      : 0;
    const pfEmployee = roundedRupee(rate(pfWage, policy.rates.pfEmployeeBps));
    const pfEmployer = roundedRupee(rate(pfWage, policy.rates.pfEmployerBps));
    const eps = Math.min(pfEmployer, roundedRupee(rate(Math.min(pfWage, policy.pfCeilingPaise), policy.rates.epsBps)));
    const vpf = roundedRupee(rate(pfWage, (profile?.vpfPercent ?? 0) * 100));
    const edliAdmin = roundedRupee(rate(pfWage, policy.rates.edliBps + policy.rates.pfAdminBps));
    const esiCovered = terms.esi && full.gross <= policy.esiCeilingPaise;
    const esiEmployee = esiCovered ? Math.ceil(rate(gross, policy.rates.esiEmployeeBps) / 100) * 100 : 0;
    const esiEmployer = esiCovered ? Math.ceil(rate(gross, policy.rates.esiEmployerBps) / 100) * 100 : 0;
    const slab = policy.ptSlabs[state]?.find(
      (row) => gross >= row.fromPaise && (row.toPaise === null || gross <= row.toPaise),
    );
    const pt = slab ? (run.month.endsWith("-02") ? slab.februaryPaise : slab.monthlyPaise) : 0;
    const lwfRule = policy.lwf[state];
    const lwfApplies = lwfRule && (!lwfRule.months.length || lwfRule.months.includes(Number(run.month.slice(5))));
    const lwfEmployee = lwfApplies
      ? Math.min(
          lwfRule.employeeFixedPaise ?? rate(gross, lwfRule.employeeRateBp ?? 0),
          lwfRule.employeeCapPaise ?? Number.MAX_SAFE_INTEGER,
        )
      : 0;
    const lwfEmployer = lwfApplies
      ? (lwfRule.employerFixedPaise ?? Math.round(lwfEmployee * (lwfRule.employerMultiplier ?? 0)))
      : 0;
    const declaration = data.declarations.find((row) => row.employeeId === employee.id) ?? null;
    const regime = declaration?.regime === "old" ? "old" : "new";
    const prior = data.prior.filter((row) => row.employeeId === employee.id);
    const priorGross = prior.reduce((sum, row) => sum + row.gross, 0);
    const priorTds = prior.reduce((sum, row) => sum + row.tds, 0);
    const remaining = ((3 - Number(run.month.slice(5)) + 12) % 12) + 1;
    const tax = annualTax(
      priorGross + gross + full.gross * (remaining - 1),
      regime,
      policy,
      declaration,
      Boolean(profile?.pan),
      full.basic * 12,
      full.hra * 12,
    );
    const tds = roundedRupee(Math.max(0, roundDiv(BigInt(Math.max(0, tax.tax - priorTds)), BigInt(remaining))));
    const loanRecoveries = data.loans
      .filter(
        (loan) =>
          loan.employeeId === employee.id &&
          ["approved", "active"].includes(loan.state) &&
          loan.startMonth <= run.month,
      )
      .map((loan) => ({
        id: loan.id,
        paise: Math.min(
          Number(loan.principalPaise - loan.recoveredPaise),
          emiOf(loan.principalPaise, loan.tenureMonths),
        ),
      }));
    const deductions = [
      ["PF", "Employee PF", pfEmployee],
      ["VPF", "Voluntary PF", vpf],
      ["ESI", "Employee ESI", esiEmployee],
      ["PT", "Professional tax", pt],
      ["LWF", "Labour welfare fund", lwfEmployee],
      ["TDS", "Tax deducted at source", tds],
      ["LOAN", "Loan recovery", loanRecoveries.reduce((sum, loan) => sum + loan.paise, 0)],
      [
        "OTHER",
        "Other deductions",
        inputs
          .filter((row) => row.kind === "other_deduction")
          .reduce((sum, input) => sum + Number(input.amountPaise), 0),
      ],
    ] as const;
    const deductionLines = deductions
      .filter(([, , amount]) => amount > 0)
      .map(([code, name, amount]) => ({ code, name, amount: inr(amount) }));
    const totalDeductions = deductions.reduce((sum, [, , amount]) => sum + amount, 0);
    const employer = [
      ["EPF", "Employer PF", pfEmployer],
      ["ESI_ER", "Employer ESI", esiEmployer],
      ["LWF_ER", "Employer LWF", lwfEmployer],
      ["GRATUITY", "Gratuity provision", prorate(full.gratuity)],
    ] as const;
    const publishedAt = run.publishedAt?.toISOString() ?? new Date(`${monthEnd(run.month)}T12:00:00Z`).toISOString();
    return [
      {
        person: personRef(employee),
        entityId,
        workState: state,
        bankStatus:
          profile?.bankStatus === "verified" ? "verified" : profile?.bankStatus === "failed" ? "failed" : "pending",
        overflow: full.overflow,
        pfApplicable,
        panPresent: Boolean(profile?.pan),
        loanRecoveries,
        contributions: {
          pfEmployee,
          pfEmployer,
          eps,
          edliAdmin,
          esiEmployee,
          esiEmployer,
          pt,
          lwfEmployee,
          lwfEmployer,
          tds,
        },
        payslip: {
          id: `${run.id}:${employee.id}`,
          periodLabel: monthLabel(run.month),
          periodStart: `${run.month}-01`,
          paymentDate: monthEnd(run.month),
          publishedAt,
          paymentStatus: run.state === "paid" ? "paid" : "published",
          net: inr(gross - totalDeductions),
          employee: {
            name: employee.name,
            code: employee.code,
            designation: employee.designation,
            department: employee.department.name,
            bankAccountMasked: maskAccount(profile?.accountNumber ?? ""),
            panMasked: maskPan(profile?.pan ?? null) ?? "Not provided",
          },
          payableDays: (paidHalves / 2).toFixed(1),
          lopDays: lop.toFixed(1),
          earnings,
          deductions: deductionLines,
          employerContributions: employer
            .filter(([, , value]) => value > 0)
            .map(([code, name, value]) => ({ code, name, amount: inr(value) })),
          gross: inr(gross),
          totalDeductions: inr(totalDeductions),
          artifactVersion: run.revision,
          statutory: {
            entity: entity?.name ?? "Unmapped entity",
            uan: profile?.uan ?? null,
            pfNumber: profile?.pfMemberId ?? null,
            esiNumber: profile?.esiIp ?? null,
            workState: policy.states[state] ?? state,
            ptNote: slab ? null : "No configured PT slab for this wage/state.",
            regime,
            pfWage: inr(pfWage),
          },
          tax: {
            financialYear: fy.label,
            projectedTaxable: inr(tax.taxable),
            annualTax: inr(tax.tax),
            deductedBefore: inr(priorTds),
            thisMonth: inr(tds),
            remainingMonths: remaining,
          },
          held: run.holds.some((hold) => hold.employeeId === employee.id && !hold.releasedAt),
        },
      },
    ];
  });
}
