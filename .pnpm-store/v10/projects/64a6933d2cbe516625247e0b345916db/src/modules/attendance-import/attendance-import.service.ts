import { required } from "../time/time.service.js";
import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { newId } from "../../core/database/ids.js";
import { z } from "zod";

import { todayInOrgZone, zonedInstant, daysBetween } from "../../utils/date.js";
import { importBatchSchema, type ImportBatch, type ImportRow } from "../../contracts/attendance-import.js";
import { importBody, importUploadBody, rosterPayload } from "../time/time.schema.js";
import { readAttendanceFile, ImportFileError, MAX_IMPORT_BYTES } from "./attendance-file.js";
import { createTimeRepository, timeCommand, type CommandContext } from "../time/time.repository.js";
import { attendanceRules, clockTime, employeeOf, fail, minutesOf, monday } from "../time/time.service.js";
export function createAttendanceImportService(prisma: PrismaClient) {
  const repo = createTimeRepository(prisma);
  return {
    async upload(ctx: CommandContext, input: z.infer<typeof importUploadBody>) {
      const bytes = Buffer.from(input.contentBase64, "base64");
      if (bytes.length > MAX_IMPORT_BYTES) fail("FILE_TOO_LARGE", "Attendance files must be 5 MB or smaller.", 413);
      try {
        const parsed = await readAttendanceFile({ name: input.fileName, bytes });
        if (!parsed.records.length) fail("EMPTY_FILE", "The file contains no attendance rows.");
        const normalized = importBody.parse({
          fileName: input.fileName,
          format: parsed.format,
          records: parsed.records.map((row) => ({
            employeeCode: row.code,
            date: row.date,
            firstIn: row.firstIn,
            lastOut: row.lastOut,
            sourceLine: row.line,
            problem: row.problem,
          })),
        });
        return await createAttendanceImportService(prisma).preview(ctx, normalized, input);
      } catch (error) {
        if (error instanceof ImportFileError) fail("UNREADABLE_FILE", error.message);
        throw error;
      }
    },
    async list() {
      return (await repo.documents("attendance_import")).map((d) => {
        const p = importBatchSchema.parse(d.payload);
        return {
          id: p.id,
          reference: p.reference,
          fileName: p.fileName,
          format: p.format,
          state: p.state,
          uploadedAt: p.uploadedAt,
          uploadedBy: p.uploadedBy,
          committedAt: p.committedAt,
          dateRange: p.dateRange,
          totals: p.totals,
        };
      });
    },
    async get(id: string) {
      const doc = await repo.document(id);
      if (!doc || doc.kind !== "attendance_import") fail("NOT_FOUND", "Import batch was not found.", 404);
      return previewRows(importBatchSchema.parse(doc.payload));
    },
    preview(ctx: CommandContext, input: z.infer<typeof importBody>, rawSource?: z.infer<typeof importUploadBody>) {
      return timeCommand(prisma, ctx, "attendance.import.preview", async (r, reference) => {
        const digest = createHash("sha256").update(JSON.stringify(input.records)).digest("hex"),
          id = `import_${digest}`;
        const previous = await r.document(id);
        if (previous) return previewRows(importBatchSchema.parse(previous.payload));
        const people = await r.people(),
          rows: ImportRow[] = [],
          seen = new Set<string>();
        const inputDates = input.records.flatMap((r) => (r.date ? [r.date] : [])).sort(),
          peopleByCode = new Map(people.map((e) => [e.code, e]));
        const recorded = inputDates.length
            ? await r.attendanceBatch(
                people.map((e) => e.id),
                required(inputDates[0]),
                required(inputDates.at(-1)),
              )
            : [],
          recordsByDay = new Map(recorded.map((r) => [`${r.employeeId}:${r.date}`, r]));
        for (const [index, inputRow] of input.records.entries()) {
          const employee = peopleByCode.get(inputRow.employeeCode),
            key = `${inputRow.employeeCode}:${inputRow.date}`,
            record = employee && inputRow.date ? recordsByDay.get(`${employee.id}:${inputRow.date}`) : null;
          let status: ImportRow["status"] = "ok",
            message: string | null = null;
          if (inputRow.problem || !inputRow.date) {
            status = "error";
            message = inputRow.problem ?? "Invalid attendance date.";
          } else if (!employee) {
            status = "error";
            message = "Employee code is not active.";
          } else if (inputRow.date > todayInOrgZone()) {
            status = "error";
            message = "Future attendance cannot be imported.";
          } else if (!inputRow.firstIn && inputRow.lastOut) {
            status = "error";
            message = "An out punch requires an in punch.";
          } else if (inputRow.firstIn && inputRow.lastOut && inputRow.lastOut <= inputRow.firstIn) {
            status = "error";
            message = "The out time must follow the in time.";
          } else if (seen.has(key)) {
            status = "duplicate";
            message = "Repeated employee/date within this file.";
          } else if (
            record &&
            clockTime(record.firstIn) === inputRow.firstIn &&
            clockTime(record.lastOut) === inputRow.lastOut
          ) {
            status = "duplicate";
            message = "Identical attendance already exists.";
          } else if (record) {
            status = "error";
            message = "Existing attendance differs; use regularization to correct it.";
          } else if (!inputRow.firstIn || !inputRow.lastOut) {
            status = "warning";
            message = "Incomplete attendance needs review.";
          }
          seen.add(key);
          rows.push({
            line: inputRow.sourceLine ?? index + 2,
            employeeCode: inputRow.employeeCode,
            employeeName: employee?.name ?? null,
            date: inputRow.date,
            firstIn: inputRow.firstIn,
            lastOut: inputRow.lastOut,
            status,
            message,
          });
        }
        const dates = rows.flatMap((r) => (r.date ? [r.date] : [])).sort(),
          batch: ImportBatch = {
            id,
            reference: await reference("IM"),
            fileName: input.fileName,
            format: input.format,
            state: "previewed",
            uploadedAt: new Date().toISOString(),
            uploadedBy: (await employeeOf(r, ctx.actor.employeeId)).name,
            committedAt: null,
            dateRange: dates.length ? { from: required(dates[0]), to: required(dates.at(-1)) } : null,
            columns: [
              { field: "employeeCode", header: "Employee code" },
              { field: "date", header: "Date" },
              { field: "firstIn", header: "In time" },
              { field: "lastOut", header: "Out time" },
            ],
            totals: {
              rows: rows.length,
              ok: rows.filter((r) => r.status === "ok").length,
              warnings: rows.filter((r) => r.status === "warning").length,
              duplicates: rows.filter((r) => r.status === "duplicate").length,
              errors: rows.filter((r) => r.status === "error").length,
              employees: new Set(rows.filter((r) => r.employeeName).map((r) => r.employeeCode)).size,
            },
            rows,
          };
        await r.saveDocument(id, "attendance_import", batch, ctx.actor.employeeId);
        if (rawSource)
          await r.saveDocument(
            `source:${id}`,
            "attendance_import_source",
            {
              ...rawSource,
              sha256: createHash("sha256").update(Buffer.from(rawSource.contentBase64, "base64")).digest("hex"),
            },
            ctx.actor.employeeId,
          );
        return previewRows(batch);
      });
    },
    commit(ctx: CommandContext, id: string) {
      return timeCommand(prisma, ctx, `attendance.import.${id}.commit`, async (r) => {
        const doc = await r.document(id);
        if (!doc || doc.kind !== "attendance_import") fail("NOT_FOUND", "Import batch was not found.", 404);
        const batch = importBatchSchema.parse(doc.payload);
        if (batch.state !== "previewed") fail("IMPORT_CLOSED", "Only previewed imports can be committed.", 409);
        if (batch.totals.errors) fail("IMPORT_HAS_ERRORS", "Fix all error rows before committing.", 422);
        const people = await r.people();
        const peopleByCode = new Map(people.map((e) => [e.code, e])),
          range = required(batch.dateRange),
          recorded = await r.attendanceBatch(
            people.map((e) => e.id),
            range.from,
            range.to,
          ),
          recordsByDay = new Map(recorded.map((r) => [`${r.employeeId}:${r.date}`, r])),
          rules = await attendanceRules(r),
          rosters = new Map((await r.documents("roster")).map((d) => [d.id, rosterPayload.parse(d.payload)]));
        const inserts: Prisma.TimeAttendanceCreateManyInput[] = [];
        for (const row of batch.rows.filter((r) => r.status === "ok" || r.status === "warning")) {
          const e = peopleByCode.get(row.employeeCode);
          if (!e || !row.date)
            fail("IMPORT_CHANGED", "An employee or date changed after preview. Upload a new file.", 409);
          const existing = recordsByDay.get(`${e.id}:${row.date}`);
          if (existing) {
            if (clockTime(existing.firstIn) === row.firstIn && clockTime(existing.lastOut) === row.lastOut) continue;
            fail("IMPORT_CHANGED", "Attendance changed after preview. Upload a new file.", 409);
          }
          const week = monday(row.date),
            cell = rosters.get(`roster:${e.department.name}:${week}`)?.publishedCells[e.id]?.[
              daysBetween(week, row.date)
            ],
            shiftId =
              cell && cell !== "off"
                ? cell
                : (rules.departmentShifts.find((d) => d.department === e.department.name)?.shiftId ??
                  rules.defaultShiftId),
            shift = required(rules.shifts.find((s) => s.id === shiftId));
          inserts.push({
            id: newId("att"),
            employeeId: e.id,
            date: row.date,
            source: "device_import",
            firstIn: row.firstIn ? zonedInstant(row.date, row.firstIn) : null,
            lastOut: row.lastOut ? zonedInstant(row.date, row.lastOut) : null,
            workedMinutes:
              row.firstIn && row.lastOut
                ? Math.max(0, minutesOf(row.lastOut) - minutesOf(row.firstIn) - shift.breakMinutes)
                : 0,
          });
        }
        // Chunk inserts keep parameter counts bounded for a 20,000-row device export.
        for (let index = 0; index < inserts.length; index += 1000)
          await r.insertAttendanceBatch(inserts.slice(index, index + 1000));
        await r.saveDocument(
          id,
          "attendance_import",
          { ...batch, state: "committed", committedAt: new Date().toISOString() },
          doc.scope ?? undefined,
        );
        return { reference: batch.reference, applied: inserts.length };
      });
    },
    discard: (ctx: CommandContext, id: string) =>
      timeCommand(prisma, ctx, `attendance.import.${id}.discard`, async (r) => {
        const doc = await r.document(id);
        if (!doc || doc.kind !== "attendance_import") fail("NOT_FOUND", "Import batch was not found.", 404);
        const batch = importBatchSchema.parse(doc.payload);
        if (batch.state !== "previewed") fail("IMPORT_CLOSED", "Only previewed imports can be discarded.", 409);
        await r.saveDocument(id, "attendance_import", { ...batch, state: "discarded" }, doc.scope ?? undefined);
        return { ok: true };
      }),
  };
}
function previewRows(batch: ImportBatch): ImportBatch {
  const order = { error: 0, warning: 1, ok: 2, duplicate: 3 };
  return {
    ...batch,
    rows: [...batch.rows].sort((a, b) => order[a.status] - order[b.status] || a.line - b.line).slice(0, 1000),
  };
}
