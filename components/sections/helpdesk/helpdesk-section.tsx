import { NewTicketSheet } from "@/components/features/helpdesk/new-ticket-sheet";
import { CloseTicketButton, TicketReplyForm } from "@/components/features/helpdesk/ticket-conversation";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, KeyValueList, ListRow, StatusBadge, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, formatRelative, humanize, initialsOf } from "@/lib/utils/format";
import { ticketStatus } from "@/lib/utils/tones";
import type { Ticket, TicketCategory, TicketDetail } from "@/types/workplace";

const closedStates: Ticket["state"][] = ["resolved", "closed"];

export function HelpdeskSection({
  tickets,
  categories,
  scope,
  status,
  canQueue,
  openNew,
}: {
  tickets: Ticket[];
  categories: TicketCategory[];
  scope: "mine" | "queue";
  status: "active" | "closed";
  canQueue: boolean;
  openNew: boolean;
}) {
  const active = tickets.filter((ticket) => !closedStates.includes(ticket.state));
  const closed = tickets.filter((ticket) => closedStates.includes(ticket.state));
  const shown = status === "active" ? active : closed;
  const base = scope === "queue" ? "/helpdesk?scope=queue" : "/helpdesk?";
  const join = (extra: string) => (base.endsWith("?") ? `${base}${extra}` : `${base}&${extra}`);
  return (
    <div className="page">
      <PageHeader
        title="Helpdesk"
        description={scope === "queue" ? "Requests routed to the HR queue. Confidential categories stay with their designated partner." : "Questions for HR, Payroll or IT. Every reply is tracked here."}
        actions={scope === "mine" ? <NewTicketSheet categories={categories} defaultOpen={openNew} /> : undefined}
      />
      {canQueue && (
        <TabsNav
          label="Helpdesk views"
          tabs={[
            { href: "/helpdesk", label: "My requests", active: scope === "mine" },
            { href: "/helpdesk?scope=queue", label: "HR queue", active: scope === "queue" },
          ]}
        />
      )}
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Active" value={active.length} meta="Open or in progress" icon="helpdesk" accent="cyan" />
        <StatCard label={scope === "queue" ? "Waiting on employee" : "Awaiting you"} value={tickets.filter((t) => t.state === "awaiting_you").length} meta="Needs a reply" icon="warning" accent="yellow" />
        <StatCard label="Closed" value={closed.length} meta="Resolved requests" icon="check" />
      </div>
      <Card>
        <nav className="segmented-tabs" aria-label="Request status">
          <a href={base.endsWith("?") ? "/helpdesk" : base} className="chip" aria-current={status === "active" ? "page" : undefined}>
            Active <span className="num">{active.length}</span>
          </a>
          <a href={join("status=closed")} className="chip" aria-current={status === "closed" ? "page" : undefined}>
            Closed <span className="num">{closed.length}</span>
          </a>
        </nav>
        {shown.length ? (
          <ul className="list">
            {shown.map((ticket) => (
              <ListRow
                key={ticket.id}
                href={`/helpdesk/${ticket.id}`}
                leading={<span className={`icon-tile avatar--${ticket.confidential ? "magenta" : "neutral"}`}><AppIcon name={ticket.confidential ? "lock" : "helpdesk"} size={20} /></span>}
                title={ticket.subject}
                meta={`${ticket.reference} · ${ticket.category} · ${humanize(ticket.priority)} priority · ${formatRelative(ticket.updatedAt)}`}
                trailing={<StatusBadge status={ticketStatus[ticket.state]} />}
              />
            ))}
          </ul>
        ) : (
          <EmptyState icon="helpdesk" title={status === "active" ? "No active requests" : "No closed requests"} description={scope === "queue" ? "New employee requests will appear here." : "Raise a request and HR will reply here."} />
        )}
      </Card>
    </div>
  );
}

export function TicketDetailSection({ ticket }: { ticket: TicketDetail }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow={ticket.reference}
        title={ticket.subject}
        back={{ href: ticket.viewerIsHr ? "/helpdesk?scope=queue" : "/helpdesk", label: "Helpdesk" }}
        actions={ticket.canClose ? <CloseTicketButton ticketId={ticket.id} /> : undefined}
      />
      <div className="split">
        <Card labelledBy="thread-heading">
          <CardHeader id="thread-heading" title="Conversation" description={`${ticket.messages.length} message${ticket.messages.length === 1 ? "" : "s"}`} />
          <CardBody className="stack">
            <ol className="thread">
              {ticket.messages.map((message) => (
                <li key={message.id} className={cn("bubble", message.fromHr ? "bubble--hr" : "bubble--me")}>
                  <span className="bubble-author">
                    <Avatar initials={initialsOf(message.author)} seed={message.author} size="sm" />
                    <strong>{message.author}</strong>
                    <span className="small muted">{message.fromHr ? "HR" : "Requester"} · {formatDateTime(message.at)}</span>
                  </span>
                  <p className="text-block">{message.body}</p>
                </li>
              ))}
            </ol>
            {ticket.canReply ? (
              <TicketReplyForm ticketId={ticket.id} placeholder={ticket.viewerIsHr ? "Reply to the employee…" : "Add details or reply to HR…"} />
            ) : (
              <Alert tone="neutral">This request is closed. Raise a new request if you still need help.</Alert>
            )}
          </CardBody>
        </Card>
        <Card labelledBy="ticket-meta">
          <CardHeader id="ticket-meta" title="Details" action={<StatusBadge status={ticketStatus[ticket.state]} />} />
          <CardBody className="stack">
            <KeyValueList
              columns={1}
              items={[
                { label: "Category", value: ticket.category, hint: ticket.confidential ? "Confidential — visible only to the designated HR partner" : undefined },
                { label: "Priority", value: humanize(ticket.priority) },
                { label: "Assigned to", value: ticket.assignee ?? "Awaiting assignment" },
                { label: "Raised", value: formatDateTime(ticket.createdAt) },
                { label: "Last update", value: formatDateTime(ticket.updatedAt) },
                ...(ticket.requester && ticket.viewerIsHr ? [{ label: "Requester", value: `${ticket.requester.name} · ${ticket.requester.designation}` }] : []),
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
