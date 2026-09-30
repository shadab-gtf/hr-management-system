import Link from "next/link";
import { PayrollRunActions } from "@/components/features/payroll/payroll-run-actions";
import { AddPayrollInputSheet, HoldSalarySheet, ReleaseSalarySheet, RemovePayrollInputButton } from "@/components/features/payroll/payroll-inputs";
import { Badge } from "@/components/ui/badge";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, DateText, KeyValueList, ListRow, Meter, MoneyText, PersonCell, StatusBadge, StepIndicator, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateTime, formatMoney, formatMoneyCompact, pluralize } from "@/lib/utils/format";
import { payrollStatus } from "@/lib/utils/tones";
import type { ComponentTotal, PayrollCommand, PayrollInput, PayrollOverview, PayrollRunDetail, PayrollRunState, PayrollRunSummary, RegisterRow, VarianceRow } from "@/types/payroll";

const STEPS = ["Inputs", "Validation", "Calculation", "Review", "Approval", "Publication", "Payment"];
const stepIndex: Record<PayrollRunState, number> = {
  draft: 0,
  calculating: 2,
  calculated: 3,
  rejected: 3,
  in_review: 4,
  approved: 5,
  published: 6,
  paid: 7,
};

function Totals({ run }: { run: PayrollRunSummary }) {
  return (
    <div className="totals">
      <StatCard label="Gross earnings" value={formatMoneyCompact(run.totals.gross)} meta={formatMoney(run.totals.gross)} icon="wallet" accent="cyan" />
      <StatCard label="Employee deductions" value={formatMoneyCompact(run.totals.employeeDeductions)} meta={formatMoney(run.totals.employeeDeductions)} icon="expenses" accent="yellow" />
      <StatCard label="Employer contributions" value={formatMoneyCompact(run.totals.employerContributions)} meta={formatMoney(run.totals.employerContributions)} icon="building" />
      <StatCard label="Net pay" value={formatMoneyCompact(run.totals.net)} meta={formatMoney(run.totals.net)} icon="payroll" accent="magenta" />
    </div>
  );
}

export function PayrollOverviewSection({ data }: { data: PayrollOverview }) {
  const current = data.current;
  return (
    <div className="page">
      <PageHeader
        eyebrow={data.payGroup}
        title="Payroll"
        description="Runs move from inputs to approval and publication. The operator who prepares a run can never approve it."
        actions={
          <>
            <ButtonLink href="/payroll/compensation" variant="secondary">
              <AppIcon name="upload" size={20} />
              Salary import
            </ButtonLink>
            <ButtonLink href="/payroll/structures" variant="secondary">
              <AppIcon name="layers" size={20} />
              Structures
            </ButtonLink>
            <ButtonLink href="/payroll/statutory" variant="secondary">
              <AppIcon name="shield" size={20} />
              Statutory
            </ButtonLink>
            {current && (
              <ButtonLink href={`/payroll/runs/${current.id}`} variant="primary">
                <AppIcon name="eye" size={20} />
                Open current run
              </ButtonLink>
            )}
          </>
        }
      />
      {current ? (
        <Card labelledBy="current-heading">
          <CardHeader
            id="current-heading"
            title={`${current.periodLabel} · revision ${current.revision}`}
            description={`${pluralize(current.employeeCount, "employee")} · pays on ${formatDateTime(`${current.paymentDate}T06:30:00Z`).split(",")[0]}`}
            action={<StatusBadge status={payrollStatus[current.state]} />}
          />
          <CardBody className="stack">
            <StepIndicator label="Payroll run progress" steps={STEPS} current={stepIndex[current.state]} />
            <Totals run={current} />
            {(current.blockers > 0 || current.warnings > 0) && (
              <Alert tone={current.blockers ? "danger" : "warning"} title={current.blockers ? `${pluralize(current.blockers, "blocker")} must be resolved` : `${pluralize(current.warnings, "warning")} to review`} action={<ButtonLink href={`/payroll/runs/${current.id}`} size="sm">Review</ButtonLink>}>
                Validation issues are listed in the run workbench.
              </Alert>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <EmptyState icon="payroll" title="No open run" description="The next run is created after the input cut-off." />
        </Card>
      )}

      <div className="split">
        <Card labelledBy="history-heading">
          <CardHeader id="history-heading" title="Previous runs" />
          <CardBody className="flush">
            <DataTable<PayrollRunSummary>
              caption="Previous payroll runs"
              rows={data.history}
              rowKey={(row) => row.id}
              mobileRow={(row) => ({
                href: `/payroll/runs/${row.id}`,
                title: row.periodLabel,
                meta: <MoneyText value={row.totals.net} />,
                trailing: <StatusBadge status={payrollStatus[row.state]} />,
              })}
              columns={[
                { key: "period", header: "Period", rowHeader: true, cell: (row) => <Link className="person-link person-name" href={`/payroll/runs/${row.id}`}>{row.periodLabel}</Link> },
                { key: "state", header: "Status", cell: (row) => <StatusBadge status={payrollStatus[row.state]} /> },
                { key: "count", header: "Employees", align: "end", hideOnMobile: true, cell: (row) => <span className="num">{row.employeeCount}</span> },
                { key: "net", header: "Net total", align: "end", cell: (row) => <MoneyText value={row.totals.net} /> },
                { key: "paid", header: "Payment date", hideOnMobile: true, cell: (row) => <DateText value={row.paymentDate} /> },
                {
                  key: "export",
                  header: "Report",
                  align: "end",
                  cell: (row) => (
                    <a className="button button--ghost button--sm" href={`/api/payroll/runs/${row.id}/register.csv`} download aria-label={`Download ${row.periodLabel} payroll register (CSV)`}>
                      <AppIcon name="download" size={16} />
                      CSV
                    </a>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
        <Card labelledBy="ready-heading">
          <CardHeader id="ready-heading" title="Input readiness" description="Current period" />
          <CardBody className="readiness">
            {data.readiness.map((item) => (
              <div key={item.label} className="readiness-row">
                <div className="readiness-head">
                  <span>{item.label}</span>
                  <span className={cn("num", item.tone === "warning" && "text-danger")}>
                    {item.done}/{item.total}
                  </span>
                </div>
                <Meter value={item.done} max={item.total} label={`${item.label}: ${item.done} of ${item.total}`} tone={item.tone === "success" ? "secondary" : "warning"} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export function PayrollRunSection({ run }: { run: PayrollRunDetail }) {
  const commands: PayrollCommand[] = [];
  if (run.commands.canSubmit) commands.push("submit");
  if (run.commands.canReject) commands.push("reject");
  if (run.commands.canApprove) commands.push("approve");
  if (run.commands.canPublish) commands.push("publish");
  const earnings = run.components.filter((c) => c.kind === "earning");
  const deductions = run.components.filter((c) => c.kind !== "earning");
  return (
    <div className="page">
      <PageHeader
        eyebrow={run.payGroup}
        title={`${run.periodLabel} payroll`}
        back={{ href: "/payroll", label: "Payroll" }}
        actions={
          <>
            <a className="button button--secondary" href={`/api/payroll/runs/${run.id}/register.csv`} download>
              <AppIcon name="download" size={20} />
              Payroll register
            </a>
            {commands.length ? (
            <PayrollRunActions
              commands={commands}
              facts={{
                runId: run.id,
                revision: run.revision,
                payGroup: run.payGroup,
                period: run.periodLabel,
                employees: run.employeeCount,
                net: formatMoney(run.totals.net),
                digest: run.inputDigest,
              }}
            />
            ) : null}
          </>
        }
      />
      <Card>
        <CardBody className="stack">
          <div className="cluster">
            <StatusBadge status={payrollStatus[run.state]} />
            <div className="run-meta">
              <span>Revision {run.revision}</span>
              <span>Prepared by {run.preparedBy.name}</span>
              {run.approvedBy && <span>Approved by {run.approvedBy.name}</span>}
              <span>Updated {formatDateTime(run.updatedAt)}</span>
            </div>
          </div>
          <StepIndicator label="Payroll run progress" steps={STEPS} current={stepIndex[run.state]} />
          {run.commands.blockedReason && (
            <Alert tone="info" title="Waiting on someone else">
              {run.commands.blockedReason}
            </Alert>
          )}
          {run.state === "published" && (
            <Alert tone="info" title="Published is not paid">
              Payslips are visible to employees. Payment is confirmed only after the bank file is reconciled.
            </Alert>
          )}
        </CardBody>
      </Card>

      <Totals run={run} />

      <Card labelledBy="stat-heading">
        <CardHeader id="stat-heading" title="Statutory this period" description="Employee and employer contributions from the statutory engine" action={<ButtonLink href={`/payroll/statutory?month=${run.periodStart.slice(0, 7)}`} size="sm">Compliance hub</ButtonLink>} />
        <CardBody>
          <KeyValueList
            columns={3}
            items={[
              { label: "EPF + VPF (employee)", value: <MoneyText value={run.statutory.pfEmployee} /> },
              { label: "EPS, EPF, EDLI, admin (employer)", value: <MoneyText value={run.statutory.pfEmployer} /> },
              { label: "ESI (employee + employer)", value: <MoneyText value={run.statutory.esi} /> },
              { label: "Professional tax", value: <MoneyText value={run.statutory.pt} /> },
              { label: "Labour welfare fund", value: <MoneyText value={run.statutory.lwf} /> },
              { label: "TDS u/s 192", value: <MoneyText value={run.statutory.tds} /> },
            ]}
          />
        </CardBody>
      </Card>

      <div className="split split--wide-aside">
        <div className="stack">
          <RunInputsCard run={run} />
          <RunHoldsCard run={run} />
          <Card labelledBy="issues-heading">
            <CardHeader id="issues-heading" title="Validation" description={`${pluralize(run.blockers, "blocker")} · ${pluralize(run.warnings, "warning")}`} />
            {run.issues.length ? (
              <div className="card-body flush">
                {run.issues.map((issue) => (
                  <div key={issue.id} className="issue">
                    <AppIcon name={issue.severity === "blocker" ? "danger" : "warning"} className={`issue-icon--${issue.severity}`} label={issue.severity === "blocker" ? "Blocker" : "Warning"} />
                    <div className="issue-text">
                      <p>
                        {issue.employee && <strong>{issue.employee.name}: </strong>}
                        {issue.message}
                      </p>
                      <p>{issue.resolution}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState compact icon="check" title="No validation issues" description="All inputs passed validation for this run." />
            )}
          </Card>
          <Card labelledBy="variance-heading">
            <CardHeader id="variance-heading" title="Variance vs previous period" description="Every change needs an explanation before approval" />
            <CardBody className="flush">
              <DataTable<VarianceRow>
                caption="Net pay variance by employee"
                rows={run.variances}
                rowKey={(row) => `${row.employee.id}-${row.component}`}
                mobileRow={(row) => ({
                  leading: <Avatar initials={row.employee.initials} seed={row.employee.id} src={row.employee.photoUrl} />,
                  title: row.employee.name,
                  meta: row.explanation ?? "Needs explanation",
                  trailing: (
                    <span className={row.change.amount.startsWith("-") ? "change-down num" : "change-up num"}>
                      {row.change.amount.startsWith("-") ? "" : "+"}
                      {formatMoney(row.change)}
                    </span>
                  ),
                })}
                empty={<EmptyState compact icon="check" title="No variances" description="Net pay matches the previous period for everyone." />}
                columns={[
                  { key: "employee", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.employee} /> },
                  { key: "previous", header: "Previous", align: "end", hideOnMobile: true, cell: (row) => <MoneyText value={row.previous} /> },
                  { key: "current", header: "Current", align: "end", cell: (row) => <MoneyText value={row.current} /> },
                  {
                    key: "change",
                    header: "Change",
                    align: "end",
                    cell: (row) => (
                      <span className={row.change.amount.startsWith("-") ? "change-down num" : "change-up num"}>
                        {row.change.amount.startsWith("-") ? "" : "+"}
                        {formatMoney(row.change)}
                        {row.changePercent !== "new" ? ` (${row.changePercent}%)` : ""}
                      </span>
                    ),
                  },
                  { key: "why", header: "Explanation", className: "cell-wrap", cell: (row) => row.explanation ?? <span className="text-danger">Needs explanation</span> },
                ]}
              />
            </CardBody>
          </Card>
        </div>
        <div className="stack">
          <BankAdviceCard run={run} />
          <ComponentCard title="Earnings" items={earnings} />
          <ComponentCard title="Deductions & employer costs" items={deductions} />
          <Card labelledBy="audit-heading">
            <CardHeader id="audit-heading" title="Audit trail" />
            <CardBody>
              {run.audit.length ? (
                <Timeline items={run.audit.map((entry, index) => ({ id: String(index), title: entry.event, meta: `${entry.actor} · ${formatDateTime(entry.at)}` }))} />
              ) : (
                <p className="muted">Historical run — detailed audit available in the audit log.</p>
              )}
              <p className="digest muted">{run.inputDigest}</p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card labelledBy="register-heading">
        <CardHeader id="register-heading" title="Employee register" description={`${pluralize(run.register.length, "employee")} · statutory deductions per employee`} />
        <details className="stat-details">
          <summary>Show all employees</summary>
          <DataTable<RegisterRow>
            caption="Employee payroll register"
            rows={run.register}
            rowKey={(row) => row.employee.id}
            mobileRow={(row) => ({
              leading: <Avatar initials={row.employee.initials} seed={row.employee.id} src={row.employee.photoUrl} />,
              title: row.employee.name,
              meta: `${row.state} · PF ${formatMoney(row.pf)} · TDS ${formatMoney(row.tds)}${row.held ? " · On hold" : ""}`,
              trailing: <MoneyText value={row.net} className="cell-strong" />,
            })}
            columns={[
              { key: "employee", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.employee} meta={`${row.code} · ${row.state}`} /> },
              { key: "days", header: "Payable days", align: "end", cell: (row) => <span className="num">{row.payableDays}{row.lopDays !== "0" ? ` (LOP ${row.lopDays})` : ""}</span> },
              { key: "gross", header: "Gross", align: "end", cell: (row) => <MoneyText value={row.gross} /> },
              { key: "pf", header: "PF", align: "end", cell: (row) => <MoneyText value={row.pf} /> },
              { key: "pt", header: "PT", align: "end", cell: (row) => <MoneyText value={row.pt} /> },
              { key: "tds", header: "TDS", align: "end", cell: (row) => <MoneyText value={row.tds} /> },
              { key: "net", header: "Net", align: "end", cell: (row) => <MoneyText value={row.net} className="cell-strong" /> },
              { key: "status", header: "Payment", cell: (row) => (row.held ? <Badge tone="warning">On hold</Badge> : row.bankStatus !== "verified" ? <Badge tone="danger">Bank unverified</Badge> : <Badge tone="success">Payable</Badge>) },
            ]}
          />
        </details>
      </Card>
    </div>
  );
}

const inputTone: Record<PayrollInput["kind"], "success" | "info" | "warning" | "danger" | "neutral"> = {
  bonus: "success",
  incentive: "success",
  arrears: "info",
  other_deduction: "danger",
  lop_override: "warning",
};

function RunInputsCard({ run }: { run: PayrollRunDetail }) {
  return (
    <Card labelledBy="inputs-heading">
      <CardHeader
        id="inputs-heading"
        title="Payroll inputs"
        description={run.commands.inputsLockedReason ?? "One-time earnings, deductions and LOP overrides for this period"}
        action={run.commands.canEditInputs ? <AddPayrollInputSheet runId={run.id} employees={run.inputEmployees} periodMonth={run.periodStart.slice(0, 7)} /> : undefined}
      />
      <CardBody className="flush">
        <DataTable<PayrollInput>
          caption="Payroll inputs for this period"
          rows={run.inputs}
          rowKey={(row) => row.id}
          mobileRow={(row) => ({
            leading: <Avatar initials={row.employee.initials} seed={row.employee.id} src={row.employee.photoUrl} />,
            title: `${row.employee.name} · ${row.label}`,
            meta: row.note,
            trailing: row.amount ? <MoneyText value={row.amount} className="cell-strong" /> : <span className="num">{row.lopDays} days</span>,
          })}
          empty={<EmptyState compact icon="note" title="No inputs this period" description="Bonuses, incentives, arrears, recoveries and LOP overrides appear here." />}
          columns={[
            { key: "employee", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.employee} meta={row.employeeCode} /> },
            { key: "kind", header: "Type", cell: (row) => <Badge tone={inputTone[row.kind]}>{row.label}</Badge> },
            {
              key: "value",
              header: "Amount / days",
              align: "end",
              cell: (row) => (row.amount ? <MoneyText value={row.amount} /> : <span className="num">{row.lopDays} days</span>),
            },
            {
              key: "note",
              header: "Reason",
              className: "cell-wrap",
              cell: (row) => (
                <>
                  {row.note}
                  {row.arrearsFrom && <span className="kv-hint">{`${row.arrearsMonths} month${row.arrearsMonths === 1 ? "" : "s"} from ${formatDate(row.arrearsFrom, "month")}`}</span>}
                  <span className="kv-hint">{`${row.addedBy} · ${formatDateTime(row.addedAt)}`}</span>
                </>
              ),
            },
            ...(run.commands.canEditInputs ? [{ key: "remove", header: "Action", align: "end" as const, cell: (row: PayrollInput) => <RemovePayrollInputButton runId={run.id} inputId={row.id} /> }] : []),
          ]}
        />
      </CardBody>
    </Card>
  );
}

function RunHoldsCard({ run }: { run: PayrollRunDetail }) {
  const active = run.holds.filter((hold) => !hold.releasedAt);
  return (
    <Card labelledBy="holds-heading">
      <CardHeader
        id="holds-heading"
        title="Salary holds"
        description={active.length ? `${pluralize(active.length, "salary", "salaries")} held from the bank advice` : "No salaries on hold"}
        action={run.commands.canHold ? <HoldSalarySheet runId={run.id} employees={run.inputEmployees} /> : undefined}
      />
      {run.holds.length ? (
        <ul className="list">
          {run.holds.map((hold) => (
            <ListRow
              key={hold.id}
              leading={<Avatar initials={hold.employee.initials} seed={hold.employee.id} src={hold.employee.photoUrl} />}
              title={hold.employee.name}
              meta={
                hold.releasedAt
                  ? `Released by ${hold.releasedBy} · ${formatDateTime(hold.releasedAt)} — ${hold.releaseNote ?? ""}`
                  : `${hold.reason} · held by ${hold.heldBy}, ${formatDateTime(hold.heldAt)}`
              }
              trailing={
                <>
                  <MoneyText value={hold.net} />
                  {hold.releasedAt ? <Badge tone="success">Released</Badge> : <Badge tone="warning">On hold</Badge>}
                  {!hold.releasedAt && run.commands.canHold && <ReleaseSalarySheet runId={run.id} holdId={hold.id} name={hold.employee.name} />}
                </>
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="lock" title="No holds" description="Held salaries still get a payslip but are excluded from the bank file." />
      )}
    </Card>
  );
}

function BankAdviceCard({ run }: { run: PayrollRunDetail }) {
  const advice = run.bankAdvice;
  return (
    <Card labelledBy="bank-heading">
      <CardHeader id="bank-heading" title="Bank advice (NEFT)" description={`Batch ${advice.batchReference}`} />
      <CardBody className="stack">
        {advice.available ? (
          <>
            <KeyValueList
              columns={1}
              items={[
                { label: "Transfers in file", value: <span className="num">{advice.payableCount}</span> },
                { label: "File total", value: <MoneyText value={advice.payableAmount} className="cell-strong" /> },
                { label: "Excluded", value: <span className="num">{advice.excluded.length}</span> },
              ]}
            />
            {advice.canExport ? (
              <a className="button button--primary" href={`/api/payroll/runs/${run.id}/bank-advice.csv`} download>
                <AppIcon name="download" size={20} />
                Download bank advice (CSV)
              </a>
            ) : (
              <p className="notice-strip">
                <AppIcon name="lock" size={16} />
                Finance (payment export) downloads the bank file.
              </p>
            )}
          </>
        ) : (
          <p className="muted">{advice.reason}</p>
        )}
        {advice.excluded.length > 0 && (
          <div className="stack">
            <h3 className="stat-subhead">Excluded from the file</h3>
            <ul className="list">
              {advice.excluded.map((item) => (
                <ListRow key={item.employee.id} title={item.employee.name} meta={item.reason} trailing={<MoneyText value={item.net} />} />
              ))}
            </ul>
          </div>
        )}
        {advice.exports.length > 0 && (
          <p className="field-hint">
            {`Last exported ${formatDateTime(advice.exports[0]?.at ?? "")} by ${advice.exports[0]?.by ?? ""} · ${pluralize(advice.exports.length, "export")} of the same batch (no duplicate liability).`}
          </p>
        )}
        <p className="field-hint">Generated from mock data — not sent to any bank. Payment is confirmed only after bank reconciliation.</p>
      </CardBody>
    </Card>
  );
}

function ComponentCard({ title, items }: { title: string; items: ComponentTotal[] }) {
  return (
    <Card labelledBy={`${title}-heading`}>
      <CardHeader id={`${title}-heading`} title={title} />
      <CardBody>
        <dl className="lines">
          {items.map((item) => (
            <div key={item.code} className="line">
              <dt>
                {item.name}
                {item.kind === "employer" && <span className="kv-hint">Employer cost</span>}
              </dt>
              <dd>
                <MoneyText value={item.amount} />
              </dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}
