import type { ReactNode } from "react";
import { PrintButton } from "@/components/features/payslips/print-button";
import { AddLineSheet, PaymentSheet, PrepareSettlementForm, RecalculateButton, RemoveLineButton, SettlementDecisionSheet, SubmitSettlementButton, WaiverSheet } from "@/components/features/lifecycle/settlement-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, KeyValueList, MoneyText, PersonCell, StatusBadge, StepIndicator, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import { settlementStatus, settlementStep, settlementSteps } from "@/components/sections/lifecycle/labels";
import type { Money } from "@/types/common";
import type { SettlementBoard, SettlementDetail, SettlementLine } from "@/types/lifecycle";

const negative = (money: Money) => money.amount.startsWith("-");
const abs = (money: Money): Money => ({ ...money, amount: money.amount.replace("-", "") });

export function SettlementsSection({ board, tabs }: { board: SettlementBoard; tabs: ReactNode }) {
  const count = (state: string) => board.settlements.filter((item) => item.state === state).length;
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Full & final settlements" description="Maker prepares from the last working day; a different checker approves; then payment is recorded with the UTR." />
      {tabs}
      <div className="grid grid-stats">
        <StatCard label="To prepare" value={board.eligible.length} meta="Exits without a settlement" icon="calculator" accent="cyan" />
        <StatCard label="Drafts" value={count("draft") + count("rejected")} meta="Including sent back" icon="edit" />
        <StatCard label="Awaiting approval" value={count("submitted")} meta="Checker step" icon="clipboard" accent="yellow" />
        <StatCard label="Approved, unpaid" value={count("approved")} meta="Record the payment" icon="moneyOut" accent="magenta" />
      </div>
      {board.canPrepare && (
        <Card labelledBy="fnf-prepare">
          <CardHeader id="fnf-prepare" title="Prepare a settlement" description="Salary to the last day, leave encashment, gratuity, notice recovery, reimbursements, loans and unreturned assets are calculated automatically." />
          <CardBody>
            {board.eligible.length ? (
              <PrepareSettlementForm options={board.eligible.map((item) => ({ value: item.person.id, label: `${item.person.name} · last day ${formatDate(item.lastWorkingDay, "short")}` }))} />
            ) : (
              <p className="muted">Every open exit already has a settlement.</p>
            )}
          </CardBody>
        </Card>
      )}
      <Card labelledBy="fnf-list">
        <CardHeader id="fnf-list" title="Settlements" />
        <CardBody className="flush">
          <DataTable
            caption="Full and final settlements"
            rows={board.settlements}
            rowKey={(row) => row.id}
            empty={<EmptyState icon="calculator" title="No settlements yet" description="Prepare one when an employee's exit starts." />}
            mobileRow={(row) => ({ title: `${row.person.name} · ${row.reference}`, meta: `${settlementStatus[row.state].label} · last day ${formatDate(row.lastWorkingDay, "short")}`, trailing: <MoneyText value={row.net} />, href: `/admin/settlements/${row.id}` })}
            columns={[
              { key: "person", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.person} href={`/admin/settlements/${row.id}`} meta={row.department} /> },
              { key: "ref", header: "Reference", cell: (row) => row.reference },
              { key: "lwd", header: "Last day", cell: (row) => formatDate(row.lastWorkingDay) },
              { key: "state", header: "Status", cell: (row) => <StatusBadge status={settlementStatus[row.state]} /> },
              { key: "by", header: "Prepared by", cell: (row) => row.preparedBy },
              { key: "net", header: "Net", align: "end", cell: (row) => <MoneyText value={row.net} /> },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function Lines({ lines, kind, settlement }: { lines: SettlementLine[]; kind: "earning" | "deduction"; settlement: SettlementDetail }) {
  const rows = lines.filter((line) => line.kind === kind);
  return (
    <DataTable
      caption={kind === "earning" ? "Earnings" : "Deductions and recoveries"}
      rows={rows}
      rowKey={(row) => row.id}
      empty={<p className="small muted">None.</p>}
      columns={[
        { key: "label", header: kind === "earning" ? "Earning" : "Deduction", rowHeader: true, cell: (row) => <span className="stack-tight"><strong>{row.label}</strong><span className="small muted">{row.manual ? `Manual — ${row.reason ?? ""}` : row.detail}</span></span> },
        { key: "amount", header: "Amount", align: "end", cell: (row) => <MoneyText value={row.amount} /> },
        ...(settlement.permissions.canEdit ? [{ key: "act", header: "Action", align: "end" as const, cell: (row: SettlementLine) => (row.manual ? <RemoveLineButton id={settlement.id} lineId={row.id} /> : <span className="small muted">Auto</span>) }] : []),
      ]}
    />
  );
}

export function SettlementDetailSection({ settlement, today, tabs }: { settlement: SettlementDetail; today: string; tabs: ReactNode }) {
  const net = settlement.net;
  const p = settlement.permissions;
  return (
    <div className="page">
      <PageHeader
        eyebrow="F&F settlement"
        title={`${settlement.person.name} · ${settlement.reference}`}
        description={`${settlement.designation} · ${settlement.department} · last working day ${formatDate(settlement.lastWorkingDay)}`}
        back={{ href: "/admin/settlements", label: "All settlements" }}
        actions={
          <ButtonLink href={`/admin/settlements/${settlement.id}/statement`} variant="secondary">
            <AppIcon name="printer" size={20} />
            Statement
          </ButtonLink>
        }
      />
      {tabs}
      <StepIndicator steps={settlementSteps} current={settlementStep(settlement.state)} label="Settlement progress" />
      {settlement.state === "rejected" && settlement.rejectionNote && <Alert tone="danger" title="Sent back by the approver">{settlement.rejectionNote}</Alert>}
      {settlement.warnings.map((warning) => (
        <Alert key={warning} tone="warning">{warning}</Alert>
      ))}
      <div className="split">
        <div className="stack">
          <Card labelledBy="fnf-earnings">
            <CardHeader id="fnf-earnings" title="Earnings" action={p.canEdit ? <AddLineSheet id={settlement.id} version={settlement.version} /> : undefined} />
            <CardBody className="flush">
              <Lines lines={settlement.lines} kind="earning" settlement={settlement} />
            </CardBody>
          </Card>
          <Card labelledBy="fnf-deductions">
            <CardHeader id="fnf-deductions" title="Deductions & recoveries" action={p.canEdit && settlement.noticeShortfallDays > 0 ? <WaiverSheet id={settlement.id} version={settlement.version} waived={settlement.noticeWaived} days={settlement.noticeShortfallDays} /> : undefined} />
            <CardBody className="flush">
              <Lines lines={settlement.lines} kind="deduction" settlement={settlement} />
            </CardBody>
          </Card>
          <Card labelledBy="fnf-audit">
            <CardHeader id="fnf-audit" title="Audit trail" />
            <CardBody>
              <Timeline items={settlement.audit.map((entry) => ({ id: entry.id, title: entry.event, meta: `${entry.actor} · ${formatDateTime(entry.at)}`, detail: entry.note ?? undefined }))} />
            </CardBody>
          </Card>
        </div>
        <div className="stack sticky-aside">
          <Card labelledBy="fnf-total">
            <CardHeader id="fnf-total" title={negative(net) ? "Net recoverable" : "Net payable"} action={<StatusBadge status={settlementStatus[settlement.state]} />} />
            <CardBody className="stack">
              <p className="lc-net num">{formatMoney(abs(net))}</p>
              <dl className="lines">
                <div className="line"><dt>Earnings</dt><dd><MoneyText value={settlement.earnings} /></dd></div>
                <div className="line"><dt>Deductions</dt><dd><MoneyText value={settlement.deductions} /></dd></div>
                <div className="line line--total"><dt>{negative(net) ? "Recover from employee" : "Pay to employee"}</dt><dd><MoneyText value={abs(net)} /></dd></div>
              </dl>
              {p.canEdit && (
                <div className="button-row">
                  <RecalculateButton id={settlement.id} version={settlement.version} />
                  <SubmitSettlementButton id={settlement.id} version={settlement.version} />
                </div>
              )}
              {p.canApprove && <SettlementDecisionSheet id={settlement.id} version={settlement.version} />}
              {p.approveBlockedReason && <Alert tone="info">{p.approveBlockedReason}</Alert>}
              {p.canPay && <PaymentSheet id={settlement.id} version={settlement.version} today={today} />}
              {settlement.state === "paid" && <Alert tone="success" title="Paid">{`UTR ${settlement.utr ?? ""} · ${settlement.paidOn ? formatDate(settlement.paidOn) : ""}`}</Alert>}
            </CardBody>
          </Card>
          <Card labelledBy="fnf-basis">
            <CardHeader id="fnf-basis" title="Basis" />
            <CardBody>
              <KeyValueList
                columns={1}
                items={[
                  { label: "Employee code", value: settlement.code },
                  { label: "Joined", value: formatDate(settlement.joinedOn) },
                  { label: "Service", value: settlement.service },
                  { label: "Type", value: settlement.employmentType },
                  { label: "Monthly gross", value: <MoneyText value={settlement.monthlyGross} /> },
                  { label: "Monthly basic", value: <MoneyText value={settlement.monthlyBasic} /> },
                  { label: "Notice", value: `${settlement.noticeDays} days${settlement.noticeShortfallDays ? ` · ${settlement.noticeShortfallDays} short${settlement.noticeWaived ? " (waived)" : ""}` : ""}`, hint: settlement.waiverReason ?? undefined },
                  { label: "Prepared by", value: `${settlement.preparedBy} · ${formatDateTime(settlement.preparedAt)}` },
                  ...(settlement.approvedBy ? [{ label: "Approved by", value: `${settlement.approvedBy}${settlement.approvedAt ? ` · ${formatDateTime(settlement.approvedAt)}` : ""}` }] : []),
                ]}
              />
              <p className="small muted">Synthetic calculation for the mock backend — not statutory or tax advice. Finance confirms real gratuity, encashment and TDS treatment.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function SettlementStatement({ settlement, company }: { settlement: SettlementDetail; company: string }) {
  const earnings = settlement.lines.filter((line) => line.kind === "earning");
  const deductions = settlement.lines.filter((line) => line.kind === "deduction");
  const net = settlement.net;
  return (
    <div className="page">
      <div className="no-print button-row">
        <ButtonLink href={`/admin/settlements/${settlement.id}`} variant="ghost">
          <AppIcon name="back" size={20} />
          Back to settlement
        </ButtonLink>
        <PrintButton label="Print / Save as PDF" />
      </div>
      <article className="lc-paper" aria-labelledby="stmt-title">
        <header className="lc-paper-head">
          <p className="lc-paper-org">{company}</p>
          <h1 id="stmt-title">Full & final settlement statement</h1>
          <p className="small muted">{settlement.reference} · {settlementStatus[settlement.state].label}</p>
        </header>
        <KeyValueList
          items={[
            { label: "Employee", value: `${settlement.person.name} (${settlement.code})` },
            { label: "Designation", value: `${settlement.designation}, ${settlement.department}` },
            { label: "Date of joining", value: formatDate(settlement.joinedOn) },
            { label: "Last working day", value: formatDate(settlement.lastWorkingDay) },
            { label: "Length of service", value: settlement.service },
            { label: "Notice", value: `${settlement.noticeDays} days${settlement.noticeShortfallDays ? `, ${settlement.noticeShortfallDays} short${settlement.noticeWaived ? " (waived)" : ""}` : ""}` },
          ]}
        />
        <table className="lc-statement">
          <caption className="sr-only">Settlement lines</caption>
          <thead>
            <tr><th scope="col">Particulars</th><th scope="col" className="cell-end">Amount</th></tr>
          </thead>
          <tbody>
            <tr className="lc-statement-group"><th scope="rowgroup" colSpan={2}>Earnings</th></tr>
            {earnings.map((line) => (
              <tr key={line.id}><th scope="row">{line.label}<span className="small muted"> — {line.manual ? line.reason : line.detail}</span></th><td className="cell-end"><MoneyText value={line.amount} /></td></tr>
            ))}
            <tr className="lc-statement-total"><th scope="row">Total earnings</th><td className="cell-end"><MoneyText value={settlement.earnings} /></td></tr>
            <tr className="lc-statement-group"><th scope="rowgroup" colSpan={2}>Deductions & recoveries</th></tr>
            {deductions.map((line) => (
              <tr key={line.id}><th scope="row">{line.label}<span className="small muted"> — {line.manual ? line.reason : line.detail}</span></th><td className="cell-end"><MoneyText value={line.amount} /></td></tr>
            ))}
            <tr className="lc-statement-total"><th scope="row">Total deductions</th><td className="cell-end"><MoneyText value={settlement.deductions} /></td></tr>
            <tr className="lc-statement-net"><th scope="row">{negative(net) ? "Net recoverable from employee" : "Net payable to employee"}</th><td className="cell-end"><MoneyText value={abs(net)} /></td></tr>
          </tbody>
        </table>
        <KeyValueList
          items={[
            { label: "Prepared by", value: `${settlement.preparedBy}, ${formatDateTime(settlement.preparedAt)}` },
            { label: "Approved by", value: settlement.approvedBy ? `${settlement.approvedBy}${settlement.approvedAt ? `, ${formatDateTime(settlement.approvedAt)}` : ""}` : "Pending" },
            { label: "Payment", value: settlement.utr ? `UTR ${settlement.utr}${settlement.paidOn ? `, ${formatDate(settlement.paidOn)}` : ""}` : "Not paid" },
          ]}
        />
        <p className="small muted">Generated from mock data by GTF HR. Not a statutory document; figures are synthetic.</p>
      </article>
    </div>
  );
}
