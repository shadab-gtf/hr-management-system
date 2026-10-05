import { Meter } from "@/components/ui/display";
import { formatDate, formatMoney } from "@/lib/utils/format";
import type { ReportCell, ReportColumn } from "@/types/reports";

/* Accessible CSS charts: the bars are decorative (aria-hidden); the same
 * numbers are always available as a real table in a disclosure. */

export function formatCell(value: ReportCell | undefined, kind: ReportColumn["kind"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "money") return formatMoney({ amount: String(value), currency: "INR" });
  if (kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatDate(String(value));
  if (typeof value === "number") return value.toLocaleString("en-IN");
  return String(value);
}

function DataFallback({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="rpt-fallback">
      <summary>Show data table</summary>
      <div className="table-wrap" role="region" aria-label={caption} tabIndex={0}>
        <table className="data-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={header} scope="col" className={index ? "cell-end" : undefined}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, index) =>
                  index === 0 ? (
                    <th key={index} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={index} className="cell-end num">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Vertical column chart for one series (e.g. monthly headcount). */
export function ColumnChart({ caption, summary, rows, valueLabel }: { caption: string; summary: string; rows: { label: string; value: number }[]; valueLabel: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const min = Math.min(...rows.map((row) => row.value));
  // A floor below the minimum keeps small month-to-month changes visible.
  const floor = Math.max(0, Math.floor(min * 0.8));
  return (
    <figure className="rpt-figure">
      <figcaption className="small muted">{summary}</figcaption>
      <div className="rpt-chart" aria-hidden="true">
        {rows.map((row) => (
          <div key={row.label} className="rpt-col">
            <span className="rpt-value num">{row.value}</span>
            <span className="rpt-bar" style={{ height: `${Math.max(4, ((row.value - floor) / Math.max(1, max - floor)) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="rpt-axis" aria-hidden="true">
        {rows.map((row) => (
          <span key={row.label}>{row.label}</span>
        ))}
      </div>
      <DataFallback caption={caption} headers={["Month", valueLabel]} rows={rows.map((row) => [row.label, row.value])} />
    </figure>
  );
}

/** Two series side by side per period (e.g. joiners vs leavers). */
export function PairedChart({ caption, summary, rows, labels }: { caption: string; summary: string; rows: { label: string; a: number; b: number }[]; labels: [string, string] }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.a, row.b]));
  return (
    <figure className="rpt-figure">
      <figcaption className="small muted">{summary}</figcaption>
      <ul className="rpt-legend" aria-hidden="true">
        <li>
          <span className="rpt-swatch" />
          {labels[0]}
        </li>
        <li>
          <span className="rpt-swatch rpt-swatch--alt" />
          {labels[1]}
        </li>
      </ul>
      <div className="rpt-chart" aria-hidden="true">
        {rows.map((row) => (
          <div key={row.label} className="rpt-col">
            <span className="rpt-pair">
              <span className="rpt-bar" style={{ height: `${(row.a / max) * 100}%` }} />
              <span className="rpt-bar rpt-bar--alt" style={{ height: `${(row.b / max) * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="rpt-axis" aria-hidden="true">
        {rows.map((row) => (
          <span key={row.label}>{row.label}</span>
        ))}
      </div>
      <DataFallback caption={caption} headers={["Month", ...labels]} rows={rows.map((row) => [row.label, row.a, row.b])} />
    </figure>
  );
}

/** Horizontal bars; each bar is a labelled meter, so no separate table is needed. */
export function SplitBars({ rows, tone = "secondary", total }: { rows: { name: string; count: number }[]; tone?: "primary" | "secondary"; total?: number }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.name}>
          <span className="bar-label">{row.name}</span>
          <Meter value={row.count} max={max} label={`${row.name}: ${row.count}${total ? ` of ${total}` : ""}`} tone={tone} />
          <span className="bar-value num">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}
