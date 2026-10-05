"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, Segmented, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { ConfirmButton, FormSheet } from "@/components/features/admin/form-sheet";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { decideResignationAction, submitResignationAction, withdrawResignationAction } from "@/lib/actions/lifecycle";
import { resignationReasonOptions } from "@/components/sections/lifecycle/labels";
import type { Resignation } from "@/types/lifecycle";

export function ResignationForm({ today, policyLastDay, noticeDays }: { today: string; policyLastDay: string; noticeDays: number }) {
  const [lastDay, setLastDay] = useState(policyLastDay);
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(submitResignationAction, { draftKey: "resignation.new" });
  const early = lastDay !== "" && lastDay < policyLastDay;
  const minDay = new Date(`${today}T00:00:00Z`);
  minDay.setUTCDate(minDay.getUTCDate() + 1);
  return (
    <form ref={formRef} onSubmit={submit} className="form" noValidate>
      <DraftNotice draft={draft} />
      <FormField id="rs-reason" label="Primary reason" required error={fieldError("reason")}>
        <SelectInput id="rs-reason" name="reason" defaultValue="better_opportunity" options={resignationReasonOptions} aria-invalid={Boolean(fieldError("reason"))} aria-describedby={describedBy("rs-reason", fieldError("reason"))} />
      </FormField>
      <FormField id="rs-lwd" label="Last working day" required error={fieldError("lastWorkingDay")} hint={`Your ${noticeDays}-day notice ends on this date. Pick an earlier date to request early release.`}>
        <TextInput id="rs-lwd" name="lastWorkingDay" type="date" value={lastDay} min={minDay.toISOString().slice(0, 10)} max={policyLastDay} onChange={(event) => setLastDay(event.target.value)} aria-invalid={Boolean(fieldError("lastWorkingDay"))} aria-describedby={describedBy("rs-lwd", fieldError("lastWorkingDay"), true)} />
      </FormField>
      {early && (
        <FormField id="rs-early" label="Why do you need an early release?" required error={fieldError("earlyReleaseReason")} hint="Your manager and HR decide; a notice pay recovery may apply unless HR waives it.">
          <TextArea id="rs-early" name="earlyReleaseReason" rows={2} maxLength={300} aria-invalid={Boolean(fieldError("earlyReleaseReason"))} aria-describedby={describedBy("rs-early", fieldError("earlyReleaseReason"), true)} />
        </FormField>
      )}
      <FormField id="rs-note" label="Resignation note" required error={fieldError("note")} hint="Shared with your manager and HR.">
        <TextArea id="rs-note" name="note" rows={4} maxLength={1000} aria-invalid={Boolean(fieldError("note"))} aria-describedby={describedBy("rs-note", fieldError("note"), true)} />
      </FormField>
      {formError && <Alert tone="danger" live>{formError}</Alert>}
      <div className="sheet-actions">
        <Button type="submit" variant="danger" pending={pending}>
          <AppIcon name="send" size={20} />
          {pending ? "Submitting…" : "Submit resignation"}
        </Button>
      </div>
    </form>
  );
}

export function WithdrawResignationButton({ id, version }: { id: string; version: number }) {
  return <ConfirmButton label="Withdraw resignation" confirmLabel="Confirm withdrawal" run={() => withdrawResignationAction(id, version)} />;
}

export function ResignationDecisionSheet({ resignation, asHr }: { resignation: Resignation; asHr: boolean }) {
  const [decision, setDecision] = useState<"accept" | "hold" | "reject">("accept");
  const prefix = `rd-${resignation.id}`;
  return (
    <FormSheet draftKey={`resignation.decide:${resignation.id}`}
      action={decideResignationAction}
      title={`${asHr ? "Decide" : "Review"}: ${resignation.person.name}`}
      description={asHr ? "Accepting sets notice status and opens the offboarding case." : "Your recommendation goes to HR for the final decision."}
      trigger={asHr ? "Decide" : "Review"}
      triggerSize="sm"
      submitLabel={decision === "accept" ? (asHr ? "Accept resignation" : "Accept and send to HR") : decision === "hold" ? "Put on hold" : "Reject"}
      submitVariant={decision === "reject" ? "danger" : "primary"}
    >
      {(fieldError) => (
        <>
          <input type="hidden" name="resignationId" value={resignation.id} />
          <input type="hidden" name="expectedVersion" value={resignation.version} />
          <Segmented
            name="decision"
            legend="Decision"
            value={decision}
            onChange={(value) => setDecision(value as typeof decision)}
            options={[
              { value: "accept", label: "Accept" },
              { value: "hold", label: "Hold to discuss" },
              { value: "reject", label: "Reject" },
            ]}
          />
          {asHr && decision === "accept" && (
            <FormField id={`${prefix}-lwd`} label="Agreed last working day" error={fieldError("lastWorkingDay")} hint={`Requested ${resignation.requestedLastWorkingDay}; notice ends ${resignation.policyLastWorkingDay}.`}>
              <TextInput id={`${prefix}-lwd`} name="lastWorkingDay" type="date" defaultValue={resignation.requestedLastWorkingDay} aria-invalid={Boolean(fieldError("lastWorkingDay"))} aria-describedby={describedBy(`${prefix}-lwd`, fieldError("lastWorkingDay"), true)} />
            </FormField>
          )}
          <FormField id={`${prefix}-note`} label={decision === "accept" ? "Note (optional)" : "Note for the employee"} required={decision !== "accept"} error={fieldError("note")}>
            <TextArea id={`${prefix}-note`} name="note" rows={3} maxLength={500} aria-invalid={Boolean(fieldError("note"))} aria-describedby={describedBy(`${prefix}-note`, fieldError("note"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
