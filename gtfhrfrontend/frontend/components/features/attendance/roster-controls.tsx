"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton, FormSheet, InlineForm } from "@/components/features/admin/form-sheet";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, describedBy } from "@/components/ui/field";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { applyRosterPatternAction, cancelSwapAction, requestSwapAction, saveRosterAction, saveWeeklyOffAction } from "@/lib/actions/attendance";
import { formatDate } from "@/lib/utils/format";
import type { MyRoster, RosterPlanner, WeeklyOffRule } from "@/types/attendance";

const err = (id: string, error: string | undefined, hint = false) => ({ "aria-invalid": Boolean(error), "aria-describedby": describedBy(id, error, hint) });
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DepartmentPicker({ departments, selected, weekStart }: { departments: string[]; selected: string; weekStart: string }) {
  const router = useRouter();
  return (
    <>
      <label htmlFor="roster-dept" className="sr-only">
        Department
      </label>
      <SelectInput id="roster-dept" value={selected} onChange={(event) => router.push(`/attendance/roster?view=plan&department=${encodeURIComponent(event.target.value)}&week=${weekStart}`)} options={departments.map((name) => ({ value: name, label: name }))} />
    </>
  );
}

/** Employees × days grid. Unpublished drafts never reach employees or attendance. */
export function RosterGrid({ planner, today }: { planner: RosterPlanner; today: string }) {
  const { formRef, draft, submit, pending, formError } = useCommand(saveRosterAction, { draftKey: `roster.grid:${planner.department}:${planner.weekStart}` });
  const options = [
    { value: "", label: `Dept. (${planner.departmentShift})` },
    ...planner.shifts.map((shift) => ({ value: shift.id, label: `${shift.name} ${shift.start}–${shift.end}` })),
    { value: "off", label: "Week off" },
  ];
  return (
    <form ref={formRef} onSubmit={submit} className="stack" noValidate>
      <DraftNotice draft={draft} />
      <input type="hidden" name="department" value={planner.department} />
      <input type="hidden" name="weekStart" value={planner.weekStart} />
      <input type="hidden" name="version" value={planner.version} />
      <div className="table-wrap" role="region" aria-label={`${planner.department} roster grid`} tabIndex={0}>
        <table className="data-table time-roster-grid">
          <caption className="sr-only">
            {planner.department} roster for the week of {formatDate(planner.weekStart, "medium")}
          </caption>
          <thead>
            <tr>
              <th scope="col">Employee</th>
              {planner.dates.map((date, index) => (
                <th key={date} scope="col" data-past={date < today || undefined}>
                  <span className="time-day-head">
                    <span>{DAY_SHORT[index]}</span>
                    <span className="num">{Number(date.slice(8))}</span>
                  </span>
                  {planner.holidays[index] && <span className="time-holiday">{planner.holidays[index]}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {planner.rows.map((row) => (
              <tr key={row.person.id}>
                <th scope="row" className="time-roster-person">
                  {row.person.name}
                  <span className="muted small">{row.person.designation}</span>
                </th>
                {planner.dates.map((date, index) => (
                  <td key={date}>
                    <label className="sr-only" htmlFor={`cell-${row.person.id}-${index}`}>
                      {row.person.name}, {formatDate(date, "weekday")}
                    </label>
                    <select id={`cell-${row.person.id}-${index}`} name={`cell:${row.person.id}:${index}`} className="input select time-cell" defaultValue={row.cells[index] ?? ""} disabled={date < today} data-value={row.cells[index] ?? "default"}>
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {row.leave[index] && <span className="time-leave small">{row.leave[index]}</span>}
                    {planner.status !== "none" && planner.status !== "draft" && <span className="sr-only">Published: {row.effective[index]}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <Button type="submit" variant="secondary" name="intent" value="save" pending={pending}>
          Save draft
        </Button>
        <Button type="submit" name="intent" value="publish" pending={pending}>
          {planner.status === "changes" ? "Publish changes" : "Publish roster"}
        </Button>
      </div>
    </form>
  );
}

export function RosterPatternForm({ planner }: { planner: RosterPlanner }) {
  const [pattern, setPattern] = useState("rotate");
  const shiftOptions = planner.shifts.map((shift) => ({ value: shift.id, label: shift.name }));
  return (
    <InlineForm draftKey={`roster.pattern:${planner.department}:${planner.weekStart}`} action={applyRosterPatternAction} submitLabel="Apply to draft">
      {(fieldError) => (
        <>
          <input type="hidden" name="department" value={planner.department} />
          <input type="hidden" name="weekStart" value={planner.weekStart} />
          <FormField id="pattern" label="Pattern" error={fieldError("pattern")}>
            <SelectInput
              id="pattern"
              name="pattern"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              options={[
                { value: "rotate", label: "Rotate two shifts weekly (alternating people)" },
                { value: "copy_previous", label: "Copy previous week" },
                { value: "all_default", label: "Reset to department shift" },
              ]}
            />
          </FormField>
          {pattern === "rotate" && (
            <div className="form-row">
              <FormField id="pattern-first" label="Shift A" error={fieldError("first")}>
                <SelectInput id="pattern-first" name="first" defaultValue={planner.shifts[0]?.id} options={shiftOptions} {...err("pattern-first", fieldError("first"))} />
              </FormField>
              <FormField id="pattern-second" label="Shift B" error={fieldError("second")}>
                <SelectInput id="pattern-second" name="second" defaultValue={planner.shifts[1]?.id ?? planner.shifts[0]?.id} options={shiftOptions} {...err("pattern-second", fieldError("second"))} />
              </FormField>
            </div>
          )}
          <p className="small muted">Changes the draft only (past days stay locked). Publish to make it visible.</p>
        </>
      )}
    </InlineForm>
  );
}

export function WeeklyOffForm({ rule }: { rule: WeeklyOffRule }) {
  const [saturday, setSaturday] = useState(rule.offWeekdays.includes(6));
  return (
    <InlineForm draftKey={`roster.weekly-off:${rule.department}`} action={saveWeeklyOffAction} submitLabel="Save weekly offs">
      {(fieldError) => (
        <>
          <input type="hidden" name="department" value={rule.department} />
          <fieldset className="checks">
            <legend>Weekly off days for {rule.department}</legend>
            <div className="chip-row">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <label key={day} className="check-row">
                  <input type="checkbox" name="offWeekdays" value={day} defaultChecked={rule.offWeekdays.includes(day)} onChange={day === 6 ? (event) => setSaturday(event.target.checked) : undefined} />
                  <span>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]}</span>
                </label>
              ))}
            </div>
            {fieldError("offWeekdays") && <p className="small text-danger">{fieldError("offWeekdays")}</p>}
          </fieldset>
          <label className="check-row">
            <input type="checkbox" name="alternateSaturdays" defaultChecked={rule.alternateSaturdays} disabled={saturday} />
            <span>2nd and 4th Saturdays off (when Saturday is a working day)</span>
          </label>
        </>
      )}
    </InlineForm>
  );
}

export function SwapRequestSheet({ options }: { options: MyRoster["swapOptions"] }) {
  const [date, setDate] = useState(options[0]?.date ?? "");
  const option = options.find((item) => item.date === date);
  return (
    <FormSheet draftKey={"roster.swap"} action={requestSwapAction} title="Request a shift swap" description="Swap your published shift with a colleague for one day. Your manager approves; the roster updates for both of you." trigger="Request swap" triggerVariant="secondary" icon="swap" submitLabel="Send request" pendingLabel="Sending…">
      {(fieldError) => (
        <>
          <FormField id="sw-date" label="Day" required error={fieldError("date")} hint={option ? `You're on ${option.mine}` : undefined}>
            <SelectInput id="sw-date" name="date" value={date} onChange={(event) => setDate(event.target.value)} options={options.map((item) => ({ value: item.date, label: `${formatDate(item.date, "weekday")} · ${item.mine}` }))} {...err("sw-date", fieldError("date"), true)} />
          </FormField>
          <FormField id="sw-colleague" label="Swap with" required error={fieldError("colleagueId")}>
            <SelectInput id="sw-colleague" name="colleagueId" key={date} options={(option?.colleagues ?? []).map((person) => ({ value: person.id, label: `${person.name} · ${person.shift}` }))} {...err("sw-colleague", fieldError("colleagueId"))} />
          </FormField>
          <FormField id="sw-reason" label="Reason" required error={fieldError("reason")}>
            <TextArea id="sw-reason" name="reason" rows={2} maxLength={300} {...err("sw-reason", fieldError("reason"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function CancelSwapButton({ id }: { id: string }) {
  return <ConfirmButton label="Withdraw" confirmLabel="Confirm withdraw" run={() => cancelSwapAction(id)} />;
}
