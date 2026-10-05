import { CompensationDecision, CompensationUploadForm } from "@/components/features/payroll/compensation-import-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, DateText, ListRow, MoneyText, StepIndicator } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import type { CompensationBatch, CompensationBatchSummary, CompensationRow } from "@/types/compensation-import";

const rowTone: Record<CompensationRow["status"], { label: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  ok: { label: "Ready", tone: "success" },
  warning: { label: "Check", tone: "warning" },
  duplicate: { label: "Skipped", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
};
const stateTone: Record<CompensationBatchSummary["state"], { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral" }> = {
  previewed: { label: "Draft preview", tone: "info" },
  submitted: { label: "Awaiting approval", tone: "warning" },
  approved: { label: "Approved & applied", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  discarded: { label: "Discarded", tone: "neutral" },
};
const STEPS = ["Upload", "Dry run", "Submit", "Independent approval", "Applied"];
const stepOf: Record<CompensationBatchSummary["state"], number> = { previewed: 1, submitted: 3, approved: 4, rejected: 3, discarded: 1 };

function Preview({ batch }: { batch: CompensationBatch }) {
  const importable = batch.totals.ok + batch.totals.warnings;
  const impact = Number(batch.totals.annualImpact.amount);
  return (
    <>
      <Card labelledBy="cmp-preview">
        <CardHeader id="cmp-preview" title={`${batch.reference} · ${batch.fileName}`} description={`Uploaded by ${batch.uploadedBy} · ${formatDateTime(batch.uploadedAt)}${batch.decidedBy ? ` · decided by ${batch.decidedBy}` : ""}`} action={<Badge tone={stateTone[batch.state].tone}>{stateTone[batch.state].label}</Badge>} />
        <CardBody className="stack">
          <StepIndicator label="Salary import progress" steps={STEPS} current={stepOf[batch.state]} />
          <div className="grid grid-stats">
            <StatCard label="Changes" value={importable} meta={`${batch.totals.scheduled} scheduled · ${batch.totals.retroactive} retroactive`} icon="check" accent="cyan" />
            <StatCard label="Annual impact" value={`${impact < 0 ? "−" : "+"}${formatMoney({ ...batch.totals.annualImpact, amount: batch.totals.annualImpact.amount.replace("-", "") }, { decimals: false })}`} meta="CTC change across changes" icon="trend" accent="magenta" />
            <StatCard label="Skipped" value={batch.totals.duplicates} meta="Unchanged / duplicates" icon="refresh" />
            <StatCard label="Errors" value={batch.totals.errors} meta="Not imported" icon="danger" accent="yellow" />
          </div>
          <p className="small muted">Columns detected: {batch.columns.map((c) => `${c.field} ← “${c.header}”`).join(" · ")}</p>
          {batch.state === "submitted" && batch.selfPrepared && (
            <Alert tone="info" title="Waiting for an independent approver">
              You prepared this batch, so someone else with payroll approval rights must approve it.
            </Alert>
          )}
          {batch.state === "rejected" && batch.decisionNote && <Alert tone="danger" title="Rejected">{batch.decisionNote}</Alert>}
          {batch.state === "approved" && (
            <Alert tone="success" title="Applied">
              Revisions effective today or earlier now drive payroll and each employee’s salary structure; scheduled ones apply on their date. Retroactive changes produce arrears in the next run.
            </Alert>
          )}
          {(batch.can.submit || batch.can.approve || batch.can.discard) && <CompensationDecision batchId={batch.id} can={batch.can} importable={importable} />}
        </CardBody>
        <CardBody className="flush">
          <DataTable
            caption="Salary changes"
            label="Salary changes"
            rows={batch.rows}
            rowKey={(row) => `${row.line}-${row.employeeCode}`}
            mobileRow={(row) => ({
              title: row.employeeName ?? row.employeeCode,
              meta: `Line ${row.line} · ${row.currentCtc ? formatMoney(row.currentCtc, { decimals: false }) : "—"} → ${row.newCtc ? formatMoney(row.newCtc, { decimals: false }) : "—"}${row.message ? ` · ${row.message}` : ""}`,
              trailing: <Badge tone={rowTone[row.status].tone}>{rowTone[row.status].label}</Badge>,
            })}
            columns={[
              { key: "line", header: "Line", cell: (row) => <span className="num">{row.line}</span> },
              { key: "who", header: "Employee", rowHeader: true, cell: (row) => <span>{row.employeeName ?? "Unknown"} <span className="muted num">{row.employeeCode}</span></span> },
              { key: "eff", header: "Effective", cell: (row) => (row.effectiveFrom ? <DateText value={row.effectiveFrom} /> : "—") },
              { key: "cur", header: "Current CTC", align: "end", cell: (row) => (row.currentCtc ? <MoneyText value={row.currentCtc} /> : "—") },
              { key: "new", header: "New CTC", align: "end", cell: (row) => (row.newCtc ? <MoneyText value={row.newCtc} /> : "—") },
              { key: "pct", header: "Change", align: "end", cell: (row) => <span className="num">{row.changePercent ? `${row.changePercent}%` : "—"}</span> },
              { key: "basic", header: "Basic", align: "end", hideOnMobile: true, cell: (row) => (row.basic ? <MoneyText value={row.basic} /> : "—") },
              { key: "status", header: "Status", cell: (row) => <Badge tone={rowTone[row.status].tone}>{rowTone[row.status].label}</Badge> },
              { key: "msg", header: "Note", cell: (row) => <span className="small">{row.message ?? ""}</span> },
            ]}
          />
        </CardBody>
      </Card>
    </>
  );
}

export function CompensationImportSection({ batch, history, canUpload }: { batch: CompensationBatch | null; history: CompensationBatchSummary[]; canUpload: boolean }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Payroll"
        title="Salary import"
        description="Bulk salary revisions from a spreadsheet. Payroll prepares, an independent approver applies — HR and employees never see this screen."
        back={{ href: "/payroll", label: "Payroll" }}
        actions={
          <ButtonLink href="/api/imports/salary-template.csv" variant="secondary" prefetch={false}>
            <AppIcon name="download" size={20} />
            Sheet template
          </ButtonLink>
        }
      />
      {canUpload && (
        <div className="split split--wide-aside">
          <Card labelledBy="cmp-upload">
            <CardHeader id="cmp-upload" title="Upload salary sheet" description="Columns are detected automatically: Employee code, Effective date, Annual CTC (or Monthly CTC), optional Basic, HRA, Special allowance, Reason." />
            <CardBody>
              <CompensationUploadForm />
            </CardBody>
          </Card>
          <Card labelledBy="cmp-rules">
            <CardHeader id="cmp-rules" title="What gets checked" />
            <CardBody>
              <ul className="bullet-list small">
                <li>Codes must match an active employee; exited or unknown codes are rejected.</li>
                <li>Effective date: up to 12 months back (arrears) or 6 months ahead. Blank column → 1st of this month.</li>
                <li>Basic + HRA + special can’t exceed CTC; basic under 50% and changes over 30% or decreases are flagged.</li>
                <li>Unchanged salaries and repeated rows are skipped, so re-uploading is safe.</li>
                <li>Amounts like 12,00,000 · ₹12,00,000 · 12 L · 12 LPA are understood exactly (no rounding).</li>
                <li>PDF or Word salary letters can’t be read reliably — export a spreadsheet instead.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      )}
      {batch && <Preview batch={batch} />}
      <Card labelledBy="cmp-history">
        <CardHeader id="cmp-history" title="Batches" description="Draft previews are visible only to their preparer." />
        {history.length ? (
          <ul className="list">
            {history.map((item) => (
              <ListRow
                key={item.id}
                href={`/payroll/compensation?batch=${item.id}`}
                leading={<span className="icon-tile avatar--neutral"><AppIcon name="wallet" size={20} /></span>}
                title={`${item.reference} · ${item.fileName}`}
                meta={`${item.uploadedBy} · ${formatDateTime(item.uploadedAt)} · ${item.totals.ok + item.totals.warnings} changes, ${item.totals.errors} errors`}
                trailing={<Badge tone={stateTone[item.state].tone}>{stateTone[item.state].label}</Badge>}
              />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon="wallet" title="No salary batches yet" description={canUpload ? "Upload the first salary sheet above." : "Submitted batches from Payroll will appear here for approval."} />
        )}
      </Card>
    </div>
  );
}
