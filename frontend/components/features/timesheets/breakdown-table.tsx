import { eachDay } from "@/lib/utils/date";
import { formatDate } from "@/lib/utils/format";
import { hoursLabel, type ProjectBreakdown } from "@/types/timesheets";

const dayName = (date: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

/** Read-only per project/task × day hours for one week (pure; used in sheets). */
export function BreakdownTable({ weekStart, weekEnd, rows, dayTotals, caption }: { weekStart: string; weekEnd: string; rows: ProjectBreakdown[]; dayTotals: number[]; caption: string }) {
  const days = eachDay(weekStart, weekEnd);
  return (
    <div className="ts-grid-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="ts-grid ts-grid--compact">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="ts-grid-task">
              Project · task
            </th>
            {days.map((date) => (
              <th key={date} scope="col" className="ts-grid-day">
                <span className="ts-day-name">{dayName(date)}</span>
                <span className="ts-day-date">{formatDate(date, "short")}</span>
              </th>
            ))}
            <th scope="col" className="ts-grid-total">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.projectCode}-${row.task}`}>
              <th scope="row" className="ts-grid-task">
                <span className="ts-row-code">
                  {row.projectCode}
                  {row.billable ? " · Billable" : ""}
                </span>
                <span className="ts-row-name">{row.projectName}</span>
                <span className="ts-row-meta">{row.task}</span>
                {row.note && <span className="ts-row-meta">“{row.note}”</span>}
              </th>
              {row.quarters.map((value, index) => (
                <td key={days[index] ?? index} className="ts-grid-cell num">
                  {value > 0 ? hoursLabel(value) : "–"}
                </td>
              ))}
              <td className="ts-grid-total num">{hoursLabel(row.totalQuarters)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="ts-grid-task">
              Daily total
            </th>
            {dayTotals.map((value, index) => (
              <td key={days[index] ?? index} className="ts-grid-cell num">
                {hoursLabel(value)}
              </td>
            ))}
            <td className="ts-grid-total num">
              <strong>{hoursLabel(dayTotals.reduce((sum, value) => sum + value, 0))}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
