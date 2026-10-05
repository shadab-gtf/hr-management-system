"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { FormField, SelectInput, TextInput, describedBy } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SheetActions } from "@/components/ui/sheet-actions";
import { DraftNotice } from "@/components/features/drafts/draft-notice";
import { useCommand } from "@/hooks/use-command";
import { createExpenseAction } from "@/lib/actions/expenses";



const expenseCategories = [
  { value: "travel", label: "Travel" },
  { value: "meals", label: "Meals" },
  { value: "client_meeting", label: "Client meeting" },
  { value: "internet", label: "Internet" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" },
];

export function NewExpenseSheet({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const { formRef, draft, submit, pending, fieldError, formError } = useCommand(createExpenseAction, { draftKey: "expense.new", onSuccess: () => setOpen(false) });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <AppIcon name="add" size={20} />
        New claim
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="New expense claim" description="Goes to your manager, then Finance." dismissible={!pending}>
        <form ref={formRef} onSubmit={submit} className="form" noValidate>
          <DraftNotice draft={draft} />
          <FormField id="x-title" label="What was it for?" required error={fieldError("title")}>
            <TextInput id="x-title" name="title" maxLength={120} aria-invalid={Boolean(fieldError("title"))} aria-describedby={describedBy("x-title", fieldError("title"))} />
          </FormField>
          <div className="form-row">
            <FormField id="x-category" label="Category" required>
              <SelectInput id="x-category" name="category" defaultValue="travel" options={expenseCategories} />
            </FormField>
            <FormField id="x-amount" label="Amount (₹)" required error={fieldError("amount")}>
              <TextInput id="x-amount" name="amount" inputMode="decimal" placeholder="0.00" aria-invalid={Boolean(fieldError("amount"))} aria-describedby={describedBy("x-amount", fieldError("amount"))} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField id="x-date" label="Date" required error={fieldError("incurredOn")}>
              <TextInput id="x-date" name="incurredOn" type="date" max={today} defaultValue={today} aria-invalid={Boolean(fieldError("incurredOn"))} aria-describedby={describedBy("x-date", fieldError("incurredOn"))} />
            </FormField>
            <FormField id="x-merchant" label="Merchant" required error={fieldError("merchant")}>
              <TextInput id="x-merchant" name="merchant" maxLength={120} aria-invalid={Boolean(fieldError("merchant"))} aria-describedby={describedBy("x-merchant", fieldError("merchant"))} />
            </FormField>
          </div>
          <label className="file-drop">
            <AppIcon name="upload" size={24} />
            <span>Attach receipt · PDF, JPEG or PNG up to 10 MB</span>
            <input type="file" name="receipt" accept="application/pdf,image/jpeg,image/png" />
          </label>
          {formError && <Alert tone="danger" live>{formError}</Alert>}
          <SheetActions onCancel={() => setOpen(false)} pending={pending} label="Submit claim" pendingLabel="Submitting…" />
        </form>
      </Sheet>
    </>
  );
}
