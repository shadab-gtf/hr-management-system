import type { ReactNode } from "react";
import { RemindButton } from "@/components/features/timesheets/remind-button";
import { TimesheetDecisionSheet } from "@/components/features/timesheets/timesheet-decision-sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PersonCell, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateRange, formatDateTime } from "@/lib/utils/format";
import { hoursLabel, type MissingTimesheet, type TeamTimesheet, type TeamTimesheetsView } from "@/types/timesheets";
import { TimesheetExportForm } from "./timesheet-export-form";
import { timesheetStatus } from "./tones";

function projectSummary(row: TeamTimesheet): string {
  const byProject = new Map<string, number>();
  for (const item of row.breakdown) byProject.set(item.projectCode, (byProject.get(item.projectCode) ?? 0) + item.totalQuarters);
  return [...byProject.entries()].map(([code, quarters]) => `${code} ${hoursLabel(quarters)}`).join(" · ");
}

export function TeamTimesheetsSection({ view, tabs, orgWideExport }: { view: TeamTimesheetsView; tabs: ReactNode; orgWideExport: boolean }) {
  const pendingHours = view.pending.reduce((sum, row) => sum + row.totalQuarters, 0);
  return (
    <div className="page">
      <PageHeader title="Team timesheets" description="Approve your direct reports' weeks and follow up on missing ones." />
      {tabs}
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Waiting for you" value={view.pending.length} meta={`${hoursLabel(pendingHours)} submitted`} icon="clipboardTick" accent="yellow" />
        <StatCard label="Missing weeks" value={view.missing.length} meta="Last two completed weeks" icon="warning" accent="magenta" />
        <StatCard label="Direct reports" value={view.reportCount} meta="Only direct reports appear here" icon="team" />
      </div>

      <Card labelledBy="ts-pending-title">
        <CardHeader id="ts-pending-title" title="Pending approval" description="Oldest weeks first. Open a week to see hours by project and day." />
        <CardBody className="flush">
          <DataTable<TeamTimesheet>
            caption="Timesheets pending approval"
            rows={view.pending}
            rowKey={(row) => row.id}
            empty={<EmptyState compact icon="check" title="You're all caught up" description="Submitted timesheets from your direct reports will appear here." />}
            mobileRow={(row) => ({
              title: row.employee.name,
              meta: (
                <>
                  {formatDateRange(row.weekStart, row.weekEnd)} · {hoursLabel(row.totalQuarters)}
                  {row.resubmission && (
                    <>
                      <br />
                      <Badge tone="info">Resubmitted</Badge>
                    </>
                  )}
                </>
              ),
              trailing: <TimesheetDecisionSheet timesheet={row} />,
            })}
            columns={[
              { key: "employee", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.employee} meta={`${row.employeeCode} · ${row.employee.designation}`} /> },
              {
                key: "week",
                header: "Week",
                cell: (row) => (
                  <span className="person-text">
                    <span>{formatDateRange(row.weekStart, row.weekEnd)}</span>
                    {row.resubmission && <Badge tone="info">Resubmitted</Badge>}
                  </span>
                ),
              },
              { key: "projects", header: "By project", hideOnMobile: true, cell: (row) => <span className="small">{projectSummary(row)}</span> },
              { key: "billable", header: "Billable", align: "end", hideOnMobile: true, cell: (row) => <span className="num">{hoursLabel(row.billableQuarters)}</span> },
              { key: "total", header: "Total", align: "end", cell: (row) => <span className="num cell-strong">{hoursLabel(row.totalQuarters)}</span> },
              { key: "action", header: "Action", align: "end", cell: (row) => <TimesheetDecisionSheet timesheet={row} /> },
            ]}
          />
        </CardBody>
      </Card>

      <Card labelledBy="ts-missing-title">
        <CardHeader id="ts-missing-title" title="Missing timesheets" description="Reports without a submitted or approved week for the last two completed weeks." />
        <CardBody className="flush">
          <DataTable<MissingTimesheet>
            caption="Missing timesheets"
            rows={view.missing}
            rowKey={(row) => `${row.employee.id}-${row.weekStart}`}
            empty={<EmptyState compact icon="check" title="Nothing missing" description="Everyone has submitted the last two weeks." />}
            mobileRow={(row) => ({
              title: row.employee.name,
              meta: (
                <>
                  {formatDateRange(row.weekStart, row.weekEnd)} · <StatusBadge status={timesheetStatus[row.state]} />
                </>
              ),
              trailing: <Reminder row={row} />,
            })}
            columns={[
              { key: "employee", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.employee} /> },
              { key: "week", header: "Week", cell: (row) => formatDateRange(row.weekStart, row.weekEnd) },
              { key: "state", header: "State", cell: (row) => <StatusBadge status={timesheetStatus[row.state]} /> },
              { key: "action", header: "Reminder", align: "end", cell: (row) => <Reminder row={row} /> },
            ]}
          />
          <p className="card-note muted small ts-card-note">Reminders create an in-app notification in the mock backend only; no email or push is sent.</p>
        </CardBody>
      </Card>

      <Card labelledBy="ts-decided-title">
        <CardHeader id="ts-decided-title" title="Recent decisions" />
        <CardBody className="flush">
          <DataTable<TeamTimesheet>
            caption="Timesheets you recently decided"
            rows={view.recentDecisions}
            rowKey={(row) => row.id}
            empty={<EmptyState compact icon="clipboard" title="No decisions yet" description="Weeks you approve or send back are listed here." />}
            mobileRow={(row) => ({
              title: row.employee.name,
              meta: (
                <>
                  {formatDateRange(row.weekStart, row.weekEnd)} · <StatusBadge status={timesheetStatus[row.status]} />
                </>
              ),
              trailing: <span className="num">{hoursLabel(row.totalQuarters)}</span>,
            })}
            columns={[
              { key: "employee", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.employee} /> },
              { key: "week", header: "Week", cell: (row) => formatDateRange(row.weekStart, row.weekEnd) },
              { key: "status", header: "Decision", cell: (row) => <StatusBadge status={timesheetStatus[row.status]} /> },
              { key: "comment", header: "Comment", hideOnMobile: true, cell: (row) => row.decisionComment ?? <span className="muted">—</span> },
              { key: "when", header: "Decided", hideOnMobile: true, cell: (row) => (row.decidedAt ? formatDateTime(row.decidedAt) : "—") },
              { key: "hours", header: "Hours", align: "end", cell: (row) => <span className="num">{hoursLabel(row.totalQuarters)}</span> },
            ]}
          />
        </CardBody>
      </Card>

      <TimesheetExportForm from={view.exportFrom} to={view.exportTo} scope={orgWideExport ? "All employees' approved hours (HR scope)." : "Approved hours for your direct reports."} />
    </div>
  );
}

function Reminder({ row }: { row: MissingTimesheet }) {
  if (row.remindedAt)
    return (
      <span className="ts-reminded">
        <Badge tone="success">Reminded</Badge>
        <span className="muted small">{formatDateTime(row.remindedAt)}</span>
      </span>
    );
  return <RemindButton employeeId={row.employee.id} employeeName={row.employee.name} weekStart={row.weekStart} weekLabel={formatDateRange(row.weekStart, row.weekEnd)} />;
}

