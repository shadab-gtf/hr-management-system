import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils/format";
import type { LeaveLedger, LedgerEntry, LedgerKind } from "@/types/leave";

export const ledgerKindLabel: Record<LedgerKind, { label: string; tone: "success" | "info" | "neutral" | "warning" | "danger" }> = {
  opening: { label: "Opening", tone: "info" },
  carry_forward: { label: "Carry forward", tone: "info" },
  accrual: { label: "Accrual", tone: "success" },
  credit: { label: "Credit", tone: "success" },
  adjustment: { label: "Adjustment", tone: "warning" },
  availed: { label: "Availed", tone: "neutral" },
  encashed: { label: "Encashed", tone: "neutral" },
  lapsed: { label: "Lapsed", tone: "danger" },
};

const signed = (units: string) => (units.startsWith("-") ? `−${units.slice(1)}` : `+${units}`);

/** Transaction history per leave type; balance is the running sum of non-scheduled rows. */
export function LeaveLedgerCard({ ledger, active, hrefFor, title = "Leave ledger" }: { ledger: LeaveLedger; active: string | undefined; hrefFor: (typeId: string) => string; title?: string }) {
  const current = ledger.types.find((type) => type.leaveTypeId === active) ?? ledger.types[0];
  return (
    <Card labelledBy="ledger-heading">
      <CardHeader id="ledger-heading" title={title} description={`${ledger.employee.name} · policy year ${ledger.year} · every credit and debit behind the balance`} />
      {ledger.types.length > 0 && (
        <CardBody>
          <TabsNav label="Ledger leave type" tabs={ledger.types.map((type) => ({ href: hrefFor(type.leaveTypeId), label: `${type.code} · ${type.balance}`, active: type.leaveTypeId === current?.leaveTypeId }))} />
        </CardBody>
      )}
      <CardBody className="flush">
        {current ? (
          <DataTable<LedgerEntry>
            caption={`${current.name} ledger`}
            rows={current.entries}
            rowKey={(row) => row.id}
            empty={<EmptyState compact icon="book" title="No transactions yet" description={`${current.name} credits and debits will appear here.`} />}
            mobileRow={(row) => ({
              title: `${ledgerKindLabel[row.kind].label} · ${signed(row.units)}`,
              meta: `${formatDate(row.date, "medium")} · ${row.note}${row.scheduled ? " · scheduled" : ` · bal ${row.balance}`}`,
              trailing: row.scheduled ? <Badge tone="warning">Scheduled</Badge> : <Badge tone={ledgerKindLabel[row.kind].tone}>{ledgerKindLabel[row.kind].label}</Badge>,
            })}
            columns={[
              { key: "date", header: "Date", rowHeader: true, cell: (row) => formatDate(row.date, "medium") },
              { key: "kind", header: "Transaction", cell: (row) => <Badge tone={ledgerKindLabel[row.kind].tone}>{ledgerKindLabel[row.kind].label}</Badge> },
              { key: "units", header: "Days", align: "end", cell: (row) => <span className="num">{signed(row.units)}</span> },
              { key: "balance", header: "Balance", align: "end", cell: (row) => (row.scheduled ? <Badge tone="warning">Scheduled</Badge> : <span className="num">{row.balance}</span>) },
              { key: "note", header: "Details", className: "cell-wrap", cell: (row) => <>{row.note}{row.reference && <span className="muted small"> · {row.reference}</span>}</> },
              { key: "by", header: "By", hideOnMobile: true, cell: (row) => row.by ?? "—" },
            ]}
          />
        ) : (
          <EmptyState compact icon="book" title="No leave balances" description="No leave types with a balance apply to this employee." />
        )}
      </CardBody>
    </Card>
  );
}
