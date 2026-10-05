"use client";

import { ConfirmButton, FormSheet } from "@/components/features/admin/form-sheet";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { advancePhaseAction, calibrateAction, lockCalibrationAction, reassignReviewerAction, saveCompetencyAction, saveCycleAction } from "@/lib/actions/performance";
import { perfCycleKindLabels, perfPhaseLabels, perfWindowPhases, type PerfCompetency, type PerfCycle, type PerfPhase } from "@/types/performance";
import type { PersonRef } from "@/types/common";

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});

const defaultScale = [
  ["Needs improvement", "Missed most goals; needs a structured improvement plan."],
  ["Partially meets", "Met some goals; clear gaps in delivery or behaviours."],
  ["Meets expectations", "Delivered goals as agreed with solid, reliable behaviours."],
  ["Exceeds expectations", "Delivered beyond the agreed targets and lifted the team."],
  ["Outstanding", "Exceptional, role-defining impact well beyond the role."],
] as const;

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function CycleSheet({ cycle, departments, today }: { cycle?: PerfCycle; departments: string[]; today: string }) {
  const launched = Boolean(cycle && cycle.phase !== "draft");
  const p = cycle ? `cy-${cycle.id}` : "cy-new";
  const start = cycle?.periodStart ?? addDays(today, 2);
  const end = cycle?.periodEnd ?? addDays(start, 182);
  const phaseDates = cycle?.phaseDates ?? {
    goal_setting: { start, end: addDays(start, 21) },
    self_review: { start: addDays(end, -10), end: addDays(end, 5) },
    manager_review: { start: addDays(end, 6), end: addDays(end, 20) },
    calibration: { start: addDays(end, 21), end: addDays(end, 30) },
  };
  return (
    <FormSheet draftKey={cycle ? `perf-cycle.edit:${cycle.id}` : "perf-cycle.new"}
      action={saveCycleAction}
      title={cycle ? `Edit ${cycle.name}` : "New review cycle"}
      description={launched ? "Launched cycles keep their period, eligibility, departments and weightage; names, labels, guideline and dates can change." : "Saved as a draft. Nothing is visible to employees until you launch it."}
      trigger={cycle ? "Edit cycle" : "New cycle"}
      triggerVariant={cycle ? "secondary" : "primary"}
      {...(cycle ? {} : { icon: "add" as const })}
      submitLabel={cycle ? "Save cycle" : "Create cycle"}
    >
      {(fieldError) => (
        <>
          {cycle && <input type="hidden" name="id" value={cycle.id} />}
          {cycle && <input type="hidden" name="version" value={cycle.version} />}
          <FormField id={`${p}-name`} label="Cycle name" required hint="e.g. H2 FY26-27" error={fieldError("name")}>
            <TextInput id={`${p}-name`} name="name" maxLength={80} defaultValue={cycle?.name} {...err(`${p}-name`, fieldError("name"), true)} />
          </FormField>
          {launched && cycle ? (
            <>
              <input type="hidden" name="kind" value={cycle.kind} />
              <input type="hidden" name="periodStart" value={cycle.periodStart} />
              <input type="hidden" name="periodEnd" value={cycle.periodEnd} />
              <input type="hidden" name="eligibilityCutoff" value={cycle.eligibilityCutoff} />
              <input type="hidden" name="goalWeight" value={cycle.goalWeight} />
              {cycle.departments.map((d) => (
                <input key={d} type="hidden" name="departments" value={d} />
              ))}
              <p className="muted small">
                Locked: {perfCycleKindLabels[cycle.kind]} · {cycle.periodStart} to {cycle.periodEnd} · joined by {cycle.eligibilityCutoff} · goals {cycle.goalWeight}% / competencies {cycle.competencyWeight}%
              </p>
            </>
          ) : (
            <>
              <div className="form-row">
                <FormField id={`${p}-kind`} label="Type" required>
                  <SelectInput id={`${p}-kind`} name="kind" defaultValue={cycle?.kind ?? "half_yearly"} options={Object.entries(perfCycleKindLabels).map(([value, label]) => ({ value, label }))} />
                </FormField>
                <FormField id={`${p}-gw`} label="Goals weightage (%)" required hint="Competencies get the rest." error={fieldError("goalWeight")}>
                  <TextInput id={`${p}-gw`} name="goalWeight" type="number" min={0} max={100} step={5} defaultValue={cycle?.goalWeight ?? 70} {...err(`${p}-gw`, fieldError("goalWeight"), true)} />
                </FormField>
              </div>
              <div className="form-row">
                <FormField id={`${p}-ps`} label="Review period from" required error={fieldError("periodStart")}>
                  <TextInput id={`${p}-ps`} name="periodStart" type="date" defaultValue={start} {...err(`${p}-ps`, fieldError("periodStart"))} />
                </FormField>
                <FormField id={`${p}-pe`} label="Review period to" required error={fieldError("periodEnd")}>
                  <TextInput id={`${p}-pe`} name="periodEnd" type="date" defaultValue={end} {...err(`${p}-pe`, fieldError("periodEnd"))} />
                </FormField>
              </div>
              <FormField id={`${p}-cut`} label="Eligible if joined on or before" required error={fieldError("eligibilityCutoff")}>
                <TextInput id={`${p}-cut`} name="eligibilityCutoff" type="date" defaultValue={cycle?.eligibilityCutoff ?? addDays(start, 60)} {...err(`${p}-cut`, fieldError("eligibilityCutoff"))} />
              </FormField>
              <fieldset className="perf-fieldset">
                <legend>Departments (none selected = everyone)</legend>
                <div className="checks">
                  {departments.map((d) => (
                    <label key={d} className="check-row">
                      <input type="checkbox" name="departments" value={d} defaultChecked={cycle ? cycle.departments.includes(d) : d !== "Leadership"} />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
                {fieldError("departments") && <p className="field-error">{fieldError("departments")}</p>}
              </fieldset>
            </>
          )}
          <fieldset className="perf-fieldset">
            <legend>Phase dates</legend>
            {perfWindowPhases.map((phase) => (
              <div key={phase} className="form-row">
                <FormField id={`${p}-${phase}-s`} label={`${perfPhaseLabels[phase]} from`} required error={fieldError(`phaseDates.${phase}.start`)}>
                  <TextInput id={`${p}-${phase}-s`} name={`phaseDates.${phase}.start`} type="date" defaultValue={phaseDates[phase].start} {...err(`${p}-${phase}-s`, fieldError(`phaseDates.${phase}.start`))} />
                </FormField>
                <FormField id={`${p}-${phase}-e`} label={`${perfPhaseLabels[phase]} to`} required error={fieldError(`phaseDates.${phase}.end`)}>
                  <TextInput id={`${p}-${phase}-e`} name={`phaseDates.${phase}.end`} type="date" defaultValue={phaseDates[phase].end} {...err(`${p}-${phase}-e`, fieldError(`phaseDates.${phase}.end`))} />
                </FormField>
              </div>
            ))}
            <FormField id={`${p}-rel`} label="Release results on" required error={fieldError("releaseOn")}>
              <TextInput id={`${p}-rel`} name="releaseOn" type="date" defaultValue={cycle?.releaseOn ?? addDays(end, 35)} {...err(`${p}-rel`, fieldError("releaseOn"))} />
            </FormField>
          </fieldset>
          <fieldset className="perf-fieldset">
            <legend>Rating scale and guideline distribution</legend>
            {defaultScale.map(([label, description], i) => (
              <div key={label} className="perf-scale-row">
                <span className="perf-scale-num num" aria-hidden="true">{i + 1}</span>
                <FormField id={`${p}-sl-${i}`} label={`Rating ${i + 1} label`} required error={fieldError(`scale.${i}.label`)}>
                  <TextInput id={`${p}-sl-${i}`} name={`scale.${i}.label`} maxLength={40} defaultValue={cycle?.scale[i]?.label ?? label} {...err(`${p}-sl-${i}`, fieldError(`scale.${i}.label`))} />
                </FormField>
                <FormField id={`${p}-sd-${i}`} label={`Rating ${i + 1} description`} required error={fieldError(`scale.${i}.description`)}>
                  <TextInput id={`${p}-sd-${i}`} name={`scale.${i}.description`} maxLength={200} defaultValue={cycle?.scale[i]?.description ?? description} {...err(`${p}-sd-${i}`, fieldError(`scale.${i}.description`))} />
                </FormField>
                <FormField id={`${p}-g-${i}`} label="Guideline %" required error={fieldError(`guideline.${i}`)}>
                  <TextInput id={`${p}-g-${i}`} name={`guideline.${i}`} type="number" min={0} max={100} defaultValue={cycle?.guideline[i] ?? [10, 20, 40, 20, 10][i]} {...err(`${p}-g-${i}`, fieldError(`guideline.${i}`))} />
                </FormField>
              </div>
            ))}
          </fieldset>
        </>
      )}
    </FormSheet>
  );
}

export function AdvancePhaseButton({ cycleId, phase, next, blocked }: { cycleId: string; phase: PerfPhase; next: PerfPhase; blocked: string | null }) {
  const label = next === "goal_setting" ? "Launch cycle" : `Advance to ${perfPhaseLabels[next]}`;
  return <ConfirmButton label={label} confirmLabel={`Confirm: ${perfPhaseLabels[next]}`} run={() => advancePhaseAction(cycleId, phase)} {...(blocked ? { disabledReason: blocked } : {})} />;
}

export function CalibrationLockButton({ cycleId, locked }: { cycleId: string; locked: boolean }) {
  return <ConfirmButton label={locked ? "Reopen calibration" : "Lock calibration"} confirmLabel={locked ? "Confirm reopen" : "Confirm lock"} run={() => lockCalibrationAction(cycleId, !locked)} />;
}

export function CalibrateSheet({ reviewId, version, name, managerRating, finalRating, scale }: { reviewId: string; version: number; name: string; managerRating: number | null; finalRating: number | null; scale: { rating: number; label: string }[] }) {
  const p = `cal-${reviewId}`;
  return (
    <FormSheet draftKey={`perf.calibrate:${reviewId}`} action={calibrateAction} title={`Final rating · ${name}`} description={`Manager rating: ${managerRating ?? "—"}. Every change is audited with your reason.`} trigger="Set final rating" triggerVariant="secondary" triggerSize="sm" submitLabel="Save final rating">
      {(fieldError) => (
        <>
          <input type="hidden" name="reviewId" value={reviewId} />
          <input type="hidden" name="version" value={version} />
          <FormField id={`${p}-r`} label="Final rating" required error={fieldError("finalRating")}>
            <SelectInput id={`${p}-r`} name="finalRating" defaultValue={String(finalRating ?? managerRating ?? 3)} options={scale.map((s) => ({ value: String(s.rating), label: `${s.rating} · ${s.label}` }))} {...err(`${p}-r`, fieldError("finalRating"))} />
          </FormField>
          <FormField id={`${p}-reason`} label="Reason" required hint="e.g. normalised against peers with similar scope." error={fieldError("reason")}>
            <TextArea id={`${p}-reason`} name="reason" rows={3} maxLength={500} {...err(`${p}-reason`, fieldError("reason"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function ReassignSheet({ reviewId, name, current, reviewers }: { reviewId: string; name: string; current: PersonRef | null; reviewers: PersonRef[] }) {
  const p = `ra-${reviewId}`;
  return (
    <FormSheet draftKey={`perf.reassign:${reviewId}`} action={reassignReviewerAction} title={`Reviewer for ${name}`} description={`Currently ${current?.name ?? "unassigned"}. Any manager draft is discarded — drafts never move to another reviewer.`} trigger="Reassign" triggerVariant="ghost" triggerSize="sm" submitLabel="Reassign reviewer">
      {(fieldError) => (
        <>
          <input type="hidden" name="reviewId" value={reviewId} />
          <FormField id={`${p}-who`} label="New reviewer" required error={fieldError("reviewerId")}>
            <SelectInput id={`${p}-who`} name="reviewerId" placeholder="Choose a reviewer" defaultValue="" options={reviewers.filter((r) => r.id !== current?.id).map((r) => ({ value: r.id, label: `${r.name} · ${r.designation}` }))} {...err(`${p}-who`, fieldError("reviewerId"))} />
          </FormField>
          <FormField id={`${p}-why`} label="Reason" required error={fieldError("reason")}>
            <TextArea id={`${p}-why`} name="reason" rows={2} maxLength={300} {...err(`${p}-why`, fieldError("reason"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function CompetencySheet({ competency }: { competency?: PerfCompetency }) {
  const p = competency ? `co-${competency.id}` : "co-new";
  return (
    <FormSheet draftKey={competency ? `competency.edit:${competency.id}` : "competency.new"} action={saveCompetencyAction} title={competency ? `Edit ${competency.name}` : "Add competency"} description="Rated in every review from the next save onward." trigger={competency ? "Edit" : "Add competency"} triggerVariant={competency ? "ghost" : "secondary"} triggerSize="sm" submitLabel="Save competency">
      {(fieldError) => (
        <>
          {competency && <input type="hidden" name="id" value={competency.id} />}
          <FormField id={`${p}-n`} label="Name" required error={fieldError("name")}>
            <TextInput id={`${p}-n`} name="name" maxLength={40} defaultValue={competency?.name} {...err(`${p}-n`, fieldError("name"))} />
          </FormField>
          <FormField id={`${p}-d`} label="Description" required error={fieldError("description")}>
            <TextArea id={`${p}-d`} name="description" rows={2} maxLength={300} defaultValue={competency?.description} {...err(`${p}-d`, fieldError("description"))} />
          </FormField>
          <FormField id={`${p}-b`} label="Behaviours (one per line)" required error={fieldError("behaviours")}>
            <TextArea id={`${p}-b`} name="behaviours" rows={4} defaultValue={competency?.behaviours.join("\n")} {...err(`${p}-b`, fieldError("behaviours"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
