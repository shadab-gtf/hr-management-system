import type { PayChallan, PrismaClient } from "@prisma/client";
import { idempotent } from "../../core/database/idempotency.js";
import { newId, nextReference } from "../../core/database/ids.js";
import { AppError } from "../../core/errors/AppError.js";
import { assertVersion } from "../../core/http/request-context.js";
import { can, requireCapability, type AuthenticatedActor } from "../../core/security/actor.js";
import { personRef } from "../../core/people/person-ref.js";
import { daysBetween, todayInOrgZone, toIsoDate, fromIsoDate } from "../../utils/date.js";
import { inr, paiseFromAmount } from "../../utils/money.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import type {
  ChallanInput,
  Form16,
  Form16Status,
  Obligation,
  PfSettingsInput,
  PtSlabsInput,
  StatutoryEmployees,
  StatutoryHub,
  StatutoryProfileInput,
  StatutorySetup,
} from "../../contracts/statutory.js";
import { form16Schema } from "../../contracts/statutory.js";
import { createStatutoryRepository } from "./statutory.repository.js";
import {
  addMonths,
  finalStates,
  fiscalYear,
  loadPolicy,
  maskAccount,
  maskPan,
  monthEnd,
  monthLabel,
} from "../payroll/payroll.rules.js";
import { json, snapshotsOf } from "../payroll/payroll.service.js";
import type { PayPolicy, ResultSnapshot } from "../payroll/payroll.schema.js";
import { exportFile, table, col } from "../reports/reports.rules.js";

function dueOn(policy: PayPolicy, type: Obligation["type"], month: string, state: string | null): string | null {
  if (type === "pt" || type === "lwf") {
    const rule = type === "pt" ? policy.ptDue[state ?? ""] : policy.lwf[state ?? ""]?.due;
    if (!rule || rule.kind === "none") return null;
    return rule.kind === "same_month_end"
      ? monthEnd(month)
      : `${addMonths(month, 1)}-${String(rule.day).padStart(2, "0")}`;
  }
  return `${addMonths(month, 1)}-${String(policy.dueDays[type]).padStart(2, "0")}`;
}
function fyOf(value?: string) {
  return fiscalYear(`${value?.slice(0, 4) ?? fiscalYear(todayInOrgZone().slice(0, 7)).start}-04`);
}

/** Allocate recorded TDS deposits proportionally, retaining every paise and never overstating a short payment. */
function depositedByEmployee(source: ResultSnapshot[], challans: PayChallan[]) {
  const deposited = new Map<string, number>();
  const groups = new Map<string, ResultSnapshot[]>();
  for (const row of source) {
    const key = `${row.entityId}|${row.payslip.periodStart.slice(0, 7)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [group, rows] of groups) {
    const [entityId, period] = group.split("|");
    const liability = rows.reduce((sum, row) => sum + row.contributions.tds, 0);
    if (!liability) continue;
    const paid = Math.min(
      liability,
      challans
        .filter((row) => row.type === "tds" && row.entityId === entityId && row.period === period)
        .reduce((sum, row) => sum + Number(row.amountPaise), 0),
    );
    const allocations = rows
      .map((row) => {
        const product = BigInt(row.contributions.tds) * BigInt(paid);
        return {
          key: `${period}|${row.person.id}`,
          paise: Number(product / BigInt(liability)),
          remainder: product % BigInt(liability),
        };
      })
      .sort((a, b) => (a.remainder === b.remainder ? a.key.localeCompare(b.key) : a.remainder > b.remainder ? -1 : 1));
    const remaining = paid - allocations.reduce((sum, row) => sum + row.paise, 0);
    allocations.forEach((row, index) => deposited.set(row.key, row.paise + (index < remaining ? 1 : 0)));
  }
  return (row: ResultSnapshot) => deposited.get(`${row.payslip.periodStart.slice(0, 7)}|${row.person.id}`) ?? 0;
}

export function createStatutoryService(prisma: PrismaClient) {
  const repository = createStatutoryRepository(prisma);
  const service = {
    async setup(actor: AuthenticatedActor): Promise<StatutorySetup> {
      requireCapability(actor, "statutory.manage");
      const [config, employees, audit] = await Promise.all([
        repository.configuration(),
        repository.employees(),
        repository.audit("pay_statutory"),
      ]);
      const policy = loadPolicy(config?.settings);
      const names = new Map(employees.map((row) => [row.id, row.name]));
      return {
        entities: policy.entities.map((entity) => ({
          ...entity,
          locations: Object.entries(policy.locations)
            .filter(([, map]) => map.entityId === entity.id)
            .map(([location]) => location),
          pt: Object.entries(entity.ptRegistrations).map(([state, registration]) => ({ state, registration })),
          lwf: Object.entries(entity.lwfRegistrations).map(([state, registration]) => ({ state, registration })),
        })),
        locations: [...new Set(employees.map((row) => row.location.name))].map((location) => ({
          location,
          entity:
            policy.entities.find((entity) => entity.id === policy.locations[location]?.entityId)?.name ?? "Unmapped",
          state: policy.locations[location]?.state ?? "Employee registered state",
          headcount: employees.filter((row) => row.location.name === location && row.status !== "exited").length,
          mapped: Boolean(policy.locations[location]),
        })),
        pf: { wageBasis: policy.pfWageBasis, ceiling: inr(policy.pfCeilingPaise) },
        esi: { ceiling: inr(policy.esiCeilingPaise) },
        pt: Object.entries(policy.ptSlabs).map(([state, slabs]) => ({
          state,
          stateName: policy.states[state] ?? state,
          due: policy.ptDue[state]?.kind === "none" ? "Not applicable" : "As configured by Finance",
          slabs: slabs.map((slab) => ({
            from: inr(slab.fromPaise),
            to: slab.toPaise === null ? null : inr(slab.toPaise),
            monthly: inr(slab.monthlyPaise),
            february: inr(slab.februaryPaise),
          })),
        })),
        lwf: Object.entries(policy.lwf).map(([state, rule]) => ({
          state,
          stateName: policy.states[state] ?? state,
          schedule: rule.months.length ? rule.months.join(", ") : "Monthly",
          employee:
            rule.employeeFixedPaise === null
              ? `${(rule.employeeRateBp ?? 0) / 100}%`
              : inr(rule.employeeFixedPaise).amount,
          employer:
            rule.employerFixedPaise === null
              ? `${rule.employerMultiplier ?? 0} × employee`
              : inr(rule.employerFixedPaise).amount,
          due: "As configured by Finance",
        })),
        audit: audit.map((row) => ({
          at: row.at.toISOString(),
          actor: names.get(row.actorEmployeeId ?? "") ?? "System",
          event: row.action,
        })),
        settingsVersion: config?.version ?? 1,
        canManage: can(actor, "statutory.manage"),
      };
    },
    async employees(actor: AuthenticatedActor): Promise<StatutoryEmployees> {
      requireCapability(actor, "statutory.manage");
      const [employees, profiles, config] = await Promise.all([
        repository.employees(),
        repository.profiles(),
        repository.configuration(),
      ]);
      const policy = loadPolicy(config?.settings);
      const rows: StatutoryEmployees["rows"] = employees
        .filter((employee) => employee.status !== "exited")
        .map((employee) => {
          const profile = profiles.find((row) => row.employeeId === employee.id);
          const pfStatus =
            employee.employmentType === "intern" ? "not_applicable" : profile?.pfOptOut ? "opted_out" : "member";
          const issues = [
            ...(!profile?.pan ? ["PAN missing"] : []),
            ...(pfStatus === "member" && !profile?.uan ? ["UAN pending"] : []),
            ...(profile?.bankStatus !== "verified" ? ["Bank verification pending"] : []),
          ];
          return {
            employee: personRef(employee),
            code: employee.code,
            location: employee.location.name,
            entity: policy.entities.find((entity) => entity.id === profile?.entityId)?.name ?? "Unmapped",
            state: profile?.state ?? "",
            uan: profile?.uan ?? null,
            pfMemberId: profile?.pfMemberId ?? null,
            esiIp: profile?.esiIp ?? null,
            panMasked: maskPan(profile?.pan ?? null),
            pfStatus,
            vpfPercent: profile?.vpfPercent ?? 0,
            bank: {
              name: profile?.bankName ?? "",
              accountMasked: maskAccount(profile?.accountNumber ?? ""),
              ifsc: profile?.ifsc ?? "",
              status:
                profile?.bankStatus === "verified"
                  ? "verified"
                  : profile?.bankStatus === "failed"
                    ? "failed"
                    : "pending",
              changedAt: profile?.bankChangedAt?.toISOString() ?? null,
            },
            issues,
          };
        });
      return {
        rows,
        counts: {
          total: rows.length,
          uanPending: rows.filter((row) => row.pfStatus === "member" && !row.uan).length,
          panMissing: rows.filter((row) => !row.panMasked).length,
          bankPending: rows.filter((row) => row.bank.status !== "verified").length,
        },
        canEdit: can(actor, "statutory.manage"),
        canVerifyBank: can(actor, "payment.export"),
      };
    },
    async hub(actor: AuthenticatedActor, requested?: string): Promise<StatutoryHub> {
      requireCapability(actor, "statutory.manage");
      const [config, runs, challans, employees] = await Promise.all([
        repository.configuration(),
        repository.runs(),
        repository.challans(),
        repository.employees(),
      ]);
      const policy = loadPolicy(config?.settings);
      const month = requested ?? todayInOrgZone().slice(0, 7);
      const run = runs.find((row) => row.month === month);
      const snapshots = run ? snapshotsOf(run) : [];
      const names = new Map(employees.map((row) => [row.id, row.name]));
      const fy = fiscalYear(month);
      const total = (key: keyof (typeof snapshots)[number]["contributions"]) =>
        snapshots.reduce((sum, row) => sum + row.contributions[key], 0);
      const grouped = new Map<
        string,
        { type: Obligation["type"]; entity: string; state: string | null; paise: number }
      >();
      for (const row of snapshots)
        for (const [type, paise, state] of [
          ["epf", row.contributions.pfEmployee + row.contributions.pfEmployer + row.contributions.edliAdmin, null],
          ["esi", row.contributions.esiEmployee + row.contributions.esiEmployer, null],
          ["pt", row.contributions.pt, row.workState],
          ["lwf", row.contributions.lwfEmployee + row.contributions.lwfEmployer, row.workState],
          ["tds", row.contributions.tds, null],
        ] as const) {
          if (!paise) continue;
          const key = `${type}|${row.entityId}|${state ?? ""}|${month}`;
          const existing = grouped.get(key);
          grouped.set(key, { type, entity: row.entityId, state, paise: paise + (existing?.paise ?? 0) });
        }
      const obligations: Obligation[] = [...grouped.entries()].flatMap(([key, group]) => {
        const due = dueOn(policy, group.type, month, group.state);
        if (!due) return [];
        const challan = challans.find((row) => row.obligationKey === key);
        const paidDate = challan ? toIsoDate(challan.paidOn) : null;
        const status = challan
          ? Number(challan.amountPaise) < group.paise
            ? "short"
            : (paidDate ?? todayInOrgZone()) > due
              ? "late"
              : "on_time"
          : todayInOrgZone() > due
            ? "overdue"
            : "due";
        return [
          {
            key,
            type: group.type,
            typeLabel: group.type.toUpperCase(),
            entity: policy.entities.find((entity) => entity.id === group.entity)?.name ?? group.entity,
            state: group.state,
            period: month,
            periodLabel: monthLabel(month),
            liability: inr(group.paise),
            dueOn: due,
            status,
            daysLate: Math.max(0, daysBetween(due, paidDate ?? todayInOrgZone())),
            challan: challan
              ? {
                  reference: challan.reference,
                  amount: inr(challan.amountPaise),
                  paidOn: toIsoDate(challan.paidOn),
                  challanNo: challan.challanNo,
                  bsrCode: challan.bsrCode,
                  recordedBy: names.get(challan.recordedBy) ?? challan.recordedBy,
                  recordedAt: challan.recordedAt.toISOString(),
                }
              : null,
          },
        ];
      });
      const quarterIndex = Math.floor(((Number(month.slice(5)) + 8) % 12) / 3);
      const quarterStart = addMonths(fy.firstMonth, quarterIndex * 3);
      const tdsMonths = Array.from({ length: 3 }, (_, index) => {
        const m = addMonths(quarterStart, index);
        const source = runs.find((row) => row.month === m);
        const rows = source ? snapshotsOf(source) : [];
        return {
          month: m,
          label: monthLabel(m),
          deductees: rows.filter((row) => row.contributions.tds > 0).length,
          amount: inr(rows.reduce((sum, row) => sum + row.contributions.tds, 0)),
          deposited: inr(
            challans
              .filter((row) => row.type === "tds" && row.period === m)
              .reduce((sum, row) => sum + Number(row.amountPaise), 0),
          ),
          final: Boolean(source && finalStates.includes(source.state)),
        };
      });
      return {
        month,
        periodLabel: monthLabel(month),
        financialYear: fy.label,
        monthOptions: runs.map((row) => ({ value: row.month, label: monthLabel(row.month) })),
        run: run ? { id: run.id, state: run.state, final: finalStates.includes(run.state) } : null,
        totals: {
          epfEmployee: inr(total("pfEmployee")),
          epfEmployer: inr(total("pfEmployer")),
          eps: inr(total("eps")),
          edliAdmin: inr(total("edliAdmin")),
          esi: inr(total("esiEmployee") + total("esiEmployer")),
          pt: inr(total("pt")),
          lwf: inr(total("lwfEmployee") + total("lwfEmployer")),
          tds: inr(total("tds")),
        },
        entities: policy.entities.map((entity) => {
          const rows = snapshots.filter((row) => row.entityId === entity.id);
          return {
            id: entity.id,
            name: entity.name,
            epfCode: entity.epfCode,
            esicCode: entity.esicCode,
            tan: entity.tan,
            pfMembers: rows.filter((row) => row.pfApplicable).length,
            pfTotal: inr(
              rows.reduce(
                (sum, row) =>
                  sum + row.contributions.pfEmployee + row.contributions.pfEmployer + row.contributions.edliAdmin,
                0,
              ),
            ),
            pendingUan: rows.filter((row) => row.pfApplicable && !row.payslip.statutory.uan).length,
            esiMembers: rows.filter((row) => row.contributions.esiEmployee > 0).length,
            esiTotal: inr(
              rows.reduce((sum, row) => sum + row.contributions.esiEmployee + row.contributions.esiEmployer, 0),
            ),
            tdsDeductees: rows.filter((row) => row.contributions.tds > 0).length,
            tdsTotal: inr(rows.reduce((sum, row) => sum + row.contributions.tds, 0)),
          };
        }),
        pt: [...new Set(snapshots.map((row) => `${row.entityId}|${row.workState}`))].map((key) => {
          const [entityId = "", state = ""] = key.split("|");
          const rows = snapshots.filter((row) => row.entityId === entityId && row.workState === state);
          return {
            state,
            stateName: policy.states[state] ?? state,
            entity: policy.entities.find((entity) => entity.id === entityId)?.name ?? entityId,
            registration: policy.entities.find((entity) => entity.id === entityId)?.ptRegistrations[state] ?? null,
            employees: rows.length,
            grossWages: inr(rows.reduce((sum, row) => sum + paiseFromAmount(row.payslip.gross.amount), 0)),
            amount: inr(rows.reduce((sum, row) => sum + row.contributions.pt, 0)),
            dueOn: dueOn(policy, "pt", month, state),
            slabs: [...new Set(rows.map((row) => row.contributions.pt))].map((amount) => ({
              label: inr(amount).amount,
              count: rows.filter((row) => row.contributions.pt === amount).length,
              amount: inr(amount),
            })),
          };
        }),
        lwf: [
          ...new Set(
            snapshots
              .filter((row) => row.contributions.lwfEmployee > 0)
              .map((row) => `${row.entityId}|${row.workState}`),
          ),
        ].map((key) => {
          const [entityId = "", state = ""] = key.split("|");
          const rows = snapshots.filter((row) => row.entityId === entityId && row.workState === state);
          return {
            state,
            stateName: policy.states[state] ?? state,
            entity: policy.entities.find((entity) => entity.id === entityId)?.name ?? entityId,
            registration: policy.entities.find((entity) => entity.id === entityId)?.lwfRegistrations[state] ?? null,
            employees: rows.length,
            employee: inr(rows.reduce((sum, row) => sum + row.contributions.lwfEmployee, 0)),
            employer: inr(rows.reduce((sum, row) => sum + row.contributions.lwfEmployer, 0)),
            dueOn: dueOn(policy, "lwf", month, state),
            schedule: policy.lwf[state]?.months.join(", ") || "Monthly",
          };
        }),
        esiNote: policy.policyLabel,
        tds: {
          quarter: `Q${quarterIndex + 1}`,
          returnDueOn: `${addMonths(quarterStart, 3)}-${String(policy.dueDays.tdsReturn).padStart(2, "0")}`,
          months: tdsMonths,
          total: inr(tdsMonths.reduce((sum, row) => sum + paiseFromAmount(row.amount.amount), 0)),
          deposited: inr(tdsMonths.reduce((sum, row) => sum + paiseFromAmount(row.deposited.amount), 0)),
        },
        obligations,
        openObligations: obligations
          .filter((row) => !row.challan)
          .map((row) => ({
            key: row.key,
            label: `${row.typeLabel} · ${row.entity}`,
            type: row.type,
            liability: row.liability,
          })),
        dueSummary: {
          overdue: obligations.filter((row) => row.status === "overdue").length,
          due: obligations.filter((row) => row.status === "due").length,
          late: obligations.filter((row) => row.status === "late").length,
          onTime: obligations.filter((row) => row.status === "on_time").length,
        },
        canManage: true,
      };
    },
    saveSettings(actor: AuthenticatedActor, input: PfSettingsInput, expected: number | undefined, requestId: string) {
      requireCapability(actor, "statutory.manage");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: "statutory.settings" },
        async (tx) => {
          const repo = createStatutoryRepository(tx);
          await repo.lock("policy");
          const config = await repo.configuration();
          const policy = loadPolicy(config?.settings);
          assertVersion(config?.version ?? 1, expected ?? input.expectedVersion);
          policy.pfWageBasis = input.wageBasis;
          policy.esiCeilingPaise = paiseFromAmount(input.esiCeiling);
          const updated = await repo.saveConfiguration(json(policy));
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "Statutory settings changed",
            entity: "pay_statutory",
            entityId: "settings",
            requestId,
            details: { version: updated.version },
          });
          return { version: updated.version };
        },
      );
    },
    savePt(
      actor: AuthenticatedActor,
      state: string,
      input: PtSlabsInput,
      expected: number | undefined,
      requestId: string,
    ) {
      requireCapability(actor, "statutory.manage");
      return idempotent(prisma, { actorId: actor.employeeId, key: undefined, command: "statutory.pt" }, async (tx) => {
        const repo = createStatutoryRepository(tx);
        await repo.lock("policy");
        const config = await repo.configuration();
        const policy = loadPolicy(config?.settings);
        assertVersion(config?.version ?? 1, expected ?? input.expectedVersion);
        if (!(state in policy.states) || state !== input.state)
          throw new AppError(400, "INVALID_STATE", "Choose a configured state.");
        const rows = input.rows.map((row, index) => {
          if (
            ![row.from, row.monthly, row.february, ...(row.to ? [row.to] : [])].every((value) =>
              /^\d{1,9}(\.\d{1,2})?$/.test(value),
            )
          )
            throw new AppError(400, "INVALID_SLABS", "Enter nonnegative slab amounts.", {
              fieldErrors: { [`rows.${index}`]: "Invalid amount." },
            });
          return {
            fromPaise: paiseFromAmount(row.from),
            toPaise: row.to ? paiseFromAmount(row.to) : null,
            monthlyPaise: paiseFromAmount(row.monthly),
            februaryPaise: paiseFromAmount(row.february),
          };
        });
        for (const [i, row] of rows.entries()) {
          const previous = rows[i - 1];
          if (
            (row.toPaise !== null && row.toPaise < row.fromPaise) ||
            (previous && (previous.toPaise === null || previous.toPaise >= row.fromPaise)) ||
            (i < rows.length - 1 && row.toPaise === null)
          )
            throw new AppError(422, "INVALID_SLABS", "Slabs must be ordered without overlapping bounds.");
        }
        policy.ptSlabs[state] = rows;
        const updated = await repo.saveConfiguration(json(policy));
        await recordAuditEvent(tx, {
          actorEmployeeId: actor.employeeId,
          action: "PT slabs changed",
          entity: "pay_statutory",
          entityId: state,
          requestId,
          details: { version: updated.version },
        });
        return { version: updated.version };
      });
    },
    saveProfile(actor: AuthenticatedActor, employeeId: string, input: StatutoryProfileInput, requestId: string) {
      requireCapability(actor, "statutory.manage");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: "statutory.profile" },
        async (tx) => {
          const repo = createStatutoryRepository(tx);
          if (employeeId !== input.employeeId || Number(input.vpfPercent) > 88)
            throw new AppError(400, "VALIDATION_ERROR", "Check employee and VPF percentage.");
          if (!(await repo.profile(employeeId))) throw new AppError(404, "NOT_FOUND", "Statutory profile not found.");
          await repo.saveProfile(employeeId, {
            uan: input.uan || null,
            esiIp: input.esiIp || null,
            vpfPercent: Number(input.vpfPercent),
            pfOptOut: input.pfOptOut === "yes",
          });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "Statutory profile changed",
            entity: "pay_statutory",
            entityId: employeeId,
            requestId,
            details: {},
          });
          return { employeeId };
        },
      );
    },
    bankDecision(actor: AuthenticatedActor, employeeId: string, decision: "verified" | "failed", requestId: string) {
      requireCapability(actor, "payment.export");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: "statutory.bank" },
        async (tx) => {
          const repo = createStatutoryRepository(tx);
          await repo.lock(`bank:${employeeId}`);
          const profile = await repo.profile(employeeId);
          if (!profile) throw new AppError(404, "NOT_FOUND", "Bank profile not found.");
          if (profile.bankChangedBy === actor.employeeId || employeeId === actor.employeeId)
            throw new AppError(403, "SELF_APPROVAL", "A different approver must verify these bank details.");
          if (!profile.accountNumber || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(profile.ifsc))
            throw new AppError(
              422,
              "BANK_DETAILS_INCOMPLETE",
              "Provide valid account and IFSC details before verification.",
            );
          await repo.saveProfile(employeeId, { bankStatus: decision });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: `Bank ${decision}`,
            entity: "pay_statutory",
            entityId: employeeId,
            requestId,
            details: {},
          });
          return { status: decision };
        },
      );
    },
    async challan(actor: AuthenticatedActor, input: ChallanInput, key: string | undefined, requestId: string) {
      requireCapability(actor, "statutory.manage");
      const period = input.obligationKey.split("|").at(-1);
      if (!period || !/^\d{4}-\d{2}$/.test(period))
        throw new AppError(400, "INVALID_OBLIGATION", "Select a statutory obligation.");
      const hub = await service.hub(actor, period);
      const obligation = hub.obligations.find((row) => row.key === input.obligationKey);
      if (!obligation) throw new AppError(404, "NOT_FOUND", "Statutory obligation not found.");
      if (!hub.run?.final)
        throw new AppError(409, "RUN_NOT_FINAL", "Finalize payroll before recording its statutory payment.");
      if (input.paidOn > todayInOrgZone())
        throw new AppError(422, "FUTURE_PAYMENT", "Payment date cannot be in the future.");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key, command: `statutory.challan:${input.obligationKey}` },
        async (tx) => {
          const repo = createStatutoryRepository(tx);
          await repo.lock(input.obligationKey);
          if ((await repo.challans()).some((row) => row.obligationKey === input.obligationKey))
            throw new AppError(409, "CHALLAN_EXISTS", "This obligation already has a recorded payment.");
          const [, entityId = "", state = ""] = input.obligationKey.split("|");
          const reference = await nextReference(tx, "CH", todayInOrgZone());
          const id = newId("ch");
          await repo.addChallan({
            id,
            reference,
            obligationKey: input.obligationKey,
            type: obligation.type,
            entityId,
            state: state || null,
            period,
            amountPaise: BigInt(paiseFromAmount(input.amount)),
            paidOn: fromIsoDate(input.paidOn),
            challanNo: input.challanNo,
            bsrCode: input.bsrCode || null,
            recordedBy: actor.employeeId,
          });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "Challan recorded",
            entity: "pay_statutory",
            entityId: id,
            requestId,
            details: { reference },
          });
          return {
            reference,
            status:
              paiseFromAmount(input.amount) < paiseFromAmount(obligation.liability.amount)
                ? "short"
                : input.paidOn > obligation.dueOn
                  ? "late"
                  : "on_time",
          };
        },
      );
    },
    async form16(actor: AuthenticatedActor, fyValue?: string, employeeId?: string): Promise<Form16> {
      const target = employeeId ?? actor.employeeId;
      requireCapability(actor, target === actor.employeeId ? "payslip.read.self" : "statutory.manage");
      const fy = fyOf(fyValue);
      const [employee, profile, config, runs, issued, challans] = await Promise.all([
        repository.employee(target),
        repository.profile(target),
        repository.configuration(),
        repository.runs(),
        repository.form16s(fy.key),
        repository.challans(),
      ]);
      if (!employee) throw new AppError(404, "NOT_FOUND", "Employee not found.");
      const found = issued.find((row) => row.employeeId === target);
      if (found) return { ...form16Schema.parse(found.snapshot), viewingOther: target !== actor.employeeId };
      const policy = loadPolicy(config?.settings);
      const entity = policy.entities.find((row) => row.id === profile?.entityId) ?? policy.entities[0];
      if (!entity) throw new AppError(503, "ENTITY_CONFIGURATION_REQUIRED", "Configure the employer legal entity.");
      const source = runs.filter(
        (row) => row.month >= fy.firstMonth && row.month <= fy.lastMonth && ["published", "paid"].includes(row.state),
      );
      const allSnapshots = source.flatMap((row) => snapshotsOf(row));
      const snapshots = allSnapshots.filter((snapshot) => snapshot.person.id === target);
      const depositedFor = depositedByEmployee(allSnapshots, challans);
      const tds = snapshots.reduce((sum, row) => sum + row.contributions.tds, 0);
      const gross = snapshots.reduce((sum, row) => sum + paiseFromAmount(row.payslip.gross.amount), 0);
      const relevant = challans.filter(
        (row) =>
          row.entityId === entity.id && row.type === "tds" && row.period >= fy.firstMonth && row.period <= fy.lastMonth,
      );
      const deposited = snapshots.reduce((sum, row) => sum + depositedFor(row), 0);
      return {
        fy: fy.key,
        fyLabel: fy.label,
        assessmentYear: `${fy.start + 1}-${String(fy.start + 2).slice(-2)}`,
        options: [fy, fyOf(String(fy.start - 1))].map((year) => ({ value: year.key, label: year.label })),
        status: snapshots.length ? "provisional" : "not_employed",
        generatedAt: null,
        certificateNo: `F16-${fy.start}-${employee.code}`,
        employer: { name: entity.name, address: entity.address, pan: entity.pan, tan: entity.tan },
        employee: {
          id: employee.id,
          name: employee.name,
          code: employee.code,
          designation: employee.designation,
          pan: profile?.pan ?? "Not provided",
          periodFrom:
            toIsoDate(employee.joinedOn) > `${fy.firstMonth}-01` ? toIsoDate(employee.joinedOn) : `${fy.firstMonth}-01`,
          periodTo:
            employee.exitedOn && toIsoDate(employee.exitedOn) < monthEnd(fy.lastMonth)
              ? toIsoDate(employee.exitedOn)
              : monthEnd(fy.lastMonth),
          regime: snapshots.at(-1)?.payslip.statutory.regime ?? "new",
        },
        partA: {
          quarters: Array.from({ length: 4 }, (_, index) => {
            const start = addMonths(fy.firstMonth, index * 3);
            const end = addMonths(start, 2);
            const rows = snapshots.filter(
              (row) => row.payslip.periodStart.slice(0, 7) >= start && row.payslip.periodStart.slice(0, 7) <= end,
            );
            const deducted = rows.reduce((sum, row) => sum + row.contributions.tds, 0);
            return {
              quarter: `Q${index + 1}`,
              receipt: null,
              paid: inr(rows.reduce((sum, row) => sum + paiseFromAmount(row.payslip.gross.amount), 0)),
              deducted: inr(deducted),
              deposited: inr(rows.reduce((sum, row) => sum + depositedFor(row), 0)),
            };
          }),
          challans: snapshots.map((row) => {
            const month = row.payslip.periodStart.slice(0, 7);
            const payment = relevant.find((challan) => challan.period === month);
            return {
              month,
              bsrCode: payment?.bsrCode ?? null,
              paidOn: payment ? toIsoDate(payment.paidOn) : null,
              challanNo: payment?.challanNo ?? null,
              amount: inr(row.contributions.tds),
              status: depositedFor(row) >= row.contributions.tds ? "deposited" : "pending",
            };
          }),
          totalDeducted: inr(tds),
          totalDeposited: inr(deposited),
        },
        partB: [
          { ref: "1", label: "Gross salary from published payroll", amount: inr(gross), emphasis: true, indent: false },
          { ref: "2", label: "Tax deducted at source", amount: inr(tds), emphasis: true, indent: false },
        ],
        viewingOther: target !== actor.employeeId,
      };
    },
    async form16Status(actor: AuthenticatedActor, value?: string): Promise<Form16Status> {
      requireCapability(actor, "statutory.manage");
      const fy = fyOf(value);
      const [employees, profiles, records, runs, challans] = await Promise.all([
        repository.employees(),
        repository.profiles(),
        repository.form16s(fy.key),
        repository.runs(),
        repository.challans(),
      ]);
      const source = runs
        .filter(
          (row) => row.month >= fy.firstMonth && row.month <= fy.lastMonth && ["published", "paid"].includes(row.state),
        )
        .flatMap((row) => snapshotsOf(row));
      const closed = todayInOrgZone() > monthEnd(fy.lastMonth);
      const depositedFor = depositedByEmployee(source, challans);
      const rows: Form16Status["rows"] = employees.map((employee) => {
        const results = source.filter((row) => row.person.id === employee.id);
        const tds = results.reduce((sum, row) => sum + row.contributions.tds, 0);
        const pan = Boolean(profiles.find((row) => row.employeeId === employee.id)?.pan);
        const generated = records.some((row) => row.employeeId === employee.id);
        const deposited = results.reduce((sum, row) => sum + depositedFor(row), 0);
        return {
          employee: personRef(employee),
          code: employee.code,
          pan,
          tds: inr(tds),
          deposited: inr(deposited),
          status: generated
            ? "generated"
            : !tds
              ? "no_tds"
              : !pan
                ? "pan_missing"
                : closed && deposited >= tds
                  ? "ready"
                  : "provisional",
        };
      });
      const latest = records[0];
      return {
        fy: fy.key,
        fyLabel: fy.label,
        closed,
        generatedAt: latest?.generatedAt.toISOString() ?? null,
        generatedBy: latest
          ? (employees.find((row) => row.id === latest.generatedBy)?.name ?? latest.generatedBy)
          : null,
        canGenerate:
          closed &&
          rows.some((row) => row.status === "ready") &&
          !rows.some((row) => row.status === "pan_missing" || row.status === "provisional"),
        generateBlockedReason: !closed
          ? "The financial year is still open."
          : rows.some((row) => row.status === "pan_missing")
            ? "Complete missing PAN records."
            : rows.some((row) => row.status === "provisional")
              ? "Record all TDS deposits before generating certificates."
              : null,
        counts: {
          generated: rows.filter((row) => row.status === "generated").length,
          noTds: rows.filter((row) => row.status === "no_tds").length,
          blocked: rows.filter((row) => row.status === "pan_missing" || (closed && row.status === "provisional"))
            .length,
        },
        rows,
      };
    },
    async generateForm16(actor: AuthenticatedActor, value: string, requestId: string) {
      requireCapability(actor, "statutory.manage");
      const status = await service.form16Status(actor, value);
      if (!status.canGenerate)
        throw new AppError(
          409,
          "GENERATION_BLOCKED",
          status.generateBlockedReason ?? "No certificates are ready for generation.",
        );
      const documents = await Promise.all(
        status.rows
          .filter((row) => row.status === "ready")
          .map((row) => service.form16(actor, status.fy, row.employee.id)),
      );
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: `form16.generate:${status.fy}` },
        async (tx) => {
          const repo = createStatutoryRepository(tx);
          await repo.lock(`form16:${status.fy}`);
          for (const document of documents) {
            if (
              paiseFromAmount(document.partA.totalDeposited.amount) <
              paiseFromAmount(document.partA.totalDeducted.amount)
            )
              throw new AppError(409, "TDS_NOT_DEPOSITED", "Record all TDS challans before generating certificates.");
            await repo.saveForm16({
              employeeId: document.employee.id,
              financialYear: status.fy,
              generatedBy: actor.employeeId,
              snapshot: json({ ...document, status: "issued", generatedAt: new Date().toISOString() }),
            });
          }
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "Form 16 snapshots generated",
            entity: "pay_statutory",
            entityId: status.fy,
            requestId,
            details: { count: documents.length },
          });
          return { fy: status.fy };
        },
      );
    },
    async exportRun(actor: AuthenticatedActor, id: string, bank: boolean, requestId: string) {
      requireCapability(actor, bank ? "payment.export" : "payroll.prepare");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: bank ? "bank.export" : "register.export" },
        async (tx) => {
          const repo = createStatutoryRepository(tx);
          await repo.lock(id);
          const run = await repo.run(id);
          if (!run) throw new AppError(404, "NOT_FOUND", "Payroll run not found.");
          if (bank && !finalStates.includes(run.state))
            throw new AppError(409, "RUN_NOT_FINAL", "Finalize payroll before generating a bank file.");
          const profiles = await repo.profiles();
          const rows = snapshotsOf(run)
            .filter(
              (row) =>
                !bank ||
                (!run.holds.some((hold) => hold.employeeId === row.person.id && !hold.releasedAt) &&
                  profiles.find((profile) => profile.employeeId === row.person.id)?.bankStatus === "verified" &&
                  paiseFromAmount(row.payslip.net.amount) > 0),
            )
            .map((row) => {
              const profile = profiles.find((person) => person.employeeId === row.person.id);
              return bank
                ? {
                    code: row.payslip.employee.code,
                    name: row.person.name,
                    account: profile?.accountNumber ?? "",
                    ifsc: profile?.ifsc ?? "",
                    net: row.payslip.net.amount,
                  }
                : {
                    code: row.payslip.employee.code,
                    name: row.person.name,
                    gross: row.payslip.gross.amount,
                    deductions: row.payslip.totalDeductions.amount,
                    net: row.payslip.net.amount,
                  };
            });
          const keys = bank
            ? ["code", "name", "account", "ifsc", "net"]
            : ["code", "name", "gross", "deductions", "net"];
          const file = exportFile(
            table(
              bank ? "Bank advice" : "Payroll register",
              keys.map((key) => col(key, key)),
              rows,
            ),
            "csv",
            `${bank ? "bank-advice" : "payroll-register"}-${run.month}`,
            `Run ${run.id}`,
            todayInOrgZone(),
          );
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: bank ? "Bank advice exported" : "Payroll register exported",
            entity: "payroll_run",
            entityId: id,
            requestId,
            details: {
              count: rows.length,
              amountPaise: rows.reduce((sum, row) => sum + BigInt(paiseFromAmount(row.net)), 0n).toString(),
            },
          });
          return { csv: file.content, ...file };
        },
      );
    },
    async exportStatutory(
      actor: AuthenticatedActor,
      file: string,
      month: string,
      entityId: string | undefined,
      requestId: string,
    ) {
      requireCapability(actor, "statutory.manage");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: `statutory.export:${file}:${month}` },
        async (tx) => {
          const repo = createStatutoryRepository(tx);
          const run = await repo.runByMonth(month);
          if (!run) throw new AppError(404, "NOT_FOUND", "Payroll month not found.");
          if (!finalStates.includes(run.state))
            throw new AppError(409, "RUN_NOT_FINAL", "Finalize payroll before statutory exports.");
          const rows = snapshotsOf(run)
            .filter((row) => !entityId || row.entityId === entityId)
            .map((row) => ({
              code: row.payslip.employee.code,
              name: row.person.name,
              uan: row.payslip.statutory.uan,
              esi: row.payslip.statutory.esiNumber,
              state: row.workState,
              gross: row.payslip.gross.amount,
              employee: inr(
                file === "ecr"
                  ? row.contributions.pfEmployee
                  : file === "esi"
                    ? row.contributions.esiEmployee
                    : file === "pt"
                      ? row.contributions.pt
                      : file === "lwf"
                        ? row.contributions.lwfEmployee
                        : row.contributions.tds,
              ).amount,
              employer: inr(
                file === "ecr"
                  ? row.contributions.pfEmployer
                  : file === "esi"
                    ? row.contributions.esiEmployer
                    : file === "lwf"
                      ? row.contributions.lwfEmployer
                      : 0,
              ).amount,
            }));
          const artifact = exportFile(
            table(
              `${file.toUpperCase()} working statement`,
              ["code", "name", "uan", "esi", "state", "gross", "employee", "employer"].map((key) => col(key, key)),
              rows,
            ),
            "csv",
            `${file}-${month}`,
            "Reconcile with the statutory portal's current filing format before submission.",
            todayInOrgZone(),
          );
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "Statutory statement exported",
            entity: "pay_statutory",
            entityId: run.id,
            requestId,
            details: { file, count: rows.length },
          });
          return { fileName: artifact.fileName, body: artifact.content, contentType: artifact.contentType };
        },
      );
    },
  };
  return service;
}
export type StatutoryService = ReturnType<typeof createStatutoryService>;
