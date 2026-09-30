"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, Segmented, SelectInput, TextArea, TextInput, describedBy } from "@/components/ui/field";
import { ConfirmButton, FormSheet } from "@/components/features/admin/form-sheet";
import { ActionButton } from "@/components/features/lifecycle/action-button";
import { useCommand } from "@/hooks/use-command";
import {
  addSettlementLineAction,
  decideSettlementAction,
  markSettlementPaidAction,
  prepareSettlementAction,
  recalculateSettlementAction,
  removeSettlementLineAction,
  setNoticeWaiverAction,
  submitSettlementAction,
} from "@/lib/actions/lifecycle";

export function PrepareSettlementForm({ options }: { options: { value: string; label: string }[] }) {
  const { submit, pending, fieldError, formError } = useCommand(prepareSettlementAction);
  return (
    <form onSubmit={submit} className="inline-add" noValidate>
      <FormField id="fnf-employee" label="Employee with an open exit" error={fieldError("employeeId")}>
        <SelectInput id="fnf-employee" name="employeeId" options={options} placeholder="Choose…" aria-invalid={Boolean(fieldError("employeeId"))} aria-describedby={describedBy("fnf-employee", fieldError("employeeId"))} />
      </FormField>
      <Button type="submit" pending={pending}>
        <AppIcon name="calculator" size={20} />
        {pending ? "Preparing…" : "Prepare settlement"}
      </Button>
      {formError && <Alert tone="danger" live>{formError}</Alert>}
    </form>
  );
}

export function RecalculateButton({ id, version }: { id: string; version: number }) {
  return <ActionButton label="Recalculate" icon="refresh" run={() => recalculateSettlementAction(id, version)} />;
}
export function SubmitSettlementButton({ id, version }: { id: string; version: number }) {
  return <ActionButton label="Submit for approval" variant="primary" size="md" icon="send" run={() => submitSettlementAction(id, version)} />;
}
export function RemoveLineButton({ id, lineId }: { id: string; lineId: string }) {
  return <ConfirmButton label="Remove" confirmLabel="Confirm remove" run={() => removeSettlementLineAction(id, lineId)} />;
}

export function AddLineSheet({ id, version }: { id: string; version: number }) {
  return (
    <FormSheet action={addSettlementLineAction} title="Add adjustment" description="Bonus, arrears, other earnings or recoveries. A reason is required and audited." trigger="Add line" triggerVariant="secondary" triggerSize="sm" icon="add" submitLabel="Add line">
      {(fieldError) => (
        <>
          <input type="hidden" name="settlementId" value={id} />
          <input type="hidden" name="expectedVersion" value={version} />
          <Segmented name="kind" legend="Type" defaultValue="earning" options={[{ value: "earning", label: "Earning" }, { value: "deduction", label: "Deduction" }]} />
          <FormField id="line-label" label="Label" required error={fieldError("label")}>
            <TextInput id="line-label" name="label" maxLength={80} placeholder="e.g. Performance bonus FY26" aria-invalid={Boolean(fieldError("label"))} aria-describedby={describedBy("line-label", fieldError("label"))} />
          </FormField>
          <FormField id="line-amount" label="Amount (₹)" required error={fieldError("amount")}>
            <TextInput id="line-amount" name="amount" inputMode="decimal" aria-invalid={Boolean(fieldError("amount"))} aria-describedby={describedBy("line-amount", fieldError("amount"))} />
          </FormField>
          <FormField id="line-reason" label="Reason" required error={fieldError("reason")}>
            <TextArea id="line-reason" name="reason" rows={3} maxLength={300} aria-invalid={Boolean(fieldError("reason"))} aria-describedby={describedBy("line-reason", fieldError("reason"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function WaiverSheet({ id, version, waived, days }: { id: string; version: number; waived: boolean; days: number }) {
  return (
    <FormSheet action={setNoticeWaiverAction} title="Notice pay recovery" description={`${days} days short of the notice period. HR may waive the recovery with a reason.`} trigger={waived ? "Reinstate recovery" : "Waive recovery"} triggerVariant="ghost" triggerSize="sm" submitLabel={waived ? "Reinstate recovery" : "Waive recovery"}>
      {(fieldError) => (
        <>
          <input type="hidden" name="settlementId" value={id} />
          <input type="hidden" name="expectedVersion" value={version} />
          {!waived && <input type="hidden" name="waive" value="on" />}
          {!waived && (
            <FormField id="waive-reason" label="Reason for waiver" required error={fieldError("reason")}>
              <TextArea id="waive-reason" name="reason" rows={3} maxLength={300} aria-invalid={Boolean(fieldError("reason"))} aria-describedby={describedBy("waive-reason", fieldError("reason"))} />
            </FormField>
          )}
          {waived && <p className="small muted">The recovery will be added back and the settlement recalculated.</p>}
        </>
      )}
    </FormSheet>
  );
}

export function SettlementDecisionSheet({ id, version }: { id: string; version: number }) {
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  return (
    <FormSheet action={decideSettlementAction} title="Approve settlement" description="Checker step. You can't approve a settlement you prepared." trigger="Review & decide" submitLabel={decision === "approve" ? "Approve settlement" : "Send back"} submitVariant={decision === "reject" ? "danger" : "primary"}>
      {(fieldError) => (
        <>
          <input type="hidden" name="settlementId" value={id} />
          <input type="hidden" name="expectedVersion" value={version} />
          <Segmented name="decision" legend="Decision" value={decision} onChange={(value) => setDecision(value as typeof decision)} options={[{ value: "approve", label: "Approve" }, { value: "reject", label: "Send back" }]} />
          <FormField id="fnf-note" label={decision === "approve" ? "Note (optional)" : "What should the preparer fix?"} required={decision === "reject"} error={fieldError("note")}>
            <TextArea id="fnf-note" name="note" rows={3} maxLength={500} aria-invalid={Boolean(fieldError("note"))} aria-describedby={describedBy("fnf-note", fieldError("note"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}

export function PaymentSheet({ id, version, today }: { id: string; version: number; today: string }) {
  return (
    <FormSheet action={markSettlementPaidAction} title="Record payment" description="Enter the bank UTR of the transfer. Mock only — no bank file is generated." trigger="Mark paid" icon="moneyOut" submitLabel="Record payment">
      {(fieldError) => (
        <>
          <input type="hidden" name="settlementId" value={id} />
          <input type="hidden" name="expectedVersion" value={version} />
          <FormField id="pay-utr" label="UTR / bank reference" required error={fieldError("utr")}>
            <TextInput id="pay-utr" name="utr" maxLength={22} autoCapitalize="characters" aria-invalid={Boolean(fieldError("utr"))} aria-describedby={describedBy("pay-utr", fieldError("utr"))} />
          </FormField>
          <FormField id="pay-date" label="Paid on" required error={fieldError("paidOn")}>
            <TextInput id="pay-date" name="paidOn" type="date" defaultValue={today} max={today} aria-invalid={Boolean(fieldError("paidOn"))} aria-describedby={describedBy("pay-date", fieldError("paidOn"))} />
          </FormField>
        </>
      )}
    </FormSheet>
  );
}
