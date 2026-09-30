import Link from "next/link";
import type { ReactNode } from "react";
import { AuditHistorySheet } from "@/components/features/timesheets/audit-history-sheet";
import { CopyPreviousWeekButton } from "@/components/features/timesheets/copy-previous-week";
import { TimesheetGrid } from "@/components/features/timesheets/timesheet-grid";
import { AppIcon } from "@/components/ui/app-icon";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateRange, formatDateTime } from "@/lib/utils/format";
import { addDays } from "@/lib/utils/date";
import { hoursLabel, type MyTimesheetView, type TimesheetSummary } from "@/types/timesheets";
import { timesheetStatus } from "./tones";

const weekHref = (week: string) => `/timesheets?week=${week}`;

export function MyTimesheetSection({ view, tabs }: { view: MyTimesheetView; tabs: ReactNode }) {
  const { week } = view;
  const range = formatDateRange(week.weekStart, week.weekEnd);
  const isThisWeek = week.weekStart === view.thisWeek;
  const empty = week.totalQuarters === 0;
  const offDays = week.days.filter((day) => day.holiday || day.leave);

  return (
    <div className="page">
      <PageHeader title="My timesheet" description="Log hours by project and task each week. Your manager approves submitted weeks." />
      {tabs}

      <nav className="ts-week-nav" aria-label="Choose week">
        {view.prevWeek ? (
          <ButtonLink href={weekHref(view.prevWeek)} size="sm" aria-label="Previous week">
            <AppIcon name="back" size={16} />
            Previous
          </ButtonLink>
        ) : (
          <span />
        )}
        <div className="ts-week-title">
          <h2>{range}</h2>
          <StatusBadge status={timesheetStatus[week.status]} />
          {isThisWeek ? <span className="muted small">This week</span> : <ButtonLink href="/timesheets" size="sm" variant="ghost">This week</ButtonLink>}
        </div>
        {view.nextWeek ? (
          <ButtonLink href={weekHref(view.nextWeek)} size="sm" aria-label="Next week">
            Next
            <AppIcon name="chevronRight" size={16} />
          </ButtonLink>
        ) : (
          <span />
        )}
      </nav>

      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Week total" value={hoursLabel(week.totalQuarters)} meta={`${week.rows.length} rows`} icon="timer" accent="cyan" />
        <StatCard label="Billable" value={hoursLabel(week.billableQuarters)} meta={week.totalQuarters > 0 ? `${Math.round((week.billableQuarters / week.totalQuarters) * 100)}% of logged` : "No hours yet"} icon="chart" accent="yellow" />
        <StatCard
          label="Status"
          value={timesheetStatus[week.status].label}
          meta={week.submittedAt ? `Submitted ${formatDateTime(week.submittedAt)}` : week.editable ? "Editable until you submit" : "Locked"}
          icon="clipboardTick"
        />
      </div>

      {week.status === "rejected" && week.decisionComment && (
        <Alert tone="danger" title={`Sent back by ${week.decidedBy?.name ?? "your manager"}`}>
          “{week.decisionComment}” Update the hours and resubmit.
        </Alert>
      )}
      {week.status === "submitted" && (
        <Alert tone="info" title="Waiting for approval">
          This week is locked while your manager reviews it.
          {week.decisionComment ? ` It answers the earlier comment: “${week.decisionComment}”` : ""}
        </Alert>
      )}
      {week.status === "approved" && (
        <Alert tone="success" title={`Approved${week.decidedBy ? ` by ${week.decidedBy.name}` : ""}${week.decidedAt ? ` · ${formatDateTime(week.decidedAt)}` : ""}`}>
          Approved weeks are final. Contact your manager if something needs correcting.
        </Alert>
      )}
      {week.warnings.length > 0 && (
        <Alert tone="warning" title="Check these days">
          <ul className="ts-error-list">
            {week.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Card labelledBy="ts-grid-title">
        <CardHeader
          id="ts-grid-title"
          title="Hours"
          description={offDays.length > 0 ? `${offDays.length} day${offDays.length === 1 ? "" : "s"} marked as holiday or leave. Up to 16h a day in 15-minute steps.` : "Up to 16h a day in 15-minute steps (0.25)."}
          action={
            <div className="cluster">
              {week.editable && empty && view.previousWeekHasRows && <CopyPreviousWeekButton weekStart={week.weekStart} version={week.version} />}
              <AuditHistorySheet title={`History · ${range}`} entries={week.audit} triggerLabel={`History for ${range}`} />
            </div>
          }
        />
        <CardBody>
          <TimesheetGrid key={`${week.weekStart}:${week.version}`} week={week} assignable={view.assignable} />
        </CardBody>
      </Card>

      <Card labelledBy="ts-recent-title">
        <CardHeader id="ts-recent-title" title="Recent weeks" />
        <CardBody className="flush">
          <DataTable<TimesheetSummary>
            caption="Recent timesheet weeks"
            rows={view.recent}
            rowKey={(row) => row.id}
            empty={<EmptyState compact icon="timer" title="No timesheets yet" description="Weeks you save or submit appear here." />}
            mobileRow={(row) => ({
              title: formatDateRange(row.weekStart, addDays(row.weekStart, 6)),
              meta: <StatusBadge status={timesheetStatus[row.status]} />,
              trailing: <span className="num">{hoursLabel(row.totalQuarters)}</span>,
              href: weekHref(row.weekStart),
            })}
            columns={[
              {
                key: "week",
                header: "Week",
                rowHeader: true,
                cell: (row) => (
                  <Link href={weekHref(row.weekStart)} className="person-link">
                    {formatDateRange(row.weekStart, addDays(row.weekStart, 6))}
                  </Link>
                ),
              },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={timesheetStatus[row.status]} /> },
              { key: "comment", header: "Manager comment", hideOnMobile: true, cell: (row) => row.decisionComment ?? <span className="muted">—</span> },
              { key: "hours", header: "Hours", align: "end", cell: (row) => <span className="num">{hoursLabel(row.totalQuarters)}</span> },
            ]}
          />
        </CardBody>
      </Card>
      <p className="muted small">Weeks start on Monday ({formatDate(view.thisWeek, "weekday")} this week). Holidays and leave come from the leave calendar; timesheet data is mock-only.</p>
    </div>
  );
}
