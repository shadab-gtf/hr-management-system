import { CheckInSheet, GoalSheet, RemoveGoalButton, SubmitGoalsButton } from "@/components/features/performance/goal-controls";
import { AcknowledgeForm, SelfReviewForm } from "@/components/features/performance/review-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, DateText, ListRow, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { perfPartStatusLabels, perfPromotionLabels, perfSheetStatusLabels, type MyPerformance } from "@/types/performance";
import { CycleMeta, CycleTabs, GoalItem, MockNote, PhaseBadge, PhaseSteps, ReviewReadout } from "./shared";

export function MyPerformanceSection({ data }: { data: MyPerformance }) {
  const { cycle, sheet, goals, self, outcome, can } = data;
  const header = <PageHeader title="Goals & reviews" description="Set goals, check in on progress, review yourself and see results once HR releases them." />;
  if (!cycle) {
    return (
      <div className="page">
        {header}
        <EmptyState icon="flag" title="No review cycle yet" description="You'll see goals and reviews here once HR launches a cycle you're eligible for." />
      </div>
    );
  }
  const total = sheet?.totalWeight ?? 0;
  const released = outcome?.state === "released" ? outcome : null;
  return (
    <div className="page">
      {header}
      <CycleTabs cycles={data.cycles} active={cycle.id} base="/performance" />
      <Card labelledBy="perf-cycle">
        <CardHeader id="perf-cycle" title={cycle.name} description={<CycleMeta cycle={cycle} />} action={<PhaseBadge cycle={cycle} />} />
        <CardBody>
          <PhaseSteps cycle={cycle} />
          <p className="muted small">Reviewer: {data.reviewer ? `${data.reviewer.name} · ${data.reviewer.designation}` : "Not assigned"}</p>
        </CardBody>
      </Card>

      {outcome && (
        <Card labelledBy="perf-outcome">
          <CardHeader id="perf-outcome" title="Result" />
          <CardBody>
            {outcome.state === "under_review" && (
              <Alert tone="info" title="Under review">
                Ratings and manager comments stay private until HR releases results (planned {formatDate(outcome.releaseOn)}).
              </Alert>
            )}
            {outcome.state === "not_rated" && <Alert tone="warning" title="Not rated">{outcome.reason}</Alert>}
            {released && (
              <div className="stack">
                <div className="perf-final">
                  <span className="perf-final-num num">{released.finalRating}</span>
                  <div>
                    <p className="perf-final-label">{released.finalLabel}</p>
                    <p className="muted small">
                      Final rating · released {formatDateTime(released.releasedAt)}
                      {released.managerScore ? ` · manager weighted score ${released.managerScore}` : ""}
                    </p>
                  </div>
                </div>
                {released.manager && (
                  <>
                    <p>
                      <strong>{released.reviewer?.name ?? "Reviewer"}:</strong> {released.manager.summary}
                    </p>
                    <p className="muted small">Promotion: {perfPromotionLabels[released.manager.promotion]}. Any pay change is communicated separately after compensation approval.</p>
                    <ReviewReadout part={released.manager} goals={goals} competencies={data.competencies} heading="Manager ratings" />
                  </>
                )}
                {released.acknowledgedAt ? (
                  <Alert tone="success" title="Acknowledged">
                    {formatDateTime(released.acknowledgedAt)}
                    {released.acknowledgementComment ? ` — “${released.acknowledgementComment}”` : ""}
                  </Alert>
                ) : (
                  can.acknowledge && data.reviewId && <AcknowledgeForm reviewId={data.reviewId} />
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid grid-stats grid-stats--3">
        <StatCard label="Goals" value={goals.length} meta={`${total}% weight assigned`} icon="flag" accent="magenta" />
        <StatCard label="Average progress" value={`${goals.length ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0}%`} meta={`${goals.filter((g) => g.health !== "on_track").length} need attention`} icon="chart" accent="cyan" />
        <StatCard label="Self review" value={self ? perfPartStatusLabels[self.status].label : "—"} meta={cycle.phase === "self_review" ? `Due ${formatDate(cycle.phaseDates.self_review.end)}` : undefined} icon="clipboardTick" accent="yellow" />
      </div>

      <Card labelledBy="perf-goals">
        <CardHeader
          id="perf-goals"
          title="Goals"
          description={sheet ? <>Total weight <strong className="num">{total}%</strong> of 100%</> : undefined}
          action={
            <span className="row-actions">
              {sheet && <StatusBadge status={perfSheetStatusLabels[sheet.status]} />}
              {can.editGoals && <GoalSheet cycleId={cycle.id} objectives={data.objectives} period={{ start: cycle.periodStart, end: cycle.periodEnd }} remaining={100 - total} />}
            </span>
          }
        />
        <CardBody>
          {sheet?.status === "sent_back" && sheet.comment && (
            <Alert tone="warning" title={`Sent back by ${sheet.decidedBy ?? "your manager"}`}>
              {sheet.comment}
            </Alert>
          )}
          {sheet?.status === "submitted" && <Alert tone="info">Waiting for {data.reviewer?.name ?? "your manager"} to approve. Goals are read-only meanwhile.</Alert>}
          {goals.length === 0 ? (
            <EmptyState compact icon="flag" title="No goals yet" description={can.editGoals ? "Add 2–8 measurable goals whose weights total 100%." : "Goals can be added during goal setting."} />
          ) : (
            <ul className="perf-goal-list">
              {goals.map((goal) => (
                <GoalItem
                  key={goal.id}
                  goal={goal}
                  actions={
                    can.editGoals ? (
                      <>
                        <GoalSheet cycleId={cycle.id} goal={goal} objectives={data.objectives} period={{ start: cycle.periodStart, end: cycle.periodEnd }} remaining={100 - total} />
                        <RemoveGoalButton goalId={goal.id} />
                      </>
                    ) : can.checkIn ? (
                      <CheckInSheet goal={goal} />
                    ) : undefined
                  }
                />
              ))}
            </ul>
          )}
          {can.editGoals && (
            <div className="sheet-actions">
              <SubmitGoalsButton cycleId={cycle.id} total={total} count={goals.length} />
            </div>
          )}
        </CardBody>
      </Card>

      {self && goals.length > 0 ? (
        <Card labelledBy="perf-self">
          <CardHeader id="perf-self" title="Self review" description="Rate each goal and competency with evidence." action={<StatusBadge status={perfPartStatusLabels[self.status]} />} />
          <CardBody>
            {can.selfReview && data.reviewId ? (
              <SelfReviewForm reviewId={data.reviewId} version={data.reviewVersion} goals={goals} competencies={data.competencies} self={self} scale={cycle.scale} goalWeight={cycle.goalWeight} />
            ) : self.status === "submitted" ? (
              <>
                <p className="muted small">Submitted {self.submittedAt ? formatDateTime(self.submittedAt) : ""}</p>
                <ReviewReadout part={self} goals={goals} competencies={data.competencies} heading="Your ratings" />
              </>
            ) : (
              <p className="muted">
                {cycle.phase === "goal_setting" || cycle.phase === "draft"
                  ? `Self review opens ${formatDate(cycle.phaseDates.self_review.start)}.`
                  : sheet?.status !== "approved"
                    ? "Self review needs approved goals first."
                    : "The self review window has closed."}
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-2">
        <Card labelledBy="perf-comp">
          <CardHeader id="perf-comp" title="Competencies" description="The behaviours every review rates." />
          <CardBody>
            <ul className="perf-comp-list">
              {data.competencies.map((c) => (
                <li key={c.id}>
                  <p className="perf-rate-title">{c.name}</p>
                  <p className="muted small">{c.description}</p>
                  <ul className="bullet-list small">
                    {c.behaviours.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card labelledBy="perf-history">
          <CardHeader id="perf-history" title="Past results" />
          <CardBody className="flush">
            {data.history.length === 0 ? (
              <EmptyState compact icon="award" title="No released cycles" description="Final ratings appear here after release." />
            ) : (
              <ul className="list">
                {data.history.map((h) => (
                  <ListRow
                    key={h.cycleId}
                    href={`/performance?cycle=${h.cycleId}`}
                    title={h.cycleName}
                    meta={h.releasedAt ? <>Released <DateText value={h.releasedAt.slice(0, 10)} /></> : undefined}
                    trailing={h.finalRating ? <Badge tone="info">{`${h.finalRating} · ${h.finalLabel}`}</Badge> : <Badge>Not rated</Badge>}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
      <MockNote>Demo data from the mock backend; ratings here are not an HR record and never change pay.</MockNote>
    </div>
  );
}
