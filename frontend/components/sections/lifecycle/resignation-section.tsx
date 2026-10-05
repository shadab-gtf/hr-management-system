import Link from "next/link";
import { ResignationDecisionSheet, ResignationForm, WithdrawResignationButton } from "@/components/features/lifecycle/resignation-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Alert, KeyValueList, ListRow, MoneyText, StatusBadge, StepIndicator, Timeline } from "@/components/ui/display";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatDateTime, formatRelative } from "@/lib/utils/format";
import { resignationReasonLabels, resignationStatus, settlementStatus } from "@/components/sections/lifecycle/labels";
import type { Resignation, ResignationView } from "@/types/lifecycle";
import type { SettlementState } from "@/types/lifecycle";

const steps = ["Submitted", "Manager", "HR", "Notice period"];
function stepOf(item: Resignation) {
  if (item.state === "pending_manager" || item.state === "on_hold") return 1;
  if (item.state === "pending_hr") return 2;
  return 3;
}

export function ResignationDetails({ item }: { item: Resignation }) {
  return (
    <KeyValueList
      items={[
        { label: "Reference", value: item.reference },
        { label: "Reason", value: resignationReasonLabels[item.reason] },
        { label: "Submitted", value: formatDateTime(item.submittedAt) },
        { label: "Notice policy", value: item.noticeBasis },
        { label: "Notice ends", value: formatDate(item.policyLastWorkingDay) },
        { label: "Requested last day", value: formatDate(item.requestedLastWorkingDay), hint: item.earlyRelease ? `Early release: ${item.earlyReleaseReason}` : undefined },
        ...(item.agreedLastWorkingDay ? [{ label: "Agreed last day", value: formatDate(item.agreedLastWorkingDay) }] : []),
        ...(item.managerRecommendation ? [{ label: "Manager's note", value: item.managerRecommendation }] : []),
      ]}
    />
  );
}

export function ResignationHistory({ item }: { item: Resignation }) {
  return <Timeline items={[...item.history].reverse().map((entry) => ({ id: entry.id, title: entry.event, meta: `${entry.actor} · ${formatDateTime(entry.at)}`, detail: entry.note ?? undefined }))} />;
}

export function ResignationSection({ view }: { view: ResignationView }) {
  const { current, exit } = view;
  return (
    <div className="page">
      <PageHeader eyebrow="Me" title="Resignation" description="Submit your resignation, track approvals, and follow your exit formalities. Mock data — not a legal notice." />

      {view.team.length > 0 && (
        <Card labelledBy="team-resignations">
          <CardHeader id="team-resignations" title="Your team" description="Resignations from your direct reports. HR makes the final decision." />
          <ul className="list">
            {view.team.map((item) => (
              <ListRow
                key={item.id}
                leading={<Avatar initials={item.person.initials} seed={item.person.id} src={item.person.photoUrl} size="sm" />}
                title={item.person.name}
                meta={`${item.reference} · ${resignationReasonLabels[item.reason]} · last day ${formatDate(item.agreedLastWorkingDay ?? item.requestedLastWorkingDay)} · ${formatRelative(item.submittedAt)}${item.earlyRelease ? " · early release requested" : ""}`}
                trailing={
                  <>
                    <StatusBadge status={resignationStatus[item.state]} />
                    {item.permissions.canDecideAsManager && <ResignationDecisionSheet resignation={item} asHr={false} />}
                  </>
                }
              />
            ))}
          </ul>
        </Card>
      )}

      {current && current.state !== "accepted" && (
        <div className="split">
          <Card labelledBy="current-resignation">
            <CardHeader id="current-resignation" title="Your resignation" description={current.reference} action={<StatusBadge status={resignationStatus[current.state]} />} />
            <CardBody className="stack">
              <StepIndicator steps={steps} current={stepOf(current)} label="Resignation progress" />
              {current.state === "on_hold" && <Alert tone="info" title="On hold">Your manager or HR would like to talk before deciding. You can still withdraw.</Alert>}
              <ResignationDetails item={current} />
              {current.permissions.canWithdraw && (
                <div className="sheet-actions">
                  <WithdrawResignationButton id={current.id} version={current.version} />
                </div>
              )}
            </CardBody>
          </Card>
          <Card labelledBy="rs-history">
            <CardHeader id="rs-history" title="History" />
            <CardBody>
              <ResignationHistory item={current} />
            </CardBody>
          </Card>
        </div>
      )}

      {exit && (
        <div className="split">
          <Card labelledBy="my-exit">
            <CardHeader id="my-exit" title={exit.status === "exited" ? "You have been relieved" : "Your exit"} description={`Last working day ${formatDate(exit.lastWorkingDay)}`} action={<Badge tone={exit.status === "exited" ? "neutral" : "warning"}>{exit.status === "exited" ? "Exited" : "Serving notice"}</Badge>} />
            <CardBody className="stack">
              <ul className="list">
                {exit.clearances.map((clearance) => (
                  <ListRow key={clearance.department} leading={<AppIcon name={clearance.status === "cleared" ? "check" : "timer"} size={20} />} title={clearance.label} trailing={<Badge tone={clearance.status === "cleared" ? "success" : "warning"}>{clearance.status === "cleared" ? "Cleared" : "Pending"}</Badge>} />
                ))}
              </ul>
              {exit.assetsToReturn > 0 && (
                <Alert tone="warning" title={`${exit.assetsToReturn} company asset${exit.assetsToReturn === 1 ? "" : "s"} to return`} action={<ButtonLink href="/me/assets" size="sm">My assets</ButtonLink>}>
                  Unreturned assets are recovered from your full & final settlement at book value.
                </Alert>
              )}
            </CardBody>
          </Card>
          <Card labelledBy="my-fnf">
            <CardHeader id="my-fnf" title="Full & final settlement" />
            <CardBody className="stack">
              {exit.settlement ? (
                <KeyValueList
                  columns={1}
                  items={[
                    { label: "Reference", value: exit.settlement.reference },
                    { label: "Status", value: <StatusBadge status={settlementStatus[exit.settlement.state as SettlementState] ?? { label: exit.settlement.state, tone: "neutral" }} /> },
                    { label: "Net amount", value: exit.settlement.net ? <MoneyText value={exit.settlement.net} /> : "Shown once approved" },
                    ...(exit.settlement.paidAt ? [{ label: "Paid", value: formatDateTime(exit.settlement.paidAt) }] : []),
                  ]}
                />
              ) : (
                <p className="muted">Payroll prepares your settlement from your last working day.</p>
              )}
              {exit.letters.length > 0 && (
                <ul className="list">
                  {exit.letters.map((letter) => (
                    <ListRow key={letter.id} leading={<AppIcon name="document" size={20} />} title={letter.title} meta={formatDate(letter.issuedAt.slice(0, 10))} href={letter.href} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {current?.state === "accepted" && (
        <Card labelledBy="accepted-resignation">
          <CardHeader id="accepted-resignation" title="Accepted resignation" description={current.reference} action={<StatusBadge status={resignationStatus.accepted} />} />
          <CardBody className="stack">
            <ResignationDetails item={current} />
            <ResignationHistory item={current} />
          </CardBody>
        </Card>
      )}

      {view.canResign ? (
        <div className="split">
          <Card labelledBy="resign-form">
            <CardHeader id="resign-form" title="Submit resignation" description="Goes to your manager first, then HR." />
            <CardBody>
              <ResignationForm today={view.today} policyLastDay={view.policy.defaultLastWorkingDay} noticeDays={view.policy.noticeDays} />
            </CardBody>
          </Card>
          <Card labelledBy="notice-policy">
            <CardHeader id="notice-policy" title="Your notice period" />
            <CardBody className="stack">
              <KeyValueList columns={1} items={[{ label: "Policy", value: view.policy.basis }, { label: "Notice ends if you resign today", value: formatDate(view.policy.defaultLastWorkingDay) }]} />
              <ul className="bullet-list small muted">
                <li>Full-time (confirmed): 60 days · on probation: 30 days · interns and contract staff: 15 days.</li>
                <li>Leaving earlier needs approval; the shortfall may be recovered from your settlement unless HR waives it.</li>
                <li>You can withdraw while the resignation is under review.</li>
              </ul>
              <p className="small muted">
                Questions? <Link href="/helpdesk" className="inline-link">Ask HR confidentially</Link>.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : (
        !current && !exit && view.blockedReason && <Alert tone="info">{view.blockedReason}</Alert>
      )}

      {view.past.length > 0 && (
        <Card labelledBy="past-resignations">
          <CardHeader id="past-resignations" title="Earlier resignations" />
          <ul className="list">
            {view.past.map((item) => (
              <ListRow key={item.id} title={`${item.reference} · ${resignationReasonLabels[item.reason]}`} meta={`Submitted ${formatDate(item.submittedAt.slice(0, 10))}`} trailing={<StatusBadge status={resignationStatus[item.state]} />} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
