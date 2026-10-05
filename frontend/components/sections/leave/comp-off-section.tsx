import { CompOffClaimSheet, EncashSheet, WithdrawClaimButton, WithdrawEncashButton } from "@/components/features/leave/comp-off-controls";
import { DecisionControls } from "@/components/features/leave/decision-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, MoneyText, PersonCell, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LeaveTabs } from "@/components/sections/leave/leave-calendar-sections";
import { decideCompOffAction, decideEncashmentAction } from "@/lib/actions/leave";
import { formatDate, formatDuration, formatMoney, formatUnits } from "@/lib/utils/format";
import { leaveStatus } from "@/lib/utils/tones";
import type { CompOffClaim, CompOffPage, Encashment } from "@/types/leave";

const creditBadge: Record<NonNullable<CompOffClaim["credit"]>, { label: string; tone: "success" | "neutral" | "danger" | "info" }> = {
  active: { label: "Credit live", tone: "success" },
  partly_used: { label: "Partly used", tone: "info" },
  used: { label: "Used", tone: "neutral" },
  lapsed: { label: "Lapsed", tone: "danger" },
};

function ClaimState({ claim }: { claim: CompOffClaim }) {
  return (
    <span className="time-actions">
      <StatusBadge status={leaveStatus[claim.state]} />
      {claim.credit && <Badge tone={creditBadge[claim.credit].tone}>{creditBadge[claim.credit].label}</Badge>}
    </span>
  );
}

function claimSubject(claim: CompOffClaim) {
  return `${claim.person.name}, ${formatDate(claim.workedDate, "medium")} (${formatUnits(claim.units)})`;
}

function ClaimsTable({ claims, caption, team }: { claims: CompOffClaim[]; caption: string; team: boolean }) {
  return (
    <DataTable<CompOffClaim>
      caption={caption}
      rows={claims}
      rowKey={(row) => row.id}
      empty={<EmptyState compact icon="calendar" title={team ? "No team claims" : "No comp-off claims yet"} description={team ? "Claims from people who report to you appear here." : "Worked a week-off or holiday? Claim it within 30 days."} />}
      mobileRow={(row) => ({
        title: team ? `${row.person.name} · ${formatDate(row.workedDate, "weekday")}` : formatDate(row.workedDate, "long"),
        meta: `${row.dayKind} · ${formatDuration(row.workedMinutes)} · ${formatUnits(row.units)}${row.expiresOn ? ` · expires ${formatDate(row.expiresOn, "short")}` : ""} · ${row.reference}`,
        trailing: row.canDecide ? <DecisionControls action={decideCompOffAction} id={row.id} version={row.version} subject={claimSubject(row)} /> : row.canCancel ? <WithdrawClaimButton id={row.id} /> : <ClaimState claim={row} />,
      })}
      columns={[
        ...(team ? [{ key: "person", header: "Employee", rowHeader: true, cell: (row: CompOffClaim) => <PersonCell person={row.person} /> }] : []),
        { key: "date", header: "Worked", rowHeader: !team, cell: (row) => <span className="person-text"><span className="person-name">{formatDate(row.workedDate, "weekday")}</span><span className="person-role">{row.dayKind} · {row.reference}</span></span> },
        { key: "punch", header: "Punches", className: "cell-wrap", cell: (row) => <span className="num">{row.punches} · {formatDuration(row.workedMinutes)}</span> },
        { key: "units", header: "Credit", align: "end", cell: (row) => <span className="num">{formatUnits(row.units)}</span> },
        { key: "reason", header: "Work done", hideOnMobile: true, className: "cell-wrap", cell: (row) => row.decisionNote ? <>{row.reason}<br /><span className="muted small">Note: {row.decisionNote}</span></> : row.reason },
        { key: "expiry", header: "Expires", cell: (row) => (row.expiresOn ? formatDate(row.expiresOn, "medium") : "—") },
        { key: "state", header: "Status", cell: (row) => <ClaimState claim={row} /> },
        {
          key: "actions",
          header: "Actions",
          align: "end",
          cell: (row) => (row.canDecide ? <DecisionControls action={decideCompOffAction} id={row.id} version={row.version} subject={claimSubject(row)} /> : row.canCancel ? <WithdrawClaimButton id={row.id} /> : <span className="muted">—</span>),
        },
      ]}
    />
  );
}

function EncashTable({ rows, caption, queue }: { rows: Encashment[]; caption: string; queue: boolean }) {
  const subject = (row: Encashment) => `${row.person.name}, ${row.leaveType} ${formatUnits(row.units)} (${formatMoney(row.amount)})`;
  return (
    <DataTable<Encashment>
      caption={caption}
      rows={rows}
      rowKey={(row) => row.id}
      empty={<EmptyState compact icon="moneyIn" title={queue ? "Nothing to review" : "No encashment requests"} description={queue ? "Employee encashment requests appear here for HR approval." : "Encash eligible leave within the policy limits."} />}
      mobileRow={(row) => ({
        title: queue ? `${row.person.name} · ${formatMoney(row.amount)}` : `${row.leaveType} · ${formatUnits(row.units)}`,
        meta: `${formatMoney(row.perDay)}/day · ${formatDate(row.payrollMonth, "month")} payroll · ${row.reference}`,
        trailing: row.canDecide ? <DecisionControls action={decideEncashmentAction} id={row.id} version={row.version} subject={subject(row)} /> : row.canCancel ? <WithdrawEncashButton id={row.id} /> : <StatusBadge status={leaveStatus[row.state]} />,
      })}
      columns={[
        ...(queue ? [{ key: "person", header: "Employee", rowHeader: true, cell: (row: Encashment) => <PersonCell person={row.person} /> }] : []),
        { key: "type", header: "Leave", rowHeader: !queue, cell: (row) => <span className="person-text"><span className="person-name">{row.leaveType}</span><span className="person-role">{row.source === "year_end" ? "Year-end auto" : "Request"} · {row.reference}</span></span> },
        { key: "units", header: "Days", align: "end", cell: (row) => <span className="num">{row.units}</span> },
        { key: "rate", header: "Per day", align: "end", hideOnMobile: true, cell: (row) => <MoneyText value={row.perDay} /> },
        { key: "amount", header: "Amount", align: "end", cell: (row) => <MoneyText value={row.amount} /> },
        { key: "month", header: "Payroll", cell: (row) => formatDate(row.payrollMonth, "month") },
        { key: "state", header: "Status", cell: (row) => <StatusBadge status={leaveStatus[row.state]} /> },
        { key: "actions", header: "Actions", align: "end", cell: (row) => (row.canDecide ? <DecisionControls action={decideEncashmentAction} id={row.id} version={row.version} subject={subject(row)} /> : row.canCancel ? <WithdrawEncashButton id={row.id} /> : <span className="muted">{row.decisionNote ?? "—"}</span>) },
      ]}
    />
  );
}

export function CompOffSection({ data, isManager }: { data: CompOffPage; isManager: boolean }) {
  const pendingTeam = data.team.filter((claim) => claim.state === "pending").length;
  const option = data.encashOptions[0];
  return (
    <div className="page">
      <PageHeader
        title="Comp-off & encashment"
        description="Claim time off for week-offs and holidays you worked, and encash eligible leave within policy limits."
        actions={<CompOffClaimSheet days={data.eligibleDays} today={data.today} windowDays={data.claimWindowDays} />}
      />
      <LeaveTabs active="comp-off" />
      <div className="grid grid-stats">
        <StatCard label="Comp-off balance" value={formatUnits(data.balance)} meta={data.nextExpiry ? `${formatUnits(data.nextExpiry.units)} expires ${formatDate(data.nextExpiry.date, "medium")}` : "No live credits"} icon="calendarCheck" accent="cyan" />
        <StatCard label="Days you can claim" value={data.eligibleDays.length} meta={`Week-offs/holidays worked in the last ${data.claimWindowDays} days`} icon="timer" accent="yellow" />
        <StatCard label="Encashable now" value={option ? formatUnits(option.maxNow) : "—"} meta={option ? `${option.name} · ${formatMoney(option.perDay)}/day` : "No encashable leave"} icon="moneyIn" accent="magenta" />
        {isManager && <StatCard label="Team claims to review" value={pendingTeam} meta="Awaiting your decision" icon="approvals" />}
      </div>

      <Card labelledBy="co-mine">
        <CardHeader id="co-mine" title="My comp-off claims" description={`Validated against face-device punches · credits expire ${data.expiryDays} days after the day worked`} />
        <CardBody className="flush">
          <ClaimsTable claims={data.mine} caption="My comp-off claims" team={false} />
        </CardBody>
      </Card>

      {isManager && (
        <Card labelledBy="co-team">
          <CardHeader id="co-team" title="Team claims" description="Approving credits the comp-off balance immediately; rejecting needs a reason." />
          <CardBody className="flush">
            <ClaimsTable claims={data.team} caption="Team comp-off claims" team />
          </CardBody>
        </Card>
      )}

      <Card labelledBy="en-mine">
        <CardHeader
          id="en-mine"
          title="Leave encashment"
          description="Amount = days × (basic ÷ 26), basic = 40% of monthly CTC less employer PF. HR approves; the payout is recorded for payroll."
          action={data.encashOptions.length ? <EncashSheet options={data.encashOptions} payrollMonth={data.payrollMonth} /> : undefined}
        />
        {option && (
          <CardBody>
            <p className="small muted">
              {option.name}: {formatUnits(option.available)} available · keep at least {formatUnits(option.retain)} · {formatUnits(option.remainingThisYear)} encashable left this year.
            </p>
          </CardBody>
        )}
        <CardBody className="flush">
          <EncashTable rows={data.encashments} caption="My encashment requests" queue={false} />
        </CardBody>
      </Card>

      {data.encashQueue && (
        <Card labelledBy="en-queue">
          <CardHeader id="en-queue" title="Encashment approvals (HR)" description={`Approvals now land in ${formatDate(data.payrollMonth, "month")} payroll (cut-off on the 20th).`} />
          <CardBody className="flush">
            <EncashTable rows={data.encashQueue} caption="Encashment approvals" queue />
          </CardBody>
        </Card>
      )}
      <Alert tone="info" title="Mock behaviour">
        Approved payouts are paid as “Leave encashment” in the target month’s payroll run (mock data; nothing is filed).
      </Alert>
    </div>
  );
}
