import { AdjustBalanceSheet, LedgerEmployeePicker, YearEndCommit } from "@/components/features/leave/leave-admin-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, KeyValueList, ListRow, MoneyText, PersonCell } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { LeaveLedgerCard } from "@/components/sections/leave/leave-ledger-card";
import { formatDate, formatDateTime, formatMoney, formatUnits } from "@/lib/utils/format";
import type { PersonRef } from "@/types/common";
import type { LeaveLedger, YearEnd, YearEndRow } from "@/types/leave";

export function YearEndCard({ data }: { data: YearEnd }) {
  const committed = data.state === "committed";
  return (
    <Card labelledBy="ye-heading">
      <CardHeader
        id="ye-heading"
        title={`Year-end processing ${data.year}`}
        description={committed ? "Committed — entries are scheduled for 31 Dec and 1 Jan. It can't run twice." : `Preview as of ${formatDate(data.asOf, "medium")}: projected closing balance (monthly accruals through December, pending requests deducted).`}
        action={<Badge tone={committed ? "success" : "warning"}>{committed ? "Committed" : "Preview"}</Badge>}
      />
      <CardBody className="stack">
        <div className="grid grid-stats">
          <StatCard label="Carry forward" value={formatUnits(data.totals.carryForward)} meta={`${data.totals.employees} employees`} icon="repeat" accent="cyan" />
          <StatCard label="Encash" value={formatUnits(data.totals.encash)} meta={formatMoney(data.totals.encashAmount, { decimals: false })} icon="moneyIn" accent="magenta" />
          <StatCard label="Lapse" value={formatUnits(data.totals.lapse)} meta="Above carry-forward and encashment limits" icon="warning" accent="yellow" />
        </div>
        {data.lastRun && (
          <KeyValueList
            columns={3}
            items={[
              { label: "Last run", value: `${data.lastRun.year} · ${formatDateTime(data.lastRun.at)}` },
              { label: "Run by", value: data.lastRun.by },
              { label: "Result", value: `${data.lastRun.rows} balances · CF ${data.lastRun.carryForward} · encash ${data.lastRun.encash} · lapse ${data.lastRun.lapse} days` },
            ]}
          />
        )}
      </CardBody>
      <CardBody className="flush">
        <DataTable<YearEndRow>
          caption={`Year-end ${data.year} per employee and leave type`}
          rows={data.rows}
          rowKey={(row) => `${row.person.id}-${row.leaveType}`}
          empty={<EmptyState compact icon="calendar" title="Nothing to process" description="No balances to carry, encash or lapse." />}
          mobileRow={(row) => ({
            title: `${row.person.name} · ${row.leaveType}`,
            meta: `Closing ${row.closing} · CF ${row.carryForward} · encash ${row.encash} · lapse ${row.lapse}`,
            trailing: <MoneyText value={row.encashAmount} />,
          })}
          columns={[
            { key: "person", header: "Employee", rowHeader: true, cell: (row) => <PersonCell person={row.person} meta={row.department} /> },
            { key: "type", header: "Leave type", cell: (row) => row.leaveType },
            { key: "closing", header: "Closing", align: "end", cell: (row) => <span className="num">{row.closing}</span> },
            { key: "cf", header: "Carry forward", align: "end", cell: (row) => <span className="num">{row.carryForward}</span> },
            { key: "encash", header: "Encash", align: "end", cell: (row) => <span className="num">{row.encash}</span> },
            { key: "amount", header: "Amount", align: "end", cell: (row) => <MoneyText value={row.encashAmount} /> },
            { key: "lapse", header: "Lapse", align: "end", cell: (row) => <span className="num">{row.lapse}</span> },
          ]}
        />
      </CardBody>
      <CardBody>
        <YearEndCommit year={data.year} {...(committed ? { disabledReason: `Year-end ${data.year} is already committed. Next run: ${Number(data.year) + 1}.` } : {})} />
      </CardBody>
    </Card>
  );
}

export function HrLedgerCard({ ledger, people, active }: { ledger: LeaveLedger; people: PersonRef[]; active: string | undefined }) {
  return (
    <section id="hr-ledger" aria-label="Employee leave ledger" className="stack">
      <Card labelledBy="hrl-heading">
        <CardHeader
          id="hrl-heading"
          title="Employee balances & adjustments"
          description="Review any employee's ledger and record audited manual credits or debits."
          action={<AdjustBalanceSheet employee={ledger.employee} types={ledger.types.map((type) => ({ id: type.leaveTypeId, name: type.name, balance: type.balance }))} />}
        />
        <CardBody>
          <LedgerEmployeePicker people={people} selected={ledger.employee.id} />
        </CardBody>
      </Card>
      <LeaveLedgerCard ledger={ledger} active={active} title="Ledger" hrefFor={(typeId) => `/admin/leave-policy?employee=${ledger.employee.id}&ledger=${typeId}#hr-ledger`} />
    </section>
  );
}

export function TimeAuditCard({ items }: { items: YearEnd["audit"] }) {
  return (
    <Card labelledBy="ta-heading">
      <CardHeader id="ta-heading" title="Leave audit log" description="Adjustments, approvals, roster publishing and year-end runs." />
      {items.length ? (
        <ul className="list">
          {items.map((item) => (
            <ListRow key={item.id} title={item.action} meta={`${item.detail} · ${item.actor} · ${formatDateTime(item.at)}`} />
          ))}
        </ul>
      ) : (
        <CardBody>
          <Alert tone="info">No audited changes yet.</Alert>
        </CardBody>
      )}
    </Card>
  );
}
