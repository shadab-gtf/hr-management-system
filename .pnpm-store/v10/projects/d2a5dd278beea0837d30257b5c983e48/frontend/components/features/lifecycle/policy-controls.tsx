"use client";

import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { FormSheet } from "@/components/features/admin/form-sheet";
import { ActionButton } from "@/components/features/lifecycle/action-button";
import { acknowledgePolicyAction, publishPolicyAction, remindPolicyAction } from "@/lib/actions/lifecycle";

export function PublishPolicySheet({ departments, today }: { departments: string[]; today: string }) {
  const due = new Date(`${today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 14);
  const input = (name: string, label: string, fieldError: (name: string) => string | undefined, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <FormField id={`pp-${name}`} label={label} required error={fieldError(name)}>
      <TextInput id={`pp-${name}`} name={name} aria-invalid={Boolean(fieldError(name))} aria-describedby={describedBy(`pp-${name}`, fieldError(name))} {...props} />
    </FormField>
  );
  return (
    <FormSheet draftKey={"policy.publish"} action={publishPolicyAction} title="Publish a policy version" description="Everyone in the audience is asked to read and acknowledge it by the due date." trigger="Publish policy" icon="add" submitLabel="Publish & request acknowledgement">
      {(fieldError) => (
        <>
          {input("title", "Policy title", fieldError, { maxLength: 120 })}
          <div className="form-row">
            {input("version", "Version", fieldError, { placeholder: "v1.0", maxLength: 12 })}
            {input("dueOn", "Acknowledge by", fieldError, { type: "date", defaultValue: due.toISOString().slice(0, 10) })}
          </div>
          <FormField id="pp-audience" label="Audience" required error={fieldError("audience")}>
            <SelectInput id="pp-audience" name="audience" defaultValue="Everyone" options={[{ value: "Everyone", label: "Everyone" }, ...departments.map((name) => ({ value: name, label: name }))]} />
          </FormField>
          <FormField id="pp-summary" label="Summary of changes" required error={fieldError("summary")}>
            <TextArea id="pp-summary" name="summary" rows={2} maxLength={400} aria-invalid={Boolean(fieldError("summary"))} aria-describedby={describedBy("pp-summary", fieldError("summary"))} />
          </FormField>
          <FormField id="pp-body" label="Policy text" required error={fieldError("body")}>
            <TextArea id="pp-body" name="body" rows={10} maxLength={8000} aria-invalid={Boolean(fieldError("body"))} aria-describedby={describedBy("pp-body", fieldError("body"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function RemindPolicyButton({ policyId, pending }: { policyId: string; pending: number }) {
  return <ActionButton label={`Remind ${pending} pending`} icon="notification" run={() => remindPolicyAction(policyId)} disabledReason={pending ? null : "Everyone has acknowledged"} />;
}

export function AcknowledgePolicyButton({ policyId, title }: { policyId: string; title: string }) {
  return <ActionButton label="I have read and acknowledge" variant="primary" icon="check" run={() => acknowledgePolicyAction(policyId)} pendingLabel={`Acknowledging ${title}…`} />;
}
