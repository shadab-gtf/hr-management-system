"use client";

import { ConfirmButton, FormSheet } from "@/components/features/admin/form-sheet";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { checkInAction, decideGoalsAction, deleteGoalAction, saveGoalAction, submitGoalsAction } from "@/lib/actions/performance";
import { perfHealthLabels, type PerfGoal, type PerfObjective } from "@/types/performance";

const err = (id: string, error: string | undefined, hint = false) => ({
  "aria-invalid": Boolean(error),
  "aria-describedby": describedBy(id, error, hint),
});

export function GoalSheet({ cycleId, goal, objectives, period, remaining }: { cycleId: string; goal?: PerfGoal; objectives: PerfObjective[]; period: { start: string; end: string }; remaining: number }) {
  const p = goal ? `goal-${goal.id}` : "goal-new";
  return (
    <FormSheet draftKey={goal ? `goal.edit:${goal.id}` : `goal.new:${cycleId}`}
      action={saveGoalAction}
      title={goal ? "Edit goal" : "Add a goal"}
      description={`Make it measurable. Weights across your goals must total 100% — ${goal ? remaining + goal.weight : remaining}% available.`}
      trigger={goal ? "Edit" : "Add goal"}
      triggerVariant={goal ? "ghost" : "primary"}
      triggerSize={goal ? "sm" : "md"}
      {...(goal ? {} : { icon: "add" as const })}
      submitLabel={goal ? "Save goal" : "Add goal"}
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="cycleId" value={cycleId} />
          {goal && <input type="hidden" name="id" value={goal.id} />}
          <FormField id={`${p}-title`} label="Goal" required error={fieldError("title")}>
            <TextInput id={`${p}-title`} name="title" maxLength={120} defaultValue={goal?.title} {...err(`${p}-title`, fieldError("title"))} />
          </FormField>
          <FormField id={`${p}-target`} label="Measurable target" required hint="How you'll know it's done, e.g. “CSAT ≥ 4.5/5”." error={fieldError("target")}>
            <TextInput id={`${p}-target`} name="target" maxLength={200} defaultValue={goal?.target} {...err(`${p}-target`, fieldError("target"), true)} />
          </FormField>
          <FormField id={`${p}-description`} label="Description" error={fieldError("description")}>
            <TextArea id={`${p}-description`} name="description" rows={3} maxLength={600} defaultValue={goal?.description} {...err(`${p}-description`, fieldError("description"))} />
          </FormField>
          <div className="form-row">
            <FormField id={`${p}-weight`} label="Weight (%)" required error={fieldError("weight")}>
              <TextInput id={`${p}-weight`} name="weight" type="number" inputMode="numeric" min={5} max={100} step={5} defaultValue={goal?.weight ?? Math.max(5, Math.min(remaining, 30))} {...err(`${p}-weight`, fieldError("weight"))} />
            </FormField>
            <FormField id={`${p}-due`} label="Due date" required error={fieldError("dueDate")}>
              <TextInput id={`${p}-due`} name="dueDate" type="date" min={period.start} max={period.end} defaultValue={goal?.dueDate ?? period.end} {...err(`${p}-due`, fieldError("dueDate"))} />
            </FormField>
          </div>
          <FormField id={`${p}-objective`} label="Company objective (optional)" error={fieldError("objectiveId")}>
            <SelectInput id={`${p}-objective`} name="objectiveId" placeholder="Not linked" defaultValue={goal?.objective?.id ?? ""} options={objectives.map((o) => ({ value: o.id, label: o.title }))} {...err(`${p}-objective`, fieldError("objectiveId"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function RemoveGoalButton({ goalId }: { goalId: string }) {
  return <ConfirmButton label="Remove" confirmLabel="Confirm remove" run={() => deleteGoalAction(goalId)} />;
}

export function SubmitGoalsButton({ cycleId, total, count }: { cycleId: string; total: number; count: number }) {
  const reason = count < 2 ? "Add at least two goals" : total !== 100 ? `Weights total ${total}% — they must total 100%` : undefined;
  return <ConfirmButton label="Submit for approval" confirmLabel="Confirm submit" run={() => submitGoalsAction(cycleId)} {...(reason ? { disabledReason: reason } : {})} />;
}

export function CheckInSheet({ goal }: { goal: PerfGoal }) {
  const p = `ci-${goal.id}`;
  return (
    <FormSheet draftKey={`goal.check-in:${goal.id}`} action={checkInAction} title="Goal check-in" description={goal.title} trigger="Check in" triggerVariant="secondary" triggerSize="sm" submitLabel="Save check-in">
      {(fieldError) => (
        <>
          <input type="hidden" name="goalId" value={goal.id} />
          <div className="form-row">
            <FormField id={`${p}-progress`} label="Progress (%)" required error={fieldError("progress")}>
              <TextInput id={`${p}-progress`} name="progress" type="number" inputMode="numeric" min={0} max={100} defaultValue={goal.progress} {...err(`${p}-progress`, fieldError("progress"))} />
            </FormField>
            <FormField id={`${p}-health`} label="Status" required>
              <SelectInput id={`${p}-health`} name="health" defaultValue={goal.health} options={Object.entries(perfHealthLabels).map(([value, meta]) => ({ value, label: meta.label }))} />
            </FormField>
          </div>
          <FormField id={`${p}-comment`} label="Update" required hint="What moved, what's blocked, what's next." error={fieldError("comment")}>
            <TextArea id={`${p}-comment`} name="comment" rows={3} maxLength={500} {...err(`${p}-comment`, fieldError("comment"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

/* Manager: approve or send back a goal sheet ------------------------------ */

export function GoalDecision({ sheetId, version, name }: { sheetId: string; version: number; name: string }) {
  return (
    <span className="row-actions">
      <FormSheet draftKey={`goals.approve:${sheetId}`} action={decideGoalsAction} title={`Approve ${name}'s goals`} description="Approved goals are locked for the cycle; check-ins continue." trigger="Approve goals" triggerSize="sm" submitLabel="Approve goals">
        {(fieldError) => (
          <>
            <input type="hidden" name="sheetId" value={sheetId} />
            <input type="hidden" name="version" value={version} />
            <input type="hidden" name="decision" value="approve" />
            <FormField id={`gd-a-${sheetId}`} label="Comment (optional)" error={fieldError("comment")}>
              <TextArea id={`gd-a-${sheetId}`} name="comment" rows={2} maxLength={500} {...err(`gd-a-${sheetId}`, fieldError("comment"))} />
            </FormField>
          </>
        )}
      </FormSheet>
      <FormSheet draftKey={`goals.send-back:${sheetId}`} action={decideGoalsAction} title={`Send back ${name}'s goals`} description="They can edit and resubmit while goal setting is open." trigger="Send back" triggerVariant="ghost" triggerSize="sm" submitLabel="Send back" submitVariant="danger">
        {(fieldError) => (
          <>
            <input type="hidden" name="sheetId" value={sheetId} />
            <input type="hidden" name="version" value={version} />
            <input type="hidden" name="decision" value="send_back" />
            <FormField id={`gd-s-${sheetId}`} label="What should change?" required error={fieldError("comment")}>
              <TextArea id={`gd-s-${sheetId}`} name="comment" rows={3} maxLength={500} {...err(`gd-s-${sheetId}`, fieldError("comment"))} />
            </FormField>
          </>
        )}
      </FormSheet>
    </span>
  );
}
