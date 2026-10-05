"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, TextArea, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import type { ActionResult } from "@/types/action";

type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/** Approve / reject pair for one record; rejecting needs a reason. Version guards stale decisions. */
export function DecisionControls({ action, id, version, subject, approveLabel = "Approve" }: { action: FormAction; id: string; version: number; subject: string; approveLabel?: string }) {
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(action, { draftKey: `decision:${id}`, onSuccess: () => setDecision(null) });
  const noteId = `note-${id}`;
  return (
    <>
      <span className="time-actions">
        <Button size="sm" onClick={() => setDecision("approve")} aria-label={`${approveLabel} ${subject}`}>
          {approveLabel}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDecision("reject")} aria-label={`Reject ${subject}`}>
          Reject
        </Button>
      </span>
      <Sheet open={decision !== null} onOpenChange={(open) => !open && setDecision(null)} title={decision === "reject" ? "Reject request" : `${approveLabel} request`} description={subject} dismissible={!pending}>
        <form ref={formRef} onSubmit={submit} className="form" noValidate>
          <DraftNotice draft={draft} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="decision" value={decision ?? "approve"} />
          <FormField id={noteId} label={decision === "reject" ? "Reason" : "Note (optional)"} required={decision === "reject"} error={fieldError("note")} hint="Shared with the employee.">
            <TextArea id={noteId} name="note" rows={3} maxLength={300} aria-invalid={Boolean(fieldError("note"))} aria-describedby={describedBy(noteId, fieldError("note"), true)} />
          </FormField>
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <div className="sheet-actions">
            <Button variant="secondary" onClick={() => setDecision(null)} disabled={pending}>
              Back
            </Button>
            <Button type="submit" variant={decision === "reject" ? "danger" : "primary"} pending={pending}>
              {pending ? "Saving…" : decision === "reject" ? "Reject" : `Confirm ${approveLabel.toLowerCase()}`}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
