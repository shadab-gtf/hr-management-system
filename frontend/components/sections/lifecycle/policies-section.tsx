import type { ReactNode } from "react";
import { AcknowledgePolicyButton, PublishPolicySheet, RemindPolicyButton } from "@/components/features/lifecycle/policy-controls";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, ListRow, Meter } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils/format";
import type { MyPolicy, PolicyAck } from "@/types/lifecycle";

export function PoliciesAdminSection({ policies, departments, today, tabs }: { policies: PolicyAck[]; departments: string[]; today: string; tabs: ReactNode }) {
  const open = policies.filter((policy) => policy.acknowledged < policy.total);
  const pendingPeople = open.reduce((sum, policy) => sum + policy.pending.length, 0);
  return (
    <div className="page">
      <PageHeader eyebrow="HR admin" title="Policy acknowledgements" description="Publish a policy version, track who has read and acknowledged it, and remind the rest." actions={<PublishPolicySheet departments={departments} today={today} />} />
      {tabs}
      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Policies" value={policies.length} meta="Published versions" icon="book" accent="cyan" />
        <StatCard label="Open" value={open.length} meta="Still collecting" icon="clipboard" accent="yellow" />
        <StatCard label="People pending" value={pendingPeople} meta="Across open policies" icon="people" accent="magenta" />
      </div>
      {policies.length === 0 ? (
        <Card>
          <EmptyState icon="book" title="No policies published" description="Publish the first policy that needs acknowledgement." />
        </Card>
      ) : (
        policies.map((policy) => {
          const percent = policy.total ? Math.round((policy.acknowledged / policy.total) * 100) : 100;
          const overdue = policy.dueOn < today && policy.pending.length > 0;
          return (
            <Card key={policy.id} labelledBy={`pol-${policy.id}`}>
              <CardHeader
                id={`pol-${policy.id}`}
                title={`${policy.title} ${policy.version}`}
                description={`${policy.audience} · published ${formatDate(policy.publishedAt.slice(0, 10))} by ${policy.publishedBy} · due ${formatDate(policy.dueOn)}`}
                action={policy.pending.length ? <Badge tone={overdue ? "danger" : "warning"}>{overdue ? "Overdue" : "Collecting"}</Badge> : <Badge tone="success">Complete</Badge>}
              />
              <CardBody className="stack">
                <p className="small">{policy.summary}</p>
                <div className="lc-progress">
                  <Meter value={policy.acknowledged} max={policy.total} label={`${policy.acknowledged} of ${policy.total} acknowledged`} tone="secondary" />
                  <span className="num small">
                    {percent}% · {policy.acknowledged}/{policy.total}
                  </span>
                </div>
                {policy.pending.length > 0 && (
                  <details className="lc-details" open={policy.pending.length <= 12}>
                    <summary>{policy.pending.length} pending</summary>
                    <ul className="list">
                      {policy.pending.map((person) => (
                        <ListRow key={person.id} leading={<Avatar initials={person.initials} seed={person.id} src={person.photoUrl} size="sm" />} title={person.name} meta={`${person.designation} · ${person.department}`} />
                      ))}
                    </ul>
                  </details>
                )}
                <div className="button-row">
                  <RemindPolicyButton policyId={policy.id} pending={policy.pending.length} />
                  {policy.reminders[0] && <span className="small muted">Last reminder {formatRelative(policy.reminders[0].at)} by {policy.reminders[0].by} to {policy.reminders[0].count}</span>}
                </div>
                {policy.recent.length > 0 && <p className="small muted">Latest: {policy.recent.map((item) => `${item.person.name} (${formatRelative(item.at)})`).join(", ")}</p>}
              </CardBody>
            </Card>
          );
        })
      )}
      <Alert tone="neutral">Reminders are in-app notifications on the mock backend; no email or push is sent.</Alert>
    </div>
  );
}

/** Document-center panel: the signed-in employee's acknowledgements. */
export function MyPoliciesPanel({ policies }: { policies: MyPolicy[] }) {
  const pending = policies.filter((policy) => !policy.acknowledgedAt);
  const done = policies.filter((policy) => policy.acknowledgedAt);
  return (
    <div className="stack">
      {pending.length ? (
        pending.map((policy) => (
          <Card key={policy.id} labelledBy={`mp-${policy.id}`}>
            <CardHeader id={`mp-${policy.id}`} title={`${policy.title} ${policy.version}`} description={`Acknowledge by ${formatDate(policy.dueOn)}`} action={<Badge tone={policy.overdue ? "danger" : "warning"}>{policy.overdue ? "Overdue" : "Action needed"}</Badge>} />
            <CardBody className="stack">
              <p>{policy.summary}</p>
              <details className="lc-details">
                <summary>Read the policy</summary>
                <div className="lc-letter-body small">{policy.body}</div>
              </details>
              <div className="sheet-actions">
                <AcknowledgePolicyButton policyId={policy.id} title={policy.title} />
              </div>
            </CardBody>
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState compact icon="check" title="You're all caught up" description="No policies waiting for your acknowledgement." />
        </Card>
      )}
      {done.length > 0 && (
        <Card labelledBy="mp-done">
          <CardHeader id="mp-done" title="Acknowledged" />
          <ul className="list">
            {done.map((policy) => (
              <ListRow key={policy.id} title={`${policy.title} ${policy.version}`} meta={`Acknowledged ${policy.acknowledgedAt ? formatDateTime(policy.acknowledgedAt) : ""}`} trailing={<Badge tone="success">Done</Badge>} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
