import readSheet from "read-excel-file/node";

/*
 * Reads a face-recognition device export (CSV or .xlsx) into normalized
 * rows. Devices name columns differently, so headers are matched against
 * common synonyms; two layouts are supported:
 *   daily      — one row per employee per day: code, date, in, out
 *   punch log  — one row per punch: code, date+time (optional IN/OUT)
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;

type Field = "code" | "name" | "date" | "in" | "out" | "timestamp" | "time" | "direction";

const synonyms: Record<Field, string[]> = {
  code: [
    "employee code",
    "emp code",
    "empcode",
    "employee id",
    "emp id",
    "empid",
    "employee no",
    "emp no",
    "user id",
    "userid",
    "person id",
    "enroll id",
    "enrollment id",
    "badge",
    "staff id",
    "code",
    "id",
  ],
  name: ["employee name", "emp name", "name", "person name", "full name"],
  date: ["date", "attendance date", "punch date", "work date", "day"],
  in: ["in time", "check in", "checkin", "check-in", "first in", "punch in", "intime", "in_time", "in"],
  out: ["out time", "check out", "checkout", "check-out", "last out", "punch out", "outtime", "out_time", "out"],
  timestamp: ["timestamp", "date time", "datetime", "punch date time", "log time", "event time", "recorded at"],
  time: ["punch time", "time"],
  direction: ["direction", "in/out", "punch type", "event type", "type", "status"],
};

export const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .trim();

export interface ParsedRecord {
  line: number;
  code: string;
  name: string | null;
  date: string | null;
  firstIn: string | null;
  lastOut: string | null;
  problem: string | null;
}
export interface ParsedFile {
  format: "daily" | "punch_log";
  columns: { field: string; header: string }[];
  records: ParsedRecord[];
}

export class ImportFileError extends Error {}

/* Cell normalization -------------------------------------------------------- */

export type Cell = string | number | boolean | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, "0");
const months: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function validDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Dates: ISO, DD-MM-YYYY / DD/MM/YYYY (India default), DD-MMM-YYYY, Excel Date or serial. */
export function toDate(cell: Cell): string | null {
  if (cell instanceof Date) return validDate(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
  if (typeof cell === "number" && cell > 30000 && cell < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(cell) * 86_400_000);
    return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(cell ?? "").trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(text);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return validDate(year, Number(match[2]), Number(match[1]));
  }
  match = /^(\d{1,2})[-\s]([a-z]{3})[a-z]*[-\s,]*(\d{4})/i.exec(text);
  if (match) return validDate(Number(match[3]), months[match[2]?.toLowerCase() ?? ""] ?? 0, Number(match[1]));
  return null;
}

/** Times: HH:MM[:SS], h:mm AM/PM, Excel day fraction or Date; returns HH:MM. */
export function toTime(cell: Cell): string | null {
  if (cell instanceof Date) return `${pad(cell.getUTCHours())}:${pad(cell.getUTCMinutes())}`;
  if (typeof cell === "number" && cell >= 0) {
    // Excel stores time as the day fraction (date-times as serial + fraction).
    const minutes = Math.round((cell % 1) * 1440);
    return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
  }
  const text = String(cell ?? "").trim();
  const match = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

/* CSV ------------------------------------------------------------------------ */

/** RFC 4180 CSV (quoted fields, escaped quotes, CRLF); auto-detects ; or tab. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0] ?? ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i] ?? "";
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/* Layout detection ------------------------------------------------------------ */

function mapHeaders(header: Cell[]): Partial<Record<Field, number>> {
  const names = header.map((cell) => normalizeHeader(String(cell ?? "")));
  const found: Partial<Record<Field, number>> = {};
  const taken = new Set<number>();
  // Longer synonyms first so "in time" wins over a bare "in"/"time".
  const order: Field[] = ["timestamp", "code", "name", "date", "in", "out", "direction", "time"];
  for (const field of order)
    for (const synonym of synonyms[field]) {
      const index = names.findIndex((name, i) => !taken.has(i) && name === synonym);
      if (index >= 0) {
        found[field] = index;
        taken.add(index);
        break;
      }
    }
  return found;
}

export function readTable(table: Cell[][]): ParsedFile {
  const headerIndex = table.slice(0, 10).findIndex((row) => {
    const fields = mapHeaders(row);
    return fields.code !== undefined && (fields.date !== undefined || fields.timestamp !== undefined);
  });
  if (headerIndex < 0)
    throw new ImportFileError(
      "Couldn't find the header row. The file needs an employee code column and a date (or date-time) column in the first 10 rows.",
    );
  const header = table[headerIndex] ?? [];
  const map = mapHeaders(header);
  const body = table.slice(headerIndex + 1);
  if (body.length > MAX_IMPORT_ROWS)
    throw new ImportFileError(
      `Files can have up to ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows. Split the export by date range.`,
    );
  const at = (row: Cell[], field: Field): Cell => (map[field] === undefined ? null : row[map[field] ?? -1]);
  const columns = (Object.entries(map) as [Field, number][]).map(([field, index]) => ({
    field,
    header: String(header[index] ?? ""),
  }));
  const daily = map.date !== undefined && (map.in !== undefined || map.out !== undefined);
  const line = (index: number) => headerIndex + index + 2;

  if (daily) {
    return {
      format: "daily",
      columns,
      records: body.map((row, index) => {
        const date = toDate(at(row, "date"));
        const rawIn = at(row, "in");
        const rawOut = at(row, "out");
        const firstIn = toTime(rawIn);
        const lastOut = toTime(rawOut);
        const unreadable = (raw: Cell, parsed: string | null) =>
          String(raw ?? "").trim() !== "" &&
          !["-", "--", "na", "n/a", "absent"].includes(String(raw).trim().toLowerCase()) &&
          parsed === null;
        return {
          line: line(index),
          code: String(at(row, "code") ?? "").trim(),
          name: String(at(row, "name") ?? "").trim() || null,
          date,
          firstIn,
          lastOut,
          problem: !date
            ? "Unreadable date"
            : unreadable(rawIn, firstIn)
              ? "Unreadable in time"
              : unreadable(rawOut, lastOut)
                ? "Unreadable out time"
                : null,
        };
      }),
    };
  }

  // Punch log: collapse punches into first in / last out per employee-day.
  const days = new Map<string, ParsedRecord & { punches: { time: string; direction: "in" | "out" | null }[] }>();
  const broken: ParsedRecord[] = [];
  body.forEach((row, index) => {
    const code = String(at(row, "code") ?? "").trim();
    const stamp = at(row, "timestamp");
    const date = toDate(stamp ?? at(row, "date"));
    const time =
      map.timestamp !== undefined
        ? toTime(
            stamp instanceof Date || typeof stamp === "number" ? stamp : String(stamp ?? "").replace(/^\S+\s+/, ""),
          )
        : toTime(at(row, "time"));
    if (!date || !time) {
      broken.push({
        line: line(index),
        code,
        name: null,
        date,
        firstIn: null,
        lastOut: null,
        problem: !date ? "Unreadable date" : "Unreadable time",
      });
      return;
    }
    const raw = String(at(row, "direction") ?? "").toLowerCase();
    const direction = /out|exit|check.?out|\b1\b/.test(raw)
      ? "out"
      : /in|entry|check.?in|\b0\b/.test(raw)
        ? "in"
        : null;
    const key = `${code}|${date}`;
    const entry = days.get(key) ?? {
      line: line(index),
      code,
      name: String(at(row, "name") ?? "").trim() || null,
      date,
      firstIn: null,
      lastOut: null,
      problem: null,
      punches: [],
    };
    entry.punches.push({ time, direction });
    days.set(key, entry);
  });
  const records = [...days.values()].map(({ punches, ...entry }) => {
    const sorted = [...punches].sort((a, b) => a.time.localeCompare(b.time));
    const ins = sorted.filter((p) => p.direction !== "out");
    const outs = sorted.filter((p) => p.direction !== "in");
    const firstIn = ins[0]?.time ?? null;
    // A single undirected punch is only a check-in.
    const last = outs.at(-1)?.time ?? null;
    const lastOut = sorted.length > 1 && last && last !== firstIn ? last : null;
    return { ...entry, firstIn, lastOut };
  });
  return { format: "punch_log", columns, records: [...broken, ...records].sort((a, b) => a.line - b.line) };
}

/** CSV / .xlsx → raw cell rows (first sheet). Shared by every spreadsheet import. */
export async function readSpreadsheetRows(file: { name: string; bytes: Buffer }): Promise<Cell[][]> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv" || extension === "txt") return parseCsv(file.bytes.toString("utf8"));
  if (extension === "xlsx") {
    try {
      return (await readSheet(file.bytes)) as unknown as Cell[][];
    } catch {
      throw new ImportFileError("This Excel file couldn't be read. Save it as .xlsx (or export CSV) and try again.");
    }
  }
  if (extension === "xls")
    throw new ImportFileError("Old .xls files aren't supported. Open it and save as .xlsx or CSV.");
  throw new ImportFileError(
    "Upload a CSV or Excel (.xlsx) file. PDFs, Word files and images can't be read reliably — export the data as a spreadsheet.",
  );
}

export async function readAttendanceFile(file: { name: string; bytes: Buffer }): Promise<ParsedFile> {
  return readTable(await readSpreadsheetRows(file));
}
