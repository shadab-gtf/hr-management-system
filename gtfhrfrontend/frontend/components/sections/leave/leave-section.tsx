import { CancelLeaveButton } from "@/components/features/leave/cancel-leave-button";
import { LeaveRequestSheet } from "@/components/features/leave/leave-request-sheet";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ListRow, Meter, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LeaveTabs } from "@/components/sections/leave/leave-calendar-sections";
import { LeaveLedgerCard } from "@/components/sections/leave/leave-ledger-card";
import { ButtonLink } from "@/components/ui/button";
import { formatDate, formatDateRange, formatUnits } from "@/lib/utils/format";
import { leaveStatus } from "@/lib/utils/tones";
import type { LeaveLedger, LeaveOverview, LeaveRequest } from "@/types/leave";

export function LeaveSection({ data, today, openRequest, ledger, ledgerType }: { data: LeaveOverview; today: string; openRequest: boolean; ledger: LeaveLedger; ledgerType: string | undefined }) {
  const approver = data.approverPath[0] ?? null;
  const upcoming = data.requests.filter((request) => request.endDate >= today && (request.state === "pending" || request.state === "approved"));
  return (
    <div className="page">
      <PageHeader
        title="Leave"
        description="Balances come from the leave ledger. Pending requests hold (reserve) days until they’re decided."
        actions={
          <LeaveRequestSheet
            types={data.types}
            balances={data.balances}
            holidayDates={data.holidays.filter((holiday) => holiday.kind !== "optional").map((holiday) => holiday.date)}
            approver={approver?.name ?? null}
            today={today}
            defaultOpen={openRequest}
          />
        }
      />

      <LeaveTabs active="apply" />
      <section aria-label="Leave balances" className="grid grid-stats">
        {data.balances.map((balance) => (
          <div key={balance.leaveTypeId} className="stat">
            <div className="stat-top">
              <span className="stat-label">{balance.name}</span>
              <span className="badge">{balance.code}</span>
            </div>
            <p className="stat-value num">
              {balance.available}
              <span className="stat-unit"> / {balance.entitled} credited</span>
            </p>
            <Meter value={Math.max(Number(balance.available), 0)} max={Math.max(Number(balance.entitled), 1)} label={`${balance.name}: ${balance.available} of ${balance.entitled} credited days available`} />
            <p className="stat-meta num">
              {balance.used} used{Number(balance.reserved) > 0 ? ` · ${balance.reserved} pending` : ""}
              {balance.nextExpiry ? ` · ${balance.nextExpiry.units} expires ${formatDate(balance.nextExpiry.date, "short")}` : ""}
            </p>
          </div>
        ))}
      </section>

      <div className="split">
        <Card labelledBy="history-heading">
          <CardHeader id="history-heading" title="My requests" description={`${data.requests.length} this policy year`} />
          <CardBody className="flush">
            <DataTable<LeaveRequest>
              caption="Leave requests"
              rows={data.requests}
              rowKey={(row) => row.id}
              mobileRow={(row) => ({
                title: formatDateRange(row.startDate, row.endDate),
                meta: `${row.leaveType} · ${formatUnits(row.units)} · ${row.reference}`,
                trailing: (
                  <>
                    <StatusBadge status={leaveStatus[row.state]} />
                    {row.canCancel && <CancelLeaveButton id={row.id} version={row.version} label={`${row.leaveType}, ${formatDateRange(row.startDate, row.endDate)}`} />}
                  </>
                ),
              })}
              empty={
                <EmptyState compact icon="calendar" title="No leave requests yet" description="Requests you make will appear here with their status." />
              }
              columns={[
                {
                  key: "dates",
                  header: "Dates",
                  rowHeader: true,
                  cell: (row) => (
                    <span className="person-text">
                      <span className="person-name">{formatDateRange(row.startDate, row.endDate)}</span>
                      <span className="person-role">
                        {row.leaveType} · {row.reference}
                      </span>
                    </span>
                  ),
                },
                { key: "units", header: "Days", align: "end", cell: (row) => <span className="num">{formatUnits(row.units)}</span> },
                { key: "state", header: "Status", cell: (row) => <StatusBadge status={leaveStatus[row.state]} /> },
                {
                  key: "note",
                  header: "Note",
                  hideOnMobile: true,
                  className: "cell-wrap",
                  cell: (row) => row.decisionNote ?? row.reason,
                },
                {
                  key: "actions",
                  header: "Actions",
                  align: "end",
                  cell: (row) =>
                    row.canCancel ? (
                      <CancelLeaveButton id={row.id} version={row.version} label={`${row.leaveType}, ${formatDateRange(row.startDate, row.endDate)}`} />
                    ) : (
                      <span className="muted">—</span>
                    ),
                },
              ]}
            />
          </CardBody>
        </Card>

        <div className="stack">
          <Card labelledBy="upcoming-heading">
            <CardHeader id="upcoming-heading" title="Coming up" />
            {upcoming.length ? (
              <ul className="list">
                {upcoming.map((request) => (
                  <ListRow
                    key={request.id}
                    title={formatDateRange(request.startDate, request.endDate)}
                    meta={`${request.leaveType} · ${formatUnits(request.units)}`}
                    trailing={<StatusBadge status={leaveStatus[request.state]} />}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState compact icon="calendar" title="No upcoming leave" description="Approved and pending leave will show here." />
            )}
          </Card>
          <Card labelledBy="holiday-heading">
            <CardHeader id="holiday-heading" title="Holidays" description="Sample calendar — HR publishes the official list" />
            <ul className="list">
              {data.holidays.map((holiday) => (
                <ListRow
                  key={holiday.date}
                  leading={
                    <span className="date-tile">
                      <span>{formatDate(holiday.date, "short").split(" ")[1]}</span>
                      <strong>{holiday.date.slice(8)}</strong>
                    </span>
                  }
                  title={holiday.name}
                  meta={formatDate(holiday.date, "weekday")}
                  trailing={holiday.kind === "optional" ? <span className="badge">Optional</span> : undefined}
                />
              ))}
            </ul>
          </Card>
          {approver && (
            <Card labelledBy="approver-heading">
              <CardHeader id="approver-heading" title="Approval path" />
              <ul className="list">
                <ListRow leading={<Avatar initials={approver.initials} seed={approver.id} src={approver.photoUrl} />} title={approver.name} meta={approver.designation} />
              </ul>
            </Card>
          )}
        </div>
      </div>

      <LeaveLedgerCard ledger={ledger} active={ledgerType} hrefFor={(typeId) => `/leave?ledger=${typeId}#ledger-heading`} />
      <p className="small muted">
        Worked a week-off or holiday? <ButtonLink href="/leave/comp-off" size="sm" variant="ghost">Claim comp-off or encash leave</ButtonLink>
      </p>
    </div>
  );
}