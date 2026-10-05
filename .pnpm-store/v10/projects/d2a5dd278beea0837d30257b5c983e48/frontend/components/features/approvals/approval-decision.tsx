"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, TextArea, describedBy } from "@/components/ui/field";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { decideApprovalAction } from "@/lib/actions/approvals";

/** Versioned decision. Reject requires a reason; success waits for the server. */
export function ApprovalDecision({ id, version, requester }: { id: string; version: number; requester: string }) {
  const [choice, setChoice] = useState<"approve" | "reject" | null>(null);
  const { formRef, draft, state, submit, pending, fieldError, formError } = useCommand(decideApprovalAction, { draftKey: `approval.decide:${id}` });

  if (state.status === "success")
    return (
      <Alert tone="success" live title={`${state.message} · ${state.reference ?? ""}`}>
        {requester} has been notified. The queue has been refreshed.
      </Alert>
    );

  return (
    <form ref={formRef} onSubmit={submit} className="form decision-form" noValidate>
      <DraftNotice draft={draft} />
      <input type="hidden" name="approvalId" value={id} />
      <input type="hidden" name="expectedVersion" value={version} />
      <FormField
        id="decision-note"
        label="Note to requester"
        hint="Required when rejecting. Visible to the requester."
        error={fieldError("note")}
      >
        <TextArea
          id="decision-note"
          name="note"
          rows={3}
          maxLength={500}
          aria-invalid={Boolean(fieldError("note"))}
          aria-describedby={describedBy("decision-note", fieldError("note"), true)}
        />
      </FormField>
      {formError && (
        <Alert tone="danger" live title="Decision not recorded">
          {formError}
        </Alert>
      )}
      <div className="sheet-actions">
        <Button
          type="submit"
          name="decision"
          value="reject"
          variant="danger"
          pending={pending && choice === "reject"}
          disabled={pending}
          onClick={() => setChoice("reject")}
        >
          <AppIcon name="close" size={20} />
          {pending && choice === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="approve"
          pending={pending && choice === "approve"}
          disabled={pending}
          onClick={() => setChoice("approve")}
        >
          <AppIcon name="check" size={20} />
          {pending && choice === "approve" ? "Approving…" : "Approve"}
        </Button>
      </div>
    </form>
  );
}
