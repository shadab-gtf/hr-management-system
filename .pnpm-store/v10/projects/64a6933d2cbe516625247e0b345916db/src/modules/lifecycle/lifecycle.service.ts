import { requireValue } from "../talent/talent.schema.js";
import { can } from "../../core/security/actor.js";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import * as l from "../../contracts/lifecycle.js";
import {
  checklistTaskInputSchema,
  checklistTaskSchema,
  employeeExitInputSchema,
  serviceDecisionInputSchema,
} from "../../contracts/hr-config.js";
import { onboardingCaseSchema } from "../../contracts/admin.js";
import { letterInputSchema } from "../../contracts/requests.js";
import { personRef } from "../../core/people/person-ref.js";
import { assertVersion } from "../../core/http/request-context.js";
import { newId } from "../../core/database/ids.js";
import { inr, paiseFromAmount } from "../../utils/money.js";
import { todayInOrgZone } from "../../utils/date.js";
import { loadCalculationData } from "../payroll/payroll.service.js";
import { calculateRun, currentCtc, structure, templateFor, digest } from "../payroll/payroll.rules.js";
import { leaveBalance, policyTypes } from "../time/time.service.js";
import type { TalentCall } from "../talent/talent.controller.js";
import type { TalentRepository } from "../talent/talent.repository.js";
import { actorOf, ensure, idOf, now, own, addDays, daysBetween } from "../talent/talent.schema.js";
import { lifecycleRepository } from "./lifecycle.repository.js";
import * as s from "./lifecycle.schema.js";
const pendingResignation = (r: l.Resignation) =>
  ["pending_manager", "pending_hr", "on_hold", "accepted"].includes(r.state);
const changeable = (s: l.SettlementDetail) => ["draft", "rejected"].includes(s.state);
const event = (actor: string, event: string, note: string | null = null) => ({
  id: newId("event"),
  at: now(),
  actor,
  event,
  note,
});
const placeholders = [
  "name",
  "code",
  "designation",
  "department",
  "location",
  "manager",
  "joinedOn",
  "lastWorkingDay",
  "today",
  "reference",
  "company",
  "legalEntity",
  "signatory",
  "signatoryTitle",
  "purpose",
  "addressedTo",
];
const moneyTotal = (lines: l.SettlementLine[], kind: "earning" | "deduction") =>
  lines.filter((l) => l.kind === kind).reduce((n, l) => n + paiseFromAmount(l.amount.amount), 0);
export function createLifecycleService(prisma: PrismaClient) {
  const unit = lifecycleRepository(prisma);
  async function checklist(repo: TalentRepository, list: string) {
    return repo.list(`checklist_${list}`, checklistTaskSchema);
  }
  async function onboarding(repo: TalentRepository) {
    const [people, templates, saved] = await Promise.all([
      repo.people(),
      checklist(repo, "onboarding"),
      repo.list("onboarding", onboardingCaseSchema),
    ]);
    return people
      .filter((e) => e.status === "onboarding")
      .map((e) => {
        const previous = saved.find((c) => c.person.id === e.id);
        return {
          id: previous?.id ?? `onboard_${e.id}`,
          person: personRef(e),
          department: e.department.name,
          joinedOn: e.joinedOn.toISOString().slice(0, 10),
          manager: e.manager ? personRef(e.manager) : null,
          tasks: templates.map((t) => ({
            id: t.id,
            title: t.title,
            owner: t.owner,
            done: previous?.tasks.find((p) => p.id === t.id)?.done ?? false,
            due: addDays(e.joinedOn.toISOString().slice(0, 10), t.offsetDays),
            blocking: t.blocking,
          })),
        };
      });
  }
  async function exits(repo: TalentRepository) {
    const [people, templates, saved, assets, settlements, letters] = await Promise.all([
      repo.people(),
      checklist(repo, "offboarding"),
      repo.list("offboarding", l.offboardingDetailSchema),
      repo.list("asset", l.assetDetailSchema),
      repo.list("settlement", s.settlementRecord),
      repo.list("letter", l.issuedLetterSchema),
    ]);
    return people
      .filter((e) => e.status === "notice" || e.status === "exited")
      .map((e) => {
        const previous = saved.find((c) => c.person.id === e.id);
        const day = previous?.lastWorkingDay ?? e.exitedOn?.toISOString().slice(0, 10) ?? todayInOrgZone();
        const assigned = assets.filter((a) => a.assignee?.id === e.id);
        const settlement = settlements.find((s) => s.person.id === e.id);
        const clearances =
          previous?.clearances ??
          l.clearanceDepartmentSchema.options.map((department) => ({
            department,
            label: department.toUpperCase(),
            scope: `${department} exit clearance`,
            status: "pending" as const,
            note: null,
            clearedBy: null,
            clearedAt: null,
            blockers: [],
          }));
        const tasks = templates.map((t) => ({
          id: t.id,
          title: t.title,
          owner: t.owner,
          done: previous?.tasks.find((p) => p.id === t.id)?.done ?? false,
          due: addDays(day, -t.offsetDays),
          blocking: t.blocking,
        }));
        const blockers = [
          ...tasks.filter((t) => t.blocking && !t.done).map((t) => t.title),
          ...clearances.filter((c) => c.status !== "cleared").map((c) => `${c.label} clearance`),
          ...(assigned.length ? ["Return all assigned assets"] : []),
          ...(!previous?.interview ? ["Record the exit interview"] : []),
          ...(!settlement || !["approved", "paid"].includes(settlement.state) ? ["Approve the final settlement"] : []),
        ];
        return l.offboardingDetailSchema.parse({
          id: previous?.id ?? `exit_${e.id}`,
          person: personRef(e),
          department: e.department.name,
          lastWorkingDay: day,
          reason: previous?.reason ?? "other",
          status: e.status,
          accessRevoked: e.status === "exited",
          tasks,
          reasonNote: previous?.reasonNote ?? "",
          startedAt: previous?.startedAt ?? e.updatedAt.toISOString(),
          noticeShortfallDays: previous?.noticeShortfallDays ?? 0,
          resignationReference: previous?.resignationReference ?? null,
          clearances,
          assets: assigned,
          interview: previous?.interview ?? null,
          settlement: settlement
            ? { id: settlement.id, reference: settlement.reference, state: settlement.state, net: settlement.net }
            : null,
          letters: letters
            .filter((l) => l.person.id === e.id)
            .map((l) => ({ id: l.id, title: l.title, href: l.href, issuedAt: l.issuedAt })),
          completeBlockers: blockers,
        });
      });
  }
  async function resignationView(repo: TalentRepository, call: TalentCall) {
    const actor = actorOf(call);
    const me = await repo.person(actor.employeeId);
    const records = await repo.list("resignation", l.resignationSchema);
    const people = await repo.people();
    const mapped = records.map((r) => ({
      ...r,
      permissions: {
        canWithdraw: r.person.id === me.id && ["pending_manager", "pending_hr", "on_hold"].includes(r.state),
        canDecideAsManager:
          r.person.id !== me.id &&
          people.find((e) => e.id === r.person.id)?.managerId === me.id &&
          r.state === "pending_manager",
        canDecideAsHr:
          can(actor, "onboarding.manage") && r.person.id !== me.id && ["pending_hr", "on_hold"].includes(r.state),
      },
    }));
    const mine = mapped.filter((r) => r.person.id === me.id);
    const current = mine.find(pendingResignation) ?? null;
    const policy = z
      .object({
        full_time: z.number().int().min(1).max(365),
        contract: z.number().int().min(1).max(365),
        intern: z.number().int().min(1).max(365),
      })
      .safeParse(await repo.setting("notice_days"));
    ensure(
      policy.success,
      "NOTICE_POLICY_REQUIRED",
      "Configure employment notice periods before submitting resignations.",
    );
    const noticeDays = policy.data[me.employmentType];
    const exit = (await exits(repo)).find((e) => e.person.id === me.id);
    const settlement = exit ? (await repo.list("settlement", s.settlementRecord, { ownerId: me.id }))[0] : null;
    return l.resignationViewSchema.parse({
      today: todayInOrgZone(),
      policy: {
        noticeDays,
        basis: "Configured employment notice policy",
        defaultLastWorkingDay: addDays(todayInOrgZone(), noticeDays),
      },
      current,
      past: mine.filter((r) => !pendingResignation(r)),
      exit: exit
        ? {
            lastWorkingDay: exit.lastWorkingDay,
            status: exit.status,
            clearances: exit.clearances,
            assetsToReturn: exit.assets.length,
            settlement: settlement
              ? {
                  reference: settlement.reference,
                  state: settlement.state,
                  net: ["approved", "paid"].includes(settlement.state) ? settlement.net : null,
                  paidAt: settlement.paidAt,
                }
              : null,
            letters: exit.letters,
          }
        : null,
      team: mapped.filter(
        (r) => people.find((e) => e.id === r.person.id)?.managerId === me.id && r.person.id !== me.id,
      ),
      canResign: me.status !== "notice" && me.status !== "exited" && !current,
      blockedReason: current
        ? "You already have an active resignation."
        : ["notice", "exited"].includes(me.status)
          ? "Your exit is already in progress."
          : null,
    });
  }
  async function renderLetter(
    repo: TalentRepository,
    template: l.LetterTemplate,
    employeeId: string,
    call: TalentCall,
    purpose: string,
    addressedTo: string,
    reference: string,
  ) {
    const employee = await repo.person(employeeId);
    const signer = await repo.person(actorOf(call).employeeId);
    const organization = await repo.organization();
    const values: Record<string, string> = {
      name: employee.name,
      code: employee.code,
      designation: employee.designation,
      department: employee.department.name,
      location: employee.location.name,
      manager: employee.manager?.name ?? "",
      joinedOn: employee.joinedOn.toISOString().slice(0, 10),
      lastWorkingDay: employee.exitedOn?.toISOString().slice(0, 10) ?? "",
      today: todayInOrgZone(),
      reference,
      company: organization?.name ?? "",
      legalEntity: organization?.legalEntity ?? "",
      signatory: signer.name,
      signatoryTitle: signer.designation,
      purpose,
      addressedTo,
    };
    const missing = new Set<string>();
    const replace = (value: string) =>
      value.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_match: string, key: string) => {
        if (!values[key]) {
          missing.add(key);
          return `{{${key}}}`;
        }
        return values[key];
      });
    return {
      templateId: template.id,
      employeeId,
      subject: replace(template.subject),
      body: replace(template.body),
      missing: [...missing],
    };
  }
  async function automaticSettlement(repo: TalentRepository, value: s.SettlementRecord) {
    const rules = s.settlementPolicySchema.safeParse(await repo.setting("settlement_policy"));
    ensure(rules.success, "SETTLEMENT_POLICY_REQUIRED", "Configure settlement calculation policy before preparation.");
    const month = value.lastWorkingDay.slice(0, 7);
    const data = await loadCalculationData(repo.payroll(), month);
    const employee = data.employees.find((e) => e.id === value.person.id);
    ensure(employee, "EMPLOYEE_NOT_FOUND", "Employee was not found.");
    const annual = Number(currentCtc(data.compensation, employee.id, value.lastWorkingDay));
    ensure(annual > 0, "COMPENSATION_REQUIRED", "Configure compensation before preparing settlement.");
    const full = structure(
      annual,
      templateFor(employee, annual, data.templates, data.policy),
      data.policy,
      data.profiles.find((p) => p.employeeId === employee.id)?.pfOptOut ?? false,
    );
    const existing = (await repo.payroll().ownResults(employee.id)).some((r) => r.run.month === month);
    const calculated = calculateRun(
      { id: value.id, month, revision: value.version, publishedAt: null, state: "draft", inputs: [], holds: [] },
      { ...data, employees: [{ ...employee, exitedOn: new Date(value.lastWorkingDay) }] },
    )[0];
    ensure(calculated, "NO_PAYROLL_RESULT", "No payroll calculation is available for this employee.");
    const lines: l.SettlementLine[] = [];
    const add = (code: string, kind: "earning" | "deduction", label: string, amount: number, detail: string) => {
      if (amount > 0)
        lines.push({
          id: `${value.id}_${code}`,
          code,
          kind,
          label,
          detail,
          amount: inr(amount),
          manual: false,
          reason: null,
        });
    };
    if (!existing) {
      for (const row of calculated.payslip.earnings)
        add(row.code, "earning", row.name, paiseFromAmount(row.amount.amount), `Final payroll for ${month}`);
      for (const row of calculated.payslip.deductions.filter((d) => d.code !== "LOAN"))
        add(
          row.code,
          "deduction",
          row.name,
          paiseFromAmount(row.amount.amount),
          `Configured payroll deductions for ${month}`,
        );
    }
    for (const loan of data.loans.filter(
      (l) => l.employeeId === employee.id && ["active", "approved"].includes(l.state),
    ))
      add(
        `LOAN_${loan.id}`,
        "deduction",
        "Outstanding loan",
        Number(loan.principalPaise - loan.recoveredPaise),
        loan.reference,
      );
    if (!value.noticeWaived)
      add(
        "NOTICE",
        "deduction",
        "Notice shortfall recovery",
        Math.round((full.gross * value.noticeShortfallDays) / rules.data.noticeDivisor),
        `${value.noticeShortfallDays} days at monthly gross / ${rules.data.noticeDivisor}`,
      );
    const leaveTypes = (await policyTypes(repo.time())).filter(
      (t) => t.active && t.encashable && t.employmentTypes.includes(employee.employmentType),
    );
    const leaveRecoveries: { leaveTypeId: string; days: string }[] = [];
    for (const type of leaveTypes) {
      const balance = await leaveBalance(repo.time(), employee.id, type.id, value.lastWorkingDay);
      const days = Math.max(
        0,
        Math.min(Number(type.maxEncashDays), Number(balance.available) - Number(type.minRetainDays)),
      );
      const basis = rules.data.leaveBasis === "basic" ? full.basic : full.gross;
      if (days > 0 && basis > 0) leaveRecoveries.push({ leaveTypeId: type.id, days: days.toFixed(2) });
      add(
        `LEAVE_${type.id}`,
        "earning",
        `${type.name} encashment`,
        Math.round((basis * days) / rules.data.leaveDivisor),
        `${days.toFixed(2)} days × configured ${rules.data.leaveBasis} / ${rules.data.leaveDivisor}`,
      );
    }
    const months =
      (Number(value.lastWorkingDay.slice(0, 4)) - employee.joinedOn.getUTCFullYear()) * 12 +
      Number(value.lastWorkingDay.slice(5, 7)) -
      employee.joinedOn.getUTCMonth() -
      1;
    const years = Math.floor(months / 12);
    if (
      rules.data.gratuityEnabled &&
      employee.employmentType !== "intern" &&
      years >= rules.data.gratuityMinimumYears
    ) {
      const eligibleYears = years + (months % 12 > 6 ? 1 : 0);
      add(
        "GRATUITY",
        "earning",
        "Gratuity",
        Math.min(
          rules.data.gratuityCapPaise,
          Math.round((full.basic * rules.data.gratuityNumerator * eligibleYears) / rules.data.gratuityDivisor),
        ),
        `${eligibleYears} years under configured settlement policy`,
      );
    }
    for (const asset of await repo.list("asset", l.assetDetailSchema, { ownerId: employee.id }))
      if (asset.status === "assigned")
        add(
          `ASSET_${asset.id}`,
          "deduction",
          `Asset recovery: ${asset.tag}`,
          paiseFromAmount(asset.bookValue.amount),
          `${asset.make} ${asset.model}`,
        );
    return {
      lines,
      monthlyGross: inr(full.gross),
      monthlyBasic: inr(full.basic),
      leaveRecoveries,
      fingerprint: digest(lines.map(({ code, amount }) => ({ code, amount }))),
      warnings: [
        ...(existing ? ["Final month salary already appears in published payroll and is excluded."] : []),
        ...(!rules.data.approvedForProduction ? ["Settlement policy awaits production approval."] : []),
        "Review reimbursements and final tax adjustments before submission.",
      ],
    };
  }
  function settlementView(value: s.SettlementRecord, call: TalentCall) {
    const actor = actorOf(call);
    return l.settlementDetailSchema.parse({
      ...value,
      permissions: {
        canEdit: can(actor, "settlement.prepare") && changeable(value),
        canSubmit: can(actor, "settlement.prepare") && changeable(value),
        canApprove:
          can(actor, "settlement.approve") && value.state === "submitted" && value.preparedById !== actor.employeeId,
        approveBlockedReason: value.preparedById === actor.employeeId ? "An independent approver must approve." : null,
        canPay: can(actor, "settlement.approve") && value.state === "approved",
      },
    });
  }
  async function read(action: string, call: TalentCall) {
    const repo = unit.read;
    const actor = actorOf(call);
    if (action === "settlement_policy") return s.settlementPolicySchema.parse(await repo.setting("settlement_policy"));
    if (action === "letter_queue") {
      ensure(can(actor, "letter.issue"), "FORBIDDEN", "Letter administration is restricted.");
      const requests = await repo.list("letter_request", s.letterRequestRecord);
      return Promise.all(
        requests
          .filter((r) =>
            call.query.view === "closed"
              ? ["issued", "rejected"].includes(r.state)
              : ["pending", "in_progress"].includes(r.state),
          )
          .map(async (r) => ({
            id: r.id,
            kind: "letter",
            reference: r.reference,
            requester: personRef(await repo.person(r.employeeId)),
            title: r.type.replaceAll("_", " "),
            detail: r.addressedTo,
            proposed: null,
            reason: r.purpose,
            submittedAt: r.requestedAt,
            state: r.state === "issued" ? "approved" : r.state,
            verifier: "HR",
            decisionNote: null,
          })),
      );
    }
    if (action === "resignation") return resignationView(repo, call);
    if (action === "onboarding") return onboarding(repo);
    if (action === "checklists")
      return { onboarding: await checklist(repo, "onboarding"), offboarding: await checklist(repo, "offboarding") };
    if (action === "offboarding" || action === "offboarding_board") {
      const cases = await exits(repo);
      if (action === "offboarding") return cases;
      const resignations = (await repo.list("resignation", l.resignationSchema)).map((r) => ({
        ...r,
        permissions: {
          ...r.permissions,
          canDecideAsHr: r.person.id !== actor.employeeId && ["pending_hr", "on_hold"].includes(r.state),
          canDecideAsManager: false,
          canWithdraw: false,
        },
      }));
      const interviews = cases.flatMap((c) => (c.interview ? [c.interview] : []));
      return {
        today: todayInOrgZone(),
        cases,
        resignations,
        exitReasons: l.resignationReasonSchema.options.map((reason) => ({
          reason,
          count: interviews.filter((i) => i.primaryReason === reason).length,
        })),
        averageRatings: l.exitRatingKeys.map((key) => ({
          key,
          average: interviews.length
            ? (interviews.reduce((n, i) => n + i.ratings[key], 0) / interviews.length).toFixed(2)
            : "0.00",
        })),
        canDecide: true,
      };
    }
    if (action === "assets" || action === "my_assets") {
      const [assets, requests, people] = await Promise.all([
        repo.list("asset", l.assetDetailSchema),
        repo.list("asset_request", l.assetRequestSchema),
        repo.people(),
      ]);
      if (action === "my_assets")
        return {
          assigned: assets.filter((a) => a.assignee?.id === actor.employeeId),
          returned: await repo.list("asset_return", s.returnRecord, { ownerId: actor.employeeId }),
          requests: requests.filter((r) => r.requester.id === actor.employeeId),
        };
      return {
        assets,
        requests,
        people: people.filter((e) => e.status !== "exited").map(personRef),
        totals: {
          count: assets.length,
          assigned: assets.filter((a) => a.status === "assigned").length,
          inStock: assets.filter((a) => a.status === "in_stock").length,
          inRepair: assets.filter((a) => a.status === "in_repair").length,
          retired: assets.filter((a) => a.status === "retired").length,
          unacknowledged: assets.filter((a) => a.status === "assigned" && !a.acknowledgedAt).length,
          bookValue: inr(assets.reduce((n, a) => n + paiseFromAmount(a.bookValue.amount), 0)),
        },
      };
    }
    if (action === "settlements") {
      const settlements = await repo.list("settlement", s.settlementRecord);
      return {
        settlements: settlements.map((s) => settlementView(s, call)),
        eligible: (await exits(repo))
          .filter((c) => !settlements.some((s) => s.person.id === c.person.id))
          .map((c) => ({ person: c.person, department: c.department, lastWorkingDay: c.lastWorkingDay })),
        canPrepare: can(actor, "settlement.prepare"),
        canApprove: can(actor, "settlement.approve"),
      };
    }
    if (action === "settlement") {
      const record = await repo.get(idOf(call, "settlementId"), "settlement", s.settlementRecord);
      if (changeable(record) || record.state === "submitted") {
        const auto = await automaticSettlement(repo, record);
        record.stale = record.sourceFingerprint !== auto.fingerprint;
      }
      return settlementView(record, call);
    }
    if (action === "letter") {
      const letter = await repo.get(idOf(call, "letterId"), "letter", l.issuedLetterSchema);
      if (!can(actor, "letter.issue")) own(letter.person.id, actor.employeeId);
      return letter;
    }
    if (action === "letter_requests")
      return repo.list("letter_request", s.letterRequestRecord, { ownerId: actor.employeeId });
    if (action === "studio") {
      const [templates, people, issued] = await Promise.all([
        repo.list("letter_template", l.letterTemplateSchema),
        repo.people(),
        repo.list("letter", l.issuedLetterSchema),
      ]);
      const template = templates.find((t) => t.id === call.query.templateId);
      return {
        templates: templates.map((t) => ({
          ...t,
          issuedCount: issued.filter((i) => i.templateName === t.name).length,
        })),
        people: people.map((e) => ({ ...personRef(e), code: e.code, status: e.status })),
        placeholders: placeholders.map((key) => ({ key, label: key })),
        preview:
          template && call.query.employeeId
            ? await renderLetter(
                repo,
                template,
                call.query.employeeId,
                call,
                call.query.purpose ?? "",
                call.query.addressedTo ?? "",
                "Assigned on issue",
              )
            : null,
        issued,
      };
    }
    const policies = await repo.list("policy", l.policyAckSchema);
    if (action === "policies") return policies;
    return policies
      .filter(
        (p) =>
          p.pending.some((e) => e.id === actor.employeeId) || p.recent.some((a) => a.person.id === actor.employeeId),
      )
      .map((p) => ({
        ...p,
        acknowledgedAt: p.recent.find((a) => a.person.id === actor.employeeId)?.at ?? null,
        overdue: p.dueOn < todayInOrgZone() && !p.recent.some((a) => a.person.id === actor.employeeId),
      }));
  }
  async function command(action: string, call: TalentCall, body: unknown) {
    const actor = actorOf(call);
    return unit.command(actor.employeeId, call.key, action, async (repo) => {
      const self = await repo.person(actor.employeeId);
      if (action === "settlement_policy") {
        const input = s.settlementPolicySchema.parse(body);
        await repo.saveSetting("settlement_policy", input);
        return { ok: true };
      }
      if (action === "start_exit") {
        const input = employeeExitInputSchema.parse({
          ...z.record(z.string(), z.unknown()).parse(body),
          employeeId: idOf(call, "employeeId"),
        });
        const employee = await repo.person(input.employeeId);
        ensure(
          !["notice", "exited"].includes(employee.status),
          "EXIT_ALREADY_STARTED",
          "This employee already has an exit in progress.",
        );
        ensure(
          input.lastWorkingDay >= employee.joinedOn.toISOString().slice(0, 10),
          "INVALID_EXIT_DATE",
          "Last working day cannot precede joining.",
        );
        await repo.setEmployment(employee.id, "notice", input.lastWorkingDay);
        const value = requireValue((await exits(repo)).find((e) => e.person.id === employee.id));
        value.reason = input.reason;
        value.reasonNote = input.note;
        await repo.save("offboarding", l.offboardingDetailSchema, value, { ownerId: employee.id });
        return { id: employee.id };
      }
      if (action === "letter_decision") {
        ensure(can(actor, "letter.issue"), "FORBIDDEN", "Letter administration is restricted.");
        const input = serviceDecisionInputSchema.parse({
          ...z.record(z.string(), z.unknown()).parse(body),
          requestId: idOf(call, "requestId"),
          kind: "letter",
        });
        const request = await repo.get(input.requestId, "letter_request", s.letterRequestRecord);
        ensure(["pending", "in_progress"].includes(request.state), "REQUEST_CLOSED", "This letter request is closed.");
        ensure(request.employeeId !== self.id, "SELF_APPROVAL", "An independent issuer must fulfil your request.");
        if (input.decision === "start") request.state = "in_progress";
        else if (input.decision === "reject") request.state = "rejected";
        else {
          const kind = request.type === "experience_letter" ? "experience" : request.type;
          const template = (await repo.list("letter_template", l.letterTemplateSchema)).find(
            (t) => t.kind === kind && t.active,
          );
          ensure(template, "TEMPLATE_REQUIRED", "Create an active template for this letter type before approval.");
          const employee = await repo.person(request.employeeId);
          if (kind === "experience")
            ensure(
              employee.status === "exited",
              "EXIT_NOT_COMPLETE",
              "Complete offboarding before issuing experience letters.",
            );
          const reference = await repo.reference("LTR");
          const preview = await renderLetter(
            repo,
            template,
            employee.id,
            call,
            request.purpose,
            request.addressedTo,
            reference,
          );
          ensure(!preview.missing.length, "MISSING_PLACEHOLDERS", `Complete ${preview.missing.join(", ")}.`);
          const id = newId("letter");
          await repo.save(
            "letter",
            l.issuedLetterSchema,
            {
              id,
              reference,
              kind: template.kind,
              title: template.name,
              subject: preview.subject,
              body: preview.body,
              person: personRef(employee),
              employeeCode: employee.code,
              issuedAt: now(),
              issuedBy: self.name,
              templateName: template.name,
              href: `/documents/letters/${id}`,
            },
            { ownerId: employee.id, parentId: template.id },
          );
          request.state = "issued";
          request.issuedAt = now();
        }
        await repo.save("letter_request", s.letterRequestRecord, request, { state: request.state });
        return { reference: request.reference, state: request.state === "issued" ? "approved" : request.state };
      }
      if (action === "checklist" || action === "checklist_delete") {
        const list = z.enum(["onboarding", "offboarding"]).parse(call.params.list);
        if (action === "checklist_delete") {
          await repo.remove(idOf(call, "taskId"), `checklist_${list}`);
          return { ok: true };
        }
        const input = checklistTaskInputSchema.parse(body);
        own(input.list, list);
        const id = call.params.taskId ?? input.id ?? newId("task");
        if (call.params.taskId) await repo.get(id, `checklist_${list}`, checklistTaskSchema);
        await repo.save(`checklist_${list}`, checklistTaskSchema, { ...input, id });
        return { id };
      }
      if (action === "onboarding_task") {
        const input = z.object({ done: z.boolean() }).parse(body);
        const cases = await onboarding(repo);
        const value = cases.find((c) => c.person.id === call.params.employeeId);
        ensure(value, "ONBOARDING_NOT_FOUND", "Onboarding case was not found.");
        const task = value.tasks.find((t) => t.id === call.params.taskId);
        ensure(task, "TASK_NOT_FOUND", "Task was not found.");
        task.done = input.done;
        await repo.save("onboarding", onboardingCaseSchema, value, { ownerId: value.person.id });
        if (value.tasks.length && value.tasks.every((t) => !t.blocking || t.done))
          await repo.setEmployment(value.person.id, "active");
        return { ok: true };
      }
      if (action === "resign") {
        const input = l.resignationInputSchema.parse(body);
        const view = await resignationView(repo, call);
        ensure(view.canResign, "RESIGNATION_BLOCKED", view.blockedReason ?? "Cannot submit resignation.");
        ensure(input.lastWorkingDay >= todayInOrgZone(), "PAST_EXIT_DATE", "Choose a future last working day.");
        const early = input.lastWorkingDay < view.policy.defaultLastWorkingDay;
        ensure(
          !early || input.earlyReleaseReason.length >= 5,
          "EARLY_RELEASE_REASON",
          "Explain the early release request.",
        );
        const id = newId("res");
        const reference = await repo.reference("RES");
        const state = self.managerId ? "pending_manager" : "pending_hr";
        await repo.save(
          "resignation",
          l.resignationSchema,
          {
            id,
            reference,
            person: personRef(self),
            department: self.department.name,
            reason: input.reason,
            note: input.note,
            submittedAt: now(),
            noticeDays: view.policy.noticeDays,
            noticeBasis: view.policy.basis,
            policyLastWorkingDay: view.policy.defaultLastWorkingDay,
            requestedLastWorkingDay: input.lastWorkingDay,
            earlyRelease: early,
            earlyReleaseReason: input.earlyReleaseReason,
            agreedLastWorkingDay: null,
            managerRecommendation: null,
            state,
            history: [event(self.name, "Resignation submitted")],
            version: 1,
            permissions: { canWithdraw: true, canDecideAsManager: false, canDecideAsHr: false },
          },
          { ownerId: self.id, state },
        );
        if (self.managerId)
          await repo.notify(
            self.managerId,
            "Resignation submitted",
            `${self.name} submitted a resignation.`,
            "/approvals",
          );
        return { reference, state };
      }
      if (action === "withdraw" || action === "resignation_decision") {
        const resignation = await repo.get(idOf(call, "resignationId"), "resignation", l.resignationSchema);
        assertVersion(resignation.version, call.version);
        ensure(
          ["pending_manager", "pending_hr", "on_hold"].includes(resignation.state),
          "RESIGNATION_CLOSED",
          "This resignation is no longer pending.",
        );
        if (action === "withdraw") {
          own(resignation.person.id, self.id);
          resignation.state = "withdrawn";
        } else {
          const input = s.decisionInput.parse(body);
          ensure(resignation.person.id !== self.id, "SELF_APPROVAL", "You cannot decide your own resignation.");
          const employee = await repo.person(resignation.person.id);
          const hr = can(actor, "onboarding.manage");
          if (!hr) {
            own(employee.managerId ?? "", self.id);
            ensure(resignation.state === "pending_manager", "HR_DECISION_REQUIRED", "HR must decide this resignation.");
          }
          if (input.decision === "hold") resignation.state = "on_hold";
          else if (input.decision === "reject") resignation.state = "rejected";
          else if (!hr) {
            resignation.state = "pending_hr";
            resignation.managerRecommendation = input.note;
          } else {
            const day = input.lastWorkingDay ?? resignation.requestedLastWorkingDay;
            ensure(day >= todayInOrgZone(), "PAST_EXIT_DATE", "Last working day cannot be in the past.");
            resignation.state = "accepted";
            resignation.agreedLastWorkingDay = day;
            await repo.setEmployment(employee.id, "notice", day);
            const exit = requireValue((await exits(repo)).find((e) => e.person.id === employee.id));
            exit.reason = "resignation";
            exit.reasonNote = resignation.note;
            exit.resignationReference = resignation.reference;
            exit.noticeShortfallDays = daysBetween(day, resignation.policyLastWorkingDay);
            await repo.save("offboarding", l.offboardingDetailSchema, exit, { ownerId: employee.id });
          }
          resignation.history.push(event(self.name, `Resignation ${input.decision}`, input.note));
        }
        resignation.version++;
        if (action === "withdraw") resignation.history.push(event(self.name, "Resignation withdrawn"));
        await repo.save("resignation", l.resignationSchema, resignation, { state: resignation.state });
        return { reference: resignation.reference, state: resignation.state };
      }
      if (["offboarding_task", "clearance", "interview", "complete"].includes(action)) {
        const value = (await exits(repo)).find((e) => e.person.id === call.params.employeeId);
        ensure(value, "EXIT_NOT_FOUND", "Exit case was not found.");
        ensure(value.status === "notice", "EXIT_COMPLETED", "This exit is complete.");
        if (action === "offboarding_task") {
          const input = z.object({ done: z.boolean() }).parse(body);
          const task = value.tasks.find((t) => t.id === call.params.taskId);
          ensure(task, "TASK_NOT_FOUND", "Task was not found.");
          task.done = input.done;
        }
        if (action === "clearance") {
          const input = z
            .object({ status: z.enum(["pending", "cleared"]), note: z.string().max(300).default("") })
            .parse(body);
          const clearance = value.clearances.find((c) => c.department === call.params.department);
          ensure(clearance, "CLEARANCE_NOT_FOUND", "Clearance was not found.");
          if (input.status === "cleared" && clearance.department === "it")
            ensure(!value.assets.length, "ASSETS_OUTSTANDING", "Return assigned assets before IT clearance.");
          clearance.status = input.status;
          clearance.note = input.note;
          clearance.clearedAt = input.status === "cleared" ? now() : null;
          clearance.clearedBy = input.status === "cleared" ? self.name : null;
        }
        if (action === "interview") {
          const input = l.exitInterviewInputSchema.parse(body);
          own(input.employeeId, value.person.id);
          value.interview = {
            primaryReason: input.primaryReason,
            ratings: {
              role: input.role,
              manager: input.manager,
              growth: input.growth,
              compensation: input.compensation,
              culture: input.culture,
              workLife: input.workLife,
            },
            wouldRejoin: input.wouldRejoin,
            wouldRecommend: input.wouldRecommend,
            comments: input.comments,
            conductedBy: self.name,
            conductedAt: now(),
          };
        }
        if (action === "complete") {
          ensure(!value.completeBlockers.length, "EXIT_BLOCKED", value.completeBlockers.join("; "));
          ensure(
            value.lastWorkingDay <= todayInOrgZone(),
            "EXIT_DATE_NOT_REACHED",
            "Complete the exit on or after the last working day.",
          );
          await repo.setEmployment(value.person.id, "exited", value.lastWorkingDay);
          value.status = "exited";
          value.accessRevoked = true;
        }
        await repo.save("offboarding", l.offboardingDetailSchema, value, { ownerId: value.person.id });
        return { ok: true };
      }
      if (action === "asset") {
        const input = l.assetInputSchema.parse(body);
        ensure(input.purchasedOn <= todayInOrgZone(), "FUTURE_PURCHASE", "Purchase date cannot be in the future.");
        const id = call.params.assetId ?? input.id ?? newId("asset");
        const old = call.params.assetId ? await repo.get(id, "asset", l.assetDetailSchema) : null;
        const assets = await repo.list("asset", l.assetDetailSchema);
        ensure(
          !assets.some((a) => a.id !== id && (a.tag === input.tag || a.serial === input.serial)),
          "DUPLICATE_ASSET",
          "Asset tag and serial must be unique.",
        );
        const cost = inr(paiseFromAmount(input.cost));
        await repo.save("asset", l.assetDetailSchema, {
          ...input,
          id,
          cost,
          bookValue: cost,
          status: old?.status ?? "in_stock",
          assignee: old?.assignee ?? null,
          assignedAt: old?.assignedAt ?? null,
          acknowledgedAt: old?.acknowledgedAt ?? null,
          version: (old?.version ?? 0) + 1,
          history: [...(old?.history ?? []), event(self.name, old ? "Asset updated" : "Asset added")],
        });
        return { id, tag: input.tag };
      }
      if (action === "asset_request") {
        const input = l.assetRequestInputSchema.parse(body);
        const id = newId("ar");
        const reference = await repo.reference("AR");
        await repo.save(
          "asset_request",
          l.assetRequestSchema,
          {
            id,
            reference,
            requester: personRef(self),
            category: input.category,
            reason: input.reason,
            state: "pending",
            requestedAt: now(),
            decidedAt: null,
            assetTag: null,
            note: null,
          },
          { ownerId: self.id, state: "pending" },
        );
        return { reference };
      }
      if (action === "asset_reject") {
        const input = z.object({ decision: z.literal("reject"), reason: z.string().min(5).max(300) }).parse(body);
        const request = await repo.get(idOf(call, "requestId"), "asset_request", l.assetRequestSchema);
        ensure(request.state === "pending", "REQUEST_CLOSED", "This request was already decided.");
        request.state = "rejected";
        request.note = input.reason;
        request.decidedAt = now();
        await repo.save("asset_request", l.assetRequestSchema, request, { state: request.state });
        return { reference: request.reference };
      }
      if (["assign", "return", "asset_status", "ack_asset"].includes(action)) {
        const asset = await repo.get(idOf(call, "assetId"), "asset", l.assetDetailSchema);
        assertVersion(asset.version, call.version);
        let result: unknown = { tag: asset.tag };
        if (action === "assign") {
          const input = s.assignInput.parse(body);
          ensure(
            asset.status === "in_stock" && !asset.assignee,
            "ASSET_UNAVAILABLE",
            "Only in-stock assets can be assigned.",
          );
          const employee = await repo.person(input.employeeId);
          ensure(
            !["exited", "notice"].includes(employee.status),
            "EMPLOYEE_EXITING",
            "Assets cannot be assigned to exiting employees.",
          );
          if (input.requestId) {
            const request = await repo.get(input.requestId, "asset_request", l.assetRequestSchema);
            own(request.requester.id, employee.id);
            ensure(
              request.state === "pending" && request.category === asset.category,
              "REQUEST_MISMATCH",
              "Choose a pending request for the matching asset category.",
            );
            await repo.save(
              "asset_request",
              l.assetRequestSchema,
              { ...request, state: "fulfilled", decidedAt: now(), assetTag: asset.tag, note: input.note },
              { state: "fulfilled" },
            );
          }
          asset.assignee = personRef(employee);
          asset.status = "assigned";
          asset.assignedAt = now();
          asset.acknowledgedAt = null;
          result = { tag: asset.tag, employee: employee.name };
        }
        if (action === "return") {
          const input = s.returnInput.parse(body);
          ensure(asset.status === "assigned" && asset.assignee, "ASSET_NOT_ASSIGNED", "This asset is not assigned.");
          await repo.save(
            "asset_return",
            s.returnRecord,
            {
              id: newId("ret"),
              tag: asset.tag,
              label: `${asset.make} ${asset.model}`,
              returnedAt: now(),
              condition: input.condition,
              employeeId: asset.assignee.id,
            },
            { ownerId: asset.assignee.id },
          );
          asset.assignee = null;
          asset.assignedAt = null;
          asset.acknowledgedAt = null;
          asset.condition = input.condition;
          asset.status = input.condition === "damaged" ? "in_repair" : "in_stock";
          result = { tag: asset.tag, status: asset.status };
        }
        if (action === "asset_status") {
          const input = s.statusInput.parse(body);
          ensure(!asset.assignee, "ASSET_ASSIGNED", "Return the asset before changing its status.");
          ensure(
            asset.status !== "retired" || input.status === "retired",
            "ASSET_RETIRED",
            "Retired assets cannot be reactivated.",
          );
          asset.status = input.status;
          result = { tag: asset.tag, status: asset.status };
        }
        if (action === "ack_asset") {
          own(asset.assignee?.id ?? "", self.id);
          ensure(asset.status === "assigned", "ASSET_NOT_ASSIGNED", "Only assigned assets can be acknowledged.");
          asset.acknowledgedAt = asset.acknowledgedAt ?? now();
        }
        asset.version++;
        asset.history.push(event(self.name, action));
        await repo.save("asset", l.assetDetailSchema, asset, {
          ownerId: asset.assignee?.id ?? null,
          state: asset.status,
        });
        return result;
      }
      if (action === "template") {
        const input = l.letterTemplateInputSchema.parse(body);
        const id = call.params.templateId ?? input.id ?? newId("tpl");
        const old = call.params.templateId ? await repo.get(id, "letter_template", l.letterTemplateSchema) : null;
        const keys = [...`${input.subject} ${input.body}`.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)].map(
          (m) => m[1],
        );
        ensure(
          keys.every((k) => k && placeholders.includes(k)),
          "UNKNOWN_PLACEHOLDER",
          "Use only supported letter placeholders.",
        );
        await repo.save("letter_template", l.letterTemplateSchema, {
          ...input,
          id,
          updatedAt: now(),
          updatedBy: self.name,
          version: (old?.version ?? 0) + 1,
          issuedCount: old?.issuedCount ?? 0,
        });
        return { id };
      }
      if (action === "letter_request") {
        const input = letterInputSchema.parse(body);
        const id = newId("lr");
        const reference = await repo.reference("LTR");
        await repo.save(
          "letter_request",
          s.letterRequestRecord,
          { ...input, id, reference, state: "pending", requestedAt: now(), issuedAt: null, employeeId: self.id },
          { ownerId: self.id, state: "pending" },
        );
        return { reference };
      }
      if (action === "issue") {
        const input = s.issueInput.parse(body);
        const template = await repo.get(input.templateId, "letter_template", l.letterTemplateSchema);
        ensure(template.active, "TEMPLATE_INACTIVE", "Choose an active template.");
        const employee = await repo.person(input.employeeId);
        if (["relieving", "experience"].includes(template.kind))
          ensure(
            employee.status === "exited",
            "EXIT_NOT_COMPLETE",
            "Complete offboarding before issuing an exit letter.",
          );
        const reference = await repo.reference("LTR");
        const preview = await renderLetter(
          repo,
          template,
          employee.id,
          call,
          input.purpose,
          input.addressedTo,
          reference,
        );
        ensure(!preview.missing.length, "MISSING_PLACEHOLDERS", `Complete values for: ${preview.missing.join(", ")}.`);
        const id = newId("letter");
        await repo.save(
          "letter",
          l.issuedLetterSchema,
          {
            id,
            reference,
            kind: template.kind,
            title: template.name,
            subject: preview.subject,
            body: preview.body,
            person: personRef(employee),
            employeeCode: employee.code,
            issuedAt: now(),
            issuedBy: self.name,
            templateName: template.name,
            href: `/documents/letters/${id}`,
          },
          { ownerId: employee.id, parentId: template.id },
        );
        const requests = await repo.list("letter_request", s.letterRequestRecord, { ownerId: employee.id });
        for (const request of requests.filter(
          (r) =>
            (r.type === template.kind || (r.type === "experience_letter" && template.kind === "experience")) &&
            ["pending", "in_progress"].includes(r.state),
        ))
          await repo.save(
            "letter_request",
            s.letterRequestRecord,
            { ...request, state: "issued", issuedAt: now() },
            { state: "issued" },
          );
        return { id, reference };
      }
      if (action === "policy") {
        const input = l.policyPublishInputSchema.parse(body);
        ensure(input.dueOn >= todayInOrgZone(), "PAST_POLICY_DUE", "Acknowledgement due date cannot be in the past.");
        const policies = await repo.list("policy", l.policyAckSchema);
        ensure(
          !policies.some((p) => p.title === input.title && p.version === input.version),
          "DUPLICATE_POLICY_VERSION",
          "This policy version already exists.",
        );
        const people = (await repo.people()).filter(
          (e) => e.status !== "exited" && (input.audience === "Everyone" || e.department.name === input.audience),
        );
        ensure(people.length, "EMPTY_AUDIENCE", "This policy audience has no active employees.");
        const id = newId("pol");
        await repo.save("policy", l.policyAckSchema, {
          ...input,
          id,
          publishedAt: now(),
          publishedBy: self.name,
          total: people.length,
          acknowledged: 0,
          pending: people.map((e) => ({ ...personRef(e), department: e.department.name })),
          recent: [],
          reminders: [],
        });
        for (const employee of people)
          await repo.notify(employee.id, "Policy acknowledgement required", input.title, "/documents?tab=policies");
        return { id, audience: people.length };
      }
      if (action === "policy_remind" || action === "ack_policy") {
        const policy = await repo.get(idOf(call, "policyId"), "policy", l.policyAckSchema);
        if (action === "ack_policy") {
          ensure(
            policy.pending.some((e) => e.id === self.id) || policy.recent.some((a) => a.person.id === self.id),
            "NOT_POLICY_AUDIENCE",
            "You are not in this policy's audience.",
          );
          if (!policy.recent.some((a) => a.person.id === self.id)) {
            policy.pending = policy.pending.filter((e) => e.id !== self.id);
            policy.recent.push({ person: personRef(self), at: now() });
            policy.acknowledged++;
          }
          await repo.save("policy", l.policyAckSchema, policy);
          return { title: policy.title, version: policy.version };
        }
        for (const person of policy.pending)
          await repo.notify(person.id, "Policy acknowledgement reminder", policy.title, "/documents?tab=policies");
        policy.reminders.push({ at: now(), by: self.name, count: policy.pending.length });
        await repo.save("policy", l.policyAckSchema, policy);
        return { count: policy.pending.length };
      }
      let settlement: s.SettlementRecord;
      if (action === "settlement_create") {
        const input = z.object({ employeeId: z.string().min(1) }).parse(body);
        const exit = (await exits(repo)).find((e) => e.person.id === input.employeeId);
        ensure(exit, "EXIT_REQUIRED", "Start offboarding before preparing a settlement.");
        ensure(
          !(await repo.list("settlement", s.settlementRecord, { ownerId: input.employeeId })).length,
          "SETTLEMENT_EXISTS",
          "A settlement already exists for this employee.",
        );
        const employee = await repo.person(input.employeeId);
        const resignation = (await repo.list("resignation", l.resignationSchema, { ownerId: employee.id })).find(
          (r) => r.state === "accepted",
        );
        settlement = {
          id: newId("fnf"),
          reference: await repo.reference("FNF"),
          person: personRef(employee),
          department: employee.department.name,
          lastWorkingDay: exit.lastWorkingDay,
          state: "draft",
          net: inr(0),
          preparedBy: self.name,
          preparedById: self.id,
          updatedAt: now(),
          code: employee.code,
          designation: employee.designation,
          joinedOn: employee.joinedOn.toISOString().slice(0, 10),
          service: `${Math.floor(daysBetween(employee.joinedOn.toISOString().slice(0, 10), exit.lastWorkingDay) / 365)} years`,
          employmentType: employee.employmentType,
          noticeDays: resignation?.noticeDays ?? 0,
          noticeShortfallDays: exit.noticeShortfallDays,
          noticeWaived: false,
          waiverReason: null,
          monthlyGross: inr(0),
          monthlyBasic: inr(0),
          lines: [],
          earnings: inr(0),
          deductions: inr(0),
          preparedAt: now(),
          submittedAt: null,
          approvedBy: null,
          approvedById: null,
          approvedAt: null,
          rejectionNote: null,
          paidAt: null,
          paidOn: null,
          utr: null,
          stale: false,
          warnings: [],
          audit: [],
          version: 1,
          permissions: {
            canEdit: false,
            canSubmit: false,
            canApprove: false,
            approveBlockedReason: null,
            canPay: false,
          },
          sourceFingerprint: "",
        };
      } else settlement = await repo.get(idOf(call, "settlementId"), "settlement", s.settlementRecord);
      assertVersion(settlement.version, call.version);
      if (["settlement_create", "recalculate", "waiver", "line", "remove_line"].includes(action)) {
        ensure(changeable(settlement), "SETTLEMENT_LOCKED", "Only draft or rejected settlements can be edited.");
        if (action === "waiver") {
          const input = s.waiverInput.parse(body);
          settlement.noticeWaived = input.waive;
          settlement.waiverReason = input.reason;
        }
        if (action === "line") {
          const input = s.lineInput.parse(body);
          settlement.lines.push({
            id: newId("sl"),
            code: "MANUAL",
            kind: input.kind,
            label: input.label,
            detail: input.reason,
            amount: inr(paiseFromAmount(input.amount.amount)),
            manual: true,
            reason: input.reason,
          });
        }
        if (action === "remove_line") {
          const line = settlement.lines.find((l) => l.id === call.params.lineId);
          ensure(line?.manual, "AUTOMATIC_LINE", "Only manual lines can be removed.");
          settlement.lines = settlement.lines.filter((l) => l.id !== line.id);
        }
        const auto = await automaticSettlement(repo, settlement);
        settlement.lines = [...auto.lines, ...settlement.lines.filter((l) => l.manual)];
        settlement.monthlyGross = auto.monthlyGross;
        settlement.monthlyBasic = auto.monthlyBasic;
        settlement.sourceFingerprint = auto.fingerprint;
        settlement.warnings = auto.warnings;
        settlement.stale = false;
        settlement.preparedById = self.id;
        settlement.preparedBy = self.name;
      }
      if (action === "settlement_submit") {
        ensure(
          s.settlementPolicySchema.parse(await repo.setting("settlement_policy")).approvedForProduction,
          "SETTLEMENT_POLICY_UNAPPROVED",
          "Approve the configured settlement policy before submission.",
        );
        ensure(changeable(settlement), "SETTLEMENT_LOCKED", "This settlement cannot be submitted.");
        const auto = await automaticSettlement(repo, settlement);
        ensure(
          auto.fingerprint === settlement.sourceFingerprint,
          "SETTLEMENT_STALE",
          "Recalculate after source changes.",
        );
        ensure(
          paiseFromAmount(settlement.net.amount) >= 0,
          "NEGATIVE_SETTLEMENT",
          "Resolve negative net before submission.",
        );
        settlement.state = "submitted";
        settlement.submittedAt = now();
      }
      if (action === "settlement_decision") {
        const input = s.settlementDecision.parse(body);
        ensure(
          settlement.state === "submitted",
          "SETTLEMENT_NOT_SUBMITTED",
          "This settlement is not awaiting approval.",
        );
        ensure(settlement.preparedById !== self.id, "SELF_APPROVAL", "An independent approver must decide.");
        if (input.decision === "approve") {
          const auto = await automaticSettlement(repo, settlement);
          ensure(
            auto.fingerprint === settlement.sourceFingerprint,
            "SETTLEMENT_STALE",
            "Return to the preparer for recalculation.",
          );
          settlement.state = "approved";
          settlement.approvedAt = now();
          settlement.approvedBy = self.name;
          settlement.approvedById = self.id;
        } else {
          settlement.state = "rejected";
          settlement.rejectionNote = input.reason;
        }
      }
      if (action === "settlement_payment") {
        const input = s.paymentInput.parse(body);
        ensure(settlement.state === "approved", "SETTLEMENT_NOT_APPROVED", "Approve the settlement before payment.");
        await repo.time().lock("workflows");
        const sources = await automaticSettlement(repo, settlement);
        ensure(
          sources.fingerprint === settlement.sourceFingerprint,
          "SETTLEMENT_STALE",
          "Settlement sources changed after approval; an amended settlement is required.",
        );
        ensure(
          input.paidOn <= todayInOrgZone() && input.paidOn >= settlement.lastWorkingDay,
          "INVALID_PAYMENT_DATE",
          "Payment must be on or after last working day and no later than today.",
        );
        ensure(
          !(await repo.list("settlement", s.settlementRecord)).some(
            (s) => s.id !== settlement.id && s.utr === input.utr,
          ),
          "UTR_REUSED",
          "That bank reference was already used.",
        );
        settlement.state = "paid";
        settlement.paidAt = now();
        settlement.paidOn = input.paidOn;
        settlement.utr = input.utr;
        for (const recovery of sources.leaveRecoveries)
          await repo.time().addLedger({
            id: newId("ll"),
            employeeId: settlement.person.id,
            leaveTypeId: recovery.leaveTypeId,
            date: settlement.lastWorkingDay,
            kind: "encashed",
            units: `-${recovery.days}`,
            reference: settlement.reference,
            note: "Full and final settlement",
            actorId: actor.employeeId,
          });
        for (const loan of await repo.payroll().loans(settlement.person.id))
          if (settlement.lines.some((line) => line.code === `LOAN_${loan.id}`))
            await repo.payroll().updateLoan(loan.id, {
              state: "closed",
              recoveredPaise: loan.principalPaise,
              paidInstallments: loan.tenureMonths,
            });
      }
      settlement.earnings = inr(moneyTotal(settlement.lines, "earning"));
      settlement.deductions = inr(moneyTotal(settlement.lines, "deduction"));
      settlement.net = inr(paiseFromAmount(settlement.earnings.amount) - paiseFromAmount(settlement.deductions.amount));
      settlement.version++;
      settlement.updatedAt = now();
      settlement.audit.push(event(self.name, action));
      await repo.save("settlement", s.settlementRecord, settlement, {
        ownerId: settlement.person.id,
        state: settlement.state,
      });
      return { id: settlement.id, reference: settlement.reference };
    });
  }
  return { read, command };
}
