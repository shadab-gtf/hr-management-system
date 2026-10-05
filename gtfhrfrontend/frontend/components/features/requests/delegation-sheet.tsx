"use client";

import { useTransition } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { createDelegationAction, revokeDelegationAction } from "@/lib/actions/requests";

const workflows = [
  { value: "leave", label: "Leave requests" },
  { value: "regularization", label: "Attendance corrections & permissions" },
  { value: "expense", label: "Expense claims" },
];

export function DelegationSheet({ colleagues, today }: { colleagues: { id: string; name: string; designation: string }[]; today: string }) {
  const sheet = useDisclosure();
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(createDelegationAction, { draftKey: "delegation.new", onSuccess: sheet.hide });
  return (
    <>
      <Button onClick={sheet.show}>
        <AppIcon name="add" size={20} />
        Delegate approvals
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title="Delegate approvals" description="While you’re away, a colleague can decide on your behalf. Every decision records the delegation." dismissible={!pending}>
        <form ref={formRef} onSubmit={submit} className="form" noValidate>
          <DraftNotice draft={draft} />
          <FormField id="dl-delegate" label="Delegate to" required error={fieldError("delegateId")}>
            <SelectInput id="dl-delegate" name="delegateId" defaultValue="" placeholder="Choose a colleague" options={colleagues.map((person) => ({ value: person.id, label: `${person.name} — ${person.designation}` }))} aria-invalid={Boolean(fieldError("delegateId"))} aria-describedby={describedBy("dl-delegate", fieldError("delegateId"))} />
          </FormField>
          <div className="form-row">
            <FormField id="dl-start" label="From" required error={fieldError("startsOn")}>
              <TextInput id="dl-start" name="startsOn" type="date" min={today} defaultValue={today} />
            </FormField>
            <FormField id="dl-end" label="Until" required error={fieldError("endsOn")}>
              <TextInput id="dl-end" name="endsOn" type="date" min={today} defaultValue={today} />
            </FormField>
          </div>
          <fieldset className="checks">
            <legend>Workflows</legend>
            {workflows.map((workflow) => (
              <label key={workflow.value} className="check-row">
                <input type="checkbox" name="workflows" value={workflow.value} defaultChecked />
                <span>{workflow.label}</span>
              </label>
            ))}
            {fieldError("workflows") && <p className="field-error">{fieldError("workflows")}</p>}
          </fieldset>
          <FormField id="dl-reason" label="Reason" required error={fieldError("reason")}>
            <TextInput id="dl-reason" name="reason" maxLength={200} placeholder="e.g. Annual leave" />
          </FormField>
          <p className="notice-strip">
            <AppIcon name="shield" size={16} />
            A delegate can never approve their own requests.
          </p>
          {formError && <Alert tone="danger" live>{formError}</Alert>}
          <SheetActions onCancel={sheet.hide} pending={pending} label="Schedule delegation" pendingLabel="Saving…" />
        </form>
      </Sheet>
    </>
  );
}

export function RevokeDelegationButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="ghost" pending={pending} onClick={() => startTransition(() => revokeDelegationAction(id))}>
      {pending ? "Ending…" : "End now"}
    </Button>
  );
}
