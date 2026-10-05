import { DeclineRequestButton, GiveFeedbackSheet, OneOnOneSheet, RequestFeedbackSheet } from "@/components/features/performance/feedback-controls";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PersonCell, TabsNav } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatRelative } from "@/lib/utils/format";
import type { FeedbackHub, PerfFeedback, PerfFeedbackRequest } from "@/types/performance";
import { MockNote } from "./shared";

export const feedbackTabs = ["received", "given", "requests", "wall", "one-on-ones", "team"] as const;
export type FeedbackTab = (typeof feedbackTabs)[number];

function FeedbackList({ items, empty, perspective }: { items: PerfFeedback[]; empty: string; perspective: "from" | "to" | "both" }) {
  if (items.length === 0) return <EmptyState compact icon="messages" title="Nothing here yet" description={empty} />;
  return (
    <ul className="perf-feed">
      {items.map((f) => {
        const person = perspective === "to" ? f.to : f.from;
        return (
          <li key={f.id} className="perf-feed-item">
            <Avatar initials={person.initials} seed={person.id} src={person.photoUrl} size="sm" />
            <div className="perf-feed-body">
              <p className="perf-feed-head">
                <strong>{f.from.name}</strong> <span className="muted">→</span> <strong>{f.to.name}</strong>
                <span className="muted small"> · {formatRelative(f.createdAt)}</span>
              </p>
              <p>{f.message}</p>
              <div className="cluster">
                <Badge tone={f.kind === "praise" ? "success" : "info"}>{f.kind === "praise" ? "Praise" : "Suggestion"}</Badge>
                <Badge tone={f.visibility === "public" ? "neutral" : "warning"}>{f.visibility === "public" ? "Public" : "Private"}</Badge>
                {f.competency && <Badge>{f.competency}</Badge>}
                {f.goal && <span className="muted small">Goal: {f.goal}</span>}
                {f.inResponseToRequest && <span className="muted small">Requested</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const requestTone = { pending: "warning", answered: "success", declined: "neutral" } as const;

function RequestRow({ request, mine, hub }: { request: PerfFeedbackRequest; mine: boolean; hub: FeedbackHub }) {
  const person = mine ? request.asked : request.requester;
  return (
    <li className="perf-approval">
      <div className="perf-approval-head">
        <PersonCell person={person} meta={`${mine ? "Asked" : "Asked you"} ${formatRelative(request.createdAt)}${request.goal ? ` · Goal: ${request.goal}` : ""}`} />
        {!mine && request.status === "pending" ? (
          <span className="row-actions">
            <GiveFeedbackSheet colleagues={hub.colleagues} competencies={hub.competencies} respondTo={{ requestId: request.id, person: request.requester, question: request.question }} />
            <DeclineRequestButton requestId={request.id} />
          </span>
        ) : (
          <Badge tone={requestTone[request.status]}>{request.status === "pending" ? "Pending" : request.status === "answered" ? "Answered" : "Declined"}</Badge>
        )}
      </div>
      <p className="small">“{request.question}”</p>
    </li>
  );
}

export function FeedbackSection({ hub, tab, today }: { hub: FeedbackHub; tab: FeedbackTab; today: string }) {
  const isManager = hub.counterparts.some((c) => c.relation === "report");
  const pendingToMe = hub.requestsToMe.filter((r) => r.status === "pending").length;
  const tabs = [
    { key: "received", label: "Received", count: hub.received.length },
    { key: "given", label: "Given", count: hub.given.length },
    { key: "requests", label: "Requests", count: pendingToMe },
    { key: "wall", label: "Praise wall" },
    { key: "one-on-ones", label: "1:1 notes", count: hub.oneOnOnes.length },
    ...(isManager ? [{ key: "team", label: "My team", count: hub.teamPrivate.length }] : []),
  ];
  return (
    <div className="page">
      <PageHeader
        title="Feedback"
        description="Continuous feedback, praise and 1:1s. Separate from ratings — it doesn't change a released result."
        actions={
          <>
            <GiveFeedbackSheet colleagues={hub.colleagues} competencies={hub.competencies} />
            <RequestFeedbackSheet colleagues={hub.colleagues} goals={hub.myGoals} />
          </>
        }
      />
      <TabsNav label="Feedback views" tabs={tabs.map((t) => ({ href: `/performance/feedback?tab=${t.key}`, label: t.label, active: t.key === tab, ...(t.count !== undefined ? { count: t.count } : {}) }))} />
      {tab === "received" && (
        <Card labelledBy="fb-received">
          <CardHeader id="fb-received" title="Received" description="Private feedback is visible to you and your manager only." />
          <CardBody>
            <FeedbackList items={hub.received} perspective="from" empty="Feedback colleagues send you appears here." />
          </CardBody>
        </Card>
      )}
      {tab === "given" && (
        <Card labelledBy="fb-given">
          <CardHeader id="fb-given" title="Given" />
          <CardBody>
            <FeedbackList items={hub.given} perspective="to" empty="Recognise a colleague's work with Give feedback." />
          </CardBody>
        </Card>
      )}
      {tab === "requests" && (
        <div className="grid grid-2">
          <Card labelledBy="fb-asked">
            <CardHeader id="fb-asked" title="Asked of you" />
            <CardBody>
              {hub.requestsToMe.length === 0 ? (
                <EmptyState compact icon="messages" title="No requests" description="When someone asks for your feedback it shows here." />
              ) : (
                <ul className="perf-approval-list">
                  {hub.requestsToMe.map((r) => (
                    <RequestRow key={r.id} request={r} mine={false} hub={hub} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card labelledBy="fb-mine">
            <CardHeader id="fb-mine" title="Your requests" />
            <CardBody>
              {hub.myRequests.length === 0 ? (
                <EmptyState compact icon="messages" title="No requests sent" description="Ask peers for input on a goal with Request feedback." />
              ) : (
                <ul className="perf-approval-list">
                  {hub.myRequests.map((r) => (
                    <RequestRow key={r.id} request={r} mine hub={hub} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
      {tab === "wall" && (
        <Card labelledBy="fb-wall">
          <CardHeader id="fb-wall" title="Praise wall" description="Public praise across the company." />
          <CardBody>
            <FeedbackList items={hub.wall} perspective="from" empty="Public praise appears here." />
          </CardBody>
        </Card>
      )}
      {tab === "one-on-ones" && (
        <Card labelledBy="fb-11">
          <CardHeader id="fb-11" title="1:1 notes" description="Private to you and the other person." action={hub.counterparts.length > 0 ? <OneOnOneSheet counterparts={hub.counterparts} today={today} /> : undefined} />
          <CardBody>
            {hub.oneOnOnes.length === 0 ? (
              <EmptyState compact icon="note" title="No 1:1 notes" description="Log agendas, notes and action items from your 1:1s." />
            ) : (
              <ul className="perf-approval-list">
                {hub.oneOnOnes.map((n) => (
                  <li key={n.id} className="perf-approval">
                    <p className="perf-feed-head">
                      <strong>
                        {n.manager.name} &amp; {n.report.name}
                      </strong>
                      <span className="muted small"> · {formatDate(n.meetingOn)} · written by {n.author}</span>
                    </p>
                    <p>{n.note}</p>
                    {n.actionItems && (
                      <ul className="bullet-list small" aria-label="Action items">
                        {n.actionItems.split("\n").filter(Boolean).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
      {tab === "team" && isManager && (
        <Card labelledBy="fb-team">
          <CardHeader id="fb-team" title="Private feedback to your team" description="As their manager you see private feedback your reports receive." />
          <CardBody>
            <FeedbackList items={hub.teamPrivate} perspective="from" empty="No private feedback for your reports yet." />
          </CardBody>
        </Card>
      )}
      <MockNote>Mock backend; notifications are in-app only.</MockNote>
    </div>
  );
}
