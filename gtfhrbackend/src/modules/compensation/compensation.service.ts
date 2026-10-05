import { z } from "zod";
import type { PayImport, PrismaClient } from "@prisma/client";
import { idempotent } from "../../core/database/idempotency.js";
import { newId, nextReference } from "../../core/database/ids.js";
import { AppError } from "../../core/errors/AppError.js";
import { can, requireCapability, type AuthenticatedActor } from "../../core/security/actor.js";
import { personRef } from "../../core/people/person-ref.js";
import { todayInOrgZone, fromIsoDate } from "../../utils/date.js";
import { inr, paiseFromAmount } from "../../utils/money.js";
import { recordAuditEvent } from "../audit-logs/audit.repository.js";
import {
  assignmentProposalSchema,
  structureProposalSchema,
  structuresSchema,
  type AssignmentProposal,
  type StructureProposal,
  type Structures,
} from "../../contracts/statutory.js";
import { compensationBatchSchema, type CompensationBatch } from "../../contracts/compensation-import.js";
import { createCompensationRepository } from "./compensation.repository.js";
import { compensationUploadSchema } from "./compensation.schema.js";
import { annualTax, currentCtc, groupKey, loadPolicy, structure, templateFor } from "../payroll/payroll.rules.js";
import { templateTermsSchema } from "../payroll/payroll.schema.js";
import { json, loadCalculationData, requirePayroll } from "../payroll/payroll.service.js";
import { readCompensationFile } from "./compensation-file.js";
import { ImportFileError } from "../attendance-import/attendance-file.js";

export function createCompensationService(prisma: PrismaClient) {
  const repository = createCompensationRepository(prisma);
  const batchDto = async (actor: AuthenticatedActor, row: PayImport): Promise<CompensationBatch> => {
    const employees = await repository.employees();
    const preview = compensationBatchSchema.pick({ columns: true, rows: true, totals: true }).parse(row.preview);
    const own = row.uploadedBy === actor.employeeId;
    return {
      ...preview,
      id: row.id,
      reference: row.reference,
      fileName: row.fileName,
      state: row.state as CompensationBatch["state"],
      uploadedAt: row.uploadedAt.toISOString(),
      uploadedBy: employees.find((person) => person.id === row.uploadedBy)?.name ?? row.uploadedBy,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decidedBy: row.decidedBy
        ? (employees.find((person) => person.id === row.decidedBy)?.name ?? row.decidedBy)
        : null,
      decisionNote: row.decisionNote,
      can: {
        submit: can(actor, "compensation.manage") && own && row.state === "previewed" && preview.totals.errors === 0,
        approve: can(actor, "payroll.approve") && !own && row.state === "submitted",
        discard: can(actor, "compensation.manage") && own && row.state === "previewed",
      },
      selfPrepared: own,
    };
  };
  const service = {
    async uploadFile(
      actor: AuthenticatedActor,
      file: { fileName: string; base64: string },
      key: string | undefined,
      requestId: string,
    ) {
      requireCapability(actor, "compensation.manage");
      const bytes = Buffer.from(file.base64, "base64");
      if (bytes.length > 5 * 1024 * 1024)
        throw new AppError(413, "FILE_TOO_LARGE", "Salary imports cannot exceed 5 MB.");
      let parsed: Awaited<ReturnType<typeof readCompensationFile>>;
      try {
        parsed = await readCompensationFile({ name: file.fileName, bytes });
      } catch (error) {
        if (error instanceof ImportFileError)
          throw new AppError(422, "UNREADABLE_FILE", error.message, { fieldErrors: { file: error.message } });
        throw error;
      }
      const invalid = parsed.records.find((row) => row.problem || !row.code || row.ctc === null || !row.effectiveFrom);
      if (invalid)
        throw new AppError(422, "INVALID_IMPORT_ROW", `Check salary import line ${invalid.line}.`, {
          fieldErrors: { file: invalid.problem ?? "Employee code, CTC and effective date are required." },
        });
      const input = compensationUploadSchema.parse({
        fileName: file.fileName,
        records: parsed.records.map((row) => ({
          employeeCode: row.code,
          effectiveFrom: row.effectiveFrom,
          annualCtc: inr(row.ctc ?? 0).amount,
          reason: row.reason ?? "Salary revision import",
        })),
      });
      const result = await service.upload(actor, input, key, requestId);
      return service.import(actor, result.id);
    },
    async structures(
      actor: AuthenticatedActor,
      calc: z.infer<typeof import("./compensation.schema.js").calcQuerySchema>,
    ): Promise<Structures> {
      requirePayroll(actor);
      const data = await loadCalculationData(repository, todayInOrgZone().slice(0, 7));
      const changes = await repository.structureChanges();
      const templateList = data.templates.map((template) => {
        const terms = templateTermsSchema.parse(template.terms);
        const groups = Object.entries(data.policy.assignments)
          .filter(([, id]) => id === template.id)
          .map(([key]) => key);
        return {
          id: template.id,
          name: terms.name,
          description: terms.description,
          version: template.version,
          publishedAt: template.publishedAt.toISOString(),
          publishedBy:
            data.employees.find((employee) => employee.id === template.publishedBy)?.name ?? template.publishedBy,
          basicPctOfCtc: terms.basicPctOfCtc,
          hraPctOfBasic: terms.hraPctOfBasic,
          conveyance: inr(terms.conveyancePaise),
          lta: inr(terms.ltaPaise),
          pf: terms.pf,
          gratuity: terms.gratuity,
          esi: terms.esi,
          stipend: terms.stipend,
          groups,
          employees: data.employees.filter((employee) =>
            groups.includes(
              groupKey(employee.employmentType, Number(currentCtc(data.compensation, employee.id, todayInOrgZone()))),
            ),
          ).length,
          pending: changes.some((change) => change.templateId === template.id && change.state === "pending"),
        };
      });
      const selected = data.templates.find((template) => template.id === calc.template) ?? data.templates[0];
      const terms = selected ? templateTermsSchema.parse(selected.terms) : null;
      const ctc = calc.ctc ?? "1200000";
      const annual = paiseFromAmount(ctc);
      const state = calc.state ?? Object.keys(data.policy.states)[0] ?? "";
      const regime = calc.regime ?? "new";
      const full = terms ? structure(annual, terms, data.policy) : null;
      const tax = full
        ? annualTax(full.gross * 12, regime, data.policy, null, true, full.basic * 12, full.hra * 12).tax
        : 0;
      const calculator: Structures["calculator"] =
        full && terms && selected
          ? {
              annualCtc: inr(annual),
              templateId: selected.id,
              templateName: terms.name,
              stateName: data.policy.states[state] ?? state,
              regime,
              rows: [
                ["BASIC", "Basic salary", full.basic],
                ["HRA", "House rent allowance", full.hra],
                ["SPECIAL", "Special allowance", full.special],
                ["CONVEYANCE", "Conveyance", full.conveyance],
                ["LTA", "Leave travel allowance", full.lta],
                ["STIPEND", "Stipend", full.stipend],
              ]
                .filter(([, , value]) => Number(value) > 0)
                .map(([code, name, value]) => ({
                  code: String(code),
                  name: String(name),
                  kind: "earning",
                  monthly: inr(Number(value)),
                  annual: inr(Number(value) * 12),
                  note: null,
                })),
              gross: { monthly: inr(full.gross), annual: inr(full.gross * 12) },
              employerCost: {
                monthly: inr(full.pf + full.esi + full.gratuity),
                annual: inr((full.pf + full.esi + full.gratuity) * 12),
              },
              deductions: { monthly: inr(Math.round(tax / 12) + full.pf), annual: inr(tax + full.pf * 12) },
              takeHome: {
                monthly: inr(full.gross - Math.round(tax / 12) - full.pf),
                annual: inr(full.gross * 12 - tax - full.pf * 12),
              },
              annualTax: inr(tax),
              warnings: [data.policy.policyLabel, ...(full.overflow ? ["The configured components exceed CTC."] : [])],
            }
          : null;
      const dto = {
        templates: templateList,
        assignments: Object.entries(data.policy.assignments).map(([key, templateId]) => ({
          key,
          label: key,
          templateId,
          templateName: templateList.find((template) => template.id === templateId)?.name ?? templateId,
          employees: data.employees.filter(
            (employee) =>
              groupKey(
                employee.employmentType,
                Number(currentCtc(data.compensation, employee.id, todayInOrgZone())),
              ) === key,
          ).length,
          pending: changes.some(
            (change) =>
              change.kind === "assignment" &&
              change.state === "pending" &&
              assignmentProposalSchema.parse(change.input).groupKey === key,
          ),
        })),
        changes: changes.flatMap((change) => {
          const employee = data.employees.find((row) => row.id === change.preparedBy);
          if (!employee) return [];
          const input =
            change.kind === "template"
              ? structureProposalSchema.parse(change.input)
              : assignmentProposalSchema.parse(change.input);
          const targetTemplate = data.templates.find((row) => row.id === change.templateId);
          const affected = data.employees.filter((person) => {
            const group = groupKey(
              person.employmentType,
              Number(currentCtc(data.compensation, person.id, todayInOrgZone())),
            );
            return "groupKey" in input
              ? group === input.groupKey
              : data.policy.assignments[group] === change.templateId;
          });
          const monthlyGrossDelta = affected.reduce((sum, person) => {
            const annualCtc = Number(currentCtc(data.compensation, person.id, todayInOrgZone()));
            if (!annualCtc || !targetTemplate) return sum;
            const previous = templateFor(person, annualCtc, data.templates, data.policy);
            const target = templateTermsSchema.parse(targetTemplate.terms);
            const proposed =
              "basicPctOfCtc" in input
                ? {
                    ...target,
                    basicPctOfCtc: input.basicPctOfCtc,
                    hraPctOfBasic: input.hraPctOfBasic,
                    conveyancePaise: paiseFromAmount(input.conveyance),
                    ltaPaise: paiseFromAmount(input.lta),
                    pf: input.pf === "yes",
                    gratuity: input.gratuity === "yes",
                  }
                : target;
            const optOut = data.profiles.find((profile) => profile.employeeId === person.id)?.pfOptOut;
            return (
              sum +
              structure(annualCtc, proposed, data.policy, optOut).gross -
              structure(annualCtc, previous, data.policy, optOut).gross
            );
          }, 0);
          return [
            {
              id: change.id,
              reference: change.reference,
              kind: change.kind,
              templateId: change.templateId,
              templateName:
                templateList.find((template) => template.id === change.templateId)?.name ?? change.templateId,
              summary: change.kind === "template" ? "Salary template change" : "Salary group assignment",
              diff: Object.entries(input)
                .filter(([key]) => !["idempotencyKey", "reason", "templateId"].includes(key))
                .map(([label, value]) => ({ label, from: "Current configuration", to: String(value) })),
              impact: {
                employees: affected.length,
                monthlyGrossDelta: inr(monthlyGrossDelta),
              },
              reason: input.reason,
              preparedBy: personRef(employee),
              preparedAt: change.preparedAt.toISOString(),
              state: change.state,
              decidedBy: change.decidedBy
                ? (data.employees.find((row) => row.id === change.decidedBy)?.name ?? change.decidedBy)
                : null,
              decidedAt: change.decidedAt?.toISOString() ?? null,
              decisionNote: change.decisionNote,
              canDecide:
                can(actor, "payroll.approve") && change.preparedBy !== actor.employeeId && change.state === "pending",
              canWithdraw: change.preparedBy === actor.employeeId && change.state === "pending",
              blockedReason:
                change.preparedBy === actor.employeeId ? "A different approver must decide this change." : null,
            },
          ];
        }),
        calculator,
        calculatorInput: { ctc, templateId: selected?.id ?? "", state, regime },
        stateOptions: Object.entries(data.policy.states).map(([value, label]) => ({ value, label })),
        canPrepare: can(actor, "compensation.manage"),
        canApprove: can(actor, "payroll.approve"),
      };
      return structuresSchema.parse(dto);
    },
    propose(
      actor: AuthenticatedActor,
      kind: "template" | "assignment",
      input: StructureProposal | AssignmentProposal,
      key: string | undefined,
      requestId: string,
    ) {
      requireCapability(actor, "compensation.manage");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key, command: `structure.propose:${kind}:${input.templateId}` },
        async (tx) => {
          const repo = createCompensationRepository(tx);
          await repo.lock(`structure:${input.templateId}`);
          if (!(await repo.template(input.templateId)))
            throw new AppError(404, "NOT_FOUND", "Salary template not found.");
          if (
            (await repo.structureChanges()).some(
              (change) => change.templateId === input.templateId && change.kind === kind && change.state === "pending",
            )
          )
            throw new AppError(409, "CHANGE_PENDING", "This template already has a pending change.");
          if (kind === "assignment") {
            const policy = loadPolicy((await repo.configuration())?.settings);
            if (!(assignmentProposalSchema.parse(input).groupKey in policy.assignments))
              throw new AppError(422, "INVALID_GROUP", "Choose a configured salary group.");
          }
          const reference = await nextReference(tx, "SC", todayInOrgZone());
          const id = newId("sc");
          await repo.addStructureChange({
            id,
            reference,
            kind,
            templateId: input.templateId,
            input: json(input),
            preparedBy: actor.employeeId,
          });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: "Salary structure proposed",
            entity: "pay_structure",
            entityId: id,
            requestId,
            details: { kind },
          });
          return { reference };
        },
      );
    },
    decideStructure(
      actor: AuthenticatedActor,
      id: string,
      decision: "approve" | "reject" | "withdraw",
      note: string,
      requestId: string,
    ) {
      requireCapability(actor, decision === "withdraw" ? "compensation.manage" : "payroll.approve");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key: undefined, command: `structure.${decision}:${id}` },
        async (tx) => {
          const repo = createCompensationRepository(tx);
          await repo.lock(`structure:${id}`);
          const change = await repo.structureChange(id);
          if (!change) throw new AppError(404, "NOT_FOUND", "Structure change not found.");
          if (change.state !== "pending") throw new AppError(409, "INVALID_STATE", "This change was already decided.");
          if (decision === "withdraw" ? change.preparedBy !== actor.employeeId : change.preparedBy === actor.employeeId)
            throw new AppError(403, "SELF_APPROVAL", "A separate approver must decide prepared changes.");
          if (decision === "reject" && note.length < 3)
            throw new AppError(400, "VALIDATION_ERROR", "Add a rejection reason.");
          if (decision === "approve") {
            if (change.kind === "template") {
              const input = structureProposalSchema.parse(change.input);
              const template = await repo.template(change.templateId);
              const terms = templateTermsSchema.parse(template?.terms);
              await repo.saveTemplate(
                change.templateId,
                json({
                  ...terms,
                  basicPctOfCtc: input.basicPctOfCtc,
                  hraPctOfBasic: input.hraPctOfBasic,
                  conveyancePaise: paiseFromAmount(input.conveyance),
                  ltaPaise: paiseFromAmount(input.lta),
                  pf: input.pf === "yes",
                  gratuity: input.gratuity === "yes",
                }),
                actor.employeeId,
              );
            } else {
              const input = assignmentProposalSchema.parse(change.input);
              const policy = loadPolicy((await repo.configuration())?.settings);
              policy.assignments[input.groupKey] = input.templateId;
              await repo.saveConfiguration(json(policy));
            }
          }
          const state = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "withdrawn";
          await repo.updateStructureChange(id, {
            state,
            decidedBy: actor.employeeId,
            decidedAt: new Date(),
            decisionNote: note,
          });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: `Salary structure ${state}`,
            entity: "pay_structure",
            entityId: id,
            requestId,
            details: {},
          });
          return { state };
        },
      );
    },
    async listImports(actor: AuthenticatedActor) {
      requirePayroll(actor);
      return Promise.all((await repository.imports()).map((row) => batchDto(actor, row)));
    },
    async import(actor: AuthenticatedActor, id: string) {
      requirePayroll(actor);
      const batch = await repository.import(id);
      if (!batch) throw new AppError(404, "NOT_FOUND", "Salary import not found.");
      return batchDto(actor, batch);
    },
    upload(
      actor: AuthenticatedActor,
      input: z.infer<typeof compensationUploadSchema>,
      key: string | undefined,
      requestId: string,
    ) {
      requireCapability(actor, "compensation.manage");
      return idempotent(prisma, { actorId: actor.employeeId, key, command: "compensation.import" }, async (tx) => {
        const repo = createCompensationRepository(tx);
        const data = await loadCalculationData(repo, todayInOrgZone().slice(0, 7));
        const seen = new Set<string>();
        const rows: CompensationBatch["rows"] = input.records.map((record, index) => {
          const employee = data.employees.find((row) => row.code === record.employeeCode);
          const current = employee ? Number(currentCtc(data.compensation, employee.id, record.effectiveFrom)) : 0;
          const annual = paiseFromAmount(record.annualCtc);
          const duplicateKey = `${record.employeeCode}:${record.effectiveFrom}`;
          const duplicate = seen.has(duplicateKey);
          seen.add(duplicateKey);
          const error = !employee || annual <= 0;
          const percent = current ? ((annual - current) / current) * 100 : 0;
          const full =
            employee && !error
              ? structure(annual, templateFor(employee, annual, data.templates, data.policy), data.policy)
              : null;
          return {
            line: index + 2,
            employeeCode: record.employeeCode,
            employeeName: employee?.name ?? null,
            effectiveFrom: record.effectiveFrom,
            currentCtc: employee ? inr(current) : null,
            newCtc: inr(annual),
            changePercent: current ? percent.toFixed(1) : null,
            basic: full ? inr(full.basic) : null,
            hra: full ? inr(full.hra) : null,
            special: full ? inr(full.special) : null,
            reason: record.reason,
            status:
              error || full?.overflow ? "error" : duplicate ? "duplicate" : Math.abs(percent) > 40 ? "warning" : "ok",
            message: error
              ? "Unknown employee or invalid salary."
              : full?.overflow
                ? "Components exceed CTC."
                : duplicate
                  ? "Duplicate employee effective date."
                  : Math.abs(percent) > 40
                    ? "Large salary change requires review."
                    : null,
          };
        });
        const valid = rows.filter((row) => ["ok", "warning"].includes(row.status));
        const preview = {
          columns: [
            { field: "employeeCode", header: "Employee code" },
            { field: "annualCtc", header: "Annual CTC" },
            { field: "effectiveFrom", header: "Effective from" },
          ],
          rows,
          totals: {
            rows: rows.length,
            ok: rows.filter((row) => row.status === "ok").length,
            warnings: rows.filter((row) => row.status === "warning").length,
            duplicates: rows.filter((row) => row.status === "duplicate").length,
            errors: rows.filter((row) => row.status === "error").length,
            annualImpact: inr(
              valid.reduce(
                (sum, row) =>
                  sum + paiseFromAmount(row.newCtc?.amount ?? "0") - paiseFromAmount(row.currentCtc?.amount ?? "0"),
                0,
              ),
            ),
            scheduled: valid.filter((row) => (row.effectiveFrom ?? "") > todayInOrgZone()).length,
            retroactive: valid.filter((row) => (row.effectiveFrom ?? "") < todayInOrgZone()).length,
          },
        };
        const id = newId("ci");
        const reference = await nextReference(tx, "CI", todayInOrgZone());
        await repo.addImport({
          id,
          reference,
          fileName: input.fileName,
          uploadedBy: actor.employeeId,
          preview: json(preview),
        });
        await recordAuditEvent(tx, {
          actorEmployeeId: actor.employeeId,
          action: "Salary import previewed",
          entity: "pay_import",
          entityId: id,
          requestId,
          details: { reference, rows: rows.length },
        });
        return { id, reference };
      });
    },
    decideImport(
      actor: AuthenticatedActor,
      id: string,
      decision: "submit" | "approve" | "reject" | "discard",
      reason: string,
      key: string | undefined,
      requestId: string,
    ) {
      requireCapability(actor, ["approve", "reject"].includes(decision) ? "payroll.approve" : "compensation.manage");
      return idempotent(
        prisma,
        { actorId: actor.employeeId, key, command: `compensation.${decision}:${id}` },
        async (tx) => {
          const repo = createCompensationRepository(tx);
          await repo.lock(`import:${id}`);
          const batch = await repo.import(id);
          if (!batch) throw new AppError(404, "NOT_FOUND", "Salary import not found.");
          const own = batch.uploadedBy === actor.employeeId;
          if (["submit", "discard"].includes(decision) ? !own : own)
            throw new AppError(403, "SELF_APPROVAL", "Salary imports need an independent approver.");
          if (["submit", "discard"].includes(decision) ? batch.state !== "previewed" : batch.state !== "submitted")
            throw new AppError(409, "INVALID_STATE", "This import changed state.");
          const preview = compensationBatchSchema
            .pick({ rows: true, totals: true, columns: true })
            .parse(batch.preview);
          if (decision === "submit" && (preview.totals.errors > 0 || preview.totals.duplicates > 0))
            throw new AppError(422, "IMPORT_ERRORS", "Resolve invalid and duplicate rows before submission.");
          if (decision === "approve") {
            const employees = await repo.employees();
            for (const row of preview.rows.filter((row) => ["ok", "warning"].includes(row.status))) {
              const employee = employees.find((person) => person.code === row.employeeCode);
              if (!employee || !row.effectiveFrom || !row.newCtc)
                throw new AppError(409, "STALE_IMPORT", "An employee in this import is no longer available.");
              const history = await repo.compensations(employee.id);
              const previous = currentCtc(history, employee.id, row.effectiveFrom);
              if (previous !== BigInt(paiseFromAmount(row.currentCtc?.amount ?? "0")))
                throw new AppError(
                  409,
                  "STALE_COMPENSATION",
                  "Compensation changed after preview. Upload a fresh preview.",
                );
              await repo.createCompensation({
                id: newId("pc"),
                employeeId: employee.id,
                effectiveFrom: fromIsoDate(row.effectiveFrom),
                annualPaise: BigInt(paiseFromAmount(row.newCtc.amount)),
                previousPaise: previous,
                reason: row.reason ?? "Salary import",
                reference: batch.reference,
                batchId: id,
              });
            }
          }
          const state = { submit: "submitted", approve: "approved", reject: "rejected", discard: "discarded" }[
            decision
          ];
          await repo.updateImport(id, {
            state,
            ...(decision === "submit"
              ? { submittedAt: new Date() }
              : { decidedBy: actor.employeeId, decidedAt: new Date(), decisionNote: reason }),
          });
          await recordAuditEvent(tx, {
            actorEmployeeId: actor.employeeId,
            action: `Salary import ${state}`,
            entity: "pay_import",
            entityId: id,
            requestId,
            details: { reference: batch.reference },
          });
          return { reference: batch.reference, state, ok: true };
        },
      );
    },
  };
  return service;
}
export type CompensationService = ReturnType<typeof createCompensationService>;
