import Link from "next/link";
import { DelegationSheet, RevokeDelegationButton } from "@/components/features/requests/delegation-sheet";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { ListRow, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateRange, formatRelative, humanize } from "@/lib/utils/format";
import type { Delegation, RequestModule, TrackedRequest } from "@/types/requests";

const moduleMeta: Record<RequestModule, { label: string; icon: IconName }> = {
  leave: { label: "Leave", icon: "calendar" },
  regularization: { label: "Attendance", icon: "attendance" },
  permission: { label: "Permission", icon: "timer" },
  expense: { label: "Reimbursement", icon: "expenses" },
  helpdesk: { label: "Helpdesk", icon: "helpdesk" },
  letter: { label: "Letters", icon: "mail" },
  profile: { label: "Profile", icon: "profile" },
  loan: { label: "Loans", icon: "bank" },
  resignation: { label: "Resignation", icon: "userRemove" },
  asset: { label: "Assets", icon: "box" },
};

export function RequestHubSection({ requests, status, module }: { requests: TrackedRequest[]; status: "open" | "closed"; module: RequestModule | undefined }) {
  const open = requests.filter((request) => request.open);
  const closed = requests.filter((request) => !request.open);
  const filtered = (status === "open" ? open : closed).filter((request) => !module || request.module === module);
  const href = (next: { status?: string; module?: string | undefined }) => {
    const params = new URLSearchParams();
    const s = next.status ?? status;
    if (s === "closed") params.set("status", "closed");
    const m = "module" in next ? next.module : module;
    if (m) params.set("module", m);
    const text = params.toString();
    return text ? `/requests?${text}` : "/requests";
  };
  const modules = [...new Set(requests.map((request) => request.module))];
  return (
    <div className="page">
      <PageHeader title="Request hub" description="Every request you’ve raised — leave, attendance, claims, letters, helpdesk and more — tracked in one place." />
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="In progress" value={open.length} meta="Awaiting a decision" icon="timer" accent="yellow" href={href({ status: "open" })} />
        <StatCard label="Completed" value={closed.length} meta="Approved, rejected or closed" icon="check" accent="cyan" href={href({ status: "closed" })} />
        <StatCard label="Total" value={requests.length} meta="This year" icon="layers" />
      </div>
      <Card>
        <nav className="segmented-tabs" aria-label="Request status">
          <Link href={href({ status: "open" })} className="chip" aria-current={status === "open" ? "page" : undefined}>
            In progress <span className="num">{open.length}</span>
          </Link>
          <Link href={href({ status: "closed" })} className="chip" aria-current={status === "closed" ? "page" : undefined}>
            Completed <span className="num">{closed.length}</span>
          </Link>
        </nav>
        <nav className="chip-row card-body" aria-label="Filter by module">
          <Link href={href({ module: undefined })} className="chip" aria-current={!module ? "page" : undefined}>
            All
          </Link>
          {modules.map((value) => (
            <Link key={value} href={href({ module: value })} className="chip" aria-current={module === value ? "page" : undefined}>
              {moduleMeta[value].label}
            </Link>
          ))}
        </nav>
        {filtered.length ? (
          <ul className="list">
            {filtered.map((request) => (
              <ListRow
                key={`${request.module}-${request.id}`}
                href={request.href}
                leading={<span className="icon-tile avatar--neutral"><AppIcon name={moduleMeta[request.module].icon} size={20} /></span>}
                title={request.title}
                meta={`${moduleMeta[request.module].label} · ${request.reference} · ${request.detail} · ${formatRelative(request.submittedAt)}`}
                trailing={<StatusBadge status={request.status} />}
              />
            ))}
          </ul>
        ) : (
          <EmptyState icon="layers" title={status === "open" ? "Nothing in progress" : "No completed requests"} description="All good! You have nothing new to track." />
        )}
      </Card>
    </div>
  );
}

const delegationTone = { scheduled: "info", active: "success", ended: "neutral", revoked: "neutral" } as const;

export function DelegatesSection({
  given,
  received,
  colleagues,
  today,
}: {
  given: Delegation[];
  received: Delegation[];
  colleagues: { id: string; name: string; designation: string }[];
  today: string;
}) {
  const row = (item: Delegation, mine: boolean) => (
    <ListRow
      key={item.id}
      leading={<Avatar initials={item.delegate.initials} seed={item.delegate.id} src={item.delegate.photoUrl} />}
      title={mine ? `To ${item.delegate.name}` : `From ${item.delegate.name}`}
      meta={`${formatDateRange(item.startsOn, item.endsOn)} · ${item.workflows.map(humanize).join(", ")} · ${item.reason}`}
      trailing={
        <>
          <StatusBadge status={{ label: humanize(item.state), tone: delegationTone[item.state] }} />
          {mine && (item.state === "active" || item.state === "scheduled") && <RevokeDelegationButton id={item.id} />}
        </>
      }
    />
  );
  return (
    <div className="page">
      <PageHeader title="Workflow delegates" description="Hand over approvals for a date range. Delegation is bounded by dates and workflow, and never allows self-approval." actions={<DelegationSheet colleagues={colleagues} today={today} />} />
      <div className="grid grid-2">
        <Card labelledBy="given-heading">
          <CardHeader id="given-heading" title="Delegated by me" />
          {given.length ? <ul className="list">{given.map((item) => row(item, true))}</ul> : <EmptyState compact icon="team" title="No delegations" description="Delegate approvals before you go on leave." />}
        </Card>
        <Card labelledBy="received-heading">
          <CardHeader id="received-heading" title="Delegated to me" />
          {received.length ? <ul className="list">{received.map((item) => row(item, false))}</ul> : <EmptyState compact icon="approvals" title="Nothing delegated to you" description="When a colleague delegates, their requests appear in your approvals." />}
        </Card>
      </div>
    </div>
  );
}
