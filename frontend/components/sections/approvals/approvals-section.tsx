import Link from "next/link";
import { ApprovalDecision } from "@/components/features/approvals/approval-decision";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, IconTile, KeyValueList, ListRow, MoneyText, StatusBadge, TabsNav, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateRange, formatDateTime, formatRelative, formatUnits, humanize } from "@/lib/utils/format";
import type { ApprovalItem, ApprovalKind, WorkQueueItem } from "@/types/approval";

const kindIcon: Record<ApprovalKind, IconName> = { leave: "calendar", regularization: "attendance", permission: "timer", expense: "expenses" };
const kindLabel: Record<ApprovalKind, string> = { leave: "Leave", regularization: "Attendance", permission: "Permission", expense: "Expense" };
const stateTone = { pending: "warning", approved: "success", rejected: "danger" } as const;

export function ApprovalsSection({
  items,
  selected,
  tab,
  pendingCount,
  kind,
  queue,
}: {
  queue: WorkQueueItem[];
  items: ApprovalItem[];
  selected: ApprovalItem | null;
  tab: "pending" | "decided";
  pendingCount: number;
  kind: ApprovalKind | "all";
}) {
  const href = (value: ApprovalKind | "all", id?: string) => {
    const params = new URLSearchParams();
    if (tab === "decided") params.set("tab", "decided");
    if (value !== "all") params.set("kind", value);
    if (id) params.set("id", id);
    const query = params.toString();
    return query ? `/approvals?${query}` : "/approvals";
  };
  const withKind = (value: ApprovalKind | "all") => href(value);
  const link = (id: string) => href(kind, id);
  const shown = kind === "all" ? items : items.filter((item) => item.kind === kind);
  return (
    <div className="page">
      <PageHeader title="Approvals" description="Review each request with its policy and impact. Decisions are recorded against the version you reviewed." />
      <TabsNav
        label="Approval queues"
        tabs={[
          { href: "/approvals", label: "Pending", active: tab === "pending", count: pendingCount },
          { href: "/approvals?tab=decided", label: "Decided", active: tab === "decided" },
        ]}
      />
      <div className={cn("split split--wide-aside approvals", selected && "approvals--selected")}>
        <Card className="queue-pane" labelledBy="queue-heading">
          <CardHeader
            id="queue-heading"
            title={tab === "pending" ? "Waiting for you" : "Recently decided"}
            description={`${shown.length} request${shown.length === 1 ? "" : "s"}`}
          />
          <nav className="chip-row card-body" aria-label="Filter by type">
            {(["all", "leave", "regularization", "permission", "expense"] as const).map((value) => (
              <Link key={value} href={withKind(value)} className="chip" aria-current={kind === value ? "page" : undefined}>
                {value === "all" ? "All" : kindLabel[value]}
              </Link>
            ))}
          </nav>
          {shown.length ? (
            <ul className="list">
              {shown.map((item) => (
                <li key={item.id} className="list-row">
                  <Link href={link(item.id)} className="queue-item" aria-current={selected?.id === item.id ? "true" : undefined}>
                    <Avatar initials={item.requester.initials} seed={item.requester.id} src={item.requester.photoUrl} />
                    <span className="queue-text">
                      <span className="queue-title">{item.requester.name}</span>
                      <span className="queue-meta">
                        <AppIcon name={kindIcon[item.kind]} size={16} /> {item.title}
                      </span>
                      <span className="queue-meta">{item.summary}</span>
                    </span>
                    <span className="list-trailing">
                      {tab === "decided" ? (
                        <StatusBadge status={{ label: humanize(item.state), tone: stateTone[item.state] }} />
                      ) : (
                        <span className="small muted nowrap">{formatRelative(item.submittedAt)}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon="check"
              title={tab === "pending" ? "You’re all caught up" : "Nothing decided yet"}
              description={kind === "all" ? "New requests from your team will appear here." : "No requests match this filter."}
              action={kind === "all" ? undefined : <Link href={withKind("all")} className="inline-link">Show all types</Link>}
            />
          )}
        </Card>

        <div className="review-pane">
          {selected ? (
            <ApprovalReview item={selected} backHref={withKind(kind)} />
          ) : (
            <Card className="review-placeholder">
              <EmptyState icon="approvals" title="Select a request" description="Pick a request from the queue to see its details, impact and history." />
            </Card>
          )}
        </div>
      </div>
      {tab === "pending" && queue.length > 0 && (
        <Card labelledBy="queue-more-heading">
          <CardHeader id="queue-more-heading" title="Also waiting for you" description="Decided on their own pages, with the rules and details each one needs." />
          <ul className="list">
            {queue.map((entry) => (
              <ListRow
                key={entry.key}
                leading={<IconTile icon={entry.icon} />}
                title={entry.label}
                meta={entry.detail}
                trailing={<Badge tone="warning">{entry.count}</Badge>}
                href={entry.href}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ApprovalReview({ item, backHref }: { item: ApprovalItem; backHref: string }) {
  const context = item.context;
  return (
    <Card labelledBy="review-heading" className="sticky-aside">
      <div className="card-body stack">
        <Link href={backHref} className="back-link review-back">
          <AppIcon name="back" size={16} />
          Back to queue
        </Link>
        <div className="person">
          <Avatar initials={item.requester.initials} seed={item.requester.id} src={item.requester.photoUrl} size="lg" />
          <span className="person-text">
            <h2 id="review-heading" className="review-title">
              {item.title}
            </h2>
            <span className="person-role">
              {item.requester.name} · {item.requester.designation}
            </span>
          </span>
        </div>
        <div className="cluster">
          <span className="badge">{item.reference}</span>
          <span className="small muted">Submitted {formatDateTime(item.submittedAt)}</span>
        </div>
        {item.delegatedFrom && (
          <Alert tone="info" title="Delegated to you">
            You’re deciding on behalf of {item.delegatedFrom.name}. The decision records the delegation.
          </Alert>
        )}

        {context.kind === "leave" && (
          <>
            <div className="impact">
              <div>
                <strong className="num">{context.availableBefore}</strong>
                <span>Available now</span>
              </div>
              <div>
                <strong className="num">−{context.units}</strong>
                <span>This request</span>
              </div>
              <div>
                <strong className={cn("num", Number(context.availableAfter) < 0 && "text-danger")}>{context.availableAfter}</strong>
                <span>After approval</span>
              </div>
            </div>
            <KeyValueList
              items={[
                { label: "Leave type", value: context.leaveType },
                { label: "Dates", value: formatDateRange(context.startDate, context.endDate), hint: formatUnits(context.units) },
                { label: "Policy version", value: context.policyVersion },
                { label: "Reason", value: context.reason },
              ]}
            />
            {context.overlaps.length > 0 && (
              <Alert tone="warning" title="Team overlap">
                {context.overlaps.join(". ")}
              </Alert>
            )}
          </>
        )}

        {context.kind === "regularization" && (
          <>
            <div className="compare">
              <span className="compare-head" />
              <span className="compare-head">Recorded</span>
              <span className="compare-head">Proposed</span>
              <span className="muted">Check-in</span>
              <span className="num">{context.recordedIn ?? "None"}</span>
              <strong className="num">{context.proposedIn}</strong>
              <span className="muted">Check-out</span>
              <span className="num">{context.recordedOut ?? "None"}</span>
              <strong className="num">{context.proposedOut}</strong>
            </div>
            <KeyValueList items={[{ label: "Date", value: formatDate(context.date, "long") }, { label: "Reason", value: context.reason }]} columns={1} />
            <p className="notice-strip">
              <AppIcon name="info" size={16} />
              Original punches stay unchanged; approval adds a linked correction.
            </p>
          </>
        )}

        {context.kind === "permission" && (
          <KeyValueList
            items={[
              { label: "Date", value: formatDate(context.date, "long") },
              { label: "Time away", value: `${context.from}–${context.to}`, hint: `${context.minutes} minutes` },
              { label: "Reason", value: context.reason },
            ]}
          />
        )}

        {context.kind === "expense" && (
          <>
            <KeyValueList
              items={[
                { label: "Amount", value: <MoneyText value={context.amount} /> },
                { label: "Category", value: context.category },
                { label: "Merchant", value: context.merchant },
                { label: "Incurred on", value: formatDate(context.incurredOn) },
                { label: "Receipts", value: String(context.receipts) },
              ]}
            />
            {context.duplicateWarning && (
              <Alert tone="warning" title="Possible duplicate">
                {context.duplicateWarning}
              </Alert>
            )}
            <p className="notice-strip">
              <AppIcon name="info" size={16} />
              After your approval, Finance reviews the claim before settlement.
            </p>
          </>
        )}

        {item.state === "pending" ? (
          <ApprovalDecision key={`${item.id}-${item.version}`} id={item.id} version={item.version} requester={item.requester.name} />
        ) : (
          <StatusBadge status={{ label: humanize(item.state), tone: stateTone[item.state] }} />
        )}

        <div>
          <h3 className="subheading">History</h3>
          <Timeline items={item.history.map((entry, index) => ({ id: String(index), title: entry.event, meta: `${entry.actor} · ${formatDateTime(entry.at)}` }))} />
        </div>
      </div>
    </Card>
  );
}
