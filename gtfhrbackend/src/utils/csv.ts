import type { Response } from "express";

type Cell = string | number | boolean | null | undefined;

/** Makes Excel open the UTF-8 file with the right encoding (names in Devanagari, ₹). */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** Neutralizes spreadsheet formula injection (cells starting with = + - @ tab CR) and quotes per RFC 4180. */
function cell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Sends a CSV download. `fileName` must be a plain name (no path, no quotes). */
export function sendCsv(response: Response, fileName: string, csv: string): void {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  response
    .status(200)
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="${safeName}"`)
    .setHeader("Cache-Control", "no-store")
    .send(BYTE_ORDER_MARK + csv);
}
