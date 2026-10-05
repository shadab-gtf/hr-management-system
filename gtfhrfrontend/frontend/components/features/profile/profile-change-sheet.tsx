"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { profileChangeAction } from "@/lib/actions/profile";

const fields = [
  { value: "mobile", label: "Mobile number" },
  { value: "personalEmail", label: "Personal email" },
  { value: "address", label: "Address" },
  { value: "emergencyContact", label: "Emergency contact" },
  { value: "bankAccount", label: "Bank account (Finance verifies)" },
] as const;

/** Profile edits are requests; HR/Finance verify before anything changes. */
export function ProfileChangeSheet() {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<string>(fields[0].value);
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(profileChangeAction, { draftKey: "profile.change", onSuccess: () => setOpen(false) });
  const bank = field === "bankAccount";
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <AppIcon name="edit" size={20} />
        Request a change
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Request a profile change" description="Changes apply after verification. You’ll get a reference now." dismissible={!pending}>
        <form ref={formRef} onSubmit={submit} className="form" noValidate>
          <DraftNotice draft={draft} />
          <FormField id="pc-field" label="What needs to change?" required>
            <SelectInput id="pc-field" name="field" value={field} onChange={(event) => setField(event.target.value)} options={fields} />
          </FormField>
          <FormField id="pc-value" label="New value" required error={fieldError("value")} hint={bank ? "Enter the account number. It’s never shown in full after submitting." : undefined}>
            <TextInput
              id="pc-value"
              name="value"
              autoComplete="off"
              inputMode={bank || field === "mobile" ? "numeric" : undefined}
              maxLength={200}
              aria-invalid={Boolean(fieldError("value"))}
              aria-describedby={describedBy("pc-value", fieldError("value"), bank)}
            />
          </FormField>
          <FormField id="pc-reason" label="Reason" required error={fieldError("reason")}>
            <TextArea id="pc-reason" name="reason" rows={2} maxLength={300} aria-invalid={Boolean(fieldError("reason"))} aria-describedby={describedBy("pc-reason", fieldError("reason"))} />
          </FormField>
          {bank && (
            <Alert tone="info" title="Independent verification">
              Bank changes are verified by Finance before the next payroll. Your current account is used until then.
            </Alert>
          )}
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <div className="sheet-actions">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              {pending ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
