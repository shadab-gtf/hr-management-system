import type { PrismaClient } from "@prisma/client";
import { idempotent } from "../../core/database/idempotency.js";
import { newId, nextReference } from "../../core/database/ids.js";
import { AppError } from "../../core/errors/AppError.js";
import { assertVersion } from "../../core/http/request-context.js";
import { requireCapability, type AuthenticatedActor } from "../../core/security/actor.js";
import { inr, paiseFromAmount } from "../../utils/money.js";
import { todayInOrgZone, toIsoDate } from "../../utils/date.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import type {
  Compensation,
  DeclarationInput,
  Loan,
  LoanInput,
  TaxDeclaration,
  TaxStatement,
  Ytd,
} from "../../contracts/salary.js";
import { createSalaryRepository } from "./salary.repository.js";
import {
  addMonths,
  annualTax,
  currentCtc,
  emiOf,
  fiscalYear,
  loadPolicy,
  monthLabel,
  structure,
  templateFor,
} from "../payroll/payroll.rules.js";
import { resultSnapshotSchema } from "../payroll/payroll.schema.js";
import { json, loadCalculationData } from "../payroll/payroll.service.js";

export function createSalaryService(prisma: PrismaClient) {
  const repository = createSalaryRepository(prisma);
  return {
    async compensation(actor: AuthenticatedActor): Promise<Compensation> {
      requireCapability(actor, "payslip.read.self");
      const data = await loadCalculationData(repository, todayInOrgZone().slice(0, 7));
      const employee = data.employees.find((row) => row.id === actor.employeeId);
      if (!employee) throw new AppError(404, "NOT_FOUND", "Employee not found.");
      const annual = Number(currentCtc(data.compensation, actor.employeeId, todayInOrgZone()));
      if (!annual) return { annualCtc: inr(0), monthlyGross: inr(0), components: [], revisions: [] };
      const full = structure(
        annual,
        templateFor(employee, annual, data.templates, data.policy),
        data.policy,
        data.profiles.find((row) => row.employeeId === actor.employeeId)?.pfOptOut,
      );
      const parts: [string, number][] = [
        ["Basic salary", full.basic],
        ["House rent allowance", full.hra],
        ["Conveyance allowance", full.conveyance],
        ["Leave travel allowance", full.lta],
        ["Special allowance", full.special],
        ["Stipend", full.stipend],
        ["Employer PF", full.pf],
        ["Employer ESI", full.esi],
        ["Gratuity provision", full.gratuity],
      ];
      return {
        annualCtc: inr(annual),
        monthlyGross: inr(full.gross),
        components: parts
          .filter(([, amount]) => amount > 0)
          .map(([name, amount]) => ({ name, monthly: inr(amount), annual: inr(amount * 12) })),
        revisions: data.compensation
          .filter(
            (row) =>
              row.employeeId === actor.employeeId &&
              row.previousPaise > 0n &&
              toIsoDate(row.effectiveFrom) <= todayInOrgZone(),
          )
          .reverse()
          .map((row) => ({
            id: row.id,
            effectiveFrom: toIsoDate(row.effectiveFrom),
            previousCtc: inr(row.previousPaise),
            newCtc: inr(row.annualPaise),
            changePercent: ((Number(row.annualPaise - row.previousPaise) / Number(row.previousPaise)) * 100).toFixed(1),
            reason: row.reason,
            letterReference: row.reference,
          })),
      };
    },
    async ytd(actor: AuthenticatedActor): Promise<Ytd> {
      requireCapability(actor, "payslip.read.self");
      const fy = fiscalYear(todayInOrgZone().slice(0, 7));
      const results = (await repository.ownResults(actor.employeeId))
        .filter((row) => row.run.month >= fy.firstMonth && row.run.month <= fy.lastMonth)
        .reverse()
        .map((row) => resultSnapshotSchema.parse(row.snapshot));
      const rows = new Map<
        string,
        { code: string; name: string; kind: "earning" | "deduction"; amounts: (ReturnType<typeof inr> | null)[] }
      >();
      results.forEach((result, index) => {
        for (const [kind, lines] of [
          ["earning", result.payslip.earnings],
          ["deduction", result.payslip.deductions],
        ] as const)
          for (const line of lines) {
            const key = `${kind}:${line.code}`;
            const row = rows.get(key) ?? { code: line.code, name: line.name, kind, amounts: results.map(() => null) };
            row.amounts[index] = line.amount;
            rows.set(key, row);
          }
      });
      const gross = results.reduce((sum, row) => sum + paiseFromAmount(row.payslip.gross.amount), 0);
      const deductions = results.reduce((sum, row) => sum + paiseFromAmount(row.payslip.totalDeductions.amount), 0);
      return {
        financialYear: fy.label,
        months: results.map((row) => row.payslip.periodLabel),
        rows: [...rows.values()].map((row) => ({
          ...row,
          total: inr(row.amounts.reduce((sum, amount) => sum + (amount ? paiseFromAmount(amount.amount) : 0), 0)),
        })),
        gross: inr(gross),
        deductions: inr(deductions),
        net: inr(gross - deductions),
      };
    },
    async declaration(actor: AuthenticatedActor): Promise<TaxDeclaration> {
      requireCapability(actor, "tax.declare.self");
      const fy = fiscalYear(todayInOrgZone().slice(0, 7));
      const [config, declaration] = await Promise.all([
        repository.configuration(),
        repository.declaration(actor.employeeId, fy.key),
      ]);
      const policy = loadPolicy(config?.settings);
      const window = policy.declarationWindow;
      const today = todayInOrgZone();
      const items = (declaration?.items ?? {}) as Record<string, number>;
      return {
        financialYear: fy.label,
        regime: declaration?.regime === "old" ? "old" : "new",
        status: declaration?.state === "locked" ? "locked" : declaration?.state === "submitted" ? "submitted" : "draft",
        window: {
          opensOn: window.opensOn,
          closesOn: window.closesOn,
          open: today >= window.opensOn && today <= window.closesOn,
        },
        proofWindow: {
          opensOn: window.proofOpensOn,
          closesOn: window.proofClosesOn,
          open: today >= window.proofOpensOn && today <= window.proofClosesOn,
        },
        submittedAt: declaration?.submittedAt?.toISOString() ?? null,
        monthlyRent: inr(declaration?.monthlyRentPaise ?? 0n),
        rentCity: declaration?.rentCity === "non_metro" ? "non_metro" : "metro",
        sections: policy.declarationSections.map((section) => ({
          code: section.code,
          name: section.name,
          limit: inr(section.limitPaise),
          oldRegimeOnly: section.oldRegimeOnly,
          items: section.items.map((item) => ({
            ...item,
            declared: inr(items[item.id] ?? 0),
            proof: items[item.id] ? "pending" : "not_required",
          })),
        })),
      };
    },
    saveDeclaration(actor: AuthenticatedActor, input: DeclarationInput, requestId: string) {
      requireCapability(actor, "tax.declare.self");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: "tax.declaration" },
        async (tx) => {
          const repo = createSalaryRepository(tx);
          await repo.lock(`declaration:${actor.employeeId}`);
          const today = todayInOrgZone();
          const fy = fiscalYear(today.slice(0, 7));
          const policy = loadPolicy((await repo.configuration())?.settings);
          const existing = await repo.declaration(actor.employeeId, fy.key);
          if (
            today < policy.declarationWindow.opensOn ||
            today > policy.declarationWindow.closesOn ||
            existing?.state === "locked"
          )
            throw new AppError(409, "WINDOW_CLOSED", "The declaration window is closed.");
          const allowed = new Set(
            policy.declarationSections.flatMap((section) => section.items.map((item) => item.id)),
          );
          if (Object.keys(input.items).some((id) => !allowed.has(id)))
            throw new AppError(400, "UNKNOWN_ITEM", "An unknown declaration item was supplied.");
          const items = Object.fromEntries(
            Object.entries(input.items).map(([id, amount]) => [id, paiseFromAmount(amount || "0")]),
          );
          for (const section of policy.declarationSections)
            if (
              input.regime === "old" &&
              section.items.reduce((sum, item) => sum + (items[item.id] ?? 0), 0) > section.limitPaise
            )
              throw new AppError(422, "LIMIT_EXCEEDED", "Some sections exceed their configured limits.", {
                fieldErrors: { [section.code]: "Section limit exceeded." },
              });
          const status = input.submit ? "submitted" : "draft";
          await repo.saveDeclaration(actor.employeeId, fy.key, {
            regime: input.regime,
            state: status,
            submittedAt: input.submit ? new Date() : null,
            items: input.regime === "new" ? {} : items,
            monthlyRentPaise: input.regime === "new" ? 0n : BigInt(paiseFromAmount(input.monthlyRent)),
            rentCity: input.rentCity,
          });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "Tax declaration saved",
            entity: "pay_declaration",
            entityId: `${actor.employeeId}:${fy.key}`,
            requestId,
            details: { status },
          });
          return { status };
        },
      );
    },
    async taxStatement(actor: AuthenticatedActor): Promise<TaxStatement> {
      requireCapability(actor, "payslip.read.self");
      const month = todayInOrgZone().slice(0, 7);
      const data = await loadCalculationData(repository, month);
      const employee = data.employees.find((row) => row.id === actor.employeeId);
      if (!employee) throw new AppError(404, "NOT_FOUND", "Employee not found.");
      const annual = Number(currentCtc(data.compensation, actor.employeeId, todayInOrgZone()));
      const full = annual
        ? structure(annual, templateFor(employee, annual, data.templates, data.policy), data.policy)
        : { gross: 0, basic: 0, hra: 0 };
      const declaration = data.declarations.find((row) => row.employeeId === actor.employeeId) ?? null;
      const regime = declaration?.regime === "old" ? "old" : "new";
      const tax = annualTax(
        full.gross * 12,
        regime,
        data.policy,
        declaration,
        Boolean(data.profiles.find((row) => row.employeeId === actor.employeeId)?.pan),
        full.basic * 12,
        full.hra * 12,
      );
      const fy = fiscalYear(month);
      const actual = (await repository.ownResults(actor.employeeId)).filter(
        (row) => row.run.month >= fy.firstMonth && row.run.month <= fy.lastMonth,
      );
      const deducted = actual.reduce((sum, row) => sum + resultSnapshotSchema.parse(row.snapshot).contributions.tds, 0);
      const remaining = Math.max(1, 12 - actual.length);
      const projected = Math.max(0, Math.round((tax.tax - deducted) / remaining));
      return {
        financialYear: fy.label,
        regime,
        lines: [
          { label: "Projected gross salary", amount: inr(tax.gross), emphasis: true },
          { label: "Configured standard deduction", amount: inr(-tax.standardDeduction), emphasis: false },
          { label: "Declared deductions", amount: inr(-tax.declared), emphasis: false },
          { label: "Taxable income", amount: inr(tax.taxable), emphasis: true },
          { label: "Annual tax", amount: inr(tax.tax), emphasis: true },
        ],
        taxPayable: inr(tax.tax),
        taxDeducted: inr(deducted),
        balance: inr(Math.max(0, tax.tax - deducted)),
        monthlyTds: Array.from({ length: 12 }, (_, index) => {
          const m = addMonths(fy.firstMonth, index);
          const row = actual.find((item) => item.run.month === m);
          return {
            month: monthLabel(m),
            amount: inr(row ? resultSnapshotSchema.parse(row.snapshot).contributions.tds : projected),
            projected: !row,
          };
        }),
        disclaimer: `Based on configured policy: ${data.policy.policyLabel}. Published deductions are taken from immutable payroll records.`,
      };
    },
    async loans(actor: AuthenticatedActor): Promise<Loan[]> {
      requireCapability(actor, "loan.request.self");
      return (await repository.loans(actor.employeeId)).map((row) => ({
        id: row.id,
        reference: row.reference,
        type: row.type as Loan["type"],
        principal: inr(row.principalPaise),
        outstanding: inr(row.principalPaise - row.recoveredPaise),
        emi: inr(emiOf(row.principalPaise, row.tenureMonths)),
        tenureMonths: row.tenureMonths,
        paidInstallments: row.paidInstallments,
        startMonth: row.startMonth,
        state: row.state as Loan["state"],
        requestedAt: row.requestedAt.toISOString(),
      }));
    },
    requestLoan(actor: AuthenticatedActor, input: LoanInput, key: string | undefined, requestId: string) {
      requireCapability(actor, "loan.request.self");
      return idempotent(prisma, { actorId: actor.employeeId, key, command: "loan.request" }, async (tx) => {
        const repo = createSalaryRepository(tx);
        await repo.lock(`loan:${actor.employeeId}`);
        const principal = paiseFromAmount(input.amount);
        if (principal <= 0 || principal > 50000000)
          throw new AppError(422, "LIMIT_EXCEEDED", "Loan requests must be between ₹1 and ₹5,00,000.", {
            fieldErrors: { amount: "Enter an amount within the limit." },
          });
        const compensation = await repo.compensations(actor.employeeId);
        const annual = Number(currentCtc(compensation, actor.employeeId, todayInOrgZone()));
        if (input.type === "salary_advance" && principal > annual / 12)
          throw new AppError(422, "LIMIT_EXCEEDED", "A salary advance cannot exceed one month's compensation.");
        if ((await repo.loans(actor.employeeId)).some((row) => row.state === "requested"))
          throw new AppError(409, "REQUEST_PENDING", "You already have a request awaiting Finance.");
        const reference = await nextReference(tx, "LN", todayInOrgZone());
        const id = newId("ln");
        await repo.addLoan({
          id,
          reference,
          employeeId: actor.employeeId,
          type: input.type,
          principalPaise: BigInt(principal),
          tenureMonths: input.tenureMonths,
          startMonth: addMonths(todayInOrgZone().slice(0, 7), 1),
          reason: input.reason,
        });
        await recordAuditEvent(tx, {
          actorEmployeeId: actor.employeeId,
          action: "Loan requested",
          entity: "pay_loan",
          entityId: id,
          requestId,
          details: { reference },
        });
        return { reference };
      });
    },
    decideLoan(
      actor: AuthenticatedActor,
      id: string,
      decision: "approve" | "reject",
      note: string,
      expected: number | undefined,
      key: string | undefined,
      requestId: string,
    ) {
      requireCapability(actor, "loan.approve");
      return idempotent(prisma, { actorId: actor.employeeId, key, command: `loan.${decision}:${id}` }, async (tx) => {
        const repo = createSalaryRepository(tx);
        await repo.lock(`loan:${id}`);
        const loan = await repo.loan(id);
        if (!loan) throw new AppError(404, "NOT_FOUND", "Loan request not found.");
        assertVersion(loan.version, expected);
        if (loan.employeeId === actor.employeeId)
          throw new AppError(403, "SELF_APPROVAL", "You cannot approve your own loan.");
        if (loan.state !== "requested")
          throw new AppError(409, "INVALID_STATE", "This loan request was already decided.");
        const state = decision === "approve" ? "approved" : "rejected";
        await repo.updateLoan(id, { state, decidedBy: actor.employeeId, decidedAt: new Date(), decisionNote: note });
        await recordAuditEvent(tx, {
          actorEmployeeId: actor.employeeId,
          action: `Loan ${state}`,
          entity: "pay_loan",
          entityId: id,
          requestId,
          details: json({ note }),
        });
        return { state };
      });
    },
  };
}
export type SalaryService = ReturnType<typeof createSalaryService>;
