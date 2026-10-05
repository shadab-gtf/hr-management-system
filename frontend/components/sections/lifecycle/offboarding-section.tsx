import type { ReactNode } from "react";
import Link from "next/link";
import { CompleteExitButton, OffboardingTaskToggle } from "@/components/features/admin/config-controls";
import { ClearanceSheet, ExitInterviewSheet } from "@/components/features/lifecycle/offboarding-controls";
import { ResignationDecisionSheet } from "@/components/features/lifecycle/resignation-controls";
import { AppIcon } from "@/components/ui/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, ListRow, Meter, MoneyText, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime, formatRelative, humanize } from "@/lib/utils/format";
import { assetCategoryLabels, ratingLabels, resignationReasonLabels, resignationStatus, settlementStatus } from "@/components/sections/lifecycle/labels";
import type { OffboardingBoard, OffboardingDetail, SettlementState } from "@/types/lifecycle";

function ExitCase({ item, today }: { item: OffboardingDetail; today: string }) {
  const cleared = item.clearances.filter((clearance) => clearance.status === "cleared").length;
  const exited = item.status === "exited";
  const custom = item.tasks.filter((task) => !["handover", "assets", "access", "fnf", "exit_interview", "relieving"].includes(task.id));
  return (
    <Card labelledBy={`off-${item.id}`}>
      <div className="card-header">
        <div className="person">
          <Avatar initials={item.person.initials} seed={item.person.id} src={item.person.photoUrl} size="lg" />
          <span className="person-text">
            <h2 id={`off-${item.id}`}>{item.person.name}</h2>
            <span className="person-role">
              {item.person.designation} · {item.department} · last day {formatDate(item.lastWorkingDay)}
            </span>
          </span>
        </div>
        {exited ? <Badge>Exited</Badge> : <Badge tone={item.lastWorkingDay <= today ? "danger" : "warning"}>{humanize(item.reason)}</Badge>}
      </div>
      <CardBody className="stack">
        <p className="small muted">
          {item.resignationReference ? `${item.resignationReference} · ` : ""}Started {formatRelative(item.startedAt)}
          {item.noticeShortfallDays > 0 ? ` · ${item.noticeShortfallDays} days short of notice` : ""}
          {item.reasonNote ? ` · “${item.reasonNote}”` : ""}
        </p>
        <Meter value={cleared} max={item.clearances.length} label={`${cleared} of ${item.clearances.length} clearances done`} tone="warning" />
        <h3 className="subheading">Department clearances</h3>
        <ul className="list">
          {item.clearances.map((clearance) => (
            <ListRow
              key={clearance.department}
              leading={<AppIcon name={clearance.status === "cleared" ? "check" : "timer"} size={20} />}
              title={clearance.label}
              meta={clearance.status === "cleared" ? `${clearance.clearedBy ?? ""} · ${clearance.clearedAt ? formatDateTime(clearance.clearedAt) : ""}${clearance.note ? ` · ${clearance.note}` : ""}` : clearance.blockers.length ? clearance.blockers.join(" · ") : "Ready to clear"}
              trailing={
                <>
                  <Badge tone={clearance.status === "cleared" ? "success" : clearance.blockers.length ? "danger" : "warning"}>{clearance.status === "cleared" ? "Cleared" : clearance.blockers.length ? "Blocked" : "Pending"}</Badge>
                  {!exited && <ClearanceSheet employeeId={item.person.id} name={item.person.name} clearance={clearance} />}
                </>
              }
            />
          ))}
        </ul>

        <h3 className="subheading">Assets to return</h3>
        {item.assets.length ? (
          <ul className="list">
            {item.assets.map((asset) => (
              <ListRow key={asset.id} leading={<span className="file-icon">{asset.tag.slice(0, 3)}</span>} title={`${asset.tag} · ${asset.make} ${asset.model}`} meta={`${assetCategoryLabels[asset.category]} · recovery at book value`} trailing={<MoneyText value={asset.bookValue} />} />
            ))}
          </ul>
        ) : (
          <p className="small muted">All company assets returned.</p>
        )}
        {item.assets.length > 0 && !exited && (
          <p className="small">
            <Link href="/admin/assets?status=assigned" className="inline-link">Record returns in Assets</Link>
          </p>
        )}

        <h3 className="subheading">Exit interview</h3>
        {item.interview ? (
          <div className="stack">
            <p className="small">
              <strong>{resignationReasonLabels[item.interview.primaryReason]}</strong> · would rejoin: {item.interview.wouldRejoin} · {item.interview.wouldRecommend ? "would recommend" : "would not recommend"} · by {item.interview.conductedBy}
            </p>
            <details className="lc-details">
              <summary>View answers (confidential)</summary>
              <ul className="bullet-list small">
                {(Object.keys(ratingLabels) as (keyof typeof ratingLabels)[]).map((key) => (
                  <li key={key}>
                    {ratingLabels[key]}: {item.interview?.ratings[key]}/5
                  </li>
                ))}
              </ul>
              {item.interview.comments && <p className="small">{item.interview.comments}</p>}
            </details>
          </div>
        ) : (
          <p className="small muted">Not recorded yet.</p>
        )}
        {!exited && <ExitInterviewSheet employeeId={item.person.id} name={item.person.name} interview={item.interview} />}

        <h3 className="subheading">Full & final settlement</h3>
        {item.settlement ? (
<ul className="list">
          <ListRow
            title={item.settlement.reference}
            meta={<StatusBadge status={settlementStatus[item.settlement.state as SettlementState] ?? { label: item.settlement.state, tone: "neutral" }} />}
            trailing={<MoneyText value={item.settlement.net} />}
            href={`/admin/settlements/${item.settlement.id}`}
          />
          </ul>
        ) : (
          <p className="small muted">
            Not prepared. <Link href="/admin/settlements" className="inline-link">Prepare in F&F settlements</Link>
          </p>
        )}

        {custom.length > 0 && (
          <>
            <h3 className="subheading">Other checklist tasks</h3>
            <ul className="task-list">
              {custom.map((task) => (
                <li key={task.id}>
                  {exited ? <span>{task.title}</span> : <OffboardingTaskToggle employeeId={item.person.id} taskId={task.id} title={task.title} done={task.done} />}
                  <span className="task-meta">
                    {task.owner} · due {formatDate(task.due, "short")}
                    {task.blocking && !task.done && <Badge tone="danger">Blocking</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {item.letters.length > 0 && (
          <>
            <h3 className="subheading">Letters</h3>
            <ul className="list">
              {item.letters.map((letter) => (
                <ListRow key={letter.id} leading={<AppIcon name="document" size={20} />} title={letter.title} meta={formatDateTime(letter.issuedAt)} href={letter.href} />
              ))}
            </ul>
          </>
        )}

        {!exited && (
          <div className="stack">
            {item.completeBlockers.length > 0 && <p className="small muted">To close: {item.completeBlockers.join(" · ")}</p>}
            <div className="sheet-actions">
              <CompleteExitButton employeeId={item.person.id} disabledReason={item.completeBlockers.length ? item.completeBlockers[0] : undefined} />
            </div>
            <p className="small muted">Completing marks the employee exited and generates relieving and experience letters from the active templates.</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function LifecycleOffboardingSection({ board, tabs }: { board: OffboardingBoard; tabs: ReactNode }) {
  const open = board.cases.filter((item) => item.status === "notice");
  return (
    <div className="page">
      <PageHeader
        eyebrow="HR admin"
        title="Offboarding"
        description="Resignations awaiting decisions, then each exit: clearances, assets, exit interview, settlement and letters."
        actions={
          <ButtonLink href="/admin/onboarding/checklist" variant="secondary">
            <AppIcon name="edit" size={20} />
            Edit checklists
          </ButtonLink>
        }
      />
      {tabs}
      <div className="grid grid-stats">
        <StatCard label="Resignations to decide" value={board.resignations.length} meta="With manager, HR or on hold" icon="userRemove" accent="magenta" />
        <StatCard label="Serving notice" value={open.length} meta="Open exits" icon="people" accent="yellow" />
        <StatCard label="Leaving this month" value={open.filter((item) => item.lastWorkingDay.slice(0, 7) === board.today.slice(0, 7)).length} meta="Last day this month" icon="calendar" accent="cyan" />
        <StatCard label="Assets outstanding" value={open.reduce((sum, item) => sum + item.assets.length, 0)} meta="From people serving notice" icon="box" />
      </div>

      <Card labelledBy="rs-queue">
        <CardHeader id="rs-queue" title="Resignations" description="Accepting opens the exit case and sets the notice status." />
        {board.resignations.length ? (
          <ul className="list">
            {board.resignations.map((item) => (
              <ListRow
                key={item.id}
                leading={<Avatar initials={item.person.initials} seed={item.person.id} src={item.person.photoUrl} size="sm" />}
                title={item.person.name}
                meta={`${item.reference} · ${item.department} · ${resignationReasonLabels[item.reason]} · requested last day ${formatDate(item.requestedLastWorkingDay)}${item.earlyRelease ? " (early release)" : ""}${item.managerRecommendation ? ` · Manager: ${item.managerRecommendation}` : ""}`}
                trailing={
                  <>
                    <StatusBadge status={resignationStatus[item.state]} />
                    {item.permissions.canDecideAsHr && <ResignationDecisionSheet resignation={item} asHr />}
                  </>
                }
              />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon="userTick" title="No resignations waiting" description="New resignations appear here as employees submit them." />
        )}
      </Card>

      {board.cases.length === 0 ? (
        <Card>
          <EmptyState icon="people" title="No exits in progress" description="Accept a resignation above, or start an exit from the employee's profile." action={<ButtonLink href="/employees">Go to People</ButtonLink>} />
        </Card>
      ) : (
        <div className="grid grid-2">
          {board.cases.map((item) => (
            <ExitCase key={item.id} item={item} today={board.today} />
          ))}
        </div>
      )}

      {board.exitReasons.length > 0 && (
        <Card labelledBy="exit-insights">
          <CardHeader id="exit-insights" title="Exit interview insights" description="Aggregated and anonymised across recorded interviews." />
          <CardBody className="grid grid-2">
            <ul className="bar-list">
              {board.exitReasons.map((row) => (
                <li key={row.reason}>
                  <span className="bar-label">{resignationReasonLabels[row.reason]}</span>
                  <Meter value={row.count} max={Math.max(...board.exitReasons.map((r) => r.count))} label={`${resignationReasonLabels[row.reason]}: ${row.count}`} tone="secondary" />
                  <span className="bar-value num">{row.count}</span>
                </li>
              ))}
            </ul>
            <ul className="bar-list">
              {board.averageRatings.map((row) => (
                <li key={row.key}>
                  <span className="bar-label">{ratingLabels[row.key]}</span>
                  <Meter value={Number(row.average)} max={5} label={`${ratingLabels[row.key]}: ${row.average} of 5`} />
                  <span className="bar-value num">{row.average}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      <Alert tone="neutral">Mock workflow: clearances are recorded by HR on behalf of departments; no systems are actually de-provisioned.</Alert>
    </div>
  );
}
