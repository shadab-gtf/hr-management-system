import type { ReactNode } from "react";
import { AttendanceUploadForm, ImportCommitBar } from "@/components/features/admin/attendance-import-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, DateText, ListRow } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import type { ImportBatch, ImportBatchSummary, ImportRow } from "@/types/attendance-import";

const rowTone: Record<ImportRow["status"], { label: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  ok: { label: "Ready", tone: "success" },
  warning: { label: "Check", tone: "warning" },
  duplicate: { label: "Skipped", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
};
const stateTone: Record<ImportBatchSummary["state"], { label: string; tone: "info" | "success" | "neutral" }> = {
  previewed: { label: "Awaiting review", tone: "info" },
  committed: { label: "Imported", tone: "success" },
  discarded: { label: "Discarded", tone: "neutral" },
};
const fieldLabels: Record<string, string> = { code: "Employee code", name: "Name", date: "Date", in: "In time", out: "Out time", timestamp: "Date-time", time: "Time", direction: "In/Out" };

function Preview({ batch }: { batch: ImportBatch }) {
  const importable = batch.totals.ok + batch.totals.warnings;
  return (
    <>
      <div className="grid grid-stats">
        <StatCard label="Ready to import" value={importable} meta={`${batch.totals.employees} employees`} icon="check" accent="cyan" />
        <StatCard label="Needs a look" value={batch.totals.warnings} meta="Imported with a note" icon="warning" accent="yellow" />
        <StatCard label="Skipped" value={batch.totals.duplicates} meta="Duplicates / already imported" icon="refresh" />
        <StatCard label="Errors" value={batch.totals.errors} meta="Not imported" icon="danger" accent="magenta" />
      </div>
      <Card labelledBy="preview-heading">
        <CardHeader
          id="preview-heading"
          title={`Preview · ${batch.fileName}`}
          description={`${batch.reference} · ${batch.format === "daily" ? "Daily in/out layout" : "Punch-log layout (first in / last out per day)"}${batch.dateRange ? ` · ${formatDate(batch.dateRange.from)} – ${formatDate(batch.dateRange.to)}` : ""} · ${batch.totals.rows} rows`}
          action={<Badge tone={stateTone[batch.state].tone}>{stateTone[batch.state].label}</Badge>}
        />
        <CardBody className="stack">
          <p className="small muted">
            Columns detected: {batch.columns.map((column) => `${fieldLabels[column.field] ?? column.field} ← “${column.header}”`).join(" · ")}
          </p>
          {batch.state === "previewed" && (
            <>
              {batch.totals.errors > 0 && (
                <Alert tone="warning" title={`${batch.totals.errors} row${batch.totals.errors === 1 ? "" : "s"} won’t be imported`}>
                  Fix them in the device export and upload again — already-imported rows are skipped automatically, so re-uploading is safe.
                </Alert>
              )}
              <ImportCommitBar batchId={batch.id} importable={importable} />
            </>
          )}
          {batch.state === "committed" && batch.committedAt && (
            <Alert tone="success" title="Imported">
              Committed {formatDateTime(batch.committedAt)}. Attendance, late marks and overtime now use these punches.
            </Alert>
          )}
        </CardBody>
        <CardBody className="flush">
          <DataTable
            caption="Import rows"
            rows={batch.rows}
            rowKey={(row) => `${row.line}-${row.employeeCode}-${row.date ?? ""}`}
            mobileRow={(row) => ({
              title: row.employeeName ?? row.employeeCode,
              meta: `Line ${row.line} · ${row.date ? formatDate(row.date) : "—"} · ${row.firstIn ?? "—"}–${row.lastOut ?? "—"}${row.message ? ` · ${row.message}` : ""}`,
              trailing: <Badge tone={rowTone[row.status].tone}>{rowTone[row.status].label}</Badge>,
            })}
            columns={[
              { key: "line", header: "Line", cell: (row) => <span className="num">{row.line}</span> },
              { key: "who", header: "Employee", rowHeader: true, cell: (row) => <span>{row.employeeName ?? "Unknown"} <span className="muted num">{row.employeeCode}</span></span> },
              { key: "date", header: "Date", cell: (row) => (row.date ? <DateText value={row.date} /> : "—") },
              { key: "in", header: "In", cell: (row) => <span className="num">{row.firstIn ?? "—"}</span> },
              { key: "out", header: "Out", cell: (row) => <span className="num">{row.lastOut ?? "—"}</span> },
              { key: "status", header: "Status", cell: (row) => <Badge tone={rowTone[row.status].tone}>{rowTone[row.status].label}</Badge> },
              { key: "msg", header: "Note", cell: (row) => <span className="small">{row.message ?? ""}</span> },
            ]}
          />
        </CardBody>
        {batch.totals.rows > batch.rows.length && <p className="small muted card-note">Showing the first {batch.rows.length} rows (problems first). Totals above cover all {batch.totals.rows} rows.</p>}
      </Card>
    </>
  );
}

export function AttendanceImportSection({ batch, history, tabs }: { batch: ImportBatch | null; history: ImportBatchSummary[]; tabs: ReactNode }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="HR admin"
        title="Attendance import"
        description="Upload the face-recognition device export. Rows are matched to employees by code, checked, and only imported after you review them. Work-from-home days are requested in the app."
        actions={
          <ButtonLink href="/api/imports/attendance-template.csv" variant="secondary" prefetch={false}>
            <AppIcon name="download" size={20} />
            CSV template
          </ButtonLink>
        }
      />
      {tabs}
      <div className="split split--wide-aside">
        <Card labelledBy="upload-heading">
          <CardHeader id="upload-heading" title="1. Upload device file" description="Daily (code, date, in, out) or punch-log (code, date-time, IN/OUT) layouts are detected automatically." />
          <CardBody>
            <AttendanceUploadForm />
          </CardBody>
        </Card>
        <Card labelledBy="rules-heading">
          <CardHeader id="rules-heading" title="How rows are checked" />
          <CardBody>
            <ul className="bullet-list small">
              <li>Employee code must match GTF HR (e.g. GTF-1007 or 1007); unknown codes are quarantined.</li>
              <li>No future dates, dates before joining, or out-before-in.</li>
              <li>Same person and date twice → first kept; already-imported rows are skipped.</li>
              <li>Missing check-out, holiday work and approved leave/WFH days are imported with a note.</li>
              <li>Late marks and overtime follow the employee’s shift in Attendance rules.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
      {batch && <Preview batch={batch} />}
      <Card labelledBy="history-heading">
        <CardHeader id="history-heading" title="Recent imports" />
        {history.length ? (
          <ul className="list">
            {history.map((item) => (
              <ListRow
                key={item.id}
                href={`/admin/attendance-import?batch=${item.id}`}
                leading={<span className="icon-tile avatar--neutral"><AppIcon name="document" size={20} /></span>}
                title={item.fileName}
                meta={`${item.reference} · ${item.uploadedBy} · ${formatDateTime(item.uploadedAt)} · ${item.totals.ok + item.totals.warnings} ready, ${item.totals.errors} errors`}
                trailing={<Badge tone={stateTone[item.state].tone}>{stateTone[item.state].label}</Badge>}
              />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon="upload" title="No imports yet" description="Upload the first device export above." />
        )}
      </Card>
    </div>
  );
}
