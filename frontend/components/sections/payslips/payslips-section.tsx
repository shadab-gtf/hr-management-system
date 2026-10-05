import { PrintButton } from "@/components/features/payslips/print-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, DateText, IconTile, KeyValueList, MoneyText, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import type { PayslipDetail, PayslipLine, PayslipSummary } from "@/types/payroll";
import Link from "next/link";

const paymentStatus = {
  paid: { label: "Paid", tone: "success" },
  published: { label: "Published Â· payment pending", tone: "info" },
} as const;

export function PayslipsSection({ payslips }: { payslips: PayslipSummary[] }) {
  return (
    <div className="page">
      <PageHeader title="Payslips" description="Only published payslips appear here. â€œPublishedâ€ and â€œPaidâ€ are separate: payment is confirmed after bank reconciliation." />
      <Card>
        <CardBody className="flush">
          <DataTable<PayslipSummary>
            caption="Published payslips"
            rows={payslips}
            rowKey={(row) => row.id}
            mobileRow={(row) => ({
              href: `/me/payslips/${row.id}`,
              leading: <IconTile icon="payslip" accent={row.paymentStatus === "paid" ? "cyan" : "yellow"} />,
              title: row.periodLabel,
              meta: `${row.paymentStatus === "paid" ? "Paid" : "Payment pending"} Â· ${formatDate(row.paymentDate)}`,
              trailing: <MoneyText value={row.net} className="cell-strong" />,
            })}
            empty={<EmptyState icon="payslip" title="No payslips yet" description="Your first payslip appears after its payroll run is approved and published." />}
            columns={[
              {
                key: "period",
                header: "Period",
                rowHeader: true,
                cell: (row) => (
                  <Link href={`/me/payslips/${row.id}`} className="person-link person-name">
                    {row.periodLabel}
                  </Link>
                ),
              },
              { key: "paid", header: "Payment date", cell: (row) => <DateText value={row.paymentDate} /> },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={paymentStatus[row.paymentStatus]} /> },
              { key: "net", header: "Net pay", align: "end", cell: (row) => <MoneyText value={row.net} className="cell-strong" /> },
              {
                key: "open",
                header: "Payslip",
                align: "end",
                hideOnMobile: true,
                cell: (row) => (
                  <Link href={`/me/payslips/${row.id}`} className="inline-link">
                    View
                  </Link>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function Lines({ lines, total, totalLabel }: { lines: PayslipLine[]; total?: PayslipDetail["gross"]; totalLabel?: string }) {
  return (
    <dl className="lines">
      {lines.map((line) => (
        <div key={line.code} className="line">
          <dt>{line.name}</dt>
          <dd>
            <MoneyText value={line.amount} />
          </dd>
        </div>
      ))}
      {total && (
        <div className="line line--total">
          <dt>{totalLabel}</dt>
          <dd>
            <MoneyText value={total} />
          </dd>
        </div>
      )}
    </dl>
  );
}

export function PayslipDetailSection({ payslip, demo }: { payslip: PayslipDetail; demo: boolean }) {
  return (
    <div className="page">
      <PageHeader
        title={`${payslip.periodLabel} payslip`}
        back={{ href: "/me/payslips", label: "Payslips" }}
        actions={<PrintButton />}
      />
      {demo && (
        <Alert tone="warning" title="Synthetic payslip">
          Amounts come from the mock statutory engine on generated demo data â€” not a real salary or certified tax calculation.
        </Alert>
      )}
      {payslip.held && (
        <Alert tone="warning" title="Salary on hold">
          Your payslip is published, but payment is on hold. Payroll will contact you; ask HR helpdesk if you have questions.
        </Alert>
      )}
      <div className="split">
        <div className="stack">
          <Card labelledBy="earnings-heading">
            <CardHeader id="earnings-heading" title="Earnings" />
            <CardBody>
              <Lines lines={payslip.earnings} total={payslip.gross} totalLabel="Gross earnings" />
            </CardBody>
          </Card>
          <Card labelledBy="deductions-heading">
            <CardHeader id="deductions-heading" title="Deductions" />
            <CardBody>
              {payslip.deductions.length ? (
                <Lines lines={payslip.deductions} total={payslip.totalDeductions} totalLabel="Total deductions" />
              ) : (
                <p className="muted">No deductions this period.</p>
              )}
              {payslip.statutory.ptNote && <p className="field-hint">{payslip.statutory.ptNote}</p>}
            </CardBody>
          </Card>
          {payslip.employerContributions.length > 0 && (
            <Card labelledBy="employer-heading">
              <CardHeader id="employer-heading" title="Employer contributions" description="Paid by GTF in addition to your net pay" />
              <CardBody>
                <Lines lines={payslip.employerContributions} />
              </CardBody>
            </Card>
          )}
        </div>
        <div className="stack">
          <div className="payslip-net">
            <span>Net pay Â· {payslip.periodLabel}</span>
            <strong>
              <MoneyText value={payslip.net} />
            </strong>
            <StatusBadge status={paymentStatus[payslip.paymentStatus]} />
          </div>
          <Card labelledBy="slip-heading">
            <CardHeader id="slip-heading" title="Details" />
            <CardBody>
              <KeyValueList
                columns={1}
                items={[
                  { label: "Employee", value: `${payslip.employee.name} Â· ${payslip.employee.code}` },
                  { label: "Designation", value: `${payslip.employee.designation}, ${payslip.employee.department}` },
                  { label: "Pay period", value: `${formatDate(payslip.periodStart)} â€“ ${formatDate(payslip.paymentDate)}` },
                  { label: "Payable days", value: payslip.payableDays, hint: Number(payslip.lopDays) > 0 ? `${payslip.lopDays} loss-of-pay days` : undefined },
                  { label: "Salary account", value: payslip.employee.bankAccountMasked },
                  { label: "PAN", value: payslip.employee.panMasked },
                  { label: "Published", value: formatDateTime(payslip.publishedAt), hint: `Version ${payslip.artifactVersion}` },
                ]}
              />
            </CardBody>
          </Card>
          <Card labelledBy="statutory-heading">
            <CardHeader id="statutory-heading" title="Statutory details" description={payslip.statutory.entity} />
            <CardBody>
              <KeyValueList
                columns={1}
                items={[
                  { label: "UAN", value: payslip.statutory.uan ?? "Pending generation" },
                  { label: "PF number", value: payslip.statutory.pfNumber ? <span className="digest">{payslip.statutory.pfNumber}</span> : "Not applicable", hint: payslip.statutory.pfNumber ? `PF wages ${formatMoney(payslip.statutory.pfWage)}` : undefined },
                  { label: "ESI number", value: payslip.statutory.esiNumber ?? "Not covered (gross above ESI ceiling)" },
                  { label: "PT / LWF state", value: payslip.statutory.workState },
                ]}
              />
            </CardBody>
          </Card>
          <Card labelledBy="tax-heading">
            <CardHeader id="tax-heading" title="Income tax (TDS)" description={`${payslip.tax.financialYear} Â· ${payslip.statutory.regime} regime`} />
            <CardBody>
              <dl className="lines">
                <div className="line"><dt>Projected taxable income</dt><dd><MoneyText value={payslip.tax.projectedTaxable} /></dd></div>
                <div className="line"><dt>Projected tax for the year</dt><dd><MoneyText value={payslip.tax.annualTax} /></dd></div>
                <div className="line"><dt>TDS deducted before this month</dt><dd><MoneyText value={payslip.tax.deductedBefore} /></dd></div>
                <div className="line line--total"><dt>{`TDS this month (balance Ã· ${payslip.tax.remainingMonths} months)`}</dt><dd><MoneyText value={payslip.tax.thisMonth} /></dd></div>
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
