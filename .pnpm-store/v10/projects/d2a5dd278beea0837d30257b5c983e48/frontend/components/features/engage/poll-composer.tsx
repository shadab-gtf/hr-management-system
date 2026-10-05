"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { useCommand } from "@/hooks/use-command";
import { useDisclosure } from "@/hooks/use-disclosure";
import { createPollAction } from "@/lib/actions/engage";

const MAX_OPTIONS = 6;

export function PollComposer({ today, maxDate, departments, myDepartment, anyDepartment }: { today: string; maxDate: string; departments: string[]; myDepartment: string; anyDepartment: boolean }) {
  const sheet = useDisclosure();
  const [count, setCount] = useState(2);
  const { submit, pending, fieldError, formError } = useCommand(createPollAction, {
    onSuccess: () => {
      sheet.hide();
      setCount(2);
    },
  });
  const audience = [{ value: "", label: "Everyone" }, ...(anyDepartment ? departments : [myDepartment]).map((name) => ({ value: name, label: `${name} only` }))];
  const optionsError = fieldError("options") ?? fieldError("options.0");
  return (
    <>
      <Button onClick={sheet.show}>
        <AppIcon name="chart" size={20} />
        New poll
      </Button>
      <Sheet open={sheet.open} onOpenChange={sheet.setOpen} title="New poll" description="A quick question for your colleagues. Everyone gets one vote and can change it until the poll closes." dismissible={!pending}>
        <form onSubmit={submit} className="form" noValidate>
          <FormField id="poll-question" label="Question" required error={fieldError("question")}>
            <TextInput id="poll-question" name="question" maxLength={200} aria-invalid={Boolean(fieldError("question"))} aria-describedby={describedBy("poll-question", fieldError("question"))} />
          </FormField>
          <fieldset className="ep-stack">
            <legend className="field-label">Options (2–6)</legend>
            {Array.from({ length: count }, (_, index) => (
              <div key={index} className="form-field">
                <label htmlFor={`poll-option-${index}`} className="sr-only">
                  Option {index + 1}
                </label>
                <TextInput id={`poll-option-${index}`} name="option" maxLength={80} placeholder={`Option ${index + 1}`} aria-invalid={Boolean(optionsError)} aria-describedby={optionsError ? "poll-options-error" : undefined} />
              </div>
            ))}
            {optionsError && (
              <p id="poll-options-error" className="field-error">
                {optionsError}
              </p>
            )}
            {count < MAX_OPTIONS && (
              <div>
                <Button size="sm" variant="ghost" onClick={() => setCount((value) => Math.min(MAX_OPTIONS, value + 1))}>
                  <AppIcon name="add" size={16} />
                  Add option
                </Button>
              </div>
            )}
          </fieldset>
          <div className="form-row">
            <FormField id="poll-closes" label="Closes on" required error={fieldError("closesOn")} hint="Voting ends at 11:59 PM that day.">
              <TextInput id="poll-closes" name="closesOn" type="date" min={today} max={maxDate} defaultValue={today} aria-invalid={Boolean(fieldError("closesOn"))} aria-describedby={describedBy("poll-closes", fieldError("closesOn"), true)} />
            </FormField>
            <FormField id="poll-audience" label="Audience" error={fieldError("department")}>
              <SelectInput id="poll-audience" name="department" defaultValue="" options={audience} aria-describedby={describedBy("poll-audience", fieldError("department"))} />
            </FormField>
          </div>
          <label className="check-row">
            <input type="checkbox" name="multiple" />
            <span>Allow choosing more than one option</span>
          </label>
          <label className="check-row">
            <input type="checkbox" name="anonymous" />
            <span>Anonymous — hide who voted for what</span>
          </label>
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <SheetActions onCancel={sheet.hide} pending={pending} label="Publish poll" pendingLabel="Publishing…" />
        </form>
      </Sheet>
    </>
  );
}
