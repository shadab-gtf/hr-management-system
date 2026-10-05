import {
  ImportFileError,
  MAX_IMPORT_ROWS,
  normalizeHeader,
  readSpreadsheetRows,
  toDate,
  type Cell,
} from "../attendance-import/attendance-file.js";

/*
 * Reads a salary sheet (CSV/.xlsx). Amounts are parsed as exact paise from
 * text ("12,00,000", "₹12,00,000.50", "12 L", "12 LPA") or from Excel numbers.
 * Component columns are annual unless the header says monthly.
 */

type Field = "code" | "name" | "effective" | "ctc" | "monthly" | "basic" | "hra" | "special" | "reason";

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
    "staff id",
    "code",
    "id",
  ],
  name: ["employee name", "emp name", "name", "full name"],
  effective: [
    "effective date",
    "effective from",
    "effective",
    "wef",
    "w e f",
    "revision date",
    "start date",
    "applicable from",
  ],
  ctc: [
    "annual ctc",
    "ctc annual",
    "ctc",
    "ctc per annum",
    "annual salary",
    "yearly ctc",
    "annual package",
    "package",
    "ctc pa",
  ],
  monthly: ["monthly ctc", "monthly gross", "gross monthly", "monthly salary", "ctc per month", "ctc monthly"],
  basic: ["basic", "basic salary", "basic pay", "basic annual", "basic monthly", "basic per month"],
  hra: ["hra", "house rent allowance", "hra annual", "hra monthly", "hra per month"],
  special: ["special allowance", "special", "other allowance", "special allowance annual", "special allowance monthly"],
  reason: ["reason", "remarks", "remark", "comment", "comments", "note", "notes"],
};

export interface CompensationRecord {
  line: number;
  code: string;
  name: string | null;
  effectiveFrom: string | null;
  /** Annual paise. */
  ctc: number | null;
  basic: number | null;
  hra: number | null;
  special: number | null;
  reason: string | null;
  problem: string | null;
}

/** Exact paise from text or an Excel number; null when blank; NaN when unreadable. */
export function toPaise(cell: Cell): number | null {
  if (cell === null || cell === undefined || String(cell).trim() === "") return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? Math.round(cell * 100) : Number.NaN;
  const text = String(cell)
    .trim()
    .toLowerCase()
    .replace(/[₹,\s]|rs\.?|inr/g, "");
  const lakh = /^(\d+(?:\.\d{1,2})?)(l|lac|lakh|lakhs|lpa)$/.exec(text);
  if (lakh) {
    const [whole = "0", fraction = ""] = (lakh[1] ?? "0").split(".");
    return (Number(whole) * 100_000 + Number((fraction + "00").slice(0, 2)) * 1_000) * 100;
  }
  const plain = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!plain) return Number.NaN;
  return Number(plain[1]) * 100 + Number(((plain[2] ?? "") + "00").slice(0, 2));
}

export async function readCompensationFile(file: { name: string; bytes: Buffer }) {
  const table = await readSpreadsheetRows(file);
  const mapHeaders = (row: Cell[]) => {
    const names = row.map((cell) => normalizeHeader(String(cell ?? "")));
    const found: Partial<Record<Field, number>> = {};
    const taken = new Set<number>();
    for (const field of ["monthly", "ctc", "code", "name", "effective", "basic", "hra", "special", "reason"] as Field[])
      for (const synonym of synonyms[field]) {
        const index = names.findIndex((name, i) => !taken.has(i) && name === synonym);
        if (index >= 0) {
          found[field] = index;
          taken.add(index);
          break;
        }
      }
    return { found, names };
  };
  const headerIndex = table.slice(0, 10).findIndex((row) => {
    const { found } = mapHeaders(row);
    return found.code !== undefined && (found.ctc !== undefined || found.monthly !== undefined);
  });
  if (headerIndex < 0)
    throw new ImportFileError(
      "Couldn't find the header row. The sheet needs an employee code column and an annual CTC (or monthly CTC) column.",
    );
  const header = table[headerIndex] ?? [];
  const { found: map, names } = mapHeaders(header);
  const body = table.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  if (body.length > MAX_IMPORT_ROWS) throw new ImportFileError("Too many rows. Split the sheet.");
  const monthlyColumn = (field: Field) => map[field] !== undefined && /month/.test(names[map[field] ?? -1] ?? "");
  const at = (row: Cell[], field: Field): Cell => (map[field] === undefined ? null : row[map[field] ?? -1]);
  const annual = (row: Cell[], field: "basic" | "hra" | "special") => {
    const value = toPaise(at(row, field));
    return value === null || Number.isNaN(value) ? value : monthlyColumn(field) ? value * 12 : value;
  };

  const records: CompensationRecord[] = body.map((row, index) => {
    const direct = toPaise(at(row, "ctc"));
    const monthly = toPaise(at(row, "monthly"));
    const ctc = direct !== null ? direct : monthly !== null && !Number.isNaN(monthly) ? monthly * 12 : monthly;
    const basic = annual(row, "basic");
    const hra = annual(row, "hra");
    const special = annual(row, "special");
    const rawDate = at(row, "effective");
    const effectiveFrom = map.effective === undefined ? null : toDate(rawDate);
    const unreadable = [ctc, basic, hra, special].some((value) => value !== null && Number.isNaN(value));
    return {
      line: headerIndex + index + 2,
      code: String(at(row, "code") ?? "").trim(),
      name: String(at(row, "name") ?? "").trim() || null,
      effectiveFrom,
      ctc: ctc === null || Number.isNaN(ctc) ? null : ctc,
      basic: basic === null || Number.isNaN(basic) ? null : basic,
      hra: hra === null || Number.isNaN(hra) ? null : hra,
      special: special === null || Number.isNaN(special) ? null : special,
      reason: String(at(row, "reason") ?? "").trim() || null,
      problem: unreadable
        ? "Unreadable amount"
        : map.effective !== undefined && String(rawDate ?? "").trim() && !effectiveFrom
          ? "Unreadable effective date"
          : ctc === null
            ? "Missing CTC"
            : null,
    };
  });
  const labels: Record<Field, string> = {
    code: "code",
    name: "name",
    effective: "effective",
    ctc: "annual CTC",
    monthly: "monthly CTC",
    basic: "basic",
    hra: "HRA",
    special: "special allowance",
    reason: "reason",
  };
  return {
    records,
    hasEffectiveColumn: map.effective !== undefined,
    columns: (Object.entries(map) as [Field, number][]).map(([field, index]) => ({
      field: labels[field],
      header: String(header[index] ?? ""),
    })),
  };
}

export type CompensationFile = Awaited<ReturnType<typeof readCompensationFile>>;
