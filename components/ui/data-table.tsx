import type { ReactNode } from "react";
import { ListRow } from "@/components/ui/display";
import { cn } from "@/lib/utils/cn";

export interface Column<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "start" | "end";
  /** Row header cell (first column, usually the person or record name). */
  rowHeader?: boolean;
  /** Hidden in the stacked mobile card; keep required data elsewhere. */
  hideOnMobile?: boolean;
  className?: string;
}

export interface MobileRow {
  title: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  href?: string;
}

/**
 * Semantic, server-renderable table. With `mobileRow`, phones get a compact
 * native-style list instead; without it, rows below 640px stack into labelled
 * cards. Either way wide data never overflows the page.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  stackOnMobile = true,
  label,
  mobileRow,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
  stackOnMobile?: boolean;
  label?: string;
  mobileRow?: (row: Row) => MobileRow;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const table = (
    <div className={cn("table-wrap", mobileRow && "dt-desktop")} role="region" aria-label={label ?? caption} tabIndex={0}>
      <table className="data-table" data-stack={stackOnMobile || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn(column.align === "end" && "cell-end", column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => {
                const className = cn(
                  column.align === "end" && "cell-end",
                  column.hideOnMobile && "cell-optional",
                  column.className,
                );
                return column.rowHeader ? (
                  <th key={column.key} scope="row" className={className}>
                    {column.cell(row)}
                  </th>
                ) : (
                  <td key={column.key} data-label={column.header} className={className}>
                    {column.cell(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (!mobileRow) return table;
  return (
    <>
      {table}
      <ul className="list dt-mobile" aria-label={label ?? caption}>
        {rows.map((row) => {
          const item = mobileRow(row);
          return <ListRow key={rowKey(row)} {...item} />;
        })}
      </ul>
    </>
  );
}
