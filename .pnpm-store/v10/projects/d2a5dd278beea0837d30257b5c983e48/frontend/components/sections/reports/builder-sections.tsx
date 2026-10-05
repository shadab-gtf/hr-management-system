import Link from "next/link";
import type { ReactNode } from "react";
import { BuilderForm } from "@/components/features/reports/builder-form";
import { DeleteReportButton, RemoveScheduleButton, RunNowButton, SaveReportSheet, ScheduleSheet } from "@/components/features/reports/saved-report-controls";
import { formatCell } from "@/components/sections/reports/report-charts";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, pluralize } from "@/lib/utils/format";
import type { BuilderContext, DeliveryLogEntry, ReportSchedule, ReportSpec, ReportTable, SavedReport } from "@/types/reports";

const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export function scheduleSummary(schedule: ReportSchedule): string {
  const when = schedule.frequency === "daily" ? "Daily" : schedule.frequency === "weekly" ? `Every ${weekdayNames[schedule.weekday - 1]}` : `Monthly on day ${schedule.dayOfMonth}`;
  return `${when} at ${schedule.time} IST · ${schedule.format.toUpperCase()} · ${pluralize(schedule.recipients.length, "recipient")}${schedule.active ? "" : " · Paused"}`;
}

function Preview({ table, downloads, actions }: { table: ReportTable; downloads: { csv: string; xls: string }; actions: ReactNode }) {
  return (
    <Card labelledBy="rb-preview">
      <CardHeader
        id="rb-preview"
        title="Preview"
        description={table.truncated ? `First 50 of ${table.totalRows} rows` : pluralize(table.totalRows, "row")}
        action={
          <div className="row-actions">
            <ButtonLink href={downloads.csv} size="sm" prefetch={false}>
              <AppIcon name="download" size={16} />
              CSV
            </ButtonLink>
            <ButtonLink href={downloads.xls} size="sm" prefetch={false}>
              <AppIcon name="download" size={16} />
              Excel
            </ButtonLink>
            {actions}
          </div>
        }
      />
      {table.notes.length > 0 && (
        <CardBody>
          <ul className="rpt-notes small muted">
            {table.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </CardBody>
      )}
      <CardBody className="flush">
        <DataTable
          caption={`${table.title} preview`}
          rows={table.rows.map((row, index) => ({ row, index }))}
          rowKey={(item) => String(item.index)}
          empty={<EmptyState compact icon="search" title="No matching rows" description="Loosen the filters and run the preview again." />}
          columns={table.columns.map((column, index) => ({
            key: column.key,
            header: column.label,
            rowHeader: index === 0,
            align: column.kind === "number" || column.kind === "money" ? ("end" as const) : ("start" as const),
            cell: (item: { row: ReportTable["rows"][number] }) => <span className={column.kind === "number" || column.kind === "money" ? "num" : undefined}>{formatCell(item.row[column.key], column.kind)}</span>,
          }))}
          mobileRow={(item) => {
            const [head, ...rest] = table.columns;
            return {
              title: head ? formatCell(item.row[head.key], head.kind) : "",
              meta: rest
                .slice(0, 3)
                .map((column) => `${column.label}: ${formatCell(item.row[column.key], column.kind)}`)
                .join(" · "),
            };
          }}
        />
      </CardBody>
    </Card>
  );
}

function SavedReports({ reports, context }: { reports: SavedReport[]; context: BuilderContext }) {
  const datasetLabel = (id: string) => context.datasets.find((dataset) => dataset.id === id)?.label ?? id;
  return (
    <Card labelledBy="rb-saved">
      <CardHeader id="rb-saved" title="Saved reports" description="Yours and those shared with your role. Only the owner can edit, schedule or delete." />
      {reports.length === 0 ? (
        <EmptyState compact icon="archive" title="No saved reports" description="Preview a report and save it to reuse or schedule it." />
      ) : (
        <ul className="rpt-saved">
          {reports.map((report) => (
            <li key={report.id} className="rpt-saved-item">
              <div className="rpt-saved-head">
                <Link href={`/admin/reports/builder?saved=${report.id}`} className="person-link">
                  {report.name}
                </Link>
                <span className="cluster">
                  <Badge tone={report.visibility === "shared" ? "info" : "neutral"}>{report.visibility === "shared" ? "Shared" : "Private"}</Badge>
                  {report.schedule && <Badge tone={report.schedule.active ? "success" : "warning"}>{report.schedule.active ? "Scheduled" : "Paused"}</Badge>}
                </span>
              </div>
              <p className="small muted">
                {datasetLabel(report.spec.dataset)} · {report.canEdit ? "You" : report.owner.name}
                {report.lastRunAt ? ` · Last run ${formatDateTime(report.lastRunAt)}` : ""}
              </p>
              {report.description && <p className="small">{report.description}</p>}
              {report.schedule && (
                <p className="small">
                  <AppIcon name="timer" size={16} /> {scheduleSummary(report.schedule)}
                  {report.schedule.nextRunAt ? ` · Next ${formatDateTime(report.schedule.nextRunAt)}` : ""}
                </p>
              )}
              {report.hiddenColumns.length > 0 && <p className="small muted">Salary columns hidden for your role.</p>}
              <div className="row-actions rpt-saved-actions">
                <ButtonLink href={`/api/reports/saved/${report.id}?format=csv`} size="sm" variant="ghost" prefetch={false} aria-label={`Download ${report.name} as CSV`}>
                  <AppIcon name="download" size={16} />
                  CSV
                </ButtonLink>
                <ButtonLink href={`/api/reports/saved/${report.id}?format=xls`} size="sm" variant="ghost" prefetch={false} aria-label={`Download ${report.name} as Excel`}>
                  <AppIcon name="download" size={16} />
                  Excel
                </ButtonLink>
                {report.canEdit && (
                  <>
                    <ScheduleSheet report={report} recipients={context.recipients} />
                    {report.schedule && <RunNowButton id={report.id} />}
                    {report.schedule && <RemoveScheduleButton id={report.id} />}
                    <DeleteReportButton id={report.id} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Deliveries({ entries }: { entries: DeliveryLogEntry[] }) {
  return (
    <Card labelledBy="rb-deliveries">
      <CardHeader id="rb-deliveries" title="Delivery log" description="Mock — not emailed. Scheduled runs generate the file and record who would receive it." />
      <CardBody className="flush">
        <DataTable
          caption="Scheduled report delivery log (mock, not emailed)"
          rows={entries}
          rowKey={(row) => row.id}
          empty={<EmptyState compact icon="send" title="No deliveries yet" description="Scheduled and manual runs appear here." />}
          columns={[
            { key: "at", header: "When", cell: (row) => formatDateTime(row.at) },
            { key: "report", header: "Report", rowHeader: true, cell: (row) => row.reportName },
            { key: "to", header: "Recipients", cell: (row) => row.recipients.join(", ") },
            { key: "trigger", header: "Trigger", cell: (row) => (row.trigger === "schedule" ? "Schedule" : "Run now") },
            { key: "rows", header: "Rows", align: "end", cell: (row) => <span className="num">{row.rowCount}</span> },
            { key: "status", header: "Status", cell: () => <Badge tone="warning">Mock — not emailed</Badge> },
          ]}
          mobileRow={(row) => ({ title: row.reportName, meta: `${formatDateTime(row.at)} · ${row.recipients.join(", ")} · Mock — not emailed`, trailing: <span className="num">{row.rowCount}</span> })}
        />
      </CardBody>
    </Card>
  );
}

export function ReportBuilderSection({
  context,
  spec,
  errors,
  preview,
  previewError,
  current,
  downloads,
  saved,
  deliveries,
  salarySpec,
  tabs,
}: {
  context: BuilderContext;
  spec: ReportSpec | null;
  errors: Record<string, string>;
  preview: ReportTable | null;
  previewError: string | null;
  current: SavedReport | null;
  downloads: { csv: string; xls: string } | null;
  saved: SavedReport[];
  deliveries: DeliveryLogEntry[];
  salarySpec: boolean;
  tabs: ReactNode;
}) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="HR admin"
        title={current ? current.name : "Report builder"}
        description={current ? (current.description || "Saved report — change anything and run the preview again.") : "Pick a dataset, columns and filters, preview the first 50 rows, then download, save or schedule."}
        back={{ href: "/admin/reports", label: "Reports" }}
        actions={
          current ? (
            <ButtonLink href="/admin/reports/builder" variant="secondary">
              <AppIcon name="add" size={20} />
              New report
            </ButtonLink>
          ) : undefined
        }
      />
      {tabs}
      <div className="split rpt-split">
        <Card labelledBy="rb-define">
          <CardHeader id="rb-define" title="Define" description={context.salaryAccess ? "Salary columns are available for your role." : "Salary columns and the payroll register need payroll or compensation access."} />
          <CardBody>
            <BuilderForm key={current?.id ?? "new"} datasets={context.datasets} departments={context.departments} locations={context.locations} currentMonth={context.currentMonth} initial={spec} savedId={current?.id ?? null} errors={errors} />
          </CardBody>
        </Card>
        <div className="stack">
          {previewError && (
            <Alert tone="danger" live title="Preview failed">
              {previewError}
            </Alert>
          )}
          {preview && spec && downloads ? (
            <Preview
              table={preview}
              downloads={downloads}
              actions={
                <>
                  {current?.canEdit && <SaveReportSheet spec={spec} roles={context.roles} existing={current} salary={salarySpec} trigger="Update report" />}
                  <SaveReportSheet spec={spec} roles={context.roles} salary={salarySpec} trigger={current ? "Save as new" : "Save report"} />
                </>
              }
            />
          ) : (
            !previewError && (
              <Card>
                <EmptyState icon="diagram" title="Run a preview" description="Choose a dataset and columns, then select Run preview. Nothing is exported until you download." />
              </Card>
            )
          )}
          <p className="small muted">Every download is recorded in the export audit log. PAN and bank details are always masked. Data is synthetic (mock backend).</p>
        </div>
      </div>
      <SavedReports reports={saved} context={context} />
      <Deliveries entries={deliveries} />
    </div>
  );
}
