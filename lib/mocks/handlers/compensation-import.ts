import "server-only";
import { createHash } from "node:crypto";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant } from "@/lib/mocks/store";
import { personas } from "@/lib/mocks/seed/people";
import { inr } from "@/lib/mocks/seed/random";
import { notify } from "@/lib/mocks/handlers/notifications";
import { can, me, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import { addDays, addMonths } from "@/lib/utils/date";
import type { CompensationFile } from "@/lib/server/imports/compensation-file";
import type { CompensationBatch, CompensationBatchSummary, CompensationRow } from "@/types/compensation-import";

/*
 * MOCK compensation import with maker/checker. Amounts are exact paise.
 * The live service owns the compensation ledger, arrears and payroll inputs.
 */

export interface MockCompensationRevision {
  effectiveFrom: string;
  previousPaise: number;
  newPaise: number;
  basicPaise: number | null;
  hraPaise: number | null;
  specialPaise: number | null;
  reason: string;
  batchId: string;
  reference: string;
  approvedBy: string;
  applied: boolean;
}
interface MockRow extends Omit<CompensationRow, "currentCtc" | "newCtc" | "basic" | "hra" | "special"> {
  employeeId: string | null;
  currentPaise: number | null;
  newPaise: number | null;
  basicPaise: number | null;
  hraPaise: number | null;
  specialPaise: number | null;
}
export interface MockCompensationBatch {
  id: string;
  reference: string;
  fileName: string;
  digest: string;
  state: CompensationBatch["state"];
  uploadedAt: string;
  uploadedById: string;
  uploadedBy: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  columns: { field: string; header: string }[];
  rows: MockRow[];
}

const canView = (actor: MockActor) => can(actor, "compensation.manage") || can(actor, "payroll.approve");
function requireView(actor: MockActor) {
  if (!canView(actor)) throw problem(403, "FORBIDDEN", "You don't have access to this.");
}

const MAX_CTC_PAISE = 10_00_00_000 * 100; // ₹10 crore sanity cap
const money = (paise: number | null) => (paise === null ? null : inr(paise));

/** Applies approved revisions whose effective date has arrived. */
export function applyDueCompensation() {
  const store = db();
  for (const [employeeId, revisions] of store.compensationHistory) {
    const employee = employeeById(employeeId);
    if (!employee) continue;
    for (const revision of revisions.filter((item) => !item.applied && item.effectiveFrom <= store.today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) {
      employee.annualCtc = Math.round(revision.newPaise / 100);
      revision.applied = true;
    }
  }
}

function resolver() {
  const byKey = new Map<string, string>();
  for (const employee of db().employees) {
    const number = employee.code.replace(/\D/g, "");
    byKey.set(employee.code.toUpperCase(), employee.id);
    byKey.set(number, employee.id);
    byKey.set(String(Number(number) - 1000), employee.id);
  }
  return (code: string) => byKey.get(code.toUpperCase()) ?? byKey.get(code.replace(/^0+/, "")) ?? null;
}

export function previewCompensation(actor: MockActor, file: { name: string; bytes: Buffer }, parsed: CompensationFile) {
  requireCapability(actor, "compensation.manage");
  applyDueCompensation();
  const store = db();
  const find = resolver();
  const seen = new Set<string>();
  const defaultEffective = `${store.today.slice(0, 7)}-01`;
  const earliest = `${addMonths(store.today.slice(0, 7), -12)}-01`;
  const latest = addDays(store.today, 183);

  const rows: MockRow[] = parsed.records.map((record) => {
    const base: MockRow = {
      line: record.line,
      employeeCode: record.code || "—",
      employeeName: record.name,
      employeeId: null,
      effectiveFrom: record.effectiveFrom ?? (parsed.hasEffectiveColumn ? null : defaultEffective),
      currentPaise: null,
      newPaise: record.ctc,
      changePercent: null,
      basicPaise: record.basic,
      hraPaise: record.hra,
      specialPaise: record.special,
      reason: record.reason,
      status: "ok",
      message: null,
    };
    const fail = (message: string): MockRow => ({ ...base, status: "error", message });
    if (!record.code) return fail("Missing employee code");
    if (record.problem) return fail(record.problem);
    const employeeId = find(record.code);
    const employee = employeeId ? employeeById(employeeId) : undefined;
    if (!employee) return fail("Unknown employee code — not imported");
    const named: MockRow = { ...base, employeeId: employee.id, employeeName: employee.name, currentPaise: employee.annualCtc > 0 ? employee.annualCtc * 100 : null };
    const effective = named.effectiveFrom;
    if (employee.status === "exited") return { ...named, status: "error", message: "Employee has exited" };
    if (!effective) return { ...named, status: "error", message: "Missing effective date" };
    if (effective < employee.joinedOn) return { ...named, status: "error", message: "Effective before the joining date" };
    if (effective < earliest) return { ...named, status: "error", message: "More than 12 months back — raise a correction with Finance" };
    if (effective > latest) return { ...named, status: "error", message: "More than 6 months ahead" };
    const ctc = record.ctc ?? 0;
    if (ctc <= 0 || ctc > MAX_CTC_PAISE) return { ...named, status: "error", message: "CTC must be between ₹1 and ₹10 crore" };
    const parts = [record.basic, record.hra, record.special].reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (parts > ctc) return { ...named, status: "error", message: "Basic + HRA + special allowance exceed the CTC" };
    if (seen.has(employee.id)) return { ...named, status: "duplicate", message: "Employee appears earlier in this sheet — skipped" };
    seen.add(employee.id);
    const history = store.compensationHistory.get(employee.id) ?? [];
    if (history.some((item) => item.effectiveFrom === effective && item.newPaise === ctc) || (named.currentPaise === ctc && effective <= store.today))
      return { ...named, status: "duplicate", message: "Same as the current salary — skipped" };
    if (store.compensationBatches.some((batch) => batch.state === "submitted" && batch.rows.some((row) => row.employeeId === employee.id && row.status !== "error" && row.status !== "duplicate")))
      return { ...named, status: "error", message: "Another submitted batch already changes this employee — decide that first" };

    const notes: string[] = [];
    const current = named.currentPaise;
    const change = current ? ((ctc - current) / current) * 100 : null;
    if (current === null) notes.push("First salary for this employee — payroll starts including them");
    if (change !== null && change < 0) notes.push("Salary decrease — needs documented consent");
    else if (change !== null && change > 30) notes.push(`Large increase (${change.toFixed(1)}%)`);
    if (record.basic !== null && record.basic * 2 < ctc) notes.push("Basic below 50% of CTC — check wage-code rules");
    if (effective < defaultEffective) notes.push("Retroactive — arrears go to the next payroll run");
    if (effective > store.today) notes.push("Scheduled — applies on the effective date");
    return { ...named, changePercent: change === null ? null : change.toFixed(1), status: notes.length ? "warning" : "ok", message: notes.join(" · ") || null };
  });

  for (const other of store.compensationBatches) if (other.state === "previewed" && other.uploadedById === actor.employeeId) other.state = "discarded";
  const reference = nextReference("CMP");
  const batch: MockCompensationBatch = {
    id: `cmp_${store.counter}`,
    reference,
    fileName: file.name,
    digest: createHash("sha256").update(file.bytes).digest("hex"),
    state: "previewed",
    uploadedAt: nowInstant(),
    uploadedById: actor.employeeId,
    uploadedBy: me(actor).name,
    submittedAt: null,
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
    columns: parsed.columns,
    rows,
  };
  store.compensationBatches.unshift(batch);
  return { id: batch.id, reference };
}

const importable = (row: MockRow) => row.status === "ok" || row.status === "warning";

function totals(batch: MockCompensationBatch, today: string) {
  const rows = batch.rows;
  const count = (status: MockRow["status"]) => rows.filter((row) => row.status === status).length;
  const good = rows.filter(importable);
  return {
    rows: rows.length,
    ok: count("ok"),
    warnings: count("warning"),
    duplicates: count("duplicate"),
    errors: count("error"),
    annualImpact: inr(good.reduce((sum, row) => sum + ((row.newPaise ?? 0) - (row.currentPaise ?? 0)), 0)),
    scheduled: good.filter((row) => (row.effectiveFrom ?? "") > today).length,
    retroactive: good.filter((row) => (row.effectiveFrom ?? "") < `${today.slice(0, 7)}-01`).length,
  };
}

function summary(batch: MockCompensationBatch): CompensationBatchSummary {
  const { digest: _d, rows: _r, columns: _c, uploadedById: _u, ...rest } = batch;
  return { ...rest, totals: totals(batch, db().today) };
}

const order: Record<MockRow["status"], number> = { error: 0, warning: 1, duplicate: 2, ok: 3 };

export function getCompensationBatch(actor: MockActor, id: string): CompensationBatch {
  requireView(actor);
  const batch = db().compensationBatches.find((item) => item.id === id);
  // Approvers never see other operators' unsubmitted previews.
  if (!batch || (batch.state === "previewed" && batch.uploadedById !== actor.employeeId)) throw problem(404, "NOT_FOUND", "That batch no longer exists.");
  const self = batch.uploadedById === actor.employeeId;
  return {
    ...summary(batch),
    columns: batch.columns,
    rows: [...batch.rows]
      .sort((a, b) => order[a.status] - order[b.status] || a.line - b.line)
      .slice(0, 300)
      .map(({ employeeId: _e, currentPaise, newPaise, basicPaise, hraPaise, specialPaise, ...row }) => ({ ...row, currentCtc: money(currentPaise), newCtc: money(newPaise), basic: money(basicPaise), hra: money(hraPaise), special: money(specialPaise) })),
    can: {
      submit: batch.state === "previewed" && self && can(actor, "compensation.manage") && batch.rows.some(importable),
      approve: batch.state === "submitted" && !self && can(actor, "payroll.approve"),
      discard: batch.state === "previewed" && self,
    },
    selfPrepared: self,
  };
}

export function listCompensationBatches(actor: MockActor): CompensationBatchSummary[] {
  requireView(actor);
  return db()
    .compensationBatches.filter((batch) => batch.state !== "previewed" || batch.uploadedById === actor.employeeId)
    .slice(0, 25)
    .map(summary);
}

export function decideCompensation(actor: MockActor, input: { batchId: string; decision: "submit" | "approve" | "reject"; note: string }) {
  requireView(actor);
  const store = db();
  const batch = store.compensationBatches.find((item) => item.id === input.batchId);
  if (!batch) throw problem(404, "NOT_FOUND", "That batch no longer exists.");
  const self = batch.uploadedById === actor.employeeId;

  if (input.decision === "submit") {
    requireCapability(actor, "compensation.manage");
    if (!self) throw problem(403, "FORBIDDEN", "Only the preparer can submit this batch.");
    if (batch.state !== "previewed") throw problem(409, "ALREADY_SUBMITTED", "This batch was already submitted.");
    if (!batch.rows.some(importable)) throw problem(422, "NOTHING_TO_IMPORT", "No valid rows to submit.");
    batch.state = "submitted";
    batch.submittedAt = nowInstant();
    for (const persona of Object.values(personas))
      if (persona.roles.includes("payroll_approver") && persona.employeeId !== actor.employeeId)
        notify(persona.employeeId, "payroll", "Salary changes awaiting approval", `${batch.reference}: ${batch.rows.filter(importable).length} employees`, `/payroll/compensation?batch=${batch.id}`);
    return { reference: batch.reference, state: batch.state };
  }

  requireCapability(actor, "payroll.approve");
  if (self) throw problem(403, "SELF_APPROVAL", "You prepared this batch — an independent approver must decide.");
  if (batch.state !== "submitted") throw problem(409, "ALREADY_DECIDED", "This batch isn't awaiting approval.");
  batch.decidedAt = nowInstant();
  batch.decidedBy = me(actor).name;
  batch.decisionNote = input.note || null;
  if (input.decision === "reject") {
    batch.state = "rejected";
    notify(batch.uploadedById, "payroll", "Salary batch rejected", `${batch.reference}: ${input.note}`, `/payroll/compensation?batch=${batch.id}`);
    return { reference: batch.reference, state: batch.state };
  }
  for (const row of batch.rows.filter(importable)) {
    if (!row.employeeId || row.newPaise === null || !row.effectiveFrom) continue;
    const list = store.compensationHistory.get(row.employeeId) ?? [];
    list.push({
      effectiveFrom: row.effectiveFrom,
      previousPaise: row.currentPaise ?? 0,
      newPaise: row.newPaise,
      basicPaise: row.basicPaise,
      hraPaise: row.hraPaise,
      specialPaise: row.specialPaise,
      reason: row.reason ?? "Compensation revision",
      batchId: batch.id,
      reference: batch.reference,
      approvedBy: batch.decidedBy ?? "",
      applied: false,
    });
    store.compensationHistory.set(row.employeeId, list);
  }
  batch.state = "approved";
  applyDueCompensation();
  notify(batch.uploadedById, "payroll", "Salary batch approved", `${batch.reference} applied.`, `/payroll/compensation?batch=${batch.id}`);
  return { reference: batch.reference, state: batch.state };
}

export function discardCompensation(actor: MockActor, id: string) {
  requireCapability(actor, "compensation.manage");
  const batch = db().compensationBatches.find((item) => item.id === id && item.uploadedById === actor.employeeId);
  if (!batch) throw problem(404, "NOT_FOUND", "That batch no longer exists.");
  if (batch.state !== "previewed") throw problem(409, "NOT_OPEN", "Only an unsubmitted preview can be discarded.");
  batch.state = "discarded";
  return { ok: true };
}
