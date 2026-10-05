import Link from "next/link";
import type { ReactNode } from "react";
import { AdvancePhaseButton, CalibrateSheet, CalibrationLockButton, CompetencySheet, CycleSheet, ReassignSheet } from "@/components/features/performance/admin-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Alert, KeyValueList, Meter, PersonCell, StatusBadge, TabsNav, Timeline } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatDateRange, formatDateTime } from "@/lib/utils/format";
import {
  perfCycleKindLabels,
  perfPartStatusLabels,
  perfPhaseLabels,
  perfPhaseOrder,
  perfPromotionLabels,
  perfSheetStatusLabels,
  perfWindowPhases,
  type AdminPerformance,
  type PerfDepartmentProgress,
  type PerfParticipant,
} from "@/types/performance";
import { MockNote, PhaseBadge, PhaseSteps } from "./shared";

function ProgressCell({ value, total, label }: { value: number; total: number; label: string }) {
  return (
    <span className="perf-progress-cell">
      <Meter value={value} max={total} label={label} />
      <span className="num small">
        {value}/{total}
      </span>
    </span>
  );
}

export function AdminPerformanceSection({ data, dept, today, tabs }: { data: AdminPerformance; dept: string | undefined; today: string; tabs: ReactNode }) {
  const { cycle } = data;
  const header = <PageHeader eyebrow="HR admin" title="Performance cycles" description="Configure cycles, move phases, calibrate and release. Every step is audited." actions={<CycleSheet departments={data.departments} today={today} />} />;
  if (!cycle)
    return (
      <div className="page">
        {header}
        {tabs}
        <EmptyState icon="award" title="No review cycles" description="Create a cycle to start goal setting." />
      </div>
    );
  const phaseAt = perfPhaseOrder.indexOf(cycle.phase);
  const calibrating = cycle.phase === "calibration";
  const canReassign = phaseAt < perfPhaseOrder.indexOf("calibration") && cycle.phase !== "draft";
  const rows = dept ? data.participants.filter((p) => p.department === dept) : data.participants;
  const departments = [...new Set(data.participants.map((p) => p.department))];
  const next = data.advance.next;
  const scale = cycle.scale.map((s) => ({ rating: s.rating, label: s.label }));
  const labelOf = (r: number | null) => (r ? `${r} · ${cycle.scale.find((s) => s.rating === r)?.label ?? ""}` : "—");
  const counted = data.distribution.reduce((s, d) => s + d.count, 0);
  const deptHref = (d: string | null) => `/admin/performance?cycle=${cycle.id}${d ? `&dept=${encodeURIComponent(d)}` : ""}`;
  return (
    <div className="page">
      {header}
      {tabs}
      <TabsNav label="Review cycles" tabs={data.cycles.map((c) => ({ href: `/admin/performance?cycle=${c.id}`, label: c.name, active: c.id === cycle.id }))} />
      <Card labelledBy="ap-cycle">
        <CardHeader
          id="ap-cycle"
          title={cycle.name}
          description={`${perfCycleKindLabels[cycle.kind]} · ${formatDateRange(cycle.periodStart, cycle.periodEnd)}`}
          action={
            <span className="row-actions">
              <PhaseBadge cycle={cycle} />
              {cycle.phase !== "released" && <CycleSheet cycle={cycle} departments={data.departments} today={today} />}
            </span>
          }
        />
        <CardBody>
          <PhaseSteps cycle={cycle} />
          <KeyValueList
            columns={3}
            items={[
              { label: "Participants", value: cycle.participantCount, hint: cycle.phase === "draft" ? "Preview from eligibility rules" : undefined },
              { label: "Eligible if joined by", value: formatDate(cycle.eligibilityCutoff) },
              { label: "Departments", value: cycle.departments.length ? cycle.departments.join(", ") : "Everyone" },
              { label: "Weightage", value: `Goals ${cycle.goalWeight}% · Competencies ${cycle.competencyWeight}%` },
              ...perfWindowPhases.map((p) => ({ label: perfPhaseLabels[p], value: formatDateRange(cycle.phaseDates[p].start, cycle.phaseDates[p].end) })),
              { label: "Release", value: cycle.releasedAt ? `Released ${formatDateTime(cycle.releasedAt)}` : `Planned ${formatDate(cycle.releaseOn)}` },
            ]}
          />
          {next ? (
            <div className="stack">
              {data.advance.blockers.map((b) => (
                <Alert key={b} tone="danger">
                  {b}
                </Alert>
              ))}
              {data.advance.warnings.map((w) => (
                <Alert key={w} tone="warning">
                  {w}
                </Alert>
              ))}
              <div className="row-actions">
                <AdvancePhaseButton cycleId={cycle.id} phase={cycle.phase} next={next} blocked={data.advance.blockers[0] ?? null} />
                <span className="muted small">Phases only move forward. Employees see ratings only after Released.</span>
              </div>
            </div>
          ) : (
            <Alert tone="success">Results released. Employees can view and acknowledge their ratings.</Alert>
          )}
        </CardBody>
      </Card>

      {cycle.phase !== "draft" && (
        <>
          <div className="grid grid-stats">
            <StatCard label="Goals approved" value={data.participants.filter((p) => p.sheetStatus === "approved").length} meta={`of ${data.participants.length}`} icon="flag" accent="magenta" />
            <StatCard label="Self reviews" value={data.participants.filter((p) => p.selfStatus === "submitted").length} meta="submitted" icon="clipboard" accent="cyan" />
            <StatCard label="Manager reviews" value={data.participants.filter((p) => p.managerStatus === "submitted").length} meta="submitted" icon="clipboardTick" accent="yellow" />
            <StatCard label="Final ratings" value={data.participants.filter((p) => p.finalRating !== null).length} meta={cycle.calibrationLocked ? "Calibration locked" : "Calibration open"} icon="award" />
          </div>
          <Card labelledBy="ap-progress">
            <CardHeader id="ap-progress" title="Progress by department" />
            <CardBody className="flush">
              <DataTable<PerfDepartmentProgress>
                caption="Completion by department"
                rows={data.progress}
                rowKey={(r) => r.department}
                mobileRow={(r) => ({ title: r.department, meta: `Goals ${r.goalsApproved}/${r.participants} · Self ${r.selfSubmitted} · Manager ${r.managerSubmitted} · Final ${r.finalised}` })}
                columns={[
                  { key: "d", header: "Department", rowHeader: true, cell: (r) => r.department },
                  { key: "g", header: "Goals approved", cell: (r) => <ProgressCell value={r.goalsApproved} total={r.participants} label={`${r.department} goals approved`} /> },
                  { key: "s", header: "Self review", cell: (r) => <ProgressCell value={r.selfSubmitted} total={r.participants} label={`${r.department} self reviews`} /> },
                  { key: "m", header: "Manager review", cell: (r) => <ProgressCell value={r.managerSubmitted} total={r.participants} label={`${r.department} manager reviews`} /> },
                  { key: "f", header: "Final", cell: (r) => <ProgressCell value={r.finalised} total={r.participants} label={`${r.department} final ratings`} /> },
                ]}
              />
            </CardBody>
          </Card>

          <Card labelledBy="ap-dist">
            <CardHeader
              id="ap-dist"
              title="Rating distribution"
              description={`${counted} rated (final rating, else manager rating) against the guideline.`}
              action={calibrating ? <CalibrationLockButton cycleId={cycle.id} locked={cycle.calibrationLocked} /> : undefined}
            />
            <CardBody>
              <ul className="perf-dist" aria-label="Distribution against guideline">
                {[...data.distribution].reverse().map((d) => (
                  <li key={d.rating} className="perf-dist-row">
                    <span className="perf-dist-label">
                      {d.rating} · {d.label}
                    </span>
                    <span className="perf-dist-bars" aria-hidden="true">
                      <span className="perf-bar perf-bar--actual" style={{ width: `${d.percent}%` }} />
                      <span className="perf-bar perf-bar--guide" style={{ width: `${d.guideline}%` }} />
                    </span>
                    <span className="perf-dist-value num small">
                      {d.percent}% ({d.count}) · guide {d.guideline}%
                      {Math.abs(d.percent - d.guideline) >= 10 && counted > 0 ? <Badge tone="warning">{d.percent > d.guideline ? "Over" : "Under"}</Badge> : null}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="legend small">
                <span className="perf-key perf-key--actual" aria-hidden="true" /> Actual <span className="perf-key perf-key--guide" aria-hidden="true" /> Guideline
              </p>
              {calibrating && (
                <p className="muted small">
                  {cycle.calibrationLocked ? "Locked — reopen to change a final rating. Release is enabled." : "Set final ratings with a reason where needed, then lock. Locking carries remaining manager ratings as final."}
                </p>
              )}
            </CardBody>
          </Card>

          <Card labelledBy="ap-people">
            <CardHeader id="ap-people" title="Participants" description="Ratings shown here are visible to HR only until release." />
            <CardBody>
              <nav className="chip-row" aria-label="Filter by department">
                <Link className="chip" href={deptHref(null)} aria-current={!dept ? "page" : undefined}>
                  All
                </Link>
                {departments.map((d) => (
                  <Link key={d} className="chip" href={deptHref(d)} aria-current={dept === d ? "page" : undefined}>
                    {d}
                  </Link>
                ))}
              </nav>
            </CardBody>
            <CardBody className="flush">
              <DataTable<PerfParticipant>
                caption={`Participants in ${cycle.name}`}
                rows={rows}
                rowKey={(r) => r.reviewId}
                empty={<EmptyState compact icon="team" title="No participants" description="Nobody matches this filter." />}
                mobileRow={(r) => ({
                  title: r.person.name,
                  meta: (
                    <>
                      {r.department} · Mgr {r.managerRating ?? "—"} · Final {r.finalRating ?? "—"}
                    </>
                  ),
                  trailing: (
                    <>
                      {calibrating && !cycle.calibrationLocked && r.managerStatus === "submitted" && <CalibrateSheet reviewId={r.reviewId} version={r.version} name={r.person.name} managerRating={r.managerRating} finalRating={r.finalRating} scale={scale} />}
                      {canReassign && r.managerStatus !== "submitted" && <ReassignSheet reviewId={r.reviewId} name={r.person.name} current={r.reviewer} reviewers={data.reviewers} />}
                    </>
                  ),
                })}
                columns={[
                  { key: "p", header: "Employee", rowHeader: true, cell: (r) => <PersonCell person={r.person} meta={r.department} /> },
                  { key: "rv", header: "Reviewer", hideOnMobile: true, cell: (r) => r.reviewer?.name ?? "—" },
                  { key: "g", header: "Goals", cell: (r) => (r.sheetStatus ? <StatusBadge status={perfSheetStatusLabels[r.sheetStatus]} /> : "—") },
                  { key: "s", header: "Self", cell: (r) => <StatusBadge status={perfPartStatusLabels[r.selfStatus]} /> },
                  { key: "m", header: "Manager", cell: (r) => <StatusBadge status={perfPartStatusLabels[r.managerStatus]} /> },
                  { key: "sc", header: "Score", align: "end", cell: (r) => <span className="num">{r.managerScore ?? "—"}</span> },
                  { key: "mr", header: "Manager rating", cell: (r) => labelOf(r.managerRating) },
                  {
                    key: "rec",
                    header: "Recommendation",
                    hideOnMobile: true,
                    cell: (r) => (r.promotion ? <span className="small">{perfPromotionLabels[r.promotion]}{r.incrementPercent ? ` · ${r.incrementPercent}%` : ""}</span> : "—"),
                  },
                  { key: "f", header: "Final", cell: (r) => (r.finalRating ? <span title={r.finalReason ?? undefined}>{labelOf(r.finalRating)}{r.finalReason ? <span className="perf-readout-comment">{r.finalReason}</span> : null}</span> : "—") },
                  {
                    key: "a",
                    header: "Actions",
                    align: "end",
                    cell: (r) => (
                      <span className="row-actions">
                        {calibrating && !cycle.calibrationLocked && r.managerStatus === "submitted" && <CalibrateSheet reviewId={r.reviewId} version={r.version} name={r.person.name} managerRating={r.managerRating} finalRating={r.finalRating} scale={scale} />}
                        {canReassign && r.managerStatus !== "submitted" && <ReassignSheet reviewId={r.reviewId} name={r.person.name} current={r.reviewer} reviewers={data.reviewers} />}
                      </span>
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>
        </>
      )}

      <div className="grid grid-2">
        <Card labelledBy="ap-scale">
          <CardHeader id="ap-scale" title="Rating scale" description="Guideline distribution in brackets." />
          <CardBody>
            <ul className="perf-comp-list">
              {cycle.scale.map((s, i) => (
                <li key={s.rating}>
                  <p className="perf-rate-title">
                    {s.rating} · {s.label} <span className="muted small num">({cycle.guideline[i]}%)</span>
                  </p>
                  <p className="muted small">{s.description}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card labelledBy="ap-comp">
          <CardHeader id="ap-comp" title="Competencies" description="Organisation-wide; rated in every review." action={<CompetencySheet />} />
          <CardBody>
            <ul className="perf-comp-list">
              {data.competencies.map((c) => (
                <li key={c.id}>
                  <div className="perf-approval-head">
                    <p className="perf-rate-title">{c.name}</p>
                    <CompetencySheet competency={c} />
                  </div>
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
      </div>

      <Card labelledBy="ap-audit">
        <CardHeader id="ap-audit" title="Audit trail" description="Phase moves, calibration changes, reviewer changes and acknowledgements." />
        <CardBody>
          {data.audit.length === 0 ? (
            <EmptyState compact icon="clipboard" title="No events yet" description="Changes to this cycle are logged here." />
          ) : (
            <Timeline items={data.audit.map((a) => ({ id: a.id, title: a.event, meta: `${a.actor} · ${formatDateTime(a.at)}` }))} />
          )}
        </CardBody>
      </Card>
      <MockNote>Mock backend: calibration and release act on synthetic data. Increment recommendations are exported to no payroll system; salary changes need a separate compensation revision with maker/checker approval.</MockNote>
    </div>
  );
}
