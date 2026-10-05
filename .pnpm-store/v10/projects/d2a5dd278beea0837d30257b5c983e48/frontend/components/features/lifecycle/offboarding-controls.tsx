"use client";

import { FormField, SelectInput, TextArea, describedBy } from "@/components/ui/field";
import { FormSheet } from "@/components/features/admin/form-sheet";
import { saveExitInterviewAction, setClearanceAction } from "@/lib/actions/lifecycle";
import { ratingLabels, resignationReasonOptions } from "@/components/sections/lifecycle/labels";
import type { Clearance, ExitInterview } from "@/types/lifecycle";

export function ClearanceSheet({ employeeId, name, clearance }: { employeeId: string; name: string; clearance: Clearance }) {
  const cleared = clearance.status === "cleared";
  const prefix = `cl-${employeeId}-${clearance.department}`;
  return (
    <FormSheet draftKey={`clearance:${employeeId}:${clearance.department}`}
      action={setClearanceAction}
      title={`${clearance.label} · ${name}`}
      description={clearance.scope}
      trigger={cleared ? "Reopen" : "Clear"}
      triggerVariant={cleared ? "ghost" : "secondary"}
      triggerSize="sm"
      submitLabel={cleared ? "Reopen clearance" : "Mark cleared"}
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="department" value={clearance.department} />
          <input type="hidden" name="status" value={cleared ? "pending" : "cleared"} />
          {clearance.blockers.length > 0 && (
            <ul className="bullet-list small">
              {clearance.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
          <FormField id={`${prefix}-note`} label="Note" error={fieldError("note")} hint="Recorded on the exit file on behalf of the department.">
            <TextArea id={`${prefix}-note`} name="note" rows={3} maxLength={300} aria-invalid={Boolean(fieldError("note"))} aria-describedby={describedBy(`${prefix}-note`, fieldError("note"), true)} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

const ratingOptions = [5, 4, 3, 2, 1].map((value) => ({ value: String(value), label: `${value} — ${["", "Very poor", "Poor", "Okay", "Good", "Excellent"][value]}` }));

export function ExitInterviewSheet({ employeeId, name, interview }: { employeeId: string; name: string; interview: ExitInterview | null }) {
  const prefix = `ei-${employeeId}`;
  return (
    <FormSheet draftKey={`exit-interview:${employeeId}`} action={saveExitInterviewAction} title={`Exit interview · ${name}`} description="Confidential to HR. Managers never see individual answers." trigger={interview ? "Edit interview" : "Record interview"} triggerVariant="secondary" triggerSize="sm" submitLabel="Save interview">
      {(fieldError) => (
        <>
          <input type="hidden" name="employeeId" value={employeeId} />
          <FormField id={`${prefix}-reason`} label="Main reason for leaving" required>
            <SelectInput id={`${prefix}-reason`} name="primaryReason" defaultValue={interview?.primaryReason ?? "better_opportunity"} options={resignationReasonOptions} />
          </FormField>
          <div className="form-row">
            {(Object.keys(ratingLabels) as (keyof typeof ratingLabels)[]).map((key) => (
              <FormField key={key} id={`${prefix}-${key}`} label={ratingLabels[key]} required error={fieldError(key)}>
                <SelectInput id={`${prefix}-${key}`} name={key} defaultValue={String(interview?.ratings[key] ?? 3)} options={ratingOptions} />
              </FormField>
            ))}
          </div>
          <FormField id={`${prefix}-rejoin`} label="Would rejoin GTF" required>
            <SelectInput id={`${prefix}-rejoin`} name="wouldRejoin" defaultValue={interview?.wouldRejoin ?? "maybe"} options={[{ value: "yes", label: "Yes" }, { value: "maybe", label: "Maybe" }, { value: "no", label: "No" }]} />
          </FormField>
          <label className="check-row">
            <input type="checkbox" name="wouldRecommend" defaultChecked={interview?.wouldRecommend ?? false} />
            <span>Would recommend GTF as a workplace</span>
          </label>
          <FormField id={`${prefix}-comments`} label="Comments" error={fieldError("comments")}>
            <TextArea id={`${prefix}-comments`} name="comments" rows={4} maxLength={2000} defaultValue={interview?.comments} aria-invalid={Boolean(fieldError("comments"))} aria-describedby={describedBy(`${prefix}-comments`, fieldError("comments"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
