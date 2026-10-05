import "server-only";
import { createHash } from "node:crypto";
import { problem } from "@/lib/api/core/problem";
import { db, employeeById, nextReference, nowInstant } from "@/lib/mocks/store";
import { isOffDay } from "@/lib/mocks/handlers/roster";
import { isHoliday, leaveTypes } from "@/lib/mocks/handlers/config";
import { me, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import { isWeekend } from "@/lib/utils/date";
import type { ParsedFile } from "@/types/import-files";
import type { ImportBatch, ImportBatchSummary, ImportRow } from "@/types/attendance-import";

/*
 * MOCK staged import. The live service stores raw device events immutably and
 * derives attendance from them; here committed rows override the synthetic
 * attendance for those days. Nothing changes until HR commits a preview.
 */

const PREVIEW_ROWS = 300;

export interface MockImportBatch extends Omit<ImportBatch, "rows"> {
  digest: string;
  allRows: ImportRow[];
}

/** Device code → employee: exact code (GTF-1007) or its number (1007 / 0007). */
function resolver() {
  const byKey = new Map<string, { id: string; name: string; joinedOn: string; status: string }>();
  for (const employee of db().employees) {
    const number = employee.code.replace(/\D/g, "");
    byKey.set(employee.code.toUpperCase(), employee);
    byKey.set(number, employee);
    byKey.set(String(Number(number) - 1000), employee);
  }
  return (code: string) => byKey.get(code.toUpperCase()) ?? byKey.get(code.replace(/^0+/, "")) ?? null;
}

export function previewImport(actor: MockActor, file: { name: string; digest: string }, parsed: ParsedFile) {
  requireCapability(actor, "import.commit");
  const store = db();
  const find = resolver();
  const seen = new Set<string>();
  const wfhTypes = new Set(leaveTypes().filter((type) => type.countsAsPresent).map((type) => type.id));
  const alreadyCommitted = store.importBatches.some((batch) => batch.digest === file.digest && batch.state === "committed");

  const rows: ImportRow[] = parsed.records.map((record) => {
    const base = { line: record.line, employeeCode: record.code || "—", employeeName: record.name, date: record.date, firstIn: record.firstIn, lastOut: record.lastOut };
    const fail = (message: string): ImportRow => ({ ...base, status: "error", message });
    if (!record.code) return fail("Missing employee code");
    if (record.problem) return fail(record.problem);
    const employee = find(record.code);
    if (!employee) return fail("Unknown employee code — quarantined, not imported");
    const named = { ...base, employeeName: employee.name };
    if (!record.date) return { ...named, status: "error", message: "Unreadable date" };
    if (record.date > store.today) return { ...named, status: "error", message: "Date is in the future" };
    if (record.date < employee.joinedOn) return { ...named, status: "error", message: "Before the joining date" };
    if (employee.status === "exited") return { ...named, status: "error", message: "Employee has exited" };
    if (!record.firstIn && !record.lastOut) return { ...named, status: "error", message: "No in or out time" };
    if (record.firstIn && record.lastOut && record.lastOut <= record.firstIn) return { ...named, status: "error", message: "Out time is before in time (overnight shifts need roster support)" };
    const key = `${employee.id}|${record.date}`;
    if (seen.has(key)) return { ...named, status: "duplicate", message: "Same employee and date appears earlier in this file — skipped" };
    seen.add(key);
    const existing = store.devicePunches.get(key);
    if (alreadyCommitted || (existing && existing.in === record.firstIn && existing.out === record.lastOut))
      return { ...named, status: "duplicate", message: "Already imported — skipped" };
    const notes: string[] = [];
    if (existing) notes.push(`Replaces earlier device record ${existing.in ?? "—"}–${existing.out ?? "—"}`);
    if (!record.lastOut) notes.push("No check-out — will need review");
    const person = employeeById(employee.id);
    if (person ? isOffDay(person, record.date) : isWeekend(record.date) || isHoliday(record.date)) notes.push("Week-off/holiday work — employee can claim comp-off");
    const onRequest = store.leaveRequests.find((request) => request.employeeId === employee.id && request.state === "approved" && request.startDate <= record.date! && request.endDate >= record.date!);
    if (onRequest) notes.push(wfhTypes.has(onRequest.leaveTypeId) ? "Approved WFH that day — office punch recorded too" : "Approved leave that day — review with the employee");
    return { ...named, status: notes.length ? "warning" : "ok", message: notes.join(" · ") || null };
  });

  const count = (status: ImportRow["status"]) => rows.filter((row) => row.status === status).length;
  const dates = rows.flatMap((row) => (row.date && row.status !== "error" ? [row.date] : [])).sort();
  const reference = nextReference("IMP");
  const batch: MockImportBatch = {
    id: `imp_${store.counter}`,
    reference,
    fileName: file.name,
    format: parsed.format,
    state: "previewed",
    uploadedAt: nowInstant(),
    uploadedBy: me(actor).name,
    committedAt: null,
    dateRange: dates.length ? { from: dates[0] ?? "", to: dates.at(-1) ?? "" } : null,
    columns: parsed.columns,
    totals: {
      rows: rows.length,
      ok: count("ok"),
      warnings: count("warning"),
      duplicates: count("duplicate"),
      errors: count("error"),
      employees: new Set(rows.filter((row) => row.status === "ok" || row.status === "warning").map((row) => row.employeeCode)).size,
    },
    digest: file.digest,
    allRows: rows,
  };
  // Keep one open preview at a time; older previews are discarded.
  for (const other of store.importBatches) if (other.state === "previewed") other.state = "discarded";
  store.importBatches.unshift(batch);
  return { id: batch.id, reference };
}

const severity: Record<ImportRow["status"], number> = { error: 0, warning: 1, duplicate: 2, ok: 3 };

function toDto(batch: MockImportBatch): ImportBatch {
  const { digest: _digest, allRows, ...rest } = batch;
  return { ...rest, rows: [...allRows].sort((a, b) => severity[a.status] - severity[b.status] || a.line - b.line).slice(0, PREVIEW_ROWS) };
}

export function getImportBatch(actor: MockActor, id: string): ImportBatch {
  requireCapability(actor, "import.commit");
  const batch = db().importBatches.find((item) => item.id === id);
  if (!batch) throw problem(404, "NOT_FOUND", "That import no longer exists.");
  return toDto(batch);
}

export function listImportBatches(actor: MockActor): ImportBatchSummary[] {
  requireCapability(actor, "import.commit");
  return db()
    .importBatches.slice(0, 20)
    .map(({ digest: _digest, allRows: _rows, columns: _columns, ...rest }) => rest);
}

export function commitImport(actor: MockActor, id: string) {
  requireCapability(actor, "import.commit");
  const store = db();
  const batch = store.importBatches.find((item) => item.id === id);
  if (!batch) throw problem(404, "NOT_FOUND", "That import no longer exists.");
  if (batch.state === "committed") throw problem(409, "ALREADY_COMMITTED", "This import was already committed. Nothing was imported twice.");
  if (batch.state === "discarded") throw problem(409, "PREVIEW_EXPIRED", "This preview was replaced. Upload the file again.");
  const find = resolver();
  let applied = 0;
  for (const row of batch.allRows) {
    if ((row.status !== "ok" && row.status !== "warning") || !row.date) continue;
    const employee = find(row.employeeCode);
    if (!employee) continue;
    store.devicePunches.set(`${employee.id}|${row.date}`, { in: row.firstIn, out: row.lastOut, batchId: batch.id });
    applied += 1;
  }
  batch.state = "committed";
  batch.committedAt = nowInstant();
  return { reference: batch.reference, applied };
}

export function discardImport(actor: MockActor, id: string) {
  requireCapability(actor, "import.commit");
  const batch = db().importBatches.find((item) => item.id === id);
  if (!batch) throw problem(404, "NOT_FOUND", "That import no longer exists.");
  if (batch.state !== "previewed") throw problem(409, "NOT_OPEN", "Only an open preview can be discarded.");
  batch.state = "discarded";
  return { ok: true };
}

export function digestOf(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
