"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { SelectInput } from "@/components/ui/field";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { saveTimesheetAction } from "@/lib/actions/timesheets";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateRange } from "@/lib/utils/format";
import { MAX_DAY_QUARTERS, hoursLabel, parseQuarterHours, quarterHours, type AssignableProject, type TimesheetWeek } from "@/types/timesheets";

interface GridRow {
  key: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  task: string;
  note: string;
  hours: string[];
}

const trimHours = (quarters: number) => (quarters === 0 ? "" : quarterHours(quarters).replace(/\.?0+$/, ""));
const dayName = (date: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

/**
 * Weekly grid controller. Local state only; the draft/submit command posts the
 * rows as JSON and the server revalidates every rule (limits, assignment, lock).
 */
export function TimesheetGrid({ week, assignable }: { week: TimesheetWeek; assignable: AssignableProject[] }) {
  const initial = useMemo<GridRow[]>(
    () =>
      week.rows.map((row, index) => ({
        key: `r${index}`,
        projectId: row.projectId,
        projectCode: row.projectCode,
        projectName: row.projectName,
        task: row.task,
        note: row.note,
        hours: row.quarters.map(trimHours),
      })),
    [week.rows],
  );
  const [rows, setRows] = useState<GridRow[]>(initial);
  const [nextKey, setNextKey] = useState(initial.length);
  const [projectId, setProjectId] = useState(assignable[0]?.id ?? "");
  const [task, setTask] = useState("");
  const { formRef, draft, submit, pending, state, fieldError } = useCommand(saveTimesheetAction, { draftKey: `timesheet.week:${week.weekStart}` });
  const editable = week.editable;

  const parsed = rows.map((row) => row.hours.map((value) => parseQuarterHours(value)));
  const dayTotals = week.days.map((_, day) => parsed.reduce((sum, row) => sum + (row[day] ?? 0), 0));
  const rowTotals = parsed.map((row) => row.reduce<number>((sum, value) => sum + (value ?? 0), 0));
  const weekTotal = dayTotals.reduce((sum, value) => sum + value, 0);
  const dirty = JSON.stringify(rows.map(({ key: _key, ...rest }) => rest)) !== JSON.stringify(initial.map(({ key: _key, ...rest }) => rest));

  const selectedProject = assignable.find((project) => project.id === projectId);
  const freeTasks = (selectedProject?.tasks ?? []).filter((name) => !rows.some((row) => row.projectId === projectId && row.task === name));
  const chosenTask = freeTasks.includes(task) ? task : (freeTasks[0] ?? "");

  const payload = JSON.stringify(rows.map((row) => ({ projectId: row.projectId, task: row.task, note: row.note, hours: row.hours })));
  const errors = state.status === "error" ? Object.entries(state.fieldErrors ?? {}) : [];
  const summary = [...new Set(errors.map(([, message]) => message))].slice(0, 6);

  const update = (index: number, change: Partial<GridRow>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const setHour = (index: number, day: number, value: string) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, hours: row.hours.map((item, d) => (d === day ? value : item)) } : row)));

  const addRow = () => {
    if (!selectedProject || !chosenTask) return;
    setRows((current) => [
      ...current,
      { key: `n${nextKey}`, projectId: selectedProject.id, projectCode: selectedProject.code, projectName: selectedProject.name, task: chosenTask, note: "", hours: ["", "", "", "", "", "", ""] },
    ]);
    setNextKey((value) => value + 1);
  };

  const range = formatDateRange(week.weekStart, week.weekEnd);

  return (
    <form ref={formRef} onSubmit={submit} className="stack" noValidate>
      <DraftNotice draft={draft} />
      <input type="hidden" name="weekStart" value={week.weekStart} />
      <input type="hidden" name="version" value={week.version} />
      <input type="hidden" name="rows" value={payload} />

      <div className="ts-grid-wrap" role="region" aria-label={`Timesheet grid, ${range}`} tabIndex={0}>
        <table className="ts-grid">
          <caption className="sr-only">Hours by project and task for {range}</caption>
          <thead>
            <tr>
              <th scope="col" className="ts-grid-task">
                Project · task
              </th>
              {week.days.map((day, index) => (
                <th key={day.date} scope="col" className={cn("ts-grid-day", (day.weekend || day.holiday || day.leaveFull) && "ts-grid-day--off", fieldError(`day.${index}`) && "ts-grid-day--error")}>
                  <span className="ts-day-name">{dayName(day.date)}</span>
                  <span className="ts-day-date">{formatDate(day.date, "short")}</span>
                  {day.holiday && (
                    <span className="ts-day-badge">
                      <Badge tone="info">Holiday: {day.holiday}</Badge>
                    </span>
                  )}
                  {day.leave && (
                    <span className="ts-day-badge">
                      <Badge tone={day.leavePending ? "neutral" : "warning"}>Leave: {day.leave}</Badge>
                    </span>
                  )}
                </th>
              ))}
              <th scope="col" className="ts-grid-total">
                Total
              </th>
              {editable && (
                <th scope="col" className="ts-grid-action">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={editable ? 10 : 9} className="ts-grid-empty muted">
                  {editable ? "No rows yet — add a project and task below, or copy last week." : "No hours were logged this week."}
                </td>
              </tr>
            )}
            {rows.map((row, index) => {
              const rowLabel = `${row.projectName} · ${row.task}`;
              const rowError = fieldError(`rows.${index}.projectId`) ?? fieldError(`rows.${index}.task`);
              const noteError = fieldError(`rows.${index}.note`);
              return (
                <tr key={row.key}>
                  <th scope="row" className="ts-grid-task">
                    <span className="ts-row-code">{row.projectCode}</span>
                    <span className="ts-row-name">{row.projectName}</span>
                    <span className="ts-row-meta">{row.task}</span>
                    {rowError && (
                      <span className="field-error" id={`ts-row-${index}-error`}>
                        {rowError}
                      </span>
                    )}
                    {editable ? (
                      <input
                        className="input ts-note"
                        value={row.note}
                        maxLength={200}
                        placeholder="Note (optional)"
                        aria-label={`Note for ${rowLabel}`}
                        aria-invalid={Boolean(noteError) || undefined}
                        onChange={(event) => update(index, { note: event.target.value })}
                      />
                    ) : (
                      row.note && <span className="ts-row-meta">{row.note}</span>
                    )}
                  </th>
                  {week.days.map((day, dayIndex) => {
                    const cellError = fieldError(`rows.${index}.hours.${dayIndex}`);
                    const invalid = parsed[index]?.[dayIndex] === null || Boolean(cellError);
                    const label = `Hours for ${rowLabel} on ${formatDate(day.date, "weekday")}`;
                    return (
                      <td key={day.date} className={cn("ts-grid-cell", (day.weekend || day.holiday || day.leaveFull) && "ts-grid-day--off")}>
                        {editable ? (
                          <input
                            className="input ts-hours num"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={16}
                            step={0.25}
                            value={row.hours[dayIndex] ?? ""}
                            aria-label={label}
                            aria-invalid={invalid || undefined}
                            title={cellError ?? (invalid ? "Use steps of 0.25 up to 16" : undefined)}
                            onChange={(event) => setHour(index, dayIndex, event.target.value)}
                          />
                        ) : (
                          <span className="num" aria-label={label}>
                            {row.hours[dayIndex] || "–"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="ts-grid-total num">{hoursLabel(rowTotals[index] ?? 0)}</td>
                  {editable && (
                    <td className="ts-grid-action">
                      <Button size="sm" variant="ghost" aria-label={`Remove ${rowLabel}`} onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                        <AppIcon name="trash" size={16} />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="ts-grid-task">
                Daily total
              </th>
              {dayTotals.map((total, day) => (
                <td key={week.days[day]?.date ?? day} className={cn("ts-grid-cell num", total > MAX_DAY_QUARTERS && "text-danger")}>
                  {hoursLabel(total)}
                  {total > MAX_DAY_QUARTERS && <span className="sr-only"> (over the 16 hour limit)</span>}
                </td>
              ))}
              <td className="ts-grid-total num">
                <strong>{hoursLabel(weekTotal)}</strong>
              </td>
              {editable && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <div className="ts-add-row">
          <div className="toolbar-field">
            <label htmlFor="ts-add-project">Project</label>
            <SelectInput
              id="ts-add-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              options={assignable.map((project) => ({ value: project.id, label: `${project.code} · ${project.name}` }))}
              disabled={assignable.length === 0}
            />
          </div>
          <div className="toolbar-field">
            <label htmlFor="ts-add-task">Task</label>
            <SelectInput id="ts-add-task" value={chosenTask} onChange={(event) => setTask(event.target.value)} options={freeTasks.map((name) => ({ value: name, label: name }))} disabled={freeTasks.length === 0} />
          </div>
          <Button variant="secondary" onClick={addRow} disabled={!selectedProject || !chosenTask || rows.length >= 25}>
            <AppIcon name="add" size={20} />
            Add row
          </Button>
          {assignable.length === 0 && <p className="muted small">You aren&apos;t assigned to an active project this week. Ask your manager or HR to add you.</p>}
        </div>
      )}

      {state.status === "error" && (
        <Alert tone="danger" live title={state.message}>
          {summary.length > 0 && (
            <ul className="ts-error-list">
              {summary.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {editable && (
        <div className="ts-grid-actions">
          <span className="muted small" aria-live="polite">
            {dirty ? "Unsaved changes" : week.status === "not_started" ? "Nothing saved yet" : "All changes saved"}
          </span>
          <Button type="submit" variant="secondary" name="intent" value="save" pending={pending}>
            Save draft
          </Button>
          <Button type="submit" name="intent" value="submit" pending={pending} disabled={!week.canSubmit} title={week.canSubmit ? undefined : "You can submit once the week has started"}>
            <AppIcon name="send" size={20} />
            {week.status === "rejected" ? "Resubmit" : "Submit for approval"}
          </Button>
        </div>
      )}
    </form>
  );
}
