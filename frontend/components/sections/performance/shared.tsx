import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { DateText, Meter, StatusBadge, StepIndicator, TabsNav, Timeline } from "@/components/ui/display";
import { formatDateRange, formatDateTime } from "@/lib/utils/format";
import {
  perfCycleKindLabels,
  perfHealthLabels,
  perfPhaseLabels,
  perfPhaseOrder,
  type PerfCompetency,
  type PerfCycle,
  type PerfGoal,
  type PerfSelfPart,
} from "@/types/performance";

const stepPhases = perfPhaseOrder.filter((p) => p !== "draft");

export function CycleTabs({ cycles, active, base, extra = "" }: { cycles: PerfCycle[]; active: string | undefined; base: string; extra?: string }) {
  if (cycles.length < 2) return null;
  return <TabsNav label="Review cycles" tabs={cycles.map((c) => ({ href: `${base}?cycle=${c.id}${extra}`, label: c.name, active: c.id === active }))} />;
}

export function PhaseBadge({ cycle }: { cycle: PerfCycle }) {
  const tone = cycle.phase === "released" ? "success" : cycle.phase === "draft" ? "neutral" : cycle.phase === "calibration" ? "warning" : "info";
  return <Badge tone={tone}>{perfPhaseLabels[cycle.phase]}</Badge>;
}

export function PhaseSteps({ cycle }: { cycle: PerfCycle }) {
  const current = cycle.phase === "draft" ? -1 : stepPhases.indexOf(cycle.phase);
  return <StepIndicator label={`${cycle.name} phases`} steps={stepPhases.map((p) => perfPhaseLabels[p])} current={cycle.phase === "released" ? stepPhases.length : current} />;
}

export function currentWindow(cycle: PerfCycle): string {
  if (cycle.phase === "draft") return "Not launched";
  if (cycle.phase === "released") return cycle.releasedAt ? `Released ${formatDateTime(cycle.releasedAt)}` : "Released";
  const range = cycle.phaseDates[cycle.phase];
  return `${perfPhaseLabels[cycle.phase]}: ${formatDateRange(range.start, range.end)}`;
}

export function CycleMeta({ cycle }: { cycle: PerfCycle }) {
  return (
    <p className="muted small">
      {perfCycleKindLabels[cycle.kind]} · {formatDateRange(cycle.periodStart, cycle.periodEnd)} · goals {cycle.goalWeight}% / competencies {cycle.competencyWeight}% · {currentWindow(cycle)}
    </p>
  );
}

export function GoalItem({ goal, actions, children }: { goal: PerfGoal; actions?: ReactNode; children?: ReactNode }) {
  const health = perfHealthLabels[goal.health];
  return (
    <li className="perf-goal">
      <div className="perf-goal-head">
        <div className="perf-goal-text">
          <h3 className="perf-goal-title">{goal.title}</h3>
          <p className="muted small">
            Target: {goal.target}
            {goal.objective ? ` · Objective: ${goal.objective.title}` : ""} · Due <DateText value={goal.dueDate} />
          </p>
          {goal.description && <p className="small">{goal.description}</p>}
        </div>
        <span className="perf-weight num">{goal.weight}%</span>
      </div>
      <div className="perf-goal-progress">
        <Meter value={goal.progress} max={100} label={`${goal.title} progress`} tone={goal.health === "on_track" ? "primary" : "warning"} />
        <span className="num small">{goal.progress}%</span>
        <StatusBadge status={health} />
      </div>
      {children}
      {actions && <div className="row-actions perf-goal-actions">{actions}</div>}
      {goal.checkIns.length > 0 && (
        <details className="perf-details">
          <summary>Check-in history ({goal.checkIns.length})</summary>
          <Timeline
            items={goal.checkIns.map((c) => ({
              id: c.id,
              title: `${c.progress}% · ${perfHealthLabels[c.health].label}`,
              detail: c.comment,
              meta: `${c.author} · ${formatDateTime(c.at)}`,
            }))}
          />
        </details>
      )}
    </li>
  );
}

export function ReviewReadout({ part, goals, competencies, heading }: { part: PerfSelfPart; goals: PerfGoal[]; competencies: PerfCompetency[]; heading: string }) {
  return (
    <div className="stack">
      <h3 className="subheading">{heading}</h3>
      <table className="data-table perf-readout">
        <caption className="sr-only">{heading} ratings</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className="cell-end">Rating</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => {
            const entry = part.goals.find((e) => e.targetId === g.id);
            return (
              <tr key={g.id}>
                <th scope="row">
                  {g.title} <span className="muted small num">({g.weight}%)</span>
                  {entry?.comment && <span className="perf-readout-comment">{entry.comment}</span>}
                </th>
                <td className="cell-end num">{entry?.rating ?? "—"}</td>
              </tr>
            );
          })}
          {competencies.map((c) => {
            const entry = part.competencies.find((e) => e.targetId === c.id);
            return (
              <tr key={c.id}>
                <th scope="row">
                  {c.name}
                  {entry?.comment && <span className="perf-readout-comment">{entry.comment}</span>}
                </th>
                <td className="cell-end num">{entry?.rating ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {part.strengths && (
        <p>
          <strong>Strengths:</strong> {part.strengths}
        </p>
      )}
      {part.improvements && (
        <p>
          <strong>Areas to improve:</strong> {part.improvements}
        </p>
      )}
      {part.score && <p className="muted small">Weighted score {part.score}</p>}
    </div>
  );
}

export function MockNote({ children }: { children: ReactNode }) {
  return <p className="muted small perf-mock-note">{children}</p>;
}
