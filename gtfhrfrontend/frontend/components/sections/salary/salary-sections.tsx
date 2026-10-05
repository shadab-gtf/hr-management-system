import { Fragment } from "react";
import { DeclarationForm } from "@/components/features/salary/declaration-form";
import { LoanRequestSheet } from "@/components/features/salary/loan-request-sheet";
import { PrintButton } from "@/components/features/payslips/print-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, DateText, KeyValueList, Meter, MoneyText, StatusBadge, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateTime, formatMoney, formatMoneyCompact, humanize } from "@/lib/utils/format";
import type { Compensation, Loan, TaxDeclaration, TaxStatement, Ytd } from "@/types/salary";

/* YTD ---------------------------------------------------------------------- */

export function YtdSection({ ytd }: { ytd: Ytd }) {
  const earnings = ytd.rows.filter((row) => row.kind === "earning");
  const deductions = ytd.rows.filter((row) => row.kind === "deduction");
  return (
    <div className="page">
      <PageHeader eyebrow={ytd.financialYear} title="Year-to-date" description="Every published payslip this financial year, by component." actions={<PrintButton />} />
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Gross earnings" value={formatMoneyCompact(ytd.gross)} meta={formatMoney(ytd.gross)} icon="wallet" accent="cyan" />
        <StatCard label="Deductions" value={formatMoneyCompact(ytd.deductions)} meta={formatMoney(ytd.deductions)} icon="expenses" accent="yellow" />
        <StatCard label="Net pay" value={formatMoneyCompact(ytd.net)} meta={formatMoney(ytd.net)} icon="payroll" accent="magenta" />
      </div>
      {ytd.months.length === 0 ? (
        <Card>
          <EmptyState icon="payslip" title="No published payslips yet" description="YTD figures appear after the first payroll of the financial year." />
        </Card>
      ) : (
        <Card labelledBy="ytd-heading">
          <CardHeader id="ytd-heading" title="Component breakdown" description={`${ytd.months.length} months`} />
          <div className="table-wrap" role="region" aria-label="Year-to-date by month" tabIndex={0}>
            <table className="data-table ytd-table">
              <caption className="sr-only">Year-to-date earnings and deductions by month</caption>
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  {ytd.months.map((month) => (
                    <th key={month} scope="col" className="cell-end">
                      {month}
                    </th>
                  ))}
                  <th scope="col" className="cell-end">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {[{ label: "Earnings", rows: earnings }, { label: "Deductions", rows: deductions }].map((group) => (
                  <Fragment key={group.label}>
                    <tr className="table-group">
                      <th scope="rowgroup" colSpan={ytd.months.length + 2}>
                        {group.label}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.code}>
                        <th scope="row">{row.name}</th>
                        {row.amounts.map((amount, index) => (
                          <td key={ytd.months[index]} className="cell-end">
                            {amount ? <MoneyText value={amount} /> : "—"}
                          </td>
                        ))}
                        <td className="cell-end cell-strong">
                          <MoneyText value={row.total} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* Tax statement ------------------------------------------------------------ */

export function TaxStatementSection({ statement }: { statement: TaxStatement }) {
  return (
    <div className="page">
      <PageHeader eyebrow={statement.financialYear} title="Income tax statement" description={`Projection under the ${statement.regime} regime, based on your salary and declarations.`} actions={<PrintButton />} />
      <Alert tone="warning" title="Illustrative estimate">
        {statement.disclaimer}
      </Alert>
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Tax payable (year)" value={formatMoneyCompact(statement.taxPayable)} meta={formatMoney(statement.taxPayable)} icon="bank" accent="magenta" />
        <StatCard label="Deducted so far" value={formatMoneyCompact(statement.taxDeducted)} meta={formatMoney(statement.taxDeducted)} icon="check" accent="cyan" />
        <StatCard label="Remaining" value={formatMoneyCompact(statement.balance)} meta={formatMoney(statement.balance)} icon="timer" accent="yellow" />
      </div>
      <div className="split">
        <Card labelledBy="comp-heading">
          <CardHeader id="comp-heading" title="Computation" />
          <CardBody>
            <dl className="lines">
              {statement.lines.map((line) => (
                <div key={line.label} className={cn("line", line.emphasis && "line--total")}>
                  <dt>{line.label}</dt>
                  <dd>
                    <MoneyText value={line.amount} />
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <Card labelledBy="tds-heading">
          <CardHeader id="tds-heading" title="Monthly TDS" description="Deducted and projected" />
          <ul className="list">
            {statement.monthlyTds.map((month) => (
              <li key={month.month} className="list-row">
                <div className="list-row-inner">
                  <span className="list-text">
                    <span className="list-title">{month.month}</span>
                  </span>
                  <span className="list-trailing">
                    {month.projected && <span className="badge">Projected</span>}
                    <MoneyText value={month.amount} className="cell-strong" />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* Declaration -------------------------------------------------------------- */

export function TaxDeclarationSection({ declaration }: { declaration: TaxDeclaration }) {
  const status = declaration.status === "submitted" ? { label: "Submitted", tone: "success" as const } : declaration.status === "locked" ? { label: "Locked", tone: "neutral" as const } : { label: "Draft", tone: "warning" as const };
  return (
    <div className="page">
      <PageHeader eyebrow={declaration.financialYear} title="IT declaration" description="Declare planned investments so the right tax is deducted each month." />
      <div className="grid grid-2">
        <Alert tone={declaration.window.open ? "info" : "neutral"} title={declaration.window.open ? `Declaration window open until ${formatDate(declaration.window.closesOn)}` : "Declaration window closed"}>
          {declaration.submittedAt ? `Last submitted ${formatDateTime(declaration.submittedAt)}.` : "You haven’t submitted this year’s declaration yet."} <StatusBadge status={status} />
        </Alert>
        <Alert tone="neutral" title="Proof of investment (POI)">
          {declaration.proofWindow.open
            ? `Upload proofs until ${formatDate(declaration.proofWindow.closesOn)} from Documents.`
            : `Proof submission opens ${formatDate(declaration.proofWindow.opensOn)}. Keep your receipts handy.`}
        </Alert>
      </div>
      <DeclarationForm declaration={declaration} />
    </div>
  );
}

/* Loans -------------------------------------------------------------------- */

const loanStatus = {
  requested: { label: "Awaiting Finance", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  active: { label: "Repaying", tone: "info" },
  closed: { label: "Closed", tone: "neutral" },
  rejected: { label: "Rejected", tone: "danger" },
} as const;

export function LoansSection({ loans }: { loans: Loan[] }) {
  const active = loans.filter((loan) => loan.state === "active");
  return (
    <div className="page">
      <PageHeader title="Loans & advances" description="Track repayments or request an advance. Deductions appear on your payslip." actions={<LoanRequestSheet />} />
      {loans.length === 0 ? (
        <Card>
          <EmptyState icon="bank" title="No loans or advances" description="Requests you make will appear here with their repayment schedule." />
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <div className="grid grid-2">
              {active.map((loan) => (
                <Card key={loan.id} labelledBy={`loan-${loan.id}`}>
                  <CardHeader id={`loan-${loan.id}`} title={humanize(loan.type)} description={loan.reference} action={<StatusBadge status={loanStatus[loan.state]} />} />
                  <CardBody className="stack">
                    <Meter value={loan.paidInstallments} max={loan.tenureMonths} label={`${loan.paidInstallments} of ${loan.tenureMonths} installments paid`} tone="secondary" />
                    <KeyValueList
                      columns={3}
                      items={[
                        { label: "Outstanding", value: <MoneyText value={loan.outstanding} className="cell-strong" /> },
                        { label: "Monthly EMI", value: <MoneyText value={loan.emi} /> },
                        { label: "Installments", value: `${loan.paidInstallments} / ${loan.tenureMonths}` },
                      ]}
                    />
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
          <Card>
            <CardBody className="flush">
              <DataTable<Loan>
                caption="Loan and advance requests"
                rows={loans}
                rowKey={(row) => row.id}
                mobileRow={(row) => ({ title: humanize(row.type), meta: `${row.reference} · ${row.tenureMonths} months`, trailing: <StatusBadge status={loanStatus[row.state]} /> })}
                columns={[
                  { key: "type", header: "Type", rowHeader: true, cell: (row) => <span className="person-text"><span className="person-name">{humanize(row.type)}</span><span className="person-role">{row.reference}</span></span> },
                  { key: "principal", header: "Amount", align: "end", cell: (row) => <MoneyText value={row.principal} /> },
                  { key: "emi", header: "EMI", align: "end", cell: (row) => <MoneyText value={row.emi} /> },
                  { key: "tenure", header: "Tenure", cell: (row) => `${row.tenureMonths} months` },
                  { key: "status", header: "Status", cell: (row) => <StatusBadge status={loanStatus[row.state]} /> },
                  { key: "date", header: "Requested", cell: (row) => formatDateTime(row.requestedAt) },
                ]}
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

/* Compensation ------------------------------------------------------------- */

export function RevisionSection({ data }: { data: Compensation }) {
  return (
    <div className="page">
      <PageHeader title="Salary revision" description="Your current compensation structure and revision history." />
      <Alert tone="warning" title="Synthetic compensation">
        Figures are generated demo data, not a real salary band.
      </Alert>
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Annual CTC" value={formatMoneyCompact(data.annualCtc)} meta={formatMoney(data.annualCtc)} icon="wallet" accent="magenta" />
        <StatCard label="Monthly gross" value={formatMoneyCompact(data.monthlyGross)} meta={formatMoney(data.monthlyGross)} icon="payroll" accent="cyan" />
        <StatCard label="Last revision" value={data.revisions[0] ? `+${data.revisions[0].changePercent}%` : "—"} meta={data.revisions[0] ? `Effective ${formatDate(data.revisions[0].effectiveFrom)}` : "No revisions yet"} icon="trend" accent="yellow" />
      </div>
      <div className="split">
        <Card labelledBy="struct-heading">
          <CardHeader id="struct-heading" title="Salary structure" />
          <CardBody className="flush">
            <DataTable
              caption="Salary components"
              rows={data.components}
              rowKey={(row) => row.name}
              stackOnMobile
              columns={[
                { key: "name", header: "Component", rowHeader: true, cell: (row) => row.name },
                { key: "monthly", header: "Monthly", align: "end", cell: (row) => <MoneyText value={row.monthly} /> },
                { key: "annual", header: "Annual", align: "end", cell: (row) => <MoneyText value={row.annual} className="cell-strong" /> },
              ]}
            />
          </CardBody>
        </Card>
        <Card labelledBy="rev-heading">
          <CardHeader id="rev-heading" title="Revision history" />
          <CardBody>
            {data.revisions.length ? (
              <Timeline
                items={data.revisions.map((revision) => ({
                  id: revision.id,
                  title: `+${revision.changePercent}% · ${formatMoney(revision.newCtc, { decimals: false })}`,
                  detail: `${revision.reason} (from ${formatMoney(revision.previousCtc, { decimals: false })})`,
                  meta: (
                    <>
                      Effective <DateText value={revision.effectiveFrom} /> · Letter {revision.letterReference}
                    </>
                  ),
                }))}
              />
            ) : (
              <p className="muted">No revisions since joining.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
