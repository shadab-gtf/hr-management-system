import { NewExpenseSheet } from "@/components/features/expenses/new-expense-sheet";
import { Card, CardBody } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DateText, MoneyText, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatMoney, humanize } from "@/lib/utils/format";
import { expenseStatus } from "@/lib/utils/tones";
import type { ExpenseClaim } from "@/types/workplace";

export function ExpensesSection({ claims, today }: { claims: ExpenseClaim[]; today: string }) {
  const pending = claims.filter((claim) => claim.state === "submitted" || claim.state === "manager_approved");
  const sum = (list: ExpenseClaim[]) => {
    const paise = list.reduce((total, claim) => {
      const [whole = "0", fraction = "00"] = claim.amount.amount.split(".");
      return total + Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
    }, 0);
    return { amount: `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`, currency: "INR" as const };
  };
  return (
    <div className="page">
      <PageHeader title="Expenses" description="Claims are approved by your manager, then Finance, and settled once." actions={<NewExpenseSheet today={today} />} />
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="In approval" value={formatMoney(sum(pending), { decimals: false })} meta={`${pending.length} claims`} icon="timer" accent="yellow" />
        <StatCard label="Reimbursed" value={formatMoney(sum(claims.filter((c) => c.state === "reimbursed")), { decimals: false })} meta="This year" icon="check" accent="cyan" />
        <StatCard label="Total claims" value={claims.length} meta="All time" icon="expenses" />
      </div>
      <Card>
        <CardBody className="flush">
          <DataTable<ExpenseClaim>
            caption="Expense claims"
            rows={claims}
            rowKey={(row) => row.id}
            mobileRow={(row) => ({
              title: row.title,
              meta: (
                <>
                  {formatDate(row.incurredOn)} · {row.merchant}
                  <br />
                  <StatusBadge status={expenseStatus[row.state]} />
                </>
              ),
              trailing: <MoneyText value={row.amount} className="cell-strong" />,
            })}
            empty={<EmptyState icon="expenses" title="No claims yet" description="Create a claim for travel, meals, internet and more." />}
            columns={[
              { key: "title", header: "Claim", rowHeader: true, cell: (row) => <span className="person-text"><span className="person-name">{row.title}</span><span className="person-role">{row.reference} · {humanize(row.category)}</span></span> },
              { key: "date", header: "Date", cell: (row) => <DateText value={row.incurredOn} /> },
              { key: "merchant", header: "Merchant", hideOnMobile: true, cell: (row) => row.merchant },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={expenseStatus[row.state]} /> },
              { key: "amount", header: "Amount", align: "end", cell: (row) => <MoneyText value={row.amount} className="cell-strong" /> },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
