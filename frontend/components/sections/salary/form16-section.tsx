import Link from "next/link";
import { PrintButton } from "@/components/features/payslips/print-button";
import { GenerateForm16Button } from "@/components/features/payroll/statutory-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, KeyValueList, MoneyText, PersonCell, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import type { Tone } from "@/types/common";
import type { Form16, Form16Status } from "@/types/statutory";

export function Form16Section({ form, status }: { form: Form16; status: Form16Status | null }) {
  const issued = form.status === "issued";
  return (
    <div className="page">
      <PageHeader
        eyebrow={`${form.fyLabel} · ${form.assessmentYear}`}
        title="Form 16"
        description="Certificate of tax deducted at source on salary (section 203). Part A lists TDS deposited; Part B shows how your tax was computed."
        back={form.viewingOther ? { href: `/salary/form-16?fy=${form.fy}`, label: "Form 16 status" } : undefined}
        actions={form.status !== "not_employed" ? <PrintButton label="Print / Save as PDF" /> : undefined}
      />
      {form.options.length > 1 && (
        <Card className="no-print">
          <form className="toolbar" action="/salary/form-16" aria-label="Choose financial year">
            {form.viewingOther && <input type="hidden" name="employee" value={form.employee.id} />}
            <div className="toolbar-field">
              <label htmlFor="f16-fy">Financial year</label>
              <SelectInput id="f16-fy" name="fy" defaultValue={form.fy} options={form.options} />
            </div>
            <div className="toolbar-actions">
              <Button type="submit" variant="secondary">
                Show
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Alert tone={issued ? "info" : "warning"} title={issued ? `Issued ${form.generatedAt ? formatDateTime(form.generatedAt) : ""}` : "Provisional — not a certificate yet"}>
        {issued
          ? "Generated from mock payroll data. A real Form 16 Part A is downloaded from TRACES and digitally signed by the employer."
          : "Form 16 is issued after the financial year closes (by 15 June). Figures below are a projection from the mock payroll engine."}
      </Alert>

      {form.status === "not_employed" ? (
        <Card>
          <EmptyState icon="document" title="No salary in this year" description="Form 16 is available for years in which salary was paid." />
        </Card>
      ) : (
        <article className="card stat-form16" aria-labelledby="f16-title">
          <header className="stat-form16-head">
            <p className="page-eyebrow">FORM NO. 16 · [See rule 31(1)(a)]</p>
            <h2 id="f16-title">Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source on salary</h2>
            <p className="muted">{`Certificate no. ${form.certificateNo} · ${issued ? "Issued" : "Provisional"}`}</p>
          </header>
          <div className="card-body stack">
            <div className="grid grid-2">
              <KeyValueList
                columns={1}
                items={[
                  { label: "Employer (deductor)", value: form.employer.name, hint: form.employer.address },
                  { label: "Employer PAN", value: form.employer.pan },
                  { label: "Employer TAN", value: form.employer.tan },
                ]}
              />
              <KeyValueList
                columns={1}
                items={[
                  { label: "Employee", value: `${form.employee.name} · ${form.employee.code}`, hint: form.employee.designation },
                  { label: "Employee PAN", value: form.employee.pan },
                  { label: "Period with employer", value: `${formatDate(form.employee.periodFrom)} – ${formatDate(form.employee.periodTo)}`, hint: `Tax regime: ${form.employee.regime === "new" ? "new (section 115BAC)" : "old"}` },
                ]}
              />
            </div>

            <section className="stack" aria-labelledby="f16-a">
              <h3 id="f16-a" className="stat-subhead">Part A · Tax deducted and deposited</h3>
              <DataTable
                caption="Quarterly summary of tax deducted and deposited"
                rows={form.partA.quarters}
                rowKey={(row) => row.quarter}
                stackOnMobile
                columns={[
                  { key: "q", header: "Quarter", rowHeader: true, cell: (row) => row.quarter },
                  { key: "receipt", header: "24Q receipt no.", cell: (row) => row.receipt ?? "—" },
                  { key: "paid", header: "Amount paid/credited", align: "end", cell: (row) => <MoneyText value={row.paid} /> },
                  { key: "deducted", header: "Tax deducted", align: "end", cell: (row) => <MoneyText value={row.deducted} /> },
                  { key: "deposited", header: "Tax deposited", align: "end", cell: (row) => <MoneyText value={row.deposited} /> },
                ]}
              />
              {form.partA.challans.length ? (
                <DataTable
                  caption="Challan identification numbers (CIN) for tax deposited"
                  rows={form.partA.challans}
                  rowKey={(row) => row.month}
                  stackOnMobile
                  columns={[
                    { key: "month", header: "Month", rowHeader: true, cell: (row) => row.month },
                    { key: "amount", header: "Tax deposited", align: "end", cell: (row) => <MoneyText value={row.amount} /> },
                    { key: "bsr", header: "BSR code", cell: (row) => row.bsrCode ?? "—" },
                    { key: "date", header: "Date deposited", cell: (row) => (row.paidOn ? formatDate(row.paidOn) : "—") },
                    { key: "no", header: "Challan serial no.", cell: (row) => row.challanNo ?? "—" },
                    { key: "status", header: "Status", cell: (row) => (row.status === "deposited" ? <Badge tone="success">Deposited</Badge> : <Badge tone="warning">Pending</Badge>) },
                  ]}
                />
              ) : (
                <p className="muted">No tax was deducted in this period.</p>
              )}
              <KeyValueList columns={2} items={[{ label: "Total tax deducted", value: <MoneyText value={form.partA.totalDeducted} className="cell-strong" /> }, { label: "Total tax deposited", value: <MoneyText value={form.partA.totalDeposited} className="cell-strong" /> }]} />
            </section>

            <section className="stack" aria-labelledby="f16-b">
              <h3 id="f16-b" className="stat-subhead">Part B · Details of salary paid and tax computed</h3>
              <dl className="lines">
                {form.partB.map((line) => (
                  <div key={`${line.ref}-${line.label}`} className={cn("line", line.emphasis && "line--total", line.indent && "stat-line--indent")}>
                    <dt>
                      <span className="stat-ref">{line.ref}</span> {line.label}
                    </dt>
                    <dd>
                      <MoneyText value={line.amount} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <p className="field-hint">Synthetic data from the GTF HR mock backend — not valid for filing an income-tax return.</p>
          </div>
        </article>
      )}

      {status && <Form16StatusCard status={status} />}
    </div>
  );
}

const rowStatus: Record<Form16Status["rows"][number]["status"], { label: string; tone: Tone }> = {
  generated: { label: "Generated", tone: "success" },
  no_tds: { label: "No TDS · Part B only", tone: "neutral" },
  pan_missing: { label: "PAN missing", tone: "danger" },
  ready: { label: "Ready to generate", tone: "info" },
  provisional: { label: "Provisional", tone: "warning" },
};

function Form16StatusCard({ status }: { status: Form16Status }) {
  return (
    <Card labelledBy="f16-status" className="no-print">
      <CardHeader
        id="f16-status"
        title={`Generation status · ${status.fyLabel}`}
        description={status.generatedAt ? `Generated ${formatDateTime(status.generatedAt)} by ${status.generatedBy ?? "Payroll"}` : status.closed ? "Not generated yet" : "Financial year in progress"}
        action={<GenerateForm16Button fy={status.fy} label={status.generatedAt ? "Regenerate" : "Generate for all"} {...(status.canGenerate ? {} : { disabledReason: status.generateBlockedReason ?? "Not available" })} />}
      />
      <CardBody className="stack">
        <KeyValueList
          columns={3}
          items={[
            { label: "Generated", value: <span className="num">{status.counts.generated}</span> },
            { label: "No TDS", value: <span className="num">{status.counts.noTds}</span> },
            { label: "Blocked (PAN)", value: <span className="num">{status.counts.blocked}</span> },
          ]}
        />
        {status.generateBlockedReason && <p className="field-hint">{status.generateBlockedReason}</p>}
      </CardBody>
      <CardBody className="flush">
        <DataTable
          caption={`Form 16 status for ${status.fyLabel}`}
          rows={status.rows}
          rowKey={(row) => row.employee.id}
          mobileRow={(row) => ({ href: `/salary/form-16?fy=${status.fy}&employee=${row.employee.id}`, title: row.employee.name, meta: `TDS ${row.tds.amount}`, trailing: <StatusBadge status={rowStatus[row.status]} /> })}
          columns={[
            { key: "employee", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.employee} meta={row.code} href={`/salary/form-16?fy=${status.fy}&employee=${row.employee.id}`} /> },
            { key: "tds", header: "TDS deducted", align: "end", cell: (row) => <MoneyText value={row.tds} /> },
            { key: "deposited", header: "Deposited", align: "end", cell: (row) => <MoneyText value={row.deposited} /> },
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={rowStatus[row.status]} /> },
            { key: "open", header: "Form 16", align: "end", cell: (row) => <Link className="inline-link" href={`/salary/form-16?fy=${status.fy}&employee=${row.employee.id}`}>View</Link> },
          ]}
        />
      </CardBody>
    </Card>
  );
}
