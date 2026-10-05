import Link from "next/link";
import { AttendanceCapture } from "@/components/features/attendance/attendance-capture";
import { RegularizationButton } from "@/components/features/attendance/regularization-sheet";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { KeyValueList, ListRow, PersonCell, StatusBadge, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { addMonths, weekday } from "@/lib/utils/date";
import { formatDate, formatDuration, formatTime } from "@/lib/utils/format";
import { attendanceDayStatus, todayStatus } from "@/lib/utils/tones";
import type { AttendanceMonth, AttendanceToday, TeamAttendanceRow } from "@/types/attendance";

export function AttendanceTabs({ view, team }: { view: "me" | "team" | "roster"; team: boolean }) {
  return (
    <TabsNav
      label="Attendance views"
      tabs={[
        { href: "/attendance", label: "My attendance", active: view === "me" },
        ...(team ? [{ href: "/attendance?view=team", label: "My team", active: view === "team" }] : []),
        { href: "/attendance/roster", label: "Shift roster", active: view === "roster" },
      ]}
    />
  );
}

function MonthSummary({ month }: { month: AttendanceMonth }) {
  const s = month.summary;
  return (
    <Card labelledBy="summary-heading">
      <CardHeader
        id="summary-heading"
        title="Monthly summary"
        description={s.marksPerHalfDay ? `Late/early policy: every ${s.marksPerHalfDay} marks deduct half a day.` : "Late/early deductions are off."}
      />
      <CardBody>
        <KeyValueList
          columns={3}
          items={[
            { label: "Present", value: <span className="num">{s.present}</span>, hint: "incl. late and half days" },
            { label: "Work from home", value: <span className="num">{s.wfh}</span> },
            { label: "Paid leave", value: <span className="num">{s.leave}</span> },
            { label: "Loss of pay", value: <span className="num">{s.lop}</span>, hint: "Unpaid leave + absent" },
            { label: "Late arrivals", value: <span className="num">{s.late}</span> },
            { label: "Early going", value: <span className="num">{s.earlyGoing}</span> },
            { label: "Late/early deductions", value: <span className="num">{s.lateDeductions ? `${s.lateDeductions * 0.5} day${s.lateDeductions === 2 ? "" : "s"}` : "None"}</span> },
            { label: "Overtime", value: <span className="num">{s.overtimeMinutes ? `${(s.overtimeMinutes / 60).toFixed(1)} h` : "0 h"}</span>, hint: s.overtimeCompensation === "paid" ? "Paid" : s.overtimeCompensation ? "As comp-off" : undefined },
            { label: "Week-offs / holidays", value: <span className="num">{`${s.weeklyOffs} / ${s.holidays}`}</span>, hint: s.workedOnOffDays ? `Worked ${s.workedOnOffDays} — claim comp-off` : undefined },
          ]}
        />
        {s.workedOnOffDays > 0 && (
          <p className="small">
            <Link href="/leave/comp-off">Claim comp-off for days worked off-roster</Link>
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export function AttendanceHeader() {
  return (
    <PageHeader
      title="Attendance"
      description="Check in and out, review your month and fix exceptions. Corrections go to your manager; original punches are kept."
    />
  );
}

export function MyAttendanceSection({
  today,
  month,
  currentMonth,
  correctDate,
}: {
  today: AttendanceToday;
  month: AttendanceMonth;
  currentMonth: string;
  correctDate: string | undefined;
}) {
  const exceptions = month.days.filter((day) => day.state === "needs_review");
  const leading = weekday(month.days[0]?.date ?? `${month.month}-01`);
  const canGoNext = month.month < currentMonth;
  return (
    <>
      <div className="grid grid-home">
        <Card labelledBy="capture-heading">
          <CardHeader id="capture-heading" title="Today" description={formatDate(today.businessDate, "long")} />
          <CardBody>
            <AttendanceCapture today={today} />
          </CardBody>
        </Card>
        <div className="grid stat-pair">
          <StatCard label="Present" value={month.summary.present} meta="Days this month" icon="check" accent="cyan" />
          <StatCard label="Late arrivals" value={month.summary.late} meta="After grace period" icon="timer" accent="yellow" />
          <StatCard label="Needs review" value={month.summary.needsReview} meta="Missing punches" icon="warning" accent="magenta" />
          <StatCard
            label="Avg. worked"
            value={formatDuration(month.summary.averageWorkedMinutes)}
            meta={month.summary.overtimeMinutes ? `Overtime ${formatDuration(month.summary.overtimeMinutes)} · as ${month.summary.overtimeCompensation === "paid" ? "paid" : "comp-off"}` : "Per working day"}
            icon="attendance"
          />
        </div>
      </div>

      <Card labelledBy="month-heading">
        <CardHeader
          id="month-heading"
          title={formatDate(month.month, "month")}
          description="Daily status from your recorded punches"
          action={
            <nav className="month-nav" aria-label="Change month">
              <Link className="button button--ghost icon-button" href={`/attendance?month=${addMonths(month.month, -1)}`} aria-label="Previous month">
                <AppIcon name="back" />
              </Link>
              {canGoNext ? (
                <Link className="button button--ghost icon-button" href={`/attendance?month=${addMonths(month.month, 1)}`} aria-label="Next month">
                  <AppIcon name="chevronRight" />
                </Link>
              ) : (
                <span className="button button--ghost icon-button" aria-hidden="true" />
              )}
            </nav>
          }
        />
        <CardBody className="stack">
          <div className="cal" role="grid" aria-label={`Attendance for ${formatDate(month.month, "month")}`}>
            <div className="cal-head" role="row">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day} role="columnheader">
                  {day}
                </span>
              ))}
            </div>
            <div className="cal-grid" role="row">
              {Array.from({ length: leading }, (_, index) => (
                <span key={`blank-${index}`} className="cal-day cal-day--blank" aria-hidden="true" />
              ))}
              {month.days.map((day) => {
                const status = attendanceDayStatus[day.state];
                return (
                  <div
                    key={day.date}
                    role="gridcell"
                    className="cal-day"
                    data-state={day.state}
                    data-tone={day.state === "weekly_off" || day.state === "holiday" || day.state === "upcoming" ? undefined : status.tone}
                    data-today={day.date === today.businessDate || undefined}
                    data-deduction={day.deduction ?? undefined}
                    aria-label={`${formatDate(day.date, "long")}: ${day.wfh ? "Work from home, " : ""}${status.label}${day.shiftName ? ` (${day.shiftName})` : ""}${day.firstIn ? `, in ${day.firstIn}` : ""}${day.lastOut ? `, out ${day.lastOut}` : ""}${day.lateMinutes ? `, ${day.lateMinutes} min late` : ""}${day.earlyMinutes ? `, left ${day.earlyMinutes} min early` : ""}${day.deduction ? ", half-day deducted (late/early policy)" : ""}${day.overtimeMinutes ? `, overtime ${formatDuration(day.overtimeMinutes)}` : ""}`}
                  >
                    <span className="cal-date num">{Number(day.date.slice(8))}</span>
                    <span className="cal-meta">
                      {day.state === "holiday" ? day.exception : day.firstIn ? `${day.firstIn}${day.lastOut ? `–${day.lastOut}` : ""}` : status.label}
                      {day.overtimeMinutes > 0 && <span className="cal-ot"> +{formatDuration(day.overtimeMinutes)} OT</span>}
                    </span>
                    {(day.deduction || day.earlyMinutes > 0 || day.wfh || day.leaveCode === "LOP") && (
                      <span className="time-cal-flag" aria-hidden="true">
                        {day.deduction ? "½ ded." : day.leaveCode === "LOP" ? "LOP" : day.wfh ? "WFH" : "Early"}
                      </span>
                    )}
                    <span className="cal-mark" aria-hidden="true" />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="legend" aria-hidden="true">
            <span><i data-tone="success" />Present</span>
            <span><i data-tone="warning" />Late</span>
            <span><i data-tone="info" />Leave / half day</span>
            <span><i data-tone="danger" />Needs review</span>
            <span><i />Off / holiday</span>
            <span>½ ded. = half day deducted under the late/early policy</span>
          </div>
        </CardBody>
      </Card>

      <MonthSummary month={month} />

      <Card labelledBy="exceptions-heading">
        <CardHeader id="exceptions-heading" title="Exceptions" description="Missing punches create an exception, never an automatic deduction." />
        {exceptions.length ? (
          <ul className="list">
            {exceptions.map((day) => (
              <ListRow
                key={day.date}
                title={formatDate(day.date, "long")}
                meta={`${day.exception ?? "Needs review"}${day.firstIn ? ` · In ${day.firstIn}` : ""}`}
                trailing={
                  day.regularization ? (
                    <StatusBadge status={{ label: day.regularization === "pending" ? "Correction pending" : day.regularization === "approved" ? "Corrected" : "Correction rejected", tone: day.regularization === "pending" ? "warning" : day.regularization === "approved" ? "success" : "danger" }} />
                  ) : (
                    <RegularizationButton day={day} defaultOpen={day.date === correctDate} />
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon="check" title="No exceptions this month" description="Every working day has complete punches." />
        )}
      </Card>
    </>
  );
}

export function TeamAttendanceSection({ rows }: { rows: TeamAttendanceRow[] }) {
  const counted = (states: TeamAttendanceRow["state"][]) => rows.filter((row) => states.includes(row.state)).length;
  return (
    <>
      <div className="grid grid-stats">
        <StatCard label="Team size" value={rows.length} meta="Direct reports" icon="team" />
        <StatCard label="Checked in" value={counted(["checked_in", "checked_out"])} meta="So far today" icon="check" accent="cyan" />
        <StatCard label="Not recorded" value={counted(["not_recorded"])} meta="No punch yet" icon="timer" accent="yellow" />
        <StatCard label="Away" value={counted(["unavailable"])} meta="Leave or off" icon="calendar" accent="magenta" />
      </div>
      <Card labelledBy="team-heading">
        <CardHeader id="team-heading" title="Today" description="Live status of your direct reports" />
        <CardBody className="flush">
          <DataTable<TeamAttendanceRow>
            caption="Team attendance today"
            rows={rows}
            rowKey={(row) => row.person.id}
            mobileRow={(row) => ({
              href: `/employees/${row.person.id}`,
              leading: <Avatar initials={row.person.initials} seed={row.person.id} src={row.person.photoUrl} />,
              title: row.person.name,
              meta: row.checkedInAt ? `In at ${formatTime(row.checkedInAt)}${row.exception ? ` · ${row.exception}` : ""}` : (row.exception ?? row.person.designation),
              trailing: <StatusBadge status={todayStatus[row.state]} />,
            })}
            empty={<EmptyState compact icon="team" title="No direct reports" description="Team attendance appears for people who report to you." />}
            columns={[
              { key: "person", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.person} href={`/employees/${row.person.id}`} /> },
              { key: "state", header: "Status", cell: (row) => <StatusBadge status={todayStatus[row.state]} /> },
              { key: "in", header: "Checked in", cell: (row) => <span className="num">{row.checkedInAt ? formatTime(row.checkedInAt) : "—"}</span> },
              { key: "exception", header: "Recent exception", className: "cell-wrap", cell: (row) => row.exception ?? "None" },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}
