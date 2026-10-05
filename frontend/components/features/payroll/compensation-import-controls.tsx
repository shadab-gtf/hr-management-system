"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/features/admin/form-sheet";
import { FileDropZone } from "@/components/features/imports/file-drop-zone";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, TextArea } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { decideCompensationAction, discardCompensationAction, uploadCompensationAction } from "@/lib/actions/imports";

export function CompensationUploadForm() {
  const { submit, pending, fieldError, formError } = useCommand(uploadCompensationAction, { toast: false });
  const error = fieldError("file");
  return (
    <form onSubmit={submit} className="form" noValidate>
      <FileDropZone
        name="file"
        label="Salary sheet"
        hint="CSV or Excel (.xlsx) · up to 5 MB · employee code + annual (or monthly) CTC"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        error={error}
        errorId="salary-file-error"
      />
      {error && (
        <p id="salary-file-error" className="field-error">
          {error}
        </p>
      )}
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <Button type="submit" pending={pending}>
          <AppIcon name="upload" size={20} />
          {pending ? "Checking sheet…" : "Upload & check"}
        </Button>
      </div>
    </form>
  );
}

/** Maker submits; an independent approver approves or rejects (server enforces who). */
export function CompensationDecision({ batchId, can, importable }: { batchId: string; can: { submit: boolean; approve: boolean; discard: boolean }; importable: number }) {
  const [rejecting, setRejecting] = useState(false);
  const { submit, pending, fieldError, formError } = useCommand(decideCompensationAction);
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <input type="hidden" name="batchId" value={batchId} />
      {rejecting && (
        <FormField id="cmp-note" label="Reason for rejecting" required error={fieldError("note")}>
          <TextArea id="cmp-note" name="note" rows={2} maxLength={300} autoFocus aria-invalid={Boolean(fieldError("note"))} aria-describedby={fieldError("note") ? "cmp-note-error" : undefined} />
        </FormField>
      )}
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        {can.discard && <ConfirmButton label="Discard" confirmLabel="Confirm discard" run={() => discardCompensationAction(batchId)} />}
        {can.submit && (
          <Button type="submit" name="decision" value="submit" pending={pending}>
            {pending ? "Submitting…" : `Submit ${importable} change${importable === 1 ? "" : "s"} for approval`}
          </Button>
        )}
        {can.approve &&
          (rejecting ? (
            <>
              <Button variant="secondary" onClick={() => setRejecting(false)} disabled={pending}>
                Back
              </Button>
              <Button type="submit" name="decision" value="reject" variant="danger" pending={pending}>
                {pending ? "Rejecting…" : "Confirm reject"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setRejecting(true)} disabled={pending}>
                Reject
              </Button>
              <Button type="submit" name="decision" value="approve" pending={pending}>
                {pending ? "Approving…" : "Approve & apply"}
              </Button>
            </>
          ))}
      </div>
    </form>
  );
}
