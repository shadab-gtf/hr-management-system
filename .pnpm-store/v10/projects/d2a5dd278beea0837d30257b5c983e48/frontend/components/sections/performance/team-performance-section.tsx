import { GoalDecision } from "@/components/features/performance/goal-controls";
import { ManagerReviewForm } from "@/components/features/performance/review-forms";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, PersonCell, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime } from "@/lib/utils/format";
import { perfPartStatusLabels, perfSheetStatusLabels, type PerfReviewDetail, type TeamPerformance, type TeamReviewee } from "@/types/performance";
import { CycleMeta, CycleTabs, GoalItem, MockNote, PhaseBadge, ReviewReadout } from "./shared";

function ReviewDetail({ detail }: { detail: PerfReviewDetail }) {
  const { cycle, person } = detail;
  const back = `/performance/team?cycle=${cycle.id}`;
  return (
    <div className="page">
      <PageHeader back={{ href: back, label: "Team reviews" }} eyebrow={cycle.name} title={person.name} description={person.designation} actions={<PhaseBadge cycle={cycle} />} />
      <div className="split split--wide-aside">
        <div className="stack">
          <Card labelledBy="rv-goals">
            <CardHeader id="rv-goals" title="Goals and check-ins" description={detail.sheet ? `Goal sheet: ${perfSheetStatusLabels[detail.sheet.status].label}` : undefined} />
            <CardBody>
              {detail.goals.length === 0 ? (
                <EmptyState compact icon="flag" title="No goals" description="This person hasn't added goals." />
              ) : (
                <ul className="perf-goal-list">
                  {detail.goals.map((goal) => (
                    <GoalItem key={goal.id} goal={goal} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card labelledBy="rv-self">
            <CardHeader id="rv-self" title="Self review" action={<StatusBadge status={perfPartStatusLabels[detail.selfStatus]} />} />
            <CardBody>
              {detail.self ? (
                <ReviewReadout part={detail.self} goals={detail.goals} competencies={detail.competencies} heading={`${person.name.split(" ")[0]}'s ratings`} />
              ) : (
                <p className="muted">Self review drafts are private until submitted.</p>
              )}
            </CardBody>
          </Card>
        </div>
        <Card labelledBy="rv-mgr">
          <CardHeader id="rv-mgr" title="Your review" action={<StatusBadge status={perfPartStatusLabels[detail.manager.status]} />} />
          <CardBody>
            {detail.canEdit ? (
              <ManagerReviewForm reviewId={detail.reviewId} version={detail.version} name={person.name} goals={detail.goals} competencies={detail.competencies} manager={detail.manager} self={detail.self} scale={cycle.scale} goalWeight={cycle.goalWeight} />
            ) : (
              <div className="stack">
                {detail.lockReason && <Alert tone="info">{detail.lockReason}</Alert>}
                {detail.manager.status !== "not_started" && (
                  <>
                    <p>
                      <strong>Overall rating:</strong> {detail.manager.overallRating ?? "—"} · <strong>Increment recommendation:</strong> {detail.manager.incrementPercent ? `${detail.manager.incrementPercent}%` : "—"}
                    </p>
                    {detail.manager.summary && <p>{detail.manager.summary}</p>}
                    <ReviewReadout part={detail.manager} goals={detail.goals} competencies={detail.competencies} heading="Your ratings" />
                  </>
                )}
                {detail.finalRating !== null && (
                  <Alert tone="success" title={`Final rating ${detail.finalRating}`}>
                    {detail.acknowledgedAt ? `Acknowledged ${formatDateTime(detail.acknowledgedAt)}${detail.acknowledgementComment ? ` — “${detail.acknowledgementComment}”` : ""}` : "Not yet acknowledged by the employee."}
                  </Alert>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
      <MockNote>Mock backend. Increment recommendations are advisory; they never change pay without a separate compensation approval.</MockNote>
    </div>
  );
}

export function TeamPerformanceSection({ data }: { data: TeamPerformance }) {
  if (data.detail) return <ReviewDetail detail={data.detail} />;
  const { cycle, reviewees, approvals } = data;
  const header = <PageHeader title="Team reviews" description="Approve goals and review the people assigned to you. You only see your reviewees." />;
  const open = (row: TeamReviewee) => `/performance/team?cycle=${cycle?.id ?? ""}&review=${row.reviewId}`;
  return (
    <div className="page">
      {header}
      {approvals.length > 0 && (
        <Card labelledBy="tm-approvals">
          <CardHeader id="tm-approvals" title="Goals awaiting your approval" description={`${approvals.length} goal ${approvals.length === 1 ? "sheet" : "sheets"}`} />
          <CardBody>
            <ul className="perf-approval-list">
              {approvals.map((a) => (
                <li key={a.sheet.id} className="perf-approval">
                  <div className="perf-approval-head">
                    <PersonCell person={a.person} meta={`${a.cycleName} · ${a.goals.length} goals · ${a.sheet.totalWeight}%`} />
                    <GoalDecision sheetId={a.sheet.id} version={a.sheet.version} name={a.person.name} />
                  </div>
                  <ul className="bullet-list small">
                    {a.goals.map((g) => (
                      <li key={g.id}>
                        <strong>{g.title}</strong> ({g.weight}%) — {g.target}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      {!cycle ? (
        <EmptyState icon="team" title="No reviews assigned" description="People you manage appear here once HR launches a cycle." />
      ) : (
        <>
          <CycleTabs cycles={data.cycles} active={cycle.id} base="/performance/team" />
          <div className="grid grid-stats grid-stats--3">
            <StatCard label="Reviewees" value={reviewees.length} meta={cycle.name} icon="team" accent="magenta" />
            <StatCard label="Self reviews in" value={reviewees.filter((r) => r.selfStatus === "submitted").length} meta={`of ${reviewees.length}`} icon="clipboard" accent="cyan" />
            <StatCard label="Your reviews done" value={reviewees.filter((r) => r.managerStatus === "submitted").length} meta={`of ${reviewees.length}`} icon="clipboardTick" accent="yellow" />
          </div>
          <Card labelledBy="tm-list">
            <CardHeader id="tm-list" title={cycle.name} description={<CycleMeta cycle={cycle} />} action={<PhaseBadge cycle={cycle} />} />
            <CardBody className="flush">
              <DataTable<TeamReviewee>
                caption={`Reviewees in ${cycle.name}`}
                rows={reviewees}
                rowKey={(r) => r.reviewId}
                empty={<EmptyState compact icon="team" title="Nobody to review" description="No one is assigned to you in this cycle." />}
                mobileRow={(r) => ({
                  title: r.person.name,
                  meta: (
                    <>
                      Self: {perfPartStatusLabels[r.selfStatus].label} · Yours: {perfPartStatusLabels[r.managerStatus].label}
                    </>
                  ),
                  href: open(r),
                })}
                columns={[
                  { key: "person", header: "Employee", rowHeader: true, cell: (r) => <PersonCell person={r.person} meta={`${r.department}${r.reassigned ? " · assigned by HR" : ""}`} /> },
                  { key: "goals", header: "Goals", cell: (r) => (r.sheet ? <StatusBadge status={perfSheetStatusLabels[r.sheet.status]} /> : "—") },
                  { key: "self", header: "Self review", cell: (r) => <StatusBadge status={perfPartStatusLabels[r.selfStatus]} /> },
                  { key: "mgr", header: "Your review", cell: (r) => <StatusBadge status={perfPartStatusLabels[r.managerStatus]} /> },
                  { key: "rating", header: "Rating", hideOnMobile: true, cell: (r) => (r.finalRating ? <Badge tone="success">{`Final ${r.finalRating}`}</Badge> : r.managerRating ? <span className="num">{r.managerRating}</span> : "—") },
                  { key: "open", header: "Actions", align: "end", cell: (r) => <ButtonLink href={open(r)} size="sm" aria-label={`Open review for ${r.person.name}`}>Open review</ButtonLink> },
                ]}
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
